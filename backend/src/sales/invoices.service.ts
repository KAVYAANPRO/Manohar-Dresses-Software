import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import {
  InvoiceLineAllocation,
  InvoiceLineAllocationDocument,
} from './schemas/invoice-line-allocation.schema';
import { SalesOrder, SalesOrderDocument } from './schemas/sales-order.schema';
import { DeliveryChallan, DeliveryChallanDocument } from './schemas/delivery-challan.schema';
import { PaymentAllocation, PaymentAllocationDocument } from './schemas/payment-allocation.schema';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { CreditNote, CreditNoteDocument } from './schemas/credit-note.schema';
import { Customer, CustomerDocument } from '../master/schemas/customer.schema';
import { SalesAgent, SalesAgentDocument } from '../master/schemas/agent.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { DesignVariant, DesignVariantDocument } from '../design/schemas/design-variant.schema';
import { TaxRule, TaxRuleDocument } from '../master/schemas/tax-rule.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockItemsService } from '../inventory/stock-items.service';
import { StockService } from '../inventory/stock.service';
import { PackingService } from '../readystock/packing.service';
import { SalesOrdersService } from './sales-orders.service';
import { SalesLookupService } from './sales-lookup.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { computeInvoice, isIntraStateSupply, TaxRuleNotFoundError } from './pricing.util';
import { roundMoney, roundQty } from '../common/utils/decimal';
import {
  InsufficientStockException,
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { CreateInvoiceDto, InvoiceLineInputDto, PreviewInvoiceDto } from './dto/invoice.dto';
import {
  SalesActor,
  invoiceBalance,
  challanStatusFor,
  assertDiscountAllowed,
} from './sales-rules';


/** SAL-04 to SAL-09. The only writer of invoices; confirm() is the one-transaction flow from tech.md §8.2. */
@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly model: Model<InvoiceDocument>,
    @InjectModel(InvoiceLineAllocation.name)
    private readonly allocationModel: Model<InvoiceLineAllocationDocument>,
    @InjectModel(SalesOrder.name) private readonly orderModel: Model<SalesOrderDocument>,
    @InjectModel(DeliveryChallan.name)
    private readonly challanModel: Model<DeliveryChallanDocument>,
    @InjectModel(PaymentAllocation.name)
    private readonly paymentAllocationModel: Model<PaymentAllocationDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(CreditNote.name) private readonly creditNoteModel: Model<CreditNoteDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(SalesAgent.name) private readonly agentModel: Model<SalesAgentDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    @InjectModel(DesignVariant.name) private readonly variantModel: Model<DesignVariantDocument>,
    @InjectModel(TaxRule.name) private readonly taxRuleModel: Model<TaxRuleDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly stockItemsService: StockItemsService,
    private readonly stockService: StockService,
    private readonly packingService: PackingService,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly lookup: SalesLookupService,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  // ---------------------------------------------------------------- reads

  /** Display-ready list rows (customer, SO no, paid/balance) for the invoice list. */
  async list(filter: Record<string, unknown> = {}): Promise<any[]> {
    const invoices = await this.model
      .find(castObjectIdFilter(filter, ['customerId', 'salesOrderId', 'agentId']))
      .sort({ createdAt: -1 })
      .lean();
    const ids = invoices.map((i) => i._id);
    const [allocs, orders] = await Promise.all([
      this.paymentAllocationModel.find({ invoiceId: { $in: ids } }).lean(),
      this.orderModel
        .find({ _id: { $in: invoices.map((i) => i.salesOrderId).filter(Boolean) } })
        .select('docNo')
        .lean(),
    ]);
    const allocated = new Map<string, number>();
    for (const a of allocs) {
      allocated.set(String(a.invoiceId), (allocated.get(String(a.invoiceId)) ?? 0) + a.amount);
    }
    const soNo = new Map(orders.map((o) => [String(o._id), o.docNo]));
    return invoices.map((inv) => ({
      ...inv,
      salesOrderNo: inv.salesOrderId ? soNo.get(String(inv.salesOrderId)) : undefined,
      customerName: inv.customerNameSnapshot,
      totalQty: roundQty(inv.lines.reduce((s, l) => s + l.qty, 0)),
      ...invoiceBalance(inv.grandTotal, allocated.get(String(inv._id)) ?? 0, inv.creditedTotal ?? 0),
    }));
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');
    return doc;
  }

  /** Full invoice view: labelled lines, payments, credit notes, company header, balances. */
  async view(id: string): Promise<any> {
    const inv = await this.findById(id);
    const [labels, allocs, creditNotes, settings, order, challan, customer] = await Promise.all([
      this.lookup.variantLabels(inv.lines.map((l) => l.designVariantId)),
      this.paymentAllocationModel.find({ invoiceId: inv._id }).lean(),
      this.creditNoteModel.find({ invoiceId: inv._id }).sort({ docDate: 1 }).lean(),
      this.companySettings.get(),
      inv.salesOrderId ? this.orderModel.findById(inv.salesOrderId).select('docNo').lean() : null,
      inv.deliveryChallanId
        ? this.challanModel.findById(inv.deliveryChallanId).select('docNo').lean()
        : null,
      this.customerModel.findById(inv.customerId).lean(),
    ]);
    const payments = await this.paymentModel
      .find({ _id: { $in: allocs.map((a) => a.paymentId) } })
      .lean();
    const pById = new Map(payments.map((p) => [String(p._id), p]));
    const allocatedTotal = allocs.reduce((s, a) => s + a.amount, 0);
    return {
      ...inv,
      customerName: inv.customerNameSnapshot,
      customerAddress: inv.customerAddressSnapshot ?? customer?.billingAddress,
      customerGstin: inv.customerGstinSnapshot ?? customer?.gstin,
      customerState: customer?.state,
      isIntraState:
        inv.status === 'DRAFT'
          ? isIntraStateSupply(customer?.state, settings?.state)
          : inv.isIntraState,
      salesOrderNo: order?.docNo,
      deliveryChallanNo: challan?.docNo,
      company: settings
        ? { legalName: settings.legalName, gstin: settings.gstin, state: settings.state }
        : undefined,
      lines: inv.lines.map((l) => ({
        ...l,
        ...(labels.get(String(l.designVariantId)) ?? {}),
        returnableQty: roundQty(l.qty - (l.returnedQty ?? 0)),
      })),
      totalQty: roundQty(inv.lines.reduce((s, l) => s + l.qty, 0)),
      payments: allocs.map((a) => {
        const p = pById.get(String(a.paymentId));
        return {
          paymentId: String(a.paymentId),
          docNo: p?.docNo,
          date: p?.date,
          mode: p?.mode,
          reference: p?.reference,
          amount: a.amount,
        };
      }),
      creditNotes,
      ...invoiceBalance(inv.grandTotal, allocatedTotal, inv.creditedTotal ?? 0),
    };
  }

  allocationsForLine(invoiceLineId: string) {
    return this.allocationModel.find({ invoiceLineId: new Types.ObjectId(invoiceLineId) }).lean();
  }

  /** prd.md §10 step 14: COGS from invoice_line_allocations (qty x lot unitCost at the time of sale), margin against taxable value. */
  async getMargin(invoiceId: string) {
    const invoice = await this.model.findById(invoiceId).lean();
    if (!invoice) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');

    const allocations = await this.allocationModel.find({ invoiceId: invoice._id }).lean();
    const cogs = roundMoney(allocations.reduce((s, a) => s + a.qty * a.unitCost, 0));
    const margin = roundMoney(invoice.taxableTotal - cogs);
    const marginPct =
      invoice.taxableTotal > 0 ? roundMoney((margin / invoice.taxableTotal) * 100) : 0;

    return { invoiceId, cogs, taxableTotal: invoice.taxableTotal, margin, marginPct };
  }

  // ---------------------------------------------------------------- pricing

  private async taxRulesFor(hsns: string[], session?: ClientSession) {
    const rules = await this.taxRuleModel
      .find({ hsn: { $in: hsns } })
      .session(session ?? null)
      .lean();
    return rules.map((r) => ({
      hsn: r.hsn,
      valueBandMin: r.valueBandMin,
      valueBandMax: r.valueBandMax ?? undefined,
      ratePct: r.ratePct,
      validFrom: r.validFrom,
      validTo: r.validTo ?? undefined,
    }));
  }

  /**
   * Prices lines exactly like confirm would, against today's tax rules, without persisting
   * anything. Used by the sales order / invoice / exhibition forms so the frontend never
   * hard-codes a tax rate (frontend.md §35).
   */
  async preview(dto: PreviewInvoiceDto) {
    const customer = await this.customerModel.findById(dto.customerId).lean();
    if (!customer) throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');
    const settings = await this.companySettings.get();
    if (!settings)
      throw new ProblemException('VALIDATION_FAILED', 422, 'Company settings are not configured.');
    const resolved = await this.resolveLines(dto.lines, customer);
    const computed = await this.price(resolved, customer.state, settings.state, new Date(), dto.otherCharges);
    return { ...computed, placeOfSupply: customer.state, companyState: settings.state };
  }

  async price(
    lines: Array<{
      designVariantId: string;
      qty: number;
      unitRate: number;
      discountPct: number;
      extraDiscountAmt: number;
      extraDiscountPct: number;
      hsn: string;
    }>,
    customerState: string | undefined,
    companyState: string,
    date: Date,
    otherCharges?: number,
    session?: ClientSession,
  ) {
    const taxRules = await this.taxRulesFor(
      Array.from(new Set(lines.map((l) => l.hsn))),
      session,
    );
    try {
      return computeInvoice({
        lines,
        customer: { state: customerState },
        company: { state: companyState },
        invoiceDate: date,
        taxRules,
        otherCharges,
      });
    } catch (err) {
      if (err instanceof TaxRuleNotFoundError) {
        throw new ProblemException('VALIDATION_FAILED', 422, err.message);
      }
      if (err instanceof Error && err.message.startsWith('Discount cannot exceed')) {
        throw new ProblemException('VALIDATION_FAILED', 422, err.message);
      }
      throw err;
    }
  }

  /** SAL-03 rate resolution: rate defaults from the design, customer discount applies automatically. */
  async resolveLines(lines: InvoiceLineInputDto[], customer: { defaultDiscountPct?: number }) {
    const out = [];
    for (const l of lines) {
      const variant = Types.ObjectId.isValid(l.designVariantId)
        ? await this.variantModel.findById(l.designVariantId).lean()
        : null;
      if (!variant)
        throw new ProblemException('NOT_FOUND', 404, `Design variant ${l.designVariantId} not found.`);
      const design = await this.designModel.findById(variant.designId).lean();
      if (!design) throw new ProblemException('NOT_FOUND', 404, 'Design not found for this variant.');
      if (!design.hsn) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Design ${design.designNo} has no HSN code configured.`,
        );
      }
      const unitRate = l.unitRate ?? design.defaultSellingRate;
      if (unitRate === undefined || unitRate === null) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Design ${design.designNo} has no default selling rate; a rate must be supplied.`,
        );
      }
      out.push({
        designVariantId: String(l.designVariantId),
        salesOrderLineId: l.salesOrderLineId,
        qty: l.qty,
        unitRate,
        discountPct: l.discountPct ?? customer.defaultDiscountPct ?? 0,
        extraDiscountAmt: l.extraDiscountAmt ?? 0,
        extraDiscountPct: l.extraDiscountPct ?? 0,
        hsn: design.hsn,
        designNo: design.designNo,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- create / confirm

  async create(dto: CreateInvoiceDto, actor: SalesActor | string): Promise<InvoiceDocument> {
    const a: SalesActor = typeof actor === 'string' ? { id: actor } : actor;
    const draft = await this.createDraft(dto, a);
    if (!dto.confirm) return draft;
    try {
      return await this.confirm(String(draft._id), a.id);
    } catch (err) {
      // Create-and-confirm is one user action: don't leave a stray draft behind on failure.
      await this.model.deleteOne({ _id: draft._id, status: 'DRAFT' });
      throw err;
    }
  }

  async createDraft(
    dto: CreateInvoiceDto,
    actor: SalesActor,
    extra: { deliveryChallanId?: string; challanLineIds?: string[]; exhibitionOrderId?: string } = {},
  ): Promise<InvoiceDocument> {
    const customer = Types.ObjectId.isValid(dto.customerId)
      ? await this.customerModel.findById(dto.customerId).lean()
      : null;
    if (!customer) throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');
    if (customer.isActive === false) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'This customer is inactive.');
    }

    let order: SalesOrderDocument | null = null;
    if (dto.salesOrderId) {
      order = await this.orderModel.findById(dto.salesOrderId);
      if (!order) throw new ProblemException('NOT_FOUND', 404, 'Sales order not found.');
      if (String(order.customerId) !== String(dto.customerId)) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          'The invoice customer must match the sales order customer.',
        );
      }
      if (!['CONFIRMED', 'PARTIALLY_INVOICED'].includes(order.status)) {
        throw new InvalidStateTransitionException(
          `Cannot invoice a sales order in status ${order.status}.`,
        );
      }
    }

    const resolved = await this.resolveLines(dto.lines, customer);
    // Lines copied from an order keep the order's already-authorised discount.
    if (!order) assertDiscountAllowed(resolved, customer.defaultDiscountPct ?? 0, actor);

    const lines = [];
    for (let i = 0; i < resolved.length; i++) {
      const l = resolved[i];
      const stockItem = await this.stockItemsService.getOrCreateForDesignVariant(l.designVariantId);

      let salesOrderLineId: string | undefined;
      if (order) {
        if (!l.salesOrderLineId) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            'Each line must reference a salesOrderLineId when invoicing from a sales order.',
          );
        }
        const orderLine = order.lines.id(l.salesOrderLineId);
        if (!orderLine)
          throw new ProblemException('NOT_FOUND', 404, `Sales order line ${l.salesOrderLineId} not found.`);
        if (String(orderLine.designVariantId) !== l.designVariantId) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            'Invoice line product does not match the sales order line.',
          );
        }
        const remaining = roundQty(orderLine.qty - orderLine.qtyInvoiced);
        if (l.qty > remaining + 0.0005) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            `Cannot invoice ${l.qty} of ${l.designNo}: only ${remaining} remains on this order line.`,
          );
        }
        salesOrderLineId = String(orderLine._id);
      }

      lines.push({
        salesOrderLineId: salesOrderLineId ? new Types.ObjectId(salesOrderLineId) : undefined,
        deliveryChallanLineId: extra.challanLineIds?.[i]
          ? new Types.ObjectId(extra.challanLineIds[i])
          : undefined,
        designVariantId: new Types.ObjectId(l.designVariantId),
        stockItemId: new Types.ObjectId(String((stockItem as any)._id)),
        hsn: l.hsn,
        qty: l.qty,
        unitRate: l.unitRate,
        discountPct: l.discountPct,
        extraDiscountAmt: l.extraDiscountAmt,
        extraDiscountPct: l.extraDiscountPct,
        grossAmount: 0,
        discountAmount: 0,
        taxableValue: 0,
        taxRatePct: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        lineTotal: 0,
        returnedQty: 0,
      });
    }

    if (dto.agentId && !(await this.agentModel.exists({ _id: dto.agentId }))) {
      throw new ProblemException('NOT_FOUND', 404, 'Sales agent not found.');
    }
    const agentId =
      dto.agentId ??
      (order?.agentId ? String(order.agentId) : undefined) ??
      (customer.agentId ? String(customer.agentId) : undefined);
    const settings = await this.companySettings.get();

    return this.model.create({
      docNo: `DRAFT-${new Types.ObjectId().toHexString()}`,
      docDate: new Date(),
      customerId: new Types.ObjectId(dto.customerId),
      salesOrderId: dto.salesOrderId ? new Types.ObjectId(dto.salesOrderId) : undefined,
      deliveryChallanId: extra.deliveryChallanId
        ? new Types.ObjectId(extra.deliveryChallanId)
        : undefined,
      exhibitionOrderId: extra.exhibitionOrderId
        ? new Types.ObjectId(extra.exhibitionOrderId)
        : undefined,
      agentId: agentId ? new Types.ObjectId(agentId) : undefined,
      lines,
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      customerNameSnapshot: customer.businessName || customer.name,
      customerAddressSnapshot: customer.billingAddress,
      customerGstinSnapshot: customer.gstin,
      placeOfSupply: customer.state,
      isIntraState: isIntraStateSupply(customer.state, settings?.state),
      otherCharges: dto.otherCharges ?? 0,
      transportName: dto.transportName,
      notes: dto.notes,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
  }

  /** Discards a DRAFT invoice (nothing was posted, no number was allocated). */
  async discardDraft(id: string, actorId: string) {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');
    if (invoice.status !== 'DRAFT') {
      throw new InvalidStateTransitionException('Only a draft invoice can be discarded.');
    }
    invoice.status = 'CANCELLED';
    invoice.cancelReason = 'Draft discarded';
    invoice.cancelledBy = actorId as any;
    invoice.cancelledAt = new Date();
    await invoice.save();
    return invoice;
  }

  /**
   * SAL-02 / tech.md §8.2 step 2: lines drawn from the warehouse need ready stock that is
   * on hand AND not promised to other confirmed sales orders. This invoice's own order is
   * excluded from "reserved" since its reservation is exactly what is being fulfilled.
   */
  private async assertAvailable(invoice: {
    lines: Array<{ stockItemId: Types.ObjectId; designVariantId: Types.ObjectId; qty: number; deliveryChallanLineId?: Types.ObjectId }>;
    salesOrderId?: Types.ObjectId;
  }) {
    const qtyByItem = new Map<string, { qty: number; variantId: string }>();
    for (const line of invoice.lines) {
      if (line.deliveryChallanLineId) continue;
      const k = String(line.stockItemId);
      const cur = qtyByItem.get(k) ?? { qty: 0, variantId: String(line.designVariantId) };
      cur.qty = roundQty(cur.qty + line.qty);
      qtyByItem.set(k, cur);
    }
    if (qtyByItem.size === 0) return;
    const labels = await this.lookup.variantLabels(
      Array.from(qtyByItem.values()).map((v) => v.variantId),
    );
    const shortfalls: Array<{ stockItemId: string; item: string; requested: number; available: number }> = [];
    for (const [stockItemId, { qty, variantId }] of qtyByItem) {
      const available = await this.salesOrdersService.getAtp(
        stockItemId,
        invoice.salesOrderId ? String(invoice.salesOrderId) : undefined,
      );
      if (qty > available + 0.0005) {
        const lab = labels.get(variantId);
        shortfalls.push({
          stockItemId,
          item: lab ? `${lab.designNo} / ${lab.colourName} / ${lab.sizeName}` : stockItemId,
          requested: qty,
          available: Math.max(0, available),
        });
      }
    }
    if (shortfalls.length > 0) {
      throw new InsufficientStockException(
        `Insufficient ready stock: ${shortfalls
          .map((s) => `${s.item} needs ${s.requested}, available ${s.available}`)
          .join('; ')}.`,
        { shortfalls },
      );
    }
  }

  /** tech.md §8.2: FIFO-deduct, compute totals, snapshot, allocate the number last, all in one transaction. */
  async confirm(id: string, actorId: string): Promise<InvoiceDocument> {
    // Must run before the transaction opens: ensureSeries() has no session, and a transaction
    // reads under a snapshot taken before this call, so a series created inside the
    // transaction would not be visible to numberSeries.next(..., session) later in it.
    const settingsForSeries = await this.companySettings.get();
    if (settingsForSeries) {
      await this.numberSeries.ensureSeries('INVOICE', settingsForSeries.currentFinancialYear, 'INV');
    }

    const pre = await this.findById(id);
    if (pre.status !== 'DRAFT') {
      throw new InvalidStateTransitionException(`Invoice is already ${pre.status}.`);
    }
    await this.assertAvailable(pre);

    return this.transactionService.run(async (session) => {
      const invoice = await this.model.findById(id).session(session);
      if (!invoice) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');
      if (invoice.status !== 'DRAFT') {
        throw new InvalidStateTransitionException(`Invoice is already ${invoice.status}.`);
      }

      const customer = await this.customerModel.findById(invoice.customerId).session(session).lean();
      if (!customer) throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');
      const settings = await this.companySettings.get();
      if (!settings)
        throw new ProblemException('VALIDATION_FAILED', 500, 'Company settings are not configured.');

      invoice.docDate = new Date();
      const computed = await this.price(
        invoice.lines.map((l) => ({
          designVariantId: String(l.designVariantId),
          qty: l.qty,
          unitRate: l.unitRate,
          discountPct: l.discountPct,
          extraDiscountAmt: l.extraDiscountAmt,
          extraDiscountPct: l.extraDiscountPct ?? 0,
          hsn: l.hsn,
        })),
        customer.state,
        settings.state,
        invoice.docDate,
        invoice.otherCharges ?? 0,
        session,
      );

      const [warehouse, virtCustomer, consign] = await Promise.all([
        this.locationModel.findOne({ code: 'MAIN-WH' }).session(session).lean(),
        this.locationModel.findOne({ code: 'VIRT-CUSTOMER' }).session(session).lean(),
        this.locationModel.findOne({ code: 'CUST-CONSIGN' }).session(session).lean(),
      ]);
      if (!warehouse || !virtCustomer) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          500,
          'Warehouse or customer virtual location is not seeded.',
        );
      }

      const challan = invoice.deliveryChallanId
        ? await this.challanModel.findById(invoice.deliveryChallanId).session(session)
        : null;

      for (let i = 0; i < invoice.lines.length; i++) {
        const line = invoice.lines[i];
        const c = computed.lines[i];
        line.grossAmount = c.grossAmount;
        line.discountAmount = c.discountAmount;
        line.taxableValue = c.taxableValue;
        line.taxRatePct = c.taxRatePct;
        line.cgst = c.cgst;
        line.sgst = c.sgst;
        line.igst = c.igst;
        line.lineTotal = c.lineTotal;

        const doc = { type: 'INVOICE', id: String(invoice._id), lineId: String(line._id) };
        const posted = [];
        if (line.deliveryChallanLineId) {
          // Billing goods already out on a challan: consume the very lots that were dispatched.
          if (!challan || !consign) {
            throw new ProblemException('VALIDATION_FAILED', 422, 'Delivery challan not found.');
          }
          const cl = challan.lines.id(String(line.deliveryChallanLineId));
          if (!cl) throw new ProblemException('NOT_FOUND', 404, 'Delivery challan line not found.');
          const open = roundQty(cl.qty - cl.qtyInvoiced - cl.qtyReturned);
          if (line.qty > open + 0.0005) {
            throw new ProblemException(
              'VALIDATION_FAILED',
              422,
              `Only ${open} of this challan line is still with the customer.`,
            );
          }
          let remaining = line.qty;
          for (const portion of cl.lots) {
            if (remaining <= 0.0005) break;
            const take = roundQty(Math.min(remaining, portion.qtyOpen));
            if (take <= 0) continue;
            posted.push(
              ...(await this.stockService.post(
                [
                  {
                    type: 'SALE',
                    stockItemId: String(line.stockItemId),
                    lotId: String(portion.lotId),
                    fromLocationId: String(consign._id),
                    toLocationId: String(virtCustomer._id),
                    qty: take,
                    doc,
                  },
                ],
                session,
                actorId,
              )),
            );
            portion.qtyOpen = roundQty(portion.qtyOpen - take);
            remaining = roundQty(remaining - take);
          }
          cl.qtyInvoiced = roundQty(cl.qtyInvoiced + line.qty);
        } else {
          posted.push(
            ...(await this.stockService.post(
              [
                {
                  type: 'SALE',
                  stockItemId: String(line.stockItemId),
                  fromLocationId: String(warehouse._id),
                  toLocationId: String(virtCustomer._id),
                  qty: line.qty,
                  doc,
                },
              ],
              session,
              actorId,
            )),
          );
          await this.packingService.consumePacked(String(line.stockItemId), line.qty, session);
        }

        await this.allocationModel.create(
          posted.map((row) => ({
            invoiceId: invoice._id,
            invoiceLineId: line._id,
            lotId: new Types.ObjectId(row.lotId),
            qty: row.qty,
            unitCost: row.unitCost,
          })),
          { session, ordered: true },
        );
      }

      if (challan) {
        challan.invoiceIds = [...(challan.invoiceIds ?? []), invoice._id as Types.ObjectId];
        challan.status = challanStatusFor(challan);
        challan.version += 1;
        await challan.save({ session });
      }

      invoice.subtotal = computed.subtotal;
      invoice.discountTotal = computed.discountTotal;
      invoice.taxableTotal = computed.taxableTotal;
      invoice.cgstTotal = computed.cgstTotal;
      invoice.sgstTotal = computed.sgstTotal;
      invoice.igstTotal = computed.igstTotal;
      invoice.otherCharges = computed.otherCharges;
      invoice.roundOff = computed.roundOff;
      invoice.grandTotal = computed.grandTotal;
      invoice.isIntraState = computed.isIntraState;
      invoice.placeOfSupply = customer.state;
      // Snapshot the customer at confirm time (tech.md §8.2 step 3).
      invoice.customerNameSnapshot = customer.businessName || customer.name;
      invoice.customerAddressSnapshot = customer.billingAddress;
      invoice.customerGstinSnapshot = customer.gstin;

      if (invoice.agentId) {
        const agent = await this.agentModel.findById(invoice.agentId).session(session).lean();
        invoice.agentNameSnapshot = agent?.name;
        invoice.commissionPct = agent?.commissionPct ?? 0;
        invoice.commissionAmount = roundMoney(
          (computed.taxableTotal * (agent?.commissionPct ?? 0)) / 100,
        );
      }

      if (invoice.salesOrderId) {
        await this.salesOrdersService.applyInvoicedQty(
          String(invoice.salesOrderId),
          invoice.lines
            .filter((l) => l.salesOrderLineId)
            .map((l) => ({ salesOrderLineId: String(l.salesOrderLineId), qty: l.qty })),
          session,
        );
      }

      invoice.docNo = await this.numberSeries.next('INVOICE', settings.currentFinancialYear, session);
      invoice.status = 'CONFIRMED';
      invoice.paymentStatus = 'UNPAID';
      invoice.confirmedBy = actorId as any;
      invoice.confirmedAt = new Date();
      invoice.updatedBy = actorId as any;
      invoice.version += 1;
      await invoice.save({ session });
      return invoice;
    });
  }

  /** SAL-08: reverses the SALE ledger rows and gives the invoiced qty back to the order; the number stays consumed. */
  async cancel(id: string, reason: string, actorId: string): Promise<InvoiceDocument> {
    return this.transactionService.run(async (session) => {
      const invoice = await this.model.findById(id).session(session);
      if (!invoice) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');
      if (invoice.status !== 'CONFIRMED') {
        throw new InvalidStateTransitionException(
          `Only a confirmed invoice can be cancelled (current status: ${invoice.status}).`,
        );
      }
      if (invoice.lines.some((l) => (l.returnedQty ?? 0) > 0) || (invoice.creditedTotal ?? 0) > 0) {
        throw new InvalidStateTransitionException(
          'This invoice has a confirmed sales return / credit note; it cannot be cancelled.',
        );
      }
      if (invoice.paymentStatus !== 'UNPAID') {
        throw new ProblemException(
          'VALIDATION_FAILED',
          409,
          'Unallocate payments from this invoice before cancelling it.',
        );
      }

      await this.stockService.reverseDocument('INVOICE', String(invoice._id), reason, session, actorId);

      if (invoice.salesOrderId) {
        await this.reverseInvoicedQty(String(invoice.salesOrderId), invoice, session);
      }
      if (invoice.deliveryChallanId) {
        // The reversal put the goods back in CUST-CONSIGN; reopen the challan quantities and lots.
        const challan = await this.challanModel.findById(invoice.deliveryChallanId).session(session);
        if (challan) {
          const allocs = await this.allocationModel
            .find({ invoiceId: invoice._id })
            .session(session)
            .lean();
          for (const line of invoice.lines) {
            if (!line.deliveryChallanLineId) continue;
            const cl = challan.lines.id(String(line.deliveryChallanLineId));
            if (!cl) continue;
            cl.qtyInvoiced = roundQty(Math.max(0, cl.qtyInvoiced - line.qty));
            for (const a of allocs.filter((x) => String(x.invoiceLineId) === String(line._id))) {
              const portion = cl.lots.find((p) => String(p.lotId) === String(a.lotId));
              if (portion) portion.qtyOpen = roundQty(portion.qtyOpen + a.qty);
            }
          }
          challan.invoiceIds = (challan.invoiceIds ?? []).filter(
            (x) => String(x) !== String(invoice._id),
          );
          challan.status = challanStatusFor(challan);
          challan.version += 1;
          await challan.save({ session });
        }
      }

      invoice.status = 'CANCELLED';
      invoice.cancelReason = reason;
      invoice.cancelledBy = actorId as any;
      invoice.cancelledAt = new Date();
      invoice.updatedBy = actorId as any;
      invoice.version += 1;
      await invoice.save({ session });
      return invoice;
    });
  }

  private async reverseInvoicedQty(
    salesOrderId: string,
    invoice: InvoiceDocument,
    session: ClientSession,
  ): Promise<void> {
    const order = await this.orderModel.findById(salesOrderId).session(session);
    if (!order) return;

    for (const line of invoice.lines) {
      if (!line.salesOrderLineId) continue;
      const orderLine = order.lines.id(String(line.salesOrderLineId));
      if (!orderLine) continue;
      orderLine.qtyInvoiced = roundQty(Math.max(0, orderLine.qtyInvoiced - line.qty));
    }

    const allInvoiced = order.lines.every((l) => l.qtyInvoiced >= l.qty - 0.0005);
    const anyInvoiced = order.lines.some((l) => l.qtyInvoiced > 0.0005);
    order.status = allInvoiced ? 'INVOICED' : anyInvoiced ? 'PARTIALLY_INVOICED' : 'CONFIRMED';
    order.version += 1;
    await order.save({ session });
  }
}

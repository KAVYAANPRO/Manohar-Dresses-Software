import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DeliveryChallan, DeliveryChallanDocument } from './schemas/delivery-challan.schema';
import { SalesOrder, SalesOrderDocument } from './schemas/sales-order.schema';
import { Customer, CustomerDocument } from '../master/schemas/customer.schema';
import { DesignVariant, DesignVariantDocument } from '../design/schemas/design-variant.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockItemsService } from '../inventory/stock-items.service';
import { StockService } from '../inventory/stock.service';
import { PackingService } from '../readystock/packing.service';
import { SalesOrdersService } from './sales-orders.service';
import { InvoicesService } from './invoices.service';
import { SalesLookupService } from './sales-lookup.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { roundQty } from '../common/utils/decimal';
import {
  InsufficientStockException,
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import {
  ChallanInvoiceDto,
  ChallanReturnDto,
  CreateDeliveryChallanDto,
} from './dto/delivery-challan.dto';
import { challanStatusFor, SalesActor } from './sales-rules';

/**
 * Customer delivery challans (goods out before / without an invoice). Stock is conserved:
 * dispatch = TRANSFER MAIN-WH -> CUST-CONSIGN; return = TRANSFER CUST-CONSIGN -> MAIN-WH
 * (GOOD) or QUARANTINE (DAMAGED); billing = SALE CUST-CONSIGN -> Customer (virtual) through
 * the normal invoice confirm. The exact lots dispatched are tracked per line so cost and
 * traceability survive the round trip.
 */
@Injectable()
export class DeliveryChallansService {
  constructor(
    @InjectModel(DeliveryChallan.name) private readonly model: Model<DeliveryChallanDocument>,
    @InjectModel(SalesOrder.name) private readonly orderModel: Model<SalesOrderDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(DesignVariant.name) private readonly variantModel: Model<DesignVariantDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly stockItemsService: StockItemsService,
    private readonly stockService: StockService,
    private readonly packingService: PackingService,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly lookup: SalesLookupService,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  async list(filter: Record<string, unknown> = {}): Promise<any[]> {
    const rows = await this.model
      .find(castObjectIdFilter(filter, ['customerId']))
      .sort({ createdAt: -1 })
      .lean();
    const [customers, labels, orders] = await Promise.all([
      this.lookup.names('customers', rows.map((r) => r.customerId)),
      this.lookup.variantLabels(rows.flatMap((r) => r.lines.map((l) => l.designVariantId))),
      this.orderModel
        .find({ _id: { $in: rows.map((r) => r.salesOrderId).filter(Boolean) } })
        .select('docNo')
        .lean(),
    ]);
    const soNo = new Map(orders.map((o) => [String(o._id), o.docNo]));
    return rows.map((r) => {
      const c = customers.get(String(r.customerId));
      return {
        ...r,
        customerName: c?.businessName || c?.name,
        salesOrderNo: r.salesOrderId ? soNo.get(String(r.salesOrderId)) : undefined,
        totalQty: roundQty(r.lines.reduce((s, l) => s + l.qty, 0)),
        openQty: roundQty(r.lines.reduce((s, l) => s + (l.qty - l.qtyInvoiced - l.qtyReturned), 0)),
        lines: r.lines.map((l) => ({
          ...l,
          ...(labels.get(String(l.designVariantId)) ?? {}),
          openQty: roundQty(l.qty - l.qtyInvoiced - l.qtyReturned),
        })),
      };
    });
  }

  async view(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) throw new ProblemException('NOT_FOUND', 404, 'Delivery challan not found.');
    const [row] = await this.list({ _id: new Types.ObjectId(id) });
    if (!row) throw new ProblemException('NOT_FOUND', 404, 'Delivery challan not found.');
    const invoices = await this.model.db
      .collection('invoices')
      .find({ deliveryChallanId: row._id })
      .project({ docNo: 1, docDate: 1, status: 1, grandTotal: 1 })
      .toArray();
    return { ...row, invoices };
  }

  async create(dto: CreateDeliveryChallanDto, actor: SalesActor) {
    const customer = Types.ObjectId.isValid(dto.customerId)
      ? await this.customerModel.findById(dto.customerId).lean()
      : null;
    if (!customer) throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');
    if (dto.salesOrderId && !(await this.orderModel.exists({ _id: dto.salesOrderId }))) {
      throw new ProblemException('NOT_FOUND', 404, 'Sales order not found.');
    }
    const lines = [];
    for (const l of dto.lines) {
      const variant = Types.ObjectId.isValid(l.designVariantId)
        ? await this.variantModel.findById(l.designVariantId).lean()
        : null;
      if (!variant) throw new ProblemException('NOT_FOUND', 404, `Design variant ${l.designVariantId} not found.`);
      const item = await this.stockItemsService.getOrCreateForDesignVariant(l.designVariantId);
      lines.push({
        designVariantId: new Types.ObjectId(l.designVariantId),
        stockItemId: new Types.ObjectId(String((item as any)._id)),
        qty: l.qty,
        qtyInvoiced: 0,
        qtyReturned: 0,
        unitRate: l.unitRate,
        lots: [],
      });
    }
    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? '00-00';
    await this.numberSeries.ensureSeries('DELIVERY_CHALLAN', fy, 'DC');
    const docNo = await this.numberSeries.next('DELIVERY_CHALLAN', fy);
    const challan = await this.model.create({
      docNo,
      docDate: new Date(),
      customerId: customer._id,
      salesOrderId: dto.salesOrderId ? new Types.ObjectId(dto.salesOrderId) : undefined,
      purpose: dto.purpose ?? 'APPROVAL',
      transportName: dto.transportName,
      vehicleNumber: dto.vehicleNumber,
      notes: dto.notes,
      lines,
      status: 'DRAFT',
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    if (dto.dispatch) {
      try {
        return await this.dispatch(String(challan._id), actor.id);
      } catch (err) {
        if (err instanceof ProblemException) {
          const body = err.getResponse() as Record<string, unknown>;
          throw new ProblemException(err.code, err.getStatus(), String(body.detail ?? err.message), err.fieldErrors, {
            ...(err.extra ?? {}),
            deliveryChallanId: String(challan._id),
            deliveryChallanNo: challan.docNo,
          });
        }
        throw err;
      }
    }
    return challan;
  }

  private async locations() {
    const [warehouse, consign, quarantine] = await Promise.all([
      this.locationModel.findOne({ code: 'MAIN-WH' }).lean(),
      this.locationModel.findOne({ code: 'CUST-CONSIGN' }).lean(),
      this.locationModel.findOne({ code: 'QUARANTINE' }).lean(),
    ]);
    if (!warehouse || !consign || !quarantine) {
      throw new ProblemException('VALIDATION_FAILED', 500, 'Stock locations are not seeded (CUST-CONSIGN missing?).');
    }
    return { warehouse, consign, quarantine };
  }

  /** Moves the goods out of ready stock. ATP-checked: stock promised to confirmed orders cannot go out on approval. */
  async dispatch(id: string, actorId: string) {
    const pre = await this.model.findById(id).lean();
    if (!pre) throw new ProblemException('NOT_FOUND', 404, 'Delivery challan not found.');
    if (pre.status !== 'DRAFT') throw new InvalidStateTransitionException(`Challan is already ${pre.status}.`);

    const qtyByItem = new Map<string, { qty: number; variantId: string }>();
    for (const l of pre.lines) {
      const cur = qtyByItem.get(String(l.stockItemId)) ?? { qty: 0, variantId: String(l.designVariantId) };
      cur.qty = roundQty(cur.qty + l.qty);
      qtyByItem.set(String(l.stockItemId), cur);
    }
    const labels = await this.lookup.variantLabels(pre.lines.map((l) => l.designVariantId));
    const short: string[] = [];
    for (const [stockItemId, { qty, variantId }] of qtyByItem) {
      const atp = await this.salesOrdersService.getAtp(stockItemId);
      if (qty > atp + 0.0005) {
        const lab = labels.get(variantId);
        short.push(`${lab ? `${lab.designNo} / ${lab.colourName} / ${lab.sizeName}` : stockItemId} needs ${qty}, available ${Math.max(0, atp)}`);
      }
    }
    if (short.length) throw new InsufficientStockException(`Insufficient ready stock: ${short.join('; ')}.`);

    const { warehouse, consign } = await this.locations();
    return this.transactionService.run(async (session) => {
      const challan = await this.model.findById(id).session(session);
      if (!challan || challan.status !== 'DRAFT') {
        throw new InvalidStateTransitionException('Challan is not a draft.');
      }
      for (const line of challan.lines) {
        const posted = await this.stockService.post(
          [
            {
              type: 'TRANSFER',
              stockItemId: String(line.stockItemId),
              fromLocationId: String(warehouse._id),
              toLocationId: String(consign._id),
              qty: line.qty,
              doc: { type: 'DELIVERY_CHALLAN', id: String(challan._id), lineId: String(line._id) },
              reason: `Delivery challan ${challan.docNo}`,
            },
          ],
          session,
          actorId,
        );
        line.lots = posted.map((p) => ({
          lotId: new Types.ObjectId(p.lotId),
          qtyOpen: p.qty,
          unitCost: p.unitCost,
        })) as any;
        await this.packingService.consumePacked(String(line.stockItemId), line.qty, session);
      }
      challan.status = 'DISPATCHED';
      challan.dispatchedAt = new Date();
      challan.confirmedBy = actorId as any;
      challan.confirmedAt = new Date();
      challan.version += 1;
      await challan.save({ session });
      return challan;
    });
  }

  /** Customer sends goods back: GOOD -> ready stock, DAMAGED -> quarantine. */
  async returnGoods(id: string, dto: ChallanReturnDto, actorId: string) {
    const { warehouse, consign, quarantine } = await this.locations();
    return this.transactionService.run(async (session) => {
      const challan = await this.model.findById(id).session(session);
      if (!challan) throw new ProblemException('NOT_FOUND', 404, 'Delivery challan not found.');
      if (!['DISPATCHED', 'PARTIALLY_CLOSED'].includes(challan.status)) {
        throw new InvalidStateTransitionException(`Cannot record a return on a ${challan.status} challan.`);
      }
      for (const r of dto.lines) {
        const line = challan.lines.id(r.lineId);
        if (!line) throw new ProblemException('NOT_FOUND', 404, `Challan line ${r.lineId} not found.`);
        const open = roundQty(line.qty - line.qtyInvoiced - line.qtyReturned);
        if (r.qty > open + 0.0005) {
          throw new ProblemException(
            'RETURN_EXCEEDS_OPEN',
            422,
            `Cannot return ${r.qty}: only ${open} of this line is still with the customer.`,
            { qty: `Maximum ${open}` },
          );
        }
        const to = r.condition === 'DAMAGED' ? quarantine : warehouse;
        let remaining = r.qty;
        for (const portion of line.lots) {
          if (remaining <= 0.0005) break;
          const take = roundQty(Math.min(remaining, portion.qtyOpen));
          if (take <= 0) continue;
          await this.stockService.post(
            [
              {
                type: 'TRANSFER',
                stockItemId: String(line.stockItemId),
                lotId: String(portion.lotId),
                fromLocationId: String(consign._id),
                toLocationId: String(to._id),
                qty: take,
                doc: { type: 'DELIVERY_CHALLAN_RETURN', id: String(challan._id), lineId: String(line._id) },
                reason: `Returned on challan ${challan.docNo} (${r.condition})`,
              },
            ],
            session,
            actorId,
          );
          portion.qtyOpen = roundQty(portion.qtyOpen - take);
          remaining = roundQty(remaining - take);
        }
        line.qtyReturned = roundQty(line.qtyReturned + r.qty);
        challan.returns.push({
          date: new Date(),
          lineId: line._id,
          qty: r.qty,
          condition: r.condition,
          note: dto.note,
          by: new Types.ObjectId(actorId),
        });
      }
      challan.status = challanStatusFor(challan);
      challan.version += 1;
      await challan.save({ session });
      return challan;
    });
  }

  /** Bills goods still with the customer: creates an invoice whose lines draw from CUST-CONSIGN. */
  async invoice(id: string, dto: ChallanInvoiceDto, actor: SalesActor) {
    const challan = await this.model.findById(id).lean();
    if (!challan) throw new ProblemException('NOT_FOUND', 404, 'Delivery challan not found.');
    if (!['DISPATCHED', 'PARTIALLY_CLOSED'].includes(challan.status)) {
      throw new InvalidStateTransitionException(`Cannot invoice a ${challan.status} challan.`);
    }
    const draftExists = await this.model.db
      .collection('invoices')
      .findOne({ deliveryChallanId: challan._id, status: 'DRAFT' });
    if (draftExists) {
      throw new InvalidStateTransitionException(
        'A draft invoice for this challan already exists; confirm or discard it first.',
        { invoiceId: String(draftExists._id) },
      );
    }
    const wanted =
      dto.lines ??
      challan.lines
        .map((l) => ({ lineId: String(l._id), qty: roundQty(l.qty - l.qtyInvoiced - l.qtyReturned), unitRate: undefined, discountPct: undefined }))
        .filter((l) => l.qty > 0);
    if (wanted.length === 0) {
      throw new InvalidStateTransitionException('Nothing on this challan is left to invoice.');
    }
    const lines = [];
    const challanLineIds: string[] = [];
    for (const w of wanted) {
      const cl = challan.lines.find((l) => String(l._id) === w.lineId);
      if (!cl) throw new ProblemException('NOT_FOUND', 404, `Challan line ${w.lineId} not found.`);
      const open = roundQty(cl.qty - cl.qtyInvoiced - cl.qtyReturned);
      if (w.qty > open + 0.0005) {
        throw new ProblemException('VALIDATION_FAILED', 422, `Only ${open} of a challan line is left to invoice.`);
      }
      lines.push({
        designVariantId: String(cl.designVariantId),
        qty: w.qty,
        unitRate: w.unitRate ?? cl.unitRate,
        discountPct: w.discountPct,
      });
      challanLineIds.push(w.lineId);
    }
    const draft = await this.invoicesService.createDraft(
      {
        customerId: String(challan.customerId),
        lines,
        notes: dto.notes ?? `Against delivery challan ${challan.docNo}`,
        otherCharges: dto.otherCharges,
        transportName: challan.transportName,
      } as any,
      actor,
      { deliveryChallanId: String(challan._id), challanLineIds },
    );
    if (!dto.confirm) return draft;
    try {
      return await this.invoicesService.confirm(String(draft._id), actor.id);
    } catch (err) {
      await this.invoicesService.discardDraft(String(draft._id), actor.id);
      throw err;
    }
  }

  async cancel(id: string, reason: string, actorId: string) {
    return this.transactionService.run(async (session) => {
      const challan = await this.model.findById(id).session(session);
      if (!challan) throw new ProblemException('NOT_FOUND', 404, 'Delivery challan not found.');
      if (challan.status === 'DISPATCHED') {
        if (challan.lines.some((l) => l.qtyInvoiced > 0 || l.qtyReturned > 0)) {
          throw new InvalidStateTransitionException('Part of this challan was invoiced or returned; it cannot be cancelled.');
        }
        await this.stockService.reverseDocument('DELIVERY_CHALLAN', String(challan._id), reason, session, actorId);
        for (const l of challan.lines) for (const p of l.lots) p.qtyOpen = 0;
      } else if (challan.status !== 'DRAFT') {
        throw new InvalidStateTransitionException(`Cannot cancel a ${challan.status} challan.`);
      }
      challan.status = 'CANCELLED';
      challan.cancelReason = reason;
      challan.cancelledBy = actorId as any;
      challan.cancelledAt = new Date();
      challan.version += 1;
      await challan.save({ session });
      return challan;
    });
  }
}

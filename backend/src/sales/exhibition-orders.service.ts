import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ExhibitionOrder, ExhibitionOrderDocument } from './schemas/exhibition-order.schema';
import { Customer, CustomerDocument } from '../master/schemas/customer.schema';
import { DesignVariant, DesignVariantDocument } from '../design/schemas/design-variant.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { SalesOrdersService } from './sales-orders.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { SalesLookupService } from './sales-lookup.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { roundMoney, roundQty } from '../common/utils/decimal';
import {
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { ConvertExhibitionOrderDto, CreateExhibitionOrderDto } from './dto/exhibition-order.dto';
import { SalesActor } from './sales-rules';

/**
 * Exhibition / pop-up orders. Booking moves no stock and issues no tax document; conversion
 * turns it into a confirmed sales order (reserves ATP) or a confirmed invoice (deducts stock),
 * creating the customer from the walk-in details if needed, and records the advance taken at
 * the stall as a receipt (allocated to the invoice when converting straight to an invoice).
 */
@Injectable()
export class ExhibitionOrdersService {
  constructor(
    @InjectModel(ExhibitionOrder.name) private readonly model: Model<ExhibitionOrderDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(DesignVariant.name) private readonly variantModel: Model<DesignVariantDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly lookup: SalesLookupService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  private static total(lines: Array<{ qty: number; unitRate: number; discountPct: number }>) {
    return roundMoney(lines.reduce((s, l) => s + l.qty * l.unitRate * (1 - (l.discountPct ?? 0) / 100), 0));
  }

  async list(filter: Record<string, unknown> = {}): Promise<any[]> {
    const rows = await this.model
      .find(castObjectIdFilter(filter, ['customerId']))
      .sort({ createdAt: -1 })
      .lean();
    const labels = await this.lookup.variantLabels(rows.flatMap((r) => r.lines.map((l) => l.designVariantId)));
    const db = this.model.db;
    const [orders, invoices] = await Promise.all([
      db.collection('sales_orders').find({ _id: { $in: rows.map((r) => r.salesOrderId).filter(Boolean) as any } }).project({ docNo: 1 }).toArray(),
      db.collection('invoices').find({ _id: { $in: rows.map((r) => r.invoiceId).filter(Boolean) as any } }).project({ docNo: 1 }).toArray(),
    ]);
    const so = new Map(orders.map((o) => [String(o._id), o.docNo]));
    const inv = new Map(invoices.map((o) => [String(o._id), o.docNo]));
    return rows.map((r) => {
      const total = ExhibitionOrdersService.total(r.lines);
      return {
        ...r,
        lines: r.lines.map((l) => ({ ...l, ...(labels.get(String(l.designVariantId)) ?? {}) })),
        totalQty: roundQty(r.lines.reduce((s, l) => s + l.qty, 0)),
        totalAmount: total,
        balance: roundMoney(Math.max(0, total - r.amountCollected)),
        salesOrderNo: r.salesOrderId ? so.get(String(r.salesOrderId)) : undefined,
        invoiceNo: r.invoiceId ? inv.get(String(r.invoiceId)) : undefined,
      };
    });
  }

  async view(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) throw new ProblemException('NOT_FOUND', 404, 'Exhibition order not found.');
    const [row] = await this.list({ _id: new Types.ObjectId(id) });
    if (!row) throw new ProblemException('NOT_FOUND', 404, 'Exhibition order not found.');
    return row;
  }

  async create(dto: CreateExhibitionOrderDto, actorId: string) {
    if (dto.customerId && !(await this.customerModel.exists({ _id: dto.customerId }))) {
      throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');
    }
    if (dto.mobile && !/^\d{10}$/.test(dto.mobile)) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'Mobile must be a 10-digit number.', { mobile: 'Enter a 10-digit mobile number' });
    }
    const lines = [];
    for (const l of dto.lines) {
      const variant = Types.ObjectId.isValid(l.designVariantId) ? await this.variantModel.findById(l.designVariantId).lean() : null;
      if (!variant) throw new ProblemException('NOT_FOUND', 404, `Design variant ${l.designVariantId} not found.`);
      const design = await this.designModel.findById(variant.designId).lean();
      const unitRate = l.unitRate ?? design?.defaultSellingRate;
      if (unitRate === undefined || unitRate === null) {
        throw new ProblemException('VALIDATION_FAILED', 422, `Design ${design?.designNo} has no default selling rate; enter a rate.`);
      }
      lines.push({ designVariantId: variant._id, qty: l.qty, unitRate, discountPct: l.discountPct ?? 0 });
    }
    const total = ExhibitionOrdersService.total(lines);
    const collected = roundMoney(dto.amountCollected ?? 0);
    if (collected > total + 0.005) {
      throw new ProblemException('VALIDATION_FAILED', 422, `Amount collected (${collected}) cannot exceed the order value (${total}).`, {
        amountCollected: `Maximum ${total}`,
      });
    }
    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? '00-00';
    await this.numberSeries.ensureSeries('EXHIBITION_ORDER', fy, 'EX');
    const docNo = await this.numberSeries.next('EXHIBITION_ORDER', fy);
    return this.model.create({
      docNo,
      docDate: new Date(),
      exhibitionName: dto.exhibitionName,
      location: dto.location,
      customerName: dto.customerName,
      mobile: dto.mobile,
      state: dto.state,
      customerId: dto.customerId ? new Types.ObjectId(dto.customerId) : undefined,
      lines,
      amountCollected: collected,
      paymentMode: collected > 0 ? dto.paymentMode ?? 'CASH' : dto.paymentMode,
      notes: dto.notes,
      status: 'PENDING',
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  private async resolveCustomer(order: ExhibitionOrderDocument, customerId: string | undefined, actorId: string) {
    const id = customerId ?? (order.customerId ? String(order.customerId) : undefined);
    if (id) {
      const c = await this.customerModel.findById(id).lean();
      if (!c) throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');
      return c;
    }
    if (order.mobile) {
      const existing = await this.customerModel.findOne({ mobile: order.mobile, isActive: true }).lean();
      if (existing) return existing;
    }
    const settings = await this.companySettings.get();
    const created = await this.customerModel.create({
      name: order.customerName,
      mobile: order.mobile,
      state: order.state ?? settings?.state, // walk-in at the stall: place of supply defaults to the company state
      notes: `Created from exhibition order ${order.docNo} (${order.exhibitionName})`,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return created.toObject();
  }

  async convert(id: string, dto: ConvertExhibitionOrderDto, actor: SalesActor) {
    const order = await this.model.findById(id);
    if (!order) throw new ProblemException('NOT_FOUND', 404, 'Exhibition order not found.');
    if (order.status !== 'PENDING') throw new InvalidStateTransitionException(`Exhibition order is already ${order.status}.`);
    const customer = await this.resolveCustomer(order, dto.customerId, actor.id);
    const lines = order.lines.map((l) => ({
      designVariantId: String(l.designVariantId),
      qty: l.qty,
      unitRate: l.unitRate,
      discountPct: l.discountPct,
    }));
    const notes = `Exhibition order ${order.docNo} - ${order.exhibitionName}${order.location ? `, ${order.location}` : ''}`;
    const result: Record<string, unknown> = {};

    if (dto.target === 'INVOICE') {
      // Discounts were agreed at the stall: no extra-discount permission gate here.
      const draft = await this.invoicesService.createDraft(
        { customerId: String(customer._id), lines, notes } as any,
        { id: actor.id },
        { exhibitionOrderId: String(order._id) },
      );
      let invoice;
      try {
        invoice = await this.invoicesService.confirm(String(draft._id), actor.id);
      } catch (err) {
        await this.invoicesService.discardDraft(String(draft._id), actor.id);
        throw err;
      }
      order.invoiceId = invoice._id as Types.ObjectId;
      result.invoice = invoice;
      if (order.amountCollected > 0) {
        const allocate = Math.min(order.amountCollected, invoice.grandTotal);
        const payment = await this.paymentsService.record(
          {
            customerId: String(customer._id),
            date: new Date().toISOString(),
            amount: order.amountCollected,
            mode: order.paymentMode ?? 'CASH',
            reference: order.docNo,
            notes: `Advance collected at ${order.exhibitionName}`,
            allocations: [{ invoiceId: String(invoice._id), amount: roundMoney(allocate) }],
          },
          actor.id,
        );
        order.advancePaymentId = payment._id as Types.ObjectId;
        result.payment = payment;
      }
    } else {
      const so = await this.salesOrdersService.create(
        { customerId: String(customer._id), lines, notes } as any,
        actor.id,
        { exhibitionOrderId: String(order._id) },
      );
      let confirmed: any = so;
      try {
        confirmed = await this.salesOrdersService.confirm(String(so._id), actor.id);
      } catch (err) {
        // Keep the draft order; the booking is still converted, ATP can be resolved on the order.
        result.confirmError = err instanceof ProblemException ? (err.getResponse() as any).detail : String(err);
      }
      order.salesOrderId = so._id as Types.ObjectId;
      result.salesOrder = confirmed;
      if (order.amountCollected > 0) {
        const payment = await this.paymentsService.record(
          {
            customerId: String(customer._id),
            date: new Date().toISOString(),
            amount: order.amountCollected,
            mode: order.paymentMode ?? 'CASH',
            reference: order.docNo,
            notes: `Advance collected at ${order.exhibitionName} (unallocated until invoiced)`,
          },
          actor.id,
        );
        order.advancePaymentId = payment._id as Types.ObjectId;
        result.payment = payment;
      }
    }
    order.customerId = customer._id as Types.ObjectId;
    order.status = 'CONVERTED';
    order.confirmedBy = actor.id as any;
    order.confirmedAt = new Date();
    order.version += 1;
    await order.save();
    return { exhibitionOrder: order, ...result };
  }

  async cancel(id: string, reason: string, actorId: string) {
    const order = await this.model.findById(id);
    if (!order) throw new ProblemException('NOT_FOUND', 404, 'Exhibition order not found.');
    if (order.status !== 'PENDING') throw new InvalidStateTransitionException('Only a pending exhibition order can be cancelled.');
    order.status = 'CANCELLED';
    order.cancelReason = reason;
    order.cancelledBy = actorId as any;
    order.cancelledAt = new Date();
    order.version += 1;
    await order.save();
    return order;
  }
}

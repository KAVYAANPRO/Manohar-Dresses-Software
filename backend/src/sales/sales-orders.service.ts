import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SalesOrder, SalesOrderDocument } from './schemas/sales-order.schema';
import { Customer, CustomerDocument } from '../master/schemas/customer.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { DesignVariant, DesignVariantDocument } from '../design/schemas/design-variant.schema';
import { StockItemsService } from '../inventory/stock-items.service';
import { StockService } from '../inventory/stock.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { roundMoney, roundQty } from '../common/utils/decimal';
import {
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { CreateSalesOrderDto } from './dto/sales-order.dto';
import { assertDiscountAllowed, SalesActor } from './sales-rules';

function lineTaxable(l: {
  qty: number;
  unitRate: number;
  discountPct: number;
  extraDiscountPct?: number;
  extraDiscountAmt?: number;
}) {
  const afterPrimary = l.qty * l.unitRate * (1 - l.discountPct / 100);
  return afterPrimary * (1 - (l.extraDiscountPct ?? 0) / 100) - (l.extraDiscountAmt ?? 0);
}

const OPEN_STATUSES = ['CONFIRMED', 'PARTIALLY_INVOICED'];

/** SAL-01 to SAL-03, RGS-04. Confirming a sales order never moves stock (Rule 6) - only the ATP check at confirm gates it. */
@Injectable()
export class SalesOrdersService {
  constructor(
    @InjectModel(SalesOrder.name) private readonly model: Model<SalesOrderDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    @InjectModel(DesignVariant.name) private readonly variantModel: Model<DesignVariantDocument>,
    private readonly stockItemsService: StockItemsService,
    private readonly stockService: StockService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  list(filter: Record<string, unknown> = {}) {
    return this.model
      .find(castObjectIdFilter(filter, ['customerId']))
      .sort({ createdAt: -1 })
      .lean();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Sales order not found.');
    return doc;
  }

  /** RGS-04: sellable on-hand minus qty still open (confirmed, not yet invoiced) on OTHER sales orders. */
  async getAtp(stockItemId: string, excludeOrderId?: string): Promise<number> {
    const [availability] = await this.stockService.availability([stockItemId]);
    const onHand = availability?.onHand ?? 0;

    const match: Record<string, unknown> = {
      status: { $in: OPEN_STATUSES },
      'lines.stockItemId': new Types.ObjectId(stockItemId),
    };
    if (excludeOrderId) match._id = { $ne: new Types.ObjectId(excludeOrderId) };

    const orders = await this.model.find(match).lean();
    let reserved = 0;
    for (const order of orders) {
      for (const line of order.lines) {
        if (String(line.stockItemId) === stockItemId) {
          reserved += Math.max(0, line.qty - line.qtyInvoiced);
        }
      }
    }
    return roundQty(onHand - reserved);
  }

  async create(
    dto: CreateSalesOrderDto,
    actor: SalesActor | string,
    extra: { exhibitionOrderId?: string } = {},
  ): Promise<SalesOrderDocument> {
    const actorId = typeof actor === 'string' ? actor : actor.id;
    const customer = await this.customerModel.findById(dto.customerId).lean();
    if (!customer) throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');

    if (customer.isActive === false) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'This customer is inactive.');
    }

    const lines = [];
    for (const l of dto.lines) {
      const variant = await this.variantModel.findById(l.designVariantId).lean();
      if (!variant)
        throw new ProblemException(
          'NOT_FOUND',
          404,
          `Design variant ${l.designVariantId} not found.`,
        );
      const design = await this.designModel.findById(variant.designId).lean();
      if (!design)
        throw new ProblemException('NOT_FOUND', 404, 'Design not found for this variant.');

      const stockItem = await this.stockItemsService.getOrCreateForDesignVariant(l.designVariantId);

      // SAL-03: rate defaults from the design, the customer's default discount applies automatically.
      const unitRate = l.unitRate ?? design.defaultSellingRate;
      if (unitRate === undefined) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Design ${design.designNo} has no default selling rate; a rate must be supplied.`,
        );
      }
      const discountPct = l.discountPct ?? customer.defaultDiscountPct ?? 0;

      lines.push({
        designVariantId: new Types.ObjectId(l.designVariantId),
        stockItemId: new Types.ObjectId(String((stockItem as any)._id)),
        qty: l.qty,
        qtyInvoiced: 0,
        unitRate,
        discountPct,
        extraDiscountAmt: l.extraDiscountAmt ?? 0,
        extraDiscountPct: l.extraDiscountPct ?? 0,
      });
    }
    if (typeof actor !== 'string') assertDiscountAllowed(lines, customer.defaultDiscountPct ?? 0, actor);

    if (
      dto.agentId &&
      !(await this.model.db.collection('sales_agents').findOne({ _id: new Types.ObjectId(dto.agentId) }))
    ) {
      throw new ProblemException('NOT_FOUND', 404, 'Sales agent not found.');
    }
    const agentId = dto.agentId ?? (customer.agentId ? String(customer.agentId) : undefined);

    // Allocate the number only once validation has passed, so a rejected request burns no number.
    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('SALES_ORDER', fy, 'SO');
    const docNo = await this.numberSeries.next('SALES_ORDER', fy);

    const order = await this.model.create({
      docNo,
      docDate: new Date(),
      customerId: new Types.ObjectId(dto.customerId),
      lines,
      status: 'DRAFT',
      notes: dto.notes,
      agentId: agentId ? new Types.ObjectId(agentId) : undefined,
      customerRefNo: dto.customerRefNo,
      transportName: dto.transportName,
      expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
      shippingCharge: dto.shippingCharge ?? 0,
      otherCharges: dto.otherCharges ?? 0,
      exhibitionOrderId: extra.exhibitionOrderId
        ? new Types.ObjectId(extra.exhibitionOrderId)
        : undefined,
      createdBy: actorId,
      updatedBy: actorId,
    });
    if (dto.confirm) {
      try {
        return await this.confirm(String(order._id), actorId);
      } catch (err) {
        // The order stays as a DRAFT (fix quantities and confirm later); tell the UI its id.
        if (err instanceof ProblemException) {
          const body = err.getResponse() as Record<string, unknown>;
          throw new ProblemException(
            err.code,
            err.getStatus(),
            String(body.detail ?? err.message),
            err.fieldErrors,
            { ...(err.extra ?? {}), salesOrderId: String(order._id), salesOrderNo: order.docNo },
          );
        }
        throw err;
      }
    }
    return order;
  }

  /** Display-ready list: customer name, qty, taxable value (pre-GST), invoiced qty. */
  async listView(filter: Record<string, unknown> = {}): Promise<any[]> {
    const orders = await this.list(filter);
    const customers = await this.model.db
      .collection('customers')
      .find({ _id: { $in: orders.map((o) => o.customerId) } })
      .project({ name: 1, businessName: 1 })
      .toArray();
    const cById = new Map(customers.map((c) => [String(c._id), c]));
    return orders.map((o) => {
      const c = cById.get(String(o.customerId));
      return {
        ...o,
        customerName: c?.businessName || c?.name,
        itemCount: o.lines.length,
        totalQty: roundQty(o.lines.reduce((sum, l) => sum + l.qty, 0)),
        invoicedQty: roundQty(o.lines.reduce((sum, l) => sum + l.qtyInvoiced, 0)),
        taxableTotal: roundMoney(o.lines.reduce((sum, l) => sum + lineTaxable(l), 0)),
      };
    });
  }

  /** Detail view: lines with live on-hand / ATP, customer, agent and linked invoices. */
  async view(id: string): Promise<any> {
    const order = await this.findById(id);
    const db = this.model.db;
    const [customer, agent, invoices] = await Promise.all([
      db.collection('customers').findOne({ _id: order.customerId }),
      order.agentId ? db.collection('sales_agents').findOne({ _id: order.agentId }) : null,
      db
        .collection('invoices')
        .find({ salesOrderId: order._id, status: { $ne: 'CANCELLED' } })
        .project({ docNo: 1, docDate: 1, grandTotal: 1, status: 1, paymentStatus: 1 })
        .sort({ createdAt: 1 })
        .toArray(),
    ]);
    const lines = [];
    for (const l of order.lines) {
      const [availability] = await this.stockService.availability([String(l.stockItemId)]);
      lines.push({
        ...l,
        pendingQty: roundQty(l.qty - l.qtyInvoiced),
        onHand: availability?.onHand ?? 0,
        atp: await this.getAtp(String(l.stockItemId), String(order._id)),
      });
    }
    return {
      ...order,
      lines,
      customer: customer
        ? {
            _id: customer._id,
            name: customer.businessName || customer.name,
            gstin: customer.gstin,
            state: customer.state,
            defaultDiscountPct: customer.defaultDiscountPct,
          }
        : undefined,
      agent: agent ? { _id: agent._id, name: agent.name, commissionPct: agent.commissionPct } : undefined,
      invoices,
    };
  }

  /** SAL-02: check ATP per line and reject with a clear shortfall message. */
  async confirm(id: string, actorId: string): Promise<SalesOrderDocument> {
    const order = await this.model.findById(id);
    if (!order) throw new ProblemException('NOT_FOUND', 404, 'Sales order not found.');
    if (order.status !== 'DRAFT') {
      throw new InvalidStateTransitionException(`Sales order is already ${order.status}.`);
    }

    // Sum per stock item first: two lines of the same product must fit ATP together.
    const qtyByItem = new Map<string, number>();
    for (const line of order.lines) {
      const k = String(line.stockItemId);
      qtyByItem.set(k, roundQty((qtyByItem.get(k) ?? 0) + line.qty));
    }
    const shortfalls: Array<{
      stockItemId: string;
      designVariantId: string;
      label: string;
      requested: number;
      atp: number;
      shortfall: number;
    }> = [];
    for (const [stockItemId, requested] of qtyByItem) {
      const atp = await this.getAtp(stockItemId);
      if (requested > atp + 0.0005) {
        const line = order.lines.find((l) => String(l.stockItemId) === stockItemId)!;
        shortfalls.push({
          stockItemId,
          designVariantId: String(line.designVariantId),
          label: await this.variantLabel(String(line.designVariantId)),
          requested,
          atp: Math.max(0, atp),
          shortfall: roundQty(requested - Math.max(0, atp)),
        });
      }
    }
    if (shortfalls.length > 0) {
      throw new ProblemException(
        'INSUFFICIENT_STOCK',
        409,
        `Not enough available-to-promise stock: ${shortfalls
          .map((x) => `${x.label} requested ${x.requested}, ATP ${x.atp} (short ${x.shortfall})`)
          .join('; ')}.`,
        undefined,
        { shortfalls },
      );
    }

    order.status = 'CONFIRMED';
    order.confirmedBy = actorId as any;
    order.confirmedAt = new Date();
    order.updatedBy = actorId as any;
    order.version += 1;
    await order.save();
    return order;
  }

  async cancel(id: string, reason: string, actorId: string): Promise<SalesOrderDocument> {
    const order = await this.model.findById(id);
    if (!order) throw new ProblemException('NOT_FOUND', 404, 'Sales order not found.');
    if (order.lines.some((l) => l.qtyInvoiced > 0)) {
      throw new InvalidStateTransitionException('Cannot cancel a sales order with invoiced lines.');
    }
    if (order.status === 'CANCELLED') {
      throw new InvalidStateTransitionException('Sales order is already cancelled.');
    }
    order.status = 'CANCELLED';
    order.cancelReason = reason;
    order.cancelledBy = actorId as any;
    order.cancelledAt = new Date();
    order.updatedBy = actorId as any;
    order.version += 1;
    await order.save();
    return order;
  }

  private async variantLabel(variantId: string): Promise<string> {
    const v = await this.variantModel.findById(variantId).lean();
    if (!v) return variantId;
    const db = this.model.db;
    const [d, c, sz] = await Promise.all([
      this.designModel.findById(v.designId).lean(),
      db.collection('colours').findOne({ _id: v.colourId }),
      db.collection('sizes').findOne({ _id: v.sizeId }),
    ]);
    return `${d?.designNo ?? '?'} / ${c?.name ?? '?'} / ${sz?.name ?? '?'}`;
  }

  /** Called by InvoicesService inside its own transaction, after an invoice consumes some of an order's lines. */
  async applyInvoicedQty(
    salesOrderId: string,
    linesInvoiced: Array<{ salesOrderLineId: string; qty: number }>,
    session: import('mongoose').ClientSession,
  ): Promise<void> {
    const order = await this.model.findById(salesOrderId).session(session);
    if (!order) throw new ProblemException('NOT_FOUND', 404, 'Sales order not found.');

    for (const applied of linesInvoiced) {
      const line = order.lines.id(applied.salesOrderLineId);
      if (!line) continue;
      line.qtyInvoiced = roundQty(line.qtyInvoiced + applied.qty);
    }

    const allInvoiced = order.lines.every((l) => l.qtyInvoiced >= l.qty - 0.0005);
    const anyInvoiced = order.lines.some((l) => l.qtyInvoiced > 0.0005);
    order.status = allInvoiced ? 'INVOICED' : anyInvoiced ? 'PARTIALLY_INVOICED' : order.status;
    order.version += 1;
    await order.save({ session });
  }
}

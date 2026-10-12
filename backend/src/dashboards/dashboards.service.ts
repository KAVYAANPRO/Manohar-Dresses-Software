import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { JobSlip, JobSlipDocument } from '../jobwork/schemas/job-slip.schema';
import { JobReceipt, JobReceiptDocument } from '../jobwork/schemas/job-receipt.schema';
import { Purchase, PurchaseDocument } from '../purchasing/schemas/purchase.schema';
import { Invoice, InvoiceDocument } from '../sales/schemas/invoice.schema';
import { SalesOrder, SalesOrderDocument } from '../sales/schemas/sales-order.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { Customer, CustomerDocument } from '../master/schemas/customer.schema';
import { ReadyStockService } from '../readystock/ready-stock.service';
import { PackingService } from '../readystock/packing.service';
import { PaymentsService } from '../sales/payments.service';
import { AlertsService } from '../reports/alerts/alerts.service';
import { LabelResolverService } from '../reports/label-resolver.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { roundMoney, roundQty } from '../common/utils/decimal';

const OPEN_JOB_STATUSES = ['MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED'];
const DAY_MS = 86_400_000;

export interface DashboardRange {
  from: Date;
  to: Date;
  /** The equally long period immediately before [from, to], for trend comparisons. */
  prevFrom: Date;
  prevTo: Date;
}

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD, default = last 30 days. `to` is inclusive (end of day). */
export function parseRange(from?: string, to?: string): DashboardRange {
  let end = to ? new Date(to) : new Date();
  if (Number.isNaN(end.getTime())) end = new Date();
  if (to) end.setHours(23, 59, 59, 999);
  let start = from ? new Date(from) : new Date(end.getTime() - 29 * DAY_MS);
  if (Number.isNaN(start.getTime()) || start > end) start = new Date(end.getTime() - 29 * DAY_MS);
  if (!from) start.setHours(0, 0, 0, 0);
  const span = end.getTime() - start.getTime();
  return {
    from: start,
    to: end,
    prevTo: new Date(start.getTime() - 1),
    prevFrom: new Date(start.getTime() - 1 - span),
  };
}

function can(user: AuthenticatedUser | undefined, perm: string) {
  return !!user && (user.isSuperAdmin || user.permissions.has(perm));
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function dateOr(field: string, from: Date, to: Date) {
  return {
    $or: [
      { [field]: { $gte: from, $lte: to } },
      { [field]: null, createdAt: { $gte: from, $lte: to } },
    ],
  };
}

/**
 * DSH-01, prd.md §6.1. Every number is computed live from existing collections - nothing is a
 * separately-maintained counter, so these can never drift from the data they summarise.
 * Flow KPIs (purchases, production, sales) respect the requested date range and carry the
 * previous equal-length period for a trend; stock KPIs are "as of now". Amounts are omitted
 * for users without the matching amount permission (prd.md §2.3). Raw-material quantities are
 * reported per unit of measure because metres and kilograms cannot be added together.
 */
@Injectable()
export class DashboardsService {
  constructor(
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(SalesOrder.name) private readonly salesOrderModel: Model<SalesOrderDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly readyStockService: ReadyStockService,
    private readonly packingService: PackingService,
    private readonly paymentsService: PaymentsService,
    private readonly alertsService: AlertsService,
    private readonly labels: LabelResolverService,
  ) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  // ---- shared building blocks ----

  /** Raw (non-finished) stock in a location kind, as qty per unit of measure plus value. */
  private async rawStockByUnit(locationKind: 'WAREHOUSE' | 'FACTORY_CUSTODY') {
    const rows = await this.col('stock_balances')
      .aggregate([
        { $match: { qty: { $ne: 0 } } },
        {
          $lookup: {
            from: 'stock_locations',
            localField: 'locationId',
            foreignField: '_id',
            as: 'loc',
          },
        },
        { $unwind: '$loc' },
        { $match: { 'loc.kind': locationKind } },
        {
          $lookup: {
            from: 'stock_items',
            localField: 'stockItemId',
            foreignField: '_id',
            as: 'item',
          },
        },
        { $unwind: '$item' },
        { $match: { 'item.kind': { $ne: 'FINISHED_GOOD' } } },
        { $lookup: { from: 'stock_lots', localField: 'lotId', foreignField: '_id', as: 'lot' } },
        { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'uoms',
            let: { uid: '$item.baseUomId' },
            pipeline: [{ $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$uid' }] } } }],
            as: 'uom',
          },
        },
        { $unwind: { path: '$uom', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$uom.code', 'UNIT'] },
            qty: { $sum: '$qty' },
            value: { $sum: { $multiply: ['$qty', { $ifNull: ['$lot.unitCost', 0] }] } },
          },
        },
      ])
      .toArray();
    const byUnit = rows
      .map((r) => ({ unit: String(r._id), qty: roundQty(r.qty) }))
      .sort((a, b) => b.qty - a.qty);
    const value = roundMoney(rows.reduce((s, r) => s + r.value, 0));
    return { byUnit, value };
  }

  private async producedQty(from: Date, to: Date): Promise<number> {
    const rows = await this.receiptModel.aggregate([
      {
        $match: {
          status: 'CONFIRMED',
          $or: [
            { confirmedAt: { $gte: from, $lte: to } },
            { confirmedAt: null, updatedAt: { $gte: from, $lte: to } },
          ],
        },
      },
      { $unwind: '$lines' },
      {
        $group: {
          _id: null,
          qty: { $sum: { $ifNull: ['$lines.acceptedQty', '$lines.receivedQty'] } },
        },
      },
    ]);
    return roundQty(rows[0]?.qty ?? 0);
  }

  private async invoiceTotals(from: Date, to: Date) {
    const invoices = await this.invoiceModel
      .find({ status: 'CONFIRMED', docDate: { $gte: from, $lte: to } })
      .lean();
    return {
      total: roundMoney(invoices.reduce((s, i) => s + (i.grandTotal ?? 0), 0)),
      qty: roundQty(
        invoices.reduce(
          (s, i) => s + (i.lines ?? []).reduce((t: number, l: any) => t + (l.qty ?? 0), 0),
          0,
        ),
      ),
      count: invoices.length,
    };
  }

  private async readyStockTotal(): Promise<number> {
    const rows = await this.readyStockService.summary({}, false);
    return roundQty(rows.reduce((s, g) => s + g.totalQty, 0));
  }

  private async recentActivity(limit = 8) {
    const rows = await this.col('audit_log')
      .find({
        entityType: {
          $in: [
            'Purchase',
            'Inward',
            'JobSlip',
            'MaterialIssue',
            'JobReceipt',
            'Invoice',
            'SalesOrder',
            'Payment',
            'StockAdjustment',
          ],
        },
      })
      .sort({ occurredAt: -1 })
      .limit(limit * 4)
      .toArray();
    const actors = await this.labels.resolve(
      'user',
      rows.filter((r) => r.actorUserId).map((r) => String(r.actorUserId)),
    );
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const after = (r.after ?? {}) as Record<string, any>;
      const before = (r.before ?? {}) as Record<string, any>;
      const status = after.status as string | undefined;
      const label =
        r.action === 'INSERT'
          ? 'created'
          : before.status !== status && status
            ? status.toLowerCase().replace(/_/g, ' ')
            : 'updated';
      const key = `${r.entityType}:${r.entityId}:${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        entityType: r.entityType,
        entityId: r.entityId,
        ref: after.docNo ?? r.entityId,
        action: label,
        status,
        by: r.actorUserId ? (actors.get(String(r.actorUserId)) ?? 'user') : 'system',
        at: r.occurredAt,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  // ---- dashboards ----

  async admin(user: AuthenticatedUser, range: DashboardRange) {
    const [
      rawStock,
      custody,
      totalReadyStock,
      jobsInProgress,
      pendingJobs,
      produced,
      producedPrev,
      sales,
      salesPrev,
      pendingPayments,
      alerts,
      activity,
    ] = await Promise.all([
      this.rawStockByUnit('WAREHOUSE'),
      this.rawStockByUnit('FACTORY_CUSTODY'),
      this.readyStockTotal(),
      this.jobSlipModel.countDocuments({ status: { $in: OPEN_JOB_STATUSES } }),
      this.jobSlipModel.countDocuments({ status: 'CREATED' }),
      this.producedQty(range.from, range.to),
      this.producedQty(range.prevFrom, range.prevTo),
      this.invoiceTotals(range.from, range.to),
      this.invoiceTotals(range.prevFrom, range.prevTo),
      this.paymentsService.pendingInvoices(),
      this.alertsService.listForUser(user),
      this.recentActivity(),
    ]);
    const overdue = alerts.items.filter((a) => a.type === 'PAYMENT_OVERDUE');
    const lowStock = alerts.items.filter(
      (a) => a.type === 'LOW_RAW_STOCK' || a.type === 'LOW_READY_STOCK',
    );
    const shortage = alerts.items.filter((a) => a.type === 'HIGH_SHORTAGE');

    return {
      range: { from: range.from, to: range.to },
      rawStockByUnit: rawStock.byUnit,
      totalRawStockValue: rawStock.value,
      totalReadyStock,
      materialWithFactoriesByUnit: custody.byUnit,
      materialWithFactoriesValue: custody.value,
      jobsInProgress,
      pendingJobs,
      productionCompleted: produced,
      productionCompletedPrev: producedPrev,
      productionCompletedTrendPct: pctChange(produced, producedPrev),
      sales: sales.total,
      salesPrev: salesPrev.total,
      salesTrendPct: pctChange(sales.total, salesPrev.total),
      salesQty: sales.qty,
      invoiceCount: sales.count,
      pendingPaymentsTotal: roundMoney(pendingPayments.reduce((s, p) => s + p.outstanding, 0)),
      pendingPaymentsCount: pendingPayments.length,
      overduePaymentsTotal: roundMoney(
        overdue.reduce((s, a) => s + Number(a.data?.outstanding ?? 0), 0),
      ),
      overduePaymentsCount: overdue.length,
      lowStockCount: lowStock.length,
      shortageCount: shortage.length,
      alertsCount: alerts.items.filter((a) => a.severity !== 'info').length,
      unreadAlerts: alerts.unreadCount,
      lowStock: lowStock.slice(0, 6),
      shortageSummary: shortage.slice(0, 6),
      recentActivity: activity,
    };
  }

  async purchase(user: AuthenticatedUser, range: DashboardRange) {
    const showAmounts = can(user, PERMISSIONS.PURCHASE_RATES_VIEW);
    const [recent, pending, inRange, inPrev, openCount, uomRows] = await Promise.all([
      this.purchaseModel
        .find({ status: { $ne: 'DRAFT' } })
        .sort({ docDate: -1, createdAt: -1 })
        .limit(8)
        .lean(),
      this.purchaseModel
        .find({ status: { $in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } })
        .sort({ docDate: 1 })
        .lean(),
      this.purchaseModel
        .find({
          status: { $nin: ['CANCELLED', 'DRAFT'] },
          docDate: { $gte: range.from, $lte: range.to },
        })
        .lean(),
      this.purchaseModel
        .find({
          status: { $nin: ['CANCELLED', 'DRAFT'] },
          docDate: { $gte: range.prevFrom, $lte: range.prevTo },
        })
        .lean(),
      this.purchaseModel.countDocuments({
        status: { $in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] },
      }),
      this.col('uoms').find({}).toArray(),
    ]);
    const amountOf = (p: any) =>
      p.lines.reduce((s: number, l: any) => s + (l.amount ?? 0), 0) + (p.otherCharges ?? 0);

    const allForLabels = [...recent, ...pending, ...inRange];
    const [suppliers, variants] = await Promise.all([
      this.labels.resolve(
        'supplier',
        allForLabels.map((p) => String(p.supplierId)),
      ),
      this.labels.resolve(
        'materialVariant',
        allForLabels.flatMap((p) => p.lines.map((l: any) => String(l.materialVariantId))),
      ),
    ]);
    const uomCode = new Map(uomRows.map((u) => [String(u._id), String(u.code)]));
    const materialsOf = (p: any): string => {
      const names = Array.from(
        new Set<string>(
          p.lines.map((l: any) => variants.get(String(l.materialVariantId)) ?? 'material'),
        ),
      );
      return names.length > 1 ? `${names[0]} +${names.length - 1} more` : (names[0] ?? '');
    };

    const bySupplier = new Map<string, { amount: number; count: number }>();
    const qtyByUnit = new Map<string, number>();
    for (const p of inRange) {
      const k = String(p.supplierId);
      const e = bySupplier.get(k) ?? { amount: 0, count: 0 };
      e.amount += amountOf(p);
      e.count += 1;
      bySupplier.set(k, e);
      for (const l of p.lines as any[]) {
        const unit = uomCode.get(String(l.uomId)) ?? 'UNIT';
        qtyByUnit.set(unit, (qtyByUnit.get(unit) ?? 0) + (l.qty ?? 0));
      }
    }
    const total = roundMoney(inRange.reduce((s, p) => s + amountOf(p), 0));
    const totalPrev = roundMoney(inPrev.reduce((s, p) => s + amountOf(p), 0));

    return {
      range: { from: range.from, to: range.to },
      amountsVisible: showAmounts,
      purchaseCount: inRange.length,
      purchaseCountPrev: inPrev.length,
      totalPurchases: showAmounts ? total : undefined,
      totalPurchasesTrendPct: showAmounts ? pctChange(total, totalPrev) : undefined,
      materialPurchasedByUnit: Array.from(qtyByUnit.entries()).map(([unit, qty]) => ({
        unit,
        qty: roundQty(qty),
      })),
      openPurchaseOrders: openCount,
      pendingInward: pending.length,
      recentPurchases: recent.map((p) => ({
        id: String(p._id),
        docNo: p.docNo,
        docDate: p.docDate,
        status: p.status,
        supplierName: suppliers.get(String(p.supplierId)) ?? '',
        material: materialsOf(p),
        amount: showAmounts ? roundMoney(amountOf(p)) : undefined,
      })),
      pendingInwardList: pending.slice(0, 8).map((p) => {
        const outstanding = (p.lines as any[]).reduce(
          (s, l) => s + Math.max(0, (l.qtyBase ?? l.qty ?? 0) - (l.qtyReceivedBase ?? 0)),
          0,
        );
        return {
          id: String(p._id),
          docNo: p.docNo,
          docDate: p.docDate,
          status: p.status,
          supplierName: suppliers.get(String(p.supplierId)) ?? '',
          material: materialsOf(p),
          outstandingQty: roundQty(outstanding),
          ageDays: Math.floor((Date.now() - new Date(p.docDate).getTime()) / DAY_MS),
        };
      }),
      supplierWisePurchases: Array.from(bySupplier.entries())
        .map(([supplierId, v]) => ({
          supplierId,
          supplierName: suppliers.get(supplierId) ?? '',
          count: v.count,
          total: showAmounts ? roundMoney(v.amount) : undefined,
        }))
        .sort((a, b) => (b.total ?? b.count) - (a.total ?? a.count)),
    };
  }

  async rawMaterial(user: AuthenticatedUser, range: DashboardRange) {
    const showValue = can(user, PERMISSIONS.STOCK_VALUE_VIEW);
    const [stock, custody, alerts, issuedAgg, processed, settings] = await Promise.all([
      this.rawStockByUnit('WAREHOUSE'),
      this.rawStockByUnit('FACTORY_CUSTODY'),
      this.alertsService.listForUser(user),
      this.col('material_issues')
        .aggregate([
          { $match: { status: 'CONFIRMED', ...dateOr('docDate', range.from, range.to) } },
          { $unwind: '$lines' },
          {
            $lookup: {
              from: 'material_variants',
              localField: 'lines.materialVariantId',
              foreignField: '_id',
              as: 'mv',
            },
          },
          { $unwind: { path: '$mv', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'materials', localField: 'mv.materialId', foreignField: '_id', as: 'm' } },
          { $unwind: { path: '$m', preserveNullAndEmptyArrays: true } },
          {
          $lookup: {
            from: 'uoms',
            let: { uid: '$m.baseUomId' },
            pipeline: [{ $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$uid' }] } } }],
            as: 'u',
          },
        },
          { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
          { $group: { _id: { $ifNull: ['$u.code', 'UNIT'] }, qty: { $sum: '$lines.qtyBase' } } },
        ])
        .toArray(),
      this.col('stock_balances')
        .aggregate([
          { $match: { qty: { $gt: 0 } } },
          {
            $lookup: {
              from: 'stock_items',
              localField: 'stockItemId',
              foreignField: '_id',
              as: 'item',
            },
          },
          { $unwind: '$item' },
          { $match: { 'item.kind': 'PROCESSED_MATERIAL' } },
          {
            $lookup: {
              from: 'stock_locations',
              localField: 'locationId',
              foreignField: '_id',
              as: 'loc',
            },
          },
          { $unwind: '$loc' },
          { $match: { 'loc.kind': 'WAREHOUSE' } },
          {
          $lookup: {
            from: 'uoms',
            let: { uid: '$item.baseUomId' },
            pipeline: [{ $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$uid' }] } } }],
            as: 'u',
          },
        },
          { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
          { $group: { _id: { $ifNull: ['$u.code', 'UNIT'] }, qty: { $sum: '$qty' } } },
        ])
        .toArray(),
      this.col('company_settings').findOne({ key: 'default' }),
    ]);
    const lowStock = alerts.items.filter((a) => a.type === 'LOW_RAW_STOCK');
    const shortage = alerts.items.filter((a) => a.type === 'HIGH_SHORTAGE');
    const maxShortage = shortage.reduce(
      (m, a) => Math.max(m, Number(a.data?.shortagePct ?? 0)),
      0,
    );
    return {
      range: { from: range.from, to: range.to },
      currentStockByUnit: stock.byUnit,
      currentRawStockValue: showValue ? stock.value : undefined,
      materialIssuedByUnit: issuedAgg.map((r) => ({ unit: String(r._id), qty: roundQty(r.qty) })),
      materialWithFactoriesByUnit: custody.byUnit,
      processedMaterialByUnit: processed.map((r) => ({
        unit: String(r._id),
        qty: roundQty(r.qty),
      })),
      shortageAlerts: shortage,
      maxShortagePct: maxShortage,
      shortageTolerancePct: (settings as any)?.shortageTolerancePct ?? 0,
      lowStockCount: lowStock.length,
      lowStock,
    };
  }

  async design(range: DashboardRange) {
    const [totalDesigns, activeDesigns, designs, readyRows, production, openJobs] =
      await Promise.all([
        this.designModel.countDocuments({}),
        this.designModel.countDocuments({ isActive: true }),
        this.designModel.find({ isActive: true }).lean(),
        this.readyStockService.summary({}, false),
        this.receiptModel.aggregate([
          { $match: { status: 'CONFIRMED' } },
          {
            $lookup: {
              from: 'job_slips',
              localField: 'jobSlipId',
              foreignField: '_id',
              as: 'slip',
            },
          },
          { $unwind: '$slip' },
          { $unwind: '$lines' },
          {
            $group: {
              _id: '$slip.designId',
              qty: { $sum: { $ifNull: ['$lines.acceptedQty', '$lines.receivedQty'] } },
            },
          },
        ]),
        this.jobSlipModel.aggregate([
          { $match: { status: { $nin: ['CLOSED', 'CANCELLED'] } } },
          { $group: { _id: '$designId', count: { $sum: 1 } } },
        ]),
      ]);
    const producedByDesign = new Map(production.map((p) => [String(p._id), roundQty(p.qty)]));
    const stockByDesign = new Map<string, number>();
    for (const g of readyRows) {
      stockByDesign.set(g.designId, roundQty((stockByDesign.get(g.designId) ?? 0) + g.totalQty));
    }
    const openByDesign = new Map(openJobs.map((j) => [String(j._id), j.count as number]));
    const newInRange = designs.filter(
      (d: any) => d.createdAt && new Date(d.createdAt) >= range.from,
    ).length;

    const rows = designs.map((d) => ({
      designId: String(d._id),
      designNo: d.designNo,
      name: d.name,
      imageUrl: d.imageUrls?.[0] ?? null,
      producedQty: producedByDesign.get(String(d._id)) ?? 0,
      onHand: stockByDesign.get(String(d._id)) ?? 0,
      openJobs: openByDesign.get(String(d._id)) ?? 0,
    }));
    return {
      range: { from: range.from, to: range.to },
      totalDesigns,
      activeDesigns,
      newDesignsInRange: newInRange,
      designsInProduction: rows.filter((r) => r.openJobs > 0).length,
      designWiseProduction: [...rows].sort((a, b) => b.producedQty - a.producedQty).slice(0, 10),
      designWiseStock: [...rows].sort((a, b) => b.onHand - a.onHand).slice(0, 10),
    };
  }

  /** Production department home (job slips, receipts, reconciliation queue). */
  async production(user: AuthenticatedUser, range: DashboardRange) {
    const [byStatus, overdueSlips, produced, producedPrev, alerts, recentReceipts, toReconcile, byWorker] =
      await Promise.all([
        this.jobSlipModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        this.jobSlipModel
          .find({
            status: { $nin: ['CLOSED', 'CANCELLED'] },
            expectedCompletionDate: { $lt: new Date() },
          })
          .sort({ expectedCompletionDate: 1 })
          .limit(8)
          .lean(),
        this.producedQty(range.from, range.to),
        this.producedQty(range.prevFrom, range.prevTo),
        this.alertsService.listForUser(user),
        this.receiptModel.find({ status: 'CONFIRMED' }).sort({ updatedAt: -1 }).limit(6).lean(),
        this.jobSlipModel.countDocuments({ status: 'RECEIVED' }),
        this.jobSlipModel.aggregate([
          { $match: { status: { $in: ['CREATED', ...OPEN_JOB_STATUSES] } } },
          { $group: { _id: '$jobWorkerId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 6 },
        ]),
      ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count])) as Record<
      string,
      number
    >;
    const [workers, slips, designs] = await Promise.all([
      this.labels.resolve('jobWorker', [
        ...overdueSlips.map((s) => String(s.jobWorkerId)),
        ...recentReceipts.map((r) => String(r.jobWorkerId)),
        ...byWorker.map((w) => String(w._id)),
      ]),
      this.labels.resolve(
        'jobSlip',
        recentReceipts.map((r) => String(r.jobSlipId)),
      ),
      this.labels.resolve(
        'design',
        overdueSlips.map((s) => String(s.designId)),
      ),
    ]);
    return {
      range: { from: range.from, to: range.to },
      statusCounts: counts,
      activeJobs: OPEN_JOB_STATUSES.reduce((s, k) => s + (counts[k] ?? 0), 0),
      createdJobs: counts.CREATED ?? 0,
      awaitingReconciliation: toReconcile,
      overdueCount: alerts.items.filter((a) => a.type === 'OVERDUE_JOB').length,
      productionCompleted: produced,
      productionCompletedTrendPct: pctChange(produced, producedPrev),
      shortageAlerts: alerts.items.filter((a) => a.type === 'HIGH_SHORTAGE').slice(0, 5),
      overdueJobs: overdueSlips.map((s) => ({
        id: String(s._id),
        docNo: (s as any).docNo,
        status: s.status,
        jobWorkerName: workers.get(String(s.jobWorkerId)) ?? '',
        designName: designs.get(String(s.designId)) ?? '',
        expectedCompletionDate: s.expectedCompletionDate,
        daysLate: Math.floor(
          (Date.now() - new Date(s.expectedCompletionDate as Date).getTime()) / DAY_MS,
        ),
      })),
      recentReceipts: recentReceipts.map((r) => ({
        id: String(r._id),
        docNo: (r as any).docNo,
        jobSlipNo: slips.get(String(r.jobSlipId)) ?? '',
        jobWorkerName: workers.get(String(r.jobWorkerId)) ?? '',
        qty: roundQty(
          (r.lines ?? []).reduce(
            (s: number, l: any) => s + (l.acceptedQty ?? l.receivedQty ?? 0),
            0,
          ),
        ),
        at: (r as any).confirmedAt ?? (r as any).updatedAt,
      })),
      openJobsByWorker: byWorker.map((w) => ({
        jobWorkerId: String(w._id),
        jobWorkerName: workers.get(String(w._id)) ?? '',
        openJobs: w.count,
      })),
    };
  }

  async packing() {
    const rows = await this.packingService.dashboard({});
    return {
      readyStockTotal: roundQty(rows.reduce((s, r) => s + r.onHand, 0)),
      pendingPackingTotal: roundQty(rows.reduce((s, r) => s + r.pendingQty, 0)),
      packedQtyTotal: roundQty(rows.reduce((s, r) => s + r.packedQty, 0)),
      designWiseStock: rows,
    };
  }

  async sales(user: AuthenticatedUser, range: DashboardRange) {
    const showPayments = can(user, PERMISSIONS.PAYMENT_VIEW);
    const [openOrders, recentSales, customers, availableReadyStock, current, previous, pending, openList] =
      await Promise.all([
        this.salesOrderModel.countDocuments({
          status: { $in: ['CONFIRMED', 'PARTIALLY_INVOICED'] },
        }),
        this.invoiceModel.find({ status: 'CONFIRMED' }).sort({ docDate: -1 }).limit(8).lean(),
        this.customerModel.countDocuments({ isActive: true }),
        this.readyStockTotal(),
        this.invoiceTotals(range.from, range.to),
        this.invoiceTotals(range.prevFrom, range.prevTo),
        showPayments ? this.paymentsService.pendingInvoices() : Promise.resolve([]),
        this.salesOrderModel
          .find({ status: { $in: ['CONFIRMED', 'PARTIALLY_INVOICED', 'DRAFT'] } })
          .sort({ createdAt: -1 })
          .limit(6)
          .lean(),
      ]);
    const custNames = await this.labels.resolve(
      'customer',
      openList.map((o) => String(o.customerId)),
    );
    return {
      range: { from: range.from, to: range.to },
      salesOrdersOpen: openOrders,
      customers,
      availableReadyStock,
      billing: current.total,
      billingTrendPct: pctChange(current.total, previous.total),
      qtySold: current.qty,
      invoiceCount: current.count,
      pendingPaymentsTotal: showPayments
        ? roundMoney(pending.reduce((s, p) => s + p.outstanding, 0))
        : undefined,
      pendingPaymentsCount: showPayments ? pending.length : undefined,
      recentSales: recentSales.map((i) => ({
        id: String(i._id),
        docNo: (i as any).docNo,
        docDate: (i as any).docDate,
        customerName: i.customerNameSnapshot,
        grandTotal: i.grandTotal,
        paymentStatus: i.paymentStatus,
        qty: roundQty((i.lines ?? []).reduce((s: number, l: any) => s + (l.qty ?? 0), 0)),
      })),
      openSalesOrders: openList.map((o) => ({
        id: String(o._id),
        docNo: (o as any).docNo,
        status: o.status,
        customerName: custNames.get(String(o.customerId)) ?? '',
        qty: roundQty((o.lines ?? []).reduce((s: number, l: any) => s + (l.qty ?? 0), 0)),
        qtyInvoiced: roundQty(
          (o.lines ?? []).reduce((s: number, l: any) => s + (l.qtyInvoiced ?? 0), 0),
        ),
      })),
    };
  }

  /** "Own data only" - scoped to one job worker (factory/artisan), served from the portal, never the admin dashboard route. */
  async factoryArtisan(jobWorkerId: string) {
    const jwId = new Types.ObjectId(jobWorkerId);
    const [assignedJobs, pendingJobs, completedJobs, receiptAgg, returnAgg] = await Promise.all([
      this.jobSlipModel.countDocuments({ jobWorkerId: jwId, status: { $ne: 'CANCELLED' } }),
      this.jobSlipModel.countDocuments({ jobWorkerId: jwId, status: { $in: OPEN_JOB_STATUSES } }),
      this.jobSlipModel.countDocuments({ jobWorkerId: jwId, status: 'CLOSED' }),
      this.receiptModel.aggregate([
        { $match: { status: 'CONFIRMED' } },
        {
          $lookup: { from: 'job_slips', localField: 'jobSlipId', foreignField: '_id', as: 'slip' },
        },
        { $unwind: '$slip' },
        { $match: { 'slip.jobWorkerId': jwId } },
        { $unwind: '$lines' },
        {
          $group: {
            _id: null,
            expected: { $sum: '$lines.expectedQty' },
            actual: { $sum: { $ifNull: ['$lines.acceptedQty', '$lines.receivedQty'] } },
          },
        },
      ]),
      this.jobSlipModel.db
        .model('MaterialReturn')
        .aggregate([
          { $match: { jobWorkerId: jwId, status: 'CONFIRMED' } },
          { $unwind: '$lines' },
          { $group: { _id: null, qty: { $sum: '$lines.qtyBase' } } },
        ]),
    ]);

    const materialReceived = await this.jobSlipModel.db
      .model('MaterialIssue')
      .aggregate([
        { $match: { jobWorkerId: jwId, status: 'CONFIRMED' } },
        { $unwind: '$lines' },
        { $group: { _id: null, qty: { $sum: '$lines.qtyBase' } } },
      ]);

    return {
      assignedJobs,
      materialReceived: roundQty(materialReceived[0]?.qty ?? 0),
      pendingJobs,
      completedJobs,
      expectedProduction: roundQty(receiptAgg[0]?.expected ?? 0),
      actualProduction: roundQty(receiptAgg[0]?.actual ?? 0),
      returnedProducts: roundQty(returnAgg[0]?.qty ?? 0),
    };
  }
}

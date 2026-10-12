import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AlertRead, AlertReadDocument } from './alert-read.schema';
import { CompanySettingsService } from '../../master/company-settings.service';
import { CatalogService } from '../../design/catalog/catalog.service';
import { LabelResolverService } from '../label-resolver.service';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PERMISSIONS } from '../../identity/permissions.catalogue';
import { roundMoney, roundQty } from '../../common/utils/decimal';

export type AlertType =
  | 'LOW_RAW_STOCK'
  | 'LOW_READY_STOCK'
  | 'OVERDUE_JOB'
  | 'PENDING_JOB'
  | 'MATERIAL_PENDING_WITH_FACTORY'
  | 'HIGH_SHORTAGE'
  | 'PENDING_PURCHASE_INWARD'
  | 'PENDING_SALES_ORDER'
  | 'PAYMENT_OVERDUE'
  | 'FINISHED_GOODS_RECEIVED'
  | 'STOCK_DRIFT';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  key: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  ref?: string;
  link?: string;
  occurredAt?: Date | string;
  data?: Record<string, unknown>;
  read?: boolean;
}

/** prd.md §6.3: each alert type is only shown to users who can already see the underlying data. */
const ALERT_PERMISSION: Record<AlertType, string[]> = {
  LOW_RAW_STOCK: [PERMISSIONS.STOCK_VIEW],
  LOW_READY_STOCK: [PERMISSIONS.READYSTOCK_VIEW],
  OVERDUE_JOB: [PERMISSIONS.JOBSLIP_VIEW],
  PENDING_JOB: [PERMISSIONS.JOBSLIP_VIEW],
  MATERIAL_PENDING_WITH_FACTORY: [PERMISSIONS.ISSUE_VIEW, PERMISSIONS.JOBSLIP_VIEW],
  HIGH_SHORTAGE: [PERMISSIONS.SHORTAGE_VIEW],
  PENDING_PURCHASE_INWARD: [PERMISSIONS.PURCHASE_VIEW, PERMISSIONS.INWARD_VIEW],
  PENDING_SALES_ORDER: [PERMISSIONS.SALES_ORDER_VIEW],
  PAYMENT_OVERDUE: [PERMISSIONS.PAYMENT_VIEW],
  FINISHED_GOODS_RECEIVED: [PERMISSIONS.RECEIPT_VIEW, PERMISSIONS.READYSTOCK_VIEW],
  STOCK_DRIFT: [PERMISSIONS.STOCK_LEDGER_VIEW],
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
const DAY_MS = 86_400_000;

export function canSeeAlert(user: AuthenticatedUser, type: AlertType): boolean {
  if (user.isSuperAdmin) return true;
  return ALERT_PERMISSION[type].some((p) => user.permissions.has(p));
}

/** "Net 30", "30 days", "30" -> 30. Anything without a number falls back to the default. */
export function parsePaymentTermsDays(terms: string | undefined | null, fallback: number): number {
  if (!terms) return fallback;
  if (/immediate|advance|cash/i.test(terms)) return 0;
  const m = /(\d{1,3})/.exec(terms);
  return m ? parseInt(m[1], 10) : fallback;
}

function daysBetween(from: Date | string | undefined, now: number): number {
  if (!from) return 0;
  return Math.floor((now - new Date(from).getTime()) / DAY_MS);
}

/**
 * ALT-01 / prd.md §6.3, in-app alerts. Computed on read from live collections (nothing is a
 * separately-maintained counter, so an alert can never outlive the condition that raised it).
 * Thresholds come from company settings (N days, shortage tolerance) and the per-item minimums.
 */
@Injectable()
export class AlertsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(AlertRead.name) private readonly readModel: Model<AlertReadDocument>,
    private readonly companySettings: CompanySettingsService,
    private readonly catalog: CatalogService,
    private readonly labels: LabelResolverService,
  ) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  // ---- individual alert builders ----

  /** Low raw-material stock: warehouse balance across all variants of a material <= its minimum. */
  async lowRawStock(): Promise<Alert[]> {
    const materials = await this.col('materials')
      .find({ isActive: { $ne: false }, minStockQty: { $ne: null, $exists: true } })
      .toArray();
    if (materials.length === 0) return [];
    const materialIds = materials.map((m) => m._id);
    const variants = await this.col('material_variants')
      .find({ materialId: { $in: [...materialIds, ...materialIds.map(String)] } })
      .toArray();
    const items = await this.col('stock_items')
      .find({
        materialVariantId: { $in: [...variants.map((v) => v._id), ...variants.map((v) => String(v._id))] },
      })
      .toArray();
    const materialOfVariant = new Map(variants.map((v) => [String(v._id), String(v.materialId)]));
    const materialOfItem = new Map(
      items.map((i) => [String(i._id), materialOfVariant.get(String(i.materialVariantId))]),
    );
    const balances = await this.col('stock_balances')
      .aggregate([
        {
          $match: {
            stockItemId: { $in: [...items.map((i) => i._id), ...items.map((i) => String(i._id))] },
            qty: { $ne: 0 },
          },
        },
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
        { $group: { _id: '$stockItemId', qty: { $sum: '$qty' } } },
      ])
      .toArray();
    const onHandByMaterial = new Map<string, number>();
    for (const b of balances) {
      const mid = materialOfItem.get(String(b._id));
      if (mid) onHandByMaterial.set(mid, (onHandByMaterial.get(mid) ?? 0) + b.qty);
    }
    const uoms = await this.col('uoms').find({}).toArray();
    const uomCode = new Map(uoms.map((u) => [String(u._id), u.code ?? u.name ?? '']));

    const out: Alert[] = [];
    for (const m of materials) {
      const onHand = roundQty(onHandByMaterial.get(String(m._id)) ?? 0);
      const min = Number(m.minStockQty);
      if (!(onHand <= min)) continue;
      const unit = uomCode.get(String(m.baseUomId)) ?? '';
      out.push({
        key: `LOW_RAW_STOCK:${m._id}:${onHand}`,
        type: 'LOW_RAW_STOCK',
        severity: onHand <= 0 ? 'critical' : 'warning',
        title: onHand <= 0 ? 'Out of stock' : 'Low stock',
        message: `${m.name}: ${onHand} ${unit} on hand (minimum ${min} ${unit}).`.replace(/ {2,}/g, ' '),
        entityType: 'Material',
        entityId: String(m._id),
        ref: m.name,
        link: '/inventory/stock',
        data: { onHand, minStockQty: min, unit },
      });
    }
    return out;
  }

  /** Low ready stock: sellable balance of a catalog entry's linked design <= its minimum. */
  async lowReadyStock(): Promise<Alert[]> {
    const entries = await this.catalog.listForAlerts();
    if (entries.length === 0) return [];
    const onHand = await this.catalog.readyOnHandByDesign(
      entries.map((e) => new Types.ObjectId(String(e.designId))),
    );
    const out: Alert[] = [];
    for (const e of entries) {
      const qty = onHand.get(String(e.designId)) ?? 0;
      if (e.minStockQty == null || qty > e.minStockQty) continue;
      out.push({
        key: `LOW_READY_STOCK:${e._id}:${qty}`,
        type: 'LOW_READY_STOCK',
        severity: qty <= 0 ? 'critical' : 'warning',
        title: 'Low ready stock',
        message: `${e.designNameOrNumber}: ${qty} pcs ready (minimum ${e.minStockQty}).`,
        entityType: 'CatalogItem',
        entityId: String(e._id),
        ref: e.designNameOrNumber,
        link: '/ready-stock',
        data: { onHand: qty, minStockQty: e.minStockQty },
      });
    }
    return out;
  }

  /** Overdue jobs (expected completion passed, not closed) and pending jobs (open > N days). */
  async jobAlerts(pendingDays: number, now: number): Promise<Alert[]> {
    const open = await this.col('job_slips')
      .find({ status: { $nin: ['CLOSED', 'CANCELLED'] } })
      .toArray();
    const workers = await this.labels.resolve(
      'jobWorker',
      open.map((s) => String(s.jobWorkerId)),
    );
    const out: Alert[] = [];
    for (const s of open) {
      const worker = workers.get(String(s.jobWorkerId)) ?? 'job worker';
      if (s.expectedCompletionDate && new Date(s.expectedCompletionDate).getTime() < now) {
        const late = daysBetween(s.expectedCompletionDate, now);
        out.push({
          key: `OVERDUE_JOB:${s._id}:${s.status}`,
          type: 'OVERDUE_JOB',
          severity: 'critical',
          title: 'Overdue job',
          message: `${s.docNo} with ${worker} is ${late} day(s) past its expected completion (${s.status}).`,
          entityType: 'JobSlip',
          entityId: String(s._id),
          ref: s.docNo,
          link: `/production/job-slips/${s._id}`,
          occurredAt: s.expectedCompletionDate,
          data: { daysLate: late, status: s.status },
        });
        continue;
      }
      const age = daysBetween(s.docDate ?? s.createdAt, now);
      if (age > pendingDays) {
        out.push({
          key: `PENDING_JOB:${s._id}:${s.status}`,
          type: 'PENDING_JOB',
          severity: 'warning',
          title: 'Pending factory job',
          message: `${s.docNo} with ${worker} has been open for ${age} days (${s.status}).`,
          entityType: 'JobSlip',
          entityId: String(s._id),
          ref: s.docNo,
          link: `/production/job-slips/${s._id}`,
          occurredAt: s.docDate ?? s.createdAt,
          data: { ageDays: age, status: s.status },
        });
      }
    }
    return out;
  }

  /** Material pending with a factory: custody balance > 0 on a job whose issue is older than N days. */
  async materialPending(days: number, now: number): Promise<Alert[]> {
    const cutoff = new Date(now - days * DAY_MS);
    const lines = await this.col('job_material_lines')
      .find({ createdAt: { $lt: cutoff } })
      .toArray();
    const byJob = new Map<string, { qty: number; oldest: Date; jobWorkerId: string }>();
    for (const l of lines) {
      const remaining = roundQty(
        (l.qtyIssued ?? 0) - (l.qtyReturned ?? 0) - (l.qtyConsumed ?? 0) - (l.qtyWrittenOff ?? 0),
      );
      if (remaining <= 0.0005) continue;
      const key = String(l.jobSlipId);
      const entry = byJob.get(key) ?? {
        qty: 0,
        oldest: l.createdAt,
        jobWorkerId: String(l.jobWorkerId),
      };
      entry.qty = roundQty(entry.qty + remaining);
      if (l.createdAt < entry.oldest) entry.oldest = l.createdAt;
      byJob.set(key, entry);
    }
    if (byJob.size === 0) return [];
    const [slips, workers] = await Promise.all([
      this.labels.resolve('jobSlip', byJob.keys()),
      this.labels.resolve(
        'jobWorker',
        Array.from(byJob.values()).map((v) => v.jobWorkerId),
      ),
    ]);
    return Array.from(byJob.entries()).map(([jobSlipId, v]) => {
      const age = daysBetween(v.oldest, now);
      return {
        key: `MATERIAL_PENDING_WITH_FACTORY:${jobSlipId}:${v.qty}`,
        type: 'MATERIAL_PENDING_WITH_FACTORY' as const,
        severity: 'warning' as const,
        title: 'Material pending with factory',
        message: `${v.qty} units issued on ${slips.get(jobSlipId) ?? 'a job'} are still with ${workers.get(v.jobWorkerId) ?? 'the job worker'} after ${age} days.`,
        entityType: 'JobSlip',
        entityId: jobSlipId,
        ref: slips.get(jobSlipId),
        link: `/production/job-slips/${jobSlipId}`,
        occurredAt: v.oldest,
        data: { qty: v.qty, ageDays: age },
      };
    });
  }

  /**
   * High shortage %: only meaningful once goods have come back (shortage = issued - returned -
   * consumed, so before any receipt it would read 100%). Restricted to jobs in RECEIVED/CLOSED,
   * and only when a tolerance is configured (SHR-03).
   */
  async highShortage(tolerancePct: number): Promise<Alert[]> {
    if (!(tolerancePct > 0)) return [];
    const slips = await this.col('job_slips')
      .find({ status: { $in: ['RECEIVED', 'CLOSED'] } })
      .project({ _id: 1, docNo: 1, jobWorkerId: 1, updatedAt: 1 })
      .toArray();
    if (slips.length === 0) return [];
    const lines = await this.col('job_material_lines')
      .find({ jobSlipId: { $in: slips.map((s) => s._id) } })
      .toArray();
    const worst = new Map<string, { pct: number; shortage: number; stockItemId: string }>();
    for (const l of lines) {
      if (!(l.qtyIssued > 0)) continue;
      const shortage = roundQty(l.qtyIssued - (l.qtyReturned ?? 0) - (l.qtyConsumed ?? 0));
      const pct = roundQty((shortage / l.qtyIssued) * 100);
      if (pct <= tolerancePct) continue;
      const key = String(l.jobSlipId);
      if (!worst.has(key) || worst.get(key)!.pct < pct) {
        worst.set(key, { pct, shortage, stockItemId: String(l.stockItemId) });
      }
    }
    if (worst.size === 0) return [];
    const items = await this.labels.resolve(
      'stockItem',
      Array.from(worst.values()).map((w) => w.stockItemId),
    );
    const slipById = new Map(slips.map((s) => [String(s._id), s]));
    return Array.from(worst.entries()).map(([id, w]) => ({
      key: `HIGH_SHORTAGE:${id}:${w.pct}`,
      type: 'HIGH_SHORTAGE' as const,
      severity: 'critical' as const,
      title: 'High shortage',
      message: `${slipById.get(id)?.docNo ?? 'Job'}: ${items.get(w.stockItemId) ?? 'material'} short by ${w.pct}% (tolerance ${tolerancePct}%).`,
      entityType: 'JobSlip',
      entityId: id,
      ref: slipById.get(id)?.docNo,
      link: `/production/job-slips/${id}`,
      occurredAt: slipById.get(id)?.updatedAt,
      data: { shortagePct: w.pct, shortageQty: w.shortage, tolerancePct },
    }));
  }

  async pendingInward(days: number, now: number): Promise<Alert[]> {
    const cutoff = new Date(now - days * DAY_MS);
    const purchases = await this.col('purchases')
      .find({ status: { $in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] }, docDate: { $lt: cutoff } })
      .toArray();
    const suppliers = await this.labels.resolve(
      'supplier',
      purchases.map((p) => String(p.supplierId)),
    );
    return purchases.map((p) => {
      const age = daysBetween(p.docDate, now);
      return {
        key: `PENDING_PURCHASE_INWARD:${p._id}:${p.status}`,
        type: 'PENDING_PURCHASE_INWARD' as const,
        severity: 'warning' as const,
        title: 'Pending purchase inward',
        message: `${p.docNo} from ${suppliers.get(String(p.supplierId)) ?? 'supplier'} is ${p.status === 'PARTIALLY_RECEIVED' ? 'only partly received' : 'not received'} after ${age} days.`,
        entityType: 'Purchase',
        entityId: String(p._id),
        ref: p.docNo,
        link: `/procurement/purchases/${p._id}`,
        occurredAt: p.docDate,
        data: { ageDays: age, status: p.status },
      };
    });
  }

  async pendingSalesOrders(days: number, now: number): Promise<Alert[]> {
    const cutoff = new Date(now - days * DAY_MS);
    const orders = await this.col('sales_orders')
      .find({ status: { $in: ['CONFIRMED', 'PARTIALLY_INVOICED'] }, docDate: { $lt: cutoff } })
      .toArray();
    const customers = await this.labels.resolve(
      'customer',
      orders.map((o) => String(o.customerId)),
    );
    return orders.map((o) => {
      const age = daysBetween(o.docDate, now);
      return {
        key: `PENDING_SALES_ORDER:${o._id}:${o.status}`,
        type: 'PENDING_SALES_ORDER' as const,
        severity: 'warning' as const,
        title: 'Pending sales order',
        message: `${o.docNo} for ${customers.get(String(o.customerId)) ?? 'customer'} is ${o.status === 'PARTIALLY_INVOICED' ? 'partly' : 'not'} invoiced after ${age} days.`,
        entityType: 'SalesOrder',
        entityId: String(o._id),
        ref: o.docNo,
        link: `/sales/orders/${o._id}`,
        occurredAt: o.docDate,
        data: { ageDays: age, status: o.status },
      };
    });
  }

  /** Payment pending: invoice unpaid past the customer's payment terms. */
  async paymentOverdue(defaultTermsDays: number, now: number): Promise<Alert[]> {
    const invoices = await this.col('invoices')
      .find({ status: 'CONFIRMED', paymentStatus: { $ne: 'PAID' } })
      .toArray();
    if (invoices.length === 0) return [];
    const [allocations, customers] = await Promise.all([
      this.col('payment_allocations')
        .find({ invoiceId: { $in: invoices.map((i) => i._id) } })
        .toArray(),
      this.col('customers')
        .find({ _id: { $in: invoices.map((i) => i.customerId) } })
        .toArray(),
    ]);
    const paid = new Map<string, number>();
    for (const a of allocations) {
      const k = String(a.invoiceId);
      paid.set(k, (paid.get(k) ?? 0) + (a.amount ?? 0));
    }
    const customerById = new Map(customers.map((c) => [String(c._id), c]));
    const out: Alert[] = [];
    for (const inv of invoices) {
      const customer = customerById.get(String(inv.customerId));
      const terms = parsePaymentTermsDays(customer?.paymentTerms, defaultTermsDays);
      const dueAt = new Date(inv.docDate).getTime() + terms * DAY_MS;
      if (dueAt >= now) continue;
      const outstanding = roundMoney((inv.grandTotal ?? 0) - (paid.get(String(inv._id)) ?? 0));
      if (outstanding <= 0.005) continue;
      const overdueDays = Math.floor((now - dueAt) / DAY_MS);
      out.push({
        key: `PAYMENT_OVERDUE:${inv._id}:${outstanding}`,
        type: 'PAYMENT_OVERDUE',
        severity: overdueDays > 30 ? 'critical' : 'warning',
        title: 'Payment overdue',
        message: `${inv.docNo} - ${customer?.businessName || customer?.name || inv.customerNameSnapshot}: Rs ${outstanding.toLocaleString('en-IN')} outstanding, ${overdueDays} day(s) past ${terms}-day terms.`,
        entityType: 'Invoice',
        entityId: String(inv._id),
        ref: inv.docNo,
        link: `/sales/invoices/${inv._id}`,
        occurredAt: new Date(dueAt),
        data: { outstanding, overdueDays, termsDays: terms },
      });
    }
    return out;
  }

  /** Informational: finished goods receipts confirmed in the last 3 days. */
  async finishedGoodsReceived(now: number): Promise<Alert[]> {
    const since = new Date(now - 3 * DAY_MS);
    const receipts = await this.col('job_receipts')
      .find({
        status: 'CONFIRMED',
        $or: [{ confirmedAt: { $gte: since } }, { confirmedAt: null, updatedAt: { $gte: since } }],
      })
      .sort({ updatedAt: -1 })
      .limit(20)
      .toArray();
    const [slips, workers] = await Promise.all([
      this.labels.resolve('jobSlip', receipts.map((r) => String(r.jobSlipId))),
      this.labels.resolve('jobWorker', receipts.map((r) => String(r.jobWorkerId))),
    ]);
    return receipts.map((r) => {
      const qty = roundQty(
        (r.lines ?? []).reduce(
          (s: number, l: any) => s + (l.acceptedQty ?? l.receivedQty ?? 0),
          0,
        ),
      );
      return {
        key: `FINISHED_GOODS_RECEIVED:${r._id}`,
        type: 'FINISHED_GOODS_RECEIVED' as const,
        severity: 'info' as const,
        title: 'Finished goods received',
        message: `${r.docNo}: ${qty} pcs received from ${workers.get(String(r.jobWorkerId)) ?? 'job worker'} against ${slips.get(String(r.jobSlipId)) ?? 'job'}.`,
        entityType: 'JobReceipt',
        entityId: String(r._id),
        ref: r.docNo,
        link: '/production/receiving',
        occurredAt: r.confirmedAt ?? r.updatedAt,
        data: { qty },
      };
    });
  }

  /** NFR-11 / STK-10: the latest nightly reconciliation found ledger vs balance drift. */
  async stockDrift(): Promise<Alert[]> {
    const [latest] = await this.col('recon_runs').find({}).sort({ createdAt: -1 }).limit(1).toArray();
    if (!latest || latest.clean) return [];
    return [
      {
        key: `STOCK_DRIFT:${latest._id}`,
        type: 'STOCK_DRIFT',
        severity: 'critical',
        title: 'Stock reconciliation drift',
        message: `The stock reconciliation run on ${new Date(latest.createdAt).toLocaleDateString('en-IN')} found ${latest.differences?.length ?? 0} ledger/balance difference(s) across ${latest.itemsChecked} checked rows.`,
        entityType: 'ReconRun',
        entityId: String(latest._id),
        link: '/inventory/ledger',
        occurredAt: latest.createdAt,
        data: { differences: (latest.differences ?? []).slice(0, 20) },
      },
    ];
  }

  // ---- aggregate ----

  /** Every alert this user may see, most severe first, with per-user read state. */
  async listForUser(user: AuthenticatedUser): Promise<{ items: Alert[]; unreadCount: number; total: number }> {
    const settings: any = (await this.companySettings.get()) ?? {};
    const now = Date.now();
    const tasks: Array<[AlertType[], () => Promise<Alert[]>]> = [
      [['LOW_RAW_STOCK'], () => this.lowRawStock()],
      [['LOW_READY_STOCK'], () => this.lowReadyStock()],
      [['OVERDUE_JOB', 'PENDING_JOB'], () => this.jobAlerts(settings.pendingJobAlertDays ?? 14, now)],
      [
        ['MATERIAL_PENDING_WITH_FACTORY'],
        () => this.materialPending(settings.materialPendingAlertDays ?? 30, now),
      ],
      [['HIGH_SHORTAGE'], () => this.highShortage(settings.shortageTolerancePct ?? 0)],
      [
        ['PENDING_PURCHASE_INWARD'],
        () => this.pendingInward(settings.pendingInwardAlertDays ?? 7, now),
      ],
      [
        ['PENDING_SALES_ORDER'],
        () => this.pendingSalesOrders(settings.pendingSalesOrderAlertDays ?? 7, now),
      ],
      [['PAYMENT_OVERDUE'], () => this.paymentOverdue(settings.defaultPaymentTermsDays ?? 30, now)],
      [['FINISHED_GOODS_RECEIVED'], () => this.finishedGoodsReceived(now)],
      [['STOCK_DRIFT'], () => this.stockDrift()],
    ];
    const visible = tasks.filter(([types]) => types.some((t) => canSeeAlert(user, t)));
    const results = await Promise.all(visible.map(([, fn]) => fn()));
    const items = results.flat().filter((a) => canSeeAlert(user, a.type));

    const reads = await this.readModel
      .find({ userId: new Types.ObjectId(user.id), alertKey: { $in: items.map((a) => a.key) } })
      .lean();
    const readKeys = new Set(reads.map((r) => r.alertKey));
    for (const a of items) a.read = readKeys.has(a.key);

    items.sort(
      (a, b) =>
        Number(a.read) - Number(b.read) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        new Date(b.occurredAt ?? 0).getTime() - new Date(a.occurredAt ?? 0).getTime(),
    );
    const unreadCount = items.filter((a) => !a.read).length;
    return { items, unreadCount, total: items.length };
  }

  async markRead(user: AuthenticatedUser, keys: string[]) {
    const unique = Array.from(new Set(keys.filter((k) => typeof k === 'string' && k.length < 300)));
    if (unique.length === 0) return { ok: true, marked: 0 };
    await this.readModel.bulkWrite(
      unique.map((alertKey) => ({
        updateOne: {
          filter: { userId: new Types.ObjectId(user.id), alertKey },
          update: { $setOnInsert: { userId: new Types.ObjectId(user.id), alertKey } },
          upsert: true,
        },
      })),
    );
    return { ok: true, marked: unique.length };
  }

  async markAllRead(user: AuthenticatedUser) {
    const { items } = await this.listForUser(user);
    return this.markRead(
      user,
      items.filter((a) => !a.read).map((a) => a.key),
    );
  }
}

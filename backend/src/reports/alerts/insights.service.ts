import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PERMISSIONS } from '../../identity/permissions.catalogue';
import { LabelResolverService } from '../label-resolver.service';
import { AlertsService } from './alerts.service';
import { roundMoney, roundQty } from '../../common/utils/decimal';

export interface Insight {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  icon: 'trend' | 'alert' | 'users' | 'factory' | 'stock';
  text: string;
  link?: string;
}

const DAY_MS = 86_400_000;

function can(user: AuthenticatedUser, ...perms: string[]) {
  return user.isSuperAdmin || perms.some((p) => user.permissions.has(p));
}

/**
 * "Smart Insights" panel. Rule-based and computed from the business's own data on every
 * request - no external model is called and no sentence is hard-coded; an insight only
 * appears when the data supports it. Each insight is gated by the permission that already
 * guards its underlying data (amounts only for users who may see amounts).
 */
@Injectable()
export class InsightsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly labels: LabelResolverService,
    private readonly alerts: AlertsService,
  ) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  private async designOfVariants(variantIds: string[]) {
    const variants = await this.col('design_variants')
      .find({
        _id: { $in: variantIds.filter((v) => Types.ObjectId.isValid(v)).map((v) => new Types.ObjectId(v)) },
      })
      .toArray();
    return new Map(variants.map((v) => [String(v._id), String(v.designId)]));
  }

  /** Best-selling design by quantity over the last 30 days, plus revenue trend vs the previous 30. */
  private async salesInsights(user: AuthenticatedUser, now: number): Promise<Insight[]> {
    const since = new Date(now - 60 * DAY_MS);
    const invoices = await this.col('invoices')
      .find({ status: 'CONFIRMED', docDate: { $gte: since } })
      .toArray();
    if (invoices.length === 0) return [];
    const cut = now - 30 * DAY_MS;
    const recent = invoices.filter((i) => new Date(i.docDate).getTime() >= cut);
    const previous = invoices.filter((i) => new Date(i.docDate).getTime() < cut);
    const out: Insight[] = [];

    const qtyByVariant = new Map<string, number>();
    for (const inv of recent) {
      for (const l of inv.lines ?? []) {
        const k = String(l.designVariantId);
        qtyByVariant.set(k, (qtyByVariant.get(k) ?? 0) + (l.qty ?? 0));
      }
    }
    if (qtyByVariant.size > 0) {
      const designOf = await this.designOfVariants(Array.from(qtyByVariant.keys()));
      const qtyByDesign = new Map<string, number>();
      for (const [v, q] of qtyByVariant) {
        const d = designOf.get(v);
        if (d) qtyByDesign.set(d, (qtyByDesign.get(d) ?? 0) + q);
      }
      const ranked = Array.from(qtyByDesign.entries()).sort((a, b) => b[1] - a[1]);
      if (ranked.length > 0) {
        const names = await this.labels.resolve('design', [ranked[0][0]]);
        const total = Array.from(qtyByDesign.values()).reduce((s, q) => s + q, 0);
        const share = total > 0 ? Math.round((ranked[0][1] / total) * 100) : 0;
        out.push({
          id: 'top-design-30d',
          tone: 'positive',
          icon: 'trend',
          text: `Best seller in the last 30 days: ${names.get(ranked[0][0]) ?? 'a design'} with ${roundQty(ranked[0][1])} pcs invoiced (${share}% of all pieces sold). Keep it in stock.`,
          link: '/ready-stock',
        });
      }
    }

    if (can(user, PERMISSIONS.PAYMENT_VIEW) && previous.length > 0) {
      const sum = (rows: any[]) => rows.reduce((s, i) => s + (i.grandTotal ?? 0), 0);
      const r = sum(recent);
      const p = sum(previous);
      if (p > 0) {
        const pct = Math.round(((r - p) / p) * 100);
        out.push({
          id: 'revenue-trend',
          tone: pct >= 0 ? 'positive' : 'warning',
          icon: 'trend',
          text: `Billing over the last 30 days is Rs ${roundMoney(r).toLocaleString('en-IN')}, ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}% on the 30 days before (Rs ${roundMoney(p).toLocaleString('en-IN')}).`,
          link: '/reports',
        });
      }
    }
    return out;
  }

  /** Designs with ready stock on hand but no invoice in 60 days - candidates for promotion. */
  private async slowMovers(now: number): Promise<Insight[]> {
    const stock = await this.col('stock_balances')
      .aggregate([
        { $match: { qty: { $gt: 0 } } },
        { $lookup: { from: 'stock_locations', localField: 'locationId', foreignField: '_id', as: 'loc' } },
        { $unwind: '$loc' },
        { $match: { 'loc.kind': 'WAREHOUSE' } },
        { $lookup: { from: 'stock_items', localField: 'stockItemId', foreignField: '_id', as: 'item' } },
        { $unwind: '$item' },
        { $match: { 'item.kind': 'FINISHED_GOOD' } },
        { $lookup: { from: 'design_variants', localField: 'item.designVariantId', foreignField: '_id', as: 'v' } },
        { $unwind: '$v' },
        { $group: { _id: '$v.designId', qty: { $sum: '$qty' } } },
      ])
      .toArray();
    if (stock.length === 0) return [];
    const since = new Date(now - 60 * DAY_MS);
    const soldVariants = await this.col('invoices').distinct('lines.designVariantId', {
      status: 'CONFIRMED',
      docDate: { $gte: since },
    });
    const designOf = await this.designOfVariants(soldVariants.map(String));
    const soldDesigns = new Set(designOf.values());
    const idle = stock.filter((s) => !soldDesigns.has(String(s._id))).sort((a, b) => b.qty - a.qty);
    if (idle.length === 0) return [];
    const names = await this.labels.resolve('design', idle.slice(0, 3).map((s) => String(s._id)));
    const list = idle
      .slice(0, 3)
      .map((s) => `${names.get(String(s._id)) ?? 'design'} (${roundQty(s.qty)} pcs)`)
      .join(', ');
    return [
      {
        id: 'slow-movers',
        tone: 'warning',
        icon: 'stock',
        text: `${idle.length} design${idle.length > 1 ? 's have' : ' has'} ready stock but no sale in 60 days: ${list}. Consider featuring them or pausing production.`,
        link: '/ready-stock',
      },
    ];
  }

  /** Job worker with the worst average shortage % on returned jobs. */
  private async shortageByWorker(): Promise<Insight[]> {
    const slips = await this.col('job_slips')
      .find({ status: { $in: ['RECEIVED', 'CLOSED'] } })
      .project({ _id: 1, jobWorkerId: 1 })
      .toArray();
    if (slips.length === 0) return [];
    const lines = await this.col('job_material_lines')
      .find({ jobSlipId: { $in: slips.map((s) => s._id) }, qtyIssued: { $gt: 0 } })
      .toArray();
    const agg = new Map<string, { issued: number; short: number; jobs: Set<string> }>();
    for (const l of lines) {
      const k = String(l.jobWorkerId);
      const e = agg.get(k) ?? { issued: 0, short: 0, jobs: new Set<string>() };
      e.issued += l.qtyIssued;
      e.short += Math.max(0, l.qtyIssued - (l.qtyReturned ?? 0) - (l.qtyConsumed ?? 0));
      e.jobs.add(String(l.jobSlipId));
      agg.set(k, e);
    }
    const ranked = Array.from(agg.entries())
      .map(([id, e]) => ({ id, pct: e.issued > 0 ? (e.short / e.issued) * 100 : 0, jobs: e.jobs.size }))
      .filter((r) => r.pct > 0.05)
      .sort((a, b) => b.pct - a.pct);
    if (ranked.length === 0) return [];
    const names = await this.labels.resolve('jobWorker', [ranked[0].id]);
    return [
      {
        id: 'shortage-worker',
        tone: 'warning',
        icon: 'factory',
        text: `${names.get(ranked[0].id) ?? 'A job worker'} has the highest material shortage: ${roundQty(ranked[0].pct)}% of issued material unaccounted for across ${ranked[0].jobs} returned job${ranked[0].jobs > 1 ? 's' : ''}.`,
        link: '/reports',
      },
    ];
  }

  /** On-time delivery rate of closed/received jobs that had an expected completion date. */
  private async onTimeRate(): Promise<Insight[]> {
    const slips = await this.col('job_slips')
      .find({ status: { $in: ['RECEIVED', 'CLOSED'] }, expectedCompletionDate: { $ne: null } })
      .toArray();
    if (slips.length < 2) return [];
    const onTime = slips.filter(
      (s) =>
        new Date(s.closedAt ?? s.updatedAt).getTime() <=
        new Date(s.expectedCompletionDate).getTime() + DAY_MS,
    ).length;
    const pct = Math.round((onTime / slips.length) * 100);
    return [
      {
        id: 'on-time-rate',
        tone: pct >= 80 ? 'positive' : 'warning',
        icon: 'factory',
        text: `${pct}% of completed jobs (${onTime} of ${slips.length}) came back by their expected date.`,
        link: '/production/job-slips',
      },
    ];
  }

  /** Largest outstanding receivable. */
  private async receivables(): Promise<Insight[]> {
    const invoices = await this.col('invoices')
      .find({ status: 'CONFIRMED', paymentStatus: { $ne: 'PAID' } })
      .toArray();
    if (invoices.length === 0) return [];
    const allocations = await this.col('payment_allocations')
      .find({ invoiceId: { $in: invoices.map((i) => i._id) } })
      .toArray();
    const paid = new Map<string, number>();
    for (const a of allocations) paid.set(String(a.invoiceId), (paid.get(String(a.invoiceId)) ?? 0) + a.amount);
    const byCustomer = new Map<string, number>();
    let total = 0;
    for (const i of invoices) {
      const o = (i.grandTotal ?? 0) - (paid.get(String(i._id)) ?? 0);
      if (o <= 0.005) continue;
      total += o;
      byCustomer.set(String(i.customerId), (byCustomer.get(String(i.customerId)) ?? 0) + o);
    }
    if (total <= 0) return [];
    const [top] = Array.from(byCustomer.entries()).sort((a, b) => b[1] - a[1]);
    const names = await this.labels.resolve('customer', [top[0]]);
    const share = Math.round((top[1] / total) * 100);
    return [
      {
        id: 'top-receivable',
        tone: share >= 50 ? 'warning' : 'neutral',
        icon: 'users',
        text: `Rs ${roundMoney(total).toLocaleString('en-IN')} is outstanding across ${byCustomer.size} customer${byCustomer.size > 1 ? 's' : ''}; ${names.get(top[0]) ?? 'one customer'} alone owes Rs ${roundMoney(top[1]).toLocaleString('en-IN')} (${share}%).`,
        link: '/sales/payments',
      },
    ];
  }

  /** Summary of open alerts so the panel never contradicts the bell. */
  private async alertSummary(user: AuthenticatedUser): Promise<Insight[]> {
    const { items } = await this.alerts.listForUser(user);
    const lowRaw = items.filter((a) => a.type === 'LOW_RAW_STOCK');
    const overdue = items.filter((a) => a.type === 'OVERDUE_JOB');
    const out: Insight[] = [];
    if (lowRaw.length > 0) {
      out.push({
        id: 'low-raw',
        tone: 'warning',
        icon: 'alert',
        text: `${lowRaw.length} material${lowRaw.length > 1 ? 's are' : ' is'} at or below minimum stock: ${lowRaw.slice(0, 3).map((a) => a.ref).join(', ')}${lowRaw.length > 3 ? '…' : ''}. Plan purchases before issuing new jobs.`,
        link: '/inventory/stock',
      });
    }
    if (overdue.length > 0) {
      out.push({
        id: 'overdue-jobs',
        tone: 'warning',
        icon: 'factory',
        text: `${overdue.length} job slip${overdue.length > 1 ? 's are' : ' is'} past the expected completion date: ${overdue.slice(0, 3).map((a) => a.ref).join(', ')}${overdue.length > 3 ? '…' : ''}.`,
        link: '/production/job-slips',
      });
    }
    return out;
  }

  async forUser(user: AuthenticatedUser): Promise<Insight[]> {
    const now = Date.now();
    const tasks: Array<Promise<Insight[]>> = [this.alertSummary(user)];
    if (can(user, PERMISSIONS.SALES_INVOICE_VIEW)) tasks.push(this.salesInsights(user, now));
    if (can(user, PERMISSIONS.READYSTOCK_VIEW)) tasks.push(this.slowMovers(now));
    if (can(user, PERMISSIONS.SHORTAGE_VIEW)) tasks.push(this.shortageByWorker());
    if (can(user, PERMISSIONS.JOBSLIP_VIEW)) tasks.push(this.onTimeRate());
    if (can(user, PERMISSIONS.PAYMENT_VIEW)) tasks.push(this.receivables());
    const results = await Promise.all(tasks);
    return results.flat();
  }
}

import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { LabelResolverService } from './label-resolver.service';
import { ProblemException } from '../common/errors/problem.exception';
import { roundQty } from '../common/utils/decimal';

export type TraceIcon = 'purchase' | 'inward' | 'stock' | 'design' | 'job' | 'receive' | 'sale';

export interface TraceNode {
  key: string;
  stage: string;
  refNo: string;
  status?: string;
  date: string;
  details: string;
  icon: TraceIcon;
  entityType: string;
  entityId: string;
  link?: string;
}

export interface TraceResult {
  query: string;
  matchedType: string;
  matchedId: string;
  summary: string;
  nodes: TraceNode[];
}

const STAGE_RANK: Record<string, number> = {
  Purchase: 0,
  Inward: 1,
  'Raw material lot': 2,
  Design: 3,
  'Job slip': 4,
  'Material issue': 5,
  'Finished goods receipt': 6,
  'Finished goods lot': 7,
  'Sales order': 8,
  Invoice: 9,
};

function fmtDate(d: unknown): string {
  if (!d) return '';
  const date = new Date(d as string);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
}

function oid(id: unknown): Types.ObjectId | null {
  if (!id) return null;
  const s = String(id);
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}

/** Matches a reference stored either as an ObjectId or as its string form (both exist in the data). */
function either(id: unknown): { $in: unknown[] } {
  return { $in: [id, String(id)] };
}

function eitherMany(ids: unknown[]): { $in: unknown[] } {
  return { $in: [...ids, ...ids.map(String)] };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * TRC-01 / TRC-03 search: from any reference (invoice, sales order, job slip, lot, purchase,
 * inward, design number) build the full lot/job-level chain - backward to job slip, factory,
 * issued material lots, inward, purchase and supplier, and forward to the finished lots and
 * invoices that came out of it. Fixed-depth walks over the existing links (tech.md §8.5);
 * read-only. Costs are never included here (the invoice-line trace endpoint carries them under
 * costing.view).
 */
@Injectable()
export class TraceSearchService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly labels: LabelResolverService,
  ) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  async search(rawQuery: string): Promise<TraceResult> {
    const query = (rawQuery ?? '').trim();
    if (!query) throw new ProblemException('VALIDATION_FAILED', 422, 'Enter a reference to trace.');
    const builder = new TraceBuilder(this.connection, this.labels);
    const exact = { $regex: `^${escapeRegex(query)}$`, $options: 'i' };
    const byId = oid(query);

    const find = async (collection: string, field: string) =>
      (await this.col(collection).findOne({ [field]: exact })) ??
      (byId ? await this.col(collection).findOne({ _id: byId }) : null);

    let matchedType = '';
    let matchedId = '';
    let summary = '';

    const invoice = await find('invoices', 'docNo');
    if (invoice) {
      matchedType = 'Invoice';
      matchedId = String(invoice._id);
      await builder.invoice(invoice);
      summary = `Invoice ${invoice.docNo} to ${invoice.customerNameSnapshot ?? 'customer'}`;
    }
    if (!matchedType) {
      const so = await find('sales_orders', 'docNo');
      if (so) {
        matchedType = 'SalesOrder';
        matchedId = String(so._id);
        await builder.salesOrder(so);
        summary = `Sales order ${so.docNo}`;
      }
    }
    if (!matchedType) {
      const slip = await find('job_slips', 'docNo');
      if (slip) {
        matchedType = 'JobSlip';
        matchedId = String(slip._id);
        await builder.jobSlip(slip, { forward: true });
        summary = `Job slip ${slip.docNo}`;
      }
    }
    if (!matchedType) {
      const lot = await find('stock_lots', 'lotNo');
      if (lot) {
        matchedType = 'StockLot';
        matchedId = String(lot._id);
        await builder.lot(lot, { forward: true });
        summary = `Lot ${lot.lotNo}`;
      }
    }
    if (!matchedType) {
      const purchase = await find('purchases', 'docNo');
      if (purchase) {
        matchedType = 'Purchase';
        matchedId = String(purchase._id);
        await builder.purchase(purchase, { forward: true });
        summary = `Purchase ${purchase.docNo}`;
      }
    }
    if (!matchedType) {
      const inward = await find('inwards', 'docNo');
      if (inward) {
        matchedType = 'Inward';
        matchedId = String(inward._id);
        await builder.inward(inward, { forward: true });
        summary = `Inward ${inward.docNo}`;
      }
    }
    if (!matchedType) {
      const design = await find('designs', 'designNo');
      if (design) {
        matchedType = 'Design';
        matchedId = String(design._id);
        await builder.design(design, { forward: true });
        summary = `Design ${design.designNo} - ${design.name}`;
      }
    }
    if (!matchedType) {
      throw new ProblemException(
        'NOT_FOUND',
        404,
        `No invoice, sales order, job slip, lot, purchase, inward or design matches "${query}".`,
      );
    }

    const nodes = builder.result();
    const suppliers = new Set(nodes.filter((n) => n.stage === 'Purchase').map((n) => n.details));
    const jobs = nodes.filter((n) => n.stage === 'Job slip').length;
    const invoices = nodes.filter((n) => n.stage === 'Invoice').length;
    summary += ` - ${nodes.length} linked record${nodes.length === 1 ? '' : 's'}`;
    const parts: string[] = [];
    if (suppliers.size) parts.push(`${nodes.filter((n) => n.stage === 'Purchase').length} purchase(s)`);
    if (jobs) parts.push(`${jobs} job slip(s)`);
    if (invoices) parts.push(`${invoices} invoice(s)`);
    if (parts.length) summary += ` (${parts.join(', ')})`;
    summary += '.';
    return { query, matchedType, matchedId, summary, nodes };
  }
}

/** One trace walk. Keeps a visited set so shared lots/jobs appear once and cycles cannot loop. */
class TraceBuilder {
  private readonly nodes = new Map<string, TraceNode & { sortDate: number }>();
  private readonly visited = new Set<string>();

  constructor(
    private readonly connection: Connection,
    private readonly labels: LabelResolverService,
  ) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  private once(key: string): boolean {
    if (this.visited.has(key)) return false;
    this.visited.add(key);
    return true;
  }

  private add(node: Omit<TraceNode, 'key'> & { rawDate?: unknown }) {
    const key = `${node.entityType}:${node.entityId}`;
    if (this.nodes.has(key)) return;
    const { rawDate, ...rest } = node;
    this.nodes.set(key, {
      ...rest,
      key,
      sortDate: rawDate ? new Date(rawDate as string).getTime() || 0 : 0,
    });
  }

  result(): TraceNode[] {
    return Array.from(this.nodes.values())
      .sort(
        (a, b) =>
          (STAGE_RANK[a.stage] ?? 99) - (STAGE_RANK[b.stage] ?? 99) || a.sortDate - b.sortDate,
      )
      .map(({ sortDate: _s, ...n }) => n);
  }

  async purchase(p: any, opts: { forward?: boolean } = {}) {
    if (!p || !this.once(`purchase:${p._id}`)) return;
    const supplier = (await this.labels.resolve('supplier', [String(p.supplierId)])).get(
      String(p.supplierId),
    );
    this.add({
      stage: 'Purchase',
      refNo: p.docNo ?? String(p._id),
      status: p.status,
      date: fmtDate(p.docDate),
      rawDate: p.docDate,
      details: `Supplier: ${supplier ?? 'unknown'} · ${p.lines?.length ?? 0} line(s)${p.supplierInvoiceNo ? ` · supplier bill ${p.supplierInvoiceNo}` : ''}`,
      icon: 'purchase',
      entityType: 'Purchase',
      entityId: String(p._id),
      link: `/procurement/purchases/${p._id}`,
    });
    if (opts.forward) {
      const inwards = await this.col('inwards')
        .find({ purchaseId: either(p._id), status: { $ne: 'CANCELLED' } })
        .toArray();
      for (const i of inwards) await this.inward(i, { forward: true, skipPurchase: true });
    }
  }

  async inward(i: any, opts: { forward?: boolean; skipPurchase?: boolean } = {}) {
    if (!i || !this.once(`inward:${i._id}`)) return;
    const qty = roundQty((i.lines ?? []).reduce((s: number, l: any) => s + (l.qtyBase ?? 0), 0));
    const location = (await this.labels.resolve('location', [String(i.locationId)])).get(
      String(i.locationId),
    );
    this.add({
      stage: 'Inward',
      refNo: i.docNo ?? String(i._id),
      status: i.status,
      date: fmtDate(i.docDate ?? i.createdAt),
      rawDate: i.docDate ?? i.createdAt,
      details: `${qty} received into ${location ?? 'warehouse'} · ${i.lines?.length ?? 0} line(s)`,
      icon: 'inward',
      entityType: 'Inward',
      entityId: String(i._id),
      link: `/procurement/inward/${i._id}`,
    });
    if (!opts.skipPurchase && i.purchaseId) {
      await this.purchase(await this.col('purchases').findOne({ _id: i.purchaseId }));
    }
    if (opts.forward) {
      const lotIds = (i.lines ?? []).map((l: any) => l.createdLotId).filter(Boolean);
      const lots = lotIds.length
        ? await this.col('stock_lots').find({ _id: { $in: lotIds } }).toArray()
        : await this.col('stock_lots').find({ originDocType: 'INWARD', originDocId: either(i._id) }).toArray();
      for (const lot of lots) await this.lot(lot, { forward: true, skipOrigin: true });
    }
  }

  /** Raw or finished lot. Backward: its origin. Forward: what consumed or sold it. */
  async lot(lot: any, opts: { forward?: boolean; skipOrigin?: boolean } = {}) {
    if (!lot || !this.once(`lot:${lot._id}`)) return;
    const item = await this.col('stock_items').findOne({ _id: lot.stockItemId });
    const isFinished = item?.kind === 'FINISHED_GOOD';
    const label = (await this.labels.resolve('stockItem', [String(lot.stockItemId)])).get(
      String(lot.stockItemId),
    );
    const onHand = await this.col('stock_balances')
      .aggregate([
        { $match: { lotId: either(lot._id), qty: { $ne: 0 } } },
        {
          $lookup: {
            from: 'stock_locations',
            localField: 'locationId',
            foreignField: '_id',
            as: 'loc',
          },
        },
        { $unwind: '$loc' },
        // Virtual locations (supplier, customer, production...) carry the mirror-image
        // negative balance of the double-entry ledger; only physical places hold stock.
        { $match: { 'loc.kind': { $in: ['WAREHOUSE', 'FACTORY_CUSTODY', 'QUARANTINE'] } } },
        { $group: { _id: '$loc.kind', qty: { $sum: '$qty' } } },
      ])
      .toArray();
    const qtyAt = (kind: string) => roundQty(onHand.find((r) => r._id === kind)?.qty ?? 0);
    const where = [
      `${qtyAt('WAREHOUSE')} in warehouse`,
      qtyAt('FACTORY_CUSTODY') ? `${qtyAt('FACTORY_CUSTODY')} with factory` : '',
      qtyAt('QUARANTINE') ? `${qtyAt('QUARANTINE')} in quarantine` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    this.add({
      stage: isFinished ? 'Finished goods lot' : 'Raw material lot',
      refNo: lot.lotNo,
      status: where,
      date: fmtDate(lot.receivedOn ?? lot.createdAt),
      rawDate: lot.receivedOn ?? lot.createdAt,
      details: `${label ?? 'Stock item'} · origin ${lot.originDocType}`,
      icon: 'stock',
      entityType: 'StockLot',
      entityId: String(lot._id),
      link: '/inventory/lots',
    });

    if (!opts.skipOrigin) {
      if (lot.originDocType === 'INWARD' && lot.originDocId) {
        await this.inward(await this.col('inwards').findOne({ _id: lot.originDocId }));
      }
      if (lot.originJobSlipId) {
        await this.jobSlip(await this.col('job_slips').findOne({ _id: lot.originJobSlipId }));
      }
    }

    if (opts.forward) {
      if (isFinished) {
        await this.invoicesForLots([lot._id]);
      } else {
        const slipIds = await this.col('job_material_lines').distinct('jobSlipId', {
          lotId: either(lot._id),
        });
        if (slipIds.length) {
          const slips = await this.col('job_slips').find({ _id: { $in: slipIds.map((x) => oid(x)).filter((x): x is Types.ObjectId => !!x) } }).toArray();
          for (const s of slips) await this.jobSlip(s, { forward: true });
        }
      }
    }
  }

  async design(d: any, opts: { forward?: boolean } = {}) {
    if (!d || !this.once(`design:${d._id}`)) return;
    this.add({
      stage: 'Design',
      refNo: d.designNo,
      status: d.isActive === false ? 'Inactive' : 'Active',
      date: fmtDate(d.createdAt),
      rawDate: d.createdAt,
      details: `${d.name}${d.hsn ? ` · HSN ${d.hsn}` : ''}`,
      icon: 'design',
      entityType: 'Design',
      entityId: String(d._id),
      link: `/production/designs/${d._id}`,
    });
    if (opts.forward) {
      const slips = await this.col('job_slips')
        .find({ designId: either(d._id), status: { $ne: 'CANCELLED' } })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
      for (const s of slips) await this.jobSlip(s, { forward: true, skipDesign: true });
    }
  }

  async jobSlip(s: any, opts: { forward?: boolean; skipDesign?: boolean } = {}) {
    if (!s || !this.once(`slip:${s._id}`)) return;
    const worker = (await this.labels.resolve('jobWorker', [String(s.jobWorkerId)])).get(
      String(s.jobWorkerId),
    );
    const expected = roundQty(
      (s.expectedOutputLines ?? []).reduce((t: number, l: any) => t + (l.expectedQty ?? 0), 0),
    );
    this.add({
      stage: 'Job slip',
      refNo: s.docNo,
      status: s.status,
      date: fmtDate(s.docDate ?? s.createdAt),
      rawDate: s.docDate ?? s.createdAt,
      details: `${s.jobType ?? 'Job'} with ${worker ?? 'job worker'} · expected ${expected} pcs${s.expectedCompletionDate ? ` by ${fmtDate(s.expectedCompletionDate)}` : ''}`,
      icon: 'job',
      entityType: 'JobSlip',
      entityId: String(s._id),
      link: `/production/job-slips/${s._id}`,
    });
    if (!opts.skipDesign && s.designId) {
      await this.design(await this.col('designs').findOne({ _id: s.designId }));
    }

    // Material issued to this job, and the raw lots behind it (backward to inward/purchase).
    const issues = await this.col('material_issues')
      .find({ jobSlipId: either(s._id), status: 'CONFIRMED' })
      .toArray();
    for (const issue of issues) {
      if (!this.once(`issue:${issue._id}`)) continue;
      const qty = roundQty(
        (issue.lines ?? []).reduce((t: number, l: any) => t + (l.qtyBase ?? 0), 0),
      );
      this.add({
        stage: 'Material issue',
        refNo: issue.docNo ?? String(issue._id),
        status: issue.acknowledgedAt ? 'Acknowledged' : issue.status,
        date: fmtDate(issue.docDate ?? issue.createdAt),
        rawDate: issue.docDate ?? issue.createdAt,
        details: `${qty} issued to ${worker ?? 'job worker'} · ${issue.lines?.length ?? 0} line(s)`,
        icon: 'job',
        entityType: 'MaterialIssue',
        entityId: String(issue._id),
        link: `/production/issuance/${issue._id}`,
      });
    }
    const materialLots = await this.col('job_material_lines').distinct('lotId', {
      jobSlipId: either(s._id),
    });
    if (materialLots.length) {
      const lots = await this.col('stock_lots').find({ _id: { $in: materialLots.map((x) => oid(x)).filter((x): x is Types.ObjectId => !!x) } }).toArray();
      for (const lot of lots) await this.lot(lot);
    }

    // Finished goods that came back.
    const receipts = await this.col('job_receipts')
      .find({ jobSlipId: either(s._id), status: 'CONFIRMED' })
      .toArray();
    for (const r of receipts) {
      if (!this.once(`receipt:${r._id}`)) continue;
      const accepted = roundQty(
        (r.lines ?? []).reduce((t: number, l: any) => t + (l.acceptedQty ?? l.receivedQty ?? 0), 0),
      );
      const rejected = roundQty(
        (r.lines ?? []).reduce((t: number, l: any) => t + (l.rejectedQty ?? 0), 0),
      );
      this.add({
        stage: 'Finished goods receipt',
        refNo: r.docNo ?? String(r._id),
        status: r.status,
        date: fmtDate(r.docDate ?? r.createdAt),
        rawDate: r.docDate ?? r.createdAt,
        details: `${accepted} pcs accepted${rejected ? `, ${rejected} rejected` : ''} from ${worker ?? 'job worker'}`,
        icon: 'receive',
        entityType: 'JobReceipt',
        entityId: String(r._id),
        link: '/production/receiving',
      });
    }

    if (opts.forward) {
      const finishedLots = await this.col('stock_lots').find({ originJobSlipId: either(s._id) }).toArray();
      for (const lot of finishedLots) await this.lot(lot, { skipOrigin: true });
      if (finishedLots.length) await this.invoicesForLots(finishedLots.map((l) => l._id));
    }
  }

  async invoicesForLots(lotIds: Types.ObjectId[]) {
    const invoiceIds = await this.col('invoice_line_allocations').distinct('invoiceId', {
      lotId: eitherMany(lotIds),
    });
    if (!invoiceIds.length) return;
    const invoices = await this.col('invoices').find({ _id: { $in: invoiceIds.map((x) => oid(x)).filter((x): x is Types.ObjectId => !!x) } }).toArray();
    for (const inv of invoices) this.invoiceNode(inv);
  }

  private invoiceNode(inv: any) {
    const qty = roundQty((inv.lines ?? []).reduce((t: number, l: any) => t + (l.qty ?? 0), 0));
    this.add({
      stage: 'Invoice',
      refNo: inv.docNo ?? String(inv._id),
      status: inv.status === 'CONFIRMED' ? (inv.paymentStatus ?? inv.status) : inv.status,
      date: fmtDate(inv.docDate),
      rawDate: inv.docDate,
      details: `${qty} pcs to ${inv.customerNameSnapshot ?? 'customer'}`,
      icon: 'sale',
      entityType: 'Invoice',
      entityId: String(inv._id),
      link: `/sales/invoices/${inv._id}`,
    });
  }

  /** Invoice: allocations -> finished lots -> job slip -> issued lots -> inward -> purchase. */
  async invoice(inv: any) {
    if (!inv || !this.once(`invoice:${inv._id}`)) return;
    this.invoiceNode(inv);
    if (inv.salesOrderId) {
      const so = await this.col('sales_orders').findOne({ _id: inv.salesOrderId });
      if (so) this.salesOrderNode(so);
    }
    const lotIds = await this.col('invoice_line_allocations').distinct('lotId', {
      invoiceId: either(inv._id),
    });
    if (lotIds.length) {
      const lots = await this.col('stock_lots').find({ _id: { $in: lotIds.map((x) => oid(x)).filter((x): x is Types.ObjectId => !!x) } }).toArray();
      for (const lot of lots) await this.lot(lot);
    }
  }

  private salesOrderNode(so: any) {
    const qty = roundQty((so.lines ?? []).reduce((t: number, l: any) => t + (l.qty ?? 0), 0));
    this.add({
      stage: 'Sales order',
      refNo: so.docNo ?? String(so._id),
      status: so.status,
      date: fmtDate(so.docDate ?? so.createdAt),
      rawDate: so.docDate ?? so.createdAt,
      details: `${qty} pcs ordered · ${so.lines?.length ?? 0} line(s)`,
      icon: 'sale',
      entityType: 'SalesOrder',
      entityId: String(so._id),
      link: `/sales/orders/${so._id}`,
    });
  }

  async salesOrder(so: any) {
    if (!so || !this.once(`so:${so._id}`)) return;
    this.salesOrderNode(so);
    const invoices = await this.col('invoices')
      .find({ salesOrderId: either(so._id), status: { $ne: 'CANCELLED' } })
      .toArray();
    for (const inv of invoices) await this.invoice(inv);
  }
}

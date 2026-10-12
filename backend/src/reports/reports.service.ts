import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Purchase, PurchaseDocument } from '../purchasing/schemas/purchase.schema';
import { StockItem, StockItemDocument } from '../inventory/schemas/stock-item.schema';
import { StockBalance, StockBalanceDocument } from '../inventory/schemas/stock-balance.schema';
import { StockLedgerEntry, StockLedgerDocument } from '../inventory/schemas/stock-ledger.schema';
import {
  StockAdjustment,
  StockAdjustmentDocument,
} from '../inventory/schemas/stock-adjustment.schema';
import { MaterialIssue, MaterialIssueDocument } from '../jobwork/schemas/material-issue.schema';
import { JobSlip, JobSlipDocument } from '../jobwork/schemas/job-slip.schema';
import { JobReceipt, JobReceiptDocument } from '../jobwork/schemas/job-receipt.schema';
import {
  JobMaterialLine,
  JobMaterialLineDocument,
} from '../jobwork/schemas/job-material-line.schema';
import { Invoice, InvoiceDocument } from '../sales/schemas/invoice.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { StockQueryService } from '../inventory/stock-query.service';
import { CostingService } from '../costing/costing.service';
import { roundMoney, roundQty } from '../common/utils/decimal';

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

function dateMatch(field: string, filter: DateRangeFilter): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  if (filter.from || filter.to) {
    match[field] = {};
    if (filter.from) (match[field] as Record<string, unknown>).$gte = new Date(filter.from);
    if (filter.to) (match[field] as Record<string, unknown>).$lte = new Date(filter.to);
  }
  return match;
}

/**
 * RPT-01, prd.md §6.2. Only the R1 (●) reports are built. Every report returns flat rows so
 * the controller can render the same data as JSON or CSV (tech.md's "Export CSV (R1)").
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockLedgerEntry.name) private readonly ledgerModel: Model<StockLedgerDocument>,
    @InjectModel(StockAdjustment.name)
    private readonly adjustmentModel: Model<StockAdjustmentDocument>,
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    private readonly stockQueryService: StockQueryService,
    private readonly costingService: CostingService,
  ) {}

  // ---- Purchase ----

  async purchaseHistory(filter: DateRangeFilter & { supplierId?: string }) {
    const match: Record<string, unknown> = { ...dateMatch('docDate', filter) };
    if (filter.supplierId) match.supplierId = new Types.ObjectId(filter.supplierId);
    const purchases = await this.purchaseModel.find(match).sort({ docDate: -1 }).lean();
    return purchases.map((p) => ({
      docNo: p.docNo,
      docDate: p.docDate,
      supplierId: String(p.supplierId),
      status: p.status,
      lineCount: p.lines.length,
      totalAmount: roundMoney(
        p.lines.reduce((s: number, l: any) => s + l.amount, 0) + (p.otherCharges ?? 0),
      ),
    }));
  }

  async purchaseBySupplier(filter: DateRangeFilter) {
    const purchases = await this.purchaseModel
      .find({ ...dateMatch('docDate', filter), status: { $ne: 'CANCELLED' } })
      .lean();
    const bySupplier = new Map<string, { count: number; total: number }>();
    for (const p of purchases) {
      const key = String(p.supplierId);
      const entry = bySupplier.get(key) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += p.lines.reduce((s: number, l: any) => s + l.amount, 0) + (p.otherCharges ?? 0);
      bySupplier.set(key, entry);
    }
    return Array.from(bySupplier.entries()).map(([supplierId, v]) => ({
      supplierId,
      purchaseCount: v.count,
      totalAmount: roundMoney(v.total),
    }));
  }

  // ---- Inventory ----

  async currentRawStock() {
    const items = await this.stockItemModel.find({ kind: { $ne: 'FINISHED_GOOD' } }).lean();
    const agg = await this.balanceModel.aggregate([
      { $match: { stockItemId: { $in: items.map((i) => i._id) }, qty: { $ne: 0 } } },
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
    ]);
    const qtyByItem = new Map(agg.map((r) => [String(r._id), r.qty]));
    return items.map((item) => ({
      stockItemId: String(item._id),
      kind: item.kind,
      onHandQty: roundQty(qtyByItem.get(String(item._id)) ?? 0),
      minStockQty: item.minStockQty ?? '',
    }));
  }

  async finishedProductStock() {
    const items = await this.stockItemModel.find({ kind: 'FINISHED_GOOD' }).lean();
    const agg = await this.balanceModel.aggregate([
      { $match: { stockItemId: { $in: items.map((i) => i._id) }, qty: { $ne: 0 } } },
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
    ]);
    const qtyByItem = new Map(agg.map((r) => [String(r._id), r.qty]));
    return items.map((item) => ({
      stockItemId: String(item._id),
      designVariantId: item.designVariantId ? String(item.designVariantId) : '',
      onHandQty: roundQty(qtyByItem.get(String(item._id)) ?? 0),
    }));
  }

  async stockMovement(filter: DateRangeFilter & { stockItemId?: string }) {
    const match: Record<string, unknown> = { ...dateMatch('postedAt', filter) };
    if (filter.stockItemId) match.stockItemId = new Types.ObjectId(filter.stockItemId);
    const rows = await this.ledgerModel.find(match).sort({ postedAt: -1 }).limit(5000).lean();
    return rows.map((r) => ({
      postedAt: r.postedAt,
      movementType: r.movementType,
      stockItemId: String(r.stockItemId),
      lotId: String(r.lotId),
      fromLocationId: String(r.fromLocationId),
      toLocationId: String(r.toLocationId),
      qty: r.qty,
      unitCost: r.unitCost,
      docType: r.docType,
      docId: String(r.docId),
    }));
  }

  async materialIssuedReport(filter: DateRangeFilter & { jobWorkerId?: string }) {
    const match: Record<string, unknown> = {
      ...dateMatch('createdAt', filter),
      status: 'CONFIRMED',
    };
    if (filter.jobWorkerId) match.jobWorkerId = new Types.ObjectId(filter.jobWorkerId);
    const issues = await this.issueModel.find(match).sort({ createdAt: -1 }).lean();
    const rows: Array<Record<string, unknown>> = [];
    for (const issue of issues) {
      for (const line of issue.lines) {
        rows.push({
          docNo: (issue as any).docNo,
          jobSlipId: String(issue.jobSlipId),
          jobWorkerId: String(issue.jobWorkerId),
          materialVariantId: String((line as any).materialVariantId),
          qtyBase: (line as any).qtyBase,
          docDate: (issue as any).createdAt,
        });
      }
    }
    return rows;
  }

  async materialWithFactory() {
    const rows = await this.balanceModel.aggregate([
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
      { $match: { 'loc.kind': 'FACTORY_CUSTODY' } },
      {
        $group: {
          _id: { stockItemId: '$stockItemId', jobWorkerId: '$loc.jobWorkerId' },
          qty: { $sum: '$qty' },
        },
      },
    ]);
    return rows.map((r) => ({
      stockItemId: String(r._id.stockItemId),
      jobWorkerId: r._id.jobWorkerId ? String(r._id.jobWorkerId) : '',
      qty: roundQty(r.qty),
    }));
  }

  async stockAdjustments(filter: DateRangeFilter) {
    const rows = await this.adjustmentModel
      .find(dateMatch('createdAt', filter))
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((a) => ({
      docNo: a.docNo,
      docDate: a.docDate,
      stockItemId: String(a.stockItemId),
      locationId: String(a.locationId),
      direction: a.direction,
      qty: a.qty,
      reason: a.reason,
      status: a.status,
    }));
  }

  async stockValuation() {
    return this.stockQueryService.valuation();
  }

  // ---- Manufacturing ----

  async expectedVsActual() {
    const receipts = await this.receiptModel.find({ status: 'CONFIRMED' }).lean();
    const byJob = new Map<string, { expected: number; actual: number }>();
    for (const r of receipts) {
      const key = String(r.jobSlipId);
      const entry = byJob.get(key) ?? { expected: 0, actual: 0 };
      for (const l of r.lines) {
        entry.expected += (l as any).expectedQty ?? 0;
        entry.actual += (l as any).acceptedQty ?? (l as any).receivedQty ?? 0;
      }
      byJob.set(key, entry);
    }
    return Array.from(byJob.entries()).map(([jobSlipId, v]) => ({
      jobSlipId,
      expectedQty: roundQty(v.expected),
      actualQty: roundQty(v.actual),
      difference: roundQty(v.expected - v.actual),
    }));
  }

  async pendingJobs() {
    const rows = await this.jobSlipModel
      .find({
        status: {
          $in: ['CREATED', 'MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED'],
        },
      })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((s: any) => ({
      docNo: s.docNo,
      jobWorkerId: String(s.jobWorkerId),
      designId: String(s.designId),
      status: s.status,
      expectedCompletionDate: s.expectedCompletionDate ?? '',
    }));
  }

  async completedJobs(filter: DateRangeFilter) {
    const rows = await this.jobSlipModel
      .find({ status: 'CLOSED', ...dateMatch('closedAt', filter) })
      .sort({ closedAt: -1 })
      .lean();
    return rows.map((s: any) => ({
      docNo: s.docNo,
      jobWorkerId: String(s.jobWorkerId),
      designId: String(s.designId),
      closedAt: s.closedAt,
    }));
  }

  // ---- Shortage ----

  async materialSentVsReceived() {
    const lines = await this.materialLineModel.find({}).lean();
    return lines.map((l) => ({
      jobSlipId: String(l.jobSlipId),
      jobWorkerId: String(l.jobWorkerId),
      stockItemId: String(l.stockItemId),
      qtyIssued: l.qtyIssued,
      qtyConsumed: l.qtyConsumed,
      qtyReturned: l.qtyReturned,
      qtyWrittenOff: l.qtyWrittenOff,
    }));
  }

  async shortagePercent() {
    const lines = await this.materialLineModel.find({}).lean();
    return lines
      .map((l) => {
        const shortage = roundQty(l.qtyIssued - l.qtyReturned - l.qtyConsumed);
        const shortagePct = l.qtyIssued > 0 ? roundQty((shortage / l.qtyIssued) * 100) : 0;
        return {
          jobSlipId: String(l.jobSlipId),
          jobWorkerId: String(l.jobWorkerId),
          stockItemId: String(l.stockItemId),
          shortage,
          shortagePct,
        };
      })
      .filter((r) => r.shortage > 0.0005);
  }

  // ---- Costing ----

  async designWiseCost() {
    const designs = await this.designModel.find({ isActive: true }).lean();
    const rows: Array<Record<string, unknown>> = [];
    for (const d of designs) {
      const margins = await this.costingService.getMarginsForDesign(String(d._id));
      for (const m of margins) {
        const sellingPrice = d.defaultSellingRate ?? 0;
        const margin = m.unitCost !== undefined ? roundMoney(sellingPrice - m.unitCost) : undefined;
        rows.push({
          designId: String(d._id),
          designNo: d.designNo,
          jobSlipId: m.jobSlipId,
          status: m.status,
          costPerPiece: m.unitCost ?? '',
          sellingPrice,
          margin: margin ?? '',
        });
      }
    }
    return rows;
  }

  // ---- Sales ----

  async salesByCustomer(filter: DateRangeFilter) {
    const invoices = await this.invoiceModel
      .find({ status: 'CONFIRMED', ...dateMatch('docDate', filter) })
      .lean();
    const byCustomer = new Map<string, { count: number; revenue: number }>();
    for (const inv of invoices) {
      const key = String(inv.customerId);
      const entry = byCustomer.get(key) ?? { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += inv.grandTotal;
      byCustomer.set(key, entry);
    }
    return Array.from(byCustomer.entries()).map(([customerId, v]) => ({
      customerId,
      invoiceCount: v.count,
      revenue: roundMoney(v.revenue),
    }));
  }

  async revenue(filter: DateRangeFilter) {
    const invoices = await this.invoiceModel
      .find({ status: 'CONFIRMED', ...dateMatch('docDate', filter) })
      .sort({ docDate: 1 })
      .lean();
    return invoices.map((i) => ({
      docNo: i.docNo,
      docDate: i.docDate,
      customerId: String(i.customerId),
      taxableTotal: i.taxableTotal,
      grandTotal: i.grandTotal,
    }));
  }

  async paymentStatus() {
    const invoices = await this.invoiceModel
      .find({ status: 'CONFIRMED' })
      .sort({ docDate: -1 })
      .lean();
    return invoices.map((i) => ({
      docNo: i.docNo,
      docDate: i.docDate,
      customerId: String(i.customerId),
      grandTotal: i.grandTotal,
      paymentStatus: i.paymentStatus,
    }));
  }

  // ---- Compliance ----

  /** Job-work ageing: material still in custody, by days since it was issued. */
  async jobWorkAgeing() {
    const lines = await this.materialLineModel.find({}).lean();
    const now = Date.now();
    return lines
      .map((l: any) => {
        const remaining = roundQty(l.qtyIssued - l.qtyReturned - l.qtyConsumed - l.qtyWrittenOff);
        const daysSinceIssue = Math.floor((now - new Date(l.createdAt).getTime()) / 86400000);
        return {
          jobSlipId: String(l.jobSlipId),
          jobWorkerId: String(l.jobWorkerId),
          stockItemId: String(l.stockItemId),
          remainingQty: remaining,
          daysSinceIssue,
        };
      })
      .filter((r) => r.remainingQty > 0.0005)
      .sort((a, b) => b.daysSinceIssue - a.daysSinceIssue);
  }
}

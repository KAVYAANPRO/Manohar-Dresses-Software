import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { JobCostSheet, JobCostSheetDocument } from './schemas/job-cost-sheet.schema';
import { LotRevaluation, LotRevaluationDocument } from './schemas/lot-revaluation.schema';
import { JobSlip, JobSlipDocument } from '../jobwork/schemas/job-slip.schema';
import {
  JobMaterialLine,
  JobMaterialLineDocument,
} from '../jobwork/schemas/job-material-line.schema';
import { JobCharge, JobChargeDocument } from '../jobwork/schemas/job-charge.schema';
import { JobReceipt, JobReceiptDocument } from '../jobwork/schemas/job-receipt.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';
import { StockBalance, StockBalanceDocument } from '../inventory/schemas/stock-balance.schema';
import { StockLedgerEntry, StockLedgerDocument } from '../inventory/schemas/stock-ledger.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { roundMoney, roundQty, roundUnitCost, toDecimal } from '../common/utils/decimal';
import { ProblemException } from '../common/errors/problem.exception';
import { JobworkLookupService } from '../jobwork/jobwork-lookup.service';

export interface JobCostResult {
  jobSlipId: string;
  material: number;
  processing: number;
  manufacturing: number;
  other: number;
  totalCost: number;
  acceptedQty: number;
  unitCost?: number;
  status: 'PROVISIONAL' | 'FINAL';
}

/**
 * CST-05 split (pure, unit-tested): a material lot that came out of a PROCESSING job carries
 * that job's processing (+ other) charges inside its unit cost. Returns how much of `amount`
 * is processing, in the same proportion as the processing job's own cost sheet.
 */
export function embeddedProcessing(
  amount: number,
  sourceJob: { totalCost: number; processing: number; other: number } | undefined,
): number {
  if (!sourceJob || sourceJob.totalCost <= 0) return 0;
  return roundMoney(
    toDecimal(amount)
      .times(toDecimal(sourceJob.processing).plus(sourceJob.other))
      .dividedBy(sourceJob.totalCost),
  );
}

/**
 * CST-01 to CST-08. The only writer of cost tables (tech.md §3.2). Material = Σ (issued −
 * returned) × lot cost at issue (CST-02); charges only from job_charges (CST-03/BR-13);
 * per garment = total ÷ accepted (CST-04). The garment-level "dyeing/processing" line is read
 * back from the processed lots' source processing job (CST-05) - no manual roll-up.
 */
@Injectable()
export class CostingService {
  constructor(
    @InjectModel(JobCostSheet.name) private readonly costSheetModel: Model<JobCostSheetDocument>,
    @InjectModel(LotRevaluation.name)
    private readonly revaluationModel: Model<LotRevaluationDocument>,
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(JobCharge.name) private readonly chargeModel: Model<JobChargeDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockLedgerEntry.name) private readonly ledgerModel: Model<StockLedgerDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly lookup: JobworkLookupService,
  ) {}

  /** CST-01 to CST-04: components come from real records (job_material_lines, job_charges), never typed in. */
  async computeJobCost(jobSlipId: string, session?: ClientSession): Promise<JobCostResult> {
    if (!Types.ObjectId.isValid(jobSlipId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    }
    const jobSlip = await this.jobSlipModel
      .findById(jobSlipId)
      .session(session ?? null)
      .lean();
    if (!jobSlip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    const oid = new Types.ObjectId(jobSlipId);

    const materialLines = await this.materialLineModel
      .find({ jobSlipId: oid })
      .session(session ?? null)
      .lean();
    let materialD = new Decimal(0);
    for (const l of materialLines) {
      materialD = materialD.plus(toDecimal(l.qtyIssued).minus(l.qtyReturned).times(l.unitCost));
    }
    const material = roundMoney(materialD);

    const charges = await this.chargeModel
      .find({ jobSlipId: oid })
      .session(session ?? null)
      .lean();
    const sumKind = (kind: string) =>
      roundMoney(
        charges
          .filter((c) => c.kind === kind)
          .reduce((s, c) => s.plus(c.amount), new Decimal(0)),
      );
    const processing = sumKind('PROCESSING');
    const manufacturing = sumKind('MANUFACTURING');
    const other = sumKind('OTHER');

    const totalCost = roundMoney(
      toDecimal(material).plus(processing).plus(manufacturing).plus(other),
    );

    const receipts = await this.receiptModel
      .find({ jobSlipId: oid, status: 'CONFIRMED' })
      .session(session ?? null)
      .lean();
    let accepted = new Decimal(0);
    for (const r of receipts) {
      for (const l of r.lines) {
        accepted = accepted.plus(
          jobSlip.jobType === 'MANUFACTURING' ? (l.acceptedQty ?? 0) : l.receivedQty,
        );
      }
    }
    const acceptedQty = roundQty(accepted);
    const unitCost =
      acceptedQty > 0 ? roundUnitCost(toDecimal(totalCost).dividedBy(acceptedQty)) : undefined;

    return {
      jobSlipId,
      material,
      processing,
      manufacturing,
      other,
      totalCost,
      acceptedQty,
      unitCost,
      status: jobSlip.status === 'CLOSED' ? 'FINAL' : 'PROVISIONAL',
    };
  }

  async writeCostSheet(
    jobSlipId: string,
    session?: ClientSession,
    extra: { varianceOnSold?: number } = {},
  ): Promise<JobCostResult> {
    const result = await this.computeJobCost(jobSlipId, session);
    const lines = [
      { component: 'MATERIAL', amount: result.material },
      { component: 'PROCESSING', amount: result.processing },
      { component: 'MANUFACTURING', amount: result.manufacturing },
      { component: 'OTHER', amount: result.other },
    ].filter((l) => l.amount > 0);

    await this.costSheetModel.updateOne(
      { jobSlipId: new Types.ObjectId(jobSlipId) },
      {
        $set: {
          lines,
          totalCost: result.totalCost,
          acceptedQty: result.acceptedQty,
          unitCost: result.unitCost,
          status: result.status,
          ...(extra.varianceOnSold !== undefined ? { varianceOnSold: extra.varianceOnSold } : {}),
        },
      },
      { upsert: true, session },
    );
    return result;
  }

  /** A FINAL sheet is locked (post-close); anything else is recomputed live so returns/write-offs are never stale. */
  async getCostSheet(jobSlipId: string) {
    if (!Types.ObjectId.isValid(jobSlipId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    }
    const sheet = await this.costSheetModel
      .findOne({ jobSlipId: new Types.ObjectId(jobSlipId) })
      .lean();
    if (sheet?.status === 'FINAL') return sheet;
    return this.computeJobCost(jobSlipId);
  }

  /**
   * tech.md §6.5: on close, provisional lot costs are trued up. Called by JobSlipsService.close()
   * inside the same transaction as the status change (BR-12). CST-08: the difference on pieces
   * already gone (sold) is recorded as varianceOnSold, never restated on a posted invoice.
   */
  async onJobClosed(
    jobSlipId: string,
    actorId: string,
    session: ClientSession,
  ): Promise<JobCostResult> {
    const result = await this.computeJobCost(jobSlipId, session);
    if (result.unitCost === undefined) {
      return this.writeCostSheet(jobSlipId, session);
    }

    const physical = await this.locationModel
      .find({
        kind: { $in: ['WAREHOUSE', 'FACTORY_CUSTODY', 'QUARANTINE', 'CUSTOMER_CONSIGNMENT'] },
      })
      .session(session)
      .lean();
    const physicalIds = physical.map((l) => l._id);

    const outputLots = await this.lotModel
      .find({ originJobSlipId: new Types.ObjectId(jobSlipId) })
      .session(session);
    let variance = new Decimal(0);
    for (const lot of outputLots) {
      // Only accepted output (PRODUCTION_RECEIPT / PROCESS_OUTPUT) is trued up; rejected
      // quarantine lots keep their material-only cost.
      const origin = await this.ledgerModel
        .findOne({
          lotId: lot._id,
          movementType: { $in: ['PRODUCTION_RECEIPT', 'PROCESS_OUTPUT'] },
        })
        .session(session)
        .lean();
      if (!origin) continue;
      if (Math.abs(lot.unitCost - result.unitCost) < 0.00005) continue;

      const balances = await this.balanceModel
        .find({ lotId: lot._id, locationId: { $in: physicalIds } })
        .session(session)
        .lean();
      const onHand = balances.reduce((s, b) => s + b.qty, 0);
      const gone = Math.max(0, roundQty(origin.qty - onHand));
      variance = variance.plus(
        toDecimal(gone).times(toDecimal(result.unitCost).minus(lot.unitCost)),
      );

      await this.revaluationModel.create(
        [
          {
            lotId: lot._id,
            oldCost: lot.unitCost,
            newCost: result.unitCost,
            reason: 'Job closed - provisional cost trued up to final',
            jobSlipId: new Types.ObjectId(jobSlipId),
            createdBy: new Types.ObjectId(actorId),
          },
        ],
        { session },
      );
      lot.unitCost = result.unitCost;
      await lot.save({ session });
    }

    return this.writeCostSheet(jobSlipId, session, { varianceOnSold: roundMoney(variance) });
  }

  /** CST-06: design-wise cost/margin, using the most recent FINAL (else PROVISIONAL) cost sheet per job. */
  async getMarginsForDesign(designId: string) {
    if (!Types.ObjectId.isValid(designId)) return [];
    const jobSlips = await this.jobSlipModel
      .find({ designId: new Types.ObjectId(designId) })
      .lean();
    const designs = await this.lookup.designs([designId]);
    const sellingRate = designs.get(designId)?.defaultSellingRate;
    const results = [];
    for (const slip of jobSlips) {
      const sheet = await this.costSheetModel.findOne({ jobSlipId: slip._id }).lean();
      if (!sheet) continue;
      results.push({
        jobSlipId: String(slip._id),
        jobSlipNo: slip.docNo,
        status: sheet.status,
        unitCost: sheet.unitCost,
        sellingRate,
        margin:
          sellingRate !== undefined && sheet.unitCost !== undefined
            ? roundMoney(toDecimal(sellingRate).minus(sheet.unitCost))
            : undefined,
      });
    }
    return results;
  }

  // ------------------------------------------------------------------ screens (CST-06)

  /** Cost sheet list: every job that has material issued (provisional) or is closed (final). */
  async listCostSheets(filter: { jobType?: string; status?: string; designId?: string } = {}) {
    const q: Record<string, unknown> = {
      status: {
        $in: ['MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'],
      },
    };
    if (filter.jobType) q.jobType = filter.jobType;
    if (filter.designId && Types.ObjectId.isValid(filter.designId)) {
      q.designId = new Types.ObjectId(filter.designId);
    }
    const slips = await this.jobSlipModel.find(q).sort({ createdAt: -1 }).lean();
    const [designs, workers, lastReceipts] = await Promise.all([
      this.lookup.designs(slips.map((s) => s.designId)),
      this.lookup.jobWorkers(slips.map((s) => s.jobWorkerId)),
      this.receiptModel
        .aggregate([
          { $match: { jobSlipId: { $in: slips.map((s) => s._id) }, status: 'CONFIRMED' } },
          { $group: { _id: '$jobSlipId', last: { $max: '$docDate' } } },
        ])
        .exec(),
    ]);
    const lastBySlip = new Map(lastReceipts.map((r: any) => [String(r._id), r.last]));
    const rows: Record<string, unknown>[] = [];
    for (const s of slips) {
      const cost: any = await this.getCostSheet(String(s._id));
      if (filter.status && filter.status.toUpperCase() !== cost.status) continue;
      const design = designs.get(String(s.designId));
      const sellingRate = s.jobType === 'MANUFACTURING' ? (design?.defaultSellingRate ?? 0) : 0;
      const unitCost = cost.unitCost ?? 0;
      const margin = sellingRate > 0 && unitCost > 0 ? roundMoney(toDecimal(sellingRate).minus(unitCost)) : 0;
      rows.push({
        id: String(s._id),
        jobSlipId: String(s._id),
        jobSlip: s.docNo,
        jobType: s.jobType,
        jobSlipStatus: s.status,
        design: design ? `${design.designNo} — ${design.name}` : '',
        factory: workers.get(String(s.jobWorkerId))?.name ?? '',
        acceptedQty: cost.acceptedQty ?? 0,
        totalCost: cost.totalCost ?? 0,
        expenses: this.componentOf(cost, 'OTHER', 'other'),
        costPerGarment: unitCost,
        sellingRate,
        margin,
        marginPct:
          sellingRate > 0 && unitCost > 0
            ? roundQty(toDecimal(margin).dividedBy(sellingRate).times(100))
            : 0,
        type: cost.status === 'FINAL' ? 'Final' : 'Provisional',
        date: s.closedAt ?? lastBySlip.get(String(s._id)) ?? s.docDate,
      });
    }
    return rows;
  }

  private componentOf(cost: any, component: string, key: string): number {
    if (typeof cost[key] === 'number') return cost[key];
    return (cost.lines ?? []).find((l: any) => l.component === component)?.amount ?? 0;
  }

  /** CST-01 detail: material by BOM role/material, embedded processing (CST-05), charges, margin. */
  async getCostSheetDetail(jobSlipId: string): Promise<Record<string, unknown>> {
    const cost: any = await this.getCostSheet(jobSlipId);
    const slip = await this.jobSlipModel.findById(jobSlipId).lean();
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    const oid = slip._id as Types.ObjectId;

    const [matLines, charges, receipts, revaluations] = await Promise.all([
      this.materialLineModel.find({ jobSlipId: oid }).lean(),
      this.chargeModel.find({ jobSlipId: oid }).sort({ createdAt: 1 }).lean(),
      this.receiptModel.find({ jobSlipId: oid, status: 'CONFIRMED' }).lean(),
      this.revaluationModel.find({ jobSlipId: oid }).sort({ createdAt: 1 }).lean(),
    ]);
    const [designs, workers, items, lots] = await Promise.all([
      this.lookup.designs([slip.designId]),
      this.lookup.jobWorkers([slip.jobWorkerId]),
      this.lookup.stockItemMaterials(matLines.map((l) => l.stockItemId)),
      this.lookup.lots(matLines.map((l) => l.lotId)),
    ]);

    // Source processing jobs of processed lots (CST-05).
    const sourceJobIds = [
      ...new Set(
        [...lots.values()]
          .filter((l) => l.originDocType === 'PROCESS_OUTPUT' && l.originJobSlipId)
          .map((l) => String(l.originJobSlipId)),
      ),
    ];
    const sourceCost = new Map<string, JobCostResult>();
    const sourceNo = new Map<string, string>();
    for (const id of sourceJobIds) {
      sourceCost.set(id, await this.computeJobCost(id));
      const src = await this.jobSlipModel.findById(id).lean();
      if (src) sourceNo.set(id, src.docNo);
    }

    const groups = new Map<string, any>();
    let embedded = new Decimal(0);
    for (const l of matLines) {
      const mv = items.get(String(l.stockItemId));
      const lot = lots.get(String(l.lotId));
      const key = `${l.bomRole ?? ''}|${mv?.materialVariantId ?? l.stockItemId}`;
      const qty = roundQty(l.qtyIssued - l.qtyReturned);
      const amount = roundMoney(toDecimal(qty).times(l.unitCost));
      const srcId =
        lot?.originDocType === 'PROCESS_OUTPUT' && lot.originJobSlipId
          ? String(lot.originJobSlipId)
          : undefined;
      const proc = embeddedProcessing(amount, srcId ? sourceCost.get(srcId) : undefined);
      embedded = embedded.plus(proc);
      const g = groups.get(key) ?? {
        label: mv?.name ?? 'Material',
        bomRole: l.bomRole,
        uom: mv?.uom ?? '',
        qty: 0,
        amount: 0,
        processingIncluded: 0,
        sourceProcessingJobs: [] as string[],
      };
      g.qty = roundQty(g.qty + qty);
      g.amount = roundMoney(toDecimal(g.amount).plus(amount));
      g.processingIncluded = roundMoney(toDecimal(g.processingIncluded).plus(proc));
      const srcNo = srcId ? sourceNo.get(srcId) : undefined;
      if (srcNo && !g.sourceProcessingJobs.includes(srcNo)) g.sourceProcessingJobs.push(srcNo);
      groups.set(key, g);
    }
    const materialLines = [...groups.values()].map((g) => {
      const avgRate = g.qty > 0 ? roundUnitCost(toDecimal(g.amount).dividedBy(g.qty)) : 0;
      return { ...g, avgRate, detail: `${g.qty} ${g.uom} × ₹${avgRate}` };
    });

    const receiptNo = new Map(receipts.map((r) => [String(r._id), r.docNo]));
    const design = designs.get(String(slip.designId));
    const sellingRate = slip.jobType === 'MANUFACTURING' ? (design?.defaultSellingRate ?? 0) : 0;
    const totalCost = cost.totalCost ?? 0;
    const acceptedQty = cost.acceptedQty ?? 0;
    const unitCost =
      cost.unitCost ??
      (acceptedQty > 0 ? roundUnitCost(toDecimal(totalCost).dividedBy(acceptedQty)) : 0);
    const margin = sellingRate > 0 ? roundMoney(toDecimal(sellingRate).minus(unitCost)) : 0;

    return {
      id: String(slip._id),
      jobSlipId: String(slip._id),
      jobSlip: slip.docNo,
      jobType: slip.jobType,
      jobSlipStatus: slip.status,
      design: design ? `${design.designNo} — ${design.name}` : '',
      designId: String(slip.designId),
      factory: workers.get(String(slip.jobWorkerId))?.name ?? '',
      date: slip.closedAt ?? slip.docDate,
      type: cost.status === 'FINAL' ? 'Final' : 'Provisional',
      acceptedQty,
      components: {
        material: this.componentOf(cost, 'MATERIAL', 'material'),
        /** of which processing/dyeing already inside processed-fabric lots (CST-05) */
        materialProcessingIncluded: roundMoney(embedded),
        processing: this.componentOf(cost, 'PROCESSING', 'processing'),
        manufacturing: this.componentOf(cost, 'MANUFACTURING', 'manufacturing'),
        other: this.componentOf(cost, 'OTHER', 'other'),
      },
      materialLines,
      charges: charges.map((c) => ({
        kind: c.kind,
        basis: c.basis,
        quantity: c.quantity,
        rate: c.rate,
        amount: c.amount,
        note: c.note,
        receiptNo: receiptNo.get(String(c.receiptId)),
      })),
      totalCost,
      costPerGarment: unitCost,
      sellingRate,
      margin,
      marginPct:
        sellingRate > 0 ? roundQty(toDecimal(margin).dividedBy(sellingRate).times(100)) : 0,
      varianceOnSold: cost.varianceOnSold ?? 0,
      revaluations: revaluations.map((r) => ({
        lotId: String(r.lotId),
        oldCost: r.oldCost,
        newCost: r.newCost,
        at: r.createdAt,
      })),
    };
  }
}

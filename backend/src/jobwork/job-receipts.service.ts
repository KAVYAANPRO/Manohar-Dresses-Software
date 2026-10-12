import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { JobReceipt, JobReceiptDocument } from './schemas/job-receipt.schema';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { JobCharge, JobChargeDocument } from './schemas/job-charge.schema';
import { ProductionOrder, ProductionOrderDocument } from './schemas/production-order.schema';
import {
  DesignBomVersion,
  DesignBomVersionDocument,
} from '../design/schemas/design-bom-version.schema';
import { DesignVariant, DesignVariantDocument } from '../design/schemas/design-variant.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';
import { StockItem, StockItemDocument } from '../inventory/schemas/stock-item.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { DesignsService } from '../design/designs.service';
import { StockService } from '../inventory/stock.service';
import { StockItemsService } from '../inventory/stock-items.service';
import { JobSlipsService } from './job-slips.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { roundMoney, roundQty, roundUnitCost, toDecimal } from '../common/utils/decimal';
import {
  ForbiddenProblemException,
  InsufficientStockException,
  InvalidStateTransitionException,
  OverReceiptToleranceExceededException,
  ProblemException,
  ValidationFailedException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { CreateJobReceiptDto } from './dto/job-receipt.dto';
import { CostingService } from '../costing/costing.service';
import { JobworkLookupService } from './jobwork-lookup.service';

export const RECEIVABLE_STATUSES = ['MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED'];
const EPS = 0.0005;

export interface JobBomLine {
  role: string;
  materialVariantId: Types.ObjectId;
  qtyPerGarmentBase: number;
  allowancePct: number;
}

interface ReceiptLineLike {
  colourId?: Types.ObjectId | string;
  sizeId?: Types.ObjectId | string;
  materialVariantId?: Types.ObjectId | string;
  receivedQty: number;
  acceptedQty?: number;
  rejectedQty?: number;
  damagedQty?: number;
}

/** Variant key for a receipt / expected line: colour|size for garments, material variant for processing. */
export function outputKey(l: {
  colourId?: unknown;
  sizeId?: unknown;
  materialVariantId?: unknown;
}): string {
  if (l.materialVariantId) return `mv:${String(l.materialVariantId)}`;
  return `cs:${String(l.colourId ?? '')}|${String(l.sizeId ?? '')}`;
}

/**
 * SHR-02 / tech.md §7.4: standard consumption = pieces x BOM qty. The allowance % is a
 * PLANNING figure (DSN-05, Required_i) and is deliberately NOT consumed - whatever the factory
 * holds beyond standard is the job's shortage and must be returned or written off.
 */
export function standardConsumption(pieces: number, bomLines: JobBomLine[]): Map<string, number> {
  const byVariant = new Map<string, number>();
  for (const b of bomLines) {
    const key = String(b.materialVariantId);
    const qty = toDecimal(pieces).times(b.qtyPerGarmentBase);
    byVariant.set(key, roundQty(toDecimal(byVariant.get(key) ?? 0).plus(qty)));
  }
  return byVariant;
}

/**
 * Over-receipt check (pure, unit-tested). Returns the keys whose cumulative received quantity
 * would exceed expected x (1 + tolerance%).
 */
export function findOverReceipts(
  expected: Map<string, number>,
  alreadyReceived: Map<string, number>,
  incoming: Map<string, number>,
  tolerancePct: number,
): Array<{ key: string; expected: number; cumulative: number; allowed: number }> {
  const out: Array<{ key: string; expected: number; cumulative: number; allowed: number }> = [];
  for (const [key, qty] of incoming) {
    const exp = expected.get(key) ?? 0;
    const cumulative = roundQty(toDecimal(alreadyReceived.get(key) ?? 0).plus(qty));
    const allowed = roundQty(
      toDecimal(exp).times(toDecimal(1).plus(toDecimal(tolerancePct).dividedBy(100))),
    );
    if (cumulative > allowed + EPS) out.push({ key, expected: exp, cumulative, allowed });
  }
  return out;
}

const hasValue = (v: number | undefined | null): v is number => v !== undefined && v !== null;

/**
 * JOB-08, JOB-09, JOB-10, SHR-01, SHR-02, CST-02/CST-05. Consumption is drawn from THIS JOB's
 * own custody lines (tech.md §5.7/§7.3: "oldest lot first"), never a plain factory-wide FIFO.
 */
@Injectable()
export class JobReceiptsService {
  constructor(
    @InjectModel(JobReceipt.name) private readonly model: Model<JobReceiptDocument>,
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(JobCharge.name) private readonly chargeModel: Model<JobChargeDocument>,
    @InjectModel(ProductionOrder.name)
    private readonly productionOrderModel: Model<ProductionOrderDocument>,
    @InjectModel(DesignBomVersion.name)
    private readonly bomVersionModel: Model<DesignBomVersionDocument>,
    @InjectModel(DesignVariant.name)
    private readonly designVariantModel: Model<DesignVariantDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly designsService: DesignsService,
    private readonly stockService: StockService,
    private readonly stockItemsService: StockItemsService,
    private readonly jobSlipsService: JobSlipsService,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
    @Inject(forwardRef(() => CostingService)) private readonly costingService: CostingService,
    private readonly lookup: JobworkLookupService,
  ) {}

  // ---------------------------------------------------------------- reads

  async list(filter: Record<string, unknown> = {}) {
    const { jobType, ...rest } = filter;
    const query: Record<string, unknown> = castObjectIdFilter(rest, ['jobSlipId', 'jobWorkerId']);
    if (jobType && !query.jobSlipId) {
      const slipIds = await this.jobSlipModel.find({ jobType }).distinct('_id');
      query.jobSlipId = { $in: slipIds };
    }
    const receipts = await this.model.find(query).sort({ createdAt: -1 }).lean();
    return this.enrich(receipts);
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new ProblemException('NOT_FOUND', 404, 'Job receipt not found.');
    }
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Job receipt not found.');
    const [enriched] = await this.enrich([doc]);
    return enriched;
  }

  /** Adds display names and totals; keeps every stored field. */
  private async enrich(receipts: any[]) {
    const slips = await this.jobSlipModel
      .find({ _id: { $in: receipts.map((r) => r.jobSlipId) } })
      .lean();
    const slipById = new Map(slips.map((s) => [String(s._id), s]));
    const allLines = receipts.flatMap((r) => r.lines);
    const [workers, designs, colours, sizes, variants] = await Promise.all([
      this.lookup.jobWorkers(receipts.map((r) => r.jobWorkerId)),
      this.lookup.designs(slips.map((s) => s.designId)),
      this.lookup.colours(allLines.map((l: any) => l.colourId)),
      this.lookup.sizes(allLines.map((l: any) => l.sizeId)),
      this.lookup.materialVariants(allLines.map((l: any) => l.materialVariantId)),
    ]);
    return receipts.map((r) => {
      const slip = slipById.get(String(r.jobSlipId));
      const design = slip ? designs.get(String(slip.designId)) : undefined;
      const totals = { received: 0, accepted: 0, rejected: 0, damaged: 0, expected: 0 };
      const lines = r.lines.map((l: any) => {
        totals.received += l.receivedQty;
        totals.accepted += l.acceptedQty ?? 0;
        totals.rejected += l.rejectedQty ?? 0;
        totals.damaged += l.damagedQty ?? 0;
        totals.expected += l.expectedQty ?? 0;
        const mv = l.materialVariantId ? variants.get(String(l.materialVariantId)) : undefined;
        return {
          ...l,
          colourName: l.colourId ? colours.get(String(l.colourId)) : undefined,
          sizeName: l.sizeId ? sizes.get(String(l.sizeId)) : undefined,
          materialVariantName: mv?.name,
          uom: mv?.uom,
        };
      });
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = roundQty(totals[k]);
      return {
        ...r,
        lines,
        totals,
        jobSlipNo: slip?.docNo,
        jobType: slip?.jobType,
        jobSlipStatus: slip?.status,
        jobSlipExpectedTotal: slip
          ? roundQty(slip.expectedOutputLines.reduce((s, l) => s + l.expectedQty, 0))
          : undefined,
        jobWorkerName: workers.get(String(r.jobWorkerId))?.name,
        designId: slip ? String(slip.designId) : undefined,
        designNo: design?.designNo,
        designName: design?.name,
      };
    });
  }

  // ---------------------------------------------------------------- create / confirm

  async create(
    dto: CreateJobReceiptDto,
    actorId: string,
    opts: { canEditCharges?: boolean } = {},
  ): Promise<JobReceiptDocument> {
    if (hasValue(dto.manufacturingCharges) && !opts.canEditCharges) {
      throw new ForbiddenProblemException(
        'Entering manufacturing charges on a receipt needs the receipt.charges.edit permission.',
      );
    }
    if (dto.allowOverReceipt && !dto.remarks?.trim()) {
      throw new ValidationFailedException(
        { remarks: 'A reason is required to accept more than expected.' },
        'A reason (remarks) is required to accept more than the expected quantity.',
      );
    }
    if (!Types.ObjectId.isValid(dto.jobSlipId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    }
    const jobSlip = await this.jobSlipModel.findById(dto.jobSlipId);
    if (!jobSlip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    if (!RECEIVABLE_STATUSES.includes(jobSlip.status)) {
      throw new InvalidStateTransitionException(
        `Cannot receive against a job slip in status ${jobSlip.status}. Material must be issued first, and received/closed/cancelled jobs cannot receive.`,
      );
    }

    const lines = await this.normaliseLines(jobSlip, dto.lines);
    const warnings = await this.checkQuantities(jobSlip, lines, !!dto.allowOverReceipt, null);

    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('JOB_RECEIPT', fy, 'JR');
    const docNo = await this.numberSeries.next('JOB_RECEIPT', fy);

    const created = await this.model.create({
      docNo,
      docDate: new Date(),
      jobSlipId: jobSlip._id,
      jobWorkerId: jobSlip.jobWorkerId,
      lines,
      otherCharges: dto.otherCharges,
      chargeOverride: dto.manufacturingCharges,
      remarks: dto.remarks,
      shortageReason: dto.shortageReason,
      warnings,
      status: 'DRAFT',
      createdBy: actorId,
      updatedBy: actorId,
    });

    if (dto.confirm) return this.confirm(String(created._id), actorId);
    return created;
  }

  /**
   * Validates shape per job type and returns stored lines (ObjectIds, expectedQty filled from
   * the job slip). Throws 422 on anything that cannot be posted.
   */
  private async normaliseLines(jobSlip: JobSlipDocument, input: CreateJobReceiptDto['lines']) {
    const expectedByKey = new Map<string, number>();
    for (const e of jobSlip.expectedOutputLines) {
      const k = outputKey(e);
      expectedByKey.set(k, roundQty((expectedByKey.get(k) ?? 0) + e.expectedQty));
    }
    const seen = new Set<string>();
    const out: any[] = [];

    for (const [i, l] of input.entries()) {
      let line: ReceiptLineLike;
      if (jobSlip.jobType === 'MANUFACTURING') {
        if (!l.colourId || !l.sizeId) {
          throw new ValidationFailedException(
            { [`lines.${i}`]: 'colourId and sizeId are required' },
            'Every receiving row needs a colour and a size.',
          );
        }
        const rejected = l.rejectedQty ?? 0;
        const damaged = l.damagedQty ?? 0;
        const accepted = l.acceptedQty ?? l.receivedQty - rejected - damaged;
        if (accepted < -EPS || Math.abs(accepted + rejected + damaged - l.receivedQty) > EPS) {
          throw new ValidationFailedException(
            { [`lines.${i}`]: 'accepted + rejected + damaged must equal receivedQty' },
            'Accepted + rejected + damaged must equal the received quantity on every row.',
          );
        }
        line = {
          colourId: l.colourId,
          sizeId: l.sizeId,
          receivedQty: l.receivedQty,
          acceptedQty: accepted,
          rejectedQty: rejected,
          damagedQty: damaged,
        };
      } else {
        let mv = l.materialVariantId;
        const expectedMvs = jobSlip.expectedOutputLines
          .map((e) => e.materialVariantId)
          .filter(Boolean);
        if (!mv && expectedMvs.length === 1) mv = String(expectedMvs[0]);
        if (!mv) {
          throw new ValidationFailedException(
            { [`lines.${i}.materialVariantId`]: 'required' },
            'A processing receipt row must name the output (processed) material variant.',
          );
        }
        if ((l.rejectedQty ?? 0) > 0 || (l.damagedQty ?? 0) > 0) {
          throw new ValidationFailedException(
            { [`lines.${i}`]: 'rejected/damaged not applicable' },
            'A processing receipt has no rejected/damaged split - record only the quantity received.',
          );
        }
        line = {
          materialVariantId: mv,
          receivedQty: l.receivedQty,
          acceptedQty: l.receivedQty,
          rejectedQty: 0,
          damagedQty: 0,
        };
      }

      const key = outputKey(line);
      if (seen.has(key)) {
        throw new ValidationFailedException(
          { [`lines.${i}`]: 'duplicate' },
          'The same colour/size (or output material) appears twice - combine the rows.',
        );
      }
      seen.add(key);
      if (expectedByKey.size > 0 && !expectedByKey.has(key)) {
        throw new ValidationFailedException(
          { [`lines.${i}`]: 'not on the job slip' },
          jobSlip.jobType === 'MANUFACTURING'
            ? "This colour/size is not part of the job slip's expected output."
            : "This output material is not the job slip's expected output.",
        );
      }
      if (line.receivedQty <= 0) continue;

      if (jobSlip.jobType === 'MANUFACTURING') {
        const variant = await this.designVariantModel
          .findOne({
            designId: jobSlip.designId,
            colourId: new Types.ObjectId(String(line.colourId)),
            sizeId: new Types.ObjectId(String(line.sizeId)),
          })
          .lean();
        if (!variant) {
          throw new ValidationFailedException(
            { [`lines.${i}`]: 'no design variant' },
            'No design variant exists for this colour/size.',
          );
        }
      }

      out.push({
        colourId: line.colourId ? new Types.ObjectId(String(line.colourId)) : undefined,
        sizeId: line.sizeId ? new Types.ObjectId(String(line.sizeId)) : undefined,
        materialVariantId: line.materialVariantId
          ? new Types.ObjectId(String(line.materialVariantId))
          : undefined,
        expectedQty: expectedByKey.get(key) ?? 0,
        receivedQty: roundQty(line.receivedQty),
        acceptedQty: roundQty(line.acceptedQty ?? 0),
        rejectedQty: roundQty(line.rejectedQty ?? 0),
        damagedQty: roundQty(line.damagedQty ?? 0),
      });
    }

    if (out.length === 0) {
      throw new ValidationFailedException(
        { lines: 'at least one row must have a quantity' },
        'Enter a received quantity on at least one row.',
      );
    }
    return out;
  }

  /**
   * Over-receipt (vs expected + CompanySettings.overReceiptTolerancePct) and custody checks.
   * Over-receipt is blocked unless explicitly allowed with a reason (then recorded as a warning).
   * Material: a garment receipt may not need more standard material than this job still holds
   * in custody (STK-06 - custody can never go negative); processing needs something in custody.
   */
  private async checkQuantities(
    jobSlip: JobSlipDocument,
    lines: ReceiptLineLike[],
    allowOverReceipt: boolean,
    session: ClientSession | null,
    excludeReceiptId?: Types.ObjectId,
  ): Promise<string[]> {
    const warnings: string[] = [];
    const settings = await this.companySettings.get();
    const tolerancePct = settings?.overReceiptTolerancePct ?? 0;

    const expected = new Map<string, number>();
    for (const e of jobSlip.expectedOutputLines) {
      const k = outputKey(e);
      expected.set(k, roundQty((expected.get(k) ?? 0) + e.expectedQty));
    }
    const confirmed = await this.model
      .find({
        jobSlipId: jobSlip._id,
        status: 'CONFIRMED',
        ...(excludeReceiptId ? { _id: { $ne: excludeReceiptId } } : {}),
      })
      .session(session)
      .lean();
    const already = new Map<string, number>();
    for (const r of confirmed) {
      for (const l of r.lines) {
        already.set(outputKey(l), roundQty((already.get(outputKey(l)) ?? 0) + l.receivedQty));
      }
    }
    const incoming = new Map<string, number>();
    for (const l of lines) {
      incoming.set(outputKey(l), roundQty((incoming.get(outputKey(l)) ?? 0) + l.receivedQty));
    }

    const over = findOverReceipts(expected, already, incoming, tolerancePct);
    if (over.length) {
      const names = await this.keyNames(over.map((o) => o.key));
      const text = over
        .map(
          (o) =>
            `${names.get(o.key) ?? o.key}: ${o.cumulative} received vs ${o.expected} expected (max ${o.allowed})`,
        )
        .join('; ');
      if (!allowOverReceipt) {
        throw new OverReceiptToleranceExceededException(
          `Receiving more than expected - ${text}. Correct the quantities, or accept the over-receipt with a reason.`,
          { overReceipts: over.map((o) => ({ ...o, name: names.get(o.key) })) },
        );
      }
      warnings.push(`Over-receipt accepted: ${text}`);
    }

    const matLines = await this.materialLineModel
      .find({ jobSlipId: jobSlip._id })
      .session(session)
      .lean();
    const remainingByItem = new Map<string, number>();
    for (const m of matLines) {
      const rem = roundQty(m.qtyIssued - m.qtyReturned - m.qtyConsumed - m.qtyWrittenOff);
      const k = String(m.stockItemId);
      remainingByItem.set(k, roundQty((remainingByItem.get(k) ?? 0) + rem));
    }

    if (jobSlip.jobType === 'MANUFACTURING') {
      const pieces = lines.reduce((s, l) => s + l.receivedQty, 0);
      const bomLines = await this.getBomLines(jobSlip, session);
      const need = standardConsumption(pieces, bomLines);
      const short: Array<{
        materialVariantId: string;
        name?: string;
        required: number;
        inCustody: number;
        shortBy: number;
      }> = [];
      for (const [mvId, required] of need) {
        const item = await this.stockItemModel
          .findOne({ materialVariantId: new Types.ObjectId(mvId) })
          .session(session)
          .lean();
        const inCustody = item ? (remainingByItem.get(String(item._id)) ?? 0) : 0;
        if (required > inCustody + EPS) {
          short.push({
            materialVariantId: mvId,
            required,
            inCustody,
            shortBy: roundQty(required - inCustody),
          });
        }
      }
      if (short.length) {
        const names = await this.lookup.materialVariants(short.map((s) => s.materialVariantId));
        for (const s of short) s.name = names.get(s.materialVariantId)?.name;
        throw new InsufficientStockException(
          `Not enough material with the factory for ${pieces} pieces: ` +
            short
              .map(
                (s) =>
                  `${s.name ?? s.materialVariantId} needs ${s.required}, only ${s.inCustody} left in custody for this job`,
              )
              .join('; ') +
            '. Issue more material first, or check the quantities.',
          { materials: short },
        );
      }
    } else {
      const totalRemaining = [...remainingByItem.values()].reduce((s, v) => s + v, 0);
      if (totalRemaining <= EPS) {
        throw new InsufficientStockException(
          'This processing job has no material left in custody to convert. Issue material first.',
        );
      }
    }
    return warnings;
  }

  private async keyNames(keys: string[]): Promise<Map<string, string>> {
    const mvIds = keys.filter((k) => k.startsWith('mv:')).map((k) => k.slice(3));
    const cs = keys.filter((k) => k.startsWith('cs:')).map((k) => k.slice(3).split('|'));
    const [mvs, colours, sizes] = await Promise.all([
      this.lookup.materialVariants(mvIds),
      this.lookup.colours(cs.map((c) => c[0])),
      this.lookup.sizes(cs.map((c) => c[1])),
    ]);
    const out = new Map<string, string>();
    for (const id of mvIds) out.set(`mv:${id}`, mvs.get(id)?.name ?? id);
    for (const [c, s] of cs) {
      out.set(`cs:${c}|${s}`, `${colours.get(c) ?? c} / ${sizes.get(s) ?? s}`);
    }
    return out;
  }

  async confirm(id: string, actorId: string): Promise<JobReceiptDocument> {
    return this.transactionService.run(async (session) => {
      const receipt = await this.model.findById(id).session(session);
      if (!receipt) throw new ProblemException('NOT_FOUND', 404, 'Job receipt not found.');
      if (receipt.status !== 'DRAFT') {
        throw new InvalidStateTransitionException(`Job receipt is already ${receipt.status}.`);
      }

      const jobSlip = await this.jobSlipModel.findById(receipt.jobSlipId).session(session);
      if (!jobSlip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
      if (!RECEIVABLE_STATUSES.includes(jobSlip.status)) {
        throw new InvalidStateTransitionException(
          `Cannot confirm a receipt against a job slip in status ${jobSlip.status}.`,
        );
      }
      // Re-check inside the transaction: another receipt may have been confirmed since the draft.
      const allowOver = (receipt.warnings ?? []).some((w) => w.startsWith('Over-receipt accepted'));
      await this.checkQuantities(
        jobSlip,
        receipt.lines as unknown as ReceiptLineLike[],
        allowOver,
        session,
        receipt._id as Types.ObjectId,
      );

      if (jobSlip.jobType === 'MANUFACTURING') {
        await this.confirmManufacturing(receipt, jobSlip, session, actorId);
      } else {
        await this.confirmProcessing(receipt, jobSlip, session, actorId);
      }

      receipt.status = 'CONFIRMED';
      receipt.confirmedBy = actorId as any;
      receipt.confirmedAt = new Date();
      receipt.updatedBy = actorId as any;
      receipt.version += 1;
      await receipt.save({ session });

      await this.jobSlipsService.recomputeReceiptStatus(String(jobSlip._id), session);
      await this.costingService.writeCostSheet(String(jobSlip._id), session);
      return receipt;
    });
  }

  private async confirmManufacturing(
    receipt: JobReceiptDocument,
    jobSlip: JobSlipDocument,
    session: ClientSession,
    actorId: string,
  ): Promise<void> {
    const bomLines = await this.getBomLines(jobSlip, session);

    const totalPieces = receipt.lines.reduce(
      (sum, l) => sum + (l.acceptedQty ?? 0) + (l.rejectedQty ?? 0) + (l.damagedQty ?? 0),
      0,
    );
    const totalAccepted = receipt.lines.reduce((sum, l) => sum + (l.acceptedQty ?? 0), 0);

    // Consumption (SHR-02): pieces x BOM (standard), drawn from this job's own custody lots.
    for (const [mvId, requiredQty] of standardConsumption(totalPieces, bomLines)) {
      if (requiredQty <= 0) continue;
      const stockItem = await this.stockItemsService.getOrCreateForMaterialVariant(mvId, session);
      await this.consumeFromJobCustody(
        jobSlip,
        String(stockItem._id),
        requiredQty,
        session,
        actorId,
        receipt,
      );
    }

    // Provisional cost (tech.md §6.4): materialToDate / expectedPieces + thisReceiptCharges / thisReceiptAccepted.
    const materialToDate = await this.materialCostToDate(jobSlip._id as Types.ObjectId, session);
    const expectedPieces =
      jobSlip.expectedOutputLines.reduce((sum, l) => sum + l.expectedQty, 0) || totalPieces || 1;

    const override = hasValue(receipt.chargeOverride);
    const manufacturingCharge = override
      ? roundMoney(receipt.chargeOverride!)
      : this.computeCharge(jobSlip.chargeBasis, jobSlip.agreedRate, totalAccepted);
    await this.writeCharge(
      jobSlip._id as Types.ObjectId,
      receipt._id as Types.ObjectId,
      'MANUFACTURING',
      override ? 'LUMP_SUM' : jobSlip.chargeBasis,
      override ? 1 : totalAccepted,
      override ? manufacturingCharge : jobSlip.agreedRate,
      manufacturingCharge,
      session,
      override ? 'Entered on receipt' : undefined,
    );

    let otherChargeAmount = 0;
    if (receipt.otherCharges) {
      otherChargeAmount = receipt.otherCharges;
      await this.writeCharge(
        jobSlip._id as Types.ObjectId,
        receipt._id as Types.ObjectId,
        'OTHER',
        'LUMP_SUM',
        1,
        receipt.otherCharges,
        receipt.otherCharges,
        session,
        'Receipt expenses',
      );
    }

    const thisReceiptCharges = roundMoney(toDecimal(manufacturingCharge).plus(otherChargeAmount));
    const materialPerPiece = toDecimal(materialToDate).dividedBy(expectedPieces);
    const provisionalUnitCost =
      totalAccepted > 0
        ? roundUnitCost(
            materialPerPiece.plus(toDecimal(thisReceiptCharges).dividedBy(totalAccepted)),
          )
        : roundUnitCost(materialPerPiece);
    const quarantineUnitCost = roundUnitCost(materialPerPiece);

    const warehouse = await this.locationByCode('MAIN-WH', session);
    const quarantine = await this.locationByCode('QUARANTINE', session);
    const production = await this.locationByCode('VIRT-PRODUCTION', session);

    for (const line of receipt.lines) {
      const accepted = line.acceptedQty ?? 0;
      const rejectedAndDamaged = (line.rejectedQty ?? 0) + (line.damagedQty ?? 0);
      if (accepted <= 0 && rejectedAndDamaged <= 0) continue;

      const designVariant = await this.designVariantModel
        .findOne({ designId: jobSlip.designId, colourId: line.colourId, sizeId: line.sizeId })
        .session(session)
        .lean();
      if (!designVariant) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          'No design variant exists for this colour/size.',
        );
      }
      const finishedItem = await this.stockItemsService.getOrCreateForDesignVariant(
        String(designVariant._id),
        session,
      );

      if (accepted > 0) {
        const posted = await this.stockService.post(
          [
            {
              type: 'PRODUCTION_RECEIPT',
              stockItemId: String(finishedItem._id),
              fromLocationId: String(production._id),
              toLocationId: String(warehouse._id),
              qty: accepted,
              unitCost: provisionalUnitCost,
              lotOrigin: {
                originDocType: 'PRODUCTION_RECEIPT',
                originDocId: receipt._id as any,
                originJobSlipId: jobSlip._id as any,
              },
              doc: { type: 'JOB_RECEIPT', id: String(receipt._id), lineId: String(line._id) },
            },
          ],
          session,
          actorId,
        );
        line.createdLotId = new Types.ObjectId(posted[0].lotId) as any;
      }

      if (rejectedAndDamaged > 0) {
        // JOB-10 / A-17: rejected and damaged pieces go to QUARANTINE - visible, never sellable.
        await this.stockService.post(
          [
            {
              type: 'REJECTION',
              stockItemId: String(finishedItem._id),
              fromLocationId: String(production._id),
              toLocationId: String(quarantine._id),
              qty: rejectedAndDamaged,
              unitCost: quarantineUnitCost,
              lotOrigin: {
                originDocType: 'PRODUCTION_RECEIPT',
                originDocId: receipt._id as any,
                originJobSlipId: jobSlip._id as any,
              },
              doc: { type: 'JOB_RECEIPT', id: String(receipt._id), lineId: String(line._id) },
              reason: `Rejected ${line.rejectedQty ?? 0}, damaged ${line.damagedQty ?? 0}`,
            },
          ],
          session,
          actorId,
        );
      }
    }
  }

  /**
   * JOB-08 / SHR-01 / CST-05. A processing receipt converts the job's whole remaining custody
   * (the input sent) into the output received: Shortage = Sent - Received, fixed on the
   * receipt. The output lot carries (material + charges) / received, so the processing cost
   * flows into any garment job that later consumes it. A second processing receipt needs
   * fresh material in custody (checkQuantities blocks it otherwise).
   */
  private async confirmProcessing(
    receipt: JobReceiptDocument,
    jobSlip: JobSlipDocument,
    session: ClientSession,
    actorId: string,
  ): Promise<void> {
    const remainingLines = await this.materialLineModel
      .find({ jobSlipId: jobSlip._id })
      .session(session);
    const custody = await this.custodyLocation(jobSlip.jobWorkerId, session);
    const production = await this.locationByCode('VIRT-PRODUCTION', session);
    let materialCost = new Decimal(0);
    let sent = new Decimal(0);
    for (const line of remainingLines) {
      const remaining = roundQty(
        line.qtyIssued - line.qtyReturned - line.qtyConsumed - line.qtyWrittenOff,
      );
      if (remaining <= 0) continue;

      await this.stockService.post(
        [
          {
            type: 'CONSUMPTION',
            stockItemId: String(line.stockItemId),
            lotId: String(line.lotId),
            fromLocationId: String(custody._id),
            toLocationId: String(production._id),
            qty: remaining,
            doc: { type: 'JOB_RECEIPT', id: String(receipt._id) },
          },
        ],
        session,
        actorId,
      );
      line.qtyConsumed = roundQty(line.qtyConsumed + remaining);
      await line.save({ session });
      materialCost = materialCost.plus(toDecimal(remaining).times(line.unitCost));
      sent = sent.plus(remaining);
    }

    const totalReceived = roundQty(receipt.lines.reduce((sum, l) => sum + l.receivedQty, 0));
    const override = hasValue(receipt.chargeOverride);
    const processingCharge = override
      ? roundMoney(receipt.chargeOverride!)
      : this.computeCharge(jobSlip.chargeBasis, jobSlip.agreedRate, totalReceived);
    await this.writeCharge(
      jobSlip._id as Types.ObjectId,
      receipt._id as Types.ObjectId,
      'PROCESSING',
      override ? 'LUMP_SUM' : jobSlip.chargeBasis,
      override ? 1 : totalReceived,
      override ? processingCharge : jobSlip.agreedRate,
      processingCharge,
      session,
      override ? 'Entered on receipt' : undefined,
    );

    let otherChargeAmount = 0;
    if (receipt.otherCharges) {
      otherChargeAmount = receipt.otherCharges;
      await this.writeCharge(
        jobSlip._id as Types.ObjectId,
        receipt._id as Types.ObjectId,
        'OTHER',
        'LUMP_SUM',
        1,
        receipt.otherCharges,
        receipt.otherCharges,
        session,
        'Receipt expenses',
      );
    }

    const totalCharges = roundMoney(toDecimal(processingCharge).plus(otherChargeAmount));
    const provisionalUnitCost =
      totalReceived > 0
        ? roundUnitCost(materialCost.plus(totalCharges).dividedBy(totalReceived))
        : 0;

    const sentQty = roundQty(sent);
    const shortageQty = roundQty(sent.minus(totalReceived));
    receipt.processingSummary = {
      sentQty,
      receivedQty: totalReceived,
      shortageQty,
      shortagePct:
        sentQty > 0 ? roundQty(toDecimal(shortageQty).dividedBy(sentQty).times(100)) : 0,
    };

    const warehouse = await this.locationByCode('MAIN-WH', session);
    for (const line of receipt.lines) {
      if (line.receivedQty <= 0 || !line.materialVariantId) continue;
      const outputItem = await this.stockItemsService.getOrCreateForMaterialVariant(
        String(line.materialVariantId),
        session,
        'PROCESSED_MATERIAL',
      );
      const posted = await this.stockService.post(
        [
          {
            type: 'PROCESS_OUTPUT',
            stockItemId: String(outputItem._id),
            fromLocationId: String(production._id),
            toLocationId: String(warehouse._id),
            qty: line.receivedQty,
            unitCost: provisionalUnitCost,
            lotOrigin: {
              originDocType: 'PROCESS_OUTPUT',
              originDocId: receipt._id as any,
              originJobSlipId: jobSlip._id as any,
            },
            doc: { type: 'JOB_RECEIPT', id: String(receipt._id), lineId: String(line._id) },
          },
        ],
        session,
        actorId,
      );
      line.createdLotId = new Types.ObjectId(posted[0].lotId) as any;
    }
  }

  async cancel(id: string, reason: string, actorId: string): Promise<JobReceiptDocument> {
    const receipt = await this.model.findById(id);
    if (!receipt) throw new ProblemException('NOT_FOUND', 404, 'Job receipt not found.');
    if (receipt.status !== 'DRAFT') {
      throw new InvalidStateTransitionException(
        'Only a draft job receipt can be cancelled. A confirmed receipt has posted stock.',
      );
    }
    receipt.status = 'CANCELLED';
    receipt.cancelReason = reason;
    receipt.cancelledBy = actorId as any;
    receipt.cancelledAt = new Date();
    receipt.updatedBy = actorId as any;
    receipt.version += 1;
    await receipt.save();
    return receipt;
  }

  // ---- helpers ----

  async getBomLines(
    jobSlip: { productionOrderId?: Types.ObjectId; designId?: Types.ObjectId },
    session: ClientSession | null,
  ): Promise<JobBomLine[]> {
    if (jobSlip.productionOrderId) {
      const order = await this.productionOrderModel
        .findById(jobSlip.productionOrderId)
        .session(session)
        .lean();
      if (order) {
        const bomVersion = await this.bomVersionModel
          .findById(order.bomVersionId)
          .session(session)
          .lean();
        if (bomVersion) return bomVersion.lines;
      }
    }
    if (!jobSlip.designId) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'Choose the design for this job slip before receiving finished goods.',
        { designId: 'required' },
      );
    }
    const current = await this.designsService.getCurrentBom(String(jobSlip.designId));
    if (!current) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'This design has no active BOM configured.',
      );
    }
    return current.lines;
  }

  private async materialCostToDate(
    jobSlipId: Types.ObjectId,
    session: ClientSession,
  ): Promise<number> {
    const lines = await this.materialLineModel.find({ jobSlipId }).session(session).lean();
    let total = new Decimal(0);
    for (const l of lines) {
      total = total.plus(toDecimal(l.qtyIssued - l.qtyReturned).times(l.unitCost));
    }
    return roundMoney(total);
  }

  private computeCharge(basis: string, rate: number, quantity: number): number {
    if (basis === 'LUMP_SUM') return roundMoney(rate);
    return roundMoney(toDecimal(rate).times(quantity));
  }

  private async writeCharge(
    jobSlipId: Types.ObjectId,
    receiptId: Types.ObjectId,
    kind: 'PROCESSING' | 'MANUFACTURING' | 'OTHER',
    basis: string,
    quantity: number,
    rate: number,
    amount: number,
    session: ClientSession,
    note?: string,
  ): Promise<void> {
    // A job slip's LUMP_SUM rate is the whole job's charge: written once, on the first receipt.
    if (basis === 'LUMP_SUM' && kind !== 'OTHER' && !note) {
      const existing = await this.chargeModel.exists({ jobSlipId, kind }).session(session);
      if (existing) return;
    }
    await this.chargeModel.create(
      [{ jobSlipId, receiptId, kind, basis, quantity, rate, amount, note }],
      { session },
    );
  }

  private async custodyLocation(jobWorkerId: Types.ObjectId, session: ClientSession) {
    return this.locationByCode(`CUSTODY-${jobWorkerId}`, session);
  }

  private async locationByCode(code: string, session: ClientSession) {
    const loc = await this.locationModel.findOne({ code }).session(session).lean();
    if (!loc) {
      throw new ProblemException('VALIDATION_FAILED', 500, `Location ${code} is not seeded.`);
    }
    return loc;
  }

  /** Consumes from THIS job's own custody lots, oldest lot first (tech.md §5.7/§7.3). */
  private async consumeFromJobCustody(
    jobSlip: JobSlipDocument,
    stockItemId: string,
    qtyNeeded: number,
    session: ClientSession,
    actorId: string,
    receipt: JobReceiptDocument,
  ): Promise<void> {
    const lines = await this.materialLineModel
      .find({ jobSlipId: jobSlip._id, stockItemId: new Types.ObjectId(stockItemId) })
      .session(session);
    const lots = await this.lotModel
      .find({ _id: { $in: lines.map((l) => l.lotId) } })
      .session(session)
      .lean();
    const receivedOnByLot = new Map(lots.map((l) => [String(l._id), l.receivedOn.getTime()]));

    const candidates = lines
      .map((l) => ({
        line: l,
        remaining: roundQty(l.qtyIssued - l.qtyReturned - l.qtyConsumed - l.qtyWrittenOff),
      }))
      .filter((c) => c.remaining > 0)
      .sort(
        (a, b) =>
          (receivedOnByLot.get(String(a.line.lotId)) ?? 0) -
          (receivedOnByLot.get(String(b.line.lotId)) ?? 0),
      );

    const custody = await this.custodyLocation(jobSlip.jobWorkerId, session);
    const production = await this.locationByCode('VIRT-PRODUCTION', session);

    let remaining = toDecimal(qtyNeeded);
    for (const { line, remaining: available } of candidates) {
      if (remaining.lte(0)) break;
      const take = roundQty(Decimal.min(remaining, available));
      if (take <= 0) continue;

      await this.stockService.post(
        [
          {
            type: 'CONSUMPTION',
            stockItemId,
            lotId: String(line.lotId),
            fromLocationId: String(custody._id),
            toLocationId: String(production._id),
            qty: take,
            doc: { type: 'JOB_RECEIPT', id: String(receipt._id) },
          },
        ],
        session,
        actorId,
      );

      line.qtyConsumed = roundQty(line.qtyConsumed + take);
      await line.save({ session });
      remaining = remaining.minus(take);
    }

    if (remaining.gt(EPS)) {
      throw new InsufficientStockException(
        `Job ${jobSlip.docNo} does not have enough material in custody to consume the required quantity (short by ${remaining.toFixed(3)}).`,
      );
    }
  }
}

import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { JobSlip, JobSlipDocument, JobSlipStatus } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { JobReceipt, JobReceiptDocument } from './schemas/job-receipt.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockService } from '../inventory/stock.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { CostingService } from '../costing/costing.service';
import { roundQty } from '../common/utils/decimal';
import {
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { CreateJobSlipDto, UpdateJobSlipDto } from './dto/job-slip.dto';
import { JobSlipStockCheckService } from './job-slip-stock-check.service';

export interface ReconciliationLine {
  jobMaterialLineId: string;
  stockItemId: string;
  lotId: string;
  bomRole?: string;
  issued: number;
  returned: number;
  consumed: number;
  writtenOff: number;
  shortage: number;
  shortagePct: number;
  remaining: number;
  toleranceExceeded: boolean;
}

export interface ReconciliationResult {
  jobSlipId: string;
  tolerancePct: number;
  lines: ReconciliationLine[];
  canClose: boolean;
}

/** JOB-02, JOB-03, JOB-12, JOB-13, SHR-01 to SHR-04. */
@Injectable()
export class JobSlipsService {
  constructor(
    @InjectModel(JobSlip.name) private readonly model: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly stockService: StockService,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
    @Inject(forwardRef(() => CostingService)) private readonly costingService: CostingService,
    private readonly stockCheck: JobSlipStockCheckService,
  ) {}

  list(filter: Record<string, unknown> = {}) {
    const castFilter = { ...filter };
    for (const key of ['jobWorkerId', 'designId', 'productionOrderId']) {
      if (typeof castFilter[key] === 'string')
        castFilter[key] = new Types.ObjectId(castFilter[key] as string);
    }
    return this.model.find(castFilter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    return doc;
  }

  /** JOB-13: expected completion date passed and job not closed (or cancelled). */
  overdue() {
    return this.model
      .find({
        status: { $nin: ['CLOSED', 'CANCELLED'] },
        expectedCompletionDate: { $lt: new Date() },
      })
      .sort({ expectedCompletionDate: 1 })
      .lean();
  }

  async create(dto: CreateJobSlipDto, actorId: string): Promise<JobSlipDocument> {
    // Blocks (409 INSUFFICIENT_STOCK) when the design's BOM material is not in MAIN-WH.
    // Runs before the number series is advanced so a refused slip never burns a doc number.
    await this.stockCheck.assertMaterialsAvailable(dto);

    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('JOB_SLIP', fy, 'JS');
    const docNo = await this.numberSeries.next('JOB_SLIP', fy);

    return this.model.create({
      docNo,
      docDate: (dto as any).docDate ? new Date((dto as any).docDate) : new Date(),
      jobType: dto.jobType,
      jobWorkerId: new Types.ObjectId(dto.jobWorkerId),
      designId: dto.designId ? new Types.ObjectId(dto.designId) : undefined,
      materialBased: (dto as any).materialBased === true,
      challanNo: dto.challanNo?.trim() || undefined,
      lotNo: dto.lotNo?.trim() || undefined,
      parentJobSlipId: (dto as any).parentJobSlipId
        ? new Types.ObjectId(String((dto as any).parentJobSlipId))
        : undefined,
      partLabel: (dto as any).partLabel,
      productionOrderId: dto.productionOrderId
        ? new Types.ObjectId(dto.productionOrderId)
        : undefined,
      processingTypeId: dto.processingTypeId ? new Types.ObjectId(dto.processingTypeId) : undefined,
      expectedOutputLines: dto.expectedOutputLines.map((l) => ({
        colourId: l.colourId ? new Types.ObjectId(l.colourId) : undefined,
        sizeId: l.sizeId ? new Types.ObjectId(l.sizeId) : undefined,
        materialVariantId: l.materialVariantId
          ? new Types.ObjectId(l.materialVariantId)
          : undefined,
        expectedQty: l.expectedQty,
      })),
      expectedCompletionDate: dto.expectedCompletionDate
        ? new Date(dto.expectedCompletionDate)
        : undefined,
      chargeBasis: dto.chargeBasis,
      agreedRate: dto.agreedRate,
      instructions: dto.instructions,
      remarks: dto.remarks,
      status: 'CREATED',
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  /**
   * Header edits. Dates/instructions/remarks: any open slip. Charge basis and rate: only until
   * the first receipt (the charge is written from them at receipt confirm, BR-13). Party: only
   * while CREATED (no material is in anyone's custody yet). Closed/cancelled slips are locked.
   */
  async update(id: string, dto: UpdateJobSlipDto, actorId: string): Promise<JobSlipDocument> {
    const slip = await this.model.findById(id);
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    if (slip.status === 'CLOSED' || slip.status === 'CANCELLED') {
      throw new InvalidStateTransitionException(
        `A ${slip.status.toLowerCase()} job slip cannot be edited.`,
      );
    }

    const preReceipt: JobSlipStatus[] = ['CREATED', 'MATERIAL_ISSUED', 'IN_PROCESS', 'READY'];
    const rateChanged =
      (dto.chargeBasis !== undefined && dto.chargeBasis !== slip.chargeBasis) ||
      (dto.agreedRate !== undefined && dto.agreedRate !== slip.agreedRate);
    if (rateChanged && !preReceipt.includes(slip.status)) {
      throw new InvalidStateTransitionException(
        'Charge basis and rate cannot change after goods have been received against this slip.',
      );
    }
    if (dto.jobWorkerId !== undefined && dto.jobWorkerId !== String(slip.jobWorkerId)) {
      if (slip.status !== 'CREATED') {
        throw new InvalidStateTransitionException(
          'The factory/karigar can only be changed before any material is issued.',
        );
      }
      slip.jobWorkerId = new Types.ObjectId(dto.jobWorkerId);
    }

    if (dto.expectedCompletionDate !== undefined)
      slip.expectedCompletionDate = new Date(dto.expectedCompletionDate);
    if (dto.chargeBasis !== undefined) slip.chargeBasis = dto.chargeBasis;
    if (dto.agreedRate !== undefined) slip.agreedRate = dto.agreedRate;
    if (dto.instructions !== undefined) slip.instructions = dto.instructions;
    if (dto.remarks !== undefined) slip.remarks = dto.remarks;
    slip.updatedBy = actorId as any;
    slip.version += 1;
    await slip.save();
    return slip;
  }

  /** Portal (and internal) status updates - never has a stock effect (BR-14). */
  async setStatus(
    id: string,
    next: 'IN_PROCESS' | 'READY',
    actorId: string,
  ): Promise<JobSlipDocument> {
    const slip = await this.model.findById(id);
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');

    const allowed: Record<JobSlipStatus, JobSlipStatus[]> = {
      CREATED: [],
      MATERIAL_ISSUED: ['IN_PROCESS', 'READY'],
      IN_PROCESS: ['READY'],
      READY: [],
      PARTIALLY_RECEIVED: [],
      RECEIVED: [],
      CLOSED: [],
      CANCELLED: [],
    };
    if (!allowed[slip.status].includes(next)) {
      throw new InvalidStateTransitionException(
        `Cannot move a job slip from ${slip.status} to ${next}.`,
      );
    }

    slip.status = next;
    slip.updatedBy = actorId as any;
    slip.version += 1;
    await slip.save();
    return slip;
  }

  /** Called by MaterialIssuesService after the first confirmed issue against this slip. */
  async markMaterialIssued(id: string, session: ClientSession): Promise<void> {
    await this.model.updateOne(
      { _id: id, status: 'CREATED' },
      { $set: { status: 'MATERIAL_ISSUED' } },
      { session },
    );
  }

  /** Called by JobReceiptsService after a confirmed receipt: PARTIALLY_RECEIVED or RECEIVED. */
  async recomputeReceiptStatus(id: string, session: ClientSession): Promise<void> {
    const slip = await this.model.findById(id).session(session).lean();
    if (!slip) return;
    const totalExpected = slip.expectedOutputLines.reduce((sum, l) => sum + l.expectedQty, 0);

    const receipts = await this.receiptModel
      .find({ jobSlipId: slip._id, status: 'CONFIRMED' })
      .session(session)
      .lean();
    let totalReceived = 0;
    for (const receipt of receipts) {
      for (const line of receipt.lines) totalReceived += line.receivedQty;
    }

    const nextStatus: JobSlipStatus =
      totalReceived >= totalExpected - 0.0005 ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    if (nextStatus !== slip.status) {
      await this.model.updateOne({ _id: id }, { $set: { status: nextStatus } }, { session });
    }
  }

  /** JOB-14/BR-14: a claim only - no stock effect. Company staff turn this into a real JobReceipt. */
  async declareDispatch(
    id: string,
    qty: number,
    note: string | undefined,
    actorId: string,
  ): Promise<JobSlipDocument> {
    const slip = await this.model.findById(id);
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    slip.dispatchDeclarations.push({ qty, note, declaredAt: new Date() } as any);
    slip.updatedBy = actorId as any;
    slip.version += 1;
    await slip.save();
    return slip;
  }

  async shortClose(id: string, reason: string, actorId: string): Promise<JobSlipDocument> {
    const slip = await this.model.findById(id);
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    if (slip.status !== 'PARTIALLY_RECEIVED') {
      throw new InvalidStateTransitionException(
        'Only a partially-received job slip can be short-closed.',
      );
    }
    slip.status = 'RECEIVED';
    slip.remarks = [slip.remarks, `Short-closed: ${reason}`].filter(Boolean).join(' | ');
    slip.updatedBy = actorId as any;
    slip.version += 1;
    await slip.save();
    return slip;
  }

  /** SHR-02, prd.md §5.4. */
  async getReconciliation(jobSlipId: string): Promise<ReconciliationResult> {
    const settings = await this.companySettings.get();
    const tolerancePct = settings?.shortageTolerancePct ?? 0;

    const lines = await this.materialLineModel
      .find({ jobSlipId: new Types.ObjectId(jobSlipId) })
      .lean();
    const reconLines: ReconciliationLine[] = lines.map((l) => {
      const shortage = roundQty(l.qtyIssued - l.qtyReturned - l.qtyConsumed);
      const shortagePct = l.qtyIssued > 0 ? roundQty((shortage / l.qtyIssued) * 100) : 0;
      const remaining = roundQty(l.qtyIssued - l.qtyReturned - l.qtyConsumed - l.qtyWrittenOff);
      return {
        jobMaterialLineId: String(l._id),
        stockItemId: String(l.stockItemId),
        lotId: String(l.lotId),
        bomRole: l.bomRole,
        issued: l.qtyIssued,
        returned: l.qtyReturned,
        consumed: l.qtyConsumed,
        writtenOff: l.qtyWrittenOff,
        shortage,
        shortagePct,
        remaining,
        toleranceExceeded: shortagePct > tolerancePct,
      };
    });

    return {
      jobSlipId,
      tolerancePct,
      lines: reconLines,
      canClose: reconLines.every((l) => Math.abs(l.remaining) < 0.0005),
    };
  }

  /** STK-05-style write-off of whatever remains in custody, beyond return (writeoff.approve). */
  async writeOff(id: string, reason: string, actorId: string): Promise<ReconciliationResult> {
    return this.transactionService.run(async (session) => {
      const slip = await this.model.findById(id).session(session).lean();
      if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');

      const lossLoc = await this.locationModel
        .findOne({ code: 'VIRT-LOSS' })
        .session(session)
        .lean();
      if (!lossLoc)
        throw new ProblemException('VALIDATION_FAILED', 500, 'VIRT-LOSS location is not seeded.');
      const custodyLoc = await this.locationModel
        .findOne({ code: `CUSTODY-${slip.jobWorkerId}` })
        .session(session)
        .lean();
      if (!custodyLoc)
        throw new ProblemException(
          'VALIDATION_FAILED',
          500,
          'Custody location not found for this job worker.',
        );

      const lines = await this.materialLineModel.find({ jobSlipId: slip._id }).session(session);
      for (const line of lines) {
        const remaining = roundQty(
          line.qtyIssued - line.qtyReturned - line.qtyConsumed - line.qtyWrittenOff,
        );
        if (remaining <= 0) continue;

        await this.stockService.post(
          [
            {
              type: 'SHORTAGE_WRITE_OFF',
              stockItemId: String(line.stockItemId),
              lotId: String(line.lotId),
              fromLocationId: String(custodyLoc._id),
              toLocationId: String(lossLoc._id),
              qty: remaining,
              doc: { type: 'JOB_SLIP', id: String(slip._id) },
              reason,
            },
          ],
          session,
          actorId,
        );

        line.qtyWrittenOff = roundQty(line.qtyWrittenOff + remaining);
        await line.save({ session });
      }

      return this.getReconciliation(id);
    });
  }

  /**
   * JOB-12: close is allowed only after reconciliation - every material line's remaining
   * must be zero. Locking the job and finalising its cost happen in one transaction (BR-12);
   * CostingService.onJobClosed does the provisional-to-final revaluation (tech.md §6.5).
   */
  async close(id: string, actorId: string): Promise<JobSlipDocument> {
    return this.transactionService.run(async (session) => {
      const slip = await this.model.findById(id).session(session);
      if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
      if (slip.status !== 'RECEIVED') {
        throw new InvalidStateTransitionException('Only a received job slip can be closed.');
      }

      const anyDraftReceipt = await this.receiptModel
        .exists({ jobSlipId: slip._id, status: 'DRAFT' })
        .session(session);
      if (anyDraftReceipt) {
        throw new ProblemException(
          'RECONCILIATION_REQUIRED',
          409,
          'A draft receipt still exists on this job slip.',
        );
      }

      const reconciliation = await this.getReconciliation(id);
      if (!reconciliation.canClose) {
        throw new ProblemException(
          'RECONCILIATION_REQUIRED',
          409,
          'Material still remains in custody. Return or write it off before closing.',
          undefined,
          { lines: reconciliation.lines.filter((l) => Math.abs(l.remaining) >= 0.0005) },
        );
      }

      slip.status = 'CLOSED';
      slip.closedBy = actorId as any;
      slip.closedAt = new Date();
      slip.updatedBy = actorId as any;
      slip.version += 1;
      await slip.save({ session });

      await this.costingService.onJobClosed(id, actorId, session);
      return slip;
    });
  }

  /** Only from CREATED, or from MATERIAL_ISSUED if all issued material has been returned. */
  async cancel(id: string, reason: string, actorId: string): Promise<JobSlipDocument> {
    const slip = await this.model.findById(id);
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');

    if (slip.status === 'MATERIAL_ISSUED') {
      const lines = await this.materialLineModel.find({ jobSlipId: slip._id }).lean();
      const fullyReturned = lines.every(
        (l) => Math.abs(l.qtyIssued - l.qtyReturned) < 0.0005 && l.qtyConsumed === 0,
      );
      if (!fullyReturned) {
        throw new InvalidStateTransitionException(
          'Cannot cancel: material is still with the factory. Return it first.',
        );
      }
    } else if (slip.status !== 'CREATED') {
      throw new InvalidStateTransitionException(
        `Cannot cancel a job slip in status ${slip.status}.`,
      );
    }

    slip.status = 'CANCELLED';
    slip.cancelReason = reason;
    slip.cancelledBy = actorId as any;
    slip.cancelledAt = new Date();
    slip.updatedBy = actorId as any;
    slip.version += 1;
    await slip.save();
    return slip;
  }
}

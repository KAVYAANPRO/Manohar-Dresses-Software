import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JobSlip, JobSlipDocument, CHARGE_BASES } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { JobReceipt, JobReceiptDocument } from './schemas/job-receipt.schema';
import { MaterialIssue, MaterialIssueDocument } from './schemas/material-issue.schema';
import { JobSlipsService } from './job-slips.service';
import { MaterialIssuesService } from './material-issues.service';
import { JobReceiptsService } from './job-receipts.service';
import { JobworkLookupService } from './jobwork-lookup.service';
import { roundQty, toDecimal } from '../common/utils/decimal';
import { ProblemException, ValidationFailedException } from '../common/errors/problem.exception';

export class CreateProcessingJobDto {
  @IsMongoId() jobWorkerId!: string;
  /** The design the processed fabric is for, when known (material-based work has none yet). */
  @IsOptional() @IsMongoId() designId?: string;
  @IsOptional() @IsMongoId() processingTypeId?: string;
  @IsMongoId() inputMaterialVariantId!: string;
  @IsNumber() @Min(0.001) inputQty!: number;
  @IsOptional() @IsMongoId() inputLotId?: string;
  @IsMongoId() outputMaterialVariantId!: string;
  @IsNumber() @Min(0.001) expectedOutputQty!: number;
  @IsIn(CHARGE_BASES) chargeBasis!: (typeof CHARGE_BASES)[number];
  @IsNumber() @Min(0) agreedRate!: number;
  @IsOptional() @IsDateString() expectedCompletionDate?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() challanNo?: string;
  @IsOptional() @IsString() lotNo?: string;
}

/** Internal: a processing job created for one part of a material-based job slip. */
export interface ProcessingForPart {
  parentJobSlipId: string;
  partLabel: string;
}

export class ReceiveProcessingJobDto {
  @IsNumber() @Min(0.001) receivedQty!: number;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  @IsOptional() @IsNumber() @Min(0) processingCharges?: number;
  @IsOptional() @IsString() shortageReason?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsBoolean() allowOverReceipt?: boolean;
}

/**
 * JOB-08 processing / dyeing jobs as one screen: a PROCESSING job slip + its material issue
 * (input sent) + its receipt (output received into raw stock as a processed variant). Each step
 * is the ordinary document (job slip, material issue, job receipt) - this service only
 * orchestrates them and builds the list/detail read model with SHR-01 shortage.
 */
@Injectable()
export class ProcessingJobsService {
  constructor(
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    private readonly jobSlips: JobSlipsService,
    private readonly issues: MaterialIssuesService,
    private readonly receipts: JobReceiptsService,
    private readonly lookup: JobworkLookupService,
  ) {}

  async list(filter: { status?: string; jobWorkerId?: string } = {}) {
    const q: Record<string, unknown> = { jobType: 'PROCESSING' };
    if (filter.status) q.status = filter.status;
    if (filter.jobWorkerId && Types.ObjectId.isValid(filter.jobWorkerId)) {
      q.jobWorkerId = new Types.ObjectId(filter.jobWorkerId);
    }
    const slips = await this.slipModel.find(q).sort({ createdAt: -1 }).lean();
    return this.build(slips);
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new ProblemException('NOT_FOUND', 404, 'Processing job not found.');
    const slip = await this.slipModel.findById(id).lean();
    if (!slip || slip.jobType !== 'PROCESSING') {
      throw new ProblemException('NOT_FOUND', 404, 'Processing job not found.');
    }
    const [row] = await this.build([slip], true);
    return row;
  }

  private async build(slips: any[], detail = false) {
    const ids = slips.map((s) => s._id);
    const [matLines, receipts, issues] = await Promise.all([
      this.materialLineModel.find({ jobSlipId: { $in: ids } }).lean(),
      this.receiptModel.find({ jobSlipId: { $in: ids } }).sort({ createdAt: 1 }).lean(),
      this.issueModel.find({ jobSlipId: { $in: ids } }).sort({ createdAt: 1 }).lean(),
    ]);
    const [workers, designs, ptypes, items, outVariants, issueVariants] = await Promise.all([
      this.lookup.jobWorkers(slips.map((s) => s.jobWorkerId)),
      this.lookup.designs(slips.map((s) => s.designId)),
      this.lookup.processingTypes(slips.map((s) => s.processingTypeId)),
      this.lookup.stockItemMaterials(matLines.map((l) => l.stockItemId)),
      this.lookup.materialVariants(slips.flatMap((s) => s.expectedOutputLines.map((l: any) => l.materialVariantId))),
      this.lookup.materialVariants(issues.flatMap((i) => i.lines.map((l) => l.materialVariantId))),
    ]);

    return slips.map((s) => {
      const sid = String(s._id);
      const myLines = matLines.filter((l) => String(l.jobSlipId) === sid);
      const myReceipts = receipts.filter((r) => String(r.jobSlipId) === sid);
      const myIssues = issues.filter((i) => String(i.jobSlipId) === sid);
      const confirmedReceipts = myReceipts.filter((r) => r.status === 'CONFIRMED');
      const confirmedIssues = myIssues.filter((i) => i.status === 'CONFIRMED');

      const inputNames = new Set<string>();
      for (const l of myLines) inputNames.add(items.get(String(l.stockItemId))?.name ?? '');
      if (inputNames.size === 0) {
        for (const i of myIssues) for (const l of i.lines) inputNames.add(issueVariants.get(String(l.materialVariantId))?.name ?? '');
      }
      const firstInput = myLines[0] ? items.get(String(myLines[0].stockItemId)) : undefined;
      const inputQty = roundQty(myLines.reduce((a, l) => a + l.qtyIssued - l.qtyReturned, 0));
      const plannedInput = roundQty(
        myIssues.filter((i) => i.status !== 'CANCELLED').reduce((a, i) => a + i.lines.reduce((b, l) => b + l.qtyBase, 0), 0),
      );
      const out = s.expectedOutputLines[0];
      const outInfo = out?.materialVariantId ? outVariants.get(String(out.materialVariantId)) : undefined;
      const expectedOutputQty = roundQty(s.expectedOutputLines.reduce((a: number, l: any) => a + l.expectedQty, 0));
      const actualOutputQty = confirmedReceipts.length
        ? roundQty(confirmedReceipts.reduce((a, r) => a + r.lines.reduce((b, l) => b + l.receivedQty, 0), 0))
        : null;
      const sent = roundQty(confirmedReceipts.reduce((a, r) => a + (r.processingSummary?.sentQty ?? 0), 0));
      const shortage = actualOutputQty !== null ? roundQty(sent - actualOutputQty) : null;
      const shortagePercent =
        shortage !== null && sent > 0 ? roundQty(toDecimal(shortage).dividedBy(sent).times(100)) : null;
      const remainingInCustody = roundQty(
        myLines.reduce((a, l) => a + l.qtyIssued - l.qtyReturned - l.qtyConsumed - l.qtyWrittenOff, 0),
      );

      const row: any = {
        id: sid,
        jobNumber: s.docNo,
        docDate: s.docDate,
        status: s.status,
        processingTypeId: s.processingTypeId ? String(s.processingTypeId) : undefined,
        processType: s.processingTypeId ? (ptypes.get(String(s.processingTypeId)) ?? '') : 'Processing',
        jobWorkerId: String(s.jobWorkerId),
        factoryName: workers.get(String(s.jobWorkerId))?.name ?? '',
        designId: s.designId ? String(s.designId) : undefined,
        lotNo: s.lotNo,
        challanNo: s.challanNo,
        parentJobSlipId: s.parentJobSlipId ? String(s.parentJobSlipId) : undefined,
        partLabel: s.partLabel,
        forwardedQty: s.forwardedQty ?? 0,
        designNo: designs.get(String(s.designId))?.designNo,
        designName: designs.get(String(s.designId))?.name,
        inputMaterialVariantId: firstInput?.materialVariantId ?? (myIssues[0]?.lines[0] ? String(myIssues[0].lines[0].materialVariantId) : undefined),
        inputMaterial: [...inputNames].filter(Boolean).join(', '),
        inputUom: firstInput?.uom ?? outInfo?.uom ?? '',
        inputQty: inputQty || plannedInput,
        outputMaterialVariantId: out?.materialVariantId ? String(out.materialVariantId) : undefined,
        outputMaterial: outInfo?.name ?? '',
        outputUom: outInfo?.uom ?? '',
        expectedOutputQty,
        actualOutputQty,
        sentQty: sent,
        shortage,
        shortagePercent,
        remainingInCustody,
        issueDate: confirmedIssues[0]?.docDate ?? null,
        expectedReturnDate: s.expectedCompletionDate ?? null,
        chargeBasis: s.chargeBasis,
        agreedRate: s.agreedRate,
        instructions: s.instructions,
        remarks: s.remarks,
        canReceive:
          ['MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED'].includes(s.status) &&
          remainingInCustody > 0,
      };
      if (detail) {
        row.issues = myIssues.map((i) => ({
          _id: String(i._id),
          docNo: i.docNo,
          docDate: i.docDate,
          status: i.status,
          qty: roundQty(i.lines.reduce((a, l) => a + l.qtyBase, 0)),
          acknowledgedAt: i.acknowledgedAt,
          discrepancyNote: i.discrepancyNote,
        }));
        row.receipts = myReceipts.map((r) => ({
          _id: String(r._id),
          docNo: r.docNo,
          docDate: r.docDate,
          status: r.status,
          receivedQty: roundQty(r.lines.reduce((a, l) => a + l.receivedQty, 0)),
          processingSummary: r.processingSummary,
          shortageReason: r.shortageReason,
          remarks: r.remarks,
        }));
      }
      return row;
    });
  }

  /**
   * Creates the PROCESSING job slip and its material issue; confirms the issue (warehouse ->
   * the processor's custody) when the caller may. If the issue cannot be confirmed (e.g. 409
   * INSUFFICIENT_STOCK) the just-created slip is cancelled so no orphan is left, and the error
   * is returned unchanged.
   */
  async create(
    dto: CreateProcessingJobDto,
    actorId: string,
    opts: { canConfirmIssue: boolean; forPart?: ProcessingForPart },
  ) {
    if (dto.inputMaterialVariantId === dto.outputMaterialVariantId) {
      throw new ValidationFailedException(
        { outputMaterialVariantId: 'must differ from the input' },
        'The processed (output) material must be a different material/colour from the input.',
      );
    }
    const slip = await this.jobSlips.create(
      {
        jobType: 'PROCESSING',
        jobWorkerId: dto.jobWorkerId,
        designId: dto.designId,
        processingTypeId: dto.processingTypeId,
        expectedOutputLines: [
          { materialVariantId: dto.outputMaterialVariantId, expectedQty: dto.expectedOutputQty },
        ],
        expectedCompletionDate: dto.expectedCompletionDate,
        chargeBasis: dto.chargeBasis,
        agreedRate: dto.agreedRate,
        instructions: dto.instructions,
        remarks: dto.remarks,
        challanNo: dto.challanNo,
        lotNo: dto.lotNo,
        parentJobSlipId: opts.forPart?.parentJobSlipId,
        partLabel: opts.forPart?.partLabel,
      } as any,
      actorId,
    );

    const issue = await this.issues.create(
      {
        jobSlipId: String(slip._id),
        lines: [
          {
            materialVariantId: dto.inputMaterialVariantId,
            qtyBase: dto.inputQty,
            lotId: dto.inputLotId,
            bomRole: opts.forPart ? `${opts.forPart.partLabel} (for processing)` : 'Processing input',
          },
        ],
        notes: `Sent for processing (${slip.docNo})`,
      },
      actorId,
    );

    if (opts.canConfirmIssue) {
      try {
        await this.issues.confirm(String(issue._id), actorId);
      } catch (err) {
        await this.issues.cancel(String(issue._id), 'Issue could not be confirmed', actorId).catch(() => undefined);
        await this.jobSlips
          .cancel(String(slip._id), 'Material could not be issued for processing', actorId)
          .catch(() => undefined);
        throw err;
      }
    }
    return this.findById(String(slip._id));
  }

  async receive(id: string, dto: ReceiveProcessingJobDto, actorId: string, opts: { canEditCharges: boolean; canConfirm: boolean }) {
    const job = await this.findById(id);
    if (!job.outputMaterialVariantId) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'This processing job has no output material.');
    }
    const receipt = await this.receipts.create(
      {
        jobSlipId: id,
        lines: [{ materialVariantId: job.outputMaterialVariantId, receivedQty: dto.receivedQty }],
        otherCharges: dto.otherCharges,
        manufacturingCharges: dto.processingCharges,
        shortageReason: dto.shortageReason,
        remarks: dto.remarks,
        allowOverReceipt: dto.allowOverReceipt,
        confirm: opts.canConfirm,
      },
      actorId,
      { canEditCharges: opts.canEditCharges },
    );
    const forwarded = await this.forwardToParent(id, actorId);
    return { receipt, job: await this.findById(id), forwarded };
  }

  /**
   * A processing job made for one part of a material-based job slip (e.g. the dupatta sent for
   * dyeing first): once its output is received, issue that output to the parent slip's karigar
   * (warehouse -> karigar's custody) on the parent slip, so the processed part joins the top and
   * bottom already with them. Idempotent: only the not-yet-forwarded quantity of confirmed
   * receipts is sent, so it can be re-run (POST /processing-jobs/:id/forward) after a draft
   * receipt is confirmed later.
   */
  async forwardToParent(id: string, actorId: string) {
    const slip = await this.slipModel.findById(id).lean();
    if (!slip?.parentJobSlipId) return null;
    const parent = await this.slipModel.findById(slip.parentJobSlipId).lean();
    if (!parent || ['CLOSED', 'CANCELLED', 'RECEIVED'].includes(parent.status)) return null;

    const receipts = await this.receiptModel.find({ jobSlipId: slip._id, status: 'CONFIRMED' }).sort({ createdAt: 1 }).lean();
    const outputLots: { lotId: string; materialVariantId: string; qty: number }[] = [];
    for (const r of receipts) {
      for (const l of r.lines as any[]) {
        if (l.createdLotId && l.materialVariantId) {
          outputLots.push({ lotId: String(l.createdLotId), materialVariantId: String(l.materialVariantId), qty: l.receivedQtyBase ?? l.receivedQty });
        }
      }
    }
    let toSend = roundQty(outputLots.reduce((a, l) => a + l.qty, 0) - (slip.forwardedQty ?? 0));
    if (toSend <= 0) return null;

    // Oldest output lots first, skipping what earlier forwards already took.
    let skip = slip.forwardedQty ?? 0;
    const lines: { materialVariantId: string; lotId: string; qtyBase: number; bomRole: string }[] = [];
    for (const l of outputLots) {
      let available = l.qty;
      if (skip > 0) {
        const used = Math.min(skip, available);
        skip -= used;
        available -= used;
      }
      if (available <= 0 || toSend <= 0) continue;
      const qty = roundQty(Math.min(available, toSend));
      lines.push({ materialVariantId: l.materialVariantId, lotId: l.lotId, qtyBase: qty, bomRole: slip.partLabel ?? 'Processed material' });
      toSend = roundQty(toSend - qty);
    }
    if (!lines.length) return null;

    const issue = await this.issues.create(
      { jobSlipId: String(parent._id), lines, notes: `${slip.partLabel ?? 'Processed material'} back from processing (${slip.docNo})` },
      actorId,
    );
    try {
      await this.issues.confirm(String(issue._id), actorId);
    } catch (err) {
      await this.issues.cancel(String(issue._id), 'Forward could not be confirmed', actorId).catch(() => undefined);
      throw err;
    }
    const sent = roundQty(lines.reduce((a, l) => a + l.qtyBase, 0));
    await this.slipModel.updateOne({ _id: slip._id }, { $inc: { forwardedQty: sent } });
    return { issueId: String(issue._id), issueNo: issue.docNo, qty: sent, toJobSlipId: String(parent._id) };
  }
}

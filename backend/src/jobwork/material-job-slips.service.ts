import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { JobSlip, JobSlipDocument, CHARGE_BASES } from './schemas/job-slip.schema';
import { MaterialIssue, MaterialIssueDocument } from './schemas/material-issue.schema';
import { JobWorker, JobWorkerDocument } from '../master/schemas/job-worker.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';
import { StockItem, StockItemDocument } from '../inventory/schemas/stock-item.schema';
import { JobSlipsService } from './job-slips.service';
import { MaterialIssuesService } from './material-issues.service';
import { ProcessingJobsService } from './processing-jobs.service';
import { StockViewsService } from '../inventory/stock-views.service';
import { LotNumbersService, parseLotNo, formatLotNo } from '../master/lot-numbers.service';
import { MaterialsService } from '../master/materials.service';
import { MaterialVariant, MaterialVariantDocument } from '../master/schemas/material.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { roundQty } from '../common/utils/decimal';
import {
  InsufficientStockException,
  ProblemException,
  ValidationFailedException,
} from '../common/errors/problem.exception';

export const MATERIAL_ROUTES = ['DIRECT', 'PROCESS'] as const;

export class MaterialJobSlipLineDto {
  /** Garment part this material is for: "TOP", "BOTTOM", "DUPATTA" or any other label. */
  @IsString() @MinLength(1) part!: string;
  /** The inward lot (lump) the material is cut from - it must be in the main warehouse. */
  @IsMongoId() lotId!: string;
  /** Quantity in the material's base unit (metres for fabric). */
  @IsNumber() @Min(0.001) qty!: number;
  /** DIRECT = straight to the karigar; PROCESS = to a processor (dyeing) first, then on to the karigar. */
  @IsOptional() @IsIn(MATERIAL_ROUTES) route?: (typeof MATERIAL_ROUTES)[number];
  @IsOptional() @IsMongoId() processorJobWorkerId?: string;
  @IsOptional() @IsMongoId() processingTypeId?: string;
  /** Colour after processing (e.g. "Rani Pink"); defaults to "<input colour> Dyed". */
  @IsOptional() @IsString() outputColourName?: string;
  @IsOptional() @IsIn(CHARGE_BASES) processChargeBasis?: (typeof CHARGE_BASES)[number];
  @IsOptional() @IsNumber() @Min(0) processRate?: number;
  /** Average metres this part needs per piece (e.g. 2.5) - gives the pieces expected from this colour. */
  @IsOptional() @IsNumber() @Min(0.001) avgPerPiece?: number;
  /**
   * Inner colour of another line of the same part (e.g. the blue strip inside a green top): the lot
   * id of that main colour line. Inner colours are issued with it but add no pieces of their own.
   */
  @IsOptional() @IsMongoId() innerOfLotId?: string;
}

export class CreateMaterialJobSlipDto {
  @IsMongoId() jobWorkerId!: string;
  /** Design being made (optional - the karigar may make their own). */
  @IsOptional() @IsMongoId() designId?: string;
  @IsOptional() @IsDateString() docDate?: string;
  /** Hand-written challan number. */
  @IsOptional() @IsString() challanNo?: string;
  /** Blank = the karigar's next lot number (e.g. KAV-101). */
  @IsOptional() @IsString() lotNo?: string;
  /** Pieces expected back (optional; used for over-receipt checks once known). */
  @IsOptional() @IsNumber() @Min(1) expectedPieces?: number;
  @IsIn(CHARGE_BASES) chargeBasis!: (typeof CHARGE_BASES)[number];
  @IsNumber() @Min(0) agreedRate!: number;
  @IsOptional() @IsDateString() expectedCompletionDate?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaterialJobSlipLineDto)
  lines!: MaterialJobSlipLineDto[];
}

/** Lot origins that count as "came in through purchase inward" (incl. fabric processed from it). */
const ISSUABLE_ORIGINS = ['INWARD', 'PROCESS_OUTPUT'];

interface ResolvedLine extends MaterialJobSlipLineDto {
  part: string;
  route: 'DIRECT' | 'PROCESS';
  materialVariantId: string;
  materialId: string;
  label: string;
  uom?: string;
  outputMaterialVariantId?: string;
}

/**
 * Owner's job-slip flow: no design is chosen up front (the karigar makes their own); the slip lists
 * the materials handed over - Top / Bottom / Dupatta cut from the same inward lump - and each part
 * either goes straight to the karigar or first to a processor (the dupatta to dyeing), and is then
 * forwarded to the karigar automatically when it comes back (ProcessingJobsService.forwardToParent).
 *
 * Only material that came in through purchase inward and is in the main warehouse can be used:
 * everything is validated before anything is created, so a refused slip leaves no trace.
 */
@Injectable()
export class MaterialJobSlipsService {
  constructor(
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    @InjectModel(JobWorker.name) private readonly jobWorkerModel: Model<JobWorkerDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(MaterialVariant.name) private readonly variantModel: Model<MaterialVariantDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    private readonly jobSlips: JobSlipsService,
    private readonly issues: MaterialIssuesService,
    private readonly processingJobs: ProcessingJobsService,
    private readonly stockViews: StockViewsService,
    private readonly lotNumbers: LotNumbersService,
    private readonly materials: MaterialsService,
  ) {}

  /** Fabric lots in the main warehouse that came from purchase inward - what a job slip can use. */
  async availableLots(filter: { materialId?: string; q?: string } = {}) {
    const overview = await this.stockViews.overview({});
    const rows = (overview.rows ?? overview) as any[];
    const inMain = rows.filter((r) => r.locationCode === 'MAIN-WH' && r.qty > 0 && r.materialVariantId);
    const lots = await this.lotModel
      .find({ _id: { $in: inMain.map((r) => new Types.ObjectId(r.lotId)) } })
      .lean();
    const lotMap = new Map(lots.map((l) => [String(l._id), l]));
    const q = filter.q?.trim().toLowerCase();
    return inMain
      .filter((r) => ISSUABLE_ORIGINS.includes(String(lotMap.get(r.lotId)?.originDocType)))
      .filter((r) => !filter.materialId || r.materialId === filter.materialId)
      .filter((r) => !q || [r.lotNo, r.materialName, r.colourName, r.supplierName].some((v) => String(v ?? '').toLowerCase().includes(q)))
      .map((r) => {
        const lot = lotMap.get(r.lotId)!;
        return {
          lotId: r.lotId,
          lotNo: r.lotNo,
          materialVariantId: r.materialVariantId,
          materialId: r.materialId,
          materialName: r.materialName,
          colourName: r.colourName,
          name: r.name,
          uom: r.uomCode,
          available: r.qty,
          thans: lot.thans ?? [],
          receivedOn: r.receivedOn,
          supplierName: r.supplierName,
          origin: lot.originDocType,
          /** Garment parts processed fabric was made for (e.g. ["DUPATTA"]); empty for plain inward fabric. */
          partLabels: lot.partLabels ?? [],
          costPerMeter: lot.unitCost,
        };
      })
      .sort((a, b) => String(a.lotNo).localeCompare(String(b.lotNo)) || String(a.name).localeCompare(String(b.name)));
  }

  async create(dto: CreateMaterialJobSlipDto, actorId: string) {
    // ---- 1. Validate everything before creating anything ------------------------------------
    const karigar = await this.jobWorkerModel.findById(dto.jobWorkerId).lean();
    if (!karigar || karigar.isActive === false) {
      throw new ProblemException('NOT_FOUND', 404, 'Karigar / factory not found or inactive.');
    }

    const available = await this.availableLots();
    const byLot = new Map(available.map((l) => [l.lotId, l]));
    const wantedPerLot = new Map<string, number>();
    const resolved: ResolvedLine[] = [];

    for (const [i, line] of dto.lines.entries()) {
      const part = line.part.trim().toUpperCase();
      const route = line.route ?? 'DIRECT';
      const lot = byLot.get(line.lotId);
      if (!lot) {
        const exists = await this.lotModel.exists({ _id: line.lotId });
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          exists
            ? `Line ${i + 1} (${part}): that lot is not available in the main warehouse (only material received through purchase inward can be used).`
            : `Line ${i + 1} (${part}): lot not found.`,
          { [`lines.${i}.lotId`]: 'not available' },
        );
      }
      wantedPerLot.set(line.lotId, roundQty((wantedPerLot.get(line.lotId) ?? 0) + line.qty));

      let outputMaterialVariantId: string | undefined;
      if (route === 'PROCESS') {
        if (!line.processorJobWorkerId) {
          throw new ValidationFailedException({ [`lines.${i}.processorJobWorkerId`]: 'required' }, `Line ${i + 1} (${part}): choose who does the processing (dyeing).`);
        }
        if (line.processorJobWorkerId === dto.jobWorkerId) {
          throw new ValidationFailedException({ [`lines.${i}.processorJobWorkerId`]: 'same as karigar' }, `Line ${i + 1} (${part}): the processor must be different from the karigar.`);
        }
        const processor = await this.jobWorkerModel.findById(line.processorJobWorkerId).lean();
        if (!processor || processor.isActive === false) {
          throw new ProblemException('NOT_FOUND', 404, `Line ${i + 1} (${part}): processor not found or inactive.`);
        }
        const colourName = line.outputColourName?.trim() || `${lot.colourName ?? 'Natural'} Dyed`;
        const out = await this.materials.resolveVariant({ materialId: lot.materialId, colourName }, actorId);
        outputMaterialVariantId = String(out._id);
        if (outputMaterialVariantId === lot.materialVariantId) {
          throw new ValidationFailedException({ [`lines.${i}.outputColourName`]: 'same colour' }, `Line ${i + 1} (${part}): the colour after processing must differ from the input colour (${lot.colourName}).`);
        }
      }
      resolved.push({ ...line, part, route, materialVariantId: lot.materialVariantId, materialId: lot.materialId, label: lot.name, uom: lot.uom, outputMaterialVariantId });
    }

    const shortages = [...wantedPerLot.entries()]
      .map(([lotId, qty]) => ({ lot: byLot.get(lotId)!, qty }))
      .filter(({ lot, qty }) => qty > lot.available + 0.0005)
      .map(({ lot, qty }) => ({
        lotId: lot.lotId,
        lotNo: lot.lotNo,
        name: lot.name,
        required: qty,
        available: lot.available,
        uom: lot.uom,
        shortBy: roundQty(qty - lot.available),
      }));
    if (shortages.length) {
      throw new InsufficientStockException(
        `Not enough material in the main warehouse: ${shortages
          .map((s) => `${s.name} (lot ${s.lotNo}): need ${s.required} ${s.uom ?? ''}, have ${s.available} ${s.uom ?? ''}`)
          .join('; ')}.`,
        { shortages },
      );
    }

    // Lot number: typed one must be free; blank = the karigar's next number.
    if (dto.lotNo?.trim()) {
      const series = await this.lotNumbers.seriesFor('JOB_WORKER', dto.jobWorkerId);
      const parsed = parseLotNo(dto.lotNo);
      const normalised = parsed && parsed.prefix === series.prefix ? formatLotNo(series.prefix, parsed.n) : dto.lotNo.trim().toUpperCase();
      await this.assertLotNoFree(normalised);
    }
    const lotNo = await this.lotNumbers.use('JOB_WORKER', dto.jobWorkerId, dto.lotNo);
    await this.assertLotNoFree(lotNo);

    if (dto.designId) {
      const design = await this.designModel.findById(dto.designId).lean();
      if (!design) throw new ProblemException('NOT_FOUND', 404, 'Design not found.');
    }

    // Making plan: pieces expected per part x colour from metres given / average metres per piece.
    const variants = await this.variantModel.find({ _id: { $in: resolved.map((l) => new Types.ObjectId(l.materialVariantId)) } }).lean();
    const colourIdOf = new Map(variants.map((v) => [String(v._id), v.colourId ? String(v.colourId) : undefined]));
    for (const [i, l] of resolved.entries()) {
      if (l.innerOfLotId && !resolved.some((m) => m.part === l.part && m.lotId === l.innerOfLotId && !m.innerOfLotId)) {
        throw new ValidationFailedException({ [`lines.${i}.innerOfLotId`]: 'no such main colour' }, `${l.part}: the inner colour must belong to a main colour of the same part.`);
      }
    }
    const plan = resolved.map((l) => {
      const lot = byLot.get(l.lotId)!;
      const main = l.innerOfLotId ? byLot.get(l.innerOfLotId) : undefined;
      const expectedPieces = !l.innerOfLotId && l.avgPerPiece ? Math.floor(l.qty / l.avgPerPiece + 1e-9) : undefined;
      return {
        part: l.part, lotId: new Types.ObjectId(l.lotId), lotNo: lot.lotNo, colourName: lot.colourName, qty: roundQty(l.qty),
        avgPerPiece: l.innerOfLotId ? undefined : l.avgPerPiece, expectedPieces, colourId: colourIdOf.get(l.materialVariantId),
        innerOfColour: main?.colourName, innerOfLotNo: main?.lotNo,
      };
    });
    // Expected output per colour comes from the main part (TOP if given an average, else the first part with one).
    const withAvg = plan.filter((p) => p.expectedPieces !== undefined);
    const mainPart = withAvg.find((p) => p.part === 'TOP')?.part ?? withAvg[0]?.part;
    const perColour = new Map<string, { colourId?: string; qty: number }>();
    for (const p of withAvg.filter((x) => x.part === mainPart)) {
      const key = p.colourId ?? p.colourName ?? '-';
      const cur = perColour.get(key) ?? { colourId: p.colourId, qty: 0 };
      cur.qty += p.expectedPieces!;
      perColour.set(key, cur);
    }
    const expectedOutputLines = perColour.size
      ? [...perColour.values()].filter((c) => c.qty > 0).map((c) => ({ colourId: c.colourId, expectedQty: c.qty }))
      : dto.expectedPieces ? [{ expectedQty: dto.expectedPieces }] : [];

    // ---- 2. Create: slip, direct issue, processing jobs ----------------------------------------
    const slip = await this.jobSlips.create(
      {
        jobType: 'MANUFACTURING',
        jobWorkerId: dto.jobWorkerId,
        designId: dto.designId,
        expectedOutputLines,
        expectedCompletionDate: dto.expectedCompletionDate,
        chargeBasis: dto.chargeBasis,
        agreedRate: dto.agreedRate,
        instructions: dto.instructions,
        remarks: dto.remarks,
        challanNo: dto.challanNo,
        lotNo,
        docDate: dto.docDate,
        materialBased: true,
      } as any,
      actorId,
    );
    await this.slipModel.updateOne(
      { _id: slip._id },
      { $set: { makingPlan: plan.map(({ colourId: _c, ...rest }) => rest) } },
    );

    const created: { issueId?: string; processingSlipIds: string[] } = { processingSlipIds: [] };
    try {
      const direct = resolved.filter((l) => l.route === 'DIRECT');
      if (direct.length) {
        const issue = await this.issues.create(
          {
            jobSlipId: String(slip._id),
            lines: direct.map((l) => ({
              materialVariantId: l.materialVariantId,
              lotId: l.lotId,
              qtyBase: l.qty,
              bomRole: l.innerOfLotId ? `${l.part} · inner colour in ${byLot.get(l.innerOfLotId)?.colourName ?? 'main colour'}` : l.part,
            })),
            notes: `Lot ${lotNo}${dto.challanNo ? ` · challan ${dto.challanNo}` : ''}`,
          },
          actorId,
        );
        created.issueId = String(issue._id);
        await this.issues.confirm(String(issue._id), actorId);
      }

      for (const l of resolved.filter((x) => x.route === 'PROCESS')) {
        const job = await this.processingJobs.create(
          {
            jobWorkerId: l.processorJobWorkerId!,
            processingTypeId: l.processingTypeId,
            inputMaterialVariantId: l.materialVariantId,
            inputLotId: l.lotId,
            inputQty: l.qty,
            outputMaterialVariantId: l.outputMaterialVariantId!,
            expectedOutputQty: l.qty,
            chargeBasis: l.processChargeBasis ?? 'PER_METER',
            agreedRate: l.processRate ?? 0,
            expectedCompletionDate: dto.expectedCompletionDate,
            remarks: `${l.part} for lot ${lotNo} - forward to ${karigar.name} after processing`,
            challanNo: dto.challanNo,
            lotNo,
          },
          actorId,
          { canConfirmIssue: true, forPart: { parentJobSlipId: String(slip._id), partLabel: l.part } },
        );
        created.processingSlipIds.push(job.id);
      }
    } catch (err) {
      // Undo what this request created so a failed slip leaves nothing half-issued.
      for (const id of created.processingSlipIds) {
        await this.jobSlips.cancel(id, 'Parent job slip could not be created', actorId).catch(() => undefined);
      }
      if (created.issueId) {
        await this.issues.cancel(created.issueId, 'Job slip could not be created', actorId).catch(() => undefined);
      }
      await this.jobSlips.cancel(String(slip._id), 'Material could not be issued', actorId).catch(() => undefined);
      throw err;
    }

    return this.summary(String(slip._id));
  }

  private async assertLotNoFree(lotNo: string) {
    const clash = await this.slipModel.exists({
      lotNo,
      jobType: 'MANUFACTURING',
      parentJobSlipId: { $exists: false },
      status: { $ne: 'CANCELLED' },
    });
    if (clash) throw new ProblemException('DUPLICATE_NUMBER', 409, `Lot number ${lotNo} is already used on another job slip.`);
  }

  /** The slip with each part's journey: with the karigar, at the processor, or processed and forwarded. */
  async summary(jobSlipId: string) {
    if (!Types.ObjectId.isValid(jobSlipId)) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    const slip = await this.slipModel.findById(jobSlipId).lean();
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    const [karigar, issues, children, design] = await Promise.all([
      this.jobWorkerModel.findById(slip.jobWorkerId).lean(),
      this.issueModel.find({ jobSlipId: slip._id, status: { $ne: 'CANCELLED' } }).sort({ createdAt: 1 }).lean(),
      this.slipModel.find({ parentJobSlipId: slip._id }).sort({ createdAt: 1 }).lean(),
      slip.designId ? this.designModel.findById(slip.designId).lean() : Promise.resolve(null),
    ]);
    const childRows = await Promise.all(children.map((c) => this.processingJobs.findById(String(c._id))));
    const lotIds = issues.flatMap((i) => i.lines.map((l) => l.lotId)).filter(Boolean);
    const lots = await this.lotModel.find({ _id: { $in: lotIds } }).lean();
    const lotNoById = new Map(lots.map((l) => [String(l._id), l.lotNo]));
    const names = await this.materialNames(issues.flatMap((i) => i.lines.map((l) => String(l.materialVariantId))));

    const parts = [
      ...issues.flatMap((i) =>
        i.lines.map((l) => ({
          part: l.bomRole ?? 'MATERIAL',
          material: names.get(String(l.materialVariantId)) ?? '',
          lotNo: l.lotId ? lotNoById.get(String(l.lotId)) : undefined,
          qty: l.qtyBase,
          route: /processing|back from/i.test(i.notes ?? '') ? 'PROCESSED' : 'DIRECT',
          stage: i.status === 'CONFIRMED' ? 'WITH_KARIGAR' : 'DRAFT',
          issueNo: i.docNo,
          date: i.docDate,
        })),
      ),
      ...childRows
        .filter((c) => c.status !== 'CANCELLED')
        .map((c: any) => ({
          part: c.partLabel ?? 'PROCESSING',
          material: `${c.inputMaterial} → ${c.outputMaterial}`,
          lotNo: c.lotNo,
          qty: c.inputQty,
          route: 'PROCESS',
          stage: c.forwardedQty > 0 ? (c.forwardedQty + 0.0005 >= (c.actualOutputQty ?? c.expectedOutputQty) ? 'FORWARDED' : 'PARTLY_FORWARDED') : c.actualOutputQty !== null ? 'PROCESSED' : 'AT_PROCESSOR',
          processingJobId: c.id,
          processingJobNo: c.jobNumber,
          processor: c.factoryName,
          forwardedQty: c.forwardedQty,
        })),
    ];

    return {
      id: String(slip._id),
      docNo: slip.docNo,
      docDate: slip.docDate,
      status: slip.status,
      lotNo: slip.lotNo,
      challanNo: slip.challanNo,
      jobWorkerId: String(slip.jobWorkerId),
      karigarName: karigar?.name,
      designId: slip.designId ? String(slip.designId) : undefined,
      designNo: (design as { designNo?: string } | null)?.designNo,
      designName: (design as { name?: string } | null)?.name,
      makingPlan: slip.makingPlan ?? [],
      expectedPieces: (slip.expectedOutputLines ?? []).reduce((a, l) => a + l.expectedQty, 0) || undefined,
      chargeBasis: slip.chargeBasis,
      agreedRate: slip.agreedRate,
      instructions: slip.instructions,
      remarks: slip.remarks,
      parts,
      processingJobs: childRows,
    };
  }

  private async materialNames(variantIds: string[]) {
    const items = await this.stockItemModel
      .find({ materialVariantId: { $in: [...new Set(variantIds)].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } })
      .lean();
    const labels = await this.stockViews.overview({});
    const rows = ((labels as any).rows ?? labels) as any[];
    const out = new Map<string, string>();
    for (const r of rows) if (r.materialVariantId && r.name) out.set(r.materialVariantId, r.name);
    for (const it of items) if (!out.has(String(it.materialVariantId))) out.set(String(it.materialVariantId), 'Material');
    return out;
  }
}

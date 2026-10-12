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
import Decimal from 'decimal.js';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { JobReceipt, JobReceiptDocument } from './schemas/job-receipt.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { JobCharge, JobChargeDocument } from './schemas/job-charge.schema';
import { JobWorker, JobWorkerDocument } from '../master/schemas/job-worker.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { JobSlipsService } from './job-slips.service';
import { MaterialIssuesService } from './material-issues.service';
import { MaterialJobSlipsService } from './material-job-slips.service';
import { StockService } from '../inventory/stock.service';
import { StockItemsService } from '../inventory/stock-items.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { LotNumbersService, parseLotNo, formatLotNo } from '../master/lot-numbers.service';
import { MaterialsService } from '../master/materials.service';
import { roundMoney, roundQty, roundUnitCost, toDecimal } from '../common/utils/decimal';
import {
  InsufficientStockException,
  InvalidStateTransitionException,
  ProblemException,
  ValidationFailedException,
} from '../common/errors/problem.exception';

const METRE_CODES = /^(m|mtr|mtrs|meter|metre|meters|metres)$/i;

export class ProcessingBatchLineDto {
  /** Inward (or earlier processed) lot the thans are taken from - must be in the main warehouse. */
  @IsMongoId() lotId!: string;
  /** Colour it is processed into, e.g. "Rani Pink". */
  @IsString() @MinLength(1) colourName!: string;
  /** Metres of each than (roll) sent for this colour, e.g. [100, 100, 102, 98]. */
  @IsArray() @ArrayMinSize(1) @IsNumber({}, { each: true }) @Min(0.001, { each: true }) thans!: number[];
}

export class CreateProcessingBatchDto {
  @IsMongoId() processorJobWorkerId!: string;
  @IsOptional() @IsMongoId() processingTypeId?: string;
  /** "DYEING", "PRINTING", ... */
  @IsString() @MinLength(1) processName!: string;
  /** Parts this fabric is for: TOP / BOTTOM / DUPATTA (at least one). */
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) parts!: string[];
  /** Processor's rate: per metre sent (PER_METER) or for the whole job (LUMP_SUM). */
  @IsNumber() @Min(0) rate!: number;
  @IsOptional() @IsIn(['PER_METER', 'LUMP_SUM']) rateBasis?: 'PER_METER' | 'LUMP_SUM';
  /** Travel / transport and other expenses for the whole job (spread per metre sent). */
  @IsOptional() @IsNumber() @Min(0) expenses?: number;
  @IsOptional() @IsDateString() docDate?: string;
  @IsOptional() @IsString() challanNo?: string;
  @IsOptional() @IsString() lotNo?: string;
  @IsOptional() @IsDateString() expectedReturnDate?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProcessingBatchLineDto)
  lines!: ProcessingBatchLineDto[];
}

export class ReceiveThanDto {
  @IsMongoId() thanId!: string;
  /** Metres that came back for this than (after shrinkage); 0 = lost / rejected. */
  @IsNumber() @Min(0) received!: number;
}

export class ReceiveProcessingLineDto {
  @IsMongoId() lineId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveThanDto) thans!: ReceiveThanDto[];
}

export class ReceiveProcessingBatchDto {
  @IsOptional() @IsDateString() docDate?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveProcessingLineDto)
  lines!: ReceiveProcessingLineDto[];
}

const RECEIVABLE = ['MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED'];

/**
 * Processing job sheets (owner's flow): parts of a lot go to a processor (dyeing etc.) as thans in
 * one or more colours, and come back to the office than by than with shrinkage. Every received
 * than becomes processed stock in the main warehouse at
 *   cost / m = (metres sent x fabric cost / m + metres sent x expenses / m + processing charge) / metres received
 * tagged with the garment parts it is for, so the making job slip later shows e.g.
 * "DUPATTA · Cotton - Rani Pink · 97 m @ ₹39.58/m".
 */
@Injectable()
export class ProcessingBatchService {
  constructor(
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(JobMaterialLine.name) private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(JobCharge.name) private readonly chargeModel: Model<JobChargeDocument>,
    @InjectModel(JobWorker.name) private readonly jobWorkerModel: Model<JobWorkerDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly jobSlips: JobSlipsService,
    private readonly issues: MaterialIssuesService,
    private readonly materialSlips: MaterialJobSlipsService,
    private readonly stockService: StockService,
    private readonly stockItems: StockItemsService,
    private readonly tx: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
    private readonly lotNumbers: LotNumbersService,
    private readonly materials: MaterialsService,
  ) {}

  // ------------------------------------------------------------------------------------------
  async create(dto: CreateProcessingBatchDto, actorId: string) {
    const processor = await this.jobWorkerModel.findById(dto.processorJobWorkerId).lean();
    if (!processor || processor.isActive === false) {
      throw new ProblemException('NOT_FOUND', 404, 'Processor (dyer) not found or inactive.');
    }
    const parts = [...new Set(dto.parts.map((p) => p.trim().toUpperCase()).filter(Boolean))];
    if (!parts.length) throw new ValidationFailedException({ parts: 'required' }, 'Choose at least one part (Top / Bottom / Dupatta).');

    const available = await this.materialSlips.availableLots();
    const byLot = new Map(available.map((l) => [l.lotId, l]));
    const wanted = new Map<string, number>();
    const prepared: {
      lotId: string; inputVariantId: string; outputVariantId: string; colourName: string; thans: number[]; inputCostPerMeter: number;
    }[] = [];

    for (const [i, line] of dto.lines.entries()) {
      const lot = byLot.get(line.lotId);
      if (!lot) {
        throw new ProblemException('VALIDATION_FAILED', 422, `Colour ${i + 1}: that lot is not available in the main warehouse (only received fabric can be sent).`, { [`lines.${i}.lotId`]: 'not available' });
      }
      if (lot.uom && !METRE_CODES.test(lot.uom)) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Lot ${lot.lotNo} (${lot.name}) is counted in ${lot.uom}, not metres. Thans need metres - re-enter that inward with the metres of each than.`,
          { [`lines.${i}.lotId`]: 'not in metres' },
        );
      }
      const colourName = line.colourName.trim();
      const out = await this.materials.resolveVariant({ materialId: lot.materialId, colourName }, actorId);
      const lotDoc = await this.lotModel.findById(line.lotId).lean();
      const thans = line.thans.map((t) => roundQty(t));
      wanted.set(line.lotId, roundQty((wanted.get(line.lotId) ?? 0) + thans.reduce((a, b) => a + b, 0)));
      prepared.push({ lotId: line.lotId, inputVariantId: lot.materialVariantId, outputVariantId: String(out._id), colourName, thans, inputCostPerMeter: lotDoc?.unitCost ?? 0 });
    }

    const short = [...wanted.entries()]
      .map(([lotId, qty]) => ({ lot: byLot.get(lotId)!, qty }))
      .filter(({ lot, qty }) => qty > lot.available + 0.0005);
    if (short.length) {
      throw new InsufficientStockException(
        `Not enough fabric: ${short.map(({ lot, qty }) => `${lot.name} (lot ${lot.lotNo}) — sending ${qty} m, only ${lot.available} m in the warehouse`).join('; ')}.`,
        { shortages: short.map(({ lot, qty }) => ({ lotId: lot.lotId, lotNo: lot.lotNo, name: lot.name, required: qty, available: lot.available, uom: lot.uom, shortBy: roundQty(qty - lot.available) })) },
      );
    }

    const totalSent = roundQty(prepared.reduce((a, l) => a + l.thans.reduce((b, t) => b + t, 0), 0));
    const expenses = roundMoney(dto.expenses ?? 0);
    const expensesPerMeter = totalSent > 0 ? roundUnitCost(toDecimal(expenses).dividedBy(totalSent)) : 0;
    const rateBasis = dto.rateBasis ?? 'PER_METER';

    // Lot number: the processor's running series unless typed.
    if (dto.lotNo?.trim()) {
      const series = await this.lotNumbers.seriesFor('JOB_WORKER', dto.processorJobWorkerId);
      const parsed = parseLotNo(dto.lotNo);
      const normalised = parsed && parsed.prefix === series.prefix ? formatLotNo(series.prefix, parsed.n) : dto.lotNo.trim().toUpperCase();
      await this.assertLotNoFree(normalised);
    }
    const lotNo = await this.lotNumbers.use('JOB_WORKER', dto.processorJobWorkerId, dto.lotNo);
    await this.assertLotNoFree(lotNo);

    const slip = await this.jobSlips.create(
      {
        jobType: 'PROCESSING',
        jobWorkerId: dto.processorJobWorkerId,
        processingTypeId: dto.processingTypeId,
        expectedOutputLines: prepared.map((l) => ({ materialVariantId: l.outputVariantId, expectedQty: roundQty(l.thans.reduce((a, b) => a + b, 0)) })),
        expectedCompletionDate: dto.expectedReturnDate,
        chargeBasis: rateBasis,
        agreedRate: dto.rate,
        remarks: dto.remarks,
        challanNo: dto.challanNo,
        lotNo,
        docDate: dto.docDate,
        materialBased: true,
        partLabel: parts.join(' + '),
      } as any,
      actorId,
    );
    await this.slipModel.updateOne(
      { _id: slip._id },
      {
        $set: {
          processing: {
            processName: dto.processName.trim().toUpperCase(),
            parts,
            rate: dto.rate,
            rateBasis,
            expenses,
            expensesPerMeter,
            lines: prepared.map((l) => ({
              lotId: new Types.ObjectId(l.lotId),
              inputVariantId: new Types.ObjectId(l.inputVariantId),
              outputVariantId: new Types.ObjectId(l.outputVariantId),
              colourName: l.colourName,
              inputCostPerMeter: l.inputCostPerMeter,
              thans: l.thans.map((t) => ({ sent: t })),
            })),
          },
        },
      },
    );

    // Fabric leaves the warehouse into the processor's custody (one issue line per lot).
    let issueId: string | undefined;
    try {
      const issue = await this.issues.create(
        {
          jobSlipId: String(slip._id),
          lines: [...wanted.entries()].map(([lotId, qty]) => ({
            materialVariantId: byLot.get(lotId)!.materialVariantId,
            lotId,
            qtyBase: qty,
            bomRole: `${parts.join(' + ')} for ${dto.processName.trim().toLowerCase()}`,
          })),
          notes: `Lot ${lotNo} · ${dto.processName.trim()}${dto.challanNo ? ` · challan ${dto.challanNo}` : ''}`,
        },
        actorId,
      );
      issueId = String(issue._id);
      await this.issues.confirm(issueId, actorId);
    } catch (err) {
      if (issueId) await this.issues.cancel(issueId, 'Processing job could not be created', actorId).catch(() => undefined);
      await this.jobSlips.cancel(String(slip._id), 'Fabric could not be issued for processing', actorId).catch(() => undefined);
      throw err;
    }
    return this.detail(String(slip._id));
  }

  private async assertLotNoFree(lotNo: string) {
    const clash = await this.slipModel.exists({ lotNo, 'processing.processName': { $exists: true }, status: { $ne: 'CANCELLED' } });
    if (clash) throw new ProblemException('DUPLICATE_NUMBER', 409, `Lot number ${lotNo} is already used on another processing job.`);
  }

  // ------------------------------------------------------------------------------------------
  async list() {
    const slips = await this.slipModel
      .find({ 'processing.processName': { $exists: true } })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    const workers = await this.jobWorkerModel.find({ _id: { $in: slips.map((s) => s.jobWorkerId) } }).lean();
    const name = new Map(workers.map((w) => [String(w._id), w.name]));
    return slips.map((s) => this.summarise(s as any, name.get(String(s.jobWorkerId))));
  }

  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new ProblemException('NOT_FOUND', 404, 'Processing job not found.');
    const slip = await this.slipModel.findById(id).lean();
    if (!slip?.processing) throw new ProblemException('NOT_FOUND', 404, 'Processing job not found.');
    const [processor, lots, receipts] = await Promise.all([
      this.jobWorkerModel.findById(slip.jobWorkerId).lean(),
      this.lotModel.find({ _id: { $in: slip.processing.lines.map((l) => l.lotId) } }).lean(),
      this.receiptModel.find({ jobSlipId: slip._id, status: 'CONFIRMED' }).sort({ createdAt: 1 }).lean(),
    ]);
    const lotNo = new Map(lots.map((l) => [String(l._id), l.lotNo]));
    const outLots = await this.lotModel
      .find({ _id: { $in: receipts.flatMap((r) => r.lines.map((l) => l.createdLotId).filter(Boolean)) } })
      .lean();
    return {
      ...this.summarise(slip as any, processor?.name),
      lines: slip.processing.lines.map((l) => {
        const sent = roundQty(l.thans.reduce((a, t) => a + t.sent, 0));
        const done = l.thans.filter((t) => t.received !== undefined && t.received !== null);
        const sentDone = roundQty(done.reduce((a, t) => a + t.sent, 0));
        const received = roundQty(done.reduce((a, t) => a + (t.received ?? 0), 0));
        return {
          id: String(l._id),
          lotId: String(l.lotId),
          lotNo: lotNo.get(String(l.lotId)),
          colourName: l.colourName,
          inputCostPerMeter: l.inputCostPerMeter,
          costPerMeterBeforeProcessing: roundUnitCost(toDecimal(l.inputCostPerMeter).plus(slip.processing!.expensesPerMeter)),
          sent,
          sentReceived: sentDone,
          received,
          shrinkage: roundQty(sentDone - received),
          shrinkagePct: sentDone > 0 ? roundQty(toDecimal(sentDone - received).dividedBy(sentDone).times(100)) : 0,
          thans: l.thans.map((t, i) => ({ id: String(t._id), no: i + 1, sent: t.sent, received: t.received ?? null })),
        };
      }),
      outputLots: outLots.map((o) => ({ lotId: String(o._id), lotNo: o.lotNo, unitCost: o.unitCost, partLabels: o.partLabels ?? [], thans: o.thans ?? [] })),
      receipts: receipts.map((r) => ({ id: String(r._id), docNo: r.docNo, docDate: r.docDate, summary: r.processingSummary })),
    };
  }

  private summarise(slip: JobSlip & { _id: Types.ObjectId; docNo: string; docDate: Date; status: string }, processorName?: string) {
    const p = slip.processing!;
    const allThans = p.lines.flatMap((l) => l.thans);
    const sent = roundQty(allThans.reduce((a, t) => a + t.sent, 0));
    const doneThans = allThans.filter((t) => t.received !== undefined && t.received !== null);
    const received = roundQty(doneThans.reduce((a, t) => a + (t.received ?? 0), 0));
    return {
      id: String(slip._id),
      docNo: slip.docNo,
      docDate: slip.docDate,
      status: slip.status,
      lotNo: slip.lotNo,
      challanNo: slip.challanNo,
      processorId: String(slip.jobWorkerId),
      processorName,
      processName: p.processName,
      parts: p.parts,
      colours: p.lines.map((l) => l.colourName),
      rate: p.rate,
      rateBasis: p.rateBasis,
      expenses: p.expenses,
      expensesPerMeter: p.expensesPerMeter,
      thansSent: allThans.length,
      thansReceived: doneThans.length,
      sent,
      received,
      shrinkage: roundQty(doneThans.reduce((a, t) => a + t.sent, 0) - received),
      expectedReturnDate: slip.expectedCompletionDate,
      remarks: slip.remarks,
    };
  }

  // ------------------------------------------------------------------------------------------
  /** Receive thans back (any subset, any number of times) into the main warehouse as processed lots. */
  async receive(id: string, dto: ReceiveProcessingBatchDto, actorId: string) {
    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('JOB_RECEIPT', fy, 'JR');

    await this.tx.run(async (session) => {
      const slip = await this.slipModel.findById(id).session(session);
      if (!slip?.processing) throw new ProblemException('NOT_FOUND', 404, 'Processing job not found.');
      if (!RECEIVABLE.includes(slip.status)) {
        throw new InvalidStateTransitionException(`Cannot receive on a processing job that is ${slip.status.replace(/_/g, ' ').toLowerCase()}.`);
      }
      const p = slip.processing;
      const totalSentAll = p.lines.reduce((a, l) => a + l.thans.reduce((b, t) => b + t.sent, 0), 0);

      const [custody, production, warehouse] = await Promise.all([
        this.location(`CUSTODY-${slip.jobWorkerId}`, session),
        this.location('VIRT-PRODUCTION', session),
        this.location('MAIN-WH', session),
      ]);

      const docNo = await this.numberSeries.next('JOB_RECEIPT', fy, session);
      const receiptId = new Types.ObjectId();
      const receiptLines: any[] = [];
      let chargeTotal = new Decimal(0);
      let sentTotal = 0;
      let receivedTotal = 0;
      const seenThans = new Set<string>();

      for (const [li, input] of dto.lines.entries()) {
        const line = p.lines.find((l) => String(l._id) === input.lineId);
        if (!line) throw new ValidationFailedException({ [`lines.${li}.lineId`]: 'unknown' }, `Colour ${li + 1}: not part of this processing job.`);

        let consumed = 0;
        let received = 0;
        const receivedThans: number[] = [];
        for (const t of input.thans) {
          if (seenThans.has(t.thanId)) throw new ValidationFailedException({ thans: 'duplicate' }, 'The same than appears twice.');
          seenThans.add(t.thanId);
          const than = line.thans.find((x) => String(x._id) === t.thanId);
          if (!than) throw new ValidationFailedException({ thans: 'unknown' }, `${line.colourName}: unknown than.`);
          if (than.received !== undefined && than.received !== null) {
            throw new ProblemException('ALREADY_RECEIVED', 409, `${line.colourName}: than of ${than.sent} m was already received.`);
          }
          if (t.received > than.sent * 1.05 + 0.0005) {
            throw new ValidationFailedException({ thans: 'more than sent' }, `${line.colourName}: received ${t.received} m for a than sent as ${than.sent} m.`);
          }
          than.received = roundQty(t.received);
          than.receiptId = receiptId;
          consumed += than.sent;
          received += than.received;
          if (than.received > 0) receivedThans.push(than.received);
        }
        consumed = roundQty(consumed);
        received = roundQty(received);
        if (consumed <= 0) continue;

        // Fabric out of the processor's custody (exactly what was sent for these thans).
        const ml = await this.materialLineModel.findOne({ jobSlipId: slip._id, lotId: line.lotId }).session(session);
        const remaining = ml ? roundQty(ml.qtyIssued - ml.qtyReturned - ml.qtyConsumed - ml.qtyWrittenOff) : 0;
        if (!ml || remaining + 0.0005 < consumed) {
          throw new InsufficientStockException(`${line.colourName}: only ${remaining} m of this fabric is still with the processor.`);
        }
        await this.stockService.post(
          [{
            type: 'CONSUMPTION',
            stockItemId: String(ml.stockItemId),
            lotId: String(ml.lotId),
            fromLocationId: String(custody._id),
            toLocationId: String(production._id),
            qty: consumed,
            doc: { type: 'JOB_RECEIPT', id: String(receiptId) },
          }],
          session,
          actorId,
        );
        ml.qtyConsumed = roundQty(ml.qtyConsumed + consumed);
        await ml.save({ session });

        // Cost of what came back.
        const charge = p.rateBasis === 'PER_METER'
          ? toDecimal(p.rate).times(consumed)
          : totalSentAll > 0 ? toDecimal(p.rate).times(consumed).dividedBy(totalSentAll) : toDecimal(0);
        chargeTotal = chargeTotal.plus(charge);
        const fabric = toDecimal(line.inputCostPerMeter).times(consumed);
        const expense = toDecimal(p.expensesPerMeter).times(consumed);
        const unitCost = received > 0 ? roundUnitCost(fabric.plus(expense).plus(charge).dividedBy(received)) : 0;

        let createdLotId: Types.ObjectId | undefined;
        if (received > 0) {
          const outItem = await this.stockItems.getOrCreateForMaterialVariant(String(line.outputVariantId), session, 'PROCESSED_MATERIAL');
          let outLotNo = `${slip.lotNo ?? slip.docNo}/${line.colourName.toUpperCase()}`;
          for (let n = 2; await this.lotModel.exists({ stockItemId: outItem._id, lotNo: outLotNo }).session(session); n++) {
            outLotNo = `${slip.lotNo ?? slip.docNo}/${line.colourName.toUpperCase()}-${n}`;
          }
          const posted = await this.stockService.post(
            [{
              type: 'PROCESS_OUTPUT',
              stockItemId: String(outItem._id),
              fromLocationId: String(production._id),
              toLocationId: String(warehouse._id),
              qty: received,
              unitCost,
              lotOrigin: {
                lotNo: outLotNo,
                receivedOn: dto.docDate ? new Date(dto.docDate) : new Date(),
                originDocType: 'PROCESS_OUTPUT',
                originDocId: receiptId as any,
                originJobSlipId: slip._id as any,
              },
              doc: { type: 'JOB_RECEIPT', id: String(receiptId) },
            }],
            session,
            actorId,
          );
          createdLotId = new Types.ObjectId(posted[0].lotId);
          await this.lotModel.updateOne(
            { _id: createdLotId },
            { $set: { partLabels: p.parts, thans: receivedThans, processedFromLotId: line.lotId } },
            { session },
          );
        }
        receiptLines.push({ materialVariantId: line.outputVariantId, expectedQty: consumed, receivedQty: received, acceptedQty: received, createdLotId });
        sentTotal += consumed;
        receivedTotal += received;
      }
      if (!receiptLines.length) throw new ValidationFailedException({ lines: 'empty' }, 'Enter the metres received for at least one than.');

      sentTotal = roundQty(sentTotal);
      receivedTotal = roundQty(receivedTotal);
      await this.receiptModel.create(
        [{
          _id: receiptId,
          docNo,
          docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
          jobSlipId: slip._id,
          jobWorkerId: slip.jobWorkerId,
          lines: receiptLines,
          remarks: dto.remarks,
          warnings: [],
          processingSummary: {
            sentQty: sentTotal,
            receivedQty: receivedTotal,
            shortageQty: roundQty(sentTotal - receivedTotal),
            shortagePct: sentTotal > 0 ? roundQty(toDecimal(sentTotal - receivedTotal).dividedBy(sentTotal).times(100)) : 0,
          },
          status: 'CONFIRMED',
          confirmedBy: actorId,
          confirmedAt: new Date(),
          createdBy: actorId,
          updatedBy: actorId,
        }],
        { session },
      );
      // Processor's earnings for the khata (expenses are cost, not the processor's money).
      const amount = roundMoney(chargeTotal);
      if (amount > 0) {
        await this.chargeModel.create(
          [{ jobSlipId: slip._id, receiptId, kind: 'PROCESSING', basis: p.rateBasis, quantity: sentTotal, rate: p.rate, amount, note: `${p.processName.toLowerCase()} · ${sentTotal} m sent` }],
          { session },
        );
      }

      const allDone = p.lines.every((l) => l.thans.every((t) => t.received !== undefined && t.received !== null));
      slip.status = allDone ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      slip.markModified('processing');
      await slip.save({ session });
    });
    return this.detail(id);
  }

  private async location(code: string, session: any) {
    const loc = await this.locationModel.findOne({ code }).session(session).lean();
    if (!loc) throw new ProblemException('VALIDATION_FAILED', 500, `Location ${code} is not set up.`);
    return loc;
  }
}

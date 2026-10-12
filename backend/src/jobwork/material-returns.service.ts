import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaterialReturn, MaterialReturnDocument } from './schemas/material-return.schema';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockItem, StockItemDocument } from '../inventory/schemas/stock-item.schema';
import { StockService } from '../inventory/stock.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import Decimal from 'decimal.js';
import {
  InsufficientStockException,
  InvalidStateTransitionException,
  ProblemException,
  ValidationFailedException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { roundQty, toDecimal } from '../common/utils/decimal';
import { CreateMaterialReturnDto } from './dto/material-return.dto';
import { CostingService } from '../costing/costing.service';
import { JobworkLookupService } from './jobwork-lookup.service';

/** JOB-07: unused or rejected input material returned from the factory into its original lot (BR-02 in reverse). */
@Injectable()
export class MaterialReturnsService {
  constructor(
    @InjectModel(MaterialReturn.name) private readonly model: Model<MaterialReturnDocument>,
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
    private readonly stockService: StockService,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
    @Inject(forwardRef(() => CostingService)) private readonly costingService: CostingService,
    private readonly lookup: JobworkLookupService,
  ) {}

  async list(filter: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const rows = await this.model
      .find(castObjectIdFilter(filter, ['jobSlipId', 'jobWorkerId']))
      .sort({ createdAt: -1 })
      .lean();
    const [slips, workers, variants, lots] = await Promise.all([
      this.jobSlipModel.find({ _id: { $in: rows.map((r) => r.jobSlipId) } }).lean(),
      this.lookup.jobWorkers(rows.map((r) => r.jobWorkerId)),
      this.lookup.materialVariants(rows.flatMap((r) => r.lines.map((l) => l.materialVariantId))),
      this.lookup.lots(rows.flatMap((r) => r.lines.map((l) => l.lotId))),
    ]);
    const slipNo = new Map(slips.map((s) => [String(s._id), s.docNo]));
    return rows.map((r) => ({
      ...r,
      jobSlipNo: slipNo.get(String(r.jobSlipId)),
      jobWorkerName: workers.get(String(r.jobWorkerId))?.name,
      lines: r.lines.map((l) => ({
        ...l,
        materialVariantName: variants.get(String(l.materialVariantId))?.name,
        uom: variants.get(String(l.materialVariantId))?.uom,
        lotNo: lots.get(String(l.lotId))?.lotNo,
      })),
    }));
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new ProblemException('NOT_FOUND', 404, 'Material return not found.');
    }
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Material return not found.');
    return doc;
  }

  /**
   * JOB-07. Only material this job still holds can come back, into the lot it went out from.
   * A line without lotId is spread over the job's own lots of that variant, oldest first.
   */
  async create(dto: CreateMaterialReturnDto, actorId: string): Promise<MaterialReturnDocument> {
    if (!Types.ObjectId.isValid(dto.jobSlipId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    }
    const jobSlip = await this.jobSlipModel.findById(dto.jobSlipId).lean();
    if (!jobSlip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    if (['CREATED', 'CLOSED', 'CANCELLED'].includes(jobSlip.status)) {
      throw new InvalidStateTransitionException(
        `Cannot return material on a job slip in status ${jobSlip.status}.`,
      );
    }

    const custodyLines = await this.materialLineModel.find({ jobSlipId: jobSlip._id }).lean();
    const lotNos = await this.lookup.lots(custodyLines.map((l) => l.lotId));
    const items = await this.lookup.stockItemMaterials(custodyLines.map((l) => l.stockItemId));
    const remaining = new Map<string, number>(); // lotId -> remaining for this job
    for (const l of custodyLines) {
      remaining.set(
        String(l.lotId),
        roundQty(l.qtyIssued - l.qtyReturned - l.qtyConsumed - l.qtyWrittenOff),
      );
    }

    const out: Array<{ materialVariantId: Types.ObjectId; lotId: Types.ObjectId; qtyBase: number }> = [];
    for (const [i, l] of dto.lines.entries()) {
      const candidates = custodyLines
        .filter((c) => items.get(String(c.stockItemId))?.materialVariantId === l.materialVariantId)
        .filter((c) => !l.lotId || String(c.lotId) === l.lotId)
        .sort(
          (a, b) =>
            (lotNos.get(String(a.lotId))?.receivedOn?.getTime() ?? 0) -
            (lotNos.get(String(b.lotId))?.receivedOn?.getTime() ?? 0),
        );
      if (candidates.length === 0) {
        throw new ValidationFailedException(
          { [`lines.${i}`]: 'not issued to this job' },
          l.lotId
            ? 'That lot was never issued to this job slip.'
            : 'That material was never issued to this job slip.',
        );
      }
      let need = toDecimal(l.qtyBase);
      for (const c of candidates) {
        if (need.lte(0)) break;
        const avail = remaining.get(String(c.lotId)) ?? 0;
        if (avail <= 0) continue;
        const take = roundQty(Decimal.min(need, avail));
        out.push({
          materialVariantId: new Types.ObjectId(l.materialVariantId),
          lotId: c.lotId as Types.ObjectId,
          qtyBase: take,
        });
        remaining.set(String(c.lotId), roundQty(avail - take));
        need = need.minus(take);
      }
      if (need.gt(0.0005)) {
        const totalAvail = roundQty(
          candidates.reduce(
            (s, c) =>
              s + roundQty(c.qtyIssued - c.qtyReturned - c.qtyConsumed - c.qtyWrittenOff),
            0,
          ),
        );
        throw new InsufficientStockException(
          `Cannot return ${l.qtyBase} of ${items.get(String(candidates[0].stockItemId))?.name ?? 'this material'}: only ${totalAvail} is still with the factory for this job.`,
          { materialVariantId: l.materialVariantId, requested: l.qtyBase, available: totalAvail },
        );
      }
    }

    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('MATERIAL_RETURN', fy, 'MR');
    const docNo = await this.numberSeries.next('MATERIAL_RETURN', fy);

    const created = await this.model.create({
      docNo,
      docDate: new Date(),
      jobSlipId: jobSlip._id,
      jobWorkerId: jobSlip.jobWorkerId,
      lines: out,
      notes: dto.notes,
      status: 'DRAFT',
      createdBy: actorId,
      updatedBy: actorId,
    });
    if (dto.confirm) return this.confirm(String(created._id), actorId);
    return created;
  }

  async confirm(id: string, actorId: string): Promise<MaterialReturnDocument> {
    return this.transactionService.run(async (session) => {
      const ret = await this.model.findById(id).session(session);
      if (!ret) throw new ProblemException('NOT_FOUND', 404, 'Material return not found.');
      if (ret.status !== 'DRAFT') {
        throw new InvalidStateTransitionException(`Material return is already ${ret.status}.`);
      }

      const [warehouse, custody] = await Promise.all([
        this.locationModel.findOne({ code: 'MAIN-WH' }).session(session).lean(),
        this.locationModel
          .findOne({ code: `CUSTODY-${ret.jobWorkerId}` })
          .session(session)
          .lean(),
      ]);
      if (!warehouse || !custody) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          500,
          'Warehouse or custody location is not seeded.',
        );
      }

      const slip = await this.jobSlipModel.findById(ret.jobSlipId).session(session).lean();
      if (!slip || ['CLOSED', 'CANCELLED'].includes(slip.status)) {
        throw new InvalidStateTransitionException(
          `Cannot return material on a job slip in status ${slip?.status ?? 'unknown'}.`,
        );
      }

      for (const line of ret.lines) {
        // Re-check against this job's own custody line inside the transaction.
        const custodyLine = await this.materialLineModel
          .findOne({ jobSlipId: ret.jobSlipId, lotId: line.lotId })
          .session(session)
          .lean();
        const left = custodyLine
          ? roundQty(
              custodyLine.qtyIssued -
                custodyLine.qtyReturned -
                custodyLine.qtyConsumed -
                custodyLine.qtyWrittenOff,
            )
          : 0;
        if (line.qtyBase > left + 0.0005) {
          throw new InsufficientStockException(
            `Cannot return ${line.qtyBase}: only ${left} of that lot is still with the factory for this job.`,
            { lotId: String(line.lotId), requested: line.qtyBase, available: left },
          );
        }

        const stockItem = await this.stockItemModel
          .findOne({ materialVariantId: line.materialVariantId })
          .session(session)
          .lean();
        if (!stockItem)
          throw new ProblemException(
            'NOT_FOUND',
            404,
            'Stock item not found for this material variant.',
          );

        await this.stockService.post(
          [
            {
              type: 'RETURN_FROM_FACTORY',
              stockItemId: String(stockItem._id),
              lotId: String(line.lotId),
              fromLocationId: String(custody._id),
              toLocationId: String(warehouse._id),
              qty: line.qtyBase,
              doc: { type: 'MATERIAL_RETURN', id: String(ret._id), lineId: String(line._id) },
            },
          ],
          session,
          actorId,
        );

        await this.materialLineModel.updateOne(
          { jobSlipId: ret.jobSlipId, lotId: line.lotId },
          { $inc: { qtyReturned: line.qtyBase } },
          { session },
        );
      }

      ret.status = 'CONFIRMED';
      ret.confirmedBy = actorId as any;
      ret.confirmedAt = new Date();
      ret.updatedBy = actorId as any;
      ret.version += 1;
      await ret.save({ session });
      await this.costingService.writeCostSheet(String(ret.jobSlipId), session);
      return ret;
    });
  }

  async cancel(id: string, reason: string, actorId: string): Promise<MaterialReturnDocument> {
    const ret = await this.model.findById(id);
    if (!ret) throw new ProblemException('NOT_FOUND', 404, 'Material return not found.');
    if (ret.status !== 'DRAFT') {
      throw new InvalidStateTransitionException('Only a draft material return can be cancelled.');
    }
    ret.status = 'CANCELLED';
    ret.cancelReason = reason;
    ret.cancelledBy = actorId as any;
    ret.cancelledAt = new Date();
    ret.updatedBy = actorId as any;
    ret.version += 1;
    await ret.save();
    return ret;
  }
}

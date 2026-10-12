import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { MaterialIssue, MaterialIssueDocument } from './schemas/material-issue.schema';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { JobSlipsService } from './job-slips.service';
import { StockService } from '../inventory/stock.service';
import { StockItemsService } from '../inventory/stock-items.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import {
  InsufficientStockException,
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { CreateMaterialIssueDto } from './dto/material-issue.dto';
import { MaterialStockInfoService } from '../design/material-stock-info.service';
import { roundQty, toDecimal } from '../common/utils/decimal';
import Decimal from 'decimal.js';

const ISSUABLE_STATUSES = ['CREATED', 'MATERIAL_ISSUED', 'IN_PROCESS', 'READY'];

/** JOB-04, JOB-06, BR-02. */
@Injectable()
export class MaterialIssuesService {
  constructor(
    @InjectModel(MaterialIssue.name) private readonly model: Model<MaterialIssueDocument>,
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly jobSlipsService: JobSlipsService,
    private readonly stockService: StockService,
    private readonly stockItemsService: StockItemsService,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
    private readonly materialInfo: MaterialStockInfoService,
  ) {}

  list(filter: Record<string, unknown> = {}) {
    return this.model
      .find(castObjectIdFilter(filter, ['jobSlipId', 'jobWorkerId']))
      .sort({ createdAt: -1 })
      .lean();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Material issue not found.');
    return doc;
  }

  async create(dto: CreateMaterialIssueDto, actorId: string): Promise<MaterialIssueDocument> {
    const jobSlip = await this.jobSlipModel.findById(dto.jobSlipId).lean();
    if (!jobSlip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    if (!ISSUABLE_STATUSES.includes(jobSlip.status)) {
      throw new InvalidStateTransitionException(
        `Cannot issue material to a job slip in status ${jobSlip.status}.`,
      );
    }

    // STK-06: refuse up front (before a draft or a doc number exists) when MAIN-WH does not
    // hold enough. Confirm re-checks through the ledger, so a race between two drafts is still
    // caught there.
    await this.assertWarehouseHas(dto.lines);

    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('MATERIAL_ISSUE', fy, 'MI');
    const docNo = await this.numberSeries.next('MATERIAL_ISSUE', fy);

    return this.model.create({
      docNo,
      docDate: new Date(),
      jobSlipId: new Types.ObjectId(dto.jobSlipId),
      jobWorkerId: jobSlip.jobWorkerId,
      lines: dto.lines.map((l) => ({
        materialVariantId: new Types.ObjectId(l.materialVariantId),
        bomRole: l.bomRole,
        qtyBase: l.qtyBase,
        lotId: l.lotId ? new Types.ObjectId(l.lotId) : undefined,
      })),
      notes: dto.notes,
      status: 'DRAFT',
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  private async assertWarehouseHas(
    lines: { materialVariantId: string; qtyBase: number }[],
  ): Promise<void> {
    const wanted = new Map<string, Decimal>();
    for (const l of lines) {
      wanted.set(
        l.materialVariantId,
        (wanted.get(l.materialVariantId) ?? toDecimal(0)).plus(l.qtyBase),
      );
    }
    const info = await this.materialInfo.info(Array.from(wanted.keys()));
    const missing = Array.from(wanted.keys()).filter((id) => !info.has(id));
    if (missing.length > 0) {
      throw new ProblemException(
        'NOT_FOUND',
        404,
        `Material variant not found: ${missing.join(', ')}.`,
      );
    }
    const shortages = [];
    for (const [variantId, qty] of wanted) {
      const i = info.get(variantId)!;
      if (qty.gt(toDecimal(i.mainWhOnHand).plus(0.0005))) {
        shortages.push({
          materialVariantId: variantId,
          name: i.name,
          uom: i.uom,
          required: roundQty(qty),
          available: i.mainWhOnHand,
          shortBy: roundQty(qty.minus(i.mainWhOnHand)),
        });
      }
    }
    if (shortages.length === 0) return;
    const parts = shortages.map(
      (s) =>
        `${s.name}: issuing ${s.required} ${s.uom}, only ${s.available} ${s.uom} in the main warehouse (short by ${s.shortBy} ${s.uom})`,
    );
    throw new InsufficientStockException(`Cannot issue: ${parts.join('; ')}.`, { shortages });
  }

  /** BR-02: reduces warehouse stock and creates custody stock for the job's party. */
  async confirm(id: string, actorId: string): Promise<MaterialIssueDocument> {
    return this.transactionService.run(async (session) => {
      const issue = await this.model.findById(id).session(session);
      if (!issue) throw new ProblemException('NOT_FOUND', 404, 'Material issue not found.');
      if (issue.status !== 'DRAFT') {
        throw new InvalidStateTransitionException(`Material issue is already ${issue.status}.`);
      }

      const [warehouse, custody] = await Promise.all([
        this.locationModel.findOne({ code: 'MAIN-WH' }).session(session).lean(),
        this.locationModel
          .findOne({ code: `CUSTODY-${issue.jobWorkerId}` })
          .session(session)
          .lean(),
      ]);
      if (!warehouse)
        throw new ProblemException('VALIDATION_FAILED', 500, 'MAIN-WH location is not seeded.');
      if (!custody)
        throw new ProblemException(
          'VALIDATION_FAILED',
          500,
          'Custody location not found for this job worker.',
        );

      for (const line of issue.lines) {
        const stockItem = await this.stockItemsService.getOrCreateForMaterialVariant(
          String(line.materialVariantId),
          session,
        );

        const posted = await this.stockService.post(
          [
            {
              type: 'ISSUE',
              stockItemId: String(stockItem._id),
              lotId: line.lotId ? String(line.lotId) : undefined,
              fromLocationId: String(warehouse._id),
              toLocationId: String(custody._id),
              qty: line.qtyBase,
              doc: { type: 'MATERIAL_ISSUE', id: String(issue._id), lineId: String(line._id) },
            },
          ],
          session,
          actorId,
        );

        for (const row of posted) {
          await this.materialLineModel.updateOne(
            { jobSlipId: issue.jobSlipId, lotId: new Types.ObjectId(row.lotId) },
            {
              $inc: { qtyIssued: row.qty },
              $setOnInsert: {
                jobWorkerId: issue.jobWorkerId,
                stockItemId: new Types.ObjectId(stockItem._id as unknown as string),
                bomRole: line.bomRole,
                unitCost: row.unitCost,
              },
            },
            { session, upsert: true },
          );
        }
      }

      issue.status = 'CONFIRMED';
      issue.updatedBy = actorId as any;
      issue.version += 1;
      await issue.save({ session });

      await this.jobSlipsService.markMaterialIssued(String(issue.jobSlipId), session);

      return issue;
    });
  }

  async cancel(id: string, reason: string, actorId: string): Promise<MaterialIssueDocument> {
    const issue = await this.model.findById(id);
    if (!issue) throw new ProblemException('NOT_FOUND', 404, 'Material issue not found.');
    if (issue.status !== 'DRAFT') {
      throw new InvalidStateTransitionException(
        'Only a draft material issue can be cancelled directly - confirmed material must be returned instead.',
      );
    }
    issue.status = 'CANCELLED';
    issue.cancelReason = reason;
    issue.cancelledBy = actorId as any;
    issue.cancelledAt = new Date();
    issue.updatedBy = actorId as any;
    issue.version += 1;
    await issue.save();
    return issue;
  }

  /** JOB-06: no stock effect (BR-14) - a discrepancy just flags the Inventory role for follow-up. */
  async acknowledge(
    id: string,
    discrepancyNote: string | undefined,
    actorId: string,
  ): Promise<MaterialIssueDocument> {
    const issue = await this.model.findById(id);
    if (!issue) throw new ProblemException('NOT_FOUND', 404, 'Material issue not found.');
    if (issue.status !== 'CONFIRMED') {
      throw new InvalidStateTransitionException(
        'Only a confirmed material issue can be acknowledged.',
      );
    }
    issue.acknowledgedAt = new Date();
    issue.discrepancyNote = discrepancyNote;
    issue.updatedBy = actorId as any;
    issue.version += 1;
    await issue.save();
    return issue;
  }

  /** Portal convenience (JOB-14): acknowledges the most recent not-yet-acknowledged confirmed issue for a job slip. */
  async acknowledgeLatestForJobSlip(
    jobSlipId: string,
    discrepancyNote: string | undefined,
    actorId: string,
  ): Promise<MaterialIssueDocument> {
    const issue = await this.model
      .findOne({
        jobSlipId: new Types.ObjectId(jobSlipId),
        status: 'CONFIRMED',
        acknowledgedAt: null,
      })
      .sort({ createdAt: -1 });
    if (!issue) {
      throw new ProblemException(
        'NOT_FOUND',
        404,
        'No unacknowledged material issue found for this job slip.',
      );
    }
    return this.acknowledge(String(issue._id), discrepancyNote, actorId);
  }
}

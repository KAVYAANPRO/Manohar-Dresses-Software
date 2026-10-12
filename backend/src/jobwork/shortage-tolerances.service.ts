import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IsMongoId, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ShortageTolerance, ShortageToleranceDocument } from './schemas/shortage-tolerance.schema';
import { CompanySettingsService } from '../master/company-settings.service';
import { ProblemException } from '../common/errors/problem.exception';

export class UpsertShortageToleranceDto {
  @IsOptional() @IsMongoId() materialId?: string;
  @IsOptional() @IsMongoId() processingTypeId?: string;
  @IsOptional() @IsMongoId() jobWorkerId?: string;
  @IsNumber() @Min(0) @Max(100) tolerancePct!: number;
  @IsOptional() @IsString() notes?: string;
}

export interface ToleranceRule {
  _id: Types.ObjectId | string;
  materialId?: Types.ObjectId | string;
  processingTypeId?: Types.ObjectId | string;
  jobWorkerId?: Types.ObjectId | string;
  tolerancePct: number;
}

export interface ResolvedTolerance {
  tolerancePct: number;
  source: 'RULE' | 'COMPANY_DEFAULT';
  ruleId?: string;
}

/**
 * Pure resolution (unit-tested): every key set on a rule must equal the context's value; among
 * matching rules the one with the most keys set wins (ties: the first, i.e. newest).
 */
export function resolveTolerance(
  rules: ToleranceRule[],
  ctx: { materialId?: string; processingTypeId?: string; jobWorkerId?: string },
  companyDefaultPct: number,
): ResolvedTolerance {
  let best: { rule: ToleranceRule; score: number } | undefined;
  for (const rule of rules) {
    let score = 0;
    let ok = true;
    for (const key of ['materialId', 'processingTypeId', 'jobWorkerId'] as const) {
      const v = rule[key];
      if (v === undefined || v === null) continue;
      if (String(v) !== String(ctx[key] ?? '')) {
        ok = false;
        break;
      }
      score++;
    }
    if (ok && (!best || score > best.score)) best = { rule, score };
  }
  if (best) {
    return { tolerancePct: best.rule.tolerancePct, source: 'RULE', ruleId: String(best.rule._id) };
  }
  return { tolerancePct: companyDefaultPct, source: 'COMPANY_DEFAULT' };
}

@Injectable()
export class ShortageTolerancesService {
  constructor(
    @InjectModel(ShortageTolerance.name)
    private readonly model: Model<ShortageToleranceDocument>,
    private readonly companySettings: CompanySettingsService,
  ) {}

  list() {
    return this.model.find({ isActive: true }).sort({ createdAt: -1 }).lean();
  }

  async create(dto: UpsertShortageToleranceDto, actorId: string) {
    return this.model.create({
      materialId: dto.materialId ? new Types.ObjectId(dto.materialId) : undefined,
      processingTypeId: dto.processingTypeId ? new Types.ObjectId(dto.processingTypeId) : undefined,
      jobWorkerId: dto.jobWorkerId ? new Types.ObjectId(dto.jobWorkerId) : undefined,
      tolerancePct: dto.tolerancePct,
      notes: dto.notes,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async deactivate(id: string, actorId: string) {
    const doc = await this.model.findById(id);
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Shortage tolerance not found.');
    doc.isActive = false;
    doc.updatedBy = actorId as any;
    doc.version += 1;
    await doc.save();
    return doc;
  }

  /** Loads the rules once so callers can resolve many lines without N queries. */
  async resolver() {
    const [rules, settings] = await Promise.all([
      this.model.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
      this.companySettings.get(),
    ]);
    const companyDefault = settings?.shortageTolerancePct ?? 0;
    return (ctx: { materialId?: string; processingTypeId?: string; jobWorkerId?: string }) =>
      resolveTolerance(rules as unknown as ToleranceRule[], ctx, companyDefault);
  }
}

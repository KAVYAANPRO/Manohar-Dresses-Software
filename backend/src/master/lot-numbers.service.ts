import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  LotNumberSeries,
  LotNumberSeriesDocument,
  LotSeriesScope,
} from './schemas/lot-number-series.schema';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';
import { JobWorker, JobWorkerDocument } from './schemas/job-worker.schema';
import { ProblemException } from '../common/errors/problem.exception';

/** "KAV-12" / "kav 12" / "KAV12" -> { prefix: 'KAV', n: 12 }. */
export function parseLotNo(lotNo: string): { prefix: string; n: number } | null {
  const m = /^\s*([A-Za-z][A-Za-z0-9]*?)[\s\-/]*(\d+)\s*$/.exec(lotNo);
  return m ? { prefix: m[1].toUpperCase(), n: parseInt(m[2], 10) } : null;
}

export function formatLotNo(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

/** First three letters of the name, upper-case ("Kavyan Creations" -> "KAV"); "LOT" if none. */
export function basePrefix(name: string): string {
  const letters = (name ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'LOT').padEnd(3, 'X');
}

/**
 * Per-party lot numbers (see LotNumberSeries). Suggests the next number for a party, and on save
 * records the number actually used - auto or typed - so the sequence always stays ahead of it.
 */
@Injectable()
export class LotNumbersService {
  constructor(
    @InjectModel(LotNumberSeries.name) private readonly model: Model<LotNumberSeriesDocument>,
    @InjectModel(Supplier.name) private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(JobWorker.name) private readonly jobWorkerModel: Model<JobWorkerDocument>,
  ) {}

  /** The party's series, created on first use with a prefix unique in its scope (KAV, KAV2, ...). */
  async seriesFor(scope: LotSeriesScope, partyId: string, session?: ClientSession) {
    if (!Types.ObjectId.isValid(partyId)) throw new ProblemException('VALIDATION_FAILED', 422, 'Invalid party.');
    const existing = await this.model.findOne({ scope, partyId: new Types.ObjectId(partyId) }).session(session ?? null);
    if (existing) return existing;

    const party =
      scope === 'SUPPLIER'
        ? await this.supplierModel.findById(partyId).session(session ?? null).lean()
        : await this.jobWorkerModel.findById(partyId).session(session ?? null).lean();
    if (!party) throw new ProblemException('NOT_FOUND', 404, scope === 'SUPPLIER' ? 'Supplier not found.' : 'Karigar / factory not found.');

    const base = basePrefix(party.name);
    for (let i = 1; i < 100; i++) {
      const prefix = i === 1 ? base : `${base}${i}`;
      const taken = await this.model.exists({ scope, prefix }).session(session ?? null);
      if (taken) continue;
      try {
        const [created] = await this.model.create([{ scope, partyId: new Types.ObjectId(partyId), prefix, next: 1 }], { session });
        return created;
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
        // Raced with another request: re-read (same party) or try the next prefix.
        const again = await this.model.findOne({ scope, partyId: new Types.ObjectId(partyId) }).session(session ?? null);
        if (again) return again;
      }
    }
    throw new ProblemException('CONFLICT', 409, 'Could not allocate a lot-number prefix for this party.');
  }

  async suggest(scope: LotSeriesScope, partyId: string) {
    const s = await this.seriesFor(scope, partyId);
    return { prefix: s.prefix, next: s.next, lotNo: formatLotNo(s.prefix, s.next) };
  }

  /**
   * Returns the lot number to store: the typed one (normalised when it follows the party's
   * PREFIX-n pattern) or the next auto number. Moves the sequence past whatever was used.
   */
  async use(scope: LotSeriesScope, partyId: string, typed: string | undefined, session?: ClientSession): Promise<string> {
    const series = await this.seriesFor(scope, partyId, session);
    const raw = typed?.trim();
    if (!raw) {
      const updated = await this.model.findOneAndUpdate(
        { _id: series._id },
        { $inc: { next: 1 } },
        { session, new: false },
      );
      return formatLotNo(series.prefix, updated!.next);
    }
    const parsed = parseLotNo(raw);
    if (parsed && parsed.prefix === series.prefix) {
      await this.model.updateOne({ _id: series._id, next: { $lte: parsed.n } }, { $set: { next: parsed.n + 1 } }, { session });
      return formatLotNo(series.prefix, parsed.n);
    }
    return raw.toUpperCase();
  }
}

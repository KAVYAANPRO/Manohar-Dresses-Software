import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { NumberSeries, NumberSeriesDocument } from '../schemas/number-series.schema';
import { NumberSeriesMissingException, ProblemException } from '../errors/problem.exception';

/**
 * Gapless, sequential document numbering (tech.md §4.4). `findOneAndUpdate` with `$inc` is
 * a single atomic Mongo operation, so two concurrent callers never receive the same number -
 * the equivalent guarantee to the Postgres design's row lock held for the shortest possible
 * time. Must be called inside the caller's transaction/session and allocated LAST in a
 * document's confirm flow, exactly as tech.md §4.4 specifies for invoices, so a rollback
 * genuinely returns the number to the pool.
 */
@Injectable()
export class NumberSeriesService {
  constructor(
    @InjectModel(NumberSeries.name) private readonly model: Model<NumberSeriesDocument>,
  ) {}

  async next(docType: string, fy: string, session?: ClientSession): Promise<string> {
    const series = await this.model.findOneAndUpdate(
      { docType, fy },
      { $inc: { nextNo: 1 } },
      { new: false, session },
    );
    if (!series) {
      throw new NumberSeriesMissingException(docType, fy);
    }
    const allocated = series.nextNo;
    return `${series.prefix}/${series.fy}/${String(allocated).padStart(series.pad, '0')}`;
  }

  async ensureSeries(docType: string, fy: string, prefix: string, pad = 5): Promise<void> {
    await this.model.updateOne(
      { docType, fy },
      { $setOnInsert: { prefix, pad, nextNo: 1 } },
      { upsert: true },
    );
  }

  list() {
    return this.model.find().sort({ docType: 1, fy: -1 }).lean();
  }

  /**
   * Change a series' prefix / padding. Only allowed before the first number is issued in that
   * financial year: changing the format mid-year would break the "consecutive serial" rule for
   * GST invoices (SAL-06) and make issued numbers look non-sequential. nextNo is never editable.
   */
  async updateFormat(id: string, patch: { prefix?: string; pad?: number }) {
    const series = await this.model.findById(id);
    if (!series) throw new ProblemException('NOT_FOUND', 404, 'Number series not found.');
    if (series.nextNo > 1) {
      throw new ProblemException(
        'SERIES_IN_USE',
        409,
        `${series.docType} ${series.fy} has already issued ${series.nextNo - 1} number(s); its format can only change for a new financial year.`,
      );
    }
    const prefix = patch.prefix ?? series.prefix;
    const pad = patch.pad ?? series.pad;
    const sample = `${prefix}/${series.fy}/${'9'.repeat(pad)}`;
    if (series.docType === 'INVOICE' && sample.length > 16) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Invoice numbers must be at most 16 characters (GST); "${sample}" is ${sample.length}.`,
      );
    }
    series.prefix = prefix;
    series.pad = pad;
    await series.save();
    return series.toObject();
  }
}

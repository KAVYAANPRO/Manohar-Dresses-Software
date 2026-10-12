import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { StockLedgerEntry, StockLedgerDocument } from './schemas/stock-ledger.schema';
import { StockBalance, StockBalanceDocument } from './schemas/stock-balance.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { ReconRun, ReconRunDocument } from './schemas/recon-run.schema';

const EPSILON = 0.0005;

/**
 * STK-10 / tech.md §5.8 / invariants I-1, I-2, I-4 (§14.2). Recomputes balances straight from
 * the ledger and compares against `stock_balances`; never "fixes" anything - a mismatch is an
 * incident, not a chore, exactly as tech.md insists. Runs nightly (replacing tech.md's
 * Postgres-job-queue `recon-ledger` job with NestJS's built-in scheduler, since there is no
 * pg-boss-equivalent in this Mongo build) and is also callable on demand for tests and ops.
 *
 * I-3 (ledger/audit immutability) is enforced structurally by the schemas, not checked here.
 * I-6 (every ledger row references a CONFIRMED document) and I-9 (no DRAFT document has ledger
 * rows) are true by construction in this codebase (StockService.post is only ever called from
 * a confirm handler) but are not independently re-verified by this job - a documented gap,
 * flagged for a follow-up once more document types exist.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(StockLedgerEntry.name) private readonly ledgerModel: Model<StockLedgerDocument>,
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    @InjectModel(ReconRun.name) private readonly reconRunModel: Model<ReconRunDocument>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async nightlyRun(): Promise<void> {
    const run = await this.run();
    if (!run.clean) {
      this.logger.error(
        `Nightly reconciliation found ${run.differences?.length} difference(s). See recon_runs/${run._id}.`,
      );
    }
  }

  async run(): Promise<ReconRunDocument> {
    const differences: Array<Record<string, unknown>> = [];

    const [inRows, outRows, balances, locations] = await Promise.all([
      this.ledgerModel.aggregate([
        {
          $group: { _id: { lotId: '$lotId', locationId: '$toLocationId' }, qty: { $sum: '$qty' } },
        },
      ]),
      this.ledgerModel.aggregate([
        {
          $group: {
            _id: { lotId: '$lotId', locationId: '$fromLocationId' },
            qty: { $sum: '$qty' },
          },
        },
      ]),
      this.balanceModel.find().lean(),
      this.locationModel.find().lean(),
    ]);

    const expected = new Map<string, number>();
    const bump = (lotId: unknown, locationId: unknown, delta: number) => {
      const key = `${lotId}:${locationId}`;
      expected.set(key, (expected.get(key) ?? 0) + delta);
    };
    for (const row of inRows) bump(row._id.lotId, row._id.locationId, row.qty);
    for (const row of outRows) bump(row._id.lotId, row._id.locationId, -row.qty);

    const actual = new Map(balances.map((b) => [`${b.lotId}:${b.locationId}`, b.qty]));

    // I-1: stock_balances.qty equals ledger movements in minus out, for every (lot, location).
    const allKeys = new Set([...expected.keys(), ...actual.keys()]);
    for (const key of allKeys) {
      const exp = expected.get(key) ?? 0;
      const act = actual.get(key) ?? 0;
      if (Math.abs(exp - act) > EPSILON) {
        const [lotId, locationId] = key.split(':');
        differences.push({ invariant: 'I-1', lotId, locationId, expected: exp, actual: act });
      }
    }

    // I-2: no physical location has a negative balance.
    const virtualLocationIds = new Set(
      locations.filter((l) => l.kind.startsWith('VIRTUAL')).map((l) => String(l._id)),
    );
    for (const b of balances) {
      if (!virtualLocationIds.has(String(b.locationId)) && b.qty < -EPSILON) {
        differences.push({
          invariant: 'I-2',
          lotId: String(b.lotId),
          locationId: String(b.locationId),
          qty: b.qty,
        });
      }
    }

    // I-4: quantity is conserved - for every lot, the sum of balances over all locations
    // (including virtual ones) is zero.
    const perLot = new Map<string, number>();
    for (const b of balances) {
      const key = String(b.lotId);
      perLot.set(key, (perLot.get(key) ?? 0) + b.qty);
    }
    for (const [lotId, total] of perLot) {
      if (Math.abs(total) > EPSILON) {
        differences.push({ invariant: 'I-4', lotId, total });
      }
    }

    return this.reconRunModel.create({
      clean: differences.length === 0,
      itemsChecked: balances.length,
      // Mongoose defaults an array-typed path to [] on insert regardless of what's passed
      // here, so this is stored as [] either way - `clean` is the field to check, not
      // whether `differences` is present.
      differences,
    });
  }

  latest(limit = 20) {
    return this.reconRunModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }
}

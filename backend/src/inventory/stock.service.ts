import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { StockLedgerEntry, StockLedgerDocument } from './schemas/stock-ledger.schema';
import { StockBalance, StockBalanceDocument } from './schemas/stock-balance.schema';
import { StockLot, StockLotDocument } from './schemas/stock-lot.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { Movement, PostedRow, LotAllocation, AvailabilityRow } from './types';
import { roundQty, roundUnitCost, toDecimal } from '../common/utils/decimal';
import {
  InsufficientStockException,
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';

/** The subset of a location document this service actually needs, matching what `.lean()` returns. */
type LeanLocation = Pick<StockLocation, 'kind' | 'code'> & { _id: Types.ObjectId };

/**
 * The only writer of stock tables (tech.md principle #2, §5.2). Every other module builds a
 * `Movement` and calls `post()`; nobody else touches stock_ledger or stock_balances.
 *
 * Must be called inside the CALLER's transaction/session - it never opens its own, so a
 * business command (e.g. "confirm inward") and its stock effect commit or roll back together
 * (BR-12). Mongo's `session.withTransaction()` retries the whole callback automatically on a
 * transient write conflict, which is this codebase's substitute for tech.md's deterministic
 * lock ordering (there is no `SELECT ... FOR UPDATE` in Mongo) - see README.
 */
@Injectable()
export class StockService {
  constructor(
    @InjectModel(StockLedgerEntry.name) private readonly ledgerModel: Model<StockLedgerDocument>,
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
  ) {}

  async post(
    movements: Movement[],
    session: ClientSession,
    actorUserId: string,
  ): Promise<PostedRow[]> {
    const posted: PostedRow[] = [];

    for (const movement of movements) {
      const qty = roundQty(movement.qty);
      if (qty <= 0) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          'Movement quantity must be greater than zero.',
        );
      }
      if (movement.fromLocationId === movement.toLocationId) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          'A movement cannot have the same from and to location.',
        );
      }

      const [fromLoc, toLoc] = await Promise.all([
        this.locationModel.findById(movement.fromLocationId).session(session).lean(),
        this.locationModel.findById(movement.toLocationId).session(session).lean(),
      ]);
      if (!fromLoc)
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Unknown from location ${movement.fromLocationId}.`,
        );
      if (!toLoc)
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Unknown to location ${movement.toLocationId}.`,
        );

      let allocations: (LotAllocation & { receivedOn: Date })[];

      if (movement.lotOrigin) {
        if (movement.unitCost === undefined) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            'unitCost is required when creating a new lot.',
          );
        }
        const lot = await this.createLot(movement, qty, session);
        allocations = [
          { lotId: String(lot._id), qty, unitCost: lot.unitCost, receivedOn: lot.receivedOn },
        ];
      } else if (movement.lotId) {
        const lot = await this.lotModel.findById(movement.lotId).session(session).lean();
        if (!lot) throw new ProblemException('NOT_FOUND', 404, `Lot ${movement.lotId} not found.`);
        allocations = [
          { lotId: movement.lotId, qty, unitCost: lot.unitCost, receivedOn: lot.receivedOn },
        ];
      } else {
        allocations = await this.allocateFifo(
          movement.stockItemId,
          movement.fromLocationId,
          qty,
          session,
        );
      }

      for (const allocation of allocations) {
        const [ledgerDoc] = await this.ledgerModel.create(
          [
            {
              postedAt: new Date(),
              businessDate: movement.businessDate ?? new Date(),
              movementType: movement.type,
              stockItemId: new Types.ObjectId(movement.stockItemId),
              lotId: new Types.ObjectId(allocation.lotId),
              fromLocationId: new Types.ObjectId(movement.fromLocationId),
              toLocationId: new Types.ObjectId(movement.toLocationId),
              qty: allocation.qty,
              unitCost: allocation.unitCost,
              docType: movement.doc.type,
              docId: new Types.ObjectId(movement.doc.id),
              docLineId: movement.doc.lineId ? new Types.ObjectId(movement.doc.lineId) : undefined,
              postedBy: new Types.ObjectId(actorUserId),
              reason: movement.reason,
            },
          ],
          { session },
        );

        await this.applyToBalances(movement.stockItemId, allocation, fromLoc, toLoc, session);

        posted.push({
          ledgerId: String(ledgerDoc._id),
          lotId: allocation.lotId,
          qty: allocation.qty,
          unitCost: allocation.unitCost,
        });
      }
    }

    return posted;
  }

  /** STK-07: FIFO by default. A movement with no explicit lot expands into one ledger row per lot consumed. */
  async allocateFifo(
    stockItemId: string,
    locationId: string,
    qty: number,
    session: ClientSession,
  ): Promise<(LotAllocation & { receivedOn: Date })[]> {
    const balances = await this.balanceModel
      .find({
        stockItemId: new Types.ObjectId(stockItemId),
        locationId: new Types.ObjectId(locationId),
        qty: { $gt: 0 },
      })
      .sort({ receivedOn: 1, _id: 1 })
      .session(session)
      .lean();

    const lots = await this.lotModel
      .find({ _id: { $in: balances.map((b) => b.lotId) } })
      .session(session)
      .lean();
    const unitCostByLot = new Map(lots.map((l) => [String(l._id), l.unitCost]));

    let remaining = toDecimal(qty);
    const allocations: (LotAllocation & { receivedOn: Date })[] = [];

    for (const balance of balances) {
      if (remaining.lte(0)) break;
      const available = toDecimal(balance.qty);
      const take = Decimal.min(remaining, available);
      allocations.push({
        lotId: String(balance.lotId),
        qty: roundQty(take),
        unitCost: unitCostByLot.get(String(balance.lotId)) ?? 0,
        receivedOn: balance.receivedOn,
      });
      remaining = remaining.minus(take);
    }

    if (remaining.gt(0)) {
      throw new InsufficientStockException(
        `Insufficient stock for item ${stockItemId} at location ${locationId}: short by ${remaining.toFixed(3)}.`,
        { stockItemId, locationId, shortfall: remaining.toNumber() },
      );
    }

    return allocations;
  }

  /**
   * Reverses every ledger row of a document (cancellation). Already-reversed rows are
   * skipped, so calling this twice on the same document is a safe no-op (tech.md §5.6's
   * unique index on `reversesId` is mirrored here as an idempotency check rather than
   * letting a duplicate-key error surface to the caller).
   */
  async reverseDocument(
    docType: string,
    docId: string,
    reason: string,
    session: ClientSession,
    actorUserId: string,
  ): Promise<PostedRow[]> {
    const rows = await this.ledgerModel
      .find({ docType, docId: new Types.ObjectId(docId) })
      .session(session)
      .lean();
    const posted: PostedRow[] = [];

    for (const row of rows) {
      const existingReversal = await this.ledgerModel
        .findOne({ reversesId: row._id })
        .session(session)
        .lean();
      if (existingReversal) continue;

      const [fromLoc, toLoc] = await Promise.all([
        this.locationModel.findById(row.toLocationId).session(session).lean(),
        this.locationModel.findById(row.fromLocationId).session(session).lean(),
      ]);
      if (!fromLoc || !toLoc) continue;

      const lot = await this.lotModel.findById(row.lotId).session(session).lean();

      try {
        const [ledgerDoc] = await this.ledgerModel.create(
          [
            {
              postedAt: new Date(),
              businessDate: new Date(),
              movementType: 'REVERSAL',
              stockItemId: row.stockItemId,
              lotId: row.lotId,
              fromLocationId: row.toLocationId,
              toLocationId: row.fromLocationId,
              qty: row.qty,
              unitCost: row.unitCost,
              docType: row.docType,
              docId: row.docId,
              docLineId: row.docLineId,
              postedBy: new Types.ObjectId(actorUserId),
              reversesId: row._id,
              reason,
            },
          ],
          { session },
        );

        await this.applyToBalances(
          String(row.stockItemId),
          {
            lotId: String(row.lotId),
            qty: row.qty,
            unitCost: row.unitCost,
            receivedOn: lot?.receivedOn ?? row.postedAt,
          },
          fromLoc,
          toLoc,
          session,
        );

        posted.push({
          ledgerId: String(ledgerDoc._id),
          lotId: String(row.lotId),
          qty: row.qty,
          unitCost: row.unitCost,
        });
      } catch (err) {
        if (err instanceof InsufficientStockException) {
          // tech.md §5.6: stock already moved on downstream - reversal is blocked, not a
          // generic stock error. Enumerating every blocking document is a documented gap
          // (would need a follow-up ledger scan); the item/lot/location context is included.
          throw new InvalidStateTransitionException(
            `Cannot reverse ${docType} ${docId}: stock from this document has already moved elsewhere.`,
            { docType, docId, lotId: String(row.lotId), stockItemId: String(row.stockItemId) },
          );
        }
        throw err;
      }
    }

    return posted;
  }

  /** tech.md §5.9, without reservations (Phase 6 adds `reserved` from confirmed sales orders). */
  async availability(stockItemIds: string[]): Promise<AvailabilityRow[]> {
    const ids = stockItemIds.map((id) => new Types.ObjectId(id));
    const rows = await this.balanceModel.aggregate([
      { $match: { stockItemId: { $in: ids } } },
      {
        $lookup: {
          from: 'stock_locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'location',
        },
      },
      { $unwind: '$location' },
      {
        $group: {
          _id: { stockItemId: '$stockItemId', kind: '$location.kind' },
          qty: { $sum: '$qty' },
        },
      },
    ]);

    const byItem = new Map<string, AvailabilityRow>();
    for (const id of stockItemIds) {
      byItem.set(id, {
        stockItemId: id,
        onHand: 0,
        withFactory: 0,
        quarantined: 0,
        reserved: 0,
        atp: 0,
      });
    }
    for (const row of rows) {
      const itemId = String(row._id.stockItemId);
      const entry = byItem.get(itemId);
      if (!entry) continue;
      if (row._id.kind === 'WAREHOUSE') entry.onHand += row.qty;
      if (row._id.kind === 'FACTORY_CUSTODY') entry.withFactory += row.qty;
      if (row._id.kind === 'QUARANTINE') entry.quarantined += row.qty;
    }
    for (const entry of byItem.values()) {
      entry.onHand = roundQty(entry.onHand);
      entry.withFactory = roundQty(entry.withFactory);
      entry.quarantined = roundQty(entry.quarantined);
      entry.atp = roundQty(entry.onHand - entry.reserved);
    }
    return Array.from(byItem.values());
  }

  balancesForItem(stockItemId: string, session?: ClientSession) {
    return this.balanceModel
      .find({ stockItemId: new Types.ObjectId(stockItemId) })
      .session(session ?? null)
      .populate('locationId')
      .lean();
  }

  ledgerForItem(stockItemId: string, limit = 200) {
    return this.ledgerModel
      .find({ stockItemId: new Types.ObjectId(stockItemId) })
      .sort({ postedAt: -1 })
      .limit(limit)
      .lean();
  }

  private async createLot(
    movement: Movement,
    qty: number,
    session: ClientSession,
  ): Promise<StockLotDocument> {
    const origin = movement.lotOrigin!;
    const [lot] = await this.lotModel.create(
      [
        {
          stockItemId: new Types.ObjectId(movement.stockItemId),
          lotNo: origin.lotNo?.trim() || `AUTO-${new Types.ObjectId().toHexString()}`,
          receivedOn: origin.receivedOn ?? new Date(),
          unitCost: roundUnitCost(movement.unitCost!),
          originDocType: origin.originDocType,
          originDocId: origin.originDocId ? new Types.ObjectId(origin.originDocId) : undefined,
          supplierId: origin.supplierId ? new Types.ObjectId(origin.supplierId) : undefined,
          originJobSlipId: origin.originJobSlipId
            ? new Types.ObjectId(origin.originJobSlipId)
            : undefined,
        },
      ],
      { session },
    );
    return lot;
  }

  private async applyToBalances(
    stockItemId: string,
    allocation: LotAllocation & { receivedOn: Date },
    fromLoc: LeanLocation,
    toLoc: LeanLocation,
    session: ClientSession,
  ): Promise<void> {
    const fromIsPhysical = !fromLoc.kind.startsWith('VIRTUAL');
    const lotObjectId = new Types.ObjectId(allocation.lotId);
    // Cast explicitly rather than relying on Mongoose's update-operator casting of
    // `$setOnInsert` values, which is not as reliable as filter/document casting - an upsert
    // that inserted `stockItemId` as a raw string here silently broke every ObjectId-typed
    // $match against stock_balances.stockItemId downstream (availability(), valuation()).
    const stockItemObjectId = new Types.ObjectId(stockItemId);

    const decFilter: Record<string, unknown> = { lotId: lotObjectId, locationId: fromLoc._id };
    if (fromIsPhysical) decFilter.qty = { $gte: allocation.qty };

    const decremented = await this.balanceModel.findOneAndUpdate(
      decFilter,
      {
        $inc: { qty: -allocation.qty },
        $setOnInsert: { stockItemId: stockItemObjectId, receivedOn: allocation.receivedOn },
      },
      { session, upsert: !fromIsPhysical, new: true },
    );

    if (!decremented) {
      throw new InsufficientStockException(
        `Insufficient stock: item=${stockItemId} location=${fromLoc.code} shortfall=${allocation.qty}.`,
        {
          stockItemId,
          locationId: String(fromLoc._id),
          locationCode: fromLoc.code,
          requested: allocation.qty,
        },
      );
    }

    await this.balanceModel.findOneAndUpdate(
      { lotId: lotObjectId, locationId: toLoc._id },
      {
        $inc: { qty: allocation.qty },
        $setOnInsert: { stockItemId: stockItemObjectId, receivedOn: allocation.receivedOn },
      },
      { session, upsert: true },
    );
  }
}

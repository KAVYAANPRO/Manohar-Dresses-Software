import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { PackingRecord, PackingRecordDocument } from './schemas/packing-record.schema';
import { ReadyStockService, ReadyStockFilter } from './ready-stock.service';
import { roundQty } from '../common/utils/decimal';
import { ProblemException } from '../common/errors/problem.exception';

export type PackingStatus = 'UNPACKED' | 'PARTIALLY_PACKED' | 'FULLY_PACKED';

/**
 * PKG-01: "Packing is a status on stock and does not move it" - packedQty is a plain counter,
 * clamped to [0, onHand], never a stock_ledger movement or a location change.
 */
@Injectable()
export class PackingService {
  constructor(
    @InjectModel(PackingRecord.name) private readonly model: Model<PackingRecordDocument>,
    private readonly readyStockService: ReadyStockService,
  ) {}

  async dashboard(filter: ReadyStockFilter) {
    const items = await this.readyStockService.onHandByStockItem(filter);
    const records = await this.model
      .find({ stockItemId: { $in: items.map((i) => new Types.ObjectId(i.stockItemId)) } })
      .lean();
    const packedByItem = new Map(records.map((r) => [String(r.stockItemId), r.packedQty]));

    return items.map((item) => {
      const packedQty = Math.min(packedByItem.get(item.stockItemId) ?? 0, item.onHand);
      const pendingQty = roundQty(item.onHand - packedQty);
      const status: PackingStatus =
        packedQty <= 0 ? 'UNPACKED' : pendingQty <= 0.0005 ? 'FULLY_PACKED' : 'PARTIALLY_PACKED';
      return { ...item, packedQty: roundQty(packedQty), pendingQty, packingStatus: status };
    });
  }

  private async currentOnHand(stockItemId: string): Promise<number> {
    const items = await this.readyStockService.onHandByStockItem({});
    return items.find((i) => i.stockItemId === stockItemId)?.onHand ?? 0;
  }

  async pack(stockItemId: string, qty: number, actorId: string) {
    const onHand = await this.currentOnHand(stockItemId);
    const existing = await this.model
      .findOne({ stockItemId: new Types.ObjectId(stockItemId) })
      .lean();
    const currentPacked = existing?.packedQty ?? 0;
    const nextPacked = roundQty(currentPacked + qty);
    if (nextPacked > onHand + 0.0005) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Cannot pack ${qty}: only ${roundQty(onHand - currentPacked)} is available to pack.`,
      );
    }
    return this.model
      .findOneAndUpdate(
        { stockItemId: new Types.ObjectId(stockItemId) },
        { $set: { packedQty: nextPacked, updatedBy: new Types.ObjectId(actorId) } },
        { upsert: true, new: true },
      )
      .lean();
  }

  async unpack(stockItemId: string, qty: number, actorId: string) {
    const existing = await this.model
      .findOne({ stockItemId: new Types.ObjectId(stockItemId) })
      .lean();
    const currentPacked = existing?.packedQty ?? 0;
    if (qty > currentPacked + 0.0005) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Cannot unpack ${qty}: only ${currentPacked} is packed.`,
      );
    }
    const nextPacked = roundQty(Math.max(0, currentPacked - qty));
    return this.model
      .findOneAndUpdate(
        { stockItemId: new Types.ObjectId(stockItemId) },
        { $set: { packedQty: nextPacked, updatedBy: new Types.ObjectId(actorId) } },
        { upsert: true, new: true },
      )
      .lean();
  }

  /**
   * Called inside the caller's transaction when finished goods leave the warehouse (invoice
   * confirm, delivery challan dispatch). Packed goods are assumed to ship first, so the packed
   * counter drops by the shipped qty (never below zero) and stays within on-hand.
   */
  async consumePacked(stockItemId: string, qty: number, session: ClientSession): Promise<void> {
    const existing = await this.model
      .findOne({ stockItemId: new Types.ObjectId(stockItemId) })
      .session(session);
    if (!existing || existing.packedQty <= 0) return;
    existing.packedQty = roundQty(Math.max(0, existing.packedQty - qty));
    await existing.save({ session });
  }
}

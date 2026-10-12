import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StockBalance, StockBalanceDocument } from './schemas/stock-balance.schema';
import { StockLot, StockLotDocument } from './schemas/stock-lot.schema';
import { StockItem, StockItemDocument } from './schemas/stock-item.schema';
import { roundMoney, roundQty } from '../common/utils/decimal';

/** STK-04, STK-09: read-only stock views. Never writes - StockService owns every write. */
@Injectable()
export class StockQueryService {
  constructor(
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
  ) {}

  balances(filter: { stockItemId?: string; locationId?: string } = {}) {
    const query: Record<string, unknown> = {};
    if (filter.stockItemId) query.stockItemId = new Types.ObjectId(filter.stockItemId);
    if (filter.locationId) query.locationId = new Types.ObjectId(filter.locationId);
    return this.balanceModel
      .find({ ...query, qty: { $ne: 0 } })
      .populate('locationId lotId')
      .lean();
  }

  lots(filter: { stockItemId?: string } = {}) {
    const query: Record<string, unknown> = {};
    if (filter.stockItemId) query.stockItemId = new Types.ObjectId(filter.stockItemId);
    return this.lotModel.find(query).sort({ receivedOn: 1 }).lean();
  }

  /** STK-09: quantity x lot cost, by item and location. */
  async valuation(filter: { stockItemId?: string } = {}) {
    const match: Record<string, unknown> = { qty: { $ne: 0 } };
    if (filter.stockItemId) match.stockItemId = new Types.ObjectId(filter.stockItemId);

    const rows = await this.balanceModel.aggregate([
      { $match: match },
      { $lookup: { from: 'stock_lots', localField: 'lotId', foreignField: '_id', as: 'lot' } },
      { $unwind: '$lot' },
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
        $project: {
          stockItemId: 1,
          locationId: 1,
          locationCode: '$location.code',
          lotId: 1,
          lotNo: '$lot.lotNo',
          qty: 1,
          unitCost: '$lot.unitCost',
          value: { $multiply: ['$qty', '$lot.unitCost'] },
        },
      },
    ]);

    return rows.map((r) => ({ ...r, qty: roundQty(r.qty), value: roundMoney(r.value) }));
  }

  async lowStock() {
    const items = await this.stockItemModel
      .find({ minStockQty: { $exists: true, $ne: null } })
      .lean();
    const results: Array<{ stockItemId: string; minStockQty: number; onHand: number }> = [];
    for (const item of items) {
      const onHandAgg = await this.balanceModel.aggregate([
        { $match: { stockItemId: item._id } },
        {
          $lookup: {
            from: 'stock_locations',
            localField: 'locationId',
            foreignField: '_id',
            as: 'location',
          },
        },
        { $unwind: '$location' },
        { $match: { 'location.kind': 'WAREHOUSE' } },
        { $group: { _id: null, qty: { $sum: '$qty' } } },
      ]);
      const onHand = roundQty(onHandAgg[0]?.qty ?? 0);
      if (item.minStockQty !== undefined && onHand <= item.minStockQty) {
        results.push({ stockItemId: String(item._id), minStockQty: item.minStockQty, onHand });
      }
    }
    return results;
  }
}

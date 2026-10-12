import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StockBalance, StockBalanceDocument } from '../inventory/schemas/stock-balance.schema';
import { roundQty } from '../common/utils/decimal';

export interface ReadyStockFilter {
  designId?: string;
  colourId?: string;
  sizeId?: string;
  categoryId?: string;
}

export interface ReadyStockLotRow {
  stockItemId: string;
  designId: string;
  designNo: string;
  designName: string;
  categoryId: string;
  colourId: string;
  colourName: string;
  sizeId: string;
  sizeName: string;
  lotId: string;
  lotNo: string;
  qty: number;
  locationId: string;
  locationCode: string;
  receivedOn: Date;
  jobWorkerId?: string;
  jobWorkerName?: string;
  unitCost?: number;
}

/**
 * RGS-01 to RGS-04: finished-goods stock is a StockItem whose kind is FINISHED_GOOD and whose
 * designVariantId is set (Phase 3). "Sellable on-hand" (RGS-04) means balances sitting in a
 * WAREHOUSE location - custody, quarantine, and virtual locations are excluded by design,
 * the same rule stock-query.service.ts's lowStock() already uses.
 */
@Injectable()
export class ReadyStockService {
  constructor(
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
  ) {}

  private matchStage(filter: ReadyStockFilter) {
    const match: Record<string, unknown> = {};
    if (filter.designId) match['design._id'] = new Types.ObjectId(filter.designId);
    if (filter.colourId) match['variant.colourId'] = new Types.ObjectId(filter.colourId);
    if (filter.sizeId) match['variant.sizeId'] = new Types.ObjectId(filter.sizeId);
    if (filter.categoryId)
      match['design.productCategoryId'] = new Types.ObjectId(filter.categoryId);
    return match;
  }

  /** RGS-01, RGS-02: one row per lot, with date received, cost (unitCost may be stripped by the caller per PKG-02), and factory/artisan origin. */
  async listLots(filter: ReadyStockFilter, includeCost: boolean): Promise<ReadyStockLotRow[]> {
    const rows = await this.balanceModel.aggregate([
      { $match: { qty: { $gt: 0 } } },
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
      {
        $lookup: {
          from: 'stock_items',
          localField: 'stockItemId',
          foreignField: '_id',
          as: 'item',
        },
      },
      { $unwind: '$item' },
      { $match: { 'item.kind': 'FINISHED_GOOD' } },
      {
        $lookup: {
          from: 'design_variants',
          localField: 'item.designVariantId',
          foreignField: '_id',
          as: 'variant',
        },
      },
      { $unwind: '$variant' },
      {
        $lookup: {
          from: 'designs',
          localField: 'variant.designId',
          foreignField: '_id',
          as: 'design',
        },
      },
      { $unwind: '$design' },
      { $match: this.matchStage(filter) },
      {
        $lookup: {
          from: 'colours',
          localField: 'variant.colourId',
          foreignField: '_id',
          as: 'colour',
        },
      },
      { $unwind: '$colour' },
      { $lookup: { from: 'sizes', localField: 'variant.sizeId', foreignField: '_id', as: 'size' } },
      { $unwind: '$size' },
      { $lookup: { from: 'stock_lots', localField: 'lotId', foreignField: '_id', as: 'lot' } },
      { $unwind: '$lot' },
      {
        $lookup: {
          from: 'job_slips',
          localField: 'lot.originJobSlipId',
          foreignField: '_id',
          as: 'jobSlip',
        },
      },
      { $unwind: { path: '$jobSlip', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'job_workers',
          localField: 'jobSlip.jobWorkerId',
          foreignField: '_id',
          as: 'jobWorker',
        },
      },
      { $unwind: { path: '$jobWorker', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          stockItemId: '$item._id',
          designId: '$design._id',
          designNo: '$design.designNo',
          designName: '$design.name',
          categoryId: '$design.productCategoryId',
          colourId: '$colour._id',
          colourName: '$colour.name',
          sizeId: '$size._id',
          sizeName: '$size.name',
          lotId: '$lot._id',
          lotNo: '$lot.lotNo',
          qty: 1,
          locationId: '$location._id',
          locationCode: '$location.code',
          receivedOn: '$lot.receivedOn',
          jobWorkerId: '$jobWorker._id',
          jobWorkerName: '$jobWorker.name',
          unitCost: '$lot.unitCost',
        },
      },
      { $sort: { receivedOn: 1 } },
    ]);

    return rows.map((r) => ({
      stockItemId: String(r.stockItemId),
      designId: String(r.designId),
      designNo: r.designNo,
      designName: r.designName,
      categoryId: String(r.categoryId),
      colourId: String(r.colourId),
      colourName: r.colourName,
      sizeId: String(r.sizeId),
      sizeName: r.sizeName,
      lotId: String(r.lotId),
      lotNo: r.lotNo,
      qty: roundQty(r.qty),
      locationId: String(r.locationId),
      locationCode: r.locationCode,
      receivedOn: r.receivedOn,
      jobWorkerId: r.jobWorkerId ? String(r.jobWorkerId) : undefined,
      jobWorkerName: r.jobWorkerName,
      unitCost: includeCost ? r.unitCost : undefined,
    }));
  }

  /** PKG-01: on-hand per finished-goods stock item (no lot/cost detail - packing works at the item level). */
  async onHandByStockItem(filter: ReadyStockFilter) {
    const lots = await this.listLots(filter, false);
    const byItem = new Map<
      string,
      {
        stockItemId: string;
        designNo: string;
        designName: string;
        categoryId: string;
        colourName: string;
        sizeId: string;
        sizeName: string;
        onHand: number;
      }
    >();
    for (const lot of lots) {
      const entry = byItem.get(lot.stockItemId) ?? {
        stockItemId: lot.stockItemId,
        designNo: lot.designNo,
        designName: lot.designName,
        categoryId: lot.categoryId,
        colourName: lot.colourName,
        sizeId: lot.sizeId,
        sizeName: lot.sizeName,
        onHand: 0,
      };
      entry.onHand = roundQty(entry.onHand + lot.qty);
      byItem.set(lot.stockItemId, entry);
    }
    return Array.from(byItem.values());
  }

  /** RGS-04: qty on confirmed, not-yet-invoiced sales orders, per finished-goods stock item. */
  async reservedByStockItem(): Promise<Map<string, number>> {
    const rows = await this.balanceModel.db
      .collection('sales_orders')
      .aggregate([
        { $match: { status: { $in: ['CONFIRMED', 'PARTIALLY_INVOICED'] } } },
        { $unwind: '$lines' },
        {
          $group: {
            _id: '$lines.stockItemId',
            qty: { $sum: { $max: [0, { $subtract: ['$lines.qty', '$lines.qtyInvoiced'] }] } },
          },
        },
      ])
      .toArray();
    return new Map(rows.map((r) => [String(r._id), roundQty(r.qty)]));
  }

  /**
   * Sellable-item picker for sales screens: every design variant of an active design (in stock
   * or not) with on-hand (warehouse), reserved, ATP, packed qty, default rate and HSN.
   */
  async sellableItems(filter: { designId?: string; inStockOnly?: boolean } = {}) {
    const db = this.balanceModel.db;
    const designMatch: Record<string, unknown> = { isActive: { $ne: false } };
    if (filter.designId) designMatch._id = new Types.ObjectId(filter.designId);
    const designs = await db.collection('designs').find(designMatch).toArray();
    const variants = await db
      .collection('design_variants')
      .find({ designId: { $in: designs.map((d) => d._id) } })
      .toArray();
    const [colours, sizes, categories, items, packing] = await Promise.all([
      db.collection('colours').find({ _id: { $in: variants.map((v) => v.colourId) } }).toArray(),
      db.collection('sizes').find({ _id: { $in: variants.map((v) => v.sizeId) } }).toArray(),
      db.collection('product_categories').find({ _id: { $in: designs.map((d) => d.productCategoryId) } }).toArray(),
      db.collection('stock_items').find({ designVariantId: { $in: variants.map((v) => v._id) } }).toArray(),
      db.collection('packing_records').find({}).toArray(),
    ]);
    const onHand = new Map<string, number>();
    for (const lot of await this.listLots({}, false)) {
      onHand.set(lot.stockItemId, roundQty((onHand.get(lot.stockItemId) ?? 0) + lot.qty));
    }
    const reserved = await this.reservedByStockItem();
    const dById = new Map(designs.map((d) => [String(d._id), d]));
    const cById = new Map(colours.map((c) => [String(c._id), c]));
    const sById = new Map(sizes.map((x) => [String(x._id), x]));
    const catById = new Map(categories.map((c) => [String(c._id), c]));
    const itemByVariant = new Map(items.map((i) => [String(i.designVariantId), i]));
    const packedByItem = new Map(packing.map((p) => [String(p.stockItemId), p.packedQty as number]));
    const rows = variants.map((v) => {
      const d = dById.get(String(v.designId))!;
      const item = itemByVariant.get(String(v._id));
      const itemId = item ? String(item._id) : undefined;
      const oh = itemId ? onHand.get(itemId) ?? 0 : 0;
      const res = itemId ? reserved.get(itemId) ?? 0 : 0;
      return {
        designVariantId: String(v._id),
        stockItemId: itemId,
        designId: String(d._id),
        designNo: d.designNo,
        designName: d.name,
        categoryName: catById.get(String(d.productCategoryId))?.name,
        colourId: String(v.colourId),
        colourName: cById.get(String(v.colourId))?.name,
        sizeId: String(v.sizeId),
        sizeName: sById.get(String(v.sizeId))?.name,
        sizeSort: sById.get(String(v.sizeId))?.sortOrder ?? 0,
        hsn: d.hsn,
        defaultSellingRate: d.defaultSellingRate,
        onHand: oh,
        reserved: res,
        atp: roundQty(oh - res),
        packedQty: itemId ? Math.min(packedByItem.get(itemId) ?? 0, oh) : 0,
      };
    });
    return rows
      .filter((r) => !filter.inStockOnly || r.onHand > 0)
      .sort((a, b) =>
        a.designNo === b.designNo
          ? (a.colourName ?? '').localeCompare(b.colourName ?? '') || a.sizeSort - b.sizeSort
          : String(a.designNo).localeCompare(String(b.designNo)),
      );
  }

  /** RGS-03: current available stock, grouped by design + colour with a size breakdown and a total. */
  async summary(filter: ReadyStockFilter, includeCost: boolean) {
    const lots = await this.listLots(filter, includeCost);
    const reserved = await this.reservedByStockItem();

    const byDesignColour = new Map<
      string,
      {
        designId: string;
        designNo: string;
        designName: string;
        categoryId: string;
        colourId: string;
        colourName: string;
        sizes: Map<string, { sizeId: string; sizeName: string; stockItemId: string; qty: number }>;
        totalQty: number;
        totalValue?: number;
        lastReceivedOn?: Date;
        factories: Set<string>;
        locations: Set<string>;
      }
    >();

    for (const lot of lots) {
      const key = `${lot.designId}:${lot.colourId}`;
      if (!byDesignColour.has(key)) {
        byDesignColour.set(key, {
          designId: lot.designId,
          designNo: lot.designNo,
          designName: lot.designName,
          categoryId: lot.categoryId,
          colourId: lot.colourId,
          colourName: lot.colourName,
          sizes: new Map(),
          totalQty: 0,
          totalValue: includeCost ? 0 : undefined,
          factories: new Set(),
          locations: new Set(),
        });
      }
      const group = byDesignColour.get(key)!;
      const sizeEntry = group.sizes.get(lot.sizeId) ?? {
        sizeId: lot.sizeId,
        sizeName: lot.sizeName,
        stockItemId: lot.stockItemId,
        qty: 0,
      };
      if (lot.jobWorkerName) group.factories.add(lot.jobWorkerName);
      group.locations.add(lot.locationCode);
      if (!group.lastReceivedOn || new Date(lot.receivedOn) > new Date(group.lastReceivedOn)) {
        group.lastReceivedOn = lot.receivedOn;
      }
      sizeEntry.qty = roundQty(sizeEntry.qty + lot.qty);
      group.sizes.set(lot.sizeId, sizeEntry);
      group.totalQty = roundQty(group.totalQty + lot.qty);
      if (includeCost && lot.unitCost !== undefined) {
        group.totalValue = roundQty((group.totalValue ?? 0) + lot.qty * lot.unitCost);
      }
    }

    return Array.from(byDesignColour.values()).map((g) => ({
      designId: g.designId,
      designNo: g.designNo,
      designName: g.designName,
      categoryId: g.categoryId,
      colourId: g.colourId,
      colourName: g.colourName,
      sizes: Array.from(g.sizes.values()).map((sz) => {
        const res = reserved.get(sz.stockItemId) ?? 0;
        return { ...sz, onHand: sz.qty, reserved: res, atp: roundQty(sz.qty - res) };
      }),
      totalQty: g.totalQty,
      totalReserved: roundQty(
        Array.from(g.sizes.values()).reduce((t, sz) => t + (reserved.get(sz.stockItemId) ?? 0), 0),
      ),
      totalValue: g.totalValue,
      lastReceivedOn: g.lastReceivedOn,
      factories: Array.from(g.factories),
      locations: Array.from(g.locations),
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaterialVariant, MaterialVariantDocument } from '../master/schemas/material.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockItem, StockItemDocument } from '../inventory/schemas/stock-item.schema';
import { StockBalance, StockBalanceDocument } from '../inventory/schemas/stock-balance.schema';
import { roundQty } from '../common/utils/decimal';

export interface MaterialStockInfo {
  materialVariantId: string;
  materialId?: string;
  /** "Cotton - Blue" */
  name: string;
  materialName?: string;
  colourName?: string;
  code?: string;
  /** Base-unit code, e.g. MTR / KG / PC. */
  uom: string;
  stockItemId?: string;
  /** Balance in the main warehouse (MAIN-WH) - the only place material is issued from. */
  mainWhOnHand: number;
  isActive: boolean;
}

/**
 * Display name, base unit and MAIN-WH balance for material variants - the numbers every
 * production screen (BOM, requirement calculator, job slip, material issue) shows next to a
 * material. Read-only; stock itself only ever moves through StockService.post.
 */
@Injectable()
export class MaterialStockInfoService {
  constructor(
    @InjectModel(MaterialVariant.name)
    private readonly variantModel: Model<MaterialVariantDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
  ) {}

  async mainWarehouseId(): Promise<Types.ObjectId | null> {
    const wh = await this.locationModel.findOne({ code: 'MAIN-WH' }).select('_id').lean();
    return (wh?._id as Types.ObjectId) ?? null;
  }

  /** All variants when `variantIds` is omitted (the BOM material picker), else just those. */
  async info(variantIds?: string[]): Promise<Map<string, MaterialStockInfo>> {
    const filter: Record<string, unknown> = {};
    if (variantIds) {
      const valid = variantIds.filter((id) => Types.ObjectId.isValid(id));
      filter._id = { $in: valid.map((id) => new Types.ObjectId(id)) };
    }
    const variants = await this.variantModel
      .find(filter)
      .populate({
        path: 'materialId',
        select: 'name baseUomId isActive',
        populate: { path: 'baseUomId', select: 'code name' },
      })
      .populate({ path: 'colourId', select: 'name' })
      .lean();

    const ids = variants.map((v) => v._id as Types.ObjectId);
    const items = await this.stockItemModel
      .find({ materialVariantId: { $in: ids } })
      .select('_id materialVariantId')
      .lean();
    const itemByVariant = new Map(items.map((i) => [String(i.materialVariantId), String(i._id)]));

    const onHandByItem = new Map<string, number>();
    const whId = await this.mainWarehouseId();
    if (whId && items.length > 0) {
      const rows = await this.balanceModel.aggregate([
        { $match: { stockItemId: { $in: items.map((i) => i._id) }, locationId: whId } },
        { $group: { _id: '$stockItemId', qty: { $sum: '$qty' } } },
      ]);
      for (const r of rows) onHandByItem.set(String(r._id), roundQty(r.qty));
    }

    const out = new Map<string, MaterialStockInfo>();
    for (const v of variants as any[]) {
      const id = String(v._id);
      const materialName: string | undefined = v.materialId?.name;
      const colourName: string | undefined = v.colourId?.name;
      const stockItemId = itemByVariant.get(id);
      out.set(id, {
        materialVariantId: id,
        materialId: v.materialId?._id ? String(v.materialId._id) : undefined,
        name: [materialName, colourName].filter(Boolean).join(' - ') || v.code || id,
        materialName,
        colourName,
        code: v.code,
        uom: v.materialId?.baseUomId?.code ?? '',
        stockItemId,
        mainWhOnHand: stockItemId ? (onHandByItem.get(stockItemId) ?? 0) : 0,
        isActive: v.isActive !== false && v.materialId?.isActive !== false,
      });
    }
    return out;
  }
}

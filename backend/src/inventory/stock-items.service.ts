import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { StockItem, StockItemDocument } from './schemas/stock-item.schema';
import { MaterialVariant, MaterialVariantDocument } from '../master/schemas/material.schema';
import { Material, MaterialDocument } from '../master/schemas/material.schema';
import { Uom, UomDocument } from '../master/schemas/uom.schema';
import { ProblemException } from '../common/errors/problem.exception';

/**
 * A stock item materialises the first time its material variant is actually stocked (an
 * inward, an opening balance, or an adjustment) rather than requiring a separate manual
 * "create stock item" step for every material x colour combination created in Phase 1.
 */
@Injectable()
export class StockItemsService {
  constructor(
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(MaterialVariant.name)
    private readonly variantModel: Model<MaterialVariantDocument>,
    @InjectModel(Material.name) private readonly materialModel: Model<MaterialDocument>,
    @InjectModel(Uom.name) private readonly uomModel: Model<UomDocument>,
  ) {}

  async getOrCreateForMaterialVariant(
    materialVariantId: string,
    session?: ClientSession,
    kind: 'RAW_MATERIAL' | 'PROCESSED_MATERIAL' | 'TRIM' = 'RAW_MATERIAL',
  ): Promise<StockItemDocument> {
    // Cast explicitly: query casting of a non-_id ObjectId field is not reliable when a
    // session is attached to the query in this environment (empirically confirmed - see the
    // equivalent note in stock.service.ts), and a missed match here creates a duplicate
    // stock item on the second inward against the same material variant.
    const existing = await this.stockItemModel
      .findOne({ materialVariantId: new Types.ObjectId(materialVariantId) })
      .session(session ?? null);
    if (existing) return existing;

    const variant = await this.variantModel
      .findById(materialVariantId)
      .session(session ?? null)
      .lean();
    if (!variant)
      throw new ProblemException(
        'NOT_FOUND',
        404,
        `Material variant ${materialVariantId} not found.`,
      );
    const material = await this.materialModel
      .findById(variant.materialId)
      .session(session ?? null)
      .lean();
    if (!material)
      throw new ProblemException('NOT_FOUND', 404, `Material ${variant.materialId} not found.`);

    const [created] = await this.stockItemModel.create(
      [
        {
          kind,
          materialVariantId: new Types.ObjectId(materialVariantId),
          baseUomId: material.baseUomId,
          minStockQty: material.minStockQty,
        },
      ],
      { session },
    );
    return created;
  }

  /** DSN-02: a design variant is "the finished-stock unit" - materialises the first time it is actually received. */
  async getOrCreateForDesignVariant(
    designVariantId: string,
    session?: ClientSession,
  ): Promise<StockItemDocument> {
    const existing = await this.stockItemModel
      .findOne({ designVariantId: new Types.ObjectId(designVariantId) })
      .session(session ?? null);
    if (existing) return existing;

    let pieceUomId: Types.ObjectId;
    const existingUom = await this.uomModel
      .findOne({ code: 'PC' })
      .session(session ?? null)
      .lean();
    if (existingUom) {
      pieceUomId = existingUom._id;
    } else {
      const [created] = await this.uomModel.create([{ code: 'PC', name: 'Piece' }], { session });
      pieceUomId = created._id;
    }

    const [created] = await this.stockItemModel.create(
      [
        {
          kind: 'FINISHED_GOOD',
          designVariantId: new Types.ObjectId(designVariantId),
          baseUomId: pieceUomId,
        },
      ],
      { session },
    );
    return created;
  }

  findById(id: string) {
    const query = this.stockItemModel.findById(id);
    return query.lean();
  }

  /**
   * `materialVariantId`/`designVariantId`, if passed, are cast explicitly rather than left to
   * implicit query-filter casting - empirically unreliable for non-_id ObjectId fields in this
   * environment (see the note in getOrCreateForMaterialVariant above; findById(_id) is fine,
   * a plain find({customField: "hexstring"}) is not).
   */
  list(filter: Record<string, unknown> = {}) {
    const castFilter: Record<string, unknown> = { ...filter };
    for (const key of ['materialVariantId', 'designVariantId']) {
      if (typeof castFilter[key] === 'string') {
        castFilter[key] = new Types.ObjectId(castFilter[key] as string);
      }
    }
    return this.stockItemModel.find(castFilter).lean();
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

export const STOCK_ITEM_KINDS = [
  'RAW_MATERIAL',
  'PROCESSED_MATERIAL',
  'TRIM',
  'FINISHED_GOOD',
] as const;
export type StockItemKind = (typeof STOCK_ITEM_KINDS)[number];

/**
 * tech.md §4.3: "One supertype for everything that can be stocked." A stock item wraps
 * either a material variant (raw/processed/trim) or a design variant (finished good) - never
 * both. Design variants don't exist until Phase 3, so FINISHED_GOOD items aren't created yet;
 * the field is here so Phase 3/4 need no migration. Created lazily by
 * StockItemsService.getOrCreateForMaterialVariant() the first time a material variant is
 * purchased, rather than as a separate manual step.
 */
@Schema({ collection: 'stock_items', timestamps: true })
export class StockItem extends BaseMasterFields {
  @Prop({ type: String, enum: STOCK_ITEM_KINDS, required: true })
  kind!: StockItemKind;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MaterialVariant',
    required: false,
    unique: true,
    sparse: true,
  })
  materialVariantId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DesignVariant', required: false, unique: true, sparse: true })
  designVariantId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Uom', required: true })
  baseUomId!: Types.ObjectId;

  @Prop({ type: Number, required: false, min: 0 })
  minStockQty?: number;
}

export type StockItemDocument = StockItem & Document;
export const StockItemSchema = SchemaFactory.createForClass(StockItem);
StockItemSchema.plugin(auditPlugin, { module: 'inventory', entityType: 'StockItem' });

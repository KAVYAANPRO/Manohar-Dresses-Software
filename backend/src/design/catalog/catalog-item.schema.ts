import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

export const CATALOG_TAGS = ['Unstitched', 'Stitched', 'Semi-Stitched', 'Ready to Wear'] as const;
export type CatalogTag = (typeof CATALOG_TAGS)[number];

/**
 * A sellable catalog entry (product catalog screen). Optionally linked to a production Design:
 * when linked, live ready stock is read from that design's variants and the entry can raise the
 * "Low ready stock" alert (prd.md §6.3) against `minStockQty`. Prices here are the catalog's
 * list prices; invoices still price from the sales order / design rate (SAL rules unchanged).
 */
@Schema({ collection: 'catalog_items', timestamps: true })
export class CatalogItem extends BaseMasterFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Design', required: false, index: true })
  designId?: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  designNameOrNumber!: string;

  @Prop({ type: Number, required: true, min: 0 })
  salesPrice!: number;

  @Prop({ type: Number, required: true, min: 0 })
  defaultPrice!: number;

  @Prop({ type: String, enum: CATALOG_TAGS, required: true })
  tag!: CatalogTag;

  @Prop({ type: String, required: false })
  description?: string;

  @Prop({ type: Number, required: false, min: 0 })
  samplePrice?: number;

  @Prop({ type: String, required: false })
  designRecipe?: string;

  @Prop({ type: [String], default: [] })
  sizes!: string[];

  @Prop({ type: [String], default: [] })
  colours!: string[];

  @Prop({ type: String, required: false, trim: true })
  hsnCode?: string;

  @Prop({ type: Number, required: false, min: 0, max: 100 })
  gstPct?: number;

  @Prop({ type: Number, required: false, min: 0 })
  minStockQty?: number;

  @Prop({ type: Number, required: false, min: 0 })
  minOrderQty?: number;

  /** Manual "out of stock in store" flag; the list also derives it from live stock when linked. */
  @Prop({ type: Boolean, default: false })
  outOfStock!: boolean;

  @Prop({ type: [String], default: [] })
  photoUrls!: string[];
}

export type CatalogItemDocument = CatalogItem & Document;
export const CatalogItemSchema = SchemaFactory.createForClass(CatalogItem);
CatalogItemSchema.index({ designNameOrNumber: 1 }, { unique: true });
CatalogItemSchema.plugin(auditPlugin, { module: 'design', entityType: 'CatalogItem' });

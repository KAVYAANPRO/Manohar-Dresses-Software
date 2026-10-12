import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * DSN-01. A design is a catalogue item (master data, not a transactional document), so it
 * uses soft-deactivation like the rest of Phase 1's masters rather than a draft/confirm
 * lifecycle. `defaultSellingRate` is a cache of the latest entry in `design_rate_history`
 * (DSN-06) - kept here for cheap reads; the history collection is the source of truth and is
 * never edited, only appended to.
 */
@Schema({ collection: 'designs', timestamps: true })
export class Design extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, trim: true })
  designNo!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProductCategory', required: true })
  productCategoryId!: Types.ObjectId;

  /** Construction (e.g. "2-piece", "3-piece") - distinct from productCategoryId (prd.md Q11). Free text: no master exists for this yet. */
  @Prop({ type: String, required: false })
  productType?: string;

  @Prop({ type: String, required: false })
  description?: string;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Colour', default: [] })
  colourOptions!: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Size', default: [] })
  sizeOptions!: Types.ObjectId[];

  @Prop({ type: Number, required: false, min: 0 })
  expectedProductionQty?: number;

  @Prop({ type: String, required: false })
  manufacturingInstructions?: string;

  @Prop({ type: Number, required: false, min: 0 })
  defaultSellingRate?: number;

  /** SAL-05: HSN per invoice line comes from the design being sold. Required before an order/invoice can be created for it. */
  @Prop({ type: String, required: false, trim: true })
  hsn?: string;

  @Prop({ type: [String], default: [] })
  imageUrls!: string[];

  @Prop({ type: String, required: false })
  notes?: string;
}

export type DesignDocument = Design & Document;
export const DesignSchema = SchemaFactory.createForClass(Design);
DesignSchema.plugin(auditPlugin, { module: 'design', entityType: 'Design' });

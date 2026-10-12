import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/** MST-03. A purchasable raw item, e.g. "Cotton Fabric". */
@Schema({ collection: 'materials', timestamps: true })
export class Material extends BaseMasterFields {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialCategory', required: true, index: true })
  categoryId!: Types.ObjectId;

  @Prop({ type: String, required: false })
  fabricType?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Uom', required: true })
  baseUomId!: Types.ObjectId;

  @Prop({ type: Number, required: false, min: 0 })
  minStockQty?: number;
}

export type MaterialDocument = Material & Document;
export const MaterialSchema = SchemaFactory.createForClass(Material);
MaterialSchema.index({ name: 1, categoryId: 1 });
MaterialSchema.plugin(auditPlugin, { module: 'master', entityType: 'Material' });

/**
 * A material in a colour (MST-03: "This is what is actually stocked"). Phase 2's
 * `stock_items` of kind RAW_MATERIAL/PROCESSED_MATERIAL/TRIM will reference this by id;
 * kept here because it is master data, not a transaction.
 */
@Schema({ collection: 'material_variants', timestamps: true })
export class MaterialVariant extends BaseMasterFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Material', required: true, index: true })
  materialId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Colour', required: true })
  colourId!: Types.ObjectId;

  @Prop({ type: String, required: false })
  code?: string;
}

export type MaterialVariantDocument = MaterialVariant & Document;
export const MaterialVariantSchema = SchemaFactory.createForClass(MaterialVariant);
MaterialVariantSchema.index({ materialId: 1, colourId: 1 }, { unique: true });
MaterialVariantSchema.plugin(auditPlugin, { module: 'master', entityType: 'MaterialVariant' });

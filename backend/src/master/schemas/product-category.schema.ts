import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * MST-05. Product category = kind of garment (e.g. "Kurti Set"), configurable, seeded with
 * "Kurti Set". Distinct from a design's "product type" (construction, e.g. 2-piece/3-piece -
 * prd.md Q11) which lives as a plain string on the design record in the `design` module.
 */
@Schema({ collection: 'product_categories', timestamps: true })
export class ProductCategory extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, trim: true })
  name!: string;
}

export type ProductCategoryDocument = ProductCategory & Document;
export const ProductCategorySchema = SchemaFactory.createForClass(ProductCategory);
ProductCategorySchema.plugin(auditPlugin, { module: 'master', entityType: 'ProductCategory' });

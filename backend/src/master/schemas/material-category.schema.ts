import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/** MST-02. Top Fabric, Bottom Fabric, Dupatta Fabric seeded; more can be added. */
@Schema({ collection: 'material_categories', timestamps: true })
export class MaterialCategory extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, trim: true })
  name!: string;
}

export type MaterialCategoryDocument = MaterialCategory & Document;
export const MaterialCategorySchema = SchemaFactory.createForClass(MaterialCategory);
MaterialCategorySchema.plugin(auditPlugin, { module: 'master', entityType: 'MaterialCategory' });

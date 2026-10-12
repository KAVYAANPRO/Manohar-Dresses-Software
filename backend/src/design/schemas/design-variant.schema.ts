import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * DSN-02. A design in a colour and size - "the finished-stock unit". Generated automatically
 * from a design's colourOptions x sizeOptions (DesignsService.generateVariants), never
 * created directly by a user. Existing variants are never removed when options change, only
 * new combinations are added (MST-12: referenced rows are deactivated, not deleted).
 */
@Schema({ collection: 'design_variants', timestamps: true })
export class DesignVariant extends BaseMasterFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Design', required: true, index: true })
  designId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Colour', required: true })
  colourId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Size', required: true })
  sizeId!: Types.ObjectId;
}

export type DesignVariantDocument = DesignVariant & Document;
export const DesignVariantSchema = SchemaFactory.createForClass(DesignVariant);
DesignVariantSchema.index({ designId: 1, colourId: 1, sizeId: 1 }, { unique: true });
DesignVariantSchema.plugin(auditPlugin, { module: 'design', entityType: 'DesignVariant' });

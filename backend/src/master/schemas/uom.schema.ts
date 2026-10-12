import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/** MST-04. Units of measure (metre, roll, kg, ...). Stock and BOM are always in a material's base unit. */
@Schema({ collection: 'uoms', timestamps: true })
export class Uom extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, trim: true })
  code!: string; // e.g. 'M', 'ROLL', 'KG', 'THAN'

  @Prop({ type: String, required: true })
  name!: string;
}

export type UomDocument = Uom & Document;
export const UomSchema = SchemaFactory.createForClass(Uom);
UomSchema.plugin(auditPlugin, { module: 'master', entityType: 'Uom' });

/**
 * Per-material conversion to that material's base unit (MST-04, resolves A-15's Quantity /
 * Unit / Meter Quantity ambiguity). `factorToBase` is how many base-unit quantities one unit
 * of `uomId` equals, e.g. a "roll" of a given fabric = 45 (metres).
 */
@Schema({ collection: 'uom_conversions', timestamps: true })
export class UomConversion extends BaseMasterFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Material', required: true, index: true })
  materialId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Uom', required: true })
  uomId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  factorToBase!: number;
}

export type UomConversionDocument = UomConversion & Document;
export const UomConversionSchema = SchemaFactory.createForClass(UomConversion);
UomConversionSchema.index({ materialId: 1, uomId: 1 }, { unique: true });
UomConversionSchema.plugin(auditPlugin, { module: 'master', entityType: 'UomConversion' });

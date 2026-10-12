import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * SHR-03: configurable shortage tolerance % per material, processing type, and party. Any of
 * the three keys may be left empty (= "any"). The most specific active row that matches wins;
 * with no row, CompanySettings.shortageTolerancePct is the default.
 */
@Schema({ collection: 'shortage_tolerances', timestamps: true })
export class ShortageTolerance extends BaseMasterFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Material', required: false, index: true })
  materialId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProcessingType', required: false })
  processingTypeId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: false })
  jobWorkerId?: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  tolerancePct!: number;

  @Prop({ type: String, required: false })
  notes?: string;
}

export type ShortageToleranceDocument = ShortageTolerance & Document;
export const ShortageToleranceSchema = SchemaFactory.createForClass(ShortageTolerance);
ShortageToleranceSchema.plugin(auditPlugin, { module: 'jobwork', entityType: 'ShortageTolerance' });

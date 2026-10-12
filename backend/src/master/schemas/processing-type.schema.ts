import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/** MST-09. Dyeing, Printing, Embroidery, and so on. */
@Schema({ collection: 'processing_types', timestamps: true })
export class ProcessingType extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, trim: true })
  name!: string;
}

export type ProcessingTypeDocument = ProcessingType & Document;
export const ProcessingTypeSchema = SchemaFactory.createForClass(ProcessingType);
ProcessingTypeSchema.plugin(auditPlugin, { module: 'master', entityType: 'ProcessingType' });

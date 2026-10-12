import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/** Colours are a master (MST-03): a material variant is material x colour. */
@Schema({ collection: 'colours', timestamps: true })
export class Colour extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, trim: true })
  name!: string;

  @Prop({ type: String, required: false })
  hexCode?: string;
}

export type ColourDocument = Colour & Document;
export const ColourSchema = SchemaFactory.createForClass(Colour);
ColourSchema.plugin(auditPlugin, { module: 'master', entityType: 'Colour' });

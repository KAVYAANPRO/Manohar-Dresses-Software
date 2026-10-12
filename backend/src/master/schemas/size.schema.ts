import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/** MST-05. XS to XXL seeded; configurable. `sortOrder` keeps size lists in wearer order. */
@Schema({ collection: 'sizes', timestamps: true })
export class Size extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, trim: true })
  name!: string;

  @Prop({ type: Number, required: true, default: 0 })
  sortOrder!: number;
}

export type SizeDocument = Size & Document;
export const SizeSchema = SchemaFactory.createForClass(Size);
SizeSchema.plugin(auditPlugin, { module: 'master', entityType: 'Size' });

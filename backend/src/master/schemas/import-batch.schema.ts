import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * MST-11. A record of every import run - go-live and later onboarding depend on being able
 * to show exactly what was loaded and what was rejected (tech.md §13.5).
 */
@Schema({ collection: 'import_batches', timestamps: { createdAt: true, updatedAt: false } })
export class ImportBatch {
  @Prop({ type: String, required: true })
  entity!: string;

  @Prop({ type: Boolean, required: true })
  dryRun!: boolean;

  @Prop({ type: Boolean, required: true })
  committed!: boolean;

  @Prop({ type: Number, required: true })
  totalRows!: number;

  @Prop({ type: Number, required: true })
  validRows!: number;

  @Prop({ type: Number, required: true })
  rejectedRows!: number;

  @Prop({ type: [Object], required: false })
  rejections?: Array<{ row: number; reasons: Record<string, string> }>;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
}

export type ImportBatchDocument = ImportBatch & Document;
export const ImportBatchSchema = SchemaFactory.createForClass(ImportBatch);

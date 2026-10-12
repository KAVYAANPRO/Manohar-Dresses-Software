import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Gapless numbering per document type and financial year (tech.md §4.4, SAL-06). */
@Schema({ collection: 'number_series' })
export class NumberSeries {
  @Prop({ type: String, required: true })
  docType!: string; // e.g. 'INVOICE', 'PURCHASE', 'JOB_SLIP'

  @Prop({ type: String, required: true })
  fy!: string; // e.g. '26-27'

  @Prop({ type: String, required: true })
  prefix!: string;

  @Prop({ type: Number, default: 5 })
  pad!: number;

  @Prop({ type: Number, default: 1 })
  nextNo!: number;
}

export type NumberSeriesDocument = NumberSeries & Document;
export const NumberSeriesSchema = SchemaFactory.createForClass(NumberSeries);
NumberSeriesSchema.index({ docType: 1, fy: 1 }, { unique: true });

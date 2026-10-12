import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export const LOT_SERIES_SCOPES = ['SUPPLIER', 'JOB_WORKER'] as const;
export type LotSeriesScope = (typeof LOT_SERIES_SCOPES)[number];

/**
 * One running lot-number sequence per party (owner's numbering: every party counts from 1 with its
 * own abbreviation - Kavyan -> KAV-1, KAV-2 ...; Mahesh -> MAH-1 ...), replacing fixed number blocks
 * per party. `next` is the number the next suggestion will use; a manually typed higher number
 * moves it forward so suggestions never collide with what was typed.
 */
@Schema({ collection: 'lot_number_series', timestamps: true })
export class LotNumberSeries {
  @Prop({ type: String, enum: LOT_SERIES_SCOPES, required: true })
  scope!: LotSeriesScope;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  partyId!: Types.ObjectId;

  /** Upper-case letters/digits, e.g. "KAV". Unique within the scope. */
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  prefix!: string;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  next!: number;
}

export type LotNumberSeriesDocument = LotNumberSeries & Document;
export const LotNumberSeriesSchema = SchemaFactory.createForClass(LotNumberSeries);
LotNumberSeriesSchema.index({ scope: 1, partyId: 1 }, { unique: true });
LotNumberSeriesSchema.index({ scope: 1, prefix: 1 }, { unique: true });

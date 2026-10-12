import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * PKG-01: "Packing is a status on stock and does not move it." One row per finished-goods
 * stock item, holding a running packed count that PackingService clamps to [0, onHand] -
 * never a location, never a stock_ledger entry.
 */
@Schema({ collection: 'packing_records', timestamps: true })
export class PackingRecord {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true, unique: true, index: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  packedQty!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  updatedBy?: Types.ObjectId;
}

export type PackingRecordDocument = PackingRecord & Document;
export const PackingRecordSchema = SchemaFactory.createForClass(PackingRecord);

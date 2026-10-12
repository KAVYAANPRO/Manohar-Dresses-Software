import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * Derived balances (tech.md §4.3). In Postgres a trigger applies every ledger row to this
 * table so application code cannot forget and cannot desync it from the ledger; there is no
 * trigger in Mongo, so `StockService.post()` updates a balance row in the SAME transaction as
 * the ledger insert that caused it, and nothing else in this codebase writes here directly.
 * `receivedOn` is denormalized from the lot purely so FIFO allocation can sort without a
 * second round trip; it is set once at insert and never changes.
 */
@Schema({ collection: 'stock_balances', timestamps: { createdAt: false, updatedAt: true } })
export class StockBalance {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLocation', required: true })
  locationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true, index: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  receivedOn!: Date;

  @Prop({ type: Number, required: true, default: 0 })
  qty!: number;
}

export type StockBalanceDocument = StockBalance & Document;
export const StockBalanceSchema = SchemaFactory.createForClass(StockBalance);
StockBalanceSchema.index({ lotId: 1, locationId: 1 }, { unique: true });
StockBalanceSchema.index({ stockItemId: 1, locationId: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/** tech.md §5.1. Every stock change in the whole system is one of these. */
export const MOVEMENT_TYPES = [
  'OPENING',
  'INWARD',
  'ISSUE',
  'RETURN_FROM_FACTORY',
  'CONSUMPTION',
  'PROCESS_OUTPUT',
  'PRODUCTION_RECEIPT',
  'REJECTION',
  'SHORTAGE_WRITE_OFF',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'SALE',
  'SALES_RETURN',
  'PURCHASE_RETURN',
  'TRANSFER',
  'REVERSAL',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * The stock ledger: append-only (tech.md §4.3). One row moves a quantity of one lot from one
 * location to another. In Postgres this table is protected by `forbid_mutation()` triggers
 * and a `REVOKE UPDATE, DELETE` on the application role; here the same guarantee is a
 * Mongoose pre-hook (below) that throws on every mutating query method. A raw MongoDB driver
 * call bypassing Mongoose could still defeat this - see the README's caveat on app-layer
 * enforcement. `qty` is always positive; direction lives entirely in fromLocationId/toLocationId.
 */
@Schema({ collection: 'stock_ledger', timestamps: { createdAt: false, updatedAt: false } })
export class StockLedgerEntry {
  @Prop({ type: Date, required: true, default: () => new Date() })
  postedAt!: Date;

  @Prop({ type: Date, required: true })
  businessDate!: Date;

  @Prop({ type: String, enum: MOVEMENT_TYPES, required: true, index: true })
  movementType!: MovementType;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true, index: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLocation', required: true })
  fromLocationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLocation', required: true })
  toLocationId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  /** Snapshot of the lot's unit cost at the moment of movement - never recomputed later. */
  @Prop({ type: Number, required: true, min: 0 })
  unitCost!: number;

  @Prop({ type: String, required: true })
  docType!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  docId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: false })
  docLineId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  postedBy!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLedgerEntry', required: false })
  reversesId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  reason?: string;
}

export type StockLedgerDocument = StockLedgerEntry & Document;
export const StockLedgerSchema = SchemaFactory.createForClass(StockLedgerEntry);
StockLedgerSchema.index({ stockItemId: 1, businessDate: 1 });
StockLedgerSchema.index({ docType: 1, docId: 1 });
StockLedgerSchema.index({ reversesId: 1 }, { unique: true, sparse: true });

function forbidMutation() {
  throw new Error('stock_ledger is append-only: update and delete are not permitted.');
}
for (const method of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
]) {
  StockLedgerSchema.pre(method as any, function () {
    forbidMutation();
  });
}
for (const method of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
  StockLedgerSchema.pre(method as any, function () {
    forbidMutation();
  });
}

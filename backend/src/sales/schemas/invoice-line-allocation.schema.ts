import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * tech.md §8.2 step 4: "Cost of goods sold and full traceability come from this table."
 * Append-only, one row per finished lot a FIFO sale allocation drew from - never mutated,
 * mirroring stock_ledger's own immutability (a cancel writes REVERSAL ledger rows but never
 * touches this history).
 */
@Schema({
  collection: 'invoice_line_allocations',
  timestamps: { createdAt: true, updatedAt: false },
})
export class InvoiceLineAllocation {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  invoiceLineId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true, index: true })
  lotId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitCost!: number;

  createdAt?: Date;
}

export type InvoiceLineAllocationDocument = InvoiceLineAllocation & Document;
export const InvoiceLineAllocationSchema = SchemaFactory.createForClass(InvoiceLineAllocation);

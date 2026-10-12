import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/** tech.md §8.4: invoice payment status is derived from these rows, never hand-edited. */
@Schema({ collection: 'payment_allocations', timestamps: { createdAt: true, updatedAt: false } })
export class PaymentAllocation {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Payment', required: true, index: true })
  paymentId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.01 })
  amount!: number;

  createdAt?: Date;
}

export type PaymentAllocationDocument = PaymentAllocation & Document;
export const PaymentAllocationSchema = SchemaFactory.createForClass(PaymentAllocation);
PaymentAllocationSchema.index({ paymentId: 1, invoiceId: 1 }, { unique: true });

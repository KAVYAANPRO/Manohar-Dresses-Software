import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';

export const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** SAL-09, tech.md §8.4 (R1 minimal): a receipt from a customer, allocated to one or more invoices. */
@Schema({ collection: 'payments', timestamps: true })
export class Payment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, index: true })
  customerId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date!: Date;

  @Prop({ type: Number, required: true, min: 0.01 })
  amount!: number;

  @Prop({ type: String, enum: PAYMENT_MODES, required: true })
  mode!: PaymentMode;

  @Prop({ type: String, required: false })
  reference?: string;

  /** Receipt number (RCPT/<fy>/00001); older rows may not have one. */
  @Prop({ type: String, required: false, index: true })
  docNo?: string;

  @Prop({ type: String, required: false })
  notes?: string;

  /** Set when this receipt is an advance taken on an exhibition order. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ExhibitionOrder', required: false })
  exhibitionOrderId?: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  amountAllocated!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: Number, default: 1 })
  version!: number;
}

export type PaymentDocument = Payment & Document;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.plugin(auditPlugin, { module: 'sales', entityType: 'Payment' });

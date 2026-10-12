import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';

/**
 * The financial side of a sales return (SAL-08 R2 / SAL-10): its own gapless number series
 * (CN/<fy>/00001), the GST split mirroring the original invoice, and the amount that reduces
 * the invoice's outstanding balance. Immutable once issued.
 */
@Schema({ collection: 'credit_notes', timestamps: true })
export class CreditNote {
  @Prop({ type: String, required: true, unique: true })
  docNo!: string;

  @Prop({ type: Date, required: true })
  docDate!: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  invoiceNo!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, index: true })
  customerId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'SalesReturn', required: true, index: true })
  salesReturnId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: Boolean, required: true })
  isIntraState!: boolean;

  @Prop({ type: Number, required: true })
  taxableTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  cgstTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  sgstTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  igstTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  roundOff!: number;

  @Prop({ type: Number, required: true })
  total!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;
}

export type CreditNoteDocument = CreditNote & Document;
export const CreditNoteSchema = SchemaFactory.createForClass(CreditNote);
CreditNoteSchema.plugin(auditPlugin, { module: 'sales', entityType: 'CreditNote' });

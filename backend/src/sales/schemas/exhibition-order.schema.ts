import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';
import { PAYMENT_MODES } from './payment.schema';

export const EXHIBITION_STATUSES = ['PENDING', 'CONVERTED', 'CANCELLED'] as const;
export type ExhibitionStatus = (typeof EXHIBITION_STATUSES)[number];

@Schema({ _id: true })
export class ExhibitionOrderLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DesignVariant', required: true })
  designVariantId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitRate!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0, max: 100 })
  discountPct!: number;
}
export const ExhibitionOrderLineSchema = SchemaFactory.createForClass(ExhibitionOrderLine);

/**
 * An order booked at an exhibition / pop-up, often for a walk-in buyer who is not yet in the
 * customer master. No stock moves and no tax document exists until it is converted into a
 * sales order (reserves ATP) or an invoice (deducts stock). Any advance taken at the stall is
 * recorded as a customer payment at conversion and allocated to the invoice when there is one.
 */
@Schema({ collection: 'exhibition_orders', timestamps: true })
export class ExhibitionOrder extends BaseDocumentFields {
  @Prop({ type: String, required: true, trim: true })
  exhibitionName!: string;

  @Prop({ type: String, required: false })
  location?: string;

  @Prop({ type: String, required: true, trim: true })
  customerName!: string;

  @Prop({ type: String, required: false })
  mobile?: string;

  @Prop({ type: String, required: false })
  state?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: false, index: true })
  customerId?: Types.ObjectId;

  @Prop({ type: [ExhibitionOrderLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<ExhibitionOrderLine>;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  amountCollected!: number;

  @Prop({ type: String, enum: PAYMENT_MODES, required: false })
  paymentMode?: string;

  @Prop({ type: String, required: false })
  notes?: string;

  @Prop({ type: String, enum: EXHIBITION_STATUSES, required: true, default: 'PENDING' })
  status!: ExhibitionStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'SalesOrder', required: false })
  salesOrderId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice', required: false })
  invoiceId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Payment', required: false })
  advancePaymentId?: Types.ObjectId;
}

export type ExhibitionOrderDocument = ExhibitionOrder & Document;
export const ExhibitionOrderSchema = SchemaFactory.createForClass(ExhibitionOrder);
ExhibitionOrderSchema.plugin(auditPlugin, { module: 'sales', entityType: 'ExhibitionOrder' });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const INVOICE_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

@Schema({ _id: true })
export class InvoiceLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: false })
  salesOrderLineId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DesignVariant', required: true })
  designVariantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  hsn!: string;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitRate!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0, max: 100 })
  discountPct!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  extraDiscountAmt!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0, max: 100 })
  extraDiscountPct!: number;

  /** Set when this line bills goods already out on a delivery challan (stock comes from CUST-CONSIGN). */
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  deliveryChallanLineId?: Types.ObjectId;

  /** Running total of qty on confirmed sales returns against this line (SAL-10). */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  returnedQty!: number;

  @Prop({ type: Number, required: true, min: 0 })
  grossAmount!: number;

  @Prop({ type: Number, required: true, min: 0 })
  discountAmount!: number;

  @Prop({ type: Number, required: true, min: 0 })
  taxableValue!: number;

  @Prop({ type: Number, required: true, min: 0 })
  taxRatePct!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  cgst!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  sgst!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  igst!: number;

  @Prop({ type: Number, required: true, min: 0 })
  lineTotal!: number;
}
export const InvoiceLineSchema = SchemaFactory.createForClass(InvoiceLine);

/**
 * SAL-04 to SAL-09. Customer name/address/GSTIN/place of supply are snapshotted onto the
 * invoice at confirm time (tech.md §8.2 step 3) - later edits to the customer master never
 * retroactively change an already-issued invoice. `paymentStatus` is derived from
 * payment_allocations, never hand-edited (tech.md §8.4).
 */
@Schema({ collection: 'invoices', timestamps: true })
export class Invoice extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, index: true })
  customerId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'SalesOrder', required: false, index: true })
  salesOrderId?: Types.ObjectId;

  @Prop({ type: [InvoiceLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<InvoiceLine>;

  @Prop({ type: String, enum: INVOICE_STATUSES, required: true, default: 'DRAFT' })
  status!: InvoiceStatus;

  @Prop({ type: String, enum: PAYMENT_STATUSES, required: true, default: 'UNPAID' })
  paymentStatus!: PaymentStatus;

  @Prop({ type: String, required: true })
  customerNameSnapshot!: string;

  @Prop({ type: String, required: false })
  customerAddressSnapshot?: string;

  @Prop({ type: String, required: false })
  customerGstinSnapshot?: string;

  @Prop({ type: String, required: false })
  placeOfSupply?: string;

  @Prop({ type: Boolean, required: true, default: false })
  isIntraState!: boolean;

  @Prop({ type: Number, required: true, default: 0 })
  subtotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  discountTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  taxableTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  cgstTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  sgstTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  igstTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  roundOff!: number;

  @Prop({ type: Number, required: true, default: 0 })
  grandTotal!: number;

  @Prop({ type: String, required: false })
  notes?: string;

  /** Non-taxable charges ("Expenses (if any)": transport etc.), added after tax, before round-off. */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  otherCharges!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'SalesAgent', required: false, index: true })
  agentId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  agentNameSnapshot?: string;

  /** Snapshot at confirm; commission = taxableTotal x pct. */
  @Prop({ type: Number, required: true, default: 0, min: 0, max: 100 })
  commissionPct!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  commissionAmount!: number;

  /** Sum of confirmed credit notes against this invoice; reduces outstanding. */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  creditedTotal!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DeliveryChallan', required: false, index: true })
  deliveryChallanId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ExhibitionOrder', required: false })
  exhibitionOrderId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  transportName?: string;
}

export type InvoiceDocument = Invoice & Document;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.plugin(auditPlugin, { module: 'sales', entityType: 'Invoice' });

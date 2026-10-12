import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const PURCHASE_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

@Schema({ _id: true })
export class PurchaseLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  materialVariantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Uom', required: true })
  uomId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  @Prop({ type: Number, required: true, min: 0 })
  rate!: number;

  /** qty x rate, computed server-side (PUR-03) - never trusted from the client. */
  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  /** qty converted to the material's base unit (MST-04). */
  @Prop({ type: Number, required: true, min: 0 })
  qtyBase!: number;

  /** This line's share of `otherCharges`, apportioned by value at confirm time (PUR-04). */
  @Prop({ type: Number, required: false, min: 0 })
  otherChargesShare?: number;

  /** (amount + otherChargesShare) / qtyBase - the per-base-unit cost every inward's lot uses (§6.2). */
  @Prop({ type: Number, required: false, min: 0 })
  landedUnitCost?: number;

  /** Running total received across all inwards against this line, in base units (INW-05). */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyReceivedBase!: number;
}
export const PurchaseLineSchema = SchemaFactory.createForClass(PurchaseLine);

/**
 * PUR-01 to PUR-07. Confirming creates an expected receipt ONLY - no stock effect (BR-01).
 * Confirmed purchases are locked apart from notes/attachments (BR-11); cancel is blocked
 * while any inward exists against it (PUR-06), which InwardsService checks before allowing
 * a purchase-cancel to proceed.
 */
@Schema({ collection: 'purchases', timestamps: true })
export class Purchase extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Supplier', required: true })
  supplierId!: Types.ObjectId;

  @Prop({ type: String, required: false })
  supplierInvoiceNo?: string;

  @Prop({ type: [PurchaseLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<PurchaseLine>;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  otherCharges!: number;

  @Prop({ type: String, required: false })
  notes?: string;

  /** Raised automatically behind a direct inward (goods received without a PO) - INW-04. */
  @Prop({ type: Boolean, required: true, default: false })
  isDirect!: boolean;

  @Prop({ type: Date, required: false })
  expectedDeliveryDate?: Date;

  @Prop({ type: [String], default: [] })
  attachmentUrls!: string[];

  @Prop({ type: String, enum: PURCHASE_STATUSES, required: true, default: 'DRAFT' })
  status!: PurchaseStatus;
}

export type PurchaseDocument = Purchase & Document;
export const PurchaseSchema = SchemaFactory.createForClass(Purchase);
// PUR-02: the same supplier invoice number cannot be entered twice for one supplier.
PurchaseSchema.index(
  { supplierId: 1, supplierInvoiceNo: 1 },
  { unique: true, partialFilterExpression: { supplierInvoiceNo: { $type: 'string' } } },
);
PurchaseSchema.plugin(auditPlugin, { module: 'purchasing', entityType: 'Purchase' });

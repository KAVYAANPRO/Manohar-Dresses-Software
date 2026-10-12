import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const PURCHASE_RETURN_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type PurchaseReturnStatus = (typeof PURCHASE_RETURN_STATUSES)[number];

@Schema({ _id: true })
export class PurchaseReturnLine {
  _id!: Types.ObjectId;

  /** The inward line (and therefore the lot) the material originally came in on. */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  inwardLineId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  materialVariantId!: Types.ObjectId;

  /** In the material's base unit (the unit the lot is held in). */
  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  /** The lot's landed unit cost - what the supplier is debited per base unit. */
  @Prop({ type: Number, required: true, min: 0 })
  unitCost!: number;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;
}
export const PurchaseReturnLineSchema = SchemaFactory.createForClass(PurchaseReturnLine);

/**
 * PUR-08: Purchase -> Inward -> Inspection -> Return. A return always refers to one
 * confirmed inward; confirming it posts PURCHASE_RETURN movements from `locationId`
 * (normally MAIN-WH, or QUARANTINE after inspection) to the virtual supplier location
 * (prd §5.2), lot by lot, and raises a debit note number. Cancelling a confirmed return
 * reverses those ledger rows (STK-03).
 */
@Schema({ collection: 'purchase_returns', timestamps: true })
export class PurchaseReturn extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Purchase', required: true, index: true })
  purchaseId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Inward', required: true, index: true })
  inwardId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLocation', required: true })
  locationId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: String, required: false })
  remarks?: string;

  @Prop({ type: [PurchaseReturnLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<PurchaseReturnLine>;

  /** Debit note value = sum of qty x landed unit cost. */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  totalAmount!: number;

  /** Allocated on confirm (number series DEBIT_NOTE). */
  @Prop({ type: String, required: false })
  debitNoteNo?: string;

  @Prop({ type: String, enum: PURCHASE_RETURN_STATUSES, required: true, default: 'DRAFT' })
  status!: PurchaseReturnStatus;
}

export type PurchaseReturnDocument = PurchaseReturn & Document;
export const PurchaseReturnSchema = SchemaFactory.createForClass(PurchaseReturn);
PurchaseReturnSchema.plugin(auditPlugin, { module: 'purchasing', entityType: 'PurchaseReturn' });

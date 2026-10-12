import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const SALES_RETURN_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type SalesReturnStatus = (typeof SALES_RETURN_STATUSES)[number];
export const RETURN_CONDITIONS = ['GOOD', 'DAMAGED'] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

@Schema({ _id: false })
export class ReturnLotPortion {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: Number, required: true })
  qty!: number;

  @Prop({ type: Number, required: true })
  unitCost!: number;
}
export const ReturnLotPortionSchema = SchemaFactory.createForClass(ReturnLotPortion);

@Schema({ _id: true })
export class SalesReturnLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  invoiceLineId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DesignVariant', required: true })
  designVariantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  /** GOOD -> back to ready stock (MAIN-WH); DAMAGED -> QUARANTINE. */
  @Prop({ type: String, enum: RETURN_CONDITIONS, required: true, default: 'GOOD' })
  condition!: ReturnCondition;

  /** Credit values, pro-rated from the invoice line (taxable value and tax per piece). */
  @Prop({ type: Number, required: true, default: 0 })
  unitRate!: number;

  @Prop({ type: Number, required: true, default: 0 })
  taxableValue!: number;

  @Prop({ type: Number, required: true, default: 0 })
  taxRatePct!: number;

  @Prop({ type: Number, required: true, default: 0 })
  cgst!: number;

  @Prop({ type: Number, required: true, default: 0 })
  sgst!: number;

  @Prop({ type: Number, required: true, default: 0 })
  igst!: number;

  @Prop({ type: Number, required: true, default: 0 })
  lineTotal!: number;

  /** Which sold lots came back (filled at confirm, from invoice_line_allocations). */
  @Prop({ type: [ReturnLotPortionSchema], default: [] })
  lots!: ReturnLotPortion[];
}
export const SalesReturnLineSchema = SchemaFactory.createForClass(SalesReturnLine);

/** SAL-10: goods returned against an invoice; confirming moves stock and issues a credit note. */
@Schema({ collection: 'sales_returns', timestamps: true })
export class SalesReturn extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, index: true })
  customerId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: [SalesReturnLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<SalesReturnLine>;

  @Prop({ type: String, enum: SALES_RETURN_STATUSES, required: true, default: 'DRAFT' })
  status!: SalesReturnStatus;

  @Prop({ type: Number, required: true, default: 0 })
  taxableTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  taxTotal!: number;

  @Prop({ type: Number, required: true, default: 0 })
  roundOff!: number;

  @Prop({ type: Number, required: true, default: 0 })
  creditTotal!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'CreditNote', required: false })
  creditNoteId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  creditNoteNo?: string;

  @Prop({ type: String, required: false })
  notes?: string;
}

export type SalesReturnDocument = SalesReturn & Document;
export const SalesReturnSchema = SchemaFactory.createForClass(SalesReturn);
SalesReturnSchema.plugin(auditPlugin, { module: 'sales', entityType: 'SalesReturn' });

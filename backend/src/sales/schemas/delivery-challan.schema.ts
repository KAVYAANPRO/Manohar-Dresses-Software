import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const DELIVERY_CHALLAN_STATUSES = [
  'DRAFT',
  'DISPATCHED',
  'PARTIALLY_CLOSED',
  'CLOSED',
  'CANCELLED',
] as const;
export type DeliveryChallanStatus = (typeof DELIVERY_CHALLAN_STATUSES)[number];

export const CHALLAN_PURPOSES = ['APPROVAL', 'CONSIGNMENT', 'DELIVERY', 'OTHER'] as const;

@Schema({ _id: false })
export class ChallanLotPortion {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  /** Qty of this lot still lying with the customer (dispatched minus invoiced minus returned). */
  @Prop({ type: Number, required: true, min: 0 })
  qtyOpen!: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitCost!: number;
}
export const ChallanLotPortionSchema = SchemaFactory.createForClass(ChallanLotPortion);

@Schema({ _id: true })
export class DeliveryChallanLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DesignVariant', required: true })
  designVariantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyInvoiced!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyReturned!: number;

  /** Indicative rate carried to the invoice when the challan is billed. */
  @Prop({ type: Number, required: false, min: 0 })
  unitRate?: number;

  @Prop({ type: [ChallanLotPortionSchema], default: [] })
  lots!: ChallanLotPortion[];
}
export const DeliveryChallanLineSchema = SchemaFactory.createForClass(DeliveryChallanLine);

@Schema({ _id: false })
export class ChallanReturnEvent {
  @Prop({ type: Date, required: true })
  date!: Date;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  lineId!: Types.ObjectId;

  @Prop({ type: Number, required: true })
  qty!: number;

  @Prop({ type: String, required: true })
  condition!: string;

  @Prop({ type: String, required: false })
  note?: string;

  @Prop({ type: SchemaTypes.ObjectId, required: false })
  by?: Types.ObjectId;
}
export const ChallanReturnEventSchema = SchemaFactory.createForClass(ChallanReturnEvent);

/**
 * Customer delivery challan: goods sent to a customer before or without an invoice (approval,
 * consignment). Dispatch moves stock MAIN-WH -> CUST-CONSIGN (still company-owned, but not
 * sellable and not in ATP). Each line is later closed by billing it (the invoice consumes the
 * same lots from CUST-CONSIGN) or by the customer returning it (CUST-CONSIGN -> MAIN-WH, or
 * QUARANTINE when damaged).
 */
@Schema({ collection: 'delivery_challans', timestamps: true })
export class DeliveryChallan extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, index: true })
  customerId!: Types.ObjectId;

  /** Informational reference only: the challan does not consume the order's reservation. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'SalesOrder', required: false })
  salesOrderId?: Types.ObjectId;

  @Prop({ type: String, enum: CHALLAN_PURPOSES, required: true, default: 'APPROVAL' })
  purpose!: string;

  @Prop({ type: String, required: false })
  transportName?: string;

  @Prop({ type: String, required: false })
  vehicleNumber?: string;

  @Prop({ type: String, required: false })
  notes?: string;

  @Prop({ type: [DeliveryChallanLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<DeliveryChallanLine>;

  @Prop({ type: String, enum: DELIVERY_CHALLAN_STATUSES, required: true, default: 'DRAFT' })
  status!: DeliveryChallanStatus;

  @Prop({ type: Date, required: false })
  dispatchedAt?: Date;

  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  invoiceIds!: Types.ObjectId[];

  @Prop({ type: [ChallanReturnEventSchema], default: [] })
  returns!: ChallanReturnEvent[];
}

export type DeliveryChallanDocument = DeliveryChallan & Document;
export const DeliveryChallanSchema = SchemaFactory.createForClass(DeliveryChallan);
DeliveryChallanSchema.plugin(auditPlugin, { module: 'sales', entityType: 'DeliveryChallan' });

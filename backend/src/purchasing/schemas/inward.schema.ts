import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const INWARD_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type InwardStatus = (typeof INWARD_STATUSES)[number];

@Schema({ _id: true })
export class InwardLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  purchaseLineId!: Types.ObjectId;

  /**
   * Material x colour actually received (INW-02 captures colour). Defaults to the purchase
   * line's variant; the receiver may record a different colour of the SAME material when the
   * supplier sent another shade - stock is then booked against what physically arrived.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  materialVariantId!: Types.ObjectId;

  /** Unit the quantity was counted in (the purchase line's unit). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Uom', required: false })
  uomId?: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  /** Converted to the material's base unit at the purchase line's own unit (MST-04). */
  @Prop({ type: Number, required: true, min: 0.001 })
  qtyBase!: number;

  /** Purchase rate per `uomId` (snapshot of the purchase line). */
  @Prop({ type: Number, required: false, min: 0 })
  rate?: number;

  /** Blank means "use the inward's lot number" (INW-02 - traceability is never partial). */
  @Prop({ type: String, required: false })
  lotNo?: string;

  /** Rolls (thans) received on this line, metres (or base units) each; qty = their sum when given. */
  @Prop({ type: [Number], default: undefined })
  thans?: number[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: false })
  createdLotId?: Types.ObjectId;

  /** Snapshot of the purchase line's landed unit cost at confirm time. */
  @Prop({ type: Number, required: false, min: 0 })
  unitCost?: number;

  /** PUR-08: base quantity already sent back to the supplier by confirmed purchase returns. */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyReturnedBase!: number;
}
export const InwardLineSchema = SchemaFactory.createForClass(InwardLine);

/**
 * INW-01 to INW-05. Confirming puts material into stock at `locationId` as new lots
 * carrying the purchase line's landed unit cost (BR-01, STK-01). Partial and multiple
 * inwards per purchase are allowed; over-receipt beyond a configurable tolerance is blocked
 * (checked in InwardsService, not here). A "direct" inward (goods arrived with no PO raised
 * first) still links to a purchase: InwardsService.createDirect raises a confirmed purchase
 * behind it, so INW-04 ("every inward links to its purchase line") always holds.
 */
@Schema({ collection: 'inwards', timestamps: true })
export class Inward extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Purchase', required: true, index: true })
  purchaseId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Supplier', required: true })
  supplierId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLocation', required: true })
  locationId!: Types.ObjectId;

  @Prop({ type: [InwardLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<InwardLine>;

  /** Supplier invoice reference quoted on the goods. */
  @Prop({ type: String, required: false })
  supplierRef?: string;

  /** Supplier's delivery challan number (entered by hand). */
  @Prop({ type: String, required: false, trim: true })
  challanNo?: string;

  /**
   * Lot number of this inward: the supplier's running series (e.g. "MAH-3"), suggested
   * automatically and editable. Every line's stock lot carries it unless the line overrides it.
   */
  @Prop({ type: String, required: false, trim: true, index: true })
  lotNo?: string;

  @Prop({ type: Boolean, required: true, default: false })
  isDirect!: boolean;

  @Prop({ type: String, required: false })
  remarks?: string;

  @Prop({ type: String, enum: INWARD_STATUSES, required: true, default: 'DRAFT' })
  status!: InwardStatus;
}

export type InwardDocument = Inward & Document;
export const InwardSchema = SchemaFactory.createForClass(Inward);
InwardSchema.plugin(auditPlugin, { module: 'purchasing', entityType: 'Inward' });

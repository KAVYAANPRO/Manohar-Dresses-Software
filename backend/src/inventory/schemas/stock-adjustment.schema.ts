import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const ADJUSTMENT_DIRECTIONS = ['IN', 'OUT'] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const ADJUSTMENT_STATUSES = ['PROPOSED', 'APPROVED', 'REJECTED'] as const;
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

/**
 * STK-05. Signed: `direction` says whether it adds or removes (prd.md A-01's fix for the
 * source PDF's formula only ever subtracting adjustments). Q7's default - "thresholds zero
 * (everything needs approval) until set" - is implemented as a mandatory two-step
 * propose-then-approve flow; nothing is posted to the ledger until approved
 * (StockAdjustmentsService.approve calls StockService.post there, not at propose time).
 */
@Schema({ collection: 'stock_adjustments', timestamps: true })
export class StockAdjustment extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLocation', required: true })
  locationId!: Types.ObjectId;

  @Prop({ type: String, enum: ADJUSTMENT_DIRECTIONS, required: true })
  direction!: AdjustmentDirection;

  /** Required for OUT (you are correcting a specific counted lot); ignored for IN, which always creates a new lot. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: false })
  lotId?: Types.ObjectId;

  /** Required for IN only - the cost basis of the newly discovered stock. */
  @Prop({ type: Number, required: false, min: 0 })
  unitCost?: number;

  @Prop({ type: Number, required: true, min: 0.001 })
  qty!: number;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: String, enum: ADJUSTMENT_STATUSES, required: true, default: 'PROPOSED' })
  status!: AdjustmentStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  approvedAt?: Date;
}

export type StockAdjustmentDocument = StockAdjustment & Document;
export const StockAdjustmentSchema = SchemaFactory.createForClass(StockAdjustment);
StockAdjustmentSchema.plugin(auditPlugin, { module: 'inventory', entityType: 'StockAdjustment' });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * DSN-06. Append-only: every rate change is a new row, never an edit. Design.defaultSellingRate
 * is a cache of the latest entry here, updated by DesignsService.setRate in the same call that
 * appends this row - the generic audit_log (via the Design schema's auditPlugin) already shows
 * old vs new `defaultSellingRate` for the "rate change" exit criterion, so this collection is
 * the durable per-rate timeline (TRC-02: "the design screen shows its history"), not the
 * primary compliance record.
 */
@Schema({ collection: 'design_rate_history', timestamps: { createdAt: true, updatedAt: false } })
export class DesignRateHistory {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Design', required: true, index: true })
  designId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  rate!: number;

  @Prop({ type: Date, required: true })
  effectiveFrom!: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
}

export type DesignRateHistoryDocument = DesignRateHistory & Document;
export const DesignRateHistorySchema = SchemaFactory.createForClass(DesignRateHistory);
DesignRateHistorySchema.index({ designId: 1, effectiveFrom: -1 });

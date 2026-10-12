import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * CST-08, tech.md §6.5. Append-only: a revaluation never touches ledger rows (their unit_cost
 * snapshots stay as posted); this is the historical record of every lot cost change from
 * provisional to final. No update/delete endpoint exists anywhere for this collection.
 */
@Schema({ collection: 'lot_revaluations', timestamps: { createdAt: true, updatedAt: false } })
export class LotRevaluation {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true, index: true })
  lotId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  oldCost!: number;

  @Prop({ type: Number, required: true, min: 0 })
  newCost!: number;

  @Prop({ type: String, required: false })
  reason?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: false })
  jobSlipId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
}

export type LotRevaluationDocument = LotRevaluation & Document;
export const LotRevaluationSchema = SchemaFactory.createForClass(LotRevaluation);

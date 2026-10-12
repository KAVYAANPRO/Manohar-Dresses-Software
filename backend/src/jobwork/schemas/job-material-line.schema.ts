import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * tech.md §5.7: the ledger's custody balance is per factory, not per job - a factory usually
 * holds material for several jobs at once. This is the per-job sub-ledger that costing and
 * reconciliation actually need. Invariant I-5: for every factory, the sum over its jobs of
 * (issued - returned - consumed - written_off) equals its custody balance in stock_balances.
 * Never written to directly by a controller - only MaterialIssuesService, MaterialReturnsService,
 * and JobReceiptsService touch it, always in the same transaction as the matching stock post.
 */
@Schema({ collection: 'job_material_lines', timestamps: true })
export class JobMaterialLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: true, index: true })
  jobSlipId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: true, index: true })
  jobWorkerId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: String, required: false })
  bomRole?: string;

  /** Lot cost at issue - snapshot, never recomputed (matches the ledger's own unit-cost snapshot). */
  @Prop({ type: Number, required: true, min: 0 })
  unitCost!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyIssued!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyReturned!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyConsumed!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  qtyWrittenOff!: number;
}

export type JobMaterialLineDocument = JobMaterialLine & Document;
export const JobMaterialLineSchema = SchemaFactory.createForClass(JobMaterialLine);
JobMaterialLineSchema.index({ jobSlipId: 1, lotId: 1 }, { unique: true });

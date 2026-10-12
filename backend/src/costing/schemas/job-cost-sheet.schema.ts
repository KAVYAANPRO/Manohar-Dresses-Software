import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export const COST_SHEET_STATUSES = ['PROVISIONAL', 'FINAL'] as const;
export type CostSheetStatus = (typeof COST_SHEET_STATUSES)[number];

@Schema({ _id: false })
export class JobCostLine {
  @Prop({ type: String, required: true })
  component!: string; // MATERIAL | PROCESSING | MANUFACTURING | OTHER

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;
}
export const JobCostLineSchema = SchemaFactory.createForClass(JobCostLine);

/**
 * CST-01, CST-04, CST-08. Recomputed and overwritten (idempotent upsert) every time
 * receipt/close changes the underlying job_material_lines/job_charges - this is a read
 * model over those, not an independent source of truth, so there is nothing to keep
 * append-only here (contrast with lot_revaluations below, which IS the historical record).
 */
@Schema({ collection: 'job_cost_sheets', timestamps: true })
export class JobCostSheet {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: true, unique: true, index: true })
  jobSlipId!: Types.ObjectId;

  @Prop({ type: [JobCostLineSchema], required: true, default: [] })
  lines!: JobCostLine[];

  @Prop({ type: Number, required: true, min: 0 })
  totalCost!: number;

  @Prop({ type: Number, required: true, min: 0 })
  acceptedQty!: number;

  @Prop({ type: Number, required: false, min: 0 })
  unitCost?: number;

  @Prop({ type: String, enum: COST_SHEET_STATUSES, required: true, default: 'PROVISIONAL' })
  status!: CostSheetStatus;

  /** CST-08: variance on stock already sold, reported rather than restating a posted invoice. Wired up in Phase 6. */
  @Prop({ type: Number, required: false, default: 0 })
  varianceOnSold?: number;
}

export type JobCostSheetDocument = JobCostSheet & Document;
export const JobCostSheetSchema = SchemaFactory.createForClass(JobCostSheet);

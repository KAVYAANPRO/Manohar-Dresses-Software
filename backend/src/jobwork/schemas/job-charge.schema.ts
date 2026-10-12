import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export const JOB_CHARGE_KINDS = ['PROCESSING', 'MANUFACTURING', 'OTHER'] as const;
export type JobChargeKind = (typeof JOB_CHARGE_KINDS)[number];

/**
 * BR-13: each charge is entered once, on exactly one document type. Written only by
 * JobReceiptsService when a receipt is confirmed, from the job slip's agreed basis/rate -
 * nothing else in this codebase creates a row here. tech.md §6.1: "the only place a charge
 * lives" (costing, Phase 5, reads charges from this table and nowhere else).
 */
@Schema({ collection: 'job_charges', timestamps: { createdAt: true, updatedAt: false } })
export class JobCharge {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: true, index: true })
  jobSlipId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobReceipt', required: true })
  receiptId!: Types.ObjectId;

  @Prop({ type: String, enum: JOB_CHARGE_KINDS, required: true })
  kind!: JobChargeKind;

  @Prop({ type: String, required: true })
  basis!: string; // PER_PIECE | PER_METER | LUMP_SUM, copied from the job slip at the time

  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  @Prop({ type: Number, required: true, min: 0 })
  rate!: number;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  @Prop({ type: String, required: false })
  note?: string;

  createdAt?: Date;
}

export type JobChargeDocument = JobCharge & Document;
export const JobChargeSchema = SchemaFactory.createForClass(JobCharge);

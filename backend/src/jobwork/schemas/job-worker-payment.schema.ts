import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const JOB_WORKER_PAYMENT_KINDS = ['ADVANCE', 'PAYMENT'] as const;
export type JobWorkerPaymentKind = (typeof JOB_WORKER_PAYMENT_KINDS)[number];

export const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const JOB_WORKER_PAYMENT_STATUSES = ['POSTED', 'CANCELLED'] as const;
export type JobWorkerPaymentStatus = (typeof JOB_WORKER_PAYMENT_STATUSES)[number];

/**
 * Karigar khata book (JOB-15 + the payable side flagged in A-26): money handed to a factory or
 * artisan, either as an ADVANCE (before the work is received) or a PAYMENT (against charges
 * already earned). The earned side is never stored here - it is read from `job_charges`, the
 * only place a job-work charge lives (BR-13). A posted entry is never edited or deleted; a
 * mistake is corrected by cancelling it with a reason (it then drops out of the balance but
 * stays visible in the audit trail).
 */
@Schema({ collection: 'job_worker_payments', timestamps: true })
export class JobWorkerPayment extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: true, index: true })
  jobWorkerId!: Types.ObjectId;

  @Prop({ type: String, enum: JOB_WORKER_PAYMENT_KINDS, required: true })
  kind!: JobWorkerPaymentKind;

  @Prop({ type: Number, required: true, min: 0.01 })
  amount!: number;

  @Prop({ type: String, enum: PAYMENT_MODES, required: true, default: 'CASH' })
  mode!: PaymentMode;

  /** UPI ref / cheque no. / bank UTR. */
  @Prop({ type: String, required: false, trim: true })
  reference?: string;

  /** Optional: the job slip this advance/payment is for (must belong to the same party). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: false })
  jobSlipId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  notes?: string;

  @Prop({ type: String, enum: JOB_WORKER_PAYMENT_STATUSES, required: true, default: 'POSTED' })
  status!: JobWorkerPaymentStatus;
}

export type JobWorkerPaymentDocument = JobWorkerPayment & Document;
export const JobWorkerPaymentSchema = SchemaFactory.createForClass(JobWorkerPayment);
JobWorkerPaymentSchema.index({ jobWorkerId: 1, docDate: 1 });
JobWorkerPaymentSchema.plugin(auditPlugin, { module: 'jobwork', entityType: 'JobWorkerPayment' });

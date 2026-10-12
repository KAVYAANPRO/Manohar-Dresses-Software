import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const JOB_RECEIPT_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type JobReceiptStatus = (typeof JOB_RECEIPT_STATUSES)[number];

/**
 * JOB-08/JOB-09. One shape covers both job types (tech.md's job_receipt_lines):
 * MANUFACTURING populates colourId/sizeId + accepted/rejected/damaged; PROCESSING populates
 * materialVariantId (the output) and only receivedQtyBase (accepted === received - there is
 * no reject/damage split for a processing conversion).
 */
@Schema({ _id: true })
export class JobReceiptLine {
  _id!: Types.ObjectId;

  // MANUFACTURING
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Colour', required: false })
  colourId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Size', required: false })
  sizeId?: Types.ObjectId;

  // PROCESSING
  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: false })
  materialVariantId?: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  expectedQty!: number;

  @Prop({ type: Number, required: true, min: 0 })
  receivedQty!: number;

  @Prop({ type: Number, required: false, min: 0 })
  acceptedQty?: number;

  @Prop({ type: Number, required: false, min: 0, default: 0 })
  rejectedQty?: number;

  @Prop({ type: Number, required: false, min: 0, default: 0 })
  damagedQty?: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: false })
  createdLotId?: Types.ObjectId;
}
export const JobReceiptLineSchema = SchemaFactory.createForClass(JobReceiptLine);

@Schema({ collection: 'job_receipts', timestamps: true })
export class JobReceipt extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: true, index: true })
  jobSlipId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: true, index: true })
  jobWorkerId!: Types.ObjectId;

  @Prop({ type: [JobReceiptLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<JobReceiptLine>;

  @Prop({ type: Number, required: false, min: 0 })
  otherCharges?: number;

  /**
   * JOB-09 "manufacturing charges" on the receipt. Omitted = agreed basis x rate from the job
   * slip (the default, tech.md §6.1). Set only by a user holding receipt.charges.edit; it is
   * still written to job_charges exactly once at confirm (BR-13).
   */
  @Prop({ type: Number, required: false, min: 0 })
  chargeOverride?: number;

  @Prop({ type: String, required: false })
  remarks?: string;

  /** Over-receipt accepted with a reason, etc. - shown on the receipt, never silently dropped. */
  @Prop({ type: [String], default: [] })
  warnings!: string[];

  /** SHR-01 (processing jobs only), fixed at confirm: sent = custody converted by this receipt. */
  @Prop({
    type: {
      sentQty: Number,
      receivedQty: Number,
      shortageQty: Number,
      shortagePct: Number,
    },
    required: false,
    _id: false,
  })
  processingSummary?: {
    sentQty: number;
    receivedQty: number;
    shortageQty: number;
    shortagePct: number;
  };

  @Prop({ type: String, required: false })
  shortageReason?: string;

  @Prop({ type: String, enum: JOB_RECEIPT_STATUSES, required: true, default: 'DRAFT' })
  status!: JobReceiptStatus;
}

export type JobReceiptDocument = JobReceipt & Document;
export const JobReceiptSchema = SchemaFactory.createForClass(JobReceipt);
JobReceiptSchema.plugin(auditPlugin, { module: 'jobwork', entityType: 'JobReceipt' });

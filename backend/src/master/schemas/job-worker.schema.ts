import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * MST-07. tech.md's "party" (job_workers, `type` FACTORY or ARTISAN) - the entity every
 * party-scoped isolation rule in the system keys off (BR-08). One party may have several user
 * logins (prd.md §2.3: "unique account" is read as unique per user, not per party).
 */
@Schema({ collection: 'job_workers', timestamps: true })
export class JobWorker extends BaseMasterFields {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: ['FACTORY', 'ARTISAN'], required: true })
  type!: 'FACTORY' | 'ARTISAN';

  @Prop({ type: String, required: false })
  contactPerson?: string;

  /** What work this party takes up (Cutting, Stitching, Dyeing, ...). Free text shown on the karigar/factory screens. */
  @Prop({ type: String, required: false, trim: true })
  specialty?: string;

  @Prop({ type: String, required: false, index: true })
  mobile?: string;

  @Prop({ type: String, required: false })
  email?: string;

  @Prop({ type: String, required: false })
  address?: string;

  /** DOC-01/A-19: a delivery challan for goods sent to a job worker needs both parties' GSTIN (CGST Rule 55). */
  @Prop({ type: String, required: false, uppercase: true, trim: true })
  gstin?: string;

  @Prop({ type: String, required: false })
  notes?: string;

  /** Created automatically alongside the party (MST-06); set once, by the service layer. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLocation', required: false })
  custodyLocationId?: Types.ObjectId;
}

export type JobWorkerDocument = JobWorker & Document;
export const JobWorkerSchema = SchemaFactory.createForClass(JobWorker);
JobWorkerSchema.index({ name: 1 });
JobWorkerSchema.plugin(auditPlugin, { module: 'master', entityType: 'JobWorker' });

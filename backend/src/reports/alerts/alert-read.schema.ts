import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * Per-user "I have seen this alert" marker (ALT-01, in-app). Alerts themselves are computed on
 * read from live data, so only the read state is stored. The key includes a fingerprint of the
 * alert's state (e.g. the on-hand qty), so a materially changed alert shows as unread again.
 */
@Schema({ collection: 'alert_reads', timestamps: { createdAt: 'readAt', updatedAt: false } })
export class AlertRead {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  alertKey!: string;

  readAt?: Date;
}

export type AlertReadDocument = AlertRead & Document;
export const AlertReadSchema = SchemaFactory.createForClass(AlertRead);
AlertReadSchema.index({ userId: 1, alertKey: 1 }, { unique: true });

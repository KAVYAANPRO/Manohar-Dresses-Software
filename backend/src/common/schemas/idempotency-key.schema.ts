import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Exactly-once command execution for retried requests (tech.md §4.4 / §10.2). A retry with
 * the same key and the same body returns the original response; the same key with a
 * different body is rejected. Entries expire 48h after creation via the TTL index, which
 * replaces the separate `idempotency-purge` cron job tech.md schedules for Postgres.
 */
@Schema({ collection: 'idempotency_keys', timestamps: { createdAt: true, updatedAt: false } })
export class IdempotencyKeyRecord {
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  endpoint!: string;

  @Prop({ type: String, required: true })
  requestHash!: string;

  @Prop({ type: Number, required: false })
  responseStatus?: number;

  @Prop({ type: Object, required: false })
  responseBody?: unknown;

  createdAt?: Date;
}

export type IdempotencyKeyDocument = IdempotencyKeyRecord & Document;
export const IdempotencyKeySchema = SchemaFactory.createForClass(IdempotencyKeyRecord);
IdempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
IdempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 48 * 60 * 60 });

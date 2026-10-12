import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DEACTIVATE' | string;

/**
 * Append-only audit log (AUD-01). In tech.md this is written by Postgres triggers so no code
 * path can forget; Mongo has no triggers, so the Mongoose `auditPlugin` (common/plugins) is
 * attached to every business schema instead and calls into this collection. There is no
 * update/delete endpoint anywhere in this codebase for this collection - see AuditLogModule.
 */
@Schema({ collection: 'audit_log', timestamps: { createdAt: 'occurredAt', updatedAt: false } })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  actorUserId?: Types.ObjectId | null;

  @Prop({ type: String, required: false })
  requestId?: string | null;

  @Prop({ type: String, required: true, index: true })
  module!: string;

  @Prop({ type: String, required: true })
  action!: AuditAction;

  @Prop({ type: String, required: true, index: true })
  entityType!: string;

  @Prop({ type: String, required: true, index: true })
  entityId!: string;

  @Prop({ type: Object, required: false })
  before?: Record<string, unknown> | null;

  @Prop({ type: Object, required: false })
  after?: Record<string, unknown> | null;

  occurredAt?: Date;
}

export type AuditLogDocument = AuditLog & Document;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ entityType: 1, entityId: 1, occurredAt: -1 });
AuditLogSchema.index({ actorUserId: 1, occurredAt: -1 });

/**
 * Application-level stand-in for tech.md's `forbid_mutation()` trigger + REVOKE (§4.3): there
 * is no database-enforced immutability in Mongo, so every mutating query method is blocked
 * here. This is weaker than a DB-level REVOKE (a raw driver call bypasses Mongoose middleware)
 * but it stops every path this codebase actually uses, including a future mistake.
 */
function forbidMutation() {
  throw new Error('audit_log is append-only: update and delete are not permitted.');
}
for (const method of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
]) {
  AuditLogSchema.pre(method as any, function () {
    forbidMutation();
  });
}
for (const method of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
  AuditLogSchema.pre(method as any, function () {
    forbidMutation();
  });
}

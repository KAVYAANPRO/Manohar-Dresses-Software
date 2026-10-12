import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * Server-side session (T-07, AUTH-02). Only the SHA-256 hash of the 256-bit random token is
 * stored; the raw token lives solely in the HttpOnly cookie. Revocation (admin force-logout,
 * logout, password change) is a field update here, which every request re-checks - unlike a
 * stateless JWT, a revoked session stops working immediately.
 */
@Schema({ collection: 'sessions', timestamps: { createdAt: true, updatedAt: false } })
export class Session {
  @Prop({ type: String, required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt!: Date;

  @Prop({ type: Date, required: false })
  revokedAt?: Date | null;

  @Prop({ type: String, required: false })
  revokedReason?: string;

  @Prop({ type: String, required: false })
  ip?: string;

  @Prop({ type: String, required: false })
  userAgent?: string;

  createdAt?: Date;
}

export type SessionDocument = Session & Document;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ userId: 1, revokedAt: 1 });
// TTL cleanup: Mongo removes the document itself shortly after expiresAt passes
// (session-cleanup job in tech.md §11 becomes unnecessary for this collection).
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

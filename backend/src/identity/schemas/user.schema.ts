import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';
import { Principal } from '../../common/context/request-context';

@Schema({ _id: false })
export class PermissionOverrides {
  @Prop({ type: [String], default: [] })
  allow!: string[];

  @Prop({ type: [String], default: [] })
  deny!: string[];
}

/**
 * A user account (AUTH-03). `principal` distinguishes internal staff from external
 * factory/artisan logins (tech.md's "party" concept, prd.md §2.1); `jobWorkerId` is required
 * exactly when principal = 'party' (enforced in UsersService, since Mongo has no CHECK
 * constraint to fall back on - see stock_locations' CHECK in tech.md §4.3 for the Postgres
 * equivalent this replaces).
 *
 * "Each factory/artisan will have a unique account" is read as *unique per user*, all
 * pointing at one jobWorkerId (prd.md §2.2) - many users may share one jobWorkerId.
 */
@Schema({ collection: 'users', timestamps: true })
export class User extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, index: true, lowercase: true, trim: true })
  username!: string;

  @Prop({ type: String, required: false })
  displayName?: string;

  @Prop({ type: String, required: false })
  email?: string;

  @Prop({ type: String, required: false, index: true, sparse: true })
  mobile?: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, enum: ['internal', 'party'], required: true, default: 'internal' })
  principal!: Principal;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: false, index: true })
  jobWorkerId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  roleKeys!: string[];

  @Prop({ type: PermissionOverrides, default: () => ({ allow: [], deny: [] }) })
  permissionOverrides!: PermissionOverrides;

  @Prop({ type: Date, required: false })
  passwordChangedAt?: Date;

  @Prop({ type: Boolean, default: false })
  mustChangePassword!: boolean;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ principal: 1, jobWorkerId: 1 });
// passwordHash must never appear in an audit trail image.
UserSchema.plugin(auditPlugin, {
  module: 'identity',
  entityType: 'User',
  redact: ['passwordHash'],
});

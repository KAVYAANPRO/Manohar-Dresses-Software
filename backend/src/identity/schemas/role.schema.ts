import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * A role is a bundle of permission keys (AUTH-04). `permissions: ['*']` is the Super Admin
 * escape hatch, interpreted by PermissionsGuard as "every permission" rather than requiring
 * every key to be listed and kept in sync by hand.
 */
@Schema({ collection: 'roles', timestamps: true })
export class Role extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, index: true })
  key!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({ type: Boolean, default: false })
  isSystemRole!: boolean;
}

export type RoleDocument = Role & Document;
export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.plugin(auditPlugin, { module: 'identity', entityType: 'Role' });

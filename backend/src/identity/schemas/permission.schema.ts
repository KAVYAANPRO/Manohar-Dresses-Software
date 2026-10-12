import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Reference rows for the catalogue in permissions.catalogue.ts, so /permissions can list them. */
@Schema({ collection: 'permissions', timestamps: true })
export class Permission {
  @Prop({ type: String, required: true, unique: true, index: true })
  key!: string;

  @Prop({ type: String, required: true })
  module!: string;

  @Prop({ type: String, required: false })
  description?: string;
}

export type PermissionDocument = Permission & Document;
export const PermissionSchema = SchemaFactory.createForClass(Permission);

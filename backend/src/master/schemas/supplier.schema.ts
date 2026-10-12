import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/** MST-01. Field list is ADD (tech.md: "§38 lists the entity but no fields"). */
@Schema({ collection: 'suppliers', timestamps: true })
export class Supplier extends BaseMasterFields {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: false })
  contactPerson?: string;

  @Prop({ type: String, required: false })
  mobile?: string;

  @Prop({ type: String, required: false })
  email?: string;

  @Prop({ type: String, required: false, uppercase: true, trim: true })
  gstin?: string;

  @Prop({ type: String, required: false })
  address?: string;

  @Prop({ type: String, required: false })
  paymentTerms?: string;
}

export type SupplierDocument = Supplier & Document;
export const SupplierSchema = SchemaFactory.createForClass(Supplier);
SupplierSchema.index({ name: 1 });
SupplierSchema.plugin(auditPlugin, { module: 'master', entityType: 'Supplier' });

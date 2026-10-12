import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * Sales agent / broker master. Customers link to an agent via `Customer.agentId`; sales orders
 * and invoices default their agent from the customer and snapshot `commissionPct` at confirm
 * time, so a later rate change never alters commission on an issued invoice.
 */
@Schema({ collection: 'sales_agents', timestamps: true })
export class SalesAgent extends BaseMasterFields {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: false, trim: true })
  agencyName?: string;

  @Prop({ type: String, required: true, trim: true })
  mobile!: string;

  @Prop({ type: String, required: false, trim: true })
  email?: string;

  @Prop({ type: String, required: false })
  city?: string;

  /** Commission on the invoice's taxable value (before GST). */
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  commissionPct!: number;

  @Prop({ type: String, required: false })
  notes?: string;
}

export type SalesAgentDocument = SalesAgent & Document;
export const SalesAgentSchema = SchemaFactory.createForClass(SalesAgent);
SalesAgentSchema.index({ name: 1 });
SalesAgentSchema.plugin(auditPlugin, { module: 'master', entityType: 'SalesAgent' });

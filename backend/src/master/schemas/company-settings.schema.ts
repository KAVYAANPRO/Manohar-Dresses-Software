import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';

/**
 * MST-10. Singleton document (`key: 'default'` is always used - see CompanySettingsService).
 * Single company, single legal entity, INR only, Indian financial year (prd.md §1.6).
 */
@Schema({ collection: 'company_settings', timestamps: true })
export class CompanySettings {
  @Prop({ type: String, required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ type: String, required: true })
  legalName!: string;

  @Prop({ type: String, required: true })
  state!: string;

  @Prop({ type: String, required: false })
  gstin?: string;

  @Prop({ type: String, required: false })
  address?: string;

  @Prop({ type: String, required: true })
  currentFinancialYear!: string; // e.g. '26-27'

  /** INW-01: over-receipt beyond this percentage of a purchase line's ordered qty is blocked. */
  @Prop({ type: Number, default: 0, min: 0 })
  overReceiptTolerancePct!: number;

  /**
   * SHR-03. A single global tolerance rather than tech.md's more granular per-material,
   * per-process-type, per-party tolerance - a documented simplification given the size of
   * Phase 4; revisit if the business needs different tolerances per factory or material.
   */
  @Prop({ type: Number, default: 0, min: 0 })
  shortageTolerancePct!: number;

  @Prop({ type: String, required: false })
  email?: string;

  @Prop({ type: String, required: false })
  phone?: string;

  /** Owner's WhatsApp number for R3 alert delivery (ALT-01); stored now so the profile is complete. */
  @Prop({ type: String, required: false })
  ownerWhatsapp?: string;

  /** MM-DD, e.g. '04-01' = 1 April (Indian financial year). */
  @Prop({ type: String, default: '04-01' })
  financialYearStart!: string;

  /** prd.md §6.3 alert thresholds ("N days"). Alerts are computed on read from these. */
  @Prop({ type: Number, default: 14, min: 1 })
  pendingJobAlertDays!: number;

  @Prop({ type: Number, default: 30, min: 1 })
  materialPendingAlertDays!: number;

  @Prop({ type: Number, default: 7, min: 1 })
  pendingInwardAlertDays!: number;

  @Prop({ type: Number, default: 7, min: 1 })
  pendingSalesOrderAlertDays!: number;

  /** Used when a customer's paymentTerms carries no number of days. */
  @Prop({ type: Number, default: 30, min: 0 })
  defaultPaymentTermsDays!: number;

  @Prop({ type: Number, default: 1 })
  version!: number;
}

export type CompanySettingsDocument = CompanySettings & Document;
export const CompanySettingsSchema = SchemaFactory.createForClass(CompanySettings);
CompanySettingsSchema.plugin(auditPlugin, { module: 'master', entityType: 'CompanySettings' });

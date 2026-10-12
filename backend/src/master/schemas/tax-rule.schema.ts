import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

/**
 * MST-10. Tax rates as data, never code (tech.md §8.1, prd.md §5.3/Appendix B): a rate is
 * looked up by HSN, the per-piece taxable value band, and the invoice date. `ratePct` is the
 * total GST rate; `computeInvoice` (sales module, Phase 6) splits it into CGST+SGST or IGST.
 */
@Schema({ collection: 'tax_rules', timestamps: true })
export class TaxRule extends BaseMasterFields {
  @Prop({ type: String, required: true, index: true })
  hsn!: string;

  @Prop({ type: Number, required: true, min: 0 })
  valueBandMin!: number;

  /** Exclusive upper bound; null means unbounded above. */
  @Prop({ type: Number, required: false })
  valueBandMax?: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  ratePct!: number;

  @Prop({ type: Date, required: true })
  validFrom!: Date;

  @Prop({ type: Date, required: false })
  validTo?: Date;

  @Prop({ type: String, required: false })
  notes?: string;
}

export type TaxRuleDocument = TaxRule & Document;
export const TaxRuleSchema = SchemaFactory.createForClass(TaxRule);
TaxRuleSchema.index({ hsn: 1, validFrom: -1 });
TaxRuleSchema.plugin(auditPlugin, { module: 'master', entityType: 'TaxRule' });

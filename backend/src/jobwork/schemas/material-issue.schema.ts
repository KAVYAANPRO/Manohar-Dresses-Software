import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const MATERIAL_ISSUE_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type MaterialIssueStatus = (typeof MATERIAL_ISSUE_STATUSES)[number];

@Schema({ _id: true })
export class MaterialIssueLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  materialVariantId!: Types.ObjectId;

  @Prop({ type: String, required: false })
  bomRole?: string;

  @Prop({ type: Number, required: true, min: 0.001 })
  qtyBase!: number;

  /** Omit to FIFO-allocate (STK-07 default); a user with stock.lot.pick may name one explicitly. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: false })
  lotId?: Types.ObjectId;
}
export const MaterialIssueLineSchema = SchemaFactory.createForClass(MaterialIssueLine);

/**
 * JOB-04. Confirming reduces warehouse stock and creates custody stock (BR-02); blocked if
 * insufficient (STK-06). Multiple issues per job slip are allowed. Acknowledgement (JOB-06) is
 * recorded here rather than a separate collection - it has no stock effect (BR-14).
 */
@Schema({ collection: 'material_issues', timestamps: true })
export class MaterialIssue extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: true, index: true })
  jobSlipId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: true, index: true })
  jobWorkerId!: Types.ObjectId;

  @Prop({ type: [MaterialIssueLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<MaterialIssueLine>;

  @Prop({ type: String, required: false })
  notes?: string;

  @Prop({ type: String, enum: MATERIAL_ISSUE_STATUSES, required: true, default: 'DRAFT' })
  status!: MaterialIssueStatus;

  @Prop({ type: Date, required: false })
  acknowledgedAt?: Date;

  @Prop({ type: String, required: false })
  discrepancyNote?: string;
}

export type MaterialIssueDocument = MaterialIssue & Document;
export const MaterialIssueSchema = SchemaFactory.createForClass(MaterialIssue);
MaterialIssueSchema.plugin(auditPlugin, { module: 'jobwork', entityType: 'MaterialIssue' });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const MATERIAL_RETURN_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type MaterialReturnStatus = (typeof MATERIAL_RETURN_STATUSES)[number];

@Schema({ _id: true })
export class MaterialReturnLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  materialVariantId!: Types.ObjectId;

  /** Required: a return must name the lot it is putting back (JOB-07 - "in its original lot"). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  qtyBase!: number;
}
export const MaterialReturnLineSchema = SchemaFactory.createForClass(MaterialReturnLine);

/** JOB-07. Unused or rejected input material returned from the factory, back into its original lot. */
@Schema({ collection: 'material_returns', timestamps: true })
export class MaterialReturn extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: true, index: true })
  jobSlipId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: true, index: true })
  jobWorkerId!: Types.ObjectId;

  @Prop({ type: [MaterialReturnLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<MaterialReturnLine>;

  @Prop({ type: String, required: false })
  notes?: string;

  @Prop({ type: String, enum: MATERIAL_RETURN_STATUSES, required: true, default: 'DRAFT' })
  status!: MaterialReturnStatus;
}

export type MaterialReturnDocument = MaterialReturn & Document;
export const MaterialReturnSchema = SchemaFactory.createForClass(MaterialReturn);
MaterialReturnSchema.plugin(auditPlugin, { module: 'jobwork', entityType: 'MaterialReturn' });

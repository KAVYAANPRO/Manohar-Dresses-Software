import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const PRODUCTION_ORDER_STATUSES = ['PLANNED', 'CANCELLED'] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];

@Schema({ _id: true })
export class ProductionOrderQuantityLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Colour', required: true })
  colourId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Size', required: true })
  sizeId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  qty!: number;
}
export const ProductionOrderQuantityLineSchema = SchemaFactory.createForClass(
  ProductionOrderQuantityLine,
);

@Schema({ _id: true })
export class ProductionOrderRequirementLine {
  _id!: Types.ObjectId;

  @Prop({ type: String, required: true })
  role!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  materialVariantId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  qtyPerGarmentBase!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  allowancePct!: number;

  @Prop({ type: Number, required: true, min: 0 })
  requiredQtyBase!: number;
}
export const ProductionOrderRequirementLineSchema = SchemaFactory.createForClass(
  ProductionOrderRequirementLine,
);

/**
 * JOB-01. "The PDF uses this at §48 step 7 but omits the entity from §38" (tech.md). The BOM
 * version is snapshotted at creation (`bomVersionId` + the frozen `requirements` lines), so a
 * later BOM edit (DSN-04) can never change the arithmetic of a plan already in flight - this
 * is exactly the guarantee tech.md §7.4 relies on for job-slip consumption math in Phase 4.
 */
@Schema({ collection: 'production_orders', timestamps: true })
export class ProductionOrder extends BaseDocumentFields {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Design', required: true, index: true })
  designId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DesignBomVersion', required: true })
  bomVersionId!: Types.ObjectId;

  @Prop({ type: [ProductionOrderQuantityLineSchema], required: true, default: [] })
  quantities!: Types.DocumentArray<ProductionOrderQuantityLine>;

  @Prop({ type: Number, required: true, min: 1 })
  totalGarments!: number;

  @Prop({ type: [ProductionOrderRequirementLineSchema], required: true, default: [] })
  requirements!: Types.DocumentArray<ProductionOrderRequirementLine>;

  @Prop({ type: Date, required: false })
  plannedStartDate?: Date;

  @Prop({ type: Date, required: false })
  plannedEndDate?: Date;

  @Prop({ type: String, required: false })
  notes?: string;

  @Prop({ type: String, enum: PRODUCTION_ORDER_STATUSES, required: true, default: 'PLANNED' })
  status!: ProductionOrderStatus;
}

export type ProductionOrderDocument = ProductionOrder & Document;
export const ProductionOrderSchema = SchemaFactory.createForClass(ProductionOrder);
ProductionOrderSchema.plugin(auditPlugin, { module: 'jobwork', entityType: 'ProductionOrder' });

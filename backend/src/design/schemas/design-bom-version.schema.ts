import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';

@Schema({ _id: true })
export class DesignBomLine {
  _id!: Types.ObjectId;

  /** Free text by design (tech.md §4.6: "Do not hard-code three fabric columns") - e.g. Top, Bottom, Dupatta, Lining, Trim. */
  @Prop({ type: String, required: true })
  role!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  materialVariantId!: Types.ObjectId;

  /** Already in the material's base unit (MST-04) - no UoM conversion needed at requirement time. */
  @Prop({ type: Number, required: true, min: 0 })
  qtyPerGarmentBase!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  allowancePct!: number;
}
export const DesignBomLineSchema = SchemaFactory.createForClass(DesignBomLine);

/**
 * DSN-03/DSN-04. Editing a BOM creates a new version rather than mutating the old one - a
 * production order snapshots the line values at creation (ProductionOrdersService.create),
 * so history and costing never shift under it even if the BOM is edited afterwards. Only one
 * version per design is `isActive` at a time; versions are never deleted.
 */
@Schema({ collection: 'design_bom_versions', timestamps: { createdAt: true, updatedAt: false } })
export class DesignBomVersion {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Design', required: true, index: true })
  designId!: Types.ObjectId;

  @Prop({ type: Number, required: true })
  versionNo!: number;

  @Prop({ type: [DesignBomLineSchema], required: true, default: [] })
  lines!: Types.DocumentArray<DesignBomLine>;

  @Prop({ type: Boolean, required: true, default: true })
  isActive!: boolean;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
}

export type DesignBomVersionDocument = DesignBomVersion & Document;
export const DesignBomVersionSchema = SchemaFactory.createForClass(DesignBomVersion);
DesignBomVersionSchema.index({ designId: 1, versionNo: 1 }, { unique: true });
DesignBomVersionSchema.plugin(auditPlugin, { module: 'design', entityType: 'DesignBomVersion' });

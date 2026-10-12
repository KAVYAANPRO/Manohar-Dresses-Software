import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseMasterFields } from '../../common/schemas/base.schema';

export const LOCATION_KINDS = [
  'WAREHOUSE',
  'FACTORY_CUSTODY',
  'QUARANTINE',
  /** Company-owned goods lying with a customer on approval/consignment (delivery challans). */
  'CUSTOMER_CONSIGNMENT',
  'VIRTUAL_SUPPLIER',
  'VIRTUAL_CUSTOMER',
  'VIRTUAL_PRODUCTION',
  'VIRTUAL_LOSS',
  'VIRTUAL_ADJUSTMENT',
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/**
 * MST-06. Schema carries location from R1 even though multi-warehouse screens are R2, so nothing
 * downstream has to be rewritten later (tech.md A-08). A default Main Warehouse and a
 * Quarantine location are created by the seed script; a FACTORY_CUSTODY location is created
 * automatically per job worker (JobWorkersService.create).
 */
@Schema({ collection: 'stock_locations', timestamps: true })
export class StockLocation extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, index: true })
  code!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, enum: LOCATION_KINDS, required: true })
  kind!: LocationKind;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: false, index: true })
  jobWorkerId?: Types.ObjectId;
}

export type StockLocationDocument = StockLocation & Document;
export const StockLocationSchema = SchemaFactory.createForClass(StockLocation);
StockLocationSchema.plugin(auditPlugin, { module: 'master', entityType: 'StockLocation' });

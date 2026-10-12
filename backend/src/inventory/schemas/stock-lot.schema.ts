import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';

// tech.md §4.3 lists OPENING/INWARD/PROCESS_OUTPUT/PRODUCTION_RECEIPT; ADJUSTMENT is added here
// because a surplus found by a stock count (STK-05, ADJUSTMENT_IN) also creates a brand-new
// lot and needs its own origin label rather than being mislabelled as OPENING.
export const LOT_ORIGIN_TYPES = [
  'OPENING',
  'INWARD',
  'PROCESS_OUTPUT',
  'PRODUCTION_RECEIPT',
  'ADJUSTMENT',
] as const;
export type LotOriginType = (typeof LOT_ORIGIN_TYPES)[number];

/**
 * tech.md §4.3: "A lot is a traceable batch of one item with one unit cost." `unitCost` is
 * the lot's CURRENT cost - history of any revaluation (Phase 5, costing) lives in a separate
 * append-only `lot_revaluations` collection, not here. Lots themselves are never deleted;
 * there is no deactivate/reactivate because a lot with any ledger history is a permanent
 * record (STK-07, TRC-03).
 */
@Schema({ collection: 'stock_lots', timestamps: true })
export class StockLot {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true, index: true })
  stockItemId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  lotNo!: string;

  /** Garment parts this (processed) fabric is meant for, e.g. ["DUPATTA"] - shown when picking it for a making job. */
  @Prop({ type: [String], default: undefined })
  partLabels?: string[];

  /** For processed fabric: the lot it was processed (dyed) from. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: false })
  processedFromLotId?: Types.ObjectId;

  /** Rolls (thans) this lot arrived as, in base units each (inward detail; quantities live in the ledger). */
  @Prop({ type: [Number], default: undefined })
  thans?: number[];

  @Prop({ type: Date, required: true })
  receivedOn!: Date;

  @Prop({ type: Number, required: true, min: 0 })
  unitCost!: number;

  @Prop({ type: String, enum: LOT_ORIGIN_TYPES, required: true })
  originDocType!: LotOriginType;

  @Prop({ type: SchemaTypes.ObjectId, required: false })
  originDocId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Supplier', required: false })
  supplierId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: false })
  originJobSlipId?: Types.ObjectId;

  @Prop({ type: Number, default: 1 })
  version!: number;
}

export type StockLotDocument = StockLot & Document;
export const StockLotSchema = SchemaFactory.createForClass(StockLot);
StockLotSchema.index({ stockItemId: 1, lotNo: 1 }, { unique: true });
StockLotSchema.plugin(auditPlugin, { module: 'inventory', entityType: 'StockLot' });

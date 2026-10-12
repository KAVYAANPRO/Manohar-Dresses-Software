import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { auditPlugin } from '../../common/plugins/audit.plugin';
import { BaseDocumentFields } from '../../common/schemas/base.schema';

export const JOB_TYPES = ['PROCESSING', 'MANUFACTURING'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const CHARGE_BASES = ['PER_PIECE', 'PER_METER', 'LUMP_SUM'] as const;
export type ChargeBasis = (typeof CHARGE_BASES)[number];

/** tech.md §7.2. Mirrored by JobSlipsService's transition map and tested for every (from, to) pair. */
export const JOB_SLIP_STATUSES = [
  'CREATED',
  'MATERIAL_ISSUED',
  'IN_PROCESS',
  'READY',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
] as const;
export type JobSlipStatus = (typeof JOB_SLIP_STATUSES)[number];

@Schema({ _id: true })
export class JobSlipExpectedOutputLine {
  _id!: Types.ObjectId;

  /** MANUFACTURING: the design variant being made. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Colour', required: false })
  colourId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Size', required: false })
  sizeId?: Types.ObjectId;

  /** PROCESSING: the output material variant (e.g. Printed Fabric - Blue). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: false })
  materialVariantId?: Types.ObjectId;

  /** Pieces for MANUFACTURING, base-unit quantity for PROCESSING. */
  @Prop({ type: Number, required: true, min: 0 })
  expectedQty!: number;
}
export const JobSlipExpectedOutputLineSchema =
  SchemaFactory.createForClass(JobSlipExpectedOutputLine);

/** JOB-14/BR-14: a factory's claim, not stock - only an internal-confirmed JobReceipt ever posts to the ledger. */
@Schema({ _id: false })
export class DispatchDeclaration {
  @Prop({ type: Number, required: true, min: 0 })
  qty!: number;

  @Prop({ type: String, required: false })
  note?: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  declaredAt!: Date;
}
export const DispatchDeclarationSchema = SchemaFactory.createForClass(DispatchDeclaration);

/**
 * JOB-02/JOB-03. One job slip = one party and one design (prd.md §4.7). Charge basis and
 * agreed rate are the PLAN; the ACTUAL charge is only ever written once, to `job_charges`,
 * when a receipt is confirmed (BR-13) - never here.
 */
/** One line of a making job slip: part x colour lot, metres given, average per piece, pieces expected. */
@Schema({ _id: false })
export class MakingPlanLine {
  @Prop({ type: String, required: true })
  part!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: String, required: false })
  lotNo?: string;

  @Prop({ type: String, required: false })
  colourName?: string;

  @Prop({ type: Number, required: true, min: 0 })
  qty!: number;

  /** Average metres this part needs per piece (e.g. 2.5). */
  @Prop({ type: Number, required: false, min: 0 })
  avgPerPiece?: number;

  /** floor(qty / avgPerPiece). */
  @Prop({ type: Number, required: false, min: 0 })
  expectedPieces?: number;

  /** Inner colour (e.g. a blue strip) of this part's main colour: the main colour's name / lot. */
  @Prop({ type: String, required: false })
  innerOfColour?: string;

  @Prop({ type: String, required: false })
  innerOfLotNo?: string;
}
export const MakingPlanLineSchema = SchemaFactory.createForClass(MakingPlanLine);

/** One than (roll) sent for processing: metres sent, and metres that came back (after shrinkage). */
@Schema({ _id: true })
export class ProcessingThan {
  _id!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0.001 })
  sent!: number;

  @Prop({ type: Number, required: false, min: 0 })
  received?: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobReceipt', required: false })
  receiptId?: Types.ObjectId;
}
export const ProcessingThanSchema = SchemaFactory.createForClass(ProcessingThan);

/** One output colour of a processing (dyeing) job: which lot it is cut from and its thans. */
@Schema({ _id: true })
export class ProcessingLine {
  _id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockLot', required: true })
  lotId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  inputVariantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MaterialVariant', required: true })
  outputVariantId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  colourName!: string;

  /** Fabric cost per metre of the input lot when sent (landed cost from inward / earlier processing). */
  @Prop({ type: Number, required: true, min: 0 })
  inputCostPerMeter!: number;

  @Prop({ type: [ProcessingThanSchema], default: [] })
  thans!: Types.DocumentArray<ProcessingThan>;
}
export const ProcessingLineSchema = SchemaFactory.createForClass(ProcessingLine);

/**
 * Processing job sheet (owner's flow): parts (Top / Bottom / Dupatta) of a lot go to a processor
 * for e.g. dyeing in several colours, than by than; they come back to the office with shrinkage
 * and become new lots whose cost per metre = (fabric + spread expenses + processing charge) /
 * metres received.
 */
@Schema({ _id: false })
export class ProcessingInfo {
  /** e.g. "DYEING", "PRINTING" (free text, or the processing type's name). */
  @Prop({ type: String, required: true, trim: true })
  processName!: string;

  /** Garment parts this fabric is for: TOP / BOTTOM / DUPATTA. */
  @Prop({ type: [String], default: [] })
  parts!: string[];

  /** Processor's rate per metre (PER_METER, on metres sent) or the whole job (LUMP_SUM). */
  @Prop({ type: Number, required: true, min: 0 })
  rate!: number;

  @Prop({ type: String, enum: ['PER_METER', 'LUMP_SUM'], required: true, default: 'PER_METER' })
  rateBasis!: 'PER_METER' | 'LUMP_SUM';

  /** Travel / transport and other expenses for the whole job, spread per metre sent. */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  expenses!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  expensesPerMeter!: number;

  @Prop({ type: [ProcessingLineSchema], default: [] })
  lines!: Types.DocumentArray<ProcessingLine>;
}
export const ProcessingInfoSchema = SchemaFactory.createForClass(ProcessingInfo);

@Schema({ collection: 'job_slips', timestamps: true })
export class JobSlip extends BaseDocumentFields {
  @Prop({ type: String, enum: JOB_TYPES, required: true })
  jobType!: JobType;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobWorker', required: true, index: true })
  jobWorkerId!: Types.ObjectId;

  /**
   * Optional: a material-based job slip (the karigar makes their own design) has no design until
   * the finished goods come back and the design is chosen/created at receipt.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Design', required: false })
  designId?: Types.ObjectId;

  /** true = created from materials (Top/Bottom/Dupatta lines) rather than from a design's BOM. */
  @Prop({ type: Boolean, required: true, default: false })
  materialBased!: boolean;

  /** Hand-written challan number given with the goods. */
  @Prop({ type: String, required: false, trim: true })
  challanNo?: string;

  /**
   * Lot number: the karigar's running series (KAV-101 ...), suggested automatically and editable.
   * A dyeing job created for a part of this slip carries the same lot number (same lump).
   */
  @Prop({ type: String, required: false, trim: true, index: true })
  lotNo?: string;

  /**
   * For a processing (e.g. dyeing) job created for one part of a material-based slip: the slip the
   * processed output is forwarded to once it comes back, and which part it is (e.g. "DUPATTA").
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobSlip', required: false, index: true })
  parentJobSlipId?: Types.ObjectId;

  @Prop({ type: String, required: false, trim: true })
  partLabel?: string;

  /** Making job slip plan: what was given per part and colour, and the pieces expected from it. */
  @Prop({ type: [MakingPlanLineSchema], default: undefined })
  makingPlan?: MakingPlanLine[];

  /** Processing job sheet (colour lines, thans sent/received, rate, expenses) - see ProcessingInfo. */
  @Prop({ type: ProcessingInfoSchema, required: false })
  processing?: ProcessingInfo;

  /** Processed output already forwarded to the parent slip's karigar (base units). */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  forwardedQty!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProductionOrder', required: false })
  productionOrderId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ProcessingType', required: false })
  processingTypeId?: Types.ObjectId;

  @Prop({ type: [JobSlipExpectedOutputLineSchema], required: true, default: [] })
  expectedOutputLines!: Types.DocumentArray<JobSlipExpectedOutputLine>;

  @Prop({ type: Date, required: false })
  expectedCompletionDate?: Date;

  @Prop({ type: String, enum: CHARGE_BASES, required: true })
  chargeBasis!: ChargeBasis;

  @Prop({ type: Number, required: true, min: 0 })
  agreedRate!: number;

  @Prop({ type: String, required: false })
  instructions?: string;

  @Prop({ type: String, required: false })
  remarks?: string;

  @Prop({ type: String, enum: JOB_SLIP_STATUSES, required: true, default: 'CREATED' })
  status!: JobSlipStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  closedBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  closedAt?: Date;

  @Prop({ type: [DispatchDeclarationSchema], default: [] })
  dispatchDeclarations!: DispatchDeclaration[];
}

export type JobSlipDocument = JobSlip & Document;
export const JobSlipSchema = SchemaFactory.createForClass(JobSlip);
JobSlipSchema.plugin(auditPlugin, { module: 'jobwork', entityType: 'JobSlip' });

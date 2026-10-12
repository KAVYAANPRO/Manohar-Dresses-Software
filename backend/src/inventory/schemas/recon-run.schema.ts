import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** STK-10. A record of every reconciliation run - never "fixes" anything, only reports (tech.md §5.8). */
@Schema({ collection: 'recon_runs', timestamps: { createdAt: true, updatedAt: false } })
export class ReconRun {
  @Prop({ type: Boolean, required: true })
  clean!: boolean;

  @Prop({ type: Number, required: true })
  itemsChecked!: number;

  @Prop({ type: [Object], required: false })
  differences?: Array<Record<string, unknown>>;

  createdAt?: Date;
}

export type ReconRunDocument = ReconRun & Document;
export const ReconRunSchema = SchemaFactory.createForClass(ReconRun);

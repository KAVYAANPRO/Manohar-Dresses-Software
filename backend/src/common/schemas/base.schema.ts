import { Prop } from '@nestjs/mongoose';
import { Types, SchemaTypes } from 'mongoose';

/**
 * Common fields for master data (tech.md §4.1): soft deactivation only, optimistic
 * concurrency via `version`, and who/when for every write. Mongoose's `timestamps: true`
 * (set per-schema) supplies createdAt/updatedAt; the *By fields are set by the service layer
 * from the request context, since Mongo has no equivalent of a DEFAULT current_setting().
 */
export abstract class BaseMasterFields {
  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;

  @Prop({ type: Number, default: 1 })
  version!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  updatedBy?: Types.ObjectId;
}

/**
 * Common fields for document-like entities (purchases, job slips, invoices, ...): the
 * draft -> confirmed -> cancelled lifecycle tech.md §4.1 describes. Confirmed documents are
 * immutable apart from notes/attachments (BR-11); cancellation is a status change with a
 * reason, never a delete (BR-09).
 */
export abstract class BaseDocumentFields extends BaseMasterFields {
  @Prop({ type: String, required: true, unique: true, index: true })
  docNo!: string;

  @Prop({ type: Date, required: true })
  docDate!: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  confirmedBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  confirmedAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  cancelledBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  cancelledAt?: Date;

  @Prop({ type: String, required: false })
  cancelReason?: string;
}

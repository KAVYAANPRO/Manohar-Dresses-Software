import { Schema } from 'mongoose';
import { RequestContextStore } from '../context/request-context';

export interface AuditPluginOptions {
  module: string;
  entityType: string;
  /** Fields to strip from before/after images before they are stored (e.g. passwordHash). */
  redact?: string[];
}

function redactObject(obj: Record<string, unknown> | null, fields: string[] = []): any {
  if (!obj || fields.length === 0) return obj;
  const clone = { ...obj };
  for (const f of fields) delete clone[f];
  return clone;
}

/**
 * Attaches audit capture to a Mongoose schema so every INSERT/UPDATE is recorded without the
 * calling service having to remember (mirrors tech.md's Postgres trigger, §4.4/§9.5). This is
 * the closest Mongo equivalent available; unlike a DB trigger it can theoretically be bypassed
 * by a raw driver call, so services in this codebase MUST go through the Mongoose model.
 *
 * Model lookup deliberately goes through `doc.db.model('AuditLog')` / `this.model.db.model(...)`
 * - the CONNECTION the document/query actually belongs to - rather than the global
 * `mongoose.model('AuditLog')` registry. `@nestjs/mongoose` registers every schema on its own
 * `Connection` instance (via `MongooseModule.forRootAsync`), which is a different registry
 * from Mongoose's global default connection; the global lookup only happened to work in the
 * standalone seed script (which uses `mongoose.connect()` + `mongoose.model()` throughout) and
 * failed everywhere else with "Schema hasn't been registered for model AuditLog".
 */
export function auditPlugin(schema: Schema, opts: AuditPluginOptions) {
  schema.pre('save', async function (this: any, next) {
    this.$locals.__wasNew = this.isNew;
    // Direct property-assignment + save() is the majority write path in this codebase
    // (findOneAndUpdate is the minority) - without fetching the pre-save state here, every
    // save()-triggered audit row would report `before: null` even on a genuine field change,
    // which is exactly the "previous value" AUD-01 requires and silently wasn't there.
    if (!this.isNew) {
      try {
        this.$locals.__before = await this.constructor
          .findById(this._id)
          .session(this.$session() ?? null)
          .lean();
      } catch {
        this.$locals.__before = null;
      }
    }
    next();
  });

  schema.post('save', async function (this: any, doc: any) {
    const AuditLog = doc.db.model('AuditLog');
    const ctx = RequestContextStore.get();
    await AuditLog.create(
      [
        {
          actorUserId: ctx?.userId ?? null,
          requestId: ctx?.requestId ?? null,
          module: opts.module,
          action: this.$locals.__wasNew ? 'INSERT' : 'UPDATE',
          entityType: opts.entityType,
          entityId: String(doc._id),
          before: this.$locals.__wasNew ? null : redactObject(this.$locals.__before, opts.redact),
          after: redactObject(doc.toObject(), opts.redact),
        },
      ],
      { session: doc.$session() ?? undefined },
    );
  });

  schema.pre(['findOneAndUpdate', 'findOneAndReplace'], async function (this: any, next) {
    const before = await this.model
      .findOne(this.getQuery())
      .session(this.getOptions().session ?? null)
      .lean();
    (this as any).__auditBefore = before;
    next();
  });

  schema.post(['findOneAndUpdate', 'findOneAndReplace'], async function (this: any, doc: any) {
    if (!doc) return;
    const AuditLog = this.model.db.model('AuditLog');
    const ctx = RequestContextStore.get();
    const before = (this as any).__auditBefore;
    await AuditLog.create(
      [
        {
          actorUserId: ctx?.userId ?? null,
          requestId: ctx?.requestId ?? null,
          module: opts.module,
          action: 'UPDATE',
          entityType: opts.entityType,
          entityId: String(doc._id),
          before: redactObject(before, opts.redact),
          after: redactObject(doc.toObject ? doc.toObject() : doc, opts.redact),
        },
      ],
      { session: this.getOptions().session ?? undefined },
    );
  });
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditLogQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  module?: string;
  action?: string;
  q?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

/** Bookkeeping fields that change on every write and say nothing about the business change. */
const NOISE_FIELDS = new Set([
  '_id',
  '__v',
  'createdAt',
  'updatedAt',
  'version',
  'updatedBy',
  'createdBy',
  'passwordHash',
]);

const REF_FIELDS = [
  'docNo',
  'designNo',
  'lotNo',
  'designNameOrNumber',
  'username',
  'code',
  'name',
  'hsn',
  'key',
];

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function short(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 80 ? `${json.slice(0, 77)}...` : json;
  }
  const s = String(value);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

/** Top-level field diff between the before/after images (AUD-01 "previous value, new value"). */
export function diffImages(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditChange[] {
  if (!after) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  const changes: AuditChange[] = [];
  for (const k of keys) {
    if (NOISE_FIELDS.has(k)) continue;
    const b = before ? short(before[k]) : '';
    const a = short(after[k]);
    if (b !== a) changes.push({ field: k, before: b, after: a });
  }
  return changes;
}

/** A human label for what happened: Created / Confirmed / Cancelled / Deactivated / Edited... */
export function describeAction(
  action: string,
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
): string {
  if (action === 'INSERT') return 'Created';
  if (before && after) {
    if (before.status !== after.status && after.status) {
      const s = String(after.status).toUpperCase();
      if (s === 'CONFIRMED') return 'Confirmed';
      if (s === 'CANCELLED') return 'Cancelled';
      if (s === 'APPROVED') return 'Approved';
      if (s === 'REJECTED') return 'Rejected';
      if (s === 'CLOSED') return 'Closed';
      if (s === 'POSTED') return 'Posted';
      return `Status: ${after.status}`;
    }
    if (before.isActive === true && after.isActive === false) return 'Deactivated';
    if (before.isActive === false && after.isActive === true) return 'Reactivated';
  }
  if (action === 'UPDATE') return 'Edited';
  return action;
}

/** Read-only by design (AUD-02): there is no update or delete method anywhere in this class. */
@Injectable()
export class AuditLogService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  private async buildFilter(q: Omit<AuditLogQuery, 'page' | 'pageSize'>) {
    const filter: Record<string, unknown> = {};
    if (q.entityType) filter.entityType = q.entityType;
    if (q.entityId) filter.entityId = q.entityId;
    if (q.actorUserId && Types.ObjectId.isValid(q.actorUserId)) {
      filter.actorUserId = new Types.ObjectId(q.actorUserId);
    }
    if (q.module) filter.module = q.module;
    if (q.action) filter.action = q.action;
    if (q.from || q.to) {
      filter.occurredAt = {
        ...(q.from ? { $gte: q.from } : {}),
        ...(q.to ? { $lte: q.to } : {}),
      };
    }
    if (q.q && q.q.trim()) {
      const rx = new RegExp(escapeRegex(q.q.trim()), 'i');
      const users = await this.model.db
        .collection('users')
        .find({ $or: [{ username: rx }, { displayName: rx }] }, { projection: { _id: 1 } })
        .toArray();
      filter.$or = [
        { entityType: rx },
        { entityId: rx },
        ...REF_FIELDS.map((f) => ({ [`after.${f}`]: rx })),
        ...(users.length ? [{ actorUserId: { $in: users.map((u) => u._id) } }] : []),
      ];
    }
    return filter;
  }

  private async decorate(rows: any[]) {
    const actorIds = Array.from(
      new Set(rows.filter((r) => r.actorUserId).map((r) => String(r.actorUserId))),
    );
    const users = actorIds.length
      ? await this.model.db
          .collection('users')
          .find({ _id: { $in: actorIds.map((id) => new Types.ObjectId(id)) } })
          .project({ username: 1, displayName: 1 })
          .toArray()
      : [];
    const nameOf = new Map(users.map((u) => [String(u._id), u.displayName || u.username]));
    return rows.map((r) => {
      const image = (r.after ?? r.before ?? {}) as Record<string, unknown>;
      const refField = REF_FIELDS.find((f) => image[f] !== undefined && image[f] !== '');
      const changes = r.action === 'INSERT' ? [] : diffImages(r.before, r.after);
      return {
        ...r,
        actorName: r.actorUserId ? (nameOf.get(String(r.actorUserId)) ?? 'unknown user') : 'system',
        ref: refField ? String(image[refField]) : r.entityId,
        actionLabel: describeAction(r.action, r.before, r.after),
        changes,
      };
    });
  }

  async query(q: AuditLogQuery) {
    const filter = await this.buildFilter(q);
    const page = q.page && q.page > 0 ? q.page : 1;
    const pageSize = q.pageSize && q.pageSize > 0 && q.pageSize <= 200 ? q.pageSize : 50;

    const [items, total, modules] = await Promise.all([
      this.model
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.model.countDocuments(filter),
      this.model.distinct('module'),
    ]);

    return {
      items: await this.decorate(items),
      total,
      page,
      pageSize,
      modules: (modules as string[]).sort(),
    };
  }

  async forEntity(entityType: string, entityId: string) {
    return this.decorate(
      await this.model.find({ entityType, entityId }).sort({ occurredAt: -1 }).lean(),
    );
  }

  /** AUD-02/NFR-08: capped so a single export cannot page-scan the whole log. */
  async exportRows(q: Omit<AuditLogQuery, 'page' | 'pageSize'>) {
    const filter = await this.buildFilter(q);
    const rows = await this.decorate(
      await this.model.find(filter).sort({ occurredAt: -1 }).limit(10000).lean(),
    );
    return rows.map((r) => ({
      occurredAt: r.occurredAt,
      user: r.actorName,
      actorUserId: r.actorUserId ? String(r.actorUserId) : '',
      module: r.module,
      action: r.action,
      actionLabel: r.actionLabel,
      entityType: r.entityType,
      entityId: r.entityId,
      reference: r.ref,
      changes: r.changes
        .map((c: AuditChange) => `${c.field}: ${c.before} -> ${c.after}`)
        .join('; '),
      before: r.before ? JSON.stringify(r.before) : '',
      after: r.after ? JSON.stringify(r.after) : '',
    }));
  }
}

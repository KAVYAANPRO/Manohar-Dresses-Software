import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

/** Which id field resolves against which kind of record. `<base>Name` is added next to it. */
const ID_FIELD_KINDS: Record<string, LabelKind> = {
  supplierId: 'supplier',
  customerId: 'customer',
  jobWorkerId: 'jobWorker',
  designId: 'design',
  jobSlipId: 'jobSlip',
  stockItemId: 'stockItem',
  materialVariantId: 'materialVariant',
  designVariantId: 'designVariant',
  locationId: 'location',
  fromLocationId: 'location',
  toLocationId: 'location',
  lotId: 'lot',
  materialId: 'material',
  actorUserId: 'user',
};

export type LabelKind =
  | 'supplier'
  | 'customer'
  | 'jobWorker'
  | 'design'
  | 'jobSlip'
  | 'stockItem'
  | 'materialVariant'
  | 'designVariant'
  | 'location'
  | 'lot'
  | 'material'
  | 'user';

function toObjectIds(ids: Iterable<string>): Types.ObjectId[] {
  const out: Types.ObjectId[] = [];
  for (const id of ids) if (id && Types.ObjectId.isValid(id)) out.push(new Types.ObjectId(id));
  return out;
}

/**
 * Turns the raw ObjectIds that reports, alerts, dashboards and the trace view return into
 * human-readable labels ("Cotton Silk - Red" instead of "6acb7e..."). Read-only, batched: one
 * query per record kind per call, never one per row.
 */
@Injectable()
export class LabelResolverService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  private async simple(
    collection: string,
    ids: string[],
    fmt: (d: any) => string,
  ): Promise<Map<string, string>> {
    const docs = await this.col(collection)
      .find({ _id: { $in: toObjectIds(ids) } })
      .toArray();
    return new Map(docs.map((d) => [String(d._id), fmt(d)]));
  }

  private async materialVariantLabels(ids: string[]): Promise<Map<string, string>> {
    const variants = await this.col('material_variants')
      .find({ _id: { $in: toObjectIds(ids) } })
      .toArray();
    const [materials, colours] = await Promise.all([
      this.simple('materials', variants.map((v) => String(v.materialId)), (m) => m.name),
      this.simple('colours', variants.map((v) => String(v.colourId)), (c) => c.name),
    ]);
    return new Map(
      variants.map((v) => {
        const parts = [materials.get(String(v.materialId)) ?? 'Material'];
        const colour = colours.get(String(v.colourId));
        if (colour) parts.push(colour);
        return [String(v._id), parts.join(' - ') + (v.code ? ` (${v.code})` : '')];
      }),
    );
  }

  private async designVariantLabels(ids: string[]): Promise<Map<string, string>> {
    const variants = await this.col('design_variants')
      .find({ _id: { $in: toObjectIds(ids) } })
      .toArray();
    const [designs, colours, sizes] = await Promise.all([
      this.simple('designs', variants.map((v) => String(v.designId)), (d) => d.designNo),
      this.simple('colours', variants.map((v) => String(v.colourId)), (c) => c.name),
      this.simple('sizes', variants.map((v) => String(v.sizeId)), (s) => s.name),
    ]);
    return new Map(
      variants.map((v) => [
        String(v._id),
        [
          designs.get(String(v.designId)) ?? 'Design',
          colours.get(String(v.colourId)),
          sizes.get(String(v.sizeId)),
        ]
          .filter(Boolean)
          .join(' / '),
      ]),
    );
  }

  private async stockItemLabels(ids: string[]): Promise<Map<string, string>> {
    const items = await this.col('stock_items')
      .find({ _id: { $in: toObjectIds(ids) } })
      .toArray();
    const [mv, dv] = await Promise.all([
      this.materialVariantLabels(
        items.filter((i) => i.materialVariantId).map((i) => String(i.materialVariantId)),
      ),
      this.designVariantLabels(
        items.filter((i) => i.designVariantId).map((i) => String(i.designVariantId)),
      ),
    ]);
    return new Map(
      items.map((i) => [
        String(i._id),
        (i.materialVariantId
          ? mv.get(String(i.materialVariantId))
          : dv.get(String(i.designVariantId))) ?? String(i._id),
      ]),
    );
  }

  /** Resolve a set of ids of one kind to labels. Unknown ids are simply absent from the map. */
  async resolve(kind: LabelKind, ids: Iterable<string>): Promise<Map<string, string>> {
    const list = Array.from(new Set(Array.from(ids).filter(Boolean).map(String)));
    if (list.length === 0) return new Map();
    switch (kind) {
      case 'supplier':
        return this.simple('suppliers', list, (d) => d.name);
      case 'customer':
        return this.simple('customers', list, (d) => d.businessName || d.name);
      case 'jobWorker':
        return this.simple('job_workers', list, (d) => d.name);
      case 'design':
        return this.simple('designs', list, (d) => d.designNo);
      case 'jobSlip':
        return this.simple('job_slips', list, (d) => d.docNo);
      case 'location':
        return this.simple('stock_locations', list, (d) => d.name || d.code);
      case 'lot':
        return this.simple('stock_lots', list, (d) => d.lotNo);
      case 'material':
        return this.simple('materials', list, (d) => d.name);
      case 'user':
        return this.simple('users', list, (d) => d.displayName || d.username);
      case 'materialVariant':
        return this.materialVariantLabels(list);
      case 'designVariant':
        return this.designVariantLabels(list);
      case 'stockItem':
        return this.stockItemLabels(list);
    }
  }

  /**
   * Adds `<base>Name` beside every recognised `<base>Id` field of every row (e.g. supplierId ->
   * supplierName). Rows keep their original key order with the label inserted right after the
   * id, so CSV exports read naturally.
   */
  async enrich<T extends Record<string, unknown>>(rows: T[]): Promise<Array<Record<string, unknown>>> {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    const idsByKind = new Map<LabelKind, Set<string>>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      for (const [field, kind] of Object.entries(ID_FIELD_KINDS)) {
        const v = row[field];
        if (v === undefined || v === null || v === '') continue;
        if (!idsByKind.has(kind)) idsByKind.set(kind, new Set());
        idsByKind.get(kind)!.add(String(v));
      }
    }
    if (idsByKind.size === 0) return rows;
    const labels = new Map<LabelKind, Map<string, string>>();
    await Promise.all(
      Array.from(idsByKind.entries()).map(async ([kind, ids]) =>
        labels.set(kind, await this.resolve(kind, ids)),
      ),
    );
    return rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        out[key] = value;
        const kind = ID_FIELD_KINDS[key];
        if (kind && value !== undefined && value !== null && value !== '') {
          const nameKey = key.replace(/Id$/, 'Name');
          if (!(nameKey in row)) out[nameKey] = labels.get(kind)?.get(String(value)) ?? '';
        }
      }
      return out;
    });
  }
}

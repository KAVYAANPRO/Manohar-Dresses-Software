import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

export interface VariantLabel {
  designVariantId: string;
  designId: string;
  designNo: string;
  designName: string;
  categoryName?: string;
  colourName: string;
  sizeName: string;
  hsn?: string;
  defaultSellingRate?: number;
}

const toIds = (ids: Array<string | Types.ObjectId | undefined | null>) =>
  Array.from(new Set(ids.filter(Boolean).map(String))).map((id) => new Types.ObjectId(id));

/**
 * Read-only label resolution for sales screens (design no/name, colour, size, customer and
 * agent names). Kept in one place so every list/detail endpoint returns display-ready rows
 * instead of each page doing N lookups client-side.
 */
@Injectable()
export class SalesLookupService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async variantLabels(
    ids: Array<string | Types.ObjectId | undefined | null>,
  ): Promise<Map<string, VariantLabel>> {
    const variantIds = toIds(ids);
    const out = new Map<string, VariantLabel>();
    if (variantIds.length === 0) return out;
    const db = this.connection.db!;
    const variants = await db
      .collection('design_variants')
      .find({ _id: { $in: variantIds } })
      .toArray();
    const designs = await db
      .collection('designs')
      .find({ _id: { $in: toIds(variants.map((v) => v.designId)) } })
      .toArray();
    const colours = await db
      .collection('colours')
      .find({ _id: { $in: toIds(variants.map((v) => v.colourId)) } })
      .toArray();
    const sizes = await db
      .collection('sizes')
      .find({ _id: { $in: toIds(variants.map((v) => v.sizeId)) } })
      .toArray();
    const categories = await db
      .collection('product_categories')
      .find({ _id: { $in: toIds(designs.map((d) => d.productCategoryId)) } })
      .toArray();
    const dById = new Map(designs.map((d) => [String(d._id), d]));
    const cById = new Map(colours.map((c) => [String(c._id), c]));
    const sById = new Map(sizes.map((s) => [String(s._id), s]));
    const catById = new Map(categories.map((c) => [String(c._id), c]));
    for (const v of variants) {
      const d = dById.get(String(v.designId));
      out.set(String(v._id), {
        designVariantId: String(v._id),
        designId: String(v.designId),
        designNo: d?.designNo ?? '?',
        designName: d?.name ?? '?',
        categoryName: d ? catById.get(String(d.productCategoryId))?.name : undefined,
        colourName: cById.get(String(v.colourId))?.name ?? '?',
        sizeName: sById.get(String(v.sizeId))?.name ?? '?',
        hsn: d?.hsn,
        defaultSellingRate: d?.defaultSellingRate,
      });
    }
    return out;
  }

  async names(
    collection: 'customers' | 'sales_agents',
    ids: Array<string | Types.ObjectId | undefined | null>,
  ): Promise<Map<string, any>> {
    const objectIds = toIds(ids);
    if (objectIds.length === 0) return new Map();
    const rows = await this.connection
      .db!.collection(collection)
      .find({ _id: { $in: objectIds } })
      .toArray();
    return new Map(rows.map((r) => [String(r._id), r]));
  }
}

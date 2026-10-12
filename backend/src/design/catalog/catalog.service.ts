import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { CatalogItem, CatalogItemDocument } from './catalog-item.schema';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './catalog-item.dto';
import { ConflictVersionException, ProblemException } from '../../common/errors/problem.exception';
import { roundQty } from '../../common/utils/decimal';

const PRICE_FIELDS = ['salesPrice', 'defaultPrice', 'samplePrice'] as const;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CatalogItemView extends Record<string, unknown> {
  _id: string;
  readyStockQty: number | null;
  lowStock: boolean;
  outOfStock: boolean;
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(CatalogItem.name) private readonly model: Model<CatalogItemDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /** Sellable (warehouse) finished-goods on hand per design - same definition as ready stock (RGS-03). */
  async readyOnHandByDesign(designIds: Types.ObjectId[]): Promise<Map<string, number>> {
    if (designIds.length === 0) return new Map();
    const rows = await this.connection
      .collection('stock_balances')
      .aggregate([
        { $match: { qty: { $gt: 0 } } },
        {
          $lookup: {
            from: 'stock_locations',
            localField: 'locationId',
            foreignField: '_id',
            as: 'loc',
          },
        },
        { $unwind: '$loc' },
        { $match: { 'loc.kind': 'WAREHOUSE' } },
        {
          $lookup: {
            from: 'stock_items',
            localField: 'stockItemId',
            foreignField: '_id',
            as: 'item',
          },
        },
        { $unwind: '$item' },
        { $match: { 'item.kind': 'FINISHED_GOOD' } },
        {
          $lookup: {
            from: 'design_variants',
            localField: 'item.designVariantId',
            foreignField: '_id',
            as: 'v',
          },
        },
        { $unwind: '$v' },
        { $match: { 'v.designId': { $in: [...designIds, ...designIds.map(String)] } } },
        { $group: { _id: { $toString: '$v.designId' }, qty: { $sum: '$qty' } } },
      ])
      .toArray();
    return new Map(rows.map((r) => [String(r._id), roundQty(r.qty)]));
  }

  private async decorate(docs: any[], includePrices: boolean): Promise<CatalogItemView[]> {
    const designIds = docs
      .filter((d) => d.designId)
      .map((d) => new Types.ObjectId(String(d.designId)));
    const onHand = await this.readyOnHandByDesign(designIds);
    const designs = designIds.length
      ? await this.connection
          .collection('designs')
          .find({ _id: { $in: designIds } })
          .toArray()
      : [];
    const designLabel = new Map(designs.map((d) => [String(d._id), `${d.designNo} - ${d.name}`]));
    return docs.map((d) => {
      const view: Record<string, unknown> = { ...d, _id: String(d._id) };
      if (!includePrices) for (const f of PRICE_FIELDS) delete view[f];
      const qty = d.designId ? (onHand.get(String(d.designId)) ?? 0) : null;
      view.designId = d.designId ? String(d.designId) : null;
      view.designLabel = d.designId ? (designLabel.get(String(d.designId)) ?? '') : null;
      view.readyStockQty = qty;
      view.lowStock = qty !== null && d.minStockQty != null && qty <= d.minStockQty;
      view.outOfStock = Boolean(d.outOfStock) || qty === 0;
      return view as CatalogItemView;
    });
  }

  async list(
    opts: { q?: string; tag?: string; includeInactive?: boolean },
    includePrices: boolean,
  ) {
    const filter: Record<string, unknown> = {};
    if (!opts.includeInactive) filter.isActive = true;
    if (opts.tag) filter.tag = opts.tag;
    if (opts.q) {
      const rx = new RegExp(escapeRegex(opts.q), 'i');
      filter.$or = [{ designNameOrNumber: rx }, { description: rx }, { hsnCode: rx }];
    }
    const docs = await this.model.find(filter).sort({ designNameOrNumber: 1 }).lean();
    return this.decorate(docs, includePrices);
  }

  /** Active entries linked to a design with a minimum level - the inputs to the low-ready-stock alert. */
  listForAlerts() {
    return this.model
      .find({ isActive: true, designId: { $ne: null }, minStockQty: { $ne: null } })
      .lean();
  }

  async findById(id: string, includePrices: boolean) {
    if (!Types.ObjectId.isValid(id)) {
      throw new ProblemException('NOT_FOUND', 404, 'Catalog item not found.');
    }
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Catalog item not found.');
    return (await this.decorate([doc], includePrices))[0];
  }

  private async assertDesign(designId?: string | null) {
    if (!designId) return;
    const exists = await this.connection
      .collection('designs')
      .findOne({ _id: new Types.ObjectId(designId) }, { projection: { _id: 1 } });
    if (!exists) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'Linked design does not exist.', {
        designId: 'not found',
      });
    }
  }

  /** VAL-01: no duplicate design names/numbers in the catalog (case-insensitive). */
  private async assertUniqueName(name: string, exceptId?: string) {
    const rx = new RegExp(`^${escapeRegex(name.trim())}$`, 'i');
    const dup = await this.model
      .findOne({
        designNameOrNumber: rx,
        ...(exceptId ? { _id: { $ne: new Types.ObjectId(exceptId) } } : {}),
      })
      .lean();
    if (dup) {
      throw new ProblemException(
        'DUPLICATE',
        409,
        `A catalog entry named "${name.trim()}" already exists.`,
        { designNameOrNumber: 'duplicate' },
      );
    }
  }

  async create(dto: CreateCatalogItemDto, actorId: string) {
    await this.assertDesign(dto.designId);
    await this.assertUniqueName(dto.designNameOrNumber);
    const created = await this.model.create({
      ...dto,
      designNameOrNumber: dto.designNameOrNumber.trim(),
      designId: dto.designId ? new Types.ObjectId(dto.designId) : undefined,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.findById(String(created._id), true);
  }

  async update(id: string, dto: UpdateCatalogItemDto, actorId: string, expectedVersion?: number) {
    await this.findById(id, true);
    if (dto.designId) await this.assertDesign(dto.designId);
    if (dto.designNameOrNumber) await this.assertUniqueName(dto.designNameOrNumber, id);
    const set: Record<string, unknown> = { ...dto, updatedBy: actorId };
    const unset: Record<string, 1> = {};
    if (dto.designId === null || (dto.designId as unknown) === '') {
      delete set.designId;
      unset.designId = 1;
    } else if (dto.designId) {
      set.designId = new Types.ObjectId(dto.designId);
    }
    if (typeof set.designNameOrNumber === 'string') {
      set.designNameOrNumber = (set.designNameOrNumber as string).trim();
    }
    const query: Record<string, unknown> = { _id: id };
    if (expectedVersion !== undefined && Number.isFinite(expectedVersion)) {
      query.version = expectedVersion;
    }
    const doc = await this.model.findOneAndUpdate(
      query,
      {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (!doc) throw new ConflictVersionException();
    return this.findById(id, true);
  }

  async setActive(id: string, isActive: boolean, actorId: string) {
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $set: { isActive, updatedBy: actorId }, $inc: { version: 1 } },
      { new: true },
    );
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Catalog item not found.');
    return this.findById(id, true);
  }

  async addPhoto(id: string, url: string, actorId: string) {
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $push: { photoUrls: url }, $set: { updatedBy: actorId }, $inc: { version: 1 } },
      { new: true },
    );
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Catalog item not found.');
    return this.findById(id, true);
  }

  async removePhoto(id: string, url: string, actorId: string) {
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $pull: { photoUrls: url }, $set: { updatedBy: actorId }, $inc: { version: 1 } },
      { new: true },
    );
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Catalog item not found.');
    return this.findById(id, true);
  }
}

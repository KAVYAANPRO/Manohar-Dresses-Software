import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Colour, ColourDocument } from '../master/schemas/colour.schema';
import { Size, SizeDocument } from '../master/schemas/size.schema';
import {
  Material,
  MaterialDocument,
  MaterialVariant,
  MaterialVariantDocument,
} from '../master/schemas/material.schema';
import { Uom, UomDocument } from '../master/schemas/uom.schema';
import { JobWorker, JobWorkerDocument } from '../master/schemas/job-worker.schema';
import { ProcessingType, ProcessingTypeDocument } from '../master/schemas/processing-type.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { StockItem, StockItemDocument } from '../inventory/schemas/stock-item.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';

type Id = Types.ObjectId | string | null | undefined;

export interface MaterialVariantInfo {
  materialVariantId: string;
  materialId: string;
  name: string; // "Cotton Fabric - Blue"
  materialName: string;
  colourName: string;
  uom: string; // base UoM code, e.g. "M"
}

const uniq = (ids: Id[]): Types.ObjectId[] => {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    if (!id) continue;
    const s = String(id);
    if (!Types.ObjectId.isValid(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(new Types.ObjectId(s));
  }
  return out;
};

/**
 * Read-only name resolution for the job-work screens (receipts, processing, reconciliation,
 * costing, portal). Batches lookups so list endpoints do a fixed number of queries.
 */
@Injectable()
export class JobworkLookupService {
  constructor(
    @InjectModel(Colour.name) private readonly colourModel: Model<ColourDocument>,
    @InjectModel(Size.name) private readonly sizeModel: Model<SizeDocument>,
    @InjectModel(Material.name) private readonly materialModel: Model<MaterialDocument>,
    @InjectModel(MaterialVariant.name)
    private readonly variantModel: Model<MaterialVariantDocument>,
    @InjectModel(Uom.name) private readonly uomModel: Model<UomDocument>,
    @InjectModel(JobWorker.name) private readonly jobWorkerModel: Model<JobWorkerDocument>,
    @InjectModel(ProcessingType.name)
    private readonly processingTypeModel: Model<ProcessingTypeDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    @InjectModel(StockItem.name) private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
  ) {}

  async colours(ids: Id[]): Promise<Map<string, string>> {
    const rows = await this.colourModel.find({ _id: { $in: uniq(ids) } }).lean();
    return new Map(rows.map((r) => [String(r._id), r.name]));
  }

  async sizes(ids: Id[]): Promise<Map<string, string>> {
    const rows = await this.sizeModel.find({ _id: { $in: uniq(ids) } }).lean();
    return new Map(rows.map((r) => [String(r._id), r.name]));
  }

  async jobWorkers(ids: Id[]) {
    const rows = await this.jobWorkerModel.find({ _id: { $in: uniq(ids) } }).lean();
    return new Map(rows.map((r) => [String(r._id), r]));
  }

  async designs(ids: Id[]) {
    const rows = await this.designModel.find({ _id: { $in: uniq(ids) } }).lean();
    return new Map(rows.map((r) => [String(r._id), r]));
  }

  async processingTypes(ids: Id[]): Promise<Map<string, string>> {
    const rows = await this.processingTypeModel.find({ _id: { $in: uniq(ids) } }).lean();
    return new Map(rows.map((r) => [String(r._id), (r as any).name as string]));
  }

  async materialVariants(ids: Id[]): Promise<Map<string, MaterialVariantInfo>> {
    const variants = await this.variantModel.find({ _id: { $in: uniq(ids) } }).lean();
    const [materials, colours] = await Promise.all([
      this.materialModel.find({ _id: { $in: uniq(variants.map((v) => v.materialId)) } }).lean(),
      this.colours(variants.map((v) => v.colourId)),
    ]);
    const uoms = await this.uomModel
      .find({ _id: { $in: uniq(materials.map((m) => m.baseUomId)) } })
      .lean();
    const uomById = new Map(uoms.map((u) => [String(u._id), (u as any).code as string]));
    const materialById = new Map(materials.map((m) => [String(m._id), m]));
    const out = new Map<string, MaterialVariantInfo>();
    for (const v of variants) {
      const m = materialById.get(String(v.materialId));
      const colourName = colours.get(String(v.colourId)) ?? '';
      const materialName = m?.name ?? '';
      out.set(String(v._id), {
        materialVariantId: String(v._id),
        materialId: String(v.materialId),
        name: [materialName, colourName].filter(Boolean).join(' - '),
        materialName,
        colourName,
        uom: m ? (uomById.get(String(m.baseUomId)) ?? '') : '',
      });
    }
    return out;
  }

  /** stockItemId -> material variant info (raw/processed material stock items only). */
  async stockItemMaterials(stockItemIds: Id[]): Promise<Map<string, MaterialVariantInfo>> {
    const items = await this.stockItemModel.find({ _id: { $in: uniq(stockItemIds) } }).lean();
    const variants = await this.materialVariants(items.map((i) => i.materialVariantId));
    const out = new Map<string, MaterialVariantInfo>();
    for (const i of items) {
      const v = i.materialVariantId ? variants.get(String(i.materialVariantId)) : undefined;
      if (v) out.set(String(i._id), v);
    }
    return out;
  }

  async lots(ids: Id[]) {
    const rows = await this.lotModel.find({ _id: { $in: uniq(ids) } }).lean();
    return new Map(rows.map((r) => [String(r._id), r]));
  }
}

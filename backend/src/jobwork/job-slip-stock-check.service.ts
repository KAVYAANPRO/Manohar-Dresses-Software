import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { JobSlip, JobSlipDocument, JobSlipStatus, JobType } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { MaterialVariant, MaterialVariantDocument } from '../master/schemas/material.schema';
import { DesignsService } from '../design/designs.service';
import { StockItemsService } from '../inventory/stock-items.service';
import { StockQueryService } from '../inventory/stock-query.service';
import { roundQty, toDecimal } from '../common/utils/decimal';
import { InsufficientStockException, ProblemException } from '../common/errors/problem.exception';

/** Job types whose material is the design's BOM. PROCESSING slips are not checked (see below). */
const BOM_CONSUMING_JOB_TYPES: readonly JobType[] = ['MANUFACTURING'];

/**
 * Open job slips that still hold a claim on warehouse material. RECEIVED/CLOSED/CANCELLED are
 * finished with the material, so whatever was not issued to them is no longer reserved.
 */
const RESERVING_STATUSES: readonly JobSlipStatus[] = [
  'CREATED',
  'MATERIAL_ISSUED',
  'IN_PROCESS',
  'READY',
  'PARTIALLY_RECEIVED',
];

export interface MaterialShortage {
  materialVariantId: string;
  name: string;
  required: number;
  available: number;
  uom: string;
  onHand: number;
  reservedByOpenJobSlips: number;
  shortBy: number;
}

export interface JobSlipStockCheckInput {
  jobType: JobType;
  designId?: string;
  expectedOutputLines: { expectedQty: number }[];
}

/**
 * A job slip for a design cannot be created until the raw material its BOM needs is in the
 * main warehouse ("until the lot of cotton blue is inwarded, no job slip for a dress that
 * uses it").
 *
 * required(variant)  = sum over the design's ACTIVE BOM lines for that variant of
 *                      qtyPerGarmentBase x total expectedQty of the new slip.
 * available(variant) = MAIN-WH on-hand balance of the variant's stock item
 *                      - material still owed to other open MANUFACTURING slips
 *                        (their BOM requirement minus what was already issued net of returns).
 *
 * PROCESSING slips are skipped: their expected output line's materialVariantId is the OUTPUT
 * (e.g. Printed Fabric - Blue), which by definition does not exist yet, and the DTO does not
 * name the input material.
 *
 * A design with no active BOM is allowed through (nothing to check against).
 */
@Injectable()
export class JobSlipStockCheckService {
  constructor(
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    @InjectModel(MaterialVariant.name)
    private readonly variantModel: Model<MaterialVariantDocument>,
    private readonly designsService: DesignsService,
    private readonly stockItemsService: StockItemsService,
    private readonly stockQueryService: StockQueryService,
  ) {}

  async assertMaterialsAvailable(input: JobSlipStockCheckInput): Promise<void> {
    if (!BOM_CONSUMING_JOB_TYPES.includes(input.jobType)) return;
    // Material-based slips have no BOM: their stock is checked lot by lot when the material is issued.
    if (!input.designId) return;
    if ((input as { materialBased?: boolean }).materialBased) return;

    const totalQty = totalExpected(input.expectedOutputLines);
    const bomCache = new Map<string, Map<string, Decimal> | null>();
    const perGarment = await this.bomPerGarment(input.designId!, bomCache);
    if (!perGarment || perGarment.size === 0 || totalQty.lte(0)) return;

    const required = new Map<string, Decimal>();
    for (const [variantId, qty] of perGarment) required.set(variantId, qty.times(totalQty));

    const warehouse = await this.locationModel.findOne({ code: 'MAIN-WH' }).lean();
    if (!warehouse) {
      throw new ProblemException('VALIDATION_FAILED', 500, 'MAIN-WH location is not seeded.');
    }

    const variantIds = Array.from(required.keys());
    const stockItemIdByVariant = new Map<string, string>();
    for (const variantId of variantIds) {
      const [item] = await this.stockItemsService.list({ materialVariantId: variantId });
      if (item) stockItemIdByVariant.set(variantId, String((item as any)._id));
    }

    const onHand = new Map<string, Decimal>();
    for (const variantId of variantIds) {
      let qty = toDecimal(0);
      const stockItemId = stockItemIdByVariant.get(variantId);
      if (stockItemId) {
        const balances = await this.stockQueryService.balances({
          stockItemId,
          locationId: String(warehouse._id),
        });
        for (const b of balances) qty = qty.plus(b.qty);
      }
      onHand.set(variantId, qty);
    }

    const reserved = await this.reservedByOpenSlips(variantIds, stockItemIdByVariant, bomCache);

    const shortages: Omit<MaterialShortage, 'name' | 'uom'>[] = [];
    for (const variantId of variantIds) {
      const req = required.get(variantId)!;
      const have = onHand.get(variantId)!;
      const held = reserved.get(variantId) ?? toDecimal(0);
      const available = Decimal.max(0, have.minus(held));
      if (available.lt(req.minus(0.0005))) {
        shortages.push({
          materialVariantId: variantId,
          required: roundQty(req),
          available: roundQty(available),
          onHand: roundQty(have),
          reservedByOpenJobSlips: roundQty(held),
          shortBy: roundQty(req.minus(available)),
        });
      }
    }
    if (shortages.length === 0) return;

    const labels = await this.variantLabels(shortages.map((s) => s.materialVariantId));
    const detailed: MaterialShortage[] = shortages.map((s) => ({
      ...s,
      name: labels.get(s.materialVariantId)?.name ?? s.materialVariantId,
      uom: labels.get(s.materialVariantId)?.uom ?? '',
    }));

    const parts = detailed.map((s) => {
      const unit = s.uom ? ` ${s.uom}` : '';
      const reservedNote =
        s.reservedByOpenJobSlips > 0
          ? ` after ${s.reservedByOpenJobSlips}${unit} reserved by other open job slips`
          : '';
      return `${s.name}: required ${s.required}${unit}, available ${s.available}${unit}${reservedNote} (short by ${s.shortBy}${unit})`;
    });
    throw new InsufficientStockException(
      `Cannot create the job slip: not enough raw material in the main warehouse for ${roundQty(totalQty)} pcs. ${parts.join('; ')}.`,
      { shortages: detailed },
    );
  }

  /**
   * materialVariantId -> qtyPerGarmentBase x (1 + allowancePct/100), summed over the active BOM's
   * lines (the same per-garment need the requirement calculator and issue plan show); null when
   * no active BOM.
   */
  private async bomPerGarment(
    designId: string,
    cache: Map<string, Map<string, Decimal> | null>,
  ): Promise<Map<string, Decimal> | null> {
    if (cache.has(designId)) return cache.get(designId)!;
    const bom = await this.designsService.getCurrentBom(designId);
    let result: Map<string, Decimal> | null = null;
    if (bom) {
      result = new Map();
      for (const line of bom.lines ?? []) {
        const key = String(line.materialVariantId);
        const withAllowance = toDecimal(line.qtyPerGarmentBase).times(
          toDecimal(1).plus(toDecimal(line.allowancePct ?? 0).div(100)),
        );
        result.set(key, (result.get(key) ?? toDecimal(0)).plus(withAllowance));
      }
    }
    cache.set(designId, result);
    return result;
  }

  /**
   * Material still owed to other open MANUFACTURING slips: for each slip, its design's active
   * BOM x its expected qty, minus what has been issued to it net of returns (never below 0).
   */
  private async reservedByOpenSlips(
    variantIds: string[],
    stockItemIdByVariant: Map<string, string>,
    bomCache: Map<string, Map<string, Decimal> | null>,
  ): Promise<Map<string, Decimal>> {
    const reserved = new Map<string, Decimal>();
    const openSlips = await this.slipModel
      .find({
        jobType: { $in: BOM_CONSUMING_JOB_TYPES },
        status: { $in: RESERVING_STATUSES },
      })
      .select('_id designId expectedOutputLines')
      .lean();
    if (openSlips.length === 0) return reserved;

    const variantByStockItem = new Map<string, string>();
    for (const [variantId, stockItemId] of stockItemIdByVariant) {
      variantByStockItem.set(stockItemId, variantId);
    }

    // slipId -> variantId -> net issued
    const netIssued = new Map<string, Map<string, Decimal>>();
    if (variantByStockItem.size > 0) {
      const lines = await this.materialLineModel
        .find({
          jobSlipId: { $in: openSlips.map((s) => s._id) },
          stockItemId: {
            $in: Array.from(variantByStockItem.keys()).map((id) => new Types.ObjectId(id)),
          },
        })
        .lean();
      for (const line of lines) {
        const variantId = variantByStockItem.get(String(line.stockItemId));
        if (!variantId) continue;
        const slipKey = String(line.jobSlipId);
        const perVariant = netIssued.get(slipKey) ?? new Map<string, Decimal>();
        perVariant.set(
          variantId,
          (perVariant.get(variantId) ?? toDecimal(0)).plus(line.qtyIssued).minus(line.qtyReturned),
        );
        netIssued.set(slipKey, perVariant);
      }
    }

    const wanted = new Set(variantIds);
    for (const slip of openSlips) {
      if (!slip.designId) continue;
      const perGarment = await this.bomPerGarment(String(slip.designId), bomCache);
      if (!perGarment) continue;
      const qty = totalExpected(slip.expectedOutputLines ?? []);
      const issued = netIssued.get(String(slip._id));
      for (const [variantId, perPiece] of perGarment) {
        if (!wanted.has(variantId)) continue;
        const outstanding = Decimal.max(0, perPiece.times(qty).minus(issued?.get(variantId) ?? 0));
        reserved.set(variantId, (reserved.get(variantId) ?? toDecimal(0)).plus(outstanding));
      }
    }
    return reserved;
  }

  /** "Cotton - Blue" and the material's base-unit code, for the error message. */
  private async variantLabels(
    variantIds: string[],
  ): Promise<Map<string, { name: string; uom: string }>> {
    const variants = await this.variantModel
      .find({ _id: { $in: variantIds.map((id) => new Types.ObjectId(id)) } })
      .populate({ path: 'materialId', select: 'name baseUomId', populate: { path: 'baseUomId' } })
      .populate({ path: 'colourId', select: 'name' })
      .lean();
    const labels = new Map<string, { name: string; uom: string }>();
    for (const v of variants as any[]) {
      const materialName: string | undefined = v.materialId?.name;
      const colourName: string | undefined = v.colourId?.name;
      const name =
        [materialName, colourName].filter(Boolean).join(' - ') || v.code || String(v._id);
      labels.set(String(v._id), { name, uom: v.materialId?.baseUomId?.code ?? '' });
    }
    return labels;
  }
}

function totalExpected(lines: { expectedQty: number }[]): Decimal {
  return lines.reduce((sum, l) => sum.plus(l.expectedQty ?? 0), toDecimal(0));
}

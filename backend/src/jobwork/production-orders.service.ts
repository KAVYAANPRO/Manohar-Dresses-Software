import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductionOrder, ProductionOrderDocument } from './schemas/production-order.schema';
import { DesignsService } from '../design/designs.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import {
  InvalidStateTransitionException,
  ProblemException,
  ValidationFailedException,
} from '../common/errors/problem.exception';
import { CreateProductionOrderDto } from './dto/production-order.dto';
import { MaterialStockInfoService } from '../design/material-stock-info.service';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { roundQty, toDecimal } from '../common/utils/decimal';
import Decimal from 'decimal.js';

/**
 * JOB-01. Creating an order both plans the colour/size breakdown and computes the material
 * requirement in the same step, snapshotting the design's current BOM version (DSN-04) so a
 * later BOM edit cannot retroactively change this order's numbers.
 */
@Injectable()
export class ProductionOrdersService {
  constructor(
    @InjectModel(ProductionOrder.name) private readonly model: Model<ProductionOrderDocument>,
    private readonly designsService: DesignsService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
    private readonly materialInfo: MaterialStockInfoService,
  ) {}

  list(filter: Record<string, unknown> = {}) {
    return this.model
      .find(castObjectIdFilter(filter, ['designId']))
      .sort({ createdAt: -1 })
      .lean();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Production order not found.');
    return doc;
  }

  /**
   * The order with its frozen requirement (DSN-04 snapshot) compared against the stock that is
   * in MAIN-WH right now, per material: required vs available vs shortfall (DSN-05/JOB-01).
   */
  async findByIdWithStock(id: string): Promise<Record<string, unknown>> {
    const doc = await this.findById(id);
    const enriched = await this.withStock([doc]);
    return enriched[0];
  }

  async listWithStock(filter: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    return this.withStock(await this.list(filter));
  }

  private async withStock(docs: any[]): Promise<Record<string, unknown>[]> {
    const variantIds = new Set<string>();
    for (const d of docs)
      for (const r of d.requirements ?? []) variantIds.add(String(r.materialVariantId));
    const info = await this.materialInfo.info(Array.from(variantIds));
    return docs.map((d) => {
      const required = new Map<string, Decimal>();
      for (const r of d.requirements ?? []) {
        const key = String(r.materialVariantId);
        required.set(key, (required.get(key) ?? toDecimal(0)).plus(r.requiredQtyBase));
      }
      const byMaterial = Array.from(required.entries()).map(([variantId, req]) => {
        const i = info.get(variantId);
        const available = i?.mainWhOnHand ?? 0;
        return {
          materialVariantId: variantId,
          materialName: i?.name ?? variantId,
          uom: i?.uom ?? '',
          requiredQtyBase: roundQty(req),
          availableQtyBase: available,
          shortfall: roundQty(Decimal.max(0, req.minus(available))),
        };
      });
      return {
        ...d,
        requirements: (d.requirements ?? []).map((r: any) => ({
          ...r,
          materialName: info.get(String(r.materialVariantId))?.name ?? String(r.materialVariantId),
          uom: info.get(String(r.materialVariantId))?.uom ?? '',
        })),
        byMaterial,
        stockCheckPassed: byMaterial.every((m) => m.shortfall <= 0),
      };
    });
  }

  async create(dto: CreateProductionOrderDto, actorId: string): Promise<ProductionOrderDocument> {
    const design = await this.designsService.findById(dto.designId);
    const colours = new Set((design.colourOptions ?? []).map(String));
    const sizes = new Set((design.sizeOptions ?? []).map(String));
    const fieldErrors: Record<string, string> = {};
    const seen = new Set<string>();
    dto.quantities.forEach((q, i) => {
      if (!colours.has(q.colourId))
        fieldErrors[`quantities.${i}.colourId`] = 'not a colour of this design';
      if (!sizes.has(q.sizeId)) fieldErrors[`quantities.${i}.sizeId`] = 'not a size of this design';
      const key = `${q.colourId}|${q.sizeId}`;
      if (seen.has(key)) fieldErrors[`quantities.${i}`] = 'duplicate colour/size line';
      seen.add(key);
    });
    if (dto.plannedStartDate && dto.plannedEndDate && dto.plannedEndDate < dto.plannedStartDate) {
      fieldErrors.plannedEndDate = 'must be on or after the planned start date';
    }
    if (Object.keys(fieldErrors).length > 0) throw new ValidationFailedException(fieldErrors);

    const totalGarments = dto.quantities.reduce((sum, q) => sum + q.qty, 0);
    const requirement = await this.designsService.calculateRequirement(dto.designId, totalGarments);

    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('PRODUCTION_ORDER', fy, 'PO');
    const docNo = await this.numberSeries.next('PRODUCTION_ORDER', fy);

    return this.model.create({
      docNo,
      docDate: new Date(),
      designId: dto.designId,
      bomVersionId: requirement.bomVersionId,
      quantities: dto.quantities,
      totalGarments,
      requirements: requirement.lines.map((l) => ({
        role: l.role,
        materialVariantId: l.materialVariantId,
        qtyPerGarmentBase: l.qtyPerGarmentBase,
        allowancePct: l.allowancePct,
        requiredQtyBase: l.requiredQtyBase,
      })),
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
      plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : undefined,
      notes: dto.notes,
      status: 'PLANNED',
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async cancel(id: string, reason: string, actorId: string): Promise<ProductionOrderDocument> {
    const order = await this.model.findById(id);
    if (!order) throw new ProblemException('NOT_FOUND', 404, 'Production order not found.');
    if (order.status === 'CANCELLED') {
      throw new InvalidStateTransitionException('Production order is already cancelled.');
    }
    order.status = 'CANCELLED';
    order.cancelReason = reason;
    order.cancelledBy = actorId as any;
    order.cancelledAt = new Date();
    order.updatedBy = actorId as any;
    order.version += 1;
    await order.save();
    return order;
  }
}

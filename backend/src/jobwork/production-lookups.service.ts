import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { MaterialIssue, MaterialIssueDocument } from './schemas/material-issue.schema';
import { DesignsService } from '../design/designs.service';
import { MaterialStockInfo, MaterialStockInfoService } from '../design/material-stock-info.service';
import { ProblemException } from '../common/errors/problem.exception';
import { roundQty, toDecimal } from '../common/utils/decimal';

export interface IssuePlanLine {
  materialVariantId: string;
  materialName: string;
  uom: string;
  roles: string[];
  qtyPerGarmentBase: number;
  allowancePct: number;
  /** garments x qty/garment x (1 + allowance%) */
  requiredQty: number;
  /** Confirmed issues net of returns. */
  issuedQty: number;
  returnedQty: number;
  pendingQty: number;
  mainWhOnHand: number;
  inBom: boolean;
}

export interface IssuePlan {
  jobSlipId: string;
  jobSlipNo: string;
  jobType: string;
  status: string;
  totalGarments: number;
  bomVersionId?: string;
  lines: IssuePlanLine[];
  issues: unknown[];
  fullyIssued: boolean;
}

/** Read models for the production screens (material picker, issue plan). */
@Injectable()
export class ProductionLookupsService {
  constructor(
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    private readonly designsService: DesignsService,
    private readonly materialInfo: MaterialStockInfoService,
  ) {}

  async materialOptions(includeInactive = false): Promise<MaterialStockInfo[]> {
    const info = await this.materialInfo.info();
    return Array.from(info.values())
      .filter((m) => includeInactive || m.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Open job slips that can still take material, with how much of their BOM is still to issue. */
  async pendingIssuance(includeFullyIssued = false) {
    const slips = await this.slipModel
      .find({ status: { $in: ['CREATED', 'MATERIAL_ISSUED', 'IN_PROCESS', 'READY'] } })
      .sort({ createdAt: -1 })
      .lean();
    const out = [];
    for (const slip of slips) {
      const plan = await this.issuePlan(String(slip._id));
      if (plan.fullyIssued && !includeFullyIssued) continue;
      const bomLines = plan.lines.filter((l) => l.inBom);
      out.push({
        jobSlipId: String(slip._id),
        jobSlipNo: slip.docNo,
        jobType: slip.jobType,
        status: slip.status,
        jobWorkerId: String(slip.jobWorkerId),
        designId: String(slip.designId),
        totalGarments: plan.totalGarments,
        materialsInBom: bomLines.length,
        materialsPending: bomLines.filter((l) => l.pendingQty > 0.0005).length,
        anyIssued: plan.lines.some((l) => l.issuedQty > 0),
        fullyIssued: plan.fullyIssued,
        expectedCompletionDate: slip.expectedCompletionDate,
      });
    }
    return out;
  }

  /**
   * What a job slip needs from the warehouse: the design's active BOM x the slip's garments
   * (+ allowance), what has been issued so far (net of returns), what is still pending, and
   * how much MAIN-WH holds now. Materials issued that are not on the BOM are listed too.
   */
  async issuePlan(jobSlipId: string): Promise<IssuePlan> {
    if (!Types.ObjectId.isValid(jobSlipId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    }
    const slip = await this.slipModel.findById(jobSlipId).lean();
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');

    const totalGarments = roundQty(
      (slip.expectedOutputLines ?? []).reduce((s, l) => s.plus(l.expectedQty ?? 0), toDecimal(0)),
    );

    type Acc = {
      roles: Set<string>;
      perGarment: Decimal;
      required: Decimal;
      allowancePct: number;
    };
    const bomByVariant = new Map<string, Acc>();
    let bomVersionId: string | undefined;
    if (slip.jobType === 'MANUFACTURING' && slip.designId) {
      const bom = await this.designsService.getCurrentBom(String(slip.designId));
      if (bom) {
        bomVersionId = String(bom._id);
        for (const line of bom.lines) {
          const key = String(line.materialVariantId);
          const acc = bomByVariant.get(key) ?? {
            roles: new Set<string>(),
            perGarment: toDecimal(0),
            required: toDecimal(0),
            allowancePct: line.allowancePct ?? 0,
          };
          acc.roles.add(line.role);
          acc.perGarment = acc.perGarment.plus(line.qtyPerGarmentBase);
          acc.required = acc.required.plus(
            toDecimal(totalGarments)
              .times(line.qtyPerGarmentBase)
              .times(toDecimal(1).plus(toDecimal(line.allowancePct ?? 0).dividedBy(100))),
          );
          bomByVariant.set(key, acc);
        }
      }
    }

    const issues = await this.issueModel
      .find({ jobSlipId: slip._id })
      .sort({ createdAt: -1 })
      .lean();
    const materialLines = await this.materialLineModel.find({ jobSlipId: slip._id }).lean();

    // job_material_lines are keyed by stock item; map back to the variant through the issues.
    const allVariantIds = new Set<string>(bomByVariant.keys());
    for (const issue of issues) {
      for (const l of issue.lines) allVariantIds.add(String(l.materialVariantId));
    }
    const info = await this.materialInfo.info(Array.from(allVariantIds));
    const variantByStockItem = new Map<string, string>();
    for (const [variantId, i] of info) {
      if (i.stockItemId) variantByStockItem.set(i.stockItemId, variantId);
    }
    const issuedByVariant = new Map<string, { issued: Decimal; returned: Decimal }>();
    for (const ml of materialLines) {
      const variantId = variantByStockItem.get(String(ml.stockItemId));
      if (!variantId) continue;
      const acc = issuedByVariant.get(variantId) ?? {
        issued: toDecimal(0),
        returned: toDecimal(0),
      };
      acc.issued = acc.issued.plus(ml.qtyIssued ?? 0);
      acc.returned = acc.returned.plus(ml.qtyReturned ?? 0);
      issuedByVariant.set(variantId, acc);
    }

    const lines: IssuePlanLine[] = [];
    for (const variantId of allVariantIds) {
      const bom = bomByVariant.get(variantId);
      const issued = issuedByVariant.get(variantId);
      if (!bom && !issued) continue; // a draft/cancelled issue line only
      const i = info.get(variantId);
      const net = issued ? issued.issued.minus(issued.returned) : toDecimal(0);
      const required = bom?.required ?? toDecimal(0);
      lines.push({
        materialVariantId: variantId,
        materialName: i?.name ?? variantId,
        uom: i?.uom ?? '',
        roles: bom ? Array.from(bom.roles) : [],
        qtyPerGarmentBase: bom ? roundQty(bom.perGarment) : 0,
        allowancePct: bom?.allowancePct ?? 0,
        requiredQty: roundQty(required),
        issuedQty: roundQty(net),
        returnedQty: issued ? roundQty(issued.returned) : 0,
        pendingQty: roundQty(Decimal.max(0, required.minus(net))),
        mainWhOnHand: i?.mainWhOnHand ?? 0,
        inBom: !!bom,
      });
    }
    lines.sort(
      (a, b) => Number(b.inBom) - Number(a.inBom) || a.materialName.localeCompare(b.materialName),
    );

    const issueRows = issues.map((iss) => ({
      ...iss,
      lines: iss.lines.map((l) => ({
        ...l,
        materialName: info.get(String(l.materialVariantId))?.name ?? String(l.materialVariantId),
        uom: info.get(String(l.materialVariantId))?.uom ?? '',
      })),
    }));

    const bomLines = lines.filter((l) => l.inBom);
    return {
      jobSlipId: String(slip._id),
      jobSlipNo: slip.docNo,
      jobType: slip.jobType,
      status: slip.status,
      totalGarments,
      bomVersionId,
      lines,
      issues: issueRows,
      fullyIssued: bomLines.length > 0 && bomLines.every((l) => l.pendingQty <= 0.0005),
    };
  }
}

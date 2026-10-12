import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaterialIssue, MaterialIssueDocument } from '../jobwork/schemas/material-issue.schema';
import { JobSlip, JobSlipDocument } from '../jobwork/schemas/job-slip.schema';
import { StockLedgerEntry, StockLedgerDocument } from '../inventory/schemas/stock-ledger.schema';
import { CompanySettingsService } from '../master/company-settings.service';
import { JobworkLookupService } from '../jobwork/jobwork-lookup.service';
import { ProblemException } from '../common/errors/problem.exception';
import { roundMoney, roundQty, toDecimal } from '../common/utils/decimal';
import { renderPrintDocument } from './print-template.util';

export interface JobWorkChallan {
  challanNo: string;
  challanDate: Date;
  materialIssueId: string;
  jobSlipNo?: string;
  consigner: { name: string; address?: string; gstin?: string; state?: string; stateCode?: string };
  consignee: { name: string; address?: string; gstin?: string; stateCode?: string };
  placeOfSupply: string;
  interState: boolean;
  purpose: string;
  lines: Array<{
    description: string;
    bomRole?: string;
    hsn?: string;
    qty: number;
    uom: string;
    rate: number;
    taxableValue: number;
  }>;
  totalQty: number;
  totalValue: number;
  returnDueBy: Date;
  declaration: string;
  status: string;
}

/** GSTIN positions 1-2 are the state code. */
const stateCodeOf = (gstin?: string) =>
  gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : undefined;

/**
 * Appendix B item 2 / CGST Rule 55: a delivery challan for goods sent for job work, built
 * from a CONFIRMED material issue. Values come from the ledger rows the issue posted (qty x the
 * lot cost snapshot), so the challan value is exactly what left the warehouse.
 */
@Injectable()
export class JobWorkChallanService {
  constructor(
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(StockLedgerEntry.name) private readonly ledgerModel: Model<StockLedgerDocument>,
    private readonly companySettings: CompanySettingsService,
    private readonly lookup: JobworkLookupService,
  ) {}

  async build(issueId: string): Promise<JobWorkChallan> {
    if (!Types.ObjectId.isValid(issueId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Material issue not found.');
    }
    const issue = await this.issueModel.findById(issueId).lean();
    if (!issue) throw new ProblemException('NOT_FOUND', 404, 'Material issue not found.');
    if (issue.status !== 'CONFIRMED') {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'A delivery challan can only be issued for a confirmed material issue (goods actually sent).',
      );
    }
    const [slip, settings, workers, variants, rows] = await Promise.all([
      this.slipModel.findById(issue.jobSlipId).lean(),
      this.companySettings.get(),
      this.lookup.jobWorkers([issue.jobWorkerId]),
      this.lookup.materialVariants(issue.lines.map((l) => l.materialVariantId)),
      this.ledgerModel
        .find({ docType: 'MATERIAL_ISSUE', docId: issue._id, movementType: 'ISSUE' })
        .lean(),
    ]);
    const worker = workers.get(String(issue.jobWorkerId));
    const [designs, ptypes] = await Promise.all([
      this.lookup.designs([slip?.designId]),
      this.lookup.processingTypes([slip?.processingTypeId]),
    ]);
    const design = slip ? designs.get(String(slip.designId)) : undefined;

    const lines = issue.lines.map((l) => {
      const mv = variants.get(String(l.materialVariantId));
      const posted = rows.filter((r) => String(r.docLineId) === String(l._id));
      const value = posted.reduce((s, r) => s.plus(toDecimal(r.qty).times(r.unitCost)), toDecimal(0));
      const qty = roundQty(posted.reduce((s, r) => s + r.qty, 0) || l.qtyBase);
      return {
        description: mv?.name ?? 'Material',
        bomRole: l.bomRole,
        hsn: undefined as string | undefined, // materials carry no HSN in master data yet
        qty,
        uom: mv?.uom ?? '',
        rate: qty > 0 ? roundMoney(value.dividedBy(qty)) : 0,
        taxableValue: roundMoney(value),
      };
    });

    const companyCode = stateCodeOf(settings?.gstin);
    const workerCode = stateCodeOf(worker?.gstin);
    const interState = !!companyCode && !!workerCode && companyCode !== workerCode;
    const purpose =
      slip?.jobType === 'PROCESSING'
        ? `Sent for job work - processing${slip?.processingTypeId ? ` (${ptypes.get(String(slip.processingTypeId)) ?? ''})` : ''}${design ? ` for design ${design.designNo}` : ''}; to be returned as processed material`
        : `Sent for job work - manufacturing of design ${design ? `${design.designNo} ${design.name}` : ''}; to be returned as finished goods`;
    const returnDueBy = new Date(issue.docDate);
    returnDueBy.setFullYear(returnDueBy.getFullYear() + 1);

    return {
      challanNo: issue.docNo,
      challanDate: issue.docDate,
      materialIssueId: String(issue._id),
      jobSlipNo: slip?.docNo,
      consigner: {
        name: settings?.legalName ?? 'Company',
        address: settings?.address,
        gstin: settings?.gstin,
        state: settings?.state,
        stateCode: companyCode,
      },
      consignee: {
        name: worker?.name ?? '',
        address: worker?.address,
        gstin: worker?.gstin,
        stateCode: workerCode,
      },
      placeOfSupply: worker?.address ?? (workerCode ? `State code ${workerCode}` : ''),
      interState,
      purpose,
      lines,
      totalQty: roundQty(lines.reduce((s, l) => s + l.qty, 0)),
      totalValue: roundMoney(lines.reduce((s, l) => s.plus(l.taxableValue), toDecimal(0))),
      returnDueBy,
      declaration:
        'Goods sent for job work under section 143 of the CGST Act, 2017 and Rule 55 of the CGST Rules - not a supply. Inputs to be received back within one year of the date of this challan.',
      status: issue.status,
    };
  }

  async html(issueId: string): Promise<string> {
    const c = await this.build(issueId);
    const fmt = (d: Date) => new Date(d).toLocaleDateString('en-IN');
    return renderPrintDocument({
      title: 'Delivery Challan - Job Work (Rule 55)',
      docNo: c.challanNo,
      docDate: c.challanDate,
      companyName: c.consigner.name,
      companyAddress: c.consigner.address,
      companyGstin: c.consigner.gstin,
      parties: [
        {
          label: 'Consigner',
          name: c.consigner.name,
          address: [c.consigner.address, c.consigner.state].filter(Boolean).join(', '),
          gstin: c.consigner.gstin,
        },
        {
          label: 'Consignee (job worker)',
          name: c.consignee.name,
          address: c.consignee.address,
          gstin: c.consignee.gstin ?? 'Unregistered',
        },
      ],
      meta: [
        { label: 'Challan no.', value: c.challanNo },
        { label: 'Date', value: fmt(c.challanDate) },
        { label: 'Job slip', value: c.jobSlipNo ?? '' },
        { label: 'Place of supply', value: c.placeOfSupply },
        { label: 'Movement', value: c.interState ? 'Inter-state' : 'Intra-state' },
        { label: 'Purpose', value: c.purpose },
        { label: 'Return due by', value: fmt(c.returnDueBy) },
      ],
      columns: ['#', 'Description of goods', 'HSN', 'Qty', 'Unit', 'Rate', 'Value (Rs)'],
      rows: c.lines.map((l, i) => [
        i + 1,
        `${l.description}${l.bomRole ? ` (${l.bomRole})` : ''}`,
        l.hsn ?? '-',
        l.qty,
        l.uom,
        l.rate.toFixed(2),
        l.taxableValue.toFixed(2),
      ]),
      totals: [
        { label: 'Total quantity', value: String(c.totalQty) },
        { label: 'Total value (not a supply)', value: c.totalValue.toFixed(2), emphasis: true },
      ],
      notes: `${c.declaration}\n\nReceived the above goods in good condition.\n\nFor ${c.consigner.name}: ____________________        Job worker signature: ____________________`,
    });
  }
}

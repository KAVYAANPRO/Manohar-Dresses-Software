import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from '../sales/schemas/invoice.schema';
import { JobSlip, JobSlipDocument } from '../jobwork/schemas/job-slip.schema';
import { MaterialIssue, MaterialIssueDocument } from '../jobwork/schemas/material-issue.schema';
import { JobWorker, JobWorkerDocument } from '../master/schemas/job-worker.schema';
import { Design, DesignDocument } from '../design/schemas/design.schema';
import { DesignVariant, DesignVariantDocument } from '../design/schemas/design-variant.schema';
import { Colour, ColourDocument } from '../master/schemas/colour.schema';
import { Size, SizeDocument } from '../master/schemas/size.schema';
import { Material, MaterialDocument, MaterialVariant, MaterialVariantDocument } from '../master/schemas/material.schema';
import { CompanySettingsService } from '../master/company-settings.service';
import { renderPrintDocument } from './print-template.util';
import { ProblemException } from '../common/errors/problem.exception';

/** DOC-01, JOB-05: print-ready HTML for the three documents daily operations actually print. */
@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    @InjectModel(JobWorker.name) private readonly jobWorkerModel: Model<JobWorkerDocument>,
    @InjectModel(Design.name) private readonly designModel: Model<DesignDocument>,
    @InjectModel(DesignVariant.name) private readonly variantModel: Model<DesignVariantDocument>,
    @InjectModel(Colour.name) private readonly colourModel: Model<ColourDocument>,
    @InjectModel(Size.name) private readonly sizeModel: Model<SizeDocument>,
    @InjectModel(Material.name) private readonly materialModel: Model<MaterialDocument>,
    @InjectModel(MaterialVariant.name) private readonly materialVariantModel: Model<MaterialVariantDocument>,
    private readonly companySettings: CompanySettingsService,
  ) {}

  async invoicePrint(id: string): Promise<string> {
    const invoice = await this.invoiceModel.findById(id).lean();
    if (!invoice) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');
    if (invoice.status !== 'CONFIRMED') {
      throw new ProblemException('VALIDATION_FAILED', 422, 'Only a confirmed invoice can be printed.');
    }
    const settings = await this.companySettings.get();
    const variantNames = await this.designVariantNames(invoice.lines.map((l) => String(l.designVariantId)));

    const rows = invoice.lines.map((l) => [
      variantNames.get(String(l.designVariantId)) ?? '',
      l.hsn,
      l.qty,
      l.unitRate.toFixed(2),
      l.discountAmount.toFixed(2),
      `${l.taxRatePct}%`,
      (l.cgst + l.sgst + l.igst).toFixed(2),
      l.lineTotal.toFixed(2),
    ]);

    return renderPrintDocument({
      title: 'Tax Invoice',
      docNo: invoice.docNo,
      docDate: invoice.docDate,
      companyName: settings?.legalName ?? 'Company',
      companyAddress: settings?.address,
      companyGstin: settings?.gstin,
      parties: [
        {
          label: 'Bill to',
          name: invoice.customerNameSnapshot,
          address: invoice.customerAddressSnapshot,
          gstin: invoice.customerGstinSnapshot,
        },
      ],
      meta: [
        { label: 'Place of supply', value: invoice.placeOfSupply ?? '' },
        { label: 'Tax type', value: invoice.isIntraState ? 'CGST + SGST' : 'IGST' },
      ],
      columns: ['Item', 'HSN', 'Qty', 'Rate', 'Discount', 'Tax rate', 'Tax amount', 'Total'],
      rows,
      totals: [
        { label: 'Subtotal', value: invoice.subtotal.toFixed(2) },
        { label: 'Discount', value: invoice.discountTotal.toFixed(2) },
        { label: 'Taxable value', value: invoice.taxableTotal.toFixed(2) },
        ...(invoice.isIntraState
          ? [
              { label: 'CGST', value: invoice.cgstTotal.toFixed(2) },
              { label: 'SGST', value: invoice.sgstTotal.toFixed(2) },
            ]
          : [{ label: 'IGST', value: invoice.igstTotal.toFixed(2) }]),
        { label: 'Round off', value: invoice.roundOff.toFixed(2) },
        { label: 'Grand total', value: invoice.grandTotal.toFixed(2), emphasis: true },
      ],
      notes: invoice.notes,
    });
  }

  /** `showRate` false omits the agreed job-work rate (AUTH-07) for viewers without a job-work money permission. */
  async jobSlipPrint(id: string, showRate = true): Promise<string> {
    const slip = await this.jobSlipModel.findById(id).lean();
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    const [jobWorker, design, settings] = await Promise.all([
      this.jobWorkerModel.findById(slip.jobWorkerId).lean(),
      this.designModel.findById(slip.designId).lean(),
      this.companySettings.get(),
    ]);

    const colourIds = slip.expectedOutputLines.map((l) => l.colourId).filter(Boolean);
    const sizeIds = slip.expectedOutputLines.map((l) => l.sizeId).filter(Boolean);
    const materialVariantIds = slip.expectedOutputLines.map((l) => l.materialVariantId).filter(Boolean);
    const [colours, sizes, materialVariants] = await Promise.all([
      this.colourModel.find({ _id: { $in: colourIds } }).lean(),
      this.sizeModel.find({ _id: { $in: sizeIds } }).lean(),
      this.materialVariantModel.find({ _id: { $in: materialVariantIds } }).populate('materialId').lean(),
    ]);
    const colourById = new Map(colours.map((c) => [String(c._id), c.name]));
    const sizeById = new Map(sizes.map((s) => [String(s._id), s.name]));
    const materialVariantById = new Map(
      materialVariants.map((v) => [String(v._id), (v.materialId as any)?.name ?? '']),
    );

    const rows = slip.expectedOutputLines.map((l) => [
      l.colourId
        ? `${design?.name ?? ''} - ${colourById.get(String(l.colourId)) ?? ''} - ${sizeById.get(String(l.sizeId)) ?? ''}`
        : materialVariantById.get(String(l.materialVariantId)) ?? '',
      l.expectedQty,
    ]);

    return renderPrintDocument({
      title: `Job Slip (${slip.jobType === 'MANUFACTURING' ? 'Manufacturing' : 'Processing'})`,
      docNo: slip.docNo,
      docDate: slip.docDate,
      companyName: settings?.legalName ?? 'Company',
      companyAddress: settings?.address,
      companyGstin: settings?.gstin,
      parties: [
        {
          label: 'Job worker',
          name: jobWorker?.name ?? '',
          address: jobWorker?.address,
          gstin: jobWorker?.gstin,
        },
      ],
      meta: [
        { label: 'Design', value: design?.designNo ?? '' },
        { label: 'Charge basis', value: showRate ? `${slip.chargeBasis} @ ${slip.agreedRate}` : slip.chargeBasis },
        { label: 'Expected completion', value: slip.expectedCompletionDate ? new Date(slip.expectedCompletionDate).toLocaleDateString('en-IN') : '' },
        { label: 'Status', value: slip.status },
      ],
      columns: ['Expected output', 'Qty'],
      rows,
      notes: design?.manufacturingInstructions,
    });
  }

  async materialIssuePrint(id: string): Promise<string> {
    const issue = await this.issueModel.findById(id).lean();
    if (!issue) throw new ProblemException('NOT_FOUND', 404, 'Material issue not found.');
    const [jobWorker, slip, settings] = await Promise.all([
      this.jobWorkerModel.findById(issue.jobWorkerId).lean(),
      this.jobSlipModel.findById(issue.jobSlipId).lean(),
      this.companySettings.get(),
    ]);
    const materialVariants = await this.materialVariantModel
      .find({ _id: { $in: issue.lines.map((l) => l.materialVariantId) } })
      .populate('materialId colourId')
      .lean();
    const nameByVariant = new Map(
      materialVariants.map((v) => [
        String(v._id),
        `${(v.materialId as any)?.name ?? ''} - ${(v.colourId as any)?.name ?? ''}`,
      ]),
    );

    const rows = issue.lines.map((l) => [
      nameByVariant.get(String(l.materialVariantId)) ?? '',
      l.bomRole ?? '',
      l.qtyBase,
    ]);

    return renderPrintDocument({
      title: 'Material Issue / Delivery Challan',
      docNo: issue.docNo,
      docDate: issue.docDate,
      companyName: settings?.legalName ?? 'Company',
      companyAddress: settings?.address,
      companyGstin: settings?.gstin,
      parties: [
        {
          label: 'Sent to (job worker)',
          name: jobWorker?.name ?? '',
          address: jobWorker?.address,
          gstin: jobWorker?.gstin,
        },
      ],
      meta: [{ label: 'Job slip', value: slip?.docNo ?? '' }, { label: 'Status', value: issue.status }],
      columns: ['Material', 'BOM role', 'Qty'],
      rows,
      notes: issue.notes,
    });
  }

  private async designVariantNames(ids: string[]): Promise<Map<string, string>> {
    const variants = await this.variantModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .populate('designId colourId sizeId')
      .lean();
    return new Map(
      variants.map((v) => [
        String(v._id),
        `${(v.designId as any)?.name ?? ''} ${(v.colourId as any)?.name ?? ''} ${(v.sizeId as any)?.name ?? ''}`.trim(),
      ]),
    );
  }
}

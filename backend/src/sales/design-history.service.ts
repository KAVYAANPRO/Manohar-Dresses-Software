import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobSlip, JobSlipDocument } from '../jobwork/schemas/job-slip.schema';
import { JobReceipt, JobReceiptDocument } from '../jobwork/schemas/job-receipt.schema';
import { Purchase, PurchaseDocument } from '../purchasing/schemas/purchase.schema';
import { SalesOrder, SalesOrderDocument } from './schemas/sales-order.schema';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import { DesignVariant, DesignVariantDocument } from '../design/schemas/design-variant.schema';
import { DesignsService } from '../design/designs.service';
import { CostingService } from '../costing/costing.service';
import { ReadyStockService } from '../readystock/ready-stock.service';
import { ProblemException } from '../common/errors/problem.exception';

/** TRC-02: "The design screen shows its history: material purchases, jobs, receipts, cost, stock, sales." One call, one join per section - no recursion, same fixed-depth style as TRC-01. */
@Injectable()
export class DesignHistoryService {
  constructor(
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(SalesOrder.name) private readonly salesOrderModel: Model<SalesOrderDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(DesignVariant.name) private readonly variantModel: Model<DesignVariantDocument>,
    private readonly designsService: DesignsService,
    private readonly costingService: CostingService,
    private readonly readyStockService: ReadyStockService,
  ) {}

  async getHistory(designId: string, includeCost: boolean, includeRates: boolean) {
    const design = await this.designsService.findById(designId);
    if (!design) throw new ProblemException('NOT_FOUND', 404, 'Design not found.');

    const designObjectId = new Types.ObjectId(designId);
    const variants = await this.variantModel.find({ designId: designObjectId }).lean();
    const variantIds = variants.map((v) => v._id);

    const jobSlips = await this.jobSlipModel.find({ designId: designObjectId }).sort({ createdAt: -1 }).lean();
    const jobSlipIds = jobSlips.map((s) => s._id);

    const receipts = await this.receiptModel
      .find({ jobSlipId: { $in: jobSlipIds }, status: 'CONFIRMED' })
      .sort({ createdAt: -1 })
      .lean();

    const bomVersion = await this.designsService.getCurrentBom(designId);
    const materialVariantIds = bomVersion?.lines.map((l) => l.materialVariantId) ?? [];
    const purchases = await this.purchaseModel
      .find({ 'lines.materialVariantId': { $in: materialVariantIds }, status: { $ne: 'CANCELLED' } })
      .sort({ docDate: -1 })
      .lean();

    const salesOrders = await this.salesOrderModel
      .find({ 'lines.designVariantId': { $in: variantIds } })
      .sort({ createdAt: -1 })
      .lean();
    const invoices = await this.invoiceModel
      .find({ 'lines.designVariantId': { $in: variantIds }, status: 'CONFIRMED' })
      .sort({ docDate: -1 })
      .lean();

    const stock = await this.readyStockService.summary({ designId }, includeCost);
    const cost = includeCost ? await this.costingService.getMarginsForDesign(designId) : undefined;

    return {
      designId,
      designNo: design.designNo,
      name: design.name,
      jobs: jobSlips.map((s) => ({
        id: String(s._id),
        docNo: s.docNo,
        jobType: s.jobType,
        jobWorkerId: String(s.jobWorkerId),
        status: s.status,
        docDate: s.docDate,
      })),
      receipts: receipts.map((r) => ({
        id: String(r._id),
        docNo: r.docNo,
        jobSlipId: String(r.jobSlipId),
        docDate: r.docDate,
      })),
      materialPurchases: purchases.map((p) => ({
        id: String(p._id),
        docNo: p.docNo,
        docDate: p.docDate,
        supplierId: String(p.supplierId),
        status: p.status,
        ...(includeRates
          ? { totalAmount: p.lines.reduce((s: number, l: any) => s + l.amount, 0) + (p.otherCharges ?? 0) }
          : {}),
      })),
      cost,
      stock,
      salesOrders: salesOrders.map((o) => ({
        id: String(o._id),
        docNo: o.docNo,
        docDate: o.docDate,
        customerId: String(o.customerId),
        status: o.status,
      })),
      invoices: invoices.map((i) => ({
        id: String(i._id),
        docNo: i.docNo,
        docDate: i.docDate,
        customerId: String(i.customerId),
        grandTotal: i.grandTotal,
      })),
    };
  }
}

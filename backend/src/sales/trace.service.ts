import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InvoiceLineAllocation,
  InvoiceLineAllocationDocument,
} from './schemas/invoice-line-allocation.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';
import { JobSlip, JobSlipDocument } from '../jobwork/schemas/job-slip.schema';
import {
  JobMaterialLine,
  JobMaterialLineDocument,
} from '../jobwork/schemas/job-material-line.schema';
import { Inward, InwardDocument } from '../purchasing/schemas/inward.schema';
import { Purchase, PurchaseDocument } from '../purchasing/schemas/purchase.schema';
import { Supplier, SupplierDocument } from '../master/schemas/supplier.schema';
import { ProblemException } from '../common/errors/problem.exception';

export interface RawMaterialTrace {
  jobMaterialLineId: string;
  stockItemId: string;
  lotId: string;
  lotNo: string;
  qtyIssued: number;
  unitCost: number;
  inward?: {
    inwardId: string;
    docNo: string;
    purchaseId: string;
    purchaseDocNo: string;
    supplierId: string;
    supplierName: string;
  };
}

export interface FinishedLotTrace {
  lotId: string;
  lotNo: string;
  allocatedQty: number;
  unitCost: number;
  jobSlipId?: string;
  jobSlipDocNo?: string;
  jobWorkerId?: string;
  rawMaterials: RawMaterialTrace[];
}

/**
 * TRC-01: "From an invoice line, lot, or design, walk back to job slip, factory, issued
 * material lots, inward, purchase, supplier." tech.md §8.5 - a fixed-depth set of joins, no
 * recursion needed. TRC-03: stops at lot/job level, not per-garment, by construction.
 */
@Injectable()
export class TraceService {
  constructor(
    @InjectModel(InvoiceLineAllocation.name)
    private readonly allocationModel: Model<InvoiceLineAllocationDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    @InjectModel(JobSlip.name) private readonly jobSlipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(Inward.name) private readonly inwardModel: Model<InwardDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Supplier.name) private readonly supplierModel: Model<SupplierDocument>,
  ) {}

  async traceInvoiceLine(
    invoiceLineId: string,
  ): Promise<{ invoiceLineId: string; finishedLots: FinishedLotTrace[] }> {
    const allocations = await this.allocationModel
      .find({ invoiceLineId: new Types.ObjectId(invoiceLineId) })
      .lean();
    if (allocations.length === 0) {
      throw new ProblemException(
        'NOT_FOUND',
        404,
        'No stock allocation found for this invoice line (is the invoice confirmed?).',
      );
    }

    const finishedLots: FinishedLotTrace[] = [];
    for (const allocation of allocations) {
      const lot = await this.lotModel.findById(allocation.lotId).lean();
      if (!lot) continue;

      const trace: FinishedLotTrace = {
        lotId: String(lot._id),
        lotNo: lot.lotNo,
        allocatedQty: allocation.qty,
        unitCost: allocation.unitCost,
        rawMaterials: [],
      };

      if (lot.originJobSlipId) {
        const jobSlip = await this.jobSlipModel.findById(lot.originJobSlipId).lean();
        if (jobSlip) {
          trace.jobSlipId = String(jobSlip._id);
          trace.jobSlipDocNo = (jobSlip as any).docNo;
          trace.jobWorkerId = String(jobSlip.jobWorkerId);

          const materialLines = await this.materialLineModel
            .find({ jobSlipId: jobSlip._id })
            .lean();
          for (const line of materialLines) {
            const rawLot = await this.lotModel.findById(line.lotId).lean();
            const raw: RawMaterialTrace = {
              jobMaterialLineId: String(line._id),
              stockItemId: String(line.stockItemId),
              lotId: String(line.lotId),
              lotNo: rawLot?.lotNo ?? '',
              qtyIssued: line.qtyIssued,
              unitCost: line.unitCost,
            };

            if (rawLot?.originDocType === 'INWARD' && rawLot.originDocId) {
              const inward = await this.inwardModel.findById(rawLot.originDocId).lean();
              if (inward) {
                const purchase = await this.purchaseModel.findById(inward.purchaseId).lean();
                const supplier = purchase
                  ? await this.supplierModel.findById(purchase.supplierId).lean()
                  : null;
                raw.inward = {
                  inwardId: String(inward._id),
                  docNo: (inward as any).docNo,
                  purchaseId: purchase ? String(purchase._id) : '',
                  purchaseDocNo: purchase ? (purchase as any).docNo : '',
                  supplierId: supplier ? String(supplier._id) : '',
                  supplierName: supplier?.name ?? '',
                };
              }
            }

            trace.rawMaterials.push(raw);
          }
        }
      }

      finishedLots.push(trace);
    }

    return { invoiceLineId, finishedLots };
  }
}

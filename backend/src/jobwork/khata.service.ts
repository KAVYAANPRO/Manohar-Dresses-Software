import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobWorkerPayment, JobWorkerPaymentDocument } from './schemas/job-worker-payment.schema';
import { JobCharge, JobChargeDocument } from './schemas/job-charge.schema';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { JobReceipt, JobReceiptDocument } from './schemas/job-receipt.schema';
import { JobWorker, JobWorkerDocument } from '../master/schemas/job-worker.schema';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import {
  InvalidStateTransitionException,
  ProblemException,
  ValidationFailedException,
} from '../common/errors/problem.exception';
import { roundMoney } from '../common/utils/decimal';
import { CreateJobWorkerPaymentDto } from './dto/job-worker-payment.dto';
import {
  buildKhataLedger,
  KhataChargeInput,
  KhataLedger,
  KhataPaymentInput,
  KhataTotals,
} from './khata-ledger.util';

const BASIS_LABEL: Record<string, string> = {
  PER_PIECE: 'pcs',
  PER_METER: 'm',
  LUMP_SUM: 'lump sum',
};

export interface KhataSummaryRow extends KhataTotals {
  jobWorkerId: string;
  name: string;
  type: 'FACTORY' | 'ARTISAN';
  specialty?: string;
  mobile?: string;
  isActive: boolean;
}

/**
 * Karigar khata book: per-party account of job-work charges earned (read from `job_charges`,
 * BR-13 - never duplicated here) against advances and payments handed over
 * (`job_worker_payments`). Balance = earned - (advances + payments).
 */
@Injectable()
export class KhataService {
  constructor(
    @InjectModel(JobWorkerPayment.name)
    private readonly paymentModel: Model<JobWorkerPaymentDocument>,
    @InjectModel(JobCharge.name) private readonly chargeModel: Model<JobChargeDocument>,
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(JobWorker.name) private readonly jobWorkerModel: Model<JobWorkerDocument>,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  listPayments(filter: { jobWorkerId?: string; status?: string }) {
    const q: Record<string, unknown> = {};
    if (filter.jobWorkerId) q.jobWorkerId = new Types.ObjectId(filter.jobWorkerId);
    if (filter.status) q.status = filter.status;
    return this.paymentModel.find(q).sort({ docDate: -1, createdAt: -1 }).lean();
  }

  async createPayment(
    dto: CreateJobWorkerPaymentDto,
    actorId: string,
  ): Promise<JobWorkerPaymentDocument> {
    const worker = await this.jobWorkerModel.findById(dto.jobWorkerId).lean();
    if (!worker) throw new ProblemException('NOT_FOUND', 404, 'Factory / karigar not found.');
    if (worker.isActive === false) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `${worker.name} is inactive. Reactivate the party before recording a payment.`,
        { jobWorkerId: 'inactive' },
      );
    }

    if (dto.jobSlipId) {
      const slip = await this.slipModel.findById(dto.jobSlipId).lean();
      if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
      if (String(slip.jobWorkerId) !== String(worker._id)) {
        throw new ValidationFailedException(
          { jobSlipId: 'belongs to a different party' },
          `Job slip ${slip.docNo} is not assigned to ${worker.name}.`,
        );
      }
      if (slip.status === 'CANCELLED') {
        throw new ValidationFailedException(
          { jobSlipId: 'cancelled' },
          `Job slip ${slip.docNo} is cancelled.`,
        );
      }
    }

    const date = dto.date ? new Date(dto.date) : new Date();
    // Allow "today" in any timezone: reject only dates more than a day ahead.
    if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new ValidationFailedException(
        { date: 'in the future' },
        'Payment date cannot be in the future.',
      );
    }

    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? new Date().getFullYear().toString();
    await this.numberSeries.ensureSeries('JOB_WORKER_PAYMENT', fy, 'KPAY');
    const docNo = await this.numberSeries.next('JOB_WORKER_PAYMENT', fy);

    return this.paymentModel.create({
      docNo,
      docDate: date,
      jobWorkerId: worker._id,
      kind: dto.kind,
      amount: roundMoney(dto.amount),
      mode: dto.mode ?? 'CASH',
      reference: dto.reference,
      jobSlipId: dto.jobSlipId ? new Types.ObjectId(dto.jobSlipId) : undefined,
      notes: dto.notes,
      status: 'POSTED',
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  /** Posted entries are never edited or deleted - a wrong one is cancelled with a reason. */
  async cancelPayment(id: string, reason: string, actorId: string) {
    const payment = await this.paymentModel.findById(id);
    if (!payment) throw new ProblemException('NOT_FOUND', 404, 'Payment entry not found.');
    if (payment.status === 'CANCELLED') {
      throw new InvalidStateTransitionException('This payment entry is already cancelled.');
    }
    payment.status = 'CANCELLED';
    payment.cancelReason = reason;
    payment.cancelledBy = actorId as any;
    payment.cancelledAt = new Date();
    payment.updatedBy = actorId as any;
    payment.version += 1;
    await payment.save();
    return payment;
  }

  async ledger(jobWorkerId: string): Promise<KhataLedger & { jobWorker: unknown }> {
    if (!Types.ObjectId.isValid(jobWorkerId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Factory / karigar not found.');
    }
    const worker = await this.jobWorkerModel.findById(jobWorkerId).lean();
    if (!worker) throw new ProblemException('NOT_FOUND', 404, 'Factory / karigar not found.');
    const { charges, payments } = await this.loadInputs([String(worker._id)]);
    return {
      jobWorker: {
        _id: worker._id,
        name: worker.name,
        type: worker.type,
        specialty: (worker as any).specialty,
        mobile: worker.mobile,
        isActive: worker.isActive,
      },
      ...buildKhataLedger(
        charges.get(String(worker._id)) ?? [],
        payments.get(String(worker._id)) ?? [],
      ),
    };
  }

  /** One row per party with its totals - the left-hand list on the Khata Book screen. */
  async summary(type?: string): Promise<KhataSummaryRow[]> {
    const filter: Record<string, unknown> = {};
    if (type === 'FACTORY' || type === 'ARTISAN') filter.type = type;
    const workers = await this.jobWorkerModel.find(filter).sort({ name: 1 }).lean();
    const ids = workers.map((w) => String(w._id));
    const { charges, payments } = await this.loadInputs(ids);
    return workers.map((w) => {
      const id = String(w._id);
      const { totals } = buildKhataLedger(charges.get(id) ?? [], payments.get(id) ?? []);
      return {
        jobWorkerId: id,
        name: w.name,
        type: w.type,
        specialty: (w as any).specialty,
        mobile: w.mobile,
        isActive: w.isActive,
        ...totals,
      };
    });
  }

  private async loadInputs(jobWorkerIds: string[]): Promise<{
    charges: Map<string, KhataChargeInput[]>;
    payments: Map<string, KhataPaymentInput[]>;
  }> {
    const workerOids = jobWorkerIds.map((id) => new Types.ObjectId(id));
    const slips = await this.slipModel
      .find({ jobWorkerId: { $in: workerOids } })
      .select('_id docNo jobWorkerId')
      .lean();
    const slipById = new Map(slips.map((s) => [String(s._id), s]));

    const chargeRows = await this.chargeModel
      .find({ jobSlipId: { $in: slips.map((s) => s._id) } })
      .lean();
    const receipts = await this.receiptModel
      .find({ _id: { $in: chargeRows.map((c) => c.receiptId) } })
      .select('_id docNo docDate status')
      .lean();
    const receiptById = new Map(receipts.map((r) => [String(r._id), r]));

    const charges = new Map<string, KhataChargeInput[]>();
    for (const c of chargeRows) {
      const slip = slipById.get(String(c.jobSlipId));
      if (!slip) continue;
      const receipt = receiptById.get(String(c.receiptId));
      // Charges are written only on receipt confirm; ignore any whose receipt is not confirmed.
      if (receipt && (receipt as any).status && (receipt as any).status !== 'CONFIRMED') continue;
      const workerKey = String(slip.jobWorkerId);
      const unit = BASIS_LABEL[c.basis] ?? c.basis;
      const description =
        c.basis === 'LUMP_SUM'
          ? `${c.kind.toLowerCase()} charges for ${slip.docNo} (lump sum)`
          : `${c.kind.toLowerCase()} charges for ${slip.docNo}: ${c.quantity} ${unit} x ${c.rate}`;
      const list = charges.get(workerKey) ?? [];
      list.push({
        id: String(c._id),
        date: (receipt?.docDate as Date) ?? c.createdAt ?? new Date(0),
        amount: c.amount,
        jobSlipId: String(slip._id),
        jobSlipNo: slip.docNo,
        receiptNo: receipt?.docNo,
        description: description.charAt(0).toUpperCase() + description.slice(1),
      });
      charges.set(workerKey, list);
    }

    const paymentRows = await this.paymentModel
      .find({ jobWorkerId: { $in: workerOids }, status: 'POSTED' })
      .lean();
    const payments = new Map<string, KhataPaymentInput[]>();
    for (const p of paymentRows) {
      const key = String(p.jobWorkerId);
      const list = payments.get(key) ?? [];
      list.push({
        id: String(p._id),
        date: p.docDate,
        kind: p.kind,
        amount: p.amount,
        docNo: p.docNo,
        mode: p.mode,
        reference: p.reference,
        jobSlipId: p.jobSlipId ? String(p.jobSlipId) : undefined,
        jobSlipNo: p.jobSlipId ? slipById.get(String(p.jobSlipId))?.docNo : undefined,
        notes: p.notes,
      });
      payments.set(key, list);
    }
    return { charges, payments };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { PaymentAllocation, PaymentAllocationDocument } from './schemas/payment-allocation.schema';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import { Customer, CustomerDocument } from '../master/schemas/customer.schema';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { roundMoney } from '../common/utils/decimal';
import { ProblemException } from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { RequestContextStore } from '../common/context/request-context';
import { AllocatePaymentDto, RecordPaymentDto } from './dto/payment.dto';
import { derivePaymentStatus, invoiceBalance } from './sales-rules';

/**
 * SAL-09, tech.md §8.4. Invoice payment status is always derived from allocations plus credit
 * notes, never hand-set. A receipt may be recorded unallocated (an advance) and allocated later.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly model: Model<PaymentDocument>,
    @InjectModel(PaymentAllocation.name)
    private readonly allocationModel: Model<PaymentAllocationDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  /** Display-ready receipts: customer name and the invoice numbers each one was applied to. */
  async list(filter: Record<string, unknown> = {}): Promise<any[]> {
    const payments = await this.model
      .find(castObjectIdFilter(filter, ['customerId']))
      .sort({ date: -1, createdAt: -1 })
      .lean();
    const [allocs, customers] = await Promise.all([
      this.allocationModel.find({ paymentId: { $in: payments.map((p) => p._id) } }).lean(),
      this.customerModel
        .find({ _id: { $in: payments.map((p) => p.customerId) } })
        .select('name businessName')
        .lean(),
    ]);
    const invoices = await this.invoiceModel
      .find({ _id: { $in: allocs.map((a) => a.invoiceId) } })
      .select('docNo')
      .lean();
    const invNo = new Map(invoices.map((i) => [String(i._id), i.docNo]));
    const cById = new Map(customers.map((c) => [String(c._id), c]));
    return payments.map((p) => {
      const mine = allocs.filter((a) => String(a.paymentId) === String(p._id));
      const c = cById.get(String(p.customerId));
      return {
        ...p,
        customerName: c?.businessName || c?.name,
        allocations: mine.map((a) => ({
          invoiceId: String(a.invoiceId),
          invoiceNo: invNo.get(String(a.invoiceId)),
          amount: a.amount,
        })),
        unallocated: roundMoney(p.amount - p.amountAllocated),
      };
    });
  }

  allocationsForPayment(paymentId: string) {
    return this.allocationModel.find({ paymentId: new Types.ObjectId(paymentId) }).lean();
  }

  allocationsForInvoice(invoiceId: string) {
    return this.allocationModel.find({ invoiceId: new Types.ObjectId(invoiceId) }).lean();
  }

  /** SAL-09: pending-payments dashboard - every confirmed invoice not yet fully settled. */
  async pendingInvoices(customerId?: string) {
    const filter: Record<string, unknown> = { status: 'CONFIRMED', paymentStatus: { $ne: 'PAID' } };
    if (customerId) filter.customerId = new Types.ObjectId(customerId);
    const invoices = await this.invoiceModel.find(filter).sort({ docDate: 1 }).lean();
    const allocations = await this.allocationModel
      .find({ invoiceId: { $in: invoices.map((i) => i._id) } })
      .lean();
    const allocatedByInvoice = new Map<string, number>();
    for (const a of allocations) {
      const key = String(a.invoiceId);
      allocatedByInvoice.set(key, (allocatedByInvoice.get(key) ?? 0) + a.amount);
    }
    return invoices.map((inv) => {
      const bal = invoiceBalance(
        inv.grandTotal,
        allocatedByInvoice.get(String(inv._id)) ?? 0,
        inv.creditedTotal ?? 0,
      );
      return {
        invoiceId: String(inv._id),
        docNo: inv.docNo,
        docDate: inv.docDate,
        customerId: String(inv.customerId),
        customerName: inv.customerNameSnapshot,
        grandTotal: inv.grandTotal,
        otherCharges: inv.otherCharges ?? 0,
        allocated: bal.paidAmount,
        credited: bal.creditedAmount,
        outstanding: bal.outstanding,
        paymentStatus: inv.paymentStatus,
      };
    });
  }

  async record(dto: RecordPaymentDto, actorId: string): Promise<PaymentDocument> {
    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear;
    if (fy) await this.numberSeries.ensureSeries('PAYMENT', fy, 'RCPT');

    return this.transactionService.run(async (session) => {
      const customer = await this.customerModel.findById(dto.customerId).session(session).lean();
      if (!customer) throw new ProblemException('NOT_FOUND', 404, 'Customer not found.');

      const allocations = dto.allocations ?? [];
      const totalAllocated = roundMoney(allocations.reduce((s, a) => s + a.amount, 0));
      if (totalAllocated > dto.amount + 0.005) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          'Allocations cannot exceed the payment amount.',
        );
      }

      const [payment] = await this.model.create(
        [
          {
            customerId: new Types.ObjectId(dto.customerId),
            date: new Date(dto.date),
            amount: roundMoney(dto.amount),
            mode: dto.mode,
            reference: dto.reference,
            notes: dto.notes,
            docNo: fy ? await this.numberSeries.next('PAYMENT', fy, session) : undefined,
            amountAllocated: 0,
            createdBy: actorId,
          },
        ],
        { session },
      );

      for (const alloc of allocations) {
        await this.applyAllocation(payment, alloc.invoiceId, alloc.amount, session);
      }
      await payment.save({ session });
      return payment;
    });
  }

  /** Allocates (part of) an existing receipt's unallocated balance to an invoice. */
  async allocate(paymentId: string, dto: AllocatePaymentDto) {
    return this.transactionService.run(async (session) => {
      const payment = await this.model.findById(paymentId).session(session);
      if (!payment) throw new ProblemException('NOT_FOUND', 404, 'Payment not found.');
      const unallocated = roundMoney(payment.amount - payment.amountAllocated);
      if (dto.amount > unallocated + 0.005) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Only ${unallocated} of this receipt is unallocated.`,
        );
      }
      await this.applyAllocation(payment, dto.invoiceId, dto.amount, session);
      await payment.save({ session });
      return payment;
    });
  }

  /** Validates against the invoice's outstanding (grand total - payments - credit notes) and writes the allocation. */
  private async applyAllocation(
    payment: PaymentDocument,
    invoiceId: string,
    amount: number,
    session: ClientSession,
  ) {
    const invoice = Types.ObjectId.isValid(invoiceId)
      ? await this.invoiceModel.findById(invoiceId).session(session)
      : null;
    if (!invoice) throw new ProblemException('NOT_FOUND', 404, `Invoice ${invoiceId} not found.`);
    if (invoice.status !== 'CONFIRMED') {
      throw new ProblemException('VALIDATION_FAILED', 422, `Invoice ${invoice.docNo} is not confirmed.`);
    }
    if (String(invoice.customerId) !== String(payment.customerId)) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Invoice ${invoice.docNo} belongs to a different customer.`,
      );
    }
    const existing = await this.allocationModel.find({ invoiceId: invoice._id }).session(session).lean();
    const alreadyAllocated = existing.reduce((s, a) => s + a.amount, 0);
    const { outstanding } = invoiceBalance(invoice.grandTotal, alreadyAllocated, invoice.creditedTotal ?? 0);
    if (amount > outstanding + 0.005) {
      throw new ProblemException(
        'PAYMENT_EXCEEDS_OUTSTANDING',
        422,
        `Payment of ${amount} exceeds invoice ${invoice.docNo}'s outstanding balance of ${outstanding}.`,
        { amount: `Maximum ${outstanding}` },
        { outstanding },
      );
    }

    const prior = await this.allocationModel
      .findOne({ paymentId: payment._id, invoiceId: invoice._id })
      .session(session);
    if (prior) {
      prior.amount = roundMoney(prior.amount + amount);
      await prior.save({ session });
    } else {
      await this.allocationModel.create(
        [{ paymentId: payment._id, invoiceId: invoice._id, amount: roundMoney(amount) }],
        { session },
      );
    }
    payment.amountAllocated = roundMoney(payment.amountAllocated + amount);
    await this.refreshPaymentStatus(String(invoice._id), session);
  }

  /** Removes one allocation, e.g. to unblock an invoice cancellation (tech.md §8.3). */
  async unallocate(paymentId: string, invoiceId: string): Promise<void> {
    return this.transactionService.run(async (session) => {
      const allocation = await this.allocationModel
        .findOne({
          paymentId: new Types.ObjectId(paymentId),
          invoiceId: new Types.ObjectId(invoiceId),
        })
        .session(session);
      if (!allocation)
        throw new ProblemException('NOT_FOUND', 404, 'Payment allocation not found.');

      // The allocation row is a derived link (payment -> invoice) with a unique key, so it is
      // removed rather than flagged; the removal is written to the append-only audit log in the
      // same transaction so no money movement is ever lost from history.
      const ctx = RequestContextStore.get();
      await this.allocationModel.db.model('AuditLog').create(
        [
          {
            actorUserId: ctx?.userId ?? null,
            requestId: ctx?.requestId ?? null,
            module: 'sales',
            action: 'DELETE',
            entityType: 'payment_allocation',
            entityId: String(allocation._id),
            before: allocation.toObject(),
            after: null,
          },
        ],
        { session },
      );
      await this.allocationModel.deleteOne({ _id: allocation._id }).session(session);

      const payment = await this.model.findById(paymentId).session(session);
      if (payment) {
        payment.amountAllocated = roundMoney(
          Math.max(0, payment.amountAllocated - allocation.amount),
        );
        await payment.save({ session });
      }

      await this.refreshPaymentStatus(invoiceId, session);
    });
  }

  /** Re-derives Unpaid / Partial / Paid from allocations + credit notes. Also used by sales returns. */
  async refreshPaymentStatus(invoiceId: string, session: ClientSession): Promise<void> {
    const invoice = await this.invoiceModel.findById(invoiceId).session(session);
    if (!invoice) return;
    const allocations = await this.allocationModel
      .find({ invoiceId: invoice._id })
      .session(session)
      .lean();
    const allocated = roundMoney(allocations.reduce((s, a) => s + a.amount, 0));
    invoice.paymentStatus = derivePaymentStatus(invoice.grandTotal, allocated, invoice.creditedTotal ?? 0);
    await invoice.save({ session });
  }
}

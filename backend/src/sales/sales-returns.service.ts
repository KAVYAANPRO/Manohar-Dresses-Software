import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { SalesReturn, SalesReturnDocument } from './schemas/sales-return.schema';
import { CreditNote, CreditNoteDocument } from './schemas/credit-note.schema';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import {
  InvoiceLineAllocation,
  InvoiceLineAllocationDocument,
} from './schemas/invoice-line-allocation.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockService } from '../inventory/stock.service';
import { PaymentsService } from './payments.service';
import { SalesLookupService } from './sales-lookup.service';
import { TransactionService } from '../common/services/transaction.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { roundMoney, roundQty, toDecimal } from '../common/utils/decimal';
import {
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { castObjectIdFilter } from '../common/utils/cast-filter';
import { CreateSalesReturnDto } from './dto/sales-return.dto';
import { returnCreditForLine } from './sales-rules';

/**
 * SAL-10. A return is drafted against one confirmed invoice; confirming it, in one
 * transaction: (1) re-checks qty <= invoiced - already returned per line, (2) moves the very
 * lots that were sold back from Customer (virtual) to MAIN-WH (GOOD) or QUARANTINE (DAMAGED),
 * (3) issues a numbered credit note pro-rated from the invoice line (same GST split), and
 * (4) adds it to the invoice's creditedTotal, which reduces outstanding and re-derives
 * payment status.
 */
@Injectable()
export class SalesReturnsService {
  constructor(
    @InjectModel(SalesReturn.name) private readonly model: Model<SalesReturnDocument>,
    @InjectModel(CreditNote.name) private readonly creditNoteModel: Model<CreditNoteDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InvoiceLineAllocation.name)
    private readonly allocationModel: Model<InvoiceLineAllocationDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    private readonly stockService: StockService,
    private readonly paymentsService: PaymentsService,
    private readonly lookup: SalesLookupService,
    private readonly transactionService: TransactionService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  async list(filter: Record<string, unknown> = {}): Promise<any[]> {
    const rows = await this.model
      .find(castObjectIdFilter(filter, ['customerId', 'invoiceId']))
      .sort({ createdAt: -1 })
      .lean();
    const [customers, invoices, labels] = await Promise.all([
      this.lookup.names('customers', rows.map((r) => r.customerId)),
      this.invoiceModel
        .find({ _id: { $in: rows.map((r) => r.invoiceId) } })
        .select('docNo')
        .lean(),
      this.lookup.variantLabels(rows.flatMap((r) => r.lines.map((l) => l.designVariantId))),
    ]);
    const invNo = new Map(invoices.map((i) => [String(i._id), i.docNo]));
    return rows.map((r) => ({
      ...r,
      customerName:
        customers.get(String(r.customerId))?.businessName || customers.get(String(r.customerId))?.name,
      invoiceNo: invNo.get(String(r.invoiceId)),
      totalQty: roundQty(r.lines.reduce((s, l) => s + l.qty, 0)),
      lines: r.lines.map((l) => ({ ...l, ...(labels.get(String(l.designVariantId)) ?? {}) })),
    }));
  }

  async view(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) throw new ProblemException('NOT_FOUND', 404, 'Sales return not found.');
    const r = await this.model.findById(id).lean();
    if (!r) throw new ProblemException('NOT_FOUND', 404, 'Sales return not found.');
    const [rows] = await Promise.all([this.list({ _id: r._id })]);
    const creditNote = r.creditNoteId ? await this.creditNoteModel.findById(r.creditNoteId).lean() : null;
    return { ...rows[0], creditNote };
  }

  /** Builds priced return lines from the invoice, enforcing qty <= invoiced - returned. */
  private buildLines(invoice: InvoiceDocument | any, dto: CreateSalesReturnDto) {
    const requestedByLine = new Map<string, number>();
    for (const l of dto.lines) {
      requestedByLine.set(l.invoiceLineId, roundQty((requestedByLine.get(l.invoiceLineId) ?? 0) + l.qty));
    }
    for (const [lineId, qty] of requestedByLine) {
      const line = invoice.lines.find((x: any) => String(x._id) === lineId);
      if (!line) throw new ProblemException('NOT_FOUND', 404, `Invoice line ${lineId} not found on this invoice.`);
      const check = returnCreditForLine(line, qty);
      if (!check.ok) {
        throw new ProblemException(
          'RETURN_EXCEEDS_INVOICED',
          422,
          `Cannot return ${qty}: only ${roundQty(check.returnable)} of ${line.qty} invoiced is still returnable on this line.`,
          { qty: `Maximum ${roundQty(check.returnable)}` },
          { invoiceLineId: lineId, returnable: roundQty(check.returnable) },
        );
      }
    }
    return dto.lines.map((l) => {
      const line = invoice.lines.find((x: any) => String(x._id) === l.invoiceLineId);
      const credit = returnCreditForLine({ ...line, returnedQty: 0 }, l.qty);
      if (!credit.ok) throw new Error('unreachable');
      return {
        invoiceLineId: line._id,
        designVariantId: line.designVariantId,
        stockItemId: line.stockItemId,
        qty: l.qty,
        condition: l.condition,
        unitRate: credit.unitRate,
        taxableValue: credit.taxableValue,
        taxRatePct: credit.taxRatePct,
        cgst: credit.cgst,
        sgst: credit.sgst,
        igst: credit.igst,
        lineTotal: credit.lineTotal,
        lots: [],
      };
    });
  }

  private totals(lines: Array<{ taxableValue: number; cgst: number; sgst: number; igst: number }>) {
    const taxable = lines.reduce((s, l) => s.plus(l.taxableValue), new Decimal(0));
    const tax = lines.reduce((s, l) => s.plus(l.cgst).plus(l.sgst).plus(l.igst), new Decimal(0));
    const pre = taxable.plus(tax);
    const total = pre.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    return {
      taxableTotal: roundMoney(taxable),
      taxTotal: roundMoney(tax),
      roundOff: roundMoney(total.minus(pre)),
      creditTotal: total.toNumber(),
    };
  }

  async create(dto: CreateSalesReturnDto, actorId: string) {
    const invoice = Types.ObjectId.isValid(dto.invoiceId)
      ? await this.invoiceModel.findById(dto.invoiceId).lean()
      : null;
    if (!invoice) throw new ProblemException('NOT_FOUND', 404, 'Invoice not found.');
    if (invoice.status !== 'CONFIRMED') {
      throw new InvalidStateTransitionException('Returns can only be made against a confirmed invoice.');
    }
    const lines = this.buildLines(invoice, dto);
    const settings = await this.companySettings.get();
    const fy = settings?.currentFinancialYear ?? '00-00';
    await this.numberSeries.ensureSeries('SALES_RETURN', fy, 'SR');
    const docNo = await this.numberSeries.next('SALES_RETURN', fy);
    const created = await this.model.create({
      docNo,
      docDate: new Date(),
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      reason: dto.reason,
      notes: dto.notes,
      lines,
      status: 'DRAFT',
      ...this.totals(lines),
      createdBy: actorId,
      updatedBy: actorId,
    });
    if (dto.confirm) return this.confirm(String(created._id), actorId);
    return created;
  }

  async confirm(id: string, actorId: string) {
    const settings = await this.companySettings.get();
    if (!settings)
      throw new ProblemException('VALIDATION_FAILED', 500, 'Company settings are not configured.');
    await this.numberSeries.ensureSeries('CREDIT_NOTE', settings.currentFinancialYear, 'CN');

    return this.transactionService.run(async (session) => {
      const ret = await this.model.findById(id).session(session);
      if (!ret) throw new ProblemException('NOT_FOUND', 404, 'Sales return not found.');
      if (ret.status !== 'DRAFT') {
        throw new InvalidStateTransitionException(`Sales return is already ${ret.status}.`);
      }
      const invoice = await this.invoiceModel.findById(ret.invoiceId).session(session);
      if (!invoice || invoice.status !== 'CONFIRMED') {
        throw new InvalidStateTransitionException('The invoice is no longer confirmed.');
      }

      // Re-check inside the transaction: another return may have been confirmed meanwhile.
      this.buildLines(invoice.toObject(), {
        invoiceId: String(invoice._id),
        reason: ret.reason,
        lines: ret.lines.map((l) => ({
          invoiceLineId: String(l.invoiceLineId),
          qty: l.qty,
          condition: l.condition,
        })),
      });

      const [warehouse, quarantine, virtCustomer] = await Promise.all([
        this.locationModel.findOne({ code: 'MAIN-WH' }).session(session).lean(),
        this.locationModel.findOne({ code: 'QUARANTINE' }).session(session).lean(),
        this.locationModel.findOne({ code: 'VIRT-CUSTOMER' }).session(session).lean(),
      ]);
      if (!warehouse || !quarantine || !virtCustomer) {
        throw new ProblemException('VALIDATION_FAILED', 500, 'Stock locations are not seeded.');
      }

      for (const line of ret.lines) {
        // Return the very lots that were sold on this invoice line (keeps cost + traceability),
        // skipping what earlier returns already took back.
        const allocs = await this.allocationModel
          .find({ invoiceLineId: line.invoiceLineId })
          .sort({ createdAt: 1, _id: 1 })
          .session(session)
          .lean();
        const earlier = await this.model
          .find({ invoiceId: ret.invoiceId, status: 'CONFIRMED' })
          .session(session)
          .lean();
        const takenByLot = new Map<string, number>();
        for (const r of earlier) {
          for (const l of r.lines) {
            if (String(l.invoiceLineId) !== String(line.invoiceLineId)) continue;
            for (const p of l.lots ?? []) {
              takenByLot.set(String(p.lotId), (takenByLot.get(String(p.lotId)) ?? 0) + p.qty);
            }
          }
        }
        // Also lots already used by previous lines of THIS return for the same invoice line.
        for (const prev of ret.lines) {
          if (prev === line) break;
          if (String(prev.invoiceLineId) !== String(line.invoiceLineId)) continue;
          for (const p of prev.lots ?? []) {
            takenByLot.set(String(p.lotId), (takenByLot.get(String(p.lotId)) ?? 0) + p.qty);
          }
        }

        let remaining = toDecimal(line.qty);
        const lots: Array<{ lotId: Types.ObjectId; qty: number; unitCost: number }> = [];
        for (const a of allocs) {
          if (remaining.lte(0)) break;
          const free = toDecimal(a.qty).minus(takenByLot.get(String(a.lotId)) ?? 0);
          if (free.lte(0)) continue;
          const take = Decimal.min(free, remaining);
          lots.push({ lotId: a.lotId, qty: roundQty(take), unitCost: a.unitCost });
          takenByLot.set(String(a.lotId), (takenByLot.get(String(a.lotId)) ?? 0) + roundQty(take));
          remaining = remaining.minus(take);
        }
        if (remaining.gt(0.0005)) {
          throw new ProblemException(
            'RETURN_EXCEEDS_INVOICED',
            422,
            'Return quantity exceeds what was sold on this invoice line.',
          );
        }

        const to = line.condition === 'DAMAGED' ? quarantine : warehouse;
        for (const lot of lots) {
          await this.stockService.post(
            [
              {
                type: 'SALES_RETURN',
                stockItemId: String(line.stockItemId),
                lotId: String(lot.lotId),
                fromLocationId: String(virtCustomer._id),
                toLocationId: String(to._id),
                qty: lot.qty,
                doc: { type: 'SALES_RETURN', id: String(ret._id), lineId: String(line._id) },
                reason: `${ret.reason} (${line.condition})`,
              },
            ],
            session,
            actorId,
          );
        }
        line.lots = lots as any;

        const invLine = invoice.lines.id(String(line.invoiceLineId));
        if (invLine) invLine.returnedQty = roundQty((invLine.returnedQty ?? 0) + line.qty);
      }

      const totals = this.totals(ret.lines);
      const cgstTotal = roundMoney(ret.lines.reduce((s, l) => s + l.cgst, 0));
      const sgstTotal = roundMoney(ret.lines.reduce((s, l) => s + l.sgst, 0));
      const igstTotal = roundMoney(ret.lines.reduce((s, l) => s + l.igst, 0));
      const docNo = await this.numberSeries.next('CREDIT_NOTE', settings.currentFinancialYear, session);
      const [creditNote] = await this.creditNoteModel.create(
        [
          {
            docNo,
            docDate: new Date(),
            invoiceId: invoice._id,
            invoiceNo: invoice.docNo,
            customerId: invoice.customerId,
            salesReturnId: ret._id,
            reason: ret.reason,
            isIntraState: invoice.isIntraState,
            taxableTotal: totals.taxableTotal,
            cgstTotal,
            sgstTotal,
            igstTotal,
            roundOff: totals.roundOff,
            total: totals.creditTotal,
            createdBy: actorId,
          },
        ],
        { session },
      );

      invoice.creditedTotal = roundMoney((invoice.creditedTotal ?? 0) + totals.creditTotal);
      invoice.version += 1;
      await invoice.save({ session });
      await this.paymentsService.refreshPaymentStatus(String(invoice._id), session);

      Object.assign(ret, totals);
      ret.status = 'CONFIRMED';
      ret.creditNoteId = creditNote._id as Types.ObjectId;
      ret.creditNoteNo = docNo;
      ret.confirmedBy = actorId as any;
      ret.confirmedAt = new Date();
      ret.updatedBy = actorId as any;
      ret.version += 1;
      await ret.save({ session });
      return ret;
    });
  }

  /** Only a DRAFT can be cancelled; a confirmed return is permanent (its credit note is issued). */
  async cancel(id: string, reason: string, actorId: string) {
    const ret = await this.model.findById(id);
    if (!ret) throw new ProblemException('NOT_FOUND', 404, 'Sales return not found.');
    if (ret.status !== 'DRAFT') {
      throw new InvalidStateTransitionException('Only a draft sales return can be cancelled.');
    }
    ret.status = 'CANCELLED';
    ret.cancelReason = reason;
    ret.cancelledBy = actorId as any;
    ret.cancelledAt = new Date();
    ret.version += 1;
    await ret.save();
    return ret;
  }

  creditNotes(filter: Record<string, unknown> = {}) {
    return this.creditNoteModel
      .find(castObjectIdFilter(filter, ['customerId', 'invoiceId']))
      .sort({ createdAt: -1 })
      .lean();
  }
}

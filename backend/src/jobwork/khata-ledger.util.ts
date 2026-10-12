import { roundMoney, toDecimal } from '../common/utils/decimal';

/** One earning row: a job charge written when a receipt was confirmed (BR-13). */
export interface KhataChargeInput {
  id: string;
  date: Date;
  amount: number;
  jobSlipId?: string;
  jobSlipNo?: string;
  receiptNo?: string;
  description: string;
}

/** One money-out row: an advance or payment handed to the party (cancelled ones excluded by the caller). */
export interface KhataPaymentInput {
  id: string;
  date: Date;
  kind: 'ADVANCE' | 'PAYMENT';
  amount: number;
  docNo: string;
  mode?: string;
  reference?: string;
  jobSlipId?: string;
  jobSlipNo?: string;
  notes?: string;
}

export interface KhataLedgerEntry {
  id: string;
  date: Date;
  type: 'JOB_CHARGE' | 'ADVANCE' | 'PAYMENT';
  ref: string;
  description: string;
  jobSlipId?: string;
  jobSlipNo?: string;
  /** Amount earned by the party (what we owe more). */
  credit: number;
  /** Amount paid to the party (what we owe less). */
  debit: number;
  /** Running balance after this entry: > 0 = we owe the party, < 0 = party holds an advance. */
  balance: number;
}

export interface KhataTotals {
  earned: number;
  advances: number;
  payments: number;
  paid: number;
  /** earned - paid. Positive: payable to the party. Negative: unadjusted advance with the party. */
  balance: number;
}

export interface KhataLedger {
  entries: KhataLedgerEntry[];
  totals: KhataTotals;
}

/**
 * Merges earnings and payments into one chronological account with a running balance.
 * Same-day ordering: charges before payments, so paying on the day the work arrives does not
 * show a spurious advance mid-day. Money is summed as Decimal and rounded to 2 places.
 */
export function buildKhataLedger(
  charges: KhataChargeInput[],
  payments: KhataPaymentInput[],
): KhataLedger {
  type Row = Omit<KhataLedgerEntry, 'balance'> & { order: number };
  const rows: Row[] = [
    ...charges.map((c) => ({
      id: c.id,
      date: c.date,
      type: 'JOB_CHARGE' as const,
      ref: c.receiptNo ?? c.jobSlipNo ?? '',
      description: c.description,
      jobSlipId: c.jobSlipId,
      jobSlipNo: c.jobSlipNo,
      credit: roundMoney(c.amount),
      debit: 0,
      order: 0,
    })),
    ...payments.map((p) => ({
      id: p.id,
      date: p.date,
      type: p.kind,
      ref: p.docNo,
      description: [
        p.kind === 'ADVANCE' ? 'Advance given' : 'Payment made',
        p.mode
          ? `(${p.mode.replace('_', ' ').toLowerCase()}${p.reference ? ` ${p.reference}` : ''})`
          : '',
        p.jobSlipNo ? `for ${p.jobSlipNo}` : '',
        p.notes ? `- ${p.notes}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      jobSlipId: p.jobSlipId,
      jobSlipNo: p.jobSlipNo,
      credit: 0,
      debit: roundMoney(p.amount),
      order: 1,
    })),
  ];

  const dayKey = (d: Date) => new Date(d).toISOString().slice(0, 10);
  rows.sort((a, b) => {
    const da = dayKey(a.date);
    const db = dayKey(b.date);
    if (da !== db) return da < db ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  let running = toDecimal(0);
  let earned = toDecimal(0);
  let advances = toDecimal(0);
  let paymentsTotal = toDecimal(0);
  const entries: KhataLedgerEntry[] = rows.map(({ order: _order, ...row }) => {
    running = running.plus(row.credit).minus(row.debit);
    if (row.type === 'JOB_CHARGE') earned = earned.plus(row.credit);
    if (row.type === 'ADVANCE') advances = advances.plus(row.debit);
    if (row.type === 'PAYMENT') paymentsTotal = paymentsTotal.plus(row.debit);
    return { ...row, balance: roundMoney(running) };
  });

  const paid = advances.plus(paymentsTotal);
  return {
    entries,
    totals: {
      earned: roundMoney(earned),
      advances: roundMoney(advances),
      payments: roundMoney(paymentsTotal),
      paid: roundMoney(paid),
      balance: roundMoney(earned.minus(paid)),
    },
  };
}

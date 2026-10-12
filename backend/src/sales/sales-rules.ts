import { roundMoney } from '../common/utils/decimal';
import { ForbiddenProblemException } from '../common/errors/problem.exception';
import { PERMISSIONS } from '../identity/permissions.catalogue';

/** Pure sales business rules shared by orders, invoices, payments, returns and challans. */

export interface SalesActor {
  id: string;
  permissions?: Set<string>;
}

/** Derived money position of an invoice: payments allocated + credit notes vs grand total. */
export function invoiceBalance(grandTotal: number, allocated: number, credited: number) {
  const settled = roundMoney(allocated + credited);
  return {
    paidAmount: roundMoney(allocated),
    creditedAmount: roundMoney(credited),
    outstanding: roundMoney(Math.max(0, grandTotal - settled)),
    /** Credit beyond what was owed (e.g. a return after full payment): refundable to the customer. */
    excessCredit: roundMoney(Math.max(0, settled - grandTotal)),
  };
}

/** tech.md §8.4: payment status is derived (payments + credit notes), never hand-set. */
export function derivePaymentStatus(
  grandTotal: number,
  allocated: number,
  credited: number,
): 'UNPAID' | 'PARTIAL' | 'PAID' {
  const settled = roundMoney(allocated + credited);
  if (settled <= 0.005) return 'UNPAID';
  return settled >= grandTotal - 0.005 ? 'PAID' : 'PARTIAL';
}

/** Challan status from its line quantities. */
export function challanStatusFor(challan: {
  status: string;
  lines: Array<{ qty: number; qtyInvoiced: number; qtyReturned: number }>;
}): 'DRAFT' | 'DISPATCHED' | 'PARTIALLY_CLOSED' | 'CLOSED' | 'CANCELLED' {
  if (challan.status === 'DRAFT' || challan.status === 'CANCELLED') return challan.status;
  const closed = challan.lines.every((l) => l.qtyInvoiced + l.qtyReturned >= l.qty - 0.0005);
  const anyClosed = challan.lines.some((l) => l.qtyInvoiced + l.qtyReturned > 0.0005);
  return closed ? 'CLOSED' : anyClosed ? 'PARTIALLY_CLOSED' : 'DISPATCHED';
}

/** SAL-03: any discount beyond the customer's default needs sales.discount.apply. */
export function assertDiscountAllowed(
  lines: Array<{ discountPct: number; extraDiscountAmt?: number; extraDiscountPct?: number }>,
  customerDefaultPct: number,
  actor?: SalesActor,
) {
  if (!actor?.permissions) return;
  const extra = lines.some(
    (l) =>
      l.discountPct > customerDefaultPct + 0.0001 ||
      (l.extraDiscountAmt ?? 0) > 0 ||
      (l.extraDiscountPct ?? 0) > 0,
  );
  if (extra && !actor.permissions.has(PERMISSIONS.SALES_DISCOUNT_APPLY)) {
    throw new ForbiddenProblemException(
      `Discount above the customer's default (${customerDefaultPct}%) needs the sales.discount.apply permission.`,
    );
  }
}

/**
 * SAL-10: how much of an invoice line can still be returned, and the credit value of
 * returning `qty` of it, pro-rated from the line's own taxable value and tax (so discounts
 * and the rate band used on the invoice carry over exactly).
 */
export function returnCreditForLine(
  line: { qty: number; returnedQty?: number; taxableValue: number; cgst: number; sgst: number; igst: number; taxRatePct: number },
  qty: number,
) {
  const returnable = Math.max(0, line.qty - (line.returnedQty ?? 0));
  if (qty > returnable + 0.0005) {
    return { ok: false as const, returnable };
  }
  const f = qty / line.qty;
  const taxableValue = roundMoney(line.taxableValue * f);
  const cgst = roundMoney(line.cgst * f);
  const sgst = roundMoney(line.sgst * f);
  const igst = roundMoney(line.igst * f);
  return {
    ok: true as const,
    returnable,
    unitRate: roundMoney(line.taxableValue / line.qty),
    taxableValue,
    taxRatePct: line.taxRatePct,
    cgst,
    sgst,
    igst,
    lineTotal: roundMoney(taxableValue + cgst + sgst + igst),
  };
}

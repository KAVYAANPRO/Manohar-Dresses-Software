import {
  assertDiscountAllowed,
  challanStatusFor,
  derivePaymentStatus,
  invoiceBalance,
  returnCreditForLine,
} from './sales-rules';
import { PERMISSIONS } from '../identity/permissions.catalogue';

describe('sales rules', () => {
  describe('payment status (tech.md §8.4, SAL-09/10)', () => {
    it('derives Unpaid / Partial / Paid from payments plus credit notes', () => {
      expect(derivePaymentStatus(1000, 0, 0)).toBe('UNPAID');
      expect(derivePaymentStatus(1000, 400, 0)).toBe('PARTIAL');
      expect(derivePaymentStatus(1000, 1000, 0)).toBe('PAID');
      expect(derivePaymentStatus(1000, 600, 400)).toBe('PAID');
      expect(derivePaymentStatus(1000, 0, 250)).toBe('PARTIAL');
    });

    it('credit notes reduce outstanding; excess credit is reported, never negative outstanding', () => {
      expect(invoiceBalance(27930, 10000, 1397).outstanding).toBe(16533);
      const over = invoiceBalance(1000, 1000, 300);
      expect(over.outstanding).toBe(0);
      expect(over.excessCredit).toBe(300);
    });
  });

  describe('sales return credit (SAL-10)', () => {
    const line = { qty: 20, returnedQty: 0, taxableValue: 26600, cgst: 665, sgst: 665, igst: 0, taxRatePct: 5 };

    it('pro-rates taxable value and GST from the invoice line', () => {
      const r = returnCreditForLine(line, 5);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.taxableValue).toBe(6650);
      expect(r.cgst).toBe(166.25);
      expect(r.sgst).toBe(166.25);
      expect(r.lineTotal).toBe(6982.5);
    });

    it('refuses to return more than invoiced minus already returned', () => {
      expect(returnCreditForLine({ ...line, returnedQty: 18 }, 3).ok).toBe(false);
      const r = returnCreditForLine({ ...line, returnedQty: 18 }, 2);
      expect(r.ok).toBe(true);
    });
  });

  describe('delivery challan status', () => {
    it('closes when every line is invoiced or returned', () => {
      const base = { status: 'DISPATCHED' };
      expect(challanStatusFor({ ...base, lines: [{ qty: 10, qtyInvoiced: 0, qtyReturned: 0 }] })).toBe('DISPATCHED');
      expect(challanStatusFor({ ...base, lines: [{ qty: 10, qtyInvoiced: 4, qtyReturned: 0 }] })).toBe('PARTIALLY_CLOSED');
      expect(challanStatusFor({ ...base, lines: [{ qty: 10, qtyInvoiced: 6, qtyReturned: 4 }] })).toBe('CLOSED');
      expect(challanStatusFor({ status: 'DRAFT', lines: [{ qty: 10, qtyInvoiced: 0, qtyReturned: 0 }] })).toBe('DRAFT');
    });
  });

  describe('extra discount permission (SAL-03)', () => {
    it('allows the customer default without the permission, blocks more', () => {
      const noPerm = { id: 'u', permissions: new Set<string>() };
      expect(() => assertDiscountAllowed([{ discountPct: 5 }], 5, noPerm)).not.toThrow();
      expect(() => assertDiscountAllowed([{ discountPct: 8 }], 5, noPerm)).toThrow();
      expect(() => assertDiscountAllowed([{ discountPct: 5, extraDiscountPct: 2 }], 5, noPerm)).toThrow();
      const withPerm = { id: 'u', permissions: new Set<string>([PERMISSIONS.SALES_DISCOUNT_APPLY]) };
      expect(() => assertDiscountAllowed([{ discountPct: 8 }], 5, withPerm)).not.toThrow();
    });
  });
});

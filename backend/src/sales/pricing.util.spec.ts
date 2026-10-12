import { computeInvoice, TaxRuleNotFoundError } from './pricing.util';

describe('computeInvoice (tech.md §8.1, prd.md §10 step 13)', () => {
  const taxRules = [
    {
      hsn: '6204',
      valueBandMin: 0,
      valueBandMax: 2500,
      ratePct: 5,
      validFrom: new Date('2025-01-01'),
    },
    { hsn: '6204', valueBandMin: 2500, ratePct: 12, validFrom: new Date('2025-01-01') },
  ];

  it('matches the exact §10 step 13 numbers: 20 x Rs 1,400 less 5% discount, intra-state 5% GST', () => {
    const result = computeInvoice({
      lines: [
        {
          designVariantId: 'v1',
          qty: 20,
          unitRate: 1400,
          discountPct: 5,
          extraDiscountAmt: 0,
          hsn: '6204',
        },
      ],
      customer: { state: 'Maharashtra' },
      company: { state: 'Maharashtra' },
      invoiceDate: new Date('2026-04-10'),
      taxRules,
    });

    expect(result.subtotal).toBe(28000);
    expect(result.taxableTotal).toBe(26600);
    expect(result.lines[0].taxRatePct).toBe(5);
    expect(result.cgstTotal).toBe(665);
    expect(result.sgstTotal).toBe(665);
    expect(result.igstTotal).toBe(0);
    expect(result.grandTotal).toBe(27930);
    expect(result.isIntraState).toBe(true);
  });

  it('uses IGST for an inter-state customer instead of splitting CGST/SGST', () => {
    const result = computeInvoice({
      lines: [
        {
          designVariantId: 'v1',
          qty: 20,
          unitRate: 1400,
          discountPct: 5,
          extraDiscountAmt: 0,
          hsn: '6204',
        },
      ],
      customer: { state: 'Gujarat' },
      company: { state: 'Maharashtra' },
      invoiceDate: new Date('2026-04-10'),
      taxRules,
    });

    expect(result.isIntraState).toBe(false);
    expect(result.cgstTotal).toBe(0);
    expect(result.sgstTotal).toBe(0);
    expect(result.igstTotal).toBe(1330);
    expect(result.grandTotal).toBe(27930);
  });

  it('picks the higher-value tax band when the per-piece taxable value crosses Rs 2,500', () => {
    const result = computeInvoice({
      lines: [
        {
          designVariantId: 'v1',
          qty: 1,
          unitRate: 3000,
          discountPct: 0,
          extraDiscountAmt: 0,
          hsn: '6204',
        },
      ],
      customer: { state: 'Maharashtra' },
      company: { state: 'Maharashtra' },
      invoiceDate: new Date('2026-04-10'),
      taxRules,
    });

    expect(result.lines[0].taxRatePct).toBe(12);
    expect(result.cgstTotal).toBe(180);
    expect(result.sgstTotal).toBe(180);
  });

  it('throws when no tax rule matches the HSN/date/value band', () => {
    expect(() =>
      computeInvoice({
        lines: [
          {
            designVariantId: 'v1',
            qty: 1,
            unitRate: 100,
            discountPct: 0,
            extraDiscountAmt: 0,
            hsn: 'UNKNOWN',
          },
        ],
        customer: { state: 'Maharashtra' },
        company: { state: 'Maharashtra' },
        invoiceDate: new Date('2026-04-10'),
        taxRules,
      }),
    ).toThrow(TaxRuleNotFoundError);
  });

  describe('§5.3 additions', () => {
    const base = {
      company: { state: 'Maharashtra' },
      invoiceDate: new Date('2026-04-10'),
      taxRules,
    };

    it('rounds the grand total to the nearest rupee with a separate round-off line', () => {
      // 3 x 333.33 = 999.99 taxable, 5% intra: CGST 25.00 + SGST 25.00 -> 1049.99 -> 1050, round-off +0.01
      const result = computeInvoice({
        ...base,
        customer: { state: 'Maharashtra' },
        lines: [{ designVariantId: 'v1', qty: 3, unitRate: 333.33, discountPct: 0, extraDiscountAmt: 0, hsn: '6204' }],
      });
      expect(result.taxableTotal).toBe(999.99);
      expect(result.cgstTotal).toBe(25);
      expect(result.sgstTotal).toBe(25);
      expect(result.grandTotal).toBe(1050);
      expect(result.roundOff).toBe(0.01);
    });

    it('applies the other-discount % on the value left after the primary discount, before tax', () => {
      // 10 x 1000 = 10000, 10% -> 9000, other 5% -> 8550 taxable, IGST 5% = 427.50 -> 8977.50 -> 8978
      const result = computeInvoice({
        ...base,
        customer: { state: 'Karnataka' },
        lines: [{ designVariantId: 'v1', qty: 10, unitRate: 1000, discountPct: 10, extraDiscountPct: 5, extraDiscountAmt: 0, hsn: '6204' }],
      });
      expect(result.discountTotal).toBe(1450);
      expect(result.taxableTotal).toBe(8550);
      expect(result.igstTotal).toBe(427.5);
      expect(result.cgstTotal).toBe(0);
      expect(result.grandTotal).toBe(8978);
      expect(result.roundOff).toBe(0.5);
    });

    it('adds non-taxable other charges after tax and before round-off', () => {
      const result = computeInvoice({
        ...base,
        customer: { state: 'Maharashtra' },
        otherCharges: 250,
        lines: [{ designVariantId: 'v1', qty: 20, unitRate: 1400, discountPct: 5, extraDiscountAmt: 0, hsn: '6204' }],
      });
      expect(result.cgstTotal).toBe(665);
      expect(result.otherCharges).toBe(250);
      expect(result.grandTotal).toBe(28180);
    });

    it('compares states case-insensitively for place of supply', () => {
      const result = computeInvoice({
        ...base,
        customer: { state: ' maharashtra ' },
        lines: [{ designVariantId: 'v1', qty: 1, unitRate: 100, discountPct: 0, extraDiscountAmt: 0, hsn: '6204' }],
      });
      expect(result.isIntraState).toBe(true);
    });
  });
});

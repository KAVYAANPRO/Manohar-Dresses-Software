import { assertReturnable } from './purchase-return.rules';

describe('PUR-08 purchase return rules', () => {
  const base = { label: 'Lot L1', received: 100, alreadyReturned: 0, onHand: 100, requested: 10 };

  it('allows a return within received and on-hand quantity', () => {
    expect(() => assertReturnable(base)).not.toThrow();
    expect(() => assertReturnable({ ...base, requested: 100 })).not.toThrow();
  });

  it('blocks returning more than received minus already returned (409 RETURN_QTY_EXCEEDED)', () => {
    try {
      assertReturnable({ ...base, alreadyReturned: 95, requested: 10 });
      fail('expected to throw');
    } catch (e: any) {
      expect(e.getStatus()).toBe(409);
      expect(e.code).toBe('RETURN_QTY_EXCEEDED');
    }
  });

  it('blocks returning more than is on hand in the lot (409 INSUFFICIENT_STOCK)', () => {
    try {
      assertReturnable({ ...base, onHand: 40, requested: 50 });
      fail('expected to throw');
    } catch (e: any) {
      expect(e.getStatus()).toBe(409);
      expect(e.code).toBe('INSUFFICIENT_STOCK');
    }
  });

  it('tolerates rounding noise at the boundary', () => {
    expect(() => assertReturnable({ ...base, onHand: 9.9999, requested: 10 })).not.toThrow();
  });
});

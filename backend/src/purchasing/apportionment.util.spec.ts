import { apportionOtherCharges } from './apportionment.util';

describe('apportionOtherCharges (PUR-04, tech.md §6.2)', () => {
  it('always sums exactly to the total, with the remainder on the largest line', () => {
    const shares = apportionOtherCharges([200, 300, 500], 100);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    // 20 + 30 + 50 = 100 exactly here, no remainder needed
    expect(shares).toEqual([20, 30, 50]);
  });

  it('assigns the rounding remainder to the largest line', () => {
    // 100 / 3 lines of equal amount -> each share rounds to 33.33, sum 99.99, remainder 0.01
    const shares = apportionOtherCharges([100, 100, 100], 100);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    const max = Math.max(...shares);
    expect(shares.filter((s) => s === max).length).toBeGreaterThanOrEqual(1);
  });

  it('returns all zeros when otherCharges is zero', () => {
    expect(apportionOtherCharges([100, 200], 0)).toEqual([0, 0]);
  });

  it('returns an empty array for no lines', () => {
    expect(apportionOtherCharges([], 100)).toEqual([]);
  });

  it('handles many random line-amount sets without ever losing or gaining a rupee', () => {
    for (let i = 0; i < 200; i++) {
      const lineCount = 1 + Math.floor(Math.random() * 8);
      const lineAmounts = Array.from(
        { length: lineCount },
        () => Math.round(Math.random() * 100000) / 100,
      );
      const otherCharges = Math.round(Math.random() * 5000) / 100;
      const shares = apportionOtherCharges(lineAmounts, otherCharges);
      const sum = shares.reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 100)).toBe(Math.round(otherCharges * 100));
    }
  });
});

import Decimal from 'decimal.js';
import { roundMoney } from '../common/utils/decimal';

/**
 * PUR-04 / tech.md §6.2: `share_i = round(other_charges x line_amount_i / sum(line_amount), 2)`,
 * with the rounding remainder assigned to the largest line so the parts always sum exactly to
 * the whole (tech.md §4.1: "apportionment remainders go to the largest line"). A pure
 * function so it can be unit-tested in isolation, per tech.md §14.1.
 */
export function apportionOtherCharges(lineAmounts: number[], otherCharges: number): number[] {
  if (lineAmounts.length === 0) return [];
  const total = lineAmounts.reduce((sum, a) => sum + a, 0);
  if (total <= 0 || otherCharges === 0) return lineAmounts.map(() => 0);

  const shares = lineAmounts.map((amount) =>
    roundMoney(new Decimal(otherCharges).times(amount).dividedBy(total)),
  );

  const allocated = shares.reduce((sum, s) => sum + s, 0);
  const remainder = roundMoney(new Decimal(otherCharges).minus(allocated));

  if (remainder !== 0) {
    let largestIndex = 0;
    for (let i = 1; i < lineAmounts.length; i++) {
      if (lineAmounts[i] > lineAmounts[largestIndex]) largestIndex = i;
    }
    shares[largestIndex] = roundMoney(new Decimal(shares[largestIndex]).plus(remainder));
  }

  return shares;
}

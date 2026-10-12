/** ₹ 45,000 style formatting, no decimals unless present. */
export function formatINR(n: number): string {
  return '₹ ' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * "₹ 45,000 + ₹ 500" when there are expenses (transport, freight, etc. — "Expenses (if any)"),
 * otherwise just the plain amount. Used everywhere a total is shown so the base price and any
 * extra expenses stay visibly separate instead of being silently merged into one number.
 */
export function formatAmountWithExpenses(amount: number, expenses?: number): string {
  if (!expenses) return formatINR(amount);
  return `${formatINR(amount)} + ${formatINR(expenses)}`;
}

export function totalWithExpenses(amount: number, expenses?: number): number {
  return amount + (expenses || 0);
}

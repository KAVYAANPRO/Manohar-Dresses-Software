import Decimal from 'decimal.js';

/**
 * Decimal precision helpers (tech.md §4.1/§1.5: "Decimals only... No floating point anywhere
 * near stock or money"). Native JS `number` is a float and is never used for a quantity, unit
 * cost, or money value once it leaves user input - only Decimal, rounded to the field's fixed
 * precision at the point it is persisted or returned.
 */
export const QTY_DECIMALS = 3;
export const UNIT_COST_DECIMALS = 4;
export const MONEY_DECIMALS = 2;

export function toDecimal(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function roundQty(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(QTY_DECIMALS, Decimal.ROUND_HALF_UP).toNumber();
}

export function roundUnitCost(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(UNIT_COST_DECIMALS, Decimal.ROUND_HALF_UP).toNumber();
}

export function roundMoney(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(MONEY_DECIMALS, Decimal.ROUND_HALF_UP).toNumber();
}

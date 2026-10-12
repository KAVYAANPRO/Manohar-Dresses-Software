// FIFO lot allocation (STK-07 / JOB-04). Pure logic, independent of any page,
// so both the mock data layer and (later) a real API response can share it.
//
// "A permitted user may choose a specific lot" (STK-07) is a UI affordance on
// top of this — callers should default to `pickLotsFIFO` and only bypass it
// when the user has explicitly picked a lot manually.

export interface AvailableLot {
  lotId: string;
  /** Oldest lot first — callers must sort by inward/receipt date before calling. */
  quantity: number;
  unitCost: number;
}

export interface LotAllocation {
  lotId: string;
  quantity: number;
  unitCost: number;
}

export interface FifoResult {
  allocations: LotAllocation[];
  fulfilled: number;
  shortfall: number;
  /** JOB-04 — blocks the issue when the warehouse doesn't have enough. */
  sufficient: boolean;
}

/**
 * Allocates `quantityNeeded` across `lots` oldest-first. Does not mutate the
 * input array. Lots with zero or negative quantity are skipped.
 */
export function pickLotsFIFO(lots: AvailableLot[], quantityNeeded: number): FifoResult {
  const allocations: LotAllocation[] = [];
  let remaining = quantityNeeded;

  for (const lot of lots) {
    if (remaining <= 0) break;
    if (lot.quantity <= 0) continue;
    const take = Math.min(lot.quantity, remaining);
    allocations.push({ lotId: lot.lotId, quantity: take, unitCost: lot.unitCost });
    remaining -= take;
  }

  const fulfilled = quantityNeeded - remaining;
  return {
    allocations,
    fulfilled,
    shortfall: Math.max(remaining, 0),
    sufficient: remaining <= 0,
  };
}

/** PUR-03/§5.5 — landed unit cost, apportioning other charges by value share. */
export function landedUnitCost(lineAmount: number, apportionedOtherCharges: number, baseUnitQuantity: number): number {
  if (baseUnitQuantity === 0) return 0;
  return (lineAmount + apportionedOtherCharges) / baseUnitQuantity;
}

/** PUR-04 — apportion a purchase's other charges (freight, etc.) across lines by value. */
export function apportionOtherCharges(lineAmounts: number[], otherCharges: number): number[] {
  const total = lineAmounts.reduce((s, a) => s + a, 0);
  if (total === 0) return lineAmounts.map(() => 0);
  return lineAmounts.map(a => (a / total) * otherCharges);
}

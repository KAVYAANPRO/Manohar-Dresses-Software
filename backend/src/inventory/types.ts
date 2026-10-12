import { MovementType } from './schemas/stock-ledger.schema';
import { LotOriginType } from './schemas/stock-lot.schema';

/**
 * tech.md §5.2 posting interface, translated to Mongo. Other modules never touch the ledger
 * or balance collections directly - they build a `Movement` and call `StockService.post()`.
 */
export interface Movement {
  type: MovementType;
  stockItemId: string;
  /** Omit to FIFO-allocate from `fromLocationId` (may expand into several ledger rows). */
  lotId?: string;
  fromLocationId: string;
  toLocationId: string;
  /** > 0; rounded to 3 decimal places. */
  qty: number;
  /** Required only when `lotOrigin` is set (this movement creates a brand-new lot). */
  unitCost?: number;
  lotOrigin?: {
    lotNo?: string;
    receivedOn?: Date;
    originDocType: LotOriginType;
    originDocId?: string;
    supplierId?: string;
    originJobSlipId?: string;
  };
  doc: { type: string; id: string; lineId?: string };
  businessDate?: Date;
  reason?: string;
}

export interface PostedRow {
  ledgerId: string;
  lotId: string;
  qty: number;
  unitCost: number;
}

export interface LotAllocation {
  lotId: string;
  qty: number;
  unitCost: number;
}

export interface AvailabilityRow {
  stockItemId: string;
  onHand: number;
  withFactory: number;
  quarantined: number;
  reserved: number;
  atp: number;
}

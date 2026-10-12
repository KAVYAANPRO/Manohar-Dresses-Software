// Canonical domain enums and status machines. Single source of truth —
// every page must import these instead of redeclaring its own status union.
// Mirrors prd.md §4 (requirement IDs referenced in comments).

/** PUR-01 */
export const PURCHASE_STATUSES = ['Draft', 'Confirmed', 'Partially Received', 'Received', 'Cancelled'] as const;
export type PurchaseStatus = typeof PURCHASE_STATUSES[number];

/** INW-01 */
export const INWARD_STATUSES = ['Pending', 'Confirmed'] as const;
export type InwardStatus = typeof INWARD_STATUSES[number];

/**
 * JOB-03 / frontend.md §23. Ordered — index order is the progress order.
 * "Created" replaces the earlier ad-hoc "Draft" naming used in some pages.
 * Cancelled is reachable only from Created, or from Material Issued if all
 * issued material has been returned (see prd.md §4.7 status table).
 */
export const JOB_SLIP_STATUSES = [
  'Created',
  'Material Issued',
  'In Process',
  'Ready',
  'Partially Received',
  'Received',
  'Closed',
] as const;
export type JobSlipStatus = typeof JOB_SLIP_STATUSES[number] | 'Cancelled';

/** Allowed forward transitions for JOB_SLIP_STATUSES (JOB-03). */
export const JOB_SLIP_TRANSITIONS: Record<JobSlipStatus, JobSlipStatus[]> = {
  Created: ['Material Issued', 'Cancelled'],
  'Material Issued': ['In Process', 'Cancelled'],
  'In Process': ['Ready', 'Partially Received', 'Received'],
  Ready: ['Partially Received', 'Received'],
  'Partially Received': ['Received'],
  Received: ['Closed'],
  Closed: [],
  Cancelled: [],
};

/** SAL-01 */
export const SALES_ORDER_STATUSES = ['Draft', 'Confirmed', 'Partially Invoiced', 'Invoiced', 'Cancelled'] as const;
export type SalesOrderStatus = typeof SALES_ORDER_STATUSES[number];

/** SAL-05 / SAL-08 */
export const INVOICE_STATUSES = ['Draft', 'Confirmed', 'Cancelled'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

/** SAL-09 — derived, never set directly. */
export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

/**
 * STK-02. "Purchase" is deliberately absent — a confirmed purchase is not a
 * stock movement (Rule 1 / BR-01); only the Inward movement creates stock.
 */
export const STOCK_MOVEMENT_TYPES = [
  'Opening',
  'Inward',
  'Issue',
  'Return-from-factory',
  'Consumption',
  'Process-output',
  'Production-receipt',
  'Rejection',
  'Shortage-write-off',
  'Adjustment-in',
  'Adjustment-out',
  'Sale',
  'Sales-return',
  'Purchase-return',
  'Transfer',
  'Reversal',
] as const;
export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[number];

/** §5.2 — every ledger row moves quantity from one location to another. */
export const STOCK_LOCATION_KINDS = ['Warehouse', 'FactoryCustody', 'Quarantine', 'Virtual'] as const;
export type StockLocationKind = typeof STOCK_LOCATION_KINDS[number];

export interface StockLedgerEntry {
  id: string;
  txnId: string;
  date: string;
  type: StockMovementType;
  itemName: string;
  lotId?: string;
  quantity: number;
  unit: string;
  fromLocation: string;
  toLocation: string;
  reference: string;
  user: string;
  remarks?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  recordId: string;
  previousValue?: string;
  newValue?: string;
}

/** JOB-08 / SHR-01 — guarded against Sent = 0. */
export function calcShortage(sent: number, received: number) {
  const shortage = sent - received;
  const shortagePct = sent === 0 ? 0 : (shortage / sent) * 100;
  return { shortage, shortagePct };
}

/** CST-04 — guarded against Accepted = 0. */
export function calcCostPerGarment(totalProductionCost: number, acceptedQty: number) {
  return acceptedQty === 0 ? 0 : totalProductionCost / acceptedQty;
}

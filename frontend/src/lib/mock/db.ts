// In-memory relational mock data layer.
//
// This is the seam for backend integration: every function here is async
// and returns the same shape a real endpoint would. When the backend exists,
// each function's body becomes an `apiClient.get/post(...)` call (see
// src/lib/api/client.ts + endpoints.ts) and every page that imports from
// here keeps working unchanged. Pages must call these functions instead of
// holding their own local mock arrays — that duplication is what made
// traceability and the audit log unable to reflect real relationships.
//
// Kept intentionally small: it seeds one fully-linked chain per PRD flow
// (purchase → inward → lot → job slip → issuance → receiving → ready stock
// → sales order → invoice) so traceability and the audit log have real
// relational data to walk, rather than a hardcoded lookup table.

import type { AuditLogEntry, StockLedgerEntry } from '../../types/domain';

function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

// ---------------------------------------------------------------------------
// Seed data — one linked chain, IDs cross-referenced end to end.
// ---------------------------------------------------------------------------

export const seedPurchase = {
  id: 'PO-24-048',
  date: '10-07-2026',
  supplier: 'Rajesh Textiles',
  material: 'Cotton Fabric — Navy Blue',
  quantity: 800,
  unit: 'm',
  rate: 70,
  status: 'Received' as const,
};

export const seedInward = {
  id: 'INW-24-031',
  purchaseId: seedPurchase.id,
  date: '15-07-2026',
  lotId: 'L-2026-031',
  quantity: 800,
  location: 'Main Warehouse',
};

export const seedLot = {
  id: 'L-2026-031',
  material: 'Cotton Fabric — Navy Blue',
  unitCost: 70,
  originInwardId: seedInward.id,
};

export const seedJobSlip = {
  id: 'JS-24-099',
  design: 'DR-1024 — Summer Floral Dress',
  factory: 'Super Stitchers',
  date: '03-09-2026',
  expectedQty: 300,
};

export const seedIssuance = {
  id: 'ISS-24-099',
  jobSlipId: seedJobSlip.id,
  date: '05-09-2026',
  lotId: seedLot.id,
  quantity: 800,
};

export const seedReceiving = {
  id: 'RCV-24-099',
  jobSlipId: seedJobSlip.id,
  date: '02-10-2026',
  sent: 300,
  accepted: 290,
  rejected: 7,
  damaged: 3,
};

export const seedSalesOrder = {
  id: 'SO-26-001',
  customer: 'Fab India Retail',
  date: '20-09-2026',
  design: seedJobSlip.design,
  quantity: 195,
  sourceReceivingId: seedReceiving.id,
};

export const seedInvoice = {
  id: 'INV-26-010',
  salesOrderId: seedSalesOrder.id,
  date: '20-09-2026',
  quantity: 195,
  amount: 233415,
  status: 'Paid',
};

// ---------------------------------------------------------------------------
// Append-only stores. Real mutations (confirm purchase, confirm invoice, …)
// push here so audit log / ledger reflect actual actions taken in this
// session, instead of being static.
// ---------------------------------------------------------------------------

let auditLog: AuditLogEntry[] = [
  { id: 'A-1', timestamp: '10-07-2026 11:02', user: 'Priya (Purchase)', module: 'Purchases', action: 'Created', recordId: seedPurchase.id },
  { id: 'A-2', timestamp: '15-07-2026 09:40', user: 'Rahul (Inventory)', module: 'Inward', action: 'Confirmed', recordId: seedInward.id, newValue: `Lot ${seedLot.id} created, +800 m` },
  { id: 'A-3', timestamp: '03-09-2026 14:15', user: 'Anita (Production)', module: 'Job Slips', action: 'Created', recordId: seedJobSlip.id },
  { id: 'A-4', timestamp: '05-09-2026 10:05', user: 'Rahul (Inventory)', module: 'Material Issue', action: 'Confirmed', recordId: seedIssuance.id, newValue: '800 m → Factory Custody (Super Stitchers)' },
  { id: 'A-5', timestamp: '02-10-2026 16:30', user: 'Anita (Production)', module: 'Receiving', action: 'Confirmed', recordId: seedReceiving.id, newValue: '290 accepted, 10 → Quarantine' },
  { id: 'A-6', timestamp: '20-09-2026 12:00', user: 'Karan (Sales)', module: 'Invoices', action: 'Confirmed', recordId: seedInvoice.id, newValue: '-195 pcs Ready Stock' },
];

let stockLedger: StockLedgerEntry[] = [
  { id: 'SL-1', txnId: 'TXN-0001', date: seedInward.date, type: 'Inward', itemName: seedLot.material, lotId: seedLot.id, quantity: 800, unit: 'm', fromLocation: 'Supplier (virtual)', toLocation: 'Main Warehouse', reference: seedInward.id, user: 'Rahul (Inventory)' },
  { id: 'SL-2', txnId: 'TXN-0002', date: seedIssuance.date, type: 'Issue', itemName: seedLot.material, lotId: seedLot.id, quantity: 800, unit: 'm', fromLocation: 'Main Warehouse', toLocation: 'Factory Custody — Super Stitchers', reference: seedIssuance.id, user: 'Rahul (Inventory)' },
  { id: 'SL-3', txnId: 'TXN-0003', date: seedReceiving.date, type: 'Production-receipt', itemName: seedJobSlip.design, quantity: 290, unit: 'pcs', fromLocation: 'Production (virtual)', toLocation: 'Main Warehouse', reference: seedReceiving.id, user: 'Anita (Production)' },
  { id: 'SL-4', txnId: 'TXN-0004', date: seedReceiving.date, type: 'Rejection', itemName: seedJobSlip.design, quantity: 10, unit: 'pcs', fromLocation: 'Production (virtual)', toLocation: 'Quarantine', reference: seedReceiving.id, user: 'Anita (Production)' },
  { id: 'SL-5', txnId: 'TXN-0005', date: seedInvoice.date, type: 'Sale', itemName: seedJobSlip.design, quantity: 195, unit: 'pcs', fromLocation: 'Main Warehouse', toLocation: 'Customer (virtual)', reference: seedInvoice.id, user: 'Karan (Sales)' },
];

export async function listAuditLog(): Promise<AuditLogEntry[]> {
  return delay([...auditLog].reverse());
}

export async function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
  const row: AuditLogEntry = { ...entry, id: `A-${auditLog.length + 1}`, timestamp: new Date().toLocaleString('en-IN') };
  auditLog = [...auditLog, row];
  return delay(row, 50);
}

export async function listStockLedger(): Promise<StockLedgerEntry[]> {
  return delay([...stockLedger].reverse());
}

export async function appendStockLedger(entry: Omit<StockLedgerEntry, 'id' | 'txnId'>): Promise<StockLedgerEntry> {
  const row: StockLedgerEntry = { ...entry, id: `SL-${stockLedger.length + 1}`, txnId: `TXN-${String(stockLedger.length + 1).padStart(4, '0')}` };
  stockLedger = [...stockLedger, row];
  return delay(row, 50);
}

// ---------------------------------------------------------------------------
// Traceability (TRC-01..03) — walks the real linked chain instead of a
// hardcoded per-query lookup table.
// ---------------------------------------------------------------------------

export interface TraceNode {
  stage: string;
  refNo: string;
  date: string;
  details: string;
  status?: string;
  icon: 'purchase' | 'inward' | 'stock' | 'design' | 'job' | 'receive' | 'sale';
}

function buildFullChain(): { summary: string; nodes: TraceNode[] } {
  return {
    summary: `${seedJobSlip.design} | ${seedJobSlip.factory} | ${seedReceiving.accepted} pcs accepted`,
    nodes: [
      { stage: 'Purchase Order', refNo: seedPurchase.id, date: seedPurchase.date, details: `${seedPurchase.material} · ${seedPurchase.quantity} ${seedPurchase.unit} · ₹${seedPurchase.rate}/${seedPurchase.unit} · ${seedPurchase.supplier}`, icon: 'purchase', status: seedPurchase.status },
      { stage: 'Material Inward', refNo: seedInward.id, date: seedInward.date, details: `${seedInward.quantity} m received · Lot ${seedLot.id} · ${seedInward.location}`, icon: 'inward', status: 'Posted' },
      { stage: 'Raw Stock', refNo: seedLot.id, date: seedInward.date, details: `${seedLot.material} · ${seedInward.quantity} m in ${seedInward.location} · unit cost ₹${seedLot.unitCost}`, icon: 'stock', status: 'Issued' },
      { stage: 'Job Slip', refNo: seedJobSlip.id, date: seedJobSlip.date, details: `${seedJobSlip.factory} · ${seedJobSlip.expectedQty} pcs expected`, icon: 'job', status: 'Received' },
      { stage: 'Material Issuance', refNo: seedIssuance.id, date: seedIssuance.date, details: `${seedIssuance.quantity} m issued from lot ${seedIssuance.lotId}`, icon: 'inward', status: 'Fulfilled' },
      { stage: 'Finished Goods Received', refNo: seedReceiving.id, date: seedReceiving.date, details: `${seedReceiving.sent} sent · ${seedReceiving.accepted} accepted · ${seedReceiving.rejected} rejected · ${seedReceiving.damaged} damaged → Quarantine`, icon: 'receive', status: 'Closed' },
      { stage: 'Sales Order', refNo: seedSalesOrder.id, date: seedSalesOrder.date, details: `${seedSalesOrder.customer} · ${seedSalesOrder.quantity} pcs reserved`, icon: 'sale', status: 'Invoiced' },
      { stage: 'Invoice', refNo: seedInvoice.id, date: seedInvoice.date, details: `${seedInvoice.quantity} pcs · ₹${seedInvoice.amount.toLocaleString('en-IN')} · ${seedInvoice.status}`, icon: 'sale', status: seedInvoice.status },
    ],
  };
}

function buildLotChain(): { summary: string; nodes: TraceNode[] } {
  return {
    summary: `${seedLot.material} · Lot ${seedLot.id} · ${seedPurchase.supplier} · ${seedInward.quantity} m`,
    nodes: [
      { stage: 'Purchase Order', refNo: seedPurchase.id, date: seedPurchase.date, details: `${seedPurchase.supplier} · ${seedPurchase.quantity} m @ ₹${seedPurchase.rate}/m`, icon: 'purchase', status: seedPurchase.status },
      { stage: 'Material Inward', refNo: seedInward.id, date: seedInward.date, details: `Lot ${seedLot.id} created · ${seedInward.location}`, icon: 'inward', status: 'Posted' },
      { stage: 'Issued to Job', refNo: seedJobSlip.id, date: seedIssuance.date, details: `${seedIssuance.quantity} m issued to ${seedJobSlip.factory} for ${seedJobSlip.design}`, icon: 'job', status: 'Consumed' },
    ],
  };
}

/** Any of: job slip id, lot id, purchase id, sales order id, invoice id. */
export async function traceByReference(rawQuery: string): Promise<{ summary: string; nodes: TraceNode[] } | null> {
  const q = rawQuery.trim().toUpperCase();
  if (!q) return delay(null, 0);

  const chain = buildFullChain();
  const full = [seedJobSlip.id, seedSalesOrder.id, seedInvoice.id, seedReceiving.id, seedPurchase.id].some(id => q.includes(id.toUpperCase()));
  if (full) return delay(chain, 600);

  if (q.includes('LOT') || q.includes(seedLot.id.toUpperCase())) return delay(buildLotChain(), 600);

  return delay(null, 600);
}

import { apiClient } from './client';

export interface StockRow {
  id: string;
  stockItemId: string;
  kind: string;
  name: string;
  materialName?: string;
  colourName?: string;
  categoryName?: string;
  uomCode?: string;
  minStockQty?: number;
  lotId: string;
  lotNo?: string;
  receivedOn?: string;
  supplierName?: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  locationKind: string;
  qty: number;
  unitCost: number;
  value: number;
}
export interface StockItemSummary {
  stockItemId: string;
  kind: string;
  name: string;
  materialName?: string;
  colourName?: string;
  uomCode?: string;
  minStockQty?: number;
  onHand: number;
  withFactory: number;
  quarantined: number;
  value: number;
  lotCount: number;
  lowStock: boolean;
}
export interface LedgerRow {
  id: string;
  postedAt: string;
  businessDate: string;
  movementType: string;
  stockItemId: string;
  itemName: string;
  uomCode?: string;
  lotId: string;
  lotNo?: string;
  qty: number;
  unitCost: number;
  direction: 'IN' | 'OUT' | 'MOVE';
  fromLocation?: string;
  fromLocationCode?: string;
  toLocation?: string;
  toLocationCode?: string;
  docType: string;
  docId: string;
  docNo: string;
  reversesId?: string;
  reason?: string;
  postedBy: string;
}
export interface LotRow {
  id: string;
  lotId: string;
  lotNo: string;
  stockItemId: string;
  name: string;
  colourName?: string;
  uomCode?: string;
  receivedOn: string;
  unitCost: number;
  originDocType: string;
  originDocNo?: string;
  supplierName?: string;
  initialQty: number;
  remainingQty: number;
  locations: Array<{ locationId: string; locationCode: string; locationName: string; locationKind: string; qty: number }>;
  status: 'ACTIVE' | 'EXHAUSTED' | 'QUARANTINE';
}
export interface StockAdjustmentRow {
  _id: string;
  docNo: string;
  docDate: string;
  stockItemId: string;
  locationId: string;
  direction: 'IN' | 'OUT';
  lotId?: string;
  unitCost?: number;
  qty: number;
  reason: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  cancelReason?: string;
  itemName?: string;
  uomCode?: string;
  lotNo?: string;
  locationCode?: string;
  locationName?: string;
  createdByName?: string;
  approvedByName?: string;
  rejectedByName?: string;
  approvedAt?: string;
}

export const stockApi = {
  overview: (params?: { kind?: string; stockItemId?: string; locationId?: string }) =>
    apiClient.get<{ rows: StockRow[]; items: StockItemSummary[] }>('/stock/overview', { params }).then(r => r.data),
  ledger: (params?: { stockItemId?: string; lotId?: string; docId?: string; docType?: string; movementType?: string; from?: string; to?: string; limit?: number; skip?: number }) =>
    apiClient.get<{ total: number; rows: LedgerRow[] }>('/stock/ledger/entries', { params }).then(r => r.data),
  lots: (params?: { stockItemId?: string; kind?: string }) => apiClient.get<LotRow[]>('/stock/lots/details', { params }).then(r => r.data),
};

export const stockAdjustmentsApi = {
  list: () => apiClient.get<StockAdjustmentRow[]>('/stock/adjustments').then(r => r.data),
  get: (id: string) => apiClient.get<StockAdjustmentRow>(`/stock/adjustments/${id}`).then(r => r.data),
  propose: (body: { stockItemId: string; locationId: string; direction: 'IN' | 'OUT'; qty: number; reason: string; lotId?: string; unitCost?: number }) =>
    apiClient.post<StockAdjustmentRow>('/stock/adjustments', body).then(r => r.data),
  approve: (id: string) => apiClient.post(`/stock/adjustments/${id}/approve`).then(r => r.data),
  reject: (id: string, reason: string) => apiClient.post(`/stock/adjustments/${id}/reject`, { reason }).then(r => r.data),
};

export const MOVEMENT_LABEL: Record<string, string> = {
  OPENING: 'Opening', INWARD: 'Inward', ISSUE: 'Issue', RETURN_FROM_FACTORY: 'Return-from-factory',
  CONSUMPTION: 'Consumption', PROCESS_OUTPUT: 'Process-output', PRODUCTION_RECEIPT: 'Production-receipt',
  REJECTION: 'Rejection', SHORTAGE_WRITE_OFF: 'Shortage-write-off', ADJUSTMENT_IN: 'Adjustment-in',
  ADJUSTMENT_OUT: 'Adjustment-out', SALE: 'Sale', SALES_RETURN: 'Sales-return', PURCHASE_RETURN: 'Purchase-return',
  TRANSFER: 'Transfer', REVERSAL: 'Reversal',
};

export function fmtQty(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

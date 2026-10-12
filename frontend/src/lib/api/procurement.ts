import { apiClient } from './client';
import { masterCrudApi } from './masterCrud';

/** Turns an RFC-7807 problem response ({ code, detail }) or network error into a readable message. */
export function problemMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { response?: { data?: { detail?: string; message?: string | string[]; code?: string } }; message?: string };
  const data = e?.response?.data;
  if (data?.detail) return data.detail;
  if (Array.isArray(data?.message)) return data!.message.join(', ');
  if (typeof data?.message === 'string') return data.message;
  if (!e?.response && e?.message) return 'Cannot reach the server. Check your connection.';
  return fallback;
}

export function problemCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
}

/** Fresh key per user action, so a double-tap / retry never posts stock twice (tech.md §10.2). */
export function idempotencyHeaders() {
  const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { headers: { 'Idempotency-Key': key } };
}

// ---------- masters ----------
export interface UomRecord { _id: string; code: string; name: string; isActive: boolean }
export interface ColourRecord { _id: string; name: string; hexCode?: string; isActive: boolean }
export interface CategoryRecord { _id: string; name: string; isActive: boolean }
export interface LocationRecord { _id: string; code: string; name: string; kind: string; isActive: boolean }
export interface MaterialRecord {
  _id: string;
  name: string;
  categoryId: string;
  fabricType?: string;
  baseUomId: string;
  minStockQty?: number;
  isActive: boolean;
  version: number;
}
/** A material in a colour, with material / unit / colour populated (GET /material-variants). */
export interface MaterialVariantRecord {
  _id: string;
  code?: string;
  isActive: boolean;
  colourId: ColourRecord | null;
  materialId: (Omit<MaterialRecord, 'baseUomId' | 'categoryId'> & { baseUomId: UomRecord | null; categoryId: CategoryRecord | null }) | null;
}

export const uomsApi = masterCrudApi<UomRecord>('/uoms');
export const coloursApi = masterCrudApi<ColourRecord>('/colours');
export const materialCategoriesApi = masterCrudApi<CategoryRecord>('/material-categories');
export const locationsApi = masterCrudApi<LocationRecord>('/locations');

const materialsCrud = masterCrudApi<MaterialRecord>('/materials');
export const materialsApi = {
  ...materialsCrud,
  setActive: (id: string, active: boolean) => apiClient.post(`/materials/${id}/${active ? 'reactivate' : 'deactivate'}`).then(r => r.data),
  variants: (id: string) => apiClient.get<Array<{ _id: string; code?: string; colourId: ColourRecord | null; isActive: boolean }>>(`/materials/${id}/variants`).then(r => r.data),
  addVariant: (id: string, body: { colourId?: string; colourName?: string; code?: string }) => apiClient.post(`/materials/${id}/variants`, body).then(r => r.data),
};

export const materialVariantsApi = {
  list: (params?: { materialId?: string; isActive?: boolean }) =>
    apiClient.get<MaterialVariantRecord[]>('/material-variants', { params }).then(r => r.data),
};

export function variantLabel(v?: MaterialVariantRecord | null): string {
  if (!v) return 'Unknown material';
  return [v.materialId?.name ?? 'Material', v.colourId?.name].filter(Boolean).join(' - ');
}

// ---------- purchases ----------
export type PurchaseStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
export interface PurchaseLine {
  _id: string;
  materialVariantId: string;
  uomId: string;
  qty: number;
  rate: number;
  amount: number;
  qtyBase: number;
  qtyReceivedBase: number;
  otherChargesShare?: number;
  landedUnitCost?: number;
}
export interface Purchase {
  _id: string;
  docNo: string;
  docDate: string;
  supplierId: string;
  supplierInvoiceNo?: string;
  expectedDeliveryDate?: string;
  otherCharges: number;
  notes?: string;
  isDirect?: boolean;
  status: PurchaseStatus;
  lines: PurchaseLine[];
  cancelReason?: string;
  version: number;
}
export interface PurchaseLineInput {
  materialVariantId?: string;
  materialId?: string;
  colourId?: string;
  colourName?: string;
  uomId?: string;
  qty: number;
  rate: number;
}
export interface PurchaseInput {
  supplierId: string;
  supplierInvoiceNo?: string;
  expectedDeliveryDate?: string;
  otherCharges?: number;
  notes?: string;
  lines: PurchaseLineInput[];
}

export const purchasesApi = {
  list: (params?: { status?: string; supplierId?: string }) => apiClient.get<Purchase[]>('/purchases', { params }).then(r => r.data),
  pendingInward: () => apiClient.get<Purchase[]>('/purchases/pending-inward').then(r => r.data),
  get: (id: string) => apiClient.get<Purchase>(`/purchases/${id}`).then(r => r.data),
  create: (body: PurchaseInput) => apiClient.post<Purchase>('/purchases', body, idempotencyHeaders()).then(r => r.data),
  update: (id: string, body: Partial<PurchaseInput>) => apiClient.patch<Purchase>(`/purchases/${id}`, body).then(r => r.data),
  confirm: (id: string) => apiClient.post<Purchase>(`/purchases/${id}/confirm`, undefined, idempotencyHeaders()).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post<Purchase>(`/purchases/${id}/cancel`, { reason }).then(r => r.data),
};

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};
export const PURCHASE_STATUS_CLASS: Record<PurchaseStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  CONFIRMED: 'bg-[#FFDCE5] text-[#8F002B]',
  PARTIALLY_RECEIVED: 'bg-yellow-100 text-yellow-800',
  RECEIVED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

// ---------- inwards ----------
export interface InwardLine {
  _id: string;
  purchaseLineId: string;
  materialVariantId: string;
  uomId?: string;
  qty: number;
  qtyBase: number;
  rate?: number;
  lotNo?: string;
  createdLotId?: string;
  unitCost?: number;
  qtyReturnedBase: number;
}
export interface Inward {
  _id: string;
  docNo: string;
  docDate: string;
  purchaseId: string;
  supplierId: string;
  locationId: string;
  supplierRef?: string;
  isDirect: boolean;
  remarks?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  lines: InwardLine[];
}
/**
 * POST /inwards — inward against a confirmed PO. `qty` is in the PO line's unit; colour may be
 * overridden (same material) via materialVariantId / colourId / colourName. `confirm: true`
 * posts stock (lots with landed cost) in the same transaction.
 */
export interface InwardInput {
  purchaseId: string;
  locationId?: string;
  docDate?: string;
  supplierRef?: string;
  remarks?: string;
  confirm?: boolean;
  lines: Array<{ purchaseLineId: string; qty: number; lotNo?: string; materialVariantId?: string; colourId?: string; colourName?: string }>;
}
/** POST /inwards/direct — goods without a PO; a confirmed PO is raised behind it automatically. */
/** Per-party running lot numbers (KAV-1, MAH-3 ...): suggestion only, the user may type another. */
export interface LotSuggestion { prefix: string; next: number; lotNo: string }
export const lotNumbersApi = {
  nextForSupplier: (partyId: string) => apiClient.get<LotSuggestion>('/lot-numbers/next/supplier', { params: { partyId } }).then(r => r.data),
  nextForJobWorker: (partyId: string) => apiClient.get<LotSuggestion>('/lot-numbers/next/job-worker', { params: { partyId } }).then(r => r.data),
};

export interface DirectInwardInput {
  supplierId: string;
  supplierInvoiceNo?: string;
  challanNo?: string;
  lotNo?: string;
  docDate?: string;
  locationId?: string;
  otherCharges?: number;
  remarks?: string;
  lines: Array<{ materialVariantId?: string; materialId?: string; colourId?: string; colourName?: string; uomId?: string; qty: number; rate?: number; lotNo?: string; thans?: number[] }>;
}

export const inwardsApi = {
  list: (params?: { status?: string; purchaseId?: string; supplierId?: string }) => apiClient.get<Inward[]>('/inwards', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<Inward>(`/inwards/${id}`).then(r => r.data),
  create: (body: InwardInput) => apiClient.post<Inward>('/inwards', body, idempotencyHeaders()).then(r => r.data),
  createDirect: (body: DirectInwardInput) => apiClient.post<Inward>('/inwards/direct', body, idempotencyHeaders()).then(r => r.data),
  confirm: (id: string) => apiClient.post<Inward>(`/inwards/${id}/confirm`, undefined, idempotencyHeaders()).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post<Inward>(`/inwards/${id}/cancel`, { reason }).then(r => r.data),
};

// ---------- purchase returns ----------
export interface PurchaseReturnLine {
  _id: string;
  inwardLineId: string;
  lotId: string;
  stockItemId: string;
  materialVariantId: string;
  qty: number;
  unitCost: number;
  amount: number;
}
export interface PurchaseReturn {
  _id: string;
  docNo: string;
  docDate: string;
  supplierId: string;
  purchaseId: string;
  inwardId: string;
  locationId: string;
  reason: string;
  remarks?: string;
  lines: PurchaseReturnLine[];
  totalAmount: number;
  debitNoteNo?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  cancelReason?: string;
}
export interface ReturnableLine {
  inwardLineId: string;
  materialVariantId: string;
  lotId: string | null;
  lotNo: string | null;
  unitCost: number;
  received: number;
  alreadyReturned: number;
  returnable: number;
  onHand: number;
  maxReturnQty: number;
}
export interface Returnable {
  inwardId: string;
  inwardNo: string;
  status: string;
  supplierId: string;
  purchaseId: string;
  locationId: string;
  lines: ReturnableLine[];
}

export const purchaseReturnsApi = {
  list: (params?: { status?: string; supplierId?: string; inwardId?: string }) => apiClient.get<PurchaseReturn[]>('/purchase-returns', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<PurchaseReturn>(`/purchase-returns/${id}`).then(r => r.data),
  returnable: (inwardId: string, locationId?: string) => apiClient.get<Returnable>('/purchase-returns/returnable', { params: { inwardId, locationId } }).then(r => r.data),
  create: (body: { inwardId: string; locationId?: string; reason: string; remarks?: string; confirm?: boolean; lines: Array<{ inwardLineId: string; qty: number }> }) =>
    apiClient.post<PurchaseReturn>('/purchase-returns', body, idempotencyHeaders()).then(r => r.data),
  confirm: (id: string) => apiClient.post<PurchaseReturn>(`/purchase-returns/${id}/confirm`, undefined, idempotencyHeaders()).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post<PurchaseReturn>(`/purchase-returns/${id}/cancel`, { reason }).then(r => r.data),
};

export function formatDate(d?: string | Date | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB').replace(/\//g, '-');
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Small loader for the reference data most procurement screens need. */
export async function loadProcurementRefs() {
  const [suppliers, variants, uoms] = await Promise.all([
    apiClient.get<Array<{ _id: string; name: string; isActive: boolean }>>('/suppliers').then(r => r.data),
    materialVariantsApi.list(),
    uomsApi.list(),
  ]);
  return { suppliers, variants, uoms };
}

import { apiClient } from './client';
import type { JobSlipStatus } from '../../types/domain';

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export interface StockShortage {
  materialVariantId: string;
  name: string;
  required: number;
  available: number;
  uom: string;
  shortBy?: number;
  onHand?: number;
  reservedByOpenJobSlips?: number;
}

export interface ApiProblem {
  status?: number;
  code?: string;
  detail: string;
  fieldErrors?: Record<string, string>;
  shortages?: StockShortage[];
}

/** Turns an axios error into the backend's problem+json shape ({code, detail, fieldErrors, shortages}). */
export function toProblem(err: unknown, fallback = 'Something went wrong. Please try again.'): ApiProblem {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> }; message?: string };
  const data = e?.response?.data ?? {};
  const fieldErrors = data.fieldErrors as Record<string, string> | undefined;
  let detail = (data.detail as string) || (data.message as string) || (data.title as string) || '';
  if (!detail && !e?.response) detail = 'Could not reach the server. Check your connection.';
  if (detail === 'Validation failed.' && fieldErrors) {
    detail = 'Please fix: ' + Object.entries(fieldErrors).map(([k, v]) => `${k} ${v}`).join('; ');
  }
  return {
    status: e?.response?.status,
    code: data.code as string | undefined,
    detail: detail || fallback,
    fieldErrors,
    shortages: Array.isArray(data.shortages) ? (data.shortages as StockShortage[]) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Shared lookups                                                      */
/* ------------------------------------------------------------------ */

export interface NamedRecord { _id: string; name: string; code?: string; isActive?: boolean; sortOrder?: number }

export interface MaterialOption {
  materialVariantId: string;
  materialId?: string;
  name: string;
  materialName?: string;
  colourName?: string;
  code?: string;
  uom: string;
  stockItemId?: string;
  mainWhOnHand: number;
  isActive: boolean;
}

export const lookupsApi = {
  colours: () => apiClient.get<NamedRecord[]>('/colours').then(r => r.data),
  sizes: () => apiClient.get<NamedRecord[]>('/sizes').then(r => r.data.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))),
  productCategories: () => apiClient.get<NamedRecord[]>('/product-categories').then(r => r.data),
  materialOptions: () => apiClient.get<MaterialOption[]>('/production/material-options').then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Designs + BOM (DSN-01..06)                                          */
/* ------------------------------------------------------------------ */

export interface DesignRecord {
  _id: string;
  designNo: string;
  name: string;
  productCategoryId: string;
  productType?: string;
  description?: string;
  colourOptions: string[];
  sizeOptions: string[];
  expectedProductionQty?: number;
  manufacturingInstructions?: string;
  defaultSellingRate?: number;
  hsn?: string;
  imageUrls: string[];
  notes?: string;
  isActive: boolean;
  version: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface DesignInput {
  designNo: string;
  name: string;
  productCategoryId: string;
  productType?: string;
  description?: string;
  colourOptions: string[];
  sizeOptions: string[];
  expectedProductionQty?: number;
  manufacturingInstructions?: string;
  defaultSellingRate?: number;
  hsn?: string;
  notes?: string;
}

export interface DesignVariantRecord {
  _id: string;
  designId: string;
  colourId: NamedRecord;
  sizeId: NamedRecord;
  isActive: boolean;
}

export interface BomLineRecord {
  _id: string;
  role: string;
  materialVariantId: string;
  qtyPerGarmentBase: number;
  allowancePct: number;
  materialName: string;
  uom: string;
  mainWhOnHand: number;
}

export interface BomVersionRecord {
  _id: string;
  designId: string;
  versionNo: number;
  isActive: boolean;
  lines: BomLineRecord[];
  createdAt?: string;
}

export interface BomLineInput {
  role: string;
  materialVariantId: string;
  qtyPerGarmentBase: number;
  allowancePct: number;
}

export interface RequirementByMaterial {
  materialVariantId: string;
  materialName: string;
  uom: string;
  requiredQtyBase: number;
  availableQtyBase: number;
  shortfall: number;
}

export interface RequirementLine {
  bomLineId?: string;
  role: string;
  materialVariantId: string;
  materialName: string;
  uom: string;
  qtyPerGarmentBase: number;
  allowancePct: number;
  requiredQtyBase: number;
}

export interface RequirementResult {
  designId: string;
  bomVersionId: string;
  totalGarments: number;
  lines: RequirementLine[];
  byMaterial: RequirementByMaterial[];
  stockCheckPassed: boolean;
}

export const designsApi = {
  list: () => apiClient.get<DesignRecord[]>('/designs').then(r => r.data),
  get: (id: string) => apiClient.get<DesignRecord>(`/designs/${id}`).then(r => r.data),
  create: (body: DesignInput) => apiClient.post<DesignRecord>('/designs', body).then(r => r.data),
  update: (id: string, body: Partial<DesignInput>, version?: number) =>
    apiClient.patch<DesignRecord>(`/designs/${id}`, body, version !== undefined ? { headers: { 'If-Match': `"${version}"` } } : undefined).then(r => r.data),
  setActive: (id: string, active: boolean) => apiClient.post(`/designs/${id}/${active ? 'reactivate' : 'deactivate'}`).then(r => r.data),
  setRate: (id: string, rate: number) => apiClient.post(`/designs/${id}/rate`, { rate }).then(r => r.data),
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<DesignRecord>(`/designs/${id}/images`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  variants: (id: string) => apiClient.get<DesignVariantRecord[]>(`/designs/${id}/variants`).then(r => r.data),
  regenerateVariants: (id: string) => apiClient.post<DesignVariantRecord[]>(`/designs/${id}/variants`).then(r => r.data),
  /** null when the design has no BOM yet (backend 404). */
  bom: (id: string) => apiClient.get<BomVersionRecord>(`/designs/${id}/bom`).then(r => r.data).catch(err => {
    if (err?.response?.status === 404) return null;
    throw err;
  }),
  bomHistory: (id: string) => apiClient.get<BomVersionRecord[]>(`/designs/${id}/bom/history`).then(r => r.data),
  setBom: (id: string, lines: BomLineInput[]) => apiClient.post<BomVersionRecord>(`/designs/${id}/bom`, { lines }).then(r => r.data),
  requirements: (id: string, qty: number) => apiClient.get<RequirementResult>(`/designs/${id}/requirements`, { params: { qty } }).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Production requirements / orders (JOB-01)                           */
/* ------------------------------------------------------------------ */

export interface ProductionOrderRecord {
  _id: string;
  docNo: string;
  docDate: string;
  designId: string;
  bomVersionId: string;
  quantities: { _id: string; colourId: string; sizeId: string; qty: number }[];
  totalGarments: number;
  requirements: (RequirementLine & { _id: string })[];
  byMaterial: RequirementByMaterial[];
  stockCheckPassed: boolean;
  plannedStartDate?: string;
  plannedEndDate?: string;
  notes?: string;
  status: 'PLANNED' | 'CANCELLED';
  cancelReason?: string;
  createdAt?: string;
}

export interface ProductionOrderInput {
  designId: string;
  quantities: { colourId: string; sizeId: string; qty: number }[];
  plannedStartDate?: string;
  plannedEndDate?: string;
  notes?: string;
}

export const productionOrdersApi = {
  list: (params?: { designId?: string; status?: string }) => apiClient.get<ProductionOrderRecord[]>('/production-orders', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<ProductionOrderRecord>(`/production-orders/${id}`).then(r => r.data),
  create: (body: ProductionOrderInput) => apiClient.post<ProductionOrderRecord>('/production-orders', body).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post(`/production-orders/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Job workers (factories + karigars)                                  */
/* ------------------------------------------------------------------ */

export interface JobWorkerLite {
  _id: string;
  name: string;
  type: 'FACTORY' | 'ARTISAN';
  contactPerson?: string;
  specialty?: string;
  mobile?: string;
  isActive: boolean;
}

export const jobWorkersApi = {
  list: (type?: 'FACTORY' | 'ARTISAN') => apiClient.get<JobWorkerLite[]>('/job-workers', { params: type ? { type } : undefined }).then(r => r.data),
  get: (id: string) => apiClient.get<JobWorkerLite>(`/job-workers/${id}`).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Job slips (JOB-02/03)                                               */
/* ------------------------------------------------------------------ */

export type BackendJobSlipStatus =
  | 'CREATED' | 'MATERIAL_ISSUED' | 'IN_PROCESS' | 'READY'
  | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';

export const JOB_SLIP_STATUS_LABEL: Record<BackendJobSlipStatus, JobSlipStatus> = {
  CREATED: 'Created',
  MATERIAL_ISSUED: 'Material Issued',
  IN_PROCESS: 'In Process',
  READY: 'Ready',
  PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export type ChargeBasis = 'PER_PIECE' | 'PER_METER' | 'LUMP_SUM';
export const CHARGE_BASIS_LABEL: Record<ChargeBasis, string> = {
  PER_PIECE: 'Per Piece',
  PER_METER: 'Per Metre',
  LUMP_SUM: 'Lump Sum',
};

export interface JobSlipRecord {
  _id: string;
  docNo: string;
  docDate: string;
  jobType: 'PROCESSING' | 'MANUFACTURING';
  jobWorkerId: string;
  designId: string;
  productionOrderId?: string;
  processingTypeId?: string;
  expectedOutputLines: { _id: string; colourId?: string; sizeId?: string; materialVariantId?: string; expectedQty: number }[];
  expectedCompletionDate?: string;
  chargeBasis: ChargeBasis;
  agreedRate: number;
  instructions?: string;
  remarks?: string;
  status: BackendJobSlipStatus;
  cancelReason?: string;
  version: number;
  createdAt?: string;
}

export interface JobSlipInput {
  jobType: 'PROCESSING' | 'MANUFACTURING';
  jobWorkerId: string;
  designId: string;
  productionOrderId?: string;
  expectedOutputLines: { colourId?: string; sizeId?: string; materialVariantId?: string; expectedQty: number }[];
  expectedCompletionDate?: string;
  chargeBasis: ChargeBasis;
  agreedRate: number;
  instructions?: string;
  remarks?: string;
}

export interface JobSlipUpdate {
  jobWorkerId?: string;
  expectedCompletionDate?: string;
  chargeBasis?: ChargeBasis;
  agreedRate?: number;
  instructions?: string;
  remarks?: string;
  challanNo?: string;
  docDate?: string;
  lotNo?: string;
  /** '' clears the design (karigar's own). */
  designId?: string;
}

export interface IssuePlanLine {
  materialVariantId: string;
  materialName: string;
  uom: string;
  roles: string[];
  qtyPerGarmentBase: number;
  allowancePct: number;
  requiredQty: number;
  issuedQty: number;
  returnedQty: number;
  pendingQty: number;
  mainWhOnHand: number;
  inBom: boolean;
}

export interface MaterialIssueRecord {
  _id: string;
  docNo: string;
  docDate: string;
  jobSlipId: string;
  jobWorkerId: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  notes?: string;
  acknowledgedAt?: string;
  discrepancyNote?: string;
  lines: { _id: string; materialVariantId: string; bomRole?: string; qtyBase: number; materialName?: string; uom?: string }[];
}

export interface IssuePlan {
  jobSlipId: string;
  jobSlipNo: string;
  jobType: string;
  status: BackendJobSlipStatus;
  totalGarments: number;
  bomVersionId?: string;
  lines: IssuePlanLine[];
  issues: MaterialIssueRecord[];
  fullyIssued: boolean;
}

export const jobSlipsApi = {
  list: (params?: { status?: string; jobWorkerId?: string; designId?: string; jobType?: string; productionOrderId?: string }) =>
    apiClient.get<JobSlipRecord[]>('/job-slips', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<JobSlipRecord>(`/job-slips/${id}`).then(r => r.data),
  create: (body: JobSlipInput) => apiClient.post<JobSlipRecord>('/job-slips', body).then(r => r.data),
  update: (id: string, body: JobSlipUpdate) => apiClient.patch<JobSlipRecord>(`/job-slips/${id}`, body).then(r => r.data),
  setStatus: (id: string, status: 'IN_PROCESS' | 'READY') => apiClient.post<JobSlipRecord>(`/job-slips/${id}/status`, { status }).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post<JobSlipRecord>(`/job-slips/${id}/cancel`, { reason }).then(r => r.data),
  issuePlan: (id: string) => apiClient.get<IssuePlan>(`/job-slips/${id}/issue-plan`).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Material issue (JOB-04)                                             */
/* ------------------------------------------------------------------ */

export interface PendingIssuanceRow {
  jobSlipId: string;
  jobSlipNo: string;
  jobType: string;
  status: BackendJobSlipStatus;
  jobWorkerId: string;
  designId: string;
  totalGarments: number;
  materialsInBom: number;
  materialsPending: number;
  anyIssued: boolean;
  fullyIssued: boolean;
  expectedCompletionDate?: string;
}

export const materialIssuesApi = {
  pending: (all = false) => apiClient.get<PendingIssuanceRow[]>('/production/pending-issuance', { params: all ? { all: 'true' } : undefined }).then(r => r.data),
  list: (params?: { jobSlipId?: string; status?: string }) => apiClient.get<MaterialIssueRecord[]>('/material-issues', { params }).then(r => r.data),
  create: (body: { jobSlipId: string; lines: { materialVariantId: string; bomRole?: string; qtyBase: number }[]; notes?: string }) =>
    apiClient.post<MaterialIssueRecord>('/material-issues', body).then(r => r.data),
  confirm: (id: string) => apiClient.post<MaterialIssueRecord>(`/material-issues/${id}/confirm`).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post<MaterialIssueRecord>(`/material-issues/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Khata book                                                          */
/* ------------------------------------------------------------------ */

export interface KhataTotals { earned: number; advances: number; payments: number; paid: number; balance: number }

export interface KhataSummaryRow extends KhataTotals {
  jobWorkerId: string;
  name: string;
  type: 'FACTORY' | 'ARTISAN';
  specialty?: string;
  mobile?: string;
  isActive: boolean;
}

export interface KhataLedgerEntry {
  id: string;
  date: string;
  type: 'JOB_CHARGE' | 'ADVANCE' | 'PAYMENT';
  ref: string;
  description: string;
  jobSlipId?: string;
  jobSlipNo?: string;
  credit: number;
  debit: number;
  balance: number;
}

export interface KhataLedger {
  jobWorker: { _id: string; name: string; type: string; specialty?: string; mobile?: string; isActive: boolean };
  entries: KhataLedgerEntry[];
  totals: KhataTotals;
}

export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';

export interface KhataPaymentRecord {
  _id: string;
  docNo: string;
  docDate: string;
  jobWorkerId: string;
  kind: 'ADVANCE' | 'PAYMENT';
  amount: number;
  mode: PaymentMode;
  reference?: string;
  jobSlipId?: string;
  notes?: string;
  status: 'POSTED' | 'CANCELLED';
  cancelReason?: string;
}

export const khataApi = {
  summary: (type?: 'FACTORY' | 'ARTISAN') => apiClient.get<KhataSummaryRow[]>('/khata/summary', { params: type ? { type } : undefined }).then(r => r.data),
  ledger: (jobWorkerId: string) => apiClient.get<KhataLedger>(`/khata/${jobWorkerId}/ledger`).then(r => r.data),
  payments: (jobWorkerId: string) => apiClient.get<KhataPaymentRecord[]>('/khata/payments', { params: { jobWorkerId } }).then(r => r.data),
  recordPayment: (body: { jobWorkerId: string; kind: 'ADVANCE' | 'PAYMENT'; amount: number; mode?: PaymentMode; reference?: string; jobSlipId?: string; date?: string; notes?: string }) =>
    apiClient.post<KhataPaymentRecord>('/khata/payments', body).then(r => r.data),
  cancelPayment: (id: string, reason: string) => apiClient.post<KhataPaymentRecord>(`/khata/payments/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** DD-MM-YYYY (the format the rest of the app shows). */
export function fmtDate(iso?: string | Date | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

/** yyyy-mm-dd for <input type="date">. */
export function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtQty(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

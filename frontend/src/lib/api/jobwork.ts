import { apiClient } from './client';
import type { BackendJobSlipStatus, ChargeBasis } from './production';

/* Receiving (JOB-09/10), processing (JOB-08), reconciliation (SHR / JOB-12), returns (JOB-07),
 * cost sheets (CST), delivery challan (CGST Rule 55) and the factory portal (/portal/v1). */

/* ------------------------------------------------------------------ */
/* Job receipts                                                        */
/* ------------------------------------------------------------------ */

export interface JobReceiptLineRecord {
  _id: string;
  colourId?: string;
  sizeId?: string;
  materialVariantId?: string;
  colourName?: string;
  sizeName?: string;
  materialVariantName?: string;
  uom?: string;
  expectedQty: number;
  receivedQty: number;
  acceptedQty?: number;
  rejectedQty?: number;
  damagedQty?: number;
}

export interface JobReceiptRecord {
  _id: string;
  docNo: string;
  docDate: string;
  jobSlipId: string;
  jobSlipNo?: string;
  jobType?: 'PROCESSING' | 'MANUFACTURING';
  jobSlipStatus?: BackendJobSlipStatus;
  jobSlipExpectedTotal?: number;
  jobWorkerId: string;
  jobWorkerName?: string;
  designNo?: string;
  designName?: string;
  lines: JobReceiptLineRecord[];
  totals: { received: number; accepted: number; rejected: number; damaged: number; expected: number };
  otherCharges?: number;
  chargeOverride?: number;
  remarks?: string;
  warnings?: string[];
  shortageReason?: string;
  processingSummary?: { sentQty: number; receivedQty: number; shortageQty: number; shortagePct: number };
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  cancelReason?: string;
}

export interface JobReceiptInput {
  jobSlipId: string;
  lines: { colourId?: string; sizeId?: string; materialVariantId?: string; receivedQty: number; acceptedQty?: number; rejectedQty?: number; damagedQty?: number }[];
  otherCharges?: number;
  manufacturingCharges?: number;
  remarks?: string;
  allowOverReceipt?: boolean;
  shortageReason?: string;
  confirm?: boolean;
}

export const jobReceiptsApi = {
  list: (params?: { jobSlipId?: string; jobWorkerId?: string; jobType?: string; status?: string }) =>
    apiClient.get<JobReceiptRecord[]>('/job-receipts', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<JobReceiptRecord>(`/job-receipts/${id}`).then(r => r.data),
  create: (body: JobReceiptInput) => apiClient.post<JobReceiptRecord>('/job-receipts', body).then(r => r.data),
  confirm: (id: string) => apiClient.post<JobReceiptRecord>(`/job-receipts/${id}/confirm`).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post<JobReceiptRecord>(`/job-receipts/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Reconciliation (SHR-01..04, JOB-11, JOB-12)                         */
/* ------------------------------------------------------------------ */

export interface ReconMaterial {
  materialVariantId?: string;
  material: string;
  uom: string;
  bomRole?: string;
  tolerancePct: number;
  issued: number;
  returned: number;
  consumed: number;
  writtenOff: number;
  shortage: number;
  shortagePct: number;
  remaining: number;
  toleranceExceeded: boolean;
  usedLessThanStandard: boolean;
  bomQtyPerGarment?: number;
  expectedPiecesFromMaterial?: number;
  status: 'RESOLVED' | 'UNRESOLVED';
}

export interface ReconVariant {
  key: string;
  label: string;
  colourId?: string;
  sizeId?: string;
  materialVariantId?: string;
  expected: number;
  received: number;
  accepted: number;
  rejected: number;
  damaged: number;
  difference: number;
}

export interface ReconciliationSummary {
  jobSlipId: string;
  jobSlipNo: string;
  jobType: 'PROCESSING' | 'MANUFACTURING';
  status: BackendJobSlipStatus;
  jobWorkerId: string;
  jobWorkerName?: string;
  designId: string;
  designNo?: string;
  designName?: string;
  processingType?: string;
  expectedCompletionDate?: string;
  production: { expected: number; received: number; accepted: number; rejected: number; damaged: number; difference: number; differencePct: number; variants: ReconVariant[] };
  garmentShortfall?: number;
  processing?: { issuedNet: number; sent: number; received: number; shortage: number; shortagePct: number; tolerancePct: number; toleranceExceeded: boolean; reasons: string[] };
  materials: ReconMaterial[];
  returns: { _id: string; docNo: string; docDate: string; status: string; qty: number; notes?: string }[];
  writeOffs: { stockItemId: string; material?: string; qty: number; reason?: string; postedAt?: string }[];
  receipts: { _id: string; docNo: string; docDate: string; status: string; received: number; accepted: number; warnings: string[] }[];
  issues: { _id: string; docNo: string; docDate: string; status: string; qty: number; acknowledgedAt?: string; discrepancyNote?: string }[];
  canClose: boolean;
  blockers: string[];
  flags: string[];
}

export const reconciliationApi = {
  summary: (jobSlipId: string) =>
    apiClient.get<ReconciliationSummary>(`/job-slips/${jobSlipId}/reconciliation-summary`).then(r => r.data),
  writeOff: (jobSlipId: string, reason: string) => apiClient.post(`/job-slips/${jobSlipId}/write-off`, { reason }).then(r => r.data),
  shortClose: (jobSlipId: string, reason: string) => apiClient.post(`/job-slips/${jobSlipId}/short-close`, { reason }).then(r => r.data),
  close: (jobSlipId: string) => apiClient.post(`/job-slips/${jobSlipId}/close`).then(r => r.data),
};

export const materialReturnsApi = {
  create: (body: { jobSlipId: string; lines: { materialVariantId: string; lotId?: string; qtyBase: number }[]; notes?: string; confirm?: boolean }) =>
    apiClient.post('/material-returns', body).then(r => r.data),
  confirm: (id: string) => apiClient.post(`/material-returns/${id}/confirm`).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post(`/material-returns/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Processing jobs (JOB-08)                                            */
/* ------------------------------------------------------------------ */

export interface ProcessingJobRow {
  id: string;
  jobNumber: string;
  docDate: string;
  status: BackendJobSlipStatus;
  processingTypeId?: string;
  processType: string;
  jobWorkerId: string;
  factoryName: string;
  designId: string;
  designNo?: string;
  designName?: string;
  inputMaterialVariantId?: string;
  inputMaterial: string;
  inputUom: string;
  inputQty: number;
  outputMaterialVariantId?: string;
  outputMaterial: string;
  outputUom: string;
  expectedOutputQty: number;
  actualOutputQty: number | null;
  sentQty: number;
  shortage: number | null;
  shortagePercent: number | null;
  remainingInCustody: number;
  issueDate: string | null;
  expectedReturnDate: string | null;
  chargeBasis: ChargeBasis;
  agreedRate: number;
  instructions?: string;
  remarks?: string;
  canReceive: boolean;
  issues?: { _id: string; docNo: string; docDate: string; status: string; qty: number }[];
  receipts?: { _id: string; docNo: string; docDate: string; status: string; receivedQty: number; processingSummary?: JobReceiptRecord['processingSummary']; shortageReason?: string; remarks?: string }[];
}

export interface ProcessingJobInput {
  jobWorkerId: string;
  designId: string;
  processingTypeId?: string;
  inputMaterialVariantId: string;
  inputQty: number;
  outputMaterialVariantId: string;
  expectedOutputQty: number;
  chargeBasis: ChargeBasis;
  agreedRate: number;
  expectedCompletionDate?: string;
  instructions?: string;
  remarks?: string;
}

export const processingJobsApi = {
  list: (params?: { status?: string; jobWorkerId?: string }) => apiClient.get<ProcessingJobRow[]>('/processing-jobs', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<ProcessingJobRow>(`/processing-jobs/${id}`).then(r => r.data),
  create: (body: ProcessingJobInput) => apiClient.post<ProcessingJobRow>('/processing-jobs', body).then(r => r.data),
  receive: (id: string, body: { receivedQty: number; otherCharges?: number; processingCharges?: number; shortageReason?: string; remarks?: string; allowOverReceipt?: boolean }) =>
    apiClient.post<{ receipt: JobReceiptRecord; job: ProcessingJobRow }>(`/processing-jobs/${id}/receive`, body).then(r => r.data),
  processingTypes: () => apiClient.get<{ _id: string; name: string; isActive?: boolean }[]>('/processing-types').then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Cost sheets (CST-01..08) - costing.view only                        */
/* ------------------------------------------------------------------ */

export interface CostSheetRow {
  id: string;
  jobSlipId: string;
  jobSlip: string;
  jobType: 'PROCESSING' | 'MANUFACTURING';
  jobSlipStatus: BackendJobSlipStatus;
  design: string;
  factory: string;
  acceptedQty: number;
  totalCost: number;
  expenses: number;
  costPerGarment: number;
  sellingRate: number;
  margin: number;
  marginPct: number;
  type: 'Provisional' | 'Final';
  date: string;
}

export interface CostSheetDetail {
  id: string;
  jobSlipId: string;
  jobSlip: string;
  jobType: 'PROCESSING' | 'MANUFACTURING';
  jobSlipStatus: BackendJobSlipStatus;
  design: string;
  designId: string;
  factory: string;
  date: string;
  type: 'Provisional' | 'Final';
  acceptedQty: number;
  components: { material: number; materialProcessingIncluded: number; processing: number; manufacturing: number; other: number };
  materialLines: { label: string; bomRole?: string; uom: string; qty: number; amount: number; avgRate: number; detail: string; processingIncluded: number; sourceProcessingJobs: string[] }[];
  charges: { kind: 'PROCESSING' | 'MANUFACTURING' | 'OTHER'; basis: string; quantity: number; rate: number; amount: number; note?: string; receiptNo?: string }[];
  totalCost: number;
  costPerGarment: number;
  sellingRate: number;
  margin: number;
  marginPct: number;
  varianceOnSold: number;
  revaluations: { lotId: string; oldCost: number; newCost: number; at: string }[];
}

export const costingApi = {
  list: (params?: { jobType?: string; status?: string; designId?: string }) =>
    apiClient.get<CostSheetRow[]>('/costing/cost-sheets', { params }).then(r => r.data),
  get: (jobSlipId: string) => apiClient.get<CostSheetDetail>(`/costing/cost-sheets/${jobSlipId}`).then(r => r.data),
};

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

/** Same-origin URL of a print-ready HTML document (opens in a new tab; session cookie applies). */
export function documentUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  return `${base}/documents/${path}`;
}
export const challanUrl = (materialIssueId: string) => documentUrl(`material-issues/${materialIssueId}/challan`);

/* ------------------------------------------------------------------ */
/* Factory / artisan portal (/portal/v1, party-scoped)                 */
/* ------------------------------------------------------------------ */

const PORTAL_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/api\/v1\/?$/, '/portal/v1');

export interface PortalJob {
  id: string;
  slipNumber: string;
  date: string;
  jobType: 'PROCESSING' | 'MANUFACTURING';
  designNo?: string;
  designName?: string;
  design: string;
  expectedQty: number;
  dueDate: string | null;
  status: BackendJobSlipStatus;
  overdue: boolean;
  dispatchedQty: number;
  receivedByCompany?: number | { docNo: string; date: string; received: number; accepted: number; rejected: number }[];
  pendingAcknowledgement: boolean;
}

export interface PortalJobDetail extends Omit<PortalJob, 'receivedByCompany'> {
  instructions: string;
  expectedOutput: { colour?: string; size?: string; material?: string; uom?: string; qty: number }[];
  materialIssues: { id: string; docNo: string; date: string; acknowledgedAt: string | null; discrepancyNote?: string; lines: { material: string; uom: string; qty: number }[] }[];
  materialReturns: { docNo: string; date: string; lines: { material: string; uom: string; qty: number }[] }[];
  materialWithMe: { name: string; uom: string; issued: number; returned: number; used: number; remaining: number }[];
  receivedByCompany: { docNo: string; date: string; received: number; accepted: number; rejected: number }[];
  dispatchDeclarations: { qty: number; note?: string; declaredAt: string }[];
}

const portal = { baseURL: PORTAL_BASE };
export const portalApi = {
  me: () => apiClient.get<{ _id: string; name: string; type: string }>('/me', portal).then(r => r.data),
  jobs: () => apiClient.get<PortalJob[]>('/jobs', portal).then(r => r.data),
  job: (id: string) => apiClient.get<PortalJobDetail>(`/jobs/${id}`, portal).then(r => r.data),
  acknowledge: (id: string, discrepancyNote?: string) =>
    apiClient.post<PortalJobDetail>(`/jobs/${id}/acknowledge`, { discrepancyNote: discrepancyNote || undefined }, portal).then(r => r.data),
  setStatus: (id: string, status: 'IN_PROCESS' | 'READY') => apiClient.post<PortalJobDetail>(`/jobs/${id}/status`, { status }, portal).then(r => r.data),
  declareDispatch: (id: string, qty: number, note?: string) =>
    apiClient.post<PortalJobDetail>(`/jobs/${id}/dispatch-declaration`, { qty, note: note || undefined }, portal).then(r => r.data),
};

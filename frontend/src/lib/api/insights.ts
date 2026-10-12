import { apiClient } from './client';

/** Backend RFC-7807 problem body -> a human message. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const data = (err as { response?: { data?: { detail?: string; title?: string; message?: string | string[]; fieldErrors?: Record<string, string> } } })
    .response?.data;
  if (!data) return (err as Error)?.message && !(err as { response?: unknown }).response ? `Network error: ${(err as Error).message}` : fallback;
  const fields = data.fieldErrors ? Object.entries(data.fieldErrors).map(([k, v]) => `${k}: ${v}`).join('; ') : '';
  const msg = Array.isArray(data.message) ? data.message.join('; ') : data.message;
  return [data.detail ?? data.title ?? msg ?? fallback, fields].filter(Boolean).join(' — ');
}

export function fmtDate(d?: string | Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return `${fmtDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function timeAgo(d?: string | Date | null): string {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const days = Math.round(h / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return fmtDate(d);
}

export interface UnitQty { unit: string; qty: number }
export function fmtUnits(list?: UnitQty[]): string {
  if (!list || list.length === 0) return '0';
  return list.map(u => `${u.qty.toLocaleString('en-IN')} ${u.unit.toLowerCase()}`).join(' · ');
}

// ---- Alerts & insights ----

export type AlertSeverity = 'critical' | 'warning' | 'info';
export interface AlertItem {
  key: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  ref?: string;
  link?: string;
  occurredAt?: string;
  data?: Record<string, unknown>;
  read?: boolean;
}
export interface InsightItem {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  icon: 'trend' | 'alert' | 'users' | 'factory' | 'stock';
  text: string;
  link?: string;
}

export const alertsApi = {
  list: () => apiClient.get<{ items: AlertItem[]; unreadCount: number; total: number }>('/alerts').then(r => r.data),
  markRead: (keys: string[]) => apiClient.post('/alerts/read', { keys }).then(r => r.data),
  markAllRead: () => apiClient.post('/alerts/read', { all: true }).then(r => r.data),
  insights: () => apiClient.get<{ items: InsightItem[] }>('/insights').then(r => r.data.items),
};

// ---- Dashboards ----

export interface RangeParams { from?: string; to?: string }
const dash = <T,>(name: string, params?: RangeParams) =>
  apiClient.get<T>(`/dashboards/${name}`, { params }).then(r => r.data);

export interface ActivityItem { entityType: string; entityId: string; ref: string; action: string; status?: string; by: string; at: string }
export interface AdminDashboardData {
  rawStockByUnit: UnitQty[];
  totalRawStockValue: number;
  totalReadyStock: number;
  materialWithFactoriesByUnit: UnitQty[];
  jobsInProgress: number;
  pendingJobs: number;
  productionCompleted: number;
  productionCompletedTrendPct: number | null;
  sales: number;
  salesTrendPct: number | null;
  pendingPaymentsTotal: number;
  pendingPaymentsCount: number;
  overduePaymentsTotal: number;
  overduePaymentsCount: number;
  lowStockCount: number;
  shortageCount: number;
  alertsCount: number;
  lowStock: AlertItem[];
  shortageSummary: AlertItem[];
  recentActivity: ActivityItem[];
}
export interface PurchaseDashboardData {
  amountsVisible: boolean;
  purchaseCount: number;
  purchaseCountPrev: number;
  totalPurchases?: number;
  totalPurchasesTrendPct?: number | null;
  materialPurchasedByUnit: UnitQty[];
  openPurchaseOrders: number;
  pendingInward: number;
  recentPurchases: Array<{ id: string; docNo: string; docDate: string; status: string; supplierName: string; material: string; amount?: number }>;
  pendingInwardList: Array<{ id: string; docNo: string; docDate: string; status: string; supplierName: string; material: string; outstandingQty: number; ageDays: number }>;
  supplierWisePurchases: Array<{ supplierId: string; supplierName: string; count: number; total?: number }>;
}
export interface RawMaterialDashboardData {
  currentStockByUnit: UnitQty[];
  currentRawStockValue?: number;
  materialIssuedByUnit: UnitQty[];
  materialWithFactoriesByUnit: UnitQty[];
  processedMaterialByUnit: UnitQty[];
  shortageAlerts: AlertItem[];
  maxShortagePct: number;
  shortageTolerancePct: number;
  lowStockCount: number;
  lowStock: AlertItem[];
}
export interface DesignRow { designId: string; designNo: string; name: string; imageUrl: string | null; producedQty: number; onHand: number; openJobs: number }
export interface DesignDashboardData {
  totalDesigns: number;
  activeDesigns: number;
  newDesignsInRange: number;
  designsInProduction: number;
  designWiseProduction: DesignRow[];
  designWiseStock: DesignRow[];
}
export interface ProductionDashboardData {
  statusCounts: Record<string, number>;
  activeJobs: number;
  createdJobs: number;
  awaitingReconciliation: number;
  overdueCount: number;
  productionCompleted: number;
  productionCompletedTrendPct: number | null;
  shortageAlerts: AlertItem[];
  overdueJobs: Array<{ id: string; docNo: string; status: string; jobWorkerName: string; designName: string; expectedCompletionDate: string; daysLate: number }>;
  recentReceipts: Array<{ id: string; docNo: string; jobSlipNo: string; jobWorkerName: string; qty: number; at: string }>;
  openJobsByWorker: Array<{ jobWorkerId: string; jobWorkerName: string; openJobs: number }>;
}
export interface PackingDashboardData {
  readyStockTotal: number;
  pendingPackingTotal: number;
  packedQtyTotal: number;
  designWiseStock: Array<{ stockItemId: string; designNo: string; designName: string; colourName: string; sizeName: string; onHand: number; packedQty: number; pendingQty: number; packingStatus: string }>;
}
export interface SalesDashboardData {
  salesOrdersOpen: number;
  customers: number;
  availableReadyStock: number;
  billing: number;
  billingTrendPct: number | null;
  qtySold: number;
  invoiceCount: number;
  pendingPaymentsTotal?: number;
  pendingPaymentsCount?: number;
  recentSales: Array<{ id: string; docNo: string; docDate: string; customerName: string; grandTotal: number; paymentStatus: string; qty: number }>;
  openSalesOrders: Array<{ id: string; docNo: string; status: string; customerName: string; qty: number; qtyInvoiced: number }>;
}

export const dashboardsApi = {
  admin: (p?: RangeParams) => dash<AdminDashboardData>('admin', p),
  purchase: (p?: RangeParams) => dash<PurchaseDashboardData>('purchase', p),
  rawMaterial: (p?: RangeParams) => dash<RawMaterialDashboardData>('raw-material', p),
  design: (p?: RangeParams) => dash<DesignDashboardData>('design', p),
  production: (p?: RangeParams) => dash<ProductionDashboardData>('production', p),
  packing: () => dash<PackingDashboardData>('packing'),
  sales: (p?: RangeParams) => dash<SalesDashboardData>('sales', p),
};

// ---- Traceability ----

export type TraceIcon = 'purchase' | 'inward' | 'stock' | 'design' | 'job' | 'receive' | 'sale';
export interface TraceNode {
  key: string;
  stage: string;
  refNo: string;
  status?: string;
  date: string;
  details: string;
  icon: TraceIcon;
  entityType: string;
  entityId: string;
  link?: string;
}
export interface TraceResult { query: string; matchedType: string; matchedId: string; summary: string; nodes: TraceNode[] }

export const traceApi = {
  search: (ref: string) => apiClient.get<TraceResult>('/trace', { params: { ref } }).then(r => r.data),
};

// ---- Reports ----

export type ReportRow = Record<string, unknown>;
export const reportsApi = {
  run: (path: string, params?: Record<string, string | undefined>) =>
    apiClient.get<ReportRow[] | Record<string, unknown>>(`/reports/${path}`, { params }).then(r => r.data),
  /** Downloads the CSV through the authenticated client (cookie session) and saves it. */
  downloadCsv: async (path: string, filename: string, params?: Record<string, string | undefined>) => {
    const res = await apiClient.get(`/reports/${path}/csv`, { params, responseType: 'blob' });
    saveBlob(res.data as Blob, filename);
  },
};

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Axios blob error bodies are Blobs; turn them back into the JSON problem for apiErrorMessage. */
export async function blobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return apiErrorMessage({ response: { data: parsed } }, fallback);
    } catch {
      return fallback;
    }
  }
  return apiErrorMessage(err, fallback);
}

// ---- Audit log ----

export interface AuditEntry {
  _id: string;
  occurredAt: string;
  actorUserId?: string | null;
  actorName: string;
  module: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  ref: string;
  changes: Array<{ field: string; before: string; after: string }>;
}
export interface AuditQuery { q?: string; module?: string; entityType?: string; from?: string; to?: string; page?: number; pageSize?: number }
export const auditApi = {
  list: (q: AuditQuery) =>
    apiClient.get<{ items: AuditEntry[]; total: number; page: number; pageSize: number; modules: string[] }>('/audit-log', { params: q }).then(r => r.data),
  exportCsv: async (q: AuditQuery) => {
    const res = await apiClient.get('/audit-log/export', { params: q, responseType: 'blob' });
    saveBlob(res.data as Blob, 'audit-log.csv');
  },
};

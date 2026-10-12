import { apiClient } from './client';

export interface CompanySettings {
  _id?: string;
  legalName: string;
  gstin?: string;
  state: string;
  address?: string;
  email?: string;
  phone?: string;
  ownerWhatsapp?: string;
  financialYearStart?: string;
  currentFinancialYear: string;
  overReceiptTolerancePct?: number;
  shortageTolerancePct?: number;
  pendingJobAlertDays?: number;
  materialPendingAlertDays?: number;
  pendingInwardAlertDays?: number;
  pendingSalesOrderAlertDays?: number;
  defaultPaymentTermsDays?: number;
  version?: number;
}

export interface TaxRule {
  _id: string;
  hsn: string;
  valueBandMin: number;
  valueBandMax?: number | null;
  ratePct: number;
  validFrom: string;
  validTo?: string | null;
  notes?: string;
  isActive: boolean;
  version: number;
}

export interface NumberSeries {
  _id: string;
  docType: string;
  fy: string;
  prefix: string;
  pad: number;
  nextNo: number;
}

export interface RoleRecord {
  _id: string;
  key: string;
  name: string;
  permissions: string[];
  isActive: boolean;
  isSystemRole?: boolean;
}

export const settingsApi = {
  getCompany: () => apiClient.get<CompanySettings | null>('/settings/company').then(r => r.data),
  updateCompany: (patch: Partial<CompanySettings>) => apiClient.put<CompanySettings>('/settings/company', patch).then(r => r.data),

  listTaxRules: () => apiClient.get<TaxRule[]>('/tax-rules').then(r => r.data),
  createTaxRule: (body: Partial<TaxRule>) => apiClient.post<TaxRule>('/tax-rules', body).then(r => r.data),
  updateTaxRule: (id: string, body: Partial<TaxRule>, version?: number) =>
    apiClient.patch<TaxRule>(`/tax-rules/${id}`, body, version !== undefined ? { headers: { 'If-Match': `"${version}"` } } : undefined).then(r => r.data),
  setTaxRuleActive: (id: string, active: boolean) => apiClient.post(`/tax-rules/${id}/${active ? 'reactivate' : 'deactivate'}`).then(r => r.data),

  listSeries: () => apiClient.get<NumberSeries[]>('/settings/number-series').then(r => r.data),
  ensureSeries: (body: { docType: string; fy: string; prefix: string; pad?: number }) =>
    apiClient.post('/settings/number-series', body).then(r => r.data),
  updateSeries: (id: string, body: { prefix?: string; pad?: number }) =>
    apiClient.patch<NumberSeries>(`/settings/number-series/${id}`, body).then(r => r.data),

  listRoles: () => apiClient.get<RoleRecord[]>('/roles').then(r => r.data),
  listPermissionKeys: () => apiClient.get<string[]>('/permissions').then(r => r.data),
  setRolePermissions: (key: string, permissions: string[]) =>
    apiClient.put<RoleRecord>(`/roles/${key}/permissions`, { permissions }).then(r => r.data),
  createRole: (body: { key: string; name: string; permissions: string[] }) => apiClient.post<RoleRecord>('/roles', body).then(r => r.data),
};

export function previewNumber(s: Pick<NumberSeries, 'prefix' | 'fy' | 'pad' | 'nextNo'>): string {
  return `${s.prefix}/${s.fy}/${String(s.nextNo).padStart(s.pad, '0')}`;
}

import { masterCrudApi } from './masterCrud';
import { apiClient } from './client';

export interface SupplierRecord {
  _id: string;
  name: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  gstin?: string;
  address?: string;
  paymentTerms?: string;
  isActive: boolean;
}

const api = masterCrudApi<SupplierRecord>('/suppliers');

export const suppliersApi = {
  list: () => api.list(),
  get: (id: string) => api.get(id),
  create: (body: Partial<SupplierRecord>) => api.create(body),
  update: (id: string, body: Partial<SupplierRecord>) => api.update(id, body),
  setActive: (id: string, active: boolean) => apiClient.post(`/suppliers/${id}/${active ? 'reactivate' : 'deactivate'}`),
};

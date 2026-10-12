import { masterCrudApi } from './masterCrud';
import { apiClient } from './client';

export interface CustomerRecord {
  _id: string;
  name: string;
  businessName?: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  billingAddress?: string;
  shippingAddress?: string;
  gstin?: string;
  state?: string;
  defaultDiscountPct?: number;
  paymentTerms?: string;
  notes?: string;
  isActive: boolean;
}

const api = masterCrudApi<CustomerRecord>('/customers');

export const customersApi = {
  list: () => api.list(),
  get: (id: string) => api.get(id),
  create: (body: Partial<CustomerRecord>) => api.create(body),
  update: (id: string, body: Partial<CustomerRecord>) => api.update(id, body),
  setActive: (id: string, active: boolean) => apiClient.post(`/customers/${id}/${active ? 'reactivate' : 'deactivate'}`),
};

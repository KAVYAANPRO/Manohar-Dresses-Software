import { apiClient } from './client';

/** A factory is a job worker (backend `job_workers`) of type FACTORY; creating one also creates its custody location. */
export interface FactoryRecord {
  _id: string;
  name: string;
  type: 'FACTORY';
  contactPerson?: string;
  specialty?: string;
  mobile?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
  isActive: boolean;
  version: number;
}

export interface FactoryInput {
  name: string;
  contactPerson?: string;
  specialty?: string;
  mobile?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
}

export const FACTORY_SPECIALTIES = ['Cutting', 'Dyeing', 'Printing', 'Stitching', 'Embroidery', 'Finishing / Packing', 'Other'] as const;

export const factoriesApi = {
  list: () => apiClient.get<FactoryRecord[]>('/job-workers', { params: { type: 'FACTORY' } }).then(r => r.data),
  get: (id: string) => apiClient.get<FactoryRecord>(`/job-workers/${id}`).then(r => r.data),
  create: (body: FactoryInput) => apiClient.post<FactoryRecord>('/job-workers', { ...body, type: 'FACTORY' }).then(r => r.data),
  update: (id: string, body: FactoryInput) => apiClient.patch<FactoryRecord>(`/job-workers/${id}`, body).then(r => r.data),
  setActive: (id: string, active: boolean) => apiClient.post(`/job-workers/${id}/${active ? 'reactivate' : 'deactivate'}`).then(r => r.data),
};

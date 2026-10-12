import { apiClient } from './client';

/** Thin, typed wrapper over the backend's standard master-crud routes (list/create/update). */
export function masterCrudApi<T>(endpoint: string) {
  return {
    list: (params?: Record<string, unknown>) => apiClient.get<T[]>(endpoint, { params }).then(r => r.data),
    get: (id: string) => apiClient.get<T>(`${endpoint}/${id}`).then(r => r.data),
    create: (body: unknown) => apiClient.post<T>(endpoint, body).then(r => r.data),
    update: (id: string, body: unknown) => apiClient.patch<T>(`${endpoint}/${id}`, body).then(r => r.data),
  };
}

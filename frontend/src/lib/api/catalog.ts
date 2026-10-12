import { apiClient } from './client';

export const CATALOG_TAGS = ['Unstitched', 'Stitched', 'Semi-Stitched', 'Ready to Wear'] as const;
export type CatalogTag = (typeof CATALOG_TAGS)[number];

/** Backend catalog entry (design/catalog/catalog-item.schema.ts). Prices are absent for users without design.rate.view. */
export interface CatalogItem {
  _id: string;
  designId: string | null;
  designLabel: string | null;
  designNameOrNumber: string;
  salesPrice?: number;
  defaultPrice?: number;
  samplePrice?: number;
  tag: CatalogTag;
  description?: string;
  designRecipe?: string;
  sizes: string[];
  colours: string[];
  hsnCode?: string;
  gstPct?: number;
  minStockQty?: number;
  minOrderQty?: number;
  outOfStock: boolean;
  photoUrls: string[];
  readyStockQty: number | null;
  lowStock: boolean;
  isActive: boolean;
  version: number;
}

export type CatalogPayload = Partial<Omit<CatalogItem, '_id' | 'designLabel' | 'readyStockQty' | 'lowStock' | 'isActive' | 'version'>>;

export const catalogApi = {
  list: (params?: { q?: string; tag?: string; includeInactive?: boolean }) =>
    apiClient.get<CatalogItem[]>('/catalog', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<CatalogItem>(`/catalog/${id}`).then(r => r.data),
  create: (body: CatalogPayload) => apiClient.post<CatalogItem>('/catalog', body).then(r => r.data),
  update: (id: string, body: CatalogPayload, version?: number) =>
    apiClient.patch<CatalogItem>(`/catalog/${id}`, body, version !== undefined ? { headers: { 'If-Match': `"${version}"` } } : undefined).then(r => r.data),
  setActive: (id: string, active: boolean) => apiClient.post<CatalogItem>(`/catalog/${id}/${active ? 'reactivate' : 'deactivate'}`).then(r => r.data),
  uploadPhoto: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<CatalogItem>(`/catalog/${id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  removePhoto: (id: string, url: string) => apiClient.delete<CatalogItem>(`/catalog/${id}/photos`, { params: { url } }).then(r => r.data),
};

export interface DesignOption { _id: string; designNo: string; name: string; hsn?: string; defaultSellingRate?: number; description?: string }
export const listDesignOptions = () => apiClient.get<DesignOption[]>('/designs', { params: { isActive: true } }).then(r => r.data);

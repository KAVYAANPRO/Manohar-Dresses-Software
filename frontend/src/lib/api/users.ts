import { masterCrudApi } from './masterCrud';
import { apiClient } from './client';

export interface UserRecord {
  _id: string;
  username: string;
  displayName?: string;
  email?: string;
  mobile?: string;
  principal: 'internal' | 'party';
  jobWorkerId?: string;
  roleKeys: string[];
  isActive: boolean;
  permissionOverrides?: { allow: string[]; deny: string[] };
}

/** This app's role label -> the backend's DEFAULT_ROLES key (roles.seed-data.ts). */
export const BACKEND_ROLE_KEY: Record<string, string> = {
  'Super Admin': 'SUPER_ADMIN',
  Purchase: 'PURCHASE',
  Inventory: 'INVENTORY',
  Design: 'DESIGN',
  Production: 'PRODUCTION',
  Packing: 'PACKING',
  Sales: 'SALES',
  'Factory User': 'FACTORY',
  'Artisan User': 'ARTISAN',
};

export const ROLE_KEY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(BACKEND_ROLE_KEY).map(([label, key]) => [key, label])
);

export function roleLabel(roleKeys: string[]): string {
  return roleKeys.map(k => ROLE_KEY_LABEL[k] ?? k).join(', ') || '—';
}

const api = masterCrudApi<UserRecord>('/users');

export const usersApi = {
  list: () => api.list(),
  get: (id: string) => api.get(id),
  create: (body: { username: string; displayName?: string; email?: string; mobile?: string; password: string; principal: 'internal' | 'party'; jobWorkerId?: string; roleKeys: string[] }) =>
    api.create(body),
  update: (id: string, body: Partial<UserRecord>) => api.update(id, body),
  setActive: (id: string, active: boolean) => apiClient.post(`/users/${id}/${active ? 'reactivate' : 'deactivate'}`),
  setRoles: (id: string, roleKeys: string[]) => apiClient.put(`/users/${id}/roles`, { roleKeys }),
  setPermissionOverrides: (id: string, allow: string[], deny: string[]) => apiClient.put(`/users/${id}/permission-overrides`, { allow, deny }),
  resetPassword: (id: string, newPassword: string) => apiClient.post(`/users/${id}/reset-password`, { newPassword }),
};

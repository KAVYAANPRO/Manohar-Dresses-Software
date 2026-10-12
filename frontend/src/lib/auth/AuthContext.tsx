import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Role, PermissionKey } from '../permissions/permissions';
import { apiClient } from '../api/client';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Set only for Factory/Artisan users — scopes all party-owned data (BR-08/AUTH-06). */
  partyId?: string;
  /** AUTH-04 per-user overrides on top of the role default. */
  grantedPermissions?: PermissionKey[];
  deniedPermissions?: PermissionKey[];
  /**
   * Raw permission keys as granted by the backend (module.resource.action, e.g.
   * "purchase.view" - see backend/src/identity/permissions.catalogue.ts). UI gating
   * runs on this list via BACKEND_PERMISSION_MAP (../permissions/permissions.ts).
   */
  backendPermissions?: string[];
  /** Backend super admin: every permission. */
  isSuperAdmin?: boolean;
  /** Backend role keys, e.g. ["PURCHASE"]. */
  roleKeys?: string[];
}

interface BackendUser {
  id: string;
  username: string;
  principal: 'internal' | 'party' | 'system';
  jobWorkerId: string | null;
  isSuperAdmin: boolean;
  permissions: string[];
  /** DEFAULT_ROLES keys this user holds on the backend, e.g. "PURCHASE", "SALES". */
  roleKeys: string[];
}

/** Backend role key (roles.seed-data.ts) -> this app's own Role enum. First match wins if a user somehow holds more than one. */
const ROLE_KEY_TO_ROLE: Record<string, Role> = {
  SUPER_ADMIN: 'super_admin',
  PURCHASE: 'purchase',
  INVENTORY: 'inventory',
  DESIGN: 'design',
  PRODUCTION: 'production',
  PACKING: 'packing',
  SALES: 'sales',
  FACTORY: 'factory',
  ARTISAN: 'factory',
};

function toFrontendUser(backendUser: BackendUser): User {
  const mappedRole = backendUser.roleKeys.map(k => ROLE_KEY_TO_ROLE[k]).find(Boolean);
  return {
    id: backendUser.id,
    name: backendUser.username,
    role: backendUser.isSuperAdmin ? 'super_admin' : backendUser.jobWorkerId ? 'factory' : mappedRole ?? 'sales',
    partyId: backendUser.jobWorkerId ?? undefined,
    backendPermissions: backendUser.permissions,
    isSuperAdmin: backendUser.isSuperAdmin,
    roleKeys: backendUser.roleKeys,
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /**
   * Dev-only: switch role locally without a real login round trip, so the
   * frontend's permission gating can be exercised without backend permission
   * data. Purely client-side UI state — does not change backend permissions.
   */
  switchRole: (role: Role) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ user: BackendUser }>('/auth/me')
      .then(res => setUser(toFrontendUser(res.data.user)))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (usernameOrMobile: string, password: string) => {
    const res = await apiClient.post<{ user: BackendUser }>('/auth/login', { usernameOrMobile, password });
    setUser(toFrontendUser(res.data.user));
  };

  const logout = () => {
    apiClient.post('/auth/logout').finally(() => setUser(null));
  };

  const switchRole = (role: Role) => {
    setUser(prev => (prev ? { ...prev, role, name: prev.name } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

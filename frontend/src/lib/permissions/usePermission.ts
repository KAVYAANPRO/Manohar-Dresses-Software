import { useAuth } from '../auth/AuthContext';
import { backendGrants, hasBackendCode, roleHasPermission, type PermissionKey } from './permissions';

/**
 * Central permission check (frontend.md §8). Every place in the UI that
 * decides whether to show an action or a protected field (rate/cost/margin)
 * must go through this hook or the <Can> gate, never re-derive role checks
 * inline - that's how AUTH-07/CST-07/PKG-02 stayed unenforced before.
 *
 * Source of truth is the logged-in user's REAL backend permission list
 * (user.backendPermissions from /auth/me: role grants plus per-user allow/deny
 * overrides, already resolved by the backend), translated through
 * BACKEND_PERMISSION_MAP. Super Admin is always allowed. The static role table
 * is only a fallback for a user object that carries no backend list.
 */
export function usePermission() {
  const { user } = useAuth();

  const has = (key: PermissionKey): boolean => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (user.deniedPermissions?.includes(key)) return false;
    if (user.grantedPermissions?.includes(key)) return true;
    if (user.backendPermissions) return backendGrants(user.backendPermissions, key);
    return roleHasPermission(user.role, key);
  };

  const hasAny = (keys: PermissionKey[]) => keys.some(has);
  const hasAll = (keys: PermissionKey[]) => keys.every(has);
  /** Check one raw backend permission code (e.g. 'report.sales.view'). */
  const hasCode = (code: string): boolean =>
    !!user && (!!user.isSuperAdmin || hasBackendCode(user.backendPermissions, code));

  return { has, hasAny, hasAll, hasCode, role: user?.role };
}

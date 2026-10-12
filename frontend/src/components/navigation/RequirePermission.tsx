import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermission } from '../../lib/permissions/usePermission';
import type { PermissionKey } from '../../lib/permissions/permissions';

/**
 * Blocks a route outright (not just hiding its nav link) for a role lacking `perm` — otherwise
 * hiding a sidebar link is security theater, since the page is still reachable by typing its URL.
 */
export function RequirePermission({ perm, children }: { perm: PermissionKey; children: ReactNode }) {
  const { has } = usePermission();
  if (!has(perm)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

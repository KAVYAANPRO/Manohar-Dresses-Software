import type { ReactNode } from 'react';
import { usePermission } from './usePermission';
import type { PermissionKey } from './permissions';

interface CanProps {
  /** Single permission key, or a list — see `mode`. */
  perm: PermissionKey | PermissionKey[];
  /** 'all' (default) requires every key in a list; 'any' requires at least one. */
  mode?: 'all' | 'any';
  children: ReactNode;
  /** Rendered instead of children when the check fails. Omit to render nothing. */
  fallback?: ReactNode;
}

/**
 * Gate for actions AND protected fields (rates/costs/margins). For a
 * protected field this must wrap the value itself so the value is never
 * mounted into the DOM for an unauthorized user — never just CSS-hide it
 * (frontend.md §8.1, "Never return protected financial values and merely
 * blur them in CSS").
 */
export function Can({ perm, mode = 'all', children, fallback = null }: CanProps) {
  const { has, hasAny, hasAll } = usePermission();
  const keys = Array.isArray(perm) ? perm : [perm];
  const allowed = Array.isArray(perm) ? (mode === 'any' ? hasAny(keys) : hasAll(keys)) : has(perm);
  return <>{allowed ? children : fallback}</>;
}

/** Convenience wrapper for the common "hide a rate/cost/margin cell" case. */
export function RestrictedValue({ perm, children }: { perm: PermissionKey | PermissionKey[]; children: ReactNode }) {
  return (
    <Can perm={perm} fallback={<span className="text-slate-400 text-xs italic">Restricted</span>}>
      {children}
    </Can>
  );
}

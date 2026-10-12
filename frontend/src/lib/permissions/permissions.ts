// Frontend permission model. Mirrors prd.md §2.2's proposed permission matrix.
//
// IMPORTANT: this is a UX convenience layer only (frontend.md §8). Hiding an
// action or field here must never be the only thing standing between a user
// and protected data — the backend must re-check every one of these keys
// server-side once it exists. Field-level protected values (rates, costs,
// margins) must additionally never be fetched for a user lacking the key,
// once real API calls replace the mock data layer.

export const ROLES = [
  'super_admin',
  'purchase',
  'inventory',
  'design',
  'production',
  'packing',
  'sales',
  'factory',
] as const;
export type Role = typeof ROLES[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin / Owner',
  purchase: 'Purchase Department',
  inventory: 'Raw Material / Inventory',
  design: 'Design Department',
  production: 'Production Department',
  packing: 'Packing Department',
  sales: 'Sales Department',
  factory: 'Factory / Artisan',
};

export const PERMISSION_KEYS = [
  // Purchase
  'purchases.view', 'purchases.rate.view', 'purchases.create', 'purchases.edit', 'purchases.confirm', 'purchases.cancel',
  // Suppliers
  'suppliers.view', 'suppliers.edit',
  // Materials / masters
  'materials.view', 'materials.edit',
  'customers.view', 'customers.edit',
  'factories.view', 'factories.edit',
  // Inward
  'inward.view', 'inward.create', 'inward.confirm',
  // Stock
  'stock.view', 'stock.edit', 'stock.rate.view', 'adjustments.create', 'adjustments.approve',
  // Design
  'designs.view', 'designs.edit', 'designs.rate.view',
  // Production
  'requirements.view', 'requirements.edit',
  'jobslips.view', 'jobslips.edit', 'jobslips.confirm', 'jobslips.cancel',
  'issuance.view', 'issuance.edit', 'issuance.confirm',
  'processing.view', 'processing.edit',
  'receiving.view', 'receiving.edit', 'receiving.confirm', 'receiving.rate.view',
  'reconciliation.view', 'reconciliation.approve',
  // Costing
  'costing.view',
  // Ready stock / packing
  'readystock.view', 'packing.view', 'packing.edit',
  // Sales
  'salesorders.view', 'salesorders.edit', 'salesorders.confirm', 'salesorders.cancel', 'salesorders.rate.view',
  'invoices.view', 'invoices.edit', 'invoices.confirm', 'invoices.cancel', 'invoices.rate.view',
  'payments.view', 'payments.create',
  // Control
  'auditlog.view', 'reports.view', 'users.manage', 'settings.manage', 'traceability.view',
  // Factory portal (own party only — enforced by party scope, not this list)
  'factoryportal.acknowledge', 'factoryportal.updateStatus',
] as const;
export type PermissionKey = typeof PERMISSION_KEYS[number];

const ALL: PermissionKey[] = [...PERMISSION_KEYS];

/** prd.md §2.2 table, converted to boolean grants per role. */
export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  super_admin: ALL,

  purchase: [
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.confirm', 'purchases.cancel',
    'suppliers.view', 'suppliers.edit', 'materials.view',
    'inward.view', 'stock.view',
    'designs.view',
    // purchases.rate.view intentionally absent — amounts are Super Admin-only
  ],

  inventory: [
    'materials.view', 'materials.edit', 'suppliers.view',
    'inward.view', 'inward.create', 'inward.confirm',
    'stock.view', 'stock.edit', 'adjustments.create',
    'designs.view', 'requirements.view',
    'jobslips.view', 'issuance.view', 'issuance.edit', 'issuance.confirm',
    'processing.view', 'receiving.view', 'reconciliation.view',
    'factories.view',
    // stock.rate.view intentionally absent — amounts are Super Admin-only
  ],

  design: [
    'designs.view', 'designs.edit',
    'stock.view', 'requirements.view',
    'jobslips.view', 'purchases.view',
    // designs.rate.view intentionally absent — amounts are Super Admin-only
  ],

  production: [
    'designs.view', 'requirements.view', 'requirements.edit',
    'jobslips.view', 'jobslips.edit', 'jobslips.confirm', 'jobslips.cancel',
    'issuance.view', 'processing.view', 'processing.edit',
    'receiving.view', 'receiving.edit', 'receiving.confirm',
    'reconciliation.view', 'reconciliation.approve',
    'factories.view', 'factories.edit', 'stock.view', 'materials.view',
    'readystock.view',
    // receiving.rate.view intentionally absent — amounts are Super Admin-only
  ],

  packing: [
    'readystock.view', 'packing.view', 'packing.edit', 'designs.view',
    // costing.view intentionally absent — PKG-02
  ],

  sales: [
    'customers.view', 'customers.edit',
    'salesorders.view', 'salesorders.edit', 'salesorders.confirm', 'salesorders.cancel',
    'invoices.view', 'invoices.edit', 'invoices.confirm', 'invoices.cancel',
    'readystock.view', 'designs.view',
    // salesorders.rate.view / invoices.rate.view / payments.view / purchases.rate.view /
    // costing.view intentionally absent — amounts and payments are Super Admin-only
  ],

  factory: [
    'jobslips.view', 'issuance.view', 'receiving.view',
    'factoryportal.acknowledge', 'factoryportal.updateStatus',
    // no cost/rate keys, no other-party visibility (enforced by party scope)
  ],
};

/**
 * Frontend PermissionKey -> the backend permission code(s) that grant it
 * (backend/src/identity/permissions.catalogue.ts). Holding ANY listed code grants the key.
 * A trailing '*' matches by prefix (e.g. every report.<family>.view). This is what UI
 * gating actually runs on: the backend's real per-user permission list (role grants +
 * per-user allow/deny overrides, already resolved server-side) as returned by /auth/me.
 * The backend re-checks every one of these on the API, so this table only decides what
 * the UI offers - it can never grant access the API would refuse.
 */
export const BACKEND_PERMISSION_MAP: Record<PermissionKey, string[]> = {
  'purchases.view': ['purchase.view'],
  'purchases.rate.view': ['purchase.rates.view'],
  'purchases.create': ['purchase.edit'],
  'purchases.edit': ['purchase.edit'],
  'purchases.confirm': ['purchase.confirm'],
  'purchases.cancel': ['purchase.cancel'],
  'suppliers.view': ['master.supplier.view'],
  'suppliers.edit': ['master.supplier.edit'],
  'materials.view': ['master.material.view'],
  'materials.edit': ['master.material.edit'],
  'customers.view': ['master.customer.view'],
  'customers.edit': ['master.customer.edit'],
  'factories.view': ['master.jobworker.view'],
  'factories.edit': ['master.jobworker.edit'],
  'inward.view': ['inward.view'],
  'inward.create': ['inward.edit'],
  'inward.confirm': ['inward.confirm'],
  'stock.view': ['stock.view'],
  'stock.edit': ['stock.adjust.propose'],
  'stock.rate.view': ['stock.value.view'],
  'adjustments.create': ['stock.adjust.propose'],
  'adjustments.approve': ['stock.adjust.approve'],
  'designs.view': ['design.view'],
  'designs.edit': ['design.edit'],
  'designs.rate.view': ['design.rate.view'],
  'requirements.view': ['production.view'],
  'requirements.edit': ['production.edit'],
  'jobslips.view': ['jobslip.view'],
  'jobslips.edit': ['jobslip.edit'],
  'jobslips.confirm': ['jobslip.close'],
  'jobslips.cancel': ['jobslip.cancel'],
  'issuance.view': ['issue.view'],
  'issuance.edit': ['issue.edit'],
  'issuance.confirm': ['issue.confirm'],
  'processing.view': ['production.view', 'jobslip.view'],
  'processing.edit': ['production.edit', 'jobslip.edit'],
  'receiving.view': ['receipt.view'],
  'receiving.edit': ['receipt.edit'],
  'receiving.confirm': ['receipt.confirm'],
  'receiving.rate.view': ['receipt.charges.edit', 'costing.view'],
  'reconciliation.view': ['shortage.view'],
  'reconciliation.approve': ['shortage.approve'],
  'costing.view': ['costing.view'],
  'readystock.view': ['readystock.view'],
  'packing.view': ['packing.update'],
  'packing.edit': ['packing.update'],
  'salesorders.view': ['sales.order.view'],
  'salesorders.edit': ['sales.order.edit'],
  'salesorders.confirm': ['sales.order.confirm'],
  'salesorders.cancel': ['sales.order.cancel'],
  // Rates on orders/invoices are shown to the people who price documents (edit rights);
  // e.g. Packing can view orders but never sees their prices.
  'salesorders.rate.view': ['sales.order.edit'],
  'invoices.view': ['sales.invoice.view'],
  'invoices.edit': ['sales.invoice.edit'],
  'invoices.confirm': ['sales.invoice.confirm'],
  'invoices.cancel': ['sales.invoice.cancel'],
  'invoices.rate.view': ['sales.invoice.edit', 'sales.invoice.confirm'],
  'payments.view': ['payment.view'],
  'payments.create': ['payment.record'],
  'auditlog.view': ['audit.view'],
  'reports.view': ['report.*'],
  'users.manage': ['identity.user.manage'],
  'settings.manage': ['settings.manage', 'tax.manage', 'numbering.manage', 'identity.role.manage'],
  'traceability.view': ['jobslip.view', 'sales.invoice.view', 'stock.view', 'purchase.view', 'inward.view'],
  'factoryportal.acknowledge': ['portal.job.acknowledge'],
  'factoryportal.updateStatus': ['portal.job.status'],
};

/** True when the backend permission list grants this frontend key. '*' grants everything. */
export function backendGrants(backendPermissions: readonly string[], key: PermissionKey): boolean {
  if (backendPermissions.includes('*')) return true;
  const codes = BACKEND_PERMISSION_MAP[key] ?? [];
  return codes.some(code =>
    code.endsWith('*')
      ? backendPermissions.some(p => p.startsWith(code.slice(0, -1)))
      : backendPermissions.includes(code)
  );
}

/** Whether the backend list holds one raw backend code (e.g. 'report.sales.view'). */
export function hasBackendCode(backendPermissions: readonly string[] | undefined, code: string): boolean {
  if (!backendPermissions) return false;
  return backendPermissions.includes('*') || backendPermissions.includes(code);
}

export function roleHasPermission(role: Role, key: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(key) ?? false;
}

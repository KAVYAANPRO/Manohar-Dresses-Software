/**
 * The full permission catalogue, verbatim from tech.md Appendix B. Keys follow
 * `module.resource.action`. This is the single source of truth: roles (roles.seed-data.ts),
 * the @RequirePermission decorator, and the permission-matrix test all reference these
 * strings, never a hand-typed literal elsewhere.
 */
export const PERMISSIONS = {
  // Identity and settings
  IDENTITY_USER_MANAGE: 'identity.user.manage',
  IDENTITY_ROLE_MANAGE: 'identity.role.manage',
  SETTINGS_MANAGE: 'settings.manage',
  TAX_MANAGE: 'tax.manage',
  NUMBERING_MANAGE: 'numbering.manage',

  // Master data
  MASTER_SUPPLIER_VIEW: 'master.supplier.view',
  MASTER_SUPPLIER_EDIT: 'master.supplier.edit',
  MASTER_MATERIAL_VIEW: 'master.material.view',
  MASTER_MATERIAL_EDIT: 'master.material.edit',
  MASTER_CUSTOMER_VIEW: 'master.customer.view',
  MASTER_CUSTOMER_EDIT: 'master.customer.edit',
  MASTER_JOBWORKER_VIEW: 'master.jobworker.view',
  MASTER_JOBWORKER_EDIT: 'master.jobworker.edit',
  MASTER_LOCATION_EDIT: 'master.location.edit',
  MASTER_IMPORT_RUN: 'master.import.run',

  // Purchasing
  PURCHASE_VIEW: 'purchase.view',
  PURCHASE_EDIT: 'purchase.edit',
  PURCHASE_CONFIRM: 'purchase.confirm',
  PURCHASE_CANCEL: 'purchase.cancel',
  PURCHASE_RATES_VIEW: 'purchase.rates.view',
  INWARD_VIEW: 'inward.view',
  INWARD_EDIT: 'inward.edit',
  INWARD_CONFIRM: 'inward.confirm',
  INWARD_CANCEL: 'inward.cancel',

  // Inventory
  STOCK_VIEW: 'stock.view',
  STOCK_LEDGER_VIEW: 'stock.ledger.view',
  STOCK_VALUE_VIEW: 'stock.value.view',
  STOCK_ADJUST_PROPOSE: 'stock.adjust.propose',
  STOCK_ADJUST_APPROVE: 'stock.adjust.approve',
  STOCK_LOT_PICK: 'stock.lot.pick',

  // Design
  DESIGN_VIEW: 'design.view',
  DESIGN_EDIT: 'design.edit',
  DESIGN_BOM_VIEW: 'design.bom.view',
  DESIGN_RATE_VIEW: 'design.rate.view',
  DESIGN_RATE_EDIT: 'design.rate.edit',

  // Job work
  PRODUCTION_VIEW: 'production.view',
  PRODUCTION_EDIT: 'production.edit',
  JOBSLIP_VIEW: 'jobslip.view',
  JOBSLIP_EDIT: 'jobslip.edit',
  JOBSLIP_CANCEL: 'jobslip.cancel',
  JOBSLIP_CLOSE: 'jobslip.close',
  ISSUE_VIEW: 'issue.view',
  ISSUE_EDIT: 'issue.edit',
  ISSUE_CONFIRM: 'issue.confirm',
  ISSUE_CANCEL: 'issue.cancel',
  RECEIPT_VIEW: 'receipt.view',
  RECEIPT_EDIT: 'receipt.edit',
  RECEIPT_CONFIRM: 'receipt.confirm',
  RECEIPT_CANCEL: 'receipt.cancel',
  RECEIPT_CHARGES_EDIT: 'receipt.charges.edit',
  SHORTAGE_VIEW: 'shortage.view',
  SHORTAGE_APPROVE: 'shortage.approve',
  WRITEOFF_APPROVE: 'writeoff.approve',
  // Karigar khata book: job-work payments/advances to factories and artisans (JOB-15)
  JOBWORK_PAYMENT_VIEW: 'jobwork.payment.view',
  JOBWORK_PAYMENT_RECORD: 'jobwork.payment.record',

  // Costing
  COSTING_VIEW: 'costing.view',

  // Ready stock
  READYSTOCK_VIEW: 'readystock.view',
  PACKING_UPDATE: 'packing.update',

  // Sales
  SALES_ORDER_VIEW: 'sales.order.view',
  SALES_ORDER_EDIT: 'sales.order.edit',
  SALES_ORDER_CONFIRM: 'sales.order.confirm',
  SALES_ORDER_CANCEL: 'sales.order.cancel',
  SALES_INVOICE_VIEW: 'sales.invoice.view',
  SALES_INVOICE_EDIT: 'sales.invoice.edit',
  SALES_INVOICE_CONFIRM: 'sales.invoice.confirm',
  SALES_INVOICE_CANCEL: 'sales.invoice.cancel',
  SALES_DISCOUNT_APPLY: 'sales.discount.apply',
  SALES_DISCOUNT_OVERCAP: 'sales.discount.overcap',
  SALES_NEGATIVE_STOCK_ALLOW: 'sales.negative_stock.allow',
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_RECORD: 'payment.record',

  // Reports and dashboards (families/names kept open-ended; common ones enumerated)
  REPORT_EXPORT: 'report.export',

  // Audit
  AUDIT_VIEW: 'audit.view',
  AUDIT_EXPORT: 'audit.export',

  // Portal (external, party-scoped)
  PORTAL_JOB_VIEW: 'portal.job.view',
  PORTAL_JOB_ACKNOWLEDGE: 'portal.job.acknowledge',
  PORTAL_JOB_STATUS: 'portal.job.status',
  PORTAL_JOB_DISPATCH: 'portal.job.dispatch',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const REPORT_FAMILIES = [
  'purchase',
  'inventory',
  'manufacturing',
  'shortage',
  'costing',
  'sales',
  'compliance',
] as const;

export const DASHBOARD_NAMES = [
  'admin',
  'purchase',
  'raw_material',
  'design',
  'factory_artisan',
  'packing',
  'sales',
] as const;

export function reportPermission(family: (typeof REPORT_FAMILIES)[number]): string {
  return `report.${family}.view`;
}

export function dashboardPermission(name: (typeof DASHBOARD_NAMES)[number]): string {
  return `dashboard.${name}.view`;
}

/** Flat list of every statically-known permission key, used to seed the `permissions` collection. */
export const ALL_STATIC_PERMISSION_KEYS: string[] = [
  ...Object.values(PERMISSIONS),
  ...REPORT_FAMILIES.map(reportPermission),
  ...DASHBOARD_NAMES.map(dashboardPermission),
];

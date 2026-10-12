import { PERMISSIONS, dashboardPermission, reportPermission } from './permissions.catalogue';

/**
 * The nine default roles (AUTH-04), encoded from the proposed matrix in prd.md §2.2 so the
 * mapping is reviewable data, not buried in code (tech.md §14.4: "changing the matrix means
 * changing the file"). Two things in the matrix cannot be expressed by a role alone and are
 * handled elsewhere, per prd.md §2.3:
 *   - "*" (rate/cost fields hidden) is enforced by response redaction (see common/redaction),
 *     not by withholding the underlying `.view` key.
 *   - Costing/margin visibility is "grantable per user" - no role below carries
 *     `costing.view` by default; it is added as a per-user permission override.
 * Invoice cancellation: prd.md §2.2's note says "The Sales role can *request* an invoice
 * cancellation" while approval rests with Super Admin - so SALES_INVOICE_CANCEL is
 * deliberately NOT in the Sales role here.
 */
export const DEFAULT_ROLES: Array<{ key: string; name: string; permissions: string[] }> = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super Admin / Owner',
    // Super Admin bypasses the permission check entirely (see PermissionsGuard) but we still
    // seed the full set so it shows correctly in the roles UI and in the permission-matrix test.
    permissions: ['*'],
  },
  {
    key: 'PURCHASE',
    name: 'Purchase Department',
    permissions: [
      PERMISSIONS.MASTER_SUPPLIER_VIEW,
      PERMISSIONS.MASTER_SUPPLIER_EDIT,
      PERMISSIONS.MASTER_MATERIAL_VIEW,
      PERMISSIONS.MASTER_MATERIAL_EDIT,
      PERMISSIONS.PURCHASE_VIEW,
      PERMISSIONS.PURCHASE_EDIT,
      PERMISSIONS.PURCHASE_CONFIRM,
      PERMISSIONS.PURCHASE_CANCEL,
      PERMISSIONS.PURCHASE_RATES_VIEW,
      PERMISSIONS.INWARD_VIEW,
      PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.DESIGN_VIEW,
      PERMISSIONS.PRODUCTION_VIEW,
      PERMISSIONS.JOBSLIP_VIEW,
      reportPermission('purchase'),
      dashboardPermission('purchase'),
    ],
  },
  {
    key: 'INVENTORY',
    name: 'Raw Material / Inventory Department',
    permissions: [
      PERMISSIONS.MASTER_SUPPLIER_VIEW,
      PERMISSIONS.MASTER_MATERIAL_VIEW,
      PERMISSIONS.MASTER_MATERIAL_EDIT,
      PERMISSIONS.MASTER_JOBWORKER_VIEW,
      PERMISSIONS.PURCHASE_VIEW,
      PERMISSIONS.INWARD_VIEW,
      PERMISSIONS.INWARD_EDIT,
      PERMISSIONS.INWARD_CONFIRM,
      PERMISSIONS.INWARD_CANCEL,
      PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.STOCK_LEDGER_VIEW,
      PERMISSIONS.STOCK_VALUE_VIEW,
      PERMISSIONS.STOCK_ADJUST_PROPOSE,
      PERMISSIONS.DESIGN_VIEW,
      PERMISSIONS.PRODUCTION_VIEW,
      PERMISSIONS.JOBSLIP_VIEW,
      PERMISSIONS.ISSUE_VIEW,
      PERMISSIONS.ISSUE_EDIT,
      PERMISSIONS.ISSUE_CONFIRM,
      PERMISSIONS.ISSUE_CANCEL,
      PERMISSIONS.RECEIPT_VIEW,
      PERMISSIONS.SHORTAGE_VIEW,
      PERMISSIONS.READYSTOCK_VIEW,
      reportPermission('inventory'),
      dashboardPermission('raw_material'),
    ],
  },
  {
    key: 'DESIGN',
    name: 'Design Department',
    permissions: [
      PERMISSIONS.MASTER_MATERIAL_VIEW,
      PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.DESIGN_VIEW,
      PERMISSIONS.DESIGN_EDIT,
      PERMISSIONS.DESIGN_BOM_VIEW,
      PERMISSIONS.DESIGN_RATE_VIEW,
      PERMISSIONS.DESIGN_RATE_EDIT,
      PERMISSIONS.PRODUCTION_VIEW,
      PERMISSIONS.JOBSLIP_VIEW,
      PERMISSIONS.READYSTOCK_VIEW,
      dashboardPermission('design'),
    ],
  },
  {
    key: 'PRODUCTION',
    name: 'Production Department',
    permissions: [
      PERMISSIONS.MASTER_MATERIAL_VIEW,
      PERMISSIONS.MASTER_JOBWORKER_VIEW,
      PERMISSIONS.MASTER_JOBWORKER_EDIT,
      PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.DESIGN_VIEW,
      PERMISSIONS.DESIGN_BOM_VIEW,
      PERMISSIONS.PRODUCTION_VIEW,
      PERMISSIONS.PRODUCTION_EDIT,
      PERMISSIONS.JOBSLIP_VIEW,
      PERMISSIONS.JOBSLIP_EDIT,
      PERMISSIONS.JOBSLIP_CANCEL,
      PERMISSIONS.JOBSLIP_CLOSE,
      PERMISSIONS.ISSUE_VIEW,
      PERMISSIONS.RECEIPT_VIEW,
      PERMISSIONS.RECEIPT_EDIT,
      PERMISSIONS.RECEIPT_CONFIRM,
      PERMISSIONS.RECEIPT_CANCEL,
      PERMISSIONS.RECEIPT_CHARGES_EDIT,
      PERMISSIONS.SHORTAGE_VIEW,
      PERMISSIONS.SHORTAGE_APPROVE,
      PERMISSIONS.WRITEOFF_APPROVE,
      PERMISSIONS.READYSTOCK_VIEW,
      PERMISSIONS.JOBWORK_PAYMENT_VIEW,
      PERMISSIONS.JOBWORK_PAYMENT_RECORD,
    ],
  },
  {
    key: 'PACKING',
    name: 'Packing Department',
    permissions: [
      PERMISSIONS.DESIGN_VIEW,
      PERMISSIONS.RECEIPT_VIEW,
      PERMISSIONS.READYSTOCK_VIEW,
      PERMISSIONS.PACKING_UPDATE,
      PERMISSIONS.SALES_ORDER_VIEW,
      dashboardPermission('packing'),
    ],
  },
  {
    key: 'SALES',
    name: 'Sales Department',
    permissions: [
      PERMISSIONS.MASTER_CUSTOMER_VIEW,
      PERMISSIONS.MASTER_CUSTOMER_EDIT,
      PERMISSIONS.DESIGN_VIEW,
      PERMISSIONS.DESIGN_RATE_VIEW,
      PERMISSIONS.READYSTOCK_VIEW,
      PERMISSIONS.SALES_ORDER_VIEW,
      PERMISSIONS.SALES_ORDER_EDIT,
      PERMISSIONS.SALES_ORDER_CONFIRM,
      PERMISSIONS.SALES_ORDER_CANCEL,
      PERMISSIONS.SALES_INVOICE_VIEW,
      PERMISSIONS.SALES_INVOICE_EDIT,
      PERMISSIONS.SALES_INVOICE_CONFIRM,
      // SALES_INVOICE_CANCEL intentionally omitted - Sales may only request, not execute.
      PERMISSIONS.SALES_DISCOUNT_APPLY,
      PERMISSIONS.PAYMENT_VIEW,
      PERMISSIONS.PAYMENT_RECORD,
      reportPermission('sales'),
      dashboardPermission('sales'),
    ],
  },
  {
    key: 'FACTORY',
    name: 'Factory User',
    permissions: [
      PERMISSIONS.PORTAL_JOB_VIEW,
      PERMISSIONS.PORTAL_JOB_ACKNOWLEDGE,
      PERMISSIONS.PORTAL_JOB_STATUS,
      PERMISSIONS.PORTAL_JOB_DISPATCH,
    ],
  },
  {
    key: 'ARTISAN',
    name: 'Artisan User',
    // "Same permission set as Factory User" (prd.md §2.1).
    permissions: [
      PERMISSIONS.PORTAL_JOB_VIEW,
      PERMISSIONS.PORTAL_JOB_ACKNOWLEDGE,
      PERMISSIONS.PORTAL_JOB_STATUS,
      PERMISSIONS.PORTAL_JOB_DISPATCH,
    ],
  },
];

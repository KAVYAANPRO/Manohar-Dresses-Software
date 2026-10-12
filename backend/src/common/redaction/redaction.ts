import { SetMetadata, StreamableFile } from '@nestjs/common';
import { PERMISSIONS } from '../../identity/permissions.catalogue';

/**
 * Field-level protection (prd.md §2.3, AUTH-07): "Rates, costs, and margins are not sent to
 * users who lack the permission. Hiding a column in the UI is cosmetic; the API must not
 * return the value."
 *
 * A rule names the money fields of a response and the permission(s) that unlock them. A route
 * (or a whole controller) declares its rules with @RedactFields(...); the global
 * RedactionInterceptor then strips those keys - at any depth, from plain objects, arrays and
 * Mongoose documents - for any caller who holds none of the rule's `anyOf` keys. Super Admin
 * holds every key, so admins always see everything. Code that writes a response itself
 * (CSV / HTML via @Res) calls redactFor(...) directly with the same rule.
 */
export interface RedactionRule {
  /** Holding ANY of these permission keys reveals the fields. */
  anyOf: string[];
  /** Object keys to drop (matched by exact name, at any nesting depth). */
  fields: string[];
}

export const REDACT_RULES_KEY = 'redact_rules';

/** Declares the money-field rules for a route or controller (class + handler rules are merged). */
export const RedactFields = (...rules: RedactionRule[]) => SetMetadata(REDACT_RULES_KEY, rules);

/** The rules used across the app - one place to review what is hidden from whom. */
export const REDACT = {
  /** Purchase rates, line amounts and landed cost (purchase orders, inwards, purchase returns, purchase reports). */
  PURCHASE_RATES: {
    anyOf: [PERMISSIONS.PURCHASE_RATES_VIEW],
    fields: [
      'rate',
      'amount',
      'otherCharges',
      'otherChargesShare',
      'landedUnitCost',
      'unitCost',
      'totalAmount',
      'subtotal',
      'lineTotal',
      'grandTotal',
      'taxAmount',
    ],
  },
  /** Lot unit cost and stock value (stock overview, lots, ledger, adjustments, issues). */
  STOCK_VALUE: {
    anyOf: [PERMISSIONS.STOCK_VALUE_VIEW, PERMISSIONS.COSTING_VIEW],
    fields: ['unitCost', 'value', 'totalValue', 'stockValue', 'valuation'],
  },
  /** Design selling rate and its history. */
  DESIGN_RATE: {
    anyOf: [PERMISSIONS.DESIGN_RATE_VIEW],
    fields: ['defaultSellingRate', 'sellingRate', 'salesPrice', 'rateHistory', 'currentRate'],
  },
  /**
   * Job-work money: the agreed rate on a job slip and the charges/amounts owed to the factory.
   * Visible to whoever sets the rate (jobslip.edit), records/approves the charges, pays the
   * khata, or holds costing.
   */
  JOBWORK_MONEY: {
    anyOf: [
      PERMISSIONS.JOBSLIP_EDIT,
      PERMISSIONS.RECEIPT_CHARGES_EDIT,
      PERMISSIONS.JOBWORK_PAYMENT_VIEW,
      PERMISSIONS.COSTING_VIEW,
    ],
    fields: [
      'agreedRate',
      'rate',
      'amount',
      'charges',
      'chargeAmount',
      'chargeOverride',
      'otherCharges',
      'estimatedCharge',
      'estimatedCharges',
      'totalCharges',
      'earned',
      'paid',
      'advances',
      'balance',
    ],
  },
  /**
   * Sales prices, discounts, taxes, totals and agent commission on orders, challans, exhibition
   * orders, invoices, returns and credit notes. Shown to the people who price documents (order
   * or invoice edit/confirm), matching the frontend's salesorders/invoices.rate.view - e.g.
   * Packing can read orders and challans but never receives their prices.
   */
  SALES_RATES: {
    anyOf: [
      PERMISSIONS.SALES_ORDER_EDIT,
      PERMISSIONS.SALES_INVOICE_EDIT,
      PERMISSIONS.SALES_INVOICE_CONFIRM,
    ],
    fields: [
      'unitRate',
      'rate',
      'amount',
      'amountCollected',
      'balance',
      'outstanding',
      'discountPct',
      'discountAmount',
      'discountTotal',
      'extraDiscountPct',
      'extraDiscountAmt',
      'defaultDiscountPct',
      'grossAmount',
      'lineTotal',
      'subtotal',
      'otherCharges',
      'shippingCharge',
      'taxableValue',
      'taxableTotal',
      'taxAmount',
      'taxTotal',
      'cgst',
      'sgst',
      'igst',
      'cgstTotal',
      'sgstTotal',
      'igstTotal',
      'roundOff',
      'grandTotal',
      'total',
      'totalAmount',
      'creditTotal',
      'creditedTotal',
      'commissionPct',
      'commissionAmount',
      'defaultSellingRate',
    ],
  },
} satisfies Record<string, RedactionRule>;

/** The subset of fields a caller with `permissions` must not see under `rules`. */
export function fieldsToRedact(
  rules: RedactionRule[] | undefined,
  permissions: Set<string> | undefined,
  isSuperAdmin = false,
): Set<string> {
  const out = new Set<string>();
  if (!rules?.length || isSuperAdmin) return out;
  for (const rule of rules) {
    if (rule.anyOf.some((p) => permissions?.has(p))) continue;
    for (const f of rule.fields) out.add(f);
  }
  return out;
}

function isPlainLike(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns a copy of `value` without the given keys at any depth. Never mutates the input.
 * Leaves dates, buffers, BSON values (ObjectId, Decimal128) and streams untouched; Mongoose
 * documents are converted with their own toJSON() first so schema transforms still apply.
 */
export function stripFields<T>(value: T, fields: Set<string>): T {
  if (fields.size === 0) return value;
  const seen = new WeakMap<object, unknown>();

  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Date || Buffer.isBuffer(v) || v instanceof StreamableFile) return v;
    if ((v as { _bsontype?: unknown })._bsontype) return v;
    if (seen.has(v)) return seen.get(v);

    if (Array.isArray(v)) {
      const arr: unknown[] = [];
      seen.set(v, arr);
      for (const item of v) arr.push(walk(item));
      return arr;
    }
    if (v instanceof Map) {
      const m = new Map();
      seen.set(v, m);
      for (const [k, item] of v)
        if (!(typeof k === 'string' && fields.has(k))) m.set(k, walk(item));
      return m;
    }

    let source: unknown = v;
    if (!isPlainLike(v) && typeof (v as { toJSON?: unknown }).toJSON === 'function') {
      source = (v as { toJSON: () => unknown }).toJSON();
      if (source === null || typeof source !== 'object') return source;
      if (source !== v) return walk(source);
    }

    const out: Record<string, unknown> = {};
    seen.set(v, out);
    for (const [k, item] of Object.entries(source as Record<string, unknown>)) {
      if (fields.has(k)) continue;
      out[k] = walk(item);
    }
    return out;
  };

  return walk(value) as T;
}

/** Convenience for code that builds its own response (CSV, HTML): strip per the caller's permissions. */
export function redactFor<T>(
  value: T,
  rules: RedactionRule[],
  user: { permissions?: Set<string>; isSuperAdmin?: boolean } | undefined | null,
): T {
  return stripFields(value, fieldsToRedact(rules, user?.permissions, user?.isSuperAdmin ?? false));
}

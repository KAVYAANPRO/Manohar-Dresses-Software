# Technical Design: Garment ERP (backend first)

| | |
|---|---|
| **Document** | Technical design and architecture |
| **Version** | 1.0 |
| **Date** | 24 Sep 2026 |
| **Status** | Draft for owner review |
| **Inputs** | `prd.md` v1.1 (requirement IDs such as `STK-03` refer to it) |
| **Companion** | `plan.md` (phase-wise delivery) |

---

## 0. Purpose and reading guide

This document says how to build what `prd.md` specifies. It is ordered **backend first**, as requested: sections 3 to 13 are the backend, section 14 is how it is tested, and section 15 is the frontend, which is built only after the Backend Gate in `plan.md`.

The parts that matter most are the ones that are hard to change later, so they come first and in the most detail: the stock ledger (§4, §5), costing (§6), job-work engine (§7), and the security model (§9). The technology choices in §2 are ordinary and replaceable; the domain design in §4 to §8 does not depend on them.

Decision IDs (`T-01` and so on) are stable, so `plan.md` and reviews can cite them.

---

## 1. Engineering principles

1. **The database is the last line of defence.** Integrity, ledger immutability, and factory isolation are enforced by PostgreSQL itself, not only by application code. The PDF asks for exactly this (Source §36: "authorization must also be enforced on the backend/database").
2. **One writer for stock.** Only the `inventory` module inserts into stock tables. Everything else asks it to post.
3. **A business command is one transaction.** A receipt, an issue, or an invoice confirmation either fully happens or does not happen. No half-states (BR-12).
4. **Append, do not edit.** The stock ledger, the audit log, and cost revaluations are append-only. Corrections are new rows.
5. **Decimals only.** Quantities, rates, and money are `NUMERIC` in the database and decimal types in code. No floating point anywhere near stock or money.
6. **Contract first.** An OpenAPI document is the boundary between backend and frontend. The frontend never depends on database shape.
7. **Boring technology.** PostgreSQL, one deployable, jobs on Postgres. No message broker, cache cluster, or microservices until a measurement demands one.
8. **Least privilege.** Separate database roles for migrations, the application, the factory portal, and reporting. Secrets from the environment.

---

## 2. Technology decisions

| ID | Area | Choice | Why | Alternative, and when to switch |
|---|---|---|---|---|
| T-01 | Architecture | **Modular monolith**: one codebase, one deployable API, one worker, strict module boundaries | Stock, documents, and costing must commit together. Splitting into services would turn the most important consistency guarantee into distributed transactions. A small team also cannot operate many services. | Services only if one module needs independent scaling, which is not foreseeable. |
| T-02 | Language | **TypeScript on current Node.js LTS** | One language for API, admin web, and factory PWA; schemas shared between them; large hiring pool and tooling. | **Python (Django + DRF, or FastAPI)** is equally good if the builder is Python-first. Django gives admin, auth, and migrations quickly. Sections 4 to 9 do not change. |
| T-03 | API framework | **NestJS** on the Fastify adapter | Modules, dependency injection, guards (permissions) and interceptors (audit context) map directly onto a modular monolith. | Plain Fastify or Hono plus a hand-made structure is lighter but leaves module discipline to habit. |
| T-04 | Database | **PostgreSQL 16+**, managed, India region, point-in-time recovery | Transactions, CHECK constraints, triggers, row-level security, partial indexes, exact `NUMERIC`. Everything the PDF's integrity and security rules need is native. | None worth considering for this workload. |
| T-05 | Data access and migrations | **SQL-first migrations** (versioned `.sql` files, applied by a migration runner such as dbmate) and a typed query builder (**Kysely**) | The schema relies on triggers, CHECKs, RLS, and composite foreign keys, which ORMs express poorly. Migrations are reviewed as plain SQL. | Prisma or Drizzle work if the hard parts are kept in hand-written SQL migrations. Do not let an ORM hide the transaction boundaries in §5. |
| T-06 | Validation and contracts | **Zod** schemas at every API boundary, generating **OpenAPI 3.1**; a typed client generated for the frontends | Single source of truth for request/response shapes; shared with forms. | Any schema library that emits OpenAPI. |
| T-07 | Authentication | **Server-side sessions** stored in Postgres (opaque random token, hashed at rest), `httpOnly` + `Secure` + `SameSite` cookie; **Argon2id** password hashing | AUTH-02 requires revocation and force-logout, which stateless JWTs make awkward. Sessions in Postgres add no new infrastructure. | JWT only for a future third-party API, with short lifetimes. |
| T-08 | Authorization | Permission keys, role bundles, per-user overrides; checked in the service layer; **row-level security** for party scoping; response serializers for field-level redaction | Meets AUTH-04, AUTH-06, AUTH-07. Three independent layers (§9). | None. |
| T-09 | Background jobs | **pg-boss** (queue in Postgres) | Nightly reconciliation, exports, PDFs, alerts. No Redis needed. | Redis + BullMQ if job volume ever justifies it. |
| T-10 | Files | **S3-compatible object storage**, private bucket, short-lived signed URLs; metadata in Postgres | Attachments, design images, generated documents. | Local disk only in development. |
| T-11 | Documents | R1: print-optimised HTML. R2: HTML templates rendered to PDF by headless Chromium in a worker job | Meets DOC-01 now and DOC-02 later with one template set. | A PDF library if Chromium is undesirable on the host. |
| T-12 | Frontend | **React + TypeScript + Vite**; TanStack Query and Table; React Hook Form + Zod; Tailwind with accessible primitives; **two apps** (admin, factory PWA) | Section 15. Two apps keep admin code away from external users (UX-02). | Next.js is unnecessary: everything is behind a login. |
| T-13 | Observability | Structured JSON logs (pino) with request ID, error tracking (Sentry or equivalent), health and metrics endpoints, uptime check | NFR-11. | Any equivalent. |
| T-14 | Delivery | GitHub Actions; Docker images; one container host plus managed Postgres plus object storage; `staging` and `production`; migrations as a separate release step | Small, reproducible, cheap. | Kubernetes is unjustified at this scale. |
| T-15 | Time | Store `timestamptz` (UTC) plus a `business_date` (Asia/Kolkata) on every dated business row | Avoids the midnight-boundary bugs that plague ERPs. Financial year is derived from `business_date`. | None. |
| T-16 | Identifiers | UUIDv7 for entities (time-ordered, index-friendly); `bigint` identity for the ledger and audit log (total order) | Public IDs need not be guessable; the ledger needs a strict order. | None. |

**On the "party" word.** In `prd.md`, a *party-scoped* user belongs to a factory or artisan. In the database that entity is `job_workers` (with `type` FACTORY or ARTISAN), and the scoping column is `job_worker_id`.

---

## 3. System architecture

### 3.1 Context

```
 Admin web (browser)          Factory portal (phone, PWA)          [R3: WhatsApp, accounting]
          \                              /
           \____ HTTPS ________________ /
                     |
        API process   (admin routes /api/v1 , portal routes /portal/v1)
                     |
   +-----------------+----------------------------------------+
   |  Modules: identity | master | purchasing | inventory      |
   |           design | jobwork | costing | sales              |
   |           reporting | audit | documents | notifications   |
   +-----------------+----------------------------------------+
                     |
     PostgreSQL  (roles: migrator, app_admin, app_portal, report_ro; pg-boss tables)
                     |
   Worker process (same codebase)      Object storage (files)
```

### 3.2 Modules and their rules

| Module | Owns | Notes |
|---|---|---|
| `identity` | users, sessions, roles, permissions, overrides | Issues the request context (user, principal, job worker). |
| `master` | suppliers, customers, job workers, materials, colours, units, sizes, categories, locations, processing types, tax rules, settings, number series, imports | Reference data. Soft-deactivate only (MST-12). |
| `purchasing` | purchases, inwards, purchase returns (R2) | Confirmed inward calls `inventory`. |
| `inventory` | items, lots, ledger, balances, adjustments, reconciliation | **The only writer of stock tables.** |
| `design` | designs, variants, BOM versions, rate history | Supplies requirement calculation. |
| `jobwork` | production orders, job slips, issues, returns, receipts, charges, reconciliation | Calls `inventory` to post and `costing` to value. |
| `costing` | cost sheets, lot cost components, lot revaluations | The only writer of cost tables and lot unit costs. |
| `sales` | orders, invoices, allocations, payments, tax computation | Confirm calls `inventory` to deduct. |
| `reporting` | views and read models, dashboards, exports | Read-only. |
| `audit` | audit log and its query API | Append-only. |
| `documents`, `notifications` | print templates, PDFs; alert rules and delivery (R2) | Driven by an outbox table. |

Enforced rules: modules interact only through exported service interfaces, never by touching each other's tables; only `inventory` writes stock tables and only `costing` writes cost tables; `reporting` reads through views. A lint rule (dependency-boundary check) fails the build on violations, so the structure survives the tenth developer, not just the first.

### 3.3 Processes

`api` serves admin and portal routes from one process in R1, with two separate database connection pools that use different database roles (§9.3). `worker` runs jobs. The portal can be split into its own process later by configuration alone.

### 3.4 Request lifecycle

1. Authenticate the session cookie; reject if expired or revoked.
2. Load the user's effective permissions and, for external users, their `job_worker_id`.
3. Open a database transaction and set the request context with `SET LOCAL`: `app.user_id`, `app.principal` (`internal` or `party`), `app.job_worker_id`, `app.request_id`. `SET LOCAL` is transaction-scoped, so it is safe with connection pooling. If the context is missing the row-level policies deny everything (fail closed).
4. Check the required permission (deny by default: a route with no declared permission does not compile into the router).
5. Run the service command: domain writes, ledger posting through `inventory`, all in this transaction.
6. Audit triggers write audit rows inside the same transaction.
7. Commit.
8. Serialise the response through an explicit allow-list mapper, removing fields the user may not see.
9. After commit, the worker handles outbox events (alerts, PDFs, exports).

### 3.5 Environments and configuration

Local (Docker Compose: Postgres and an S3-compatible store), CI, `staging`, `production`. Configuration comes only from environment variables, validated at start-up with a schema; the process refuses to start on a missing or malformed value. No secrets in source (AUTH-09).

---

## 4. Data architecture

### 4.1 Conventions

| Topic | Rule |
|---|---|
| Names | `snake_case`, plural table names, `_id` suffix for foreign keys. |
| Keys | UUIDv7 primary keys; `bigint identity` for `stock_ledger` and `audit_log`. |
| Money and quantity | `numeric(14,2)` money, `numeric(14,3)` quantity, `numeric(14,4)` unit cost and rate. Never `float`. Rounding: half-up; apportionment remainders go to the largest line so parts always sum to the whole. |
| Dates | `timestamptz` for events, `date` for `business_date`. |
| Documents | Common columns: `id`, `doc_no`, `doc_date`, `status`, `version`, `created_by/at`, `updated_by/at`, `confirmed_by/at`, `cancelled_by/at`, `cancel_reason`. |
| Status | `text` with a `CHECK` list for evolving sets; native enums only for closed sets that almost never change (movement type, location kind). |
| Optimistic concurrency | `version int` incremented on every update; updates carry `If-Match`. |
| Deactivation | `is_active boolean` on master data. No deletes of referenced rows. |
| Foreign keys | Always declared. Referential integrity is a requirement (Source §38). |
| Party scope | Every party-scoped table carries `job_worker_id`, including child tables (copied at insert and enforced by a composite foreign key), so a policy is a single indexed equality test. |

### 4.2 Table catalogue by module

The full mapping from the PDF's 34 entities to these tables is in Appendix A.

| Module | Tables |
|---|---|
| identity | `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permission_overrides` |
| master | `suppliers`, `customers`, `job_workers`, `material_categories`, `materials`, `colours`, `material_variants`, `uoms`, `uom_conversions`, `sizes`, `product_categories`, `processing_types`, `tax_rules`, `company_settings`, `number_series`, `attachments`, `import_batches` |
| purchasing | `purchases`, `purchase_items`, `inwards`, `inward_lines`, `purchase_returns` and lines (R2) |
| inventory | `stock_locations`, `stock_items`, `stock_lots`, `stock_ledger`, `stock_balances`, `stock_adjustments`, `recon_runs` |
| design | `designs`, `design_variants`, `design_bom_versions`, `design_bom_lines`, `design_rate_history` |
| jobwork | `production_orders`, `production_order_lines`, `production_order_requirements`, `job_slips`, `job_slip_lines`, `material_issues`, `material_issue_lines`, `material_returns`, `material_return_lines`, `job_material_lines`, `job_receipts`, `job_receipt_lines`, `job_charges` |
| costing | `job_cost_sheets`, `job_cost_lines`, `stock_lot_cost_components`, `lot_revaluations` |
| sales | `sales_orders`, `sales_order_lines`, `invoices`, `invoice_lines`, `invoice_line_allocations`, `payments`, `payment_allocations`, `customer_prices` (R2), `sales_returns` and lines (R2) |
| platform | `audit_log`, `idempotency_keys`, `outbox_events`, `notifications`, `notification_rules` (R2) |

### 4.3 The stock core (DDL)

This is the heart of the system. The SQL is a design sketch: names and column lists are final in intent, exact syntax is settled during Phase 2.

```sql
-- Locations: every quantity of stock sits in exactly one location.
CREATE TYPE location_kind AS ENUM (
  'WAREHOUSE', 'FACTORY_CUSTODY', 'QUARANTINE',
  'VIRTUAL_SUPPLIER', 'VIRTUAL_CUSTOMER', 'VIRTUAL_PRODUCTION',
  'VIRTUAL_LOSS', 'VIRTUAL_ADJUSTMENT'
);

CREATE TABLE stock_locations (
  id            uuid PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  kind          location_kind NOT NULL,
  job_worker_id uuid REFERENCES job_workers(id),
  is_active     boolean NOT NULL DEFAULT true,
  CHECK ((kind = 'FACTORY_CUSTODY') = (job_worker_id IS NOT NULL))
);

-- One supertype for everything that can be stocked (raw, processed, trim, finished).
CREATE TYPE stock_item_kind AS ENUM ('RAW_MATERIAL','PROCESSED_MATERIAL','TRIM','FINISHED_GOOD');

CREATE TABLE stock_items (
  id                  uuid PRIMARY KEY,
  kind                stock_item_kind NOT NULL,
  material_variant_id uuid UNIQUE REFERENCES material_variants(id),
  design_variant_id   uuid UNIQUE REFERENCES design_variants(id),
  base_uom_id         uuid NOT NULL REFERENCES uoms(id),
  min_stock_qty       numeric(14,3),
  CHECK ((kind = 'FINISHED_GOOD') = (design_variant_id IS NOT NULL)),
  CHECK ((kind <> 'FINISHED_GOOD') = (material_variant_id IS NOT NULL))
);

-- A lot is a traceable batch of one item with one unit cost.
CREATE TABLE stock_lots (
  id                 uuid PRIMARY KEY,
  stock_item_id      uuid NOT NULL REFERENCES stock_items(id),
  lot_no             text NOT NULL,
  received_on        date NOT NULL,
  unit_cost          numeric(14,4) NOT NULL CHECK (unit_cost >= 0),   -- current cost; history in lot_revaluations
  origin_doc_type    text NOT NULL,      -- OPENING | INWARD | PROCESS_OUTPUT | PRODUCTION_RECEIPT
  origin_doc_id      uuid,
  supplier_id        uuid REFERENCES suppliers(id),
  origin_job_slip_id uuid REFERENCES job_slips(id),
  UNIQUE (stock_item_id, lot_no)
);

CREATE TYPE movement_type AS ENUM (
  'OPENING','INWARD','ISSUE','RETURN_FROM_FACTORY','CONSUMPTION','PROCESS_OUTPUT',
  'PRODUCTION_RECEIPT','REJECTION','SHORTAGE_WRITE_OFF','ADJUSTMENT_IN','ADJUSTMENT_OUT',
  'SALE','SALES_RETURN','PURCHASE_RETURN','TRANSFER','REVERSAL'
);

-- The ledger: append-only. One row moves a quantity of one lot from one location to another.
CREATE TABLE stock_ledger (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  posted_at        timestamptz NOT NULL DEFAULT now(),
  business_date    date NOT NULL,
  movement_type    movement_type NOT NULL,
  stock_item_id    uuid NOT NULL REFERENCES stock_items(id),
  lot_id           uuid NOT NULL REFERENCES stock_lots(id),
  from_location_id uuid NOT NULL REFERENCES stock_locations(id),
  to_location_id   uuid NOT NULL REFERENCES stock_locations(id),
  qty              numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_cost        numeric(14,4) NOT NULL,         -- snapshot at the time of movement
  doc_type         text NOT NULL,
  doc_id           uuid NOT NULL,
  doc_line_id      uuid,
  posted_by        uuid NOT NULL REFERENCES users(id),
  reverses_id      bigint REFERENCES stock_ledger(id),
  reason           text,
  CHECK (from_location_id <> to_location_id)
);
CREATE UNIQUE INDEX stock_ledger_one_reversal ON stock_ledger (reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX stock_ledger_item_date ON stock_ledger (stock_item_id, business_date);
CREATE INDEX stock_ledger_doc       ON stock_ledger (doc_type, doc_id);

-- Balances: derived, maintained by the trigger below, never written by application code.
CREATE TABLE stock_balances (
  lot_id        uuid NOT NULL REFERENCES stock_lots(id),
  location_id   uuid NOT NULL REFERENCES stock_locations(id),
  stock_item_id uuid NOT NULL REFERENCES stock_items(id),
  qty           numeric(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (lot_id, location_id)
);
CREATE INDEX stock_balances_item_loc ON stock_balances (stock_item_id, location_id);

-- Apply each ledger row to balances and refuse to overdraw a physical location.
CREATE FUNCTION stock_apply_ledger_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  src_kind location_kind;
  new_src  numeric(14,3);
BEGIN
  SELECT kind INTO src_kind FROM stock_locations WHERE id = NEW.from_location_id;

  INSERT INTO stock_balances AS b (lot_id, location_id, stock_item_id, qty)
  VALUES (NEW.lot_id, NEW.from_location_id, NEW.stock_item_id, -NEW.qty)
  ON CONFLICT (lot_id, location_id) DO UPDATE SET qty = b.qty - NEW.qty
  RETURNING b.qty INTO new_src;

  IF src_kind NOT IN ('VIRTUAL_SUPPLIER','VIRTUAL_CUSTOMER','VIRTUAL_PRODUCTION',
                      'VIRTUAL_LOSS','VIRTUAL_ADJUSTMENT') AND new_src < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK lot=% location=% would_be=%',
                    NEW.lot_id, NEW.from_location_id, new_src
      USING ERRCODE = 'ST001';
  END IF;

  INSERT INTO stock_balances AS b (lot_id, location_id, stock_item_id, qty)
  VALUES (NEW.lot_id, NEW.to_location_id, NEW.stock_item_id, NEW.qty)
  ON CONFLICT (lot_id, location_id) DO UPDATE SET qty = b.qty + NEW.qty;

  RETURN NEW;
END $$;

CREATE TRIGGER stock_ledger_apply AFTER INSERT ON stock_ledger
  FOR EACH ROW EXECUTE FUNCTION stock_apply_ledger_row();

-- Immutability (STK-03): no UPDATE, DELETE, or TRUNCATE, even for the application role.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END $$;

CREATE TRIGGER stock_ledger_no_mutation BEFORE UPDATE OR DELETE ON stock_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER stock_ledger_no_truncate BEFORE TRUNCATE ON stock_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
REVOKE UPDATE, DELETE, TRUNCATE ON stock_ledger FROM app_admin, app_portal, report_ro;
```

Because the balance update lives in a trigger, no code path, present or future, can change a ledger row without the balance following, and none can overdraw a warehouse. Application code cannot even bypass it by mistake.

### 4.4 Numbering, idempotency, and audit (DDL)

```sql
-- Gapless numbering per document type and financial year. Allocated inside the posting
-- transaction, so a rollback returns the number. Invoice: prefix INV, fy '26-27' -> INV/26-27/00001.
CREATE TABLE number_series (
  doc_type text NOT NULL,
  fy       text NOT NULL,          -- '26-27'
  prefix   text NOT NULL,
  pad      int  NOT NULL DEFAULT 5,
  next_no  int  NOT NULL DEFAULT 1,
  PRIMARY KEY (doc_type, fy)
);

CREATE FUNCTION next_doc_number(p_doc_type text, p_fy text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE s number_series%ROWTYPE;
BEGIN
  UPDATE number_series SET next_no = next_no + 1
   WHERE doc_type = p_doc_type AND fy = p_fy
   RETURNING * INTO s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NUMBER_SERIES_MISSING % %', p_doc_type, p_fy USING ERRCODE = 'NS001';
  END IF;
  RETURN s.prefix || '/' || s.fy || '/' || lpad((s.next_no - 1)::text, s.pad, '0');
END $$;
-- invoices: CHECK (char_length(invoice_no) <= 16), UNIQUE (invoice_no)

-- Exactly-once command execution for retried requests (mobile networks, double taps).
CREATE TABLE idempotency_keys (
  user_id         uuid NOT NULL,
  key             text NOT NULL,
  endpoint        text NOT NULL,
  request_hash    text NOT NULL,
  response_status int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Audit log: append-only, written by triggers so no code path can forget (AUD-01).
CREATE TABLE audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  request_id    text,
  module        text NOT NULL,
  action        text NOT NULL,        -- INSERT | UPDATE | DELETE, or a named business action
  entity_type   text NOT NULL,
  entity_id     text NOT NULL,
  before        jsonb,
  after         jsonb
);
CREATE INDEX audit_entity ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_actor  ON audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX audit_time   ON audit_log (occurred_at DESC);

CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE rec jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
  INSERT INTO audit_log (actor_user_id, request_id, module, action, entity_type, entity_id, before, after)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::uuid,
          NULLIF(current_setting('app.request_id', true), ''),
          TG_ARGV[0], TG_OP, TG_TABLE_NAME, rec->>'id',
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN NULL;
END $$;
-- Attached to every business table, e.g.:
--   CREATE TRIGGER audit_purchases AFTER INSERT OR UPDATE OR DELETE ON purchases
--     FOR EACH ROW EXECUTE FUNCTION audit_row('purchasing');
-- The users table uses a variant that strips password_hash. stock_ledger is not audited
-- separately: it is itself the immutable record. audit_log gets the same
-- forbid_mutation triggers and REVOKEs as stock_ledger.
```

The invoice number is allocated **last** in the confirm transaction. The `UPDATE` takes a row lock on the series, and holding it for as short a time as possible keeps concurrent invoice confirmation fast while still guaranteeing no gaps.

---
## 5. Stock engine (`inventory` module)

Covers STK-01 to STK-11, INW-03, BR-01, BR-02, BR-06, BR-07, BR-09.

### 5.1 Movement catalogue

Every stock change in the whole system is one of these. The same table is in `prd.md` §5.2; here the last column says which document triggers it.

| `movement_type` | From → To | Triggered by |
|---|---|---|
| `OPENING` | Adjustment → Warehouse | Opening-stock import |
| `INWARD` | Supplier → Warehouse | Inward confirmed |
| `ISSUE` | Warehouse → Factory custody | Material issue confirmed |
| `RETURN_FROM_FACTORY` | Factory custody → Warehouse | Material return confirmed |
| `CONSUMPTION` | Factory custody → Production | Receipt confirmed (BOM × pieces) or processing input |
| `PROCESS_OUTPUT` | Production → Warehouse | Processing receipt confirmed |
| `PRODUCTION_RECEIPT` | Production → Warehouse | Garment receipt confirmed (accepted) |
| `REJECTION` | Production → Quarantine | Garment receipt confirmed (rejected or damaged) |
| `SHORTAGE_WRITE_OFF` | Factory custody → Loss | Job close with approved write-off |
| `ADJUSTMENT_IN` / `_OUT` | Adjustment ↔ any location | Stock adjustment approved |
| `SALE` | Warehouse → Customer | Invoice confirmed |
| `SALES_RETURN` | Customer → Warehouse or Quarantine | Sales return confirmed (R2) |
| `PURCHASE_RETURN` | Warehouse → Supplier | Purchase return confirmed (R2) |
| `TRANSFER` | Warehouse → Warehouse | Transfer confirmed (R2) |
| `REVERSAL` | Inverse of a prior row | Any cancellation |

Note that a purchase confirmation appears nowhere in this table. That is BR-01.

### 5.2 Posting interface

Other modules never insert ledger rows. They call:

```ts
interface Movement {
  type: MovementType;
  stockItemId: Uuid;
  lotId?: Uuid;              // omit to let the engine choose lots FIFO
  from: LocationRef;
  to: LocationRef;
  qty: Decimal;              // > 0
  unitCost?: Decimal;        // required only when creating a lot (inward, opening, receipt)
  doc: { type: string; id: Uuid; lineId?: Uuid };
  reason?: string;
}

StockService.post(tx, ctx, movements: Movement[]): PostedRow[]
StockService.allocateFifo(tx, stockItemId, locationId, qty): LotAllocation[]
StockService.reverseDocument(tx, ctx, docRef, reason): PostedRow[]
StockService.availability(tx, stockItemIds): Availability[]     // on hand, custody, quarantine, reserved, ATP
```

`post` does, in order: validate quantities and decimals; sort movements by `(stockItemId, lotId, from, to)` so lock order is deterministic; expand lot-less movements by FIFO allocation (one movement can become several ledger rows); insert the rows (the trigger applies balances and refuses overdrafts); translate the `ST001` error into an `INSUFFICIENT_STOCK` problem response naming the item, the location, and the shortfall. It must be called inside the caller's transaction and never opens its own.

### 5.3 FIFO allocation

```sql
SELECT b.lot_id, b.qty, l.unit_cost
FROM   stock_balances b
JOIN   stock_lots l ON l.id = b.lot_id
WHERE  b.stock_item_id = $1 AND b.location_id = $2 AND b.qty > 0
ORDER  BY l.received_on, l.id
FOR UPDATE OF b;
```

The engine takes lots in that order until the requested quantity is met, or fails with the shortfall. A user with `stock.lot.pick` can name lots explicitly instead (STK-07). Locking the balance rows here is what makes two people issuing the same fabric at the same moment safe.

### 5.4 Concurrency

- Lock order is always item id ascending, then FIFO lot order, so two transactions cannot lock in opposite orders.
- If PostgreSQL still reports a deadlock (`40P01`) or serialization failure (`40001`), the command is retried, up to three times with jitter, then reported as a retryable error.
- Sales order confirmation and invoice confirmation first take `SELECT … FROM stock_items WHERE id = ANY($ids) ORDER BY id FOR UPDATE`. That serialises everything touching the same finished item and closes the race in which two orders both pass the availability check for the same 20 pieces (A-18).
- Every posting endpoint honours `Idempotency-Key` (§10.3).

### 5.5 Negative stock

R1: physical locations cannot go negative; the trigger enforces it and the API returns `INSUFFICIENT_STOCK`. R2 (`SAL-11`): an admin-authorised backorder sale posts a `SALE` against a designated deficit lot at the last known cost and raises a reconciliation task that is cleared when the next production receipt arrives. This is deliberately deferred; it adds real ledger complexity for a case the PDF says should normally be prevented.

### 5.6 Reversals

`reverseDocument` posts, for each ledger row of a document, the inverse row with `reverses_id` set. The unique index on `reverses_id` prevents reversing twice. If downstream stock has already moved (an inward whose cloth was already issued), the inverse simply fails the balance check. That is the right behaviour, and it surfaces as `INVALID_STATE_TRANSITION` with the blocking documents listed, which is how PUR-06 ("cancel blocked while any inward exists") and its siblings fall out of the design rather than needing separate code.

### 5.7 Job custody sub-ledger

A factory usually holds material for several jobs at once, and the ledger's custody balance is per factory, not per job. Costing and reconciliation need per-job figures, so each job has its own small ledger of what it holds:

```sql
CREATE TABLE job_material_lines (
  id              uuid PRIMARY KEY,
  job_slip_id     uuid NOT NULL,
  job_worker_id   uuid NOT NULL,
  stock_item_id   uuid NOT NULL REFERENCES stock_items(id),
  lot_id          uuid NOT NULL REFERENCES stock_lots(id),
  bom_role        text,                                   -- Top / Bottom / Dupatta / Trim ...
  unit_cost       numeric(14,4) NOT NULL,                 -- lot cost at issue
  qty_issued      numeric(14,3) NOT NULL DEFAULT 0,
  qty_returned    numeric(14,3) NOT NULL DEFAULT 0,
  qty_consumed    numeric(14,3) NOT NULL DEFAULT 0,
  qty_written_off numeric(14,3) NOT NULL DEFAULT 0,
  FOREIGN KEY (job_slip_id, job_worker_id) REFERENCES job_slips (id, job_worker_id),
  UNIQUE (job_slip_id, lot_id),
  CHECK (qty_issued - qty_returned - qty_consumed - qty_written_off >= 0)
);
```

Consumption for a job is drawn only from that job's lines. Invariant I-5 (§14): for every factory, the sum over its jobs of `issued − returned − consumed − written_off` equals its custody balance in the ledger.

### 5.8 Reconciliation (STK-10)

A nightly worker job recomputes balances from the ledger and compares them with `stock_balances`, checks I-1 to I-5, writes a `recon_runs` row, and raises an alert on any difference. It never "fixes" anything. A mismatch is an incident, not a chore.

### 5.9 Availability and reservations

Reserved quantity is derived, not stored, so it cannot drift:

```sql
SELECT si.id,
       COALESCE(SUM(b.qty) FILTER (WHERE l.kind = 'WAREHOUSE'), 0)              AS on_hand,
       COALESCE(SUM(b.qty) FILTER (WHERE l.kind = 'FACTORY_CUSTODY'), 0)        AS with_factory,
       COALESCE(SUM(b.qty) FILTER (WHERE l.kind = 'QUARANTINE'), 0)             AS quarantined,
       COALESCE(r.reserved, 0)                                                  AS reserved,
       COALESCE(SUM(b.qty) FILTER (WHERE l.kind = 'WAREHOUSE'), 0) - COALESCE(r.reserved, 0) AS atp
FROM   stock_items si
LEFT   JOIN stock_balances b ON b.stock_item_id = si.id
LEFT   JOIN stock_locations l ON l.id = b.location_id
LEFT   JOIN LATERAL (
         SELECT SUM(sol.qty - sol.qty_invoiced) AS reserved
         FROM   sales_order_lines sol JOIN sales_orders so ON so.id = sol.sales_order_id
         WHERE  sol.design_variant_id = si.design_variant_id
         AND    so.status IN ('CONFIRMED','PARTIALLY_INVOICED')) r ON true
WHERE  si.id = ANY($1)
GROUP  BY si.id, r.reserved;
```

---

## 6. Costing engine (`costing` module)

Covers CST-01 to CST-08. Formulas are in `prd.md` §5.5; this section is how they are computed.

### 6.1 Data

- `stock_lots.unit_cost` is the lot's current cost. `stock_lot_cost_components(lot_id, component, amount_per_unit)` splits it into MATERIAL, PROCESSING, MANUFACTURING, OTHER, and the components always sum to `unit_cost`. This is what lets the garment's breakdown show a dyeing line even though dyeing happened on an earlier job.
- `lot_revaluations(lot_id, old_cost, new_cost, reason, job_slip_id, created_at, created_by)` is append-only. A revaluation never touches ledger rows: their `unit_cost` snapshots stay as posted.
- `job_charges(job_slip_id, receipt_id, kind, basis, quantity, rate, amount, note)` is the **only** place a charge lives (BR-13). The job slip stores the agreed basis and rate. Confirming a receipt writes the actual charge here (per piece × accepted quantity by default; per metre × received metres; lump sum entered once). Costing reads charges from this table and nowhere else.
- `job_cost_sheets` and `job_cost_lines` hold the computed sheet, versioned, with `status` PROVISIONAL or FINAL.

### 6.2 Landed cost (purchase to lot)

```
share_i   = round(other_charges × line_amount_i ÷ Σ line_amount, 2)     -- remainder goes to the largest line
lot_cost  = round((line_amount_i + share_i) ÷ base_qty_i, 4)
```

### 6.3 Job cost

```
computeJobCost(job):
  material      = Σ over job_material_lines of (qty_issued − qty_returned) × unit_cost
  processing    = Σ job_charges where kind = PROCESSING
  manufacturing = Σ job_charges where kind = MANUFACTURING
  other         = Σ job_charges where kind = OTHER
  accepted      = Σ accepted_qty (garment job) or Σ received_qty (processing job) over confirmed receipts
  total         = material + processing + manufacturing + other
  unit_cost     = accepted > 0 ? round(total ÷ accepted, 4) : null
  status        = job.status == CLOSED ? FINAL : PROVISIONAL
```

Material cost uses `(issued − returned)`, so consumed, shortage, and written-off material all stay inside the job's cost, as the PDF's formula implies.

### 6.4 When a receipt is confirmed

```
onReceiptConfirmed(job, receipt):
  materialToDate  = Σ (qty_issued − qty_returned) × unit_cost           -- all lots issued so far
  expectedPieces  = Σ job_slip_lines.expected_qty
  provisional     = round(materialToDate ÷ expectedPieces, 4)
                    + round(receipt.charges ÷ receipt.accepted, 4)
  create an output lot per variant at cost `provisional`, with components
  post CONSUMPTION and PRODUCTION_RECEIPT (or PROCESS_OUTPUT) through inventory
  write a PROVISIONAL cost sheet
```

### 6.5 When a job closes

```
onJobClosed(job):
  final = computeJobCost(job).unit_cost
  for each output lot of the job:
     delta = final − lot.unit_cost
     if delta ≠ 0: insert lot_revaluations; update lot.unit_cost and its components
     variance_on_sold += (qty_ever_received − qty_on_hand_now) × delta     -- not restated on posted invoices
  write FINAL cost sheet with variance_on_sold
```

Processing jobs use the same code: the output lot's cost is `total ÷ received`, and when that fabric is issued to a garment job its lot cost becomes that job's material cost. Dyeing cost flows into garment cost without a manual roll-up (CST-05).

### 6.6 Precision and visibility

Unit costs are 4 decimals, amounts 2. Any rounding remainder from `qty × unit_cost` is reported on the cost sheet rather than hidden. Every cost-bearing response goes through the redaction layer (§9.4) and requires `costing.view`.

### 6.7 Test vectors

The two paths in `prd.md` §10 are unit tests and end-to-end tests: Path A gives ₹93,100 total and ₹980.00 per piece; Path B gives ₹88,825 and ₹935.00. The provisional cost at receipt in that scenario is `85,500 ÷ 100 + 7,600 ÷ 95 = 855 + 80 = ₹935.00`, and closing under Path A revalues the two finished lots from 935 to 980 through `lot_revaluations`.

---

## 7. Job-work engine (`jobwork` module)

Covers JOB-01 to JOB-15, SHR-01 to SHR-04.

### 7.1 Core tables

```sql
CREATE TABLE job_slips (
  id                      uuid PRIMARY KEY,
  job_slip_no             text NOT NULL UNIQUE,
  job_type                text NOT NULL CHECK (job_type IN ('PROCESSING','MANUFACTURING')),
  job_worker_id           uuid NOT NULL REFERENCES job_workers(id),
  production_order_id     uuid REFERENCES production_orders(id),
  design_id               uuid REFERENCES designs(id),
  processing_type_id      uuid REFERENCES processing_types(id),
  slip_date               date NOT NULL,
  expected_completion_date date,
  charge_basis            text NOT NULL CHECK (charge_basis IN ('PER_PIECE','PER_METER','LUMP_SUM')),
  agreed_rate             numeric(14,4),
  instructions            text,
  status                  text NOT NULL CHECK (status IN
    ('CREATED','MATERIAL_ISSUED','IN_PROCESS','READY','PARTIALLY_RECEIVED','RECEIVED','CLOSED','CANCELLED')),
  version                 int  NOT NULL DEFAULT 1,
  UNIQUE (id, job_worker_id)                       -- target of composite FKs from child tables
);
```

`job_slip_lines` hold expected output per design variant (colour × size), or, for a processing job, the expected output material and quantity. `job_receipt_lines` hold, per output variant: `expected_qty`, `received_qty`, `accepted_qty`, `rejected_qty`, `damaged_qty`, with `CHECK (accepted_qty + rejected_qty + damaged_qty = received_qty)`.

### 7.2 State machine

The allowed transitions are one constant in code, mirrored by a database check, and tested by generating every (from, to) pair.

```
CREATED ──issue──▶ MATERIAL_ISSUED ──start──▶ IN_PROCESS ──ready──▶ READY
   │                    │   ▲                      │                  │
   └─cancel─▶ CANCELLED ◀┘   └──────────────────────┴──── receipt ─────┴──▶ PARTIALLY_RECEIVED ──▶ RECEIVED ──close──▶ CLOSED
```

Rules: `MATERIAL_ISSUED` is set automatically on the first confirmed issue. `PARTIALLY_RECEIVED` and `RECEIVED` are set automatically on receipt confirmation (cumulative received against expected), or `RECEIVED` by short-close with a reason. Cancelling from `MATERIAL_ISSUED` requires all issued material to have been returned (checked from `job_material_lines`). `CLOSED` requires the reconciliation gate (§7.5). Who may trigger each transition is a permission key (Appendix B); factories may only trigger `start`, `ready`, and acknowledge.

### 7.3 Commands

| Command | Transaction does |
|---|---|
| Create job slip | Insert slip and expected lines; allocate number; audit. |
| Confirm material issue | Lock items, FIFO-allocate lots from Warehouse, post `ISSUE` rows (Warehouse → that worker's custody location), insert or increment `job_material_lines`, set slip `MATERIAL_ISSUED` if first. |
| Acknowledge material (portal) | Record acknowledgement and discrepancy note on the issue; notify Inventory if a discrepancy is raised. No stock effect. |
| Set status (portal or internal) | Validate the transition; write; audit. No stock effect (BR-14). |
| Confirm material return | Post `RETURN_FROM_FACTORY` (custody → Warehouse) to the same lots; increment `qty_returned`. |
| Confirm receipt (garments) | Validate quantities; compute BOM consumption per input item (§7.4); post `CONSUMPTION` from that job's custody lines (oldest lot first), `PRODUCTION_RECEIPT` for accepted (Production → Warehouse, new lot per variant at provisional cost), `REJECTION` for rejected and damaged (→ Quarantine); write `job_charges`; recompute cost sheet; update slip status. |
| Confirm receipt (processing) | Post `CONSUMPTION` of the input quantity sent, `PROCESS_OUTPUT` of the quantity received into the warehouse as a new lot of the processed variant; shortage is derived as sent minus received; write charges. |
| Write off residual | Post `SHORTAGE_WRITE_OFF` (custody → Loss), increment `qty_written_off`; requires `writeoff.approve` when shortage % exceeds tolerance. |
| Close job | Run the reconciliation gate; finalise costing (§6.5); lock the job. |
| Cancel job | Only from allowed states; reverse any issue not yet returned; audit. |

### 7.4 Consumption and shortage (PRD §5.4 as SQL-level logic)

```
pieces_v      = accepted_v + rejected_v + damaged_v                      per variant v, summed over receipts
consumed_i    = Σ_v pieces_v × bom_qty_{i,v}                             using the BOM version snapshotted on the production order
shortage_i    = issued_i − returned_i − consumed_i
shortage_pct  = shortage_i ÷ issued_i × 100
remaining_i   = issued_i − returned_i − consumed_i − written_off_i       must be 0 at close
```

BOM lines come from the snapshot in `production_order_requirements`, so a later BOM edit cannot change the arithmetic of a job already in flight (DSN-04). Size-wise overrides (R2, DSN-07) extend `bom_qty_{i,v}` without changing the shape of this calculation.

### 7.5 Close gate

A job may close only when: no receipt is in draft; `remaining_i = 0` for every input item; any shortage above tolerance has an approved write-off; and every charge for the basis has been entered. Otherwise the API returns `RECONCILIATION_REQUIRED` with the per-item numbers, so the screen can show exactly what is unresolved.

### 7.6 What a factory user can touch

Through the portal role only: read its own jobs, material issued and returned, instructions and expected quantities (no rates, no costs); acknowledge material; move a job to `IN_PROCESS` and `READY`; declare a dispatch quantity. Company staff turn a declaration into a receipt. The portal never receives a rate, a cost, a purchase, another party's row, or another customer.

---

## 8. Sales and invoicing engine (`sales` module)

Covers SAL-01 to SAL-11, RGS-04, TRC-01.

### 8.1 Pricing and tax as a pure function

Tax and totals are computed by one pure function with no database access, so it can be exhaustively unit-tested, including against the examples the CA supplies.

```
computeInvoice(input) -> output

input:  lines[ {designVariantId, qty, unitRate, discountPct, extraDiscountAmt, hsn} ],
        customer{state, gstin}, company{state}, invoiceDate, taxRules[], roundingConfig
output: per line  { grossAmount, discountAmount, taxableValue, taxRate, cgst, sgst, igst, lineTotal }
        totals    { subtotal, discountTotal, taxableTotal, cgstTotal, sgstTotal, igstTotal, roundOff, grandTotal }
steps:  1. taxableValue = qty × unitRate − discounts, per line
        2. unitTaxable  = taxableValue ÷ qty                        (the per-piece value the slab is tested on;
                                                                      before or after discount is Q2)
        3. rule = tax_rules row matching hsn, unitTaxable in [min, max), and invoiceDate in [valid_from, valid_to)
        4. intra-state (customer state = company state): cgst = sgst = round(taxable × rate ÷ 2, 2); else igst
        5. roundOff = round(grandTotal) − grandTotal   (configurable)
```

Checked against `prd.md` §10 step 13: 20 × ₹1,400 = ₹28,000; less 5% = ₹26,600 taxable; unit taxable ₹1,330 falls in the 5% band; CGST ₹665 + SGST ₹665; total ₹27,930.

### 8.2 Confirm invoice (one transaction)

1. Lock the finished items involved (`FOR UPDATE`, ascending id).
2. Re-validate status, customer, and that every line has stock (ATP excluding this order's own reservation).
3. Compute the invoice with `computeInvoice`; snapshot customer name, address, GSTIN, and place of supply onto the invoice.
4. For each line, FIFO-allocate finished lots from Warehouse and post `SALE` rows (Warehouse → Customer). Write `invoice_line_allocations(invoice_line_id, lot_id, qty, unit_cost)`. Cost of goods sold and full traceability come from this table.
5. Update `sales_order_lines.qty_invoiced` and the order status.
6. Allocate the invoice number with `next_doc_number('INVOICE', fy)` **last**.
7. Set `CONFIRMED`; write audit rows (triggers); commit.

### 8.3 Cancel invoice

Requires `sales.invoice.cancel` and a reason. Blocked while payments remain allocated to it (they must be unallocated first). Posts `REVERSAL` rows for each allocation, sets `CANCELLED`, and reduces `qty_invoiced` on the order lines. The number stays consumed and is never reissued. From R2 a credit-note document accompanies a cancellation that falls outside the current tax period.

### 8.4 Payments (R1 minimal)

`payments(customer_id, date, amount, mode, reference)` and `payment_allocations(payment_id, invoice_id, amount)`. Invoice payment status is derived from allocations (Unpaid, Partial, Paid); it is never a hand-edited field. Advances, over-payments, and credit-note offsets arrive in R2.

### 8.5 Traceability query

`GET /trace/invoice-lines/{id}` walks: `invoice_line_allocations` → `stock_lots` (finished) → `origin_job_slip_id` → `job_material_lines` → `stock_lots` (raw) → `inward_lines` → `purchase_items` → `purchases` → `suppliers`. It is a set of joins over indexed foreign keys; no recursion is needed because the depth is fixed by the process. For a processed fabric the walk passes through the processing job once more.

---
## 9. Security architecture

Covers AUTH-01 to AUTH-09, AUD-01, AUD-02, NFR-04, BR-08.

### 9.1 Authentication

- Argon2id with parameters at or above current OWASP guidance; the parameters are configuration, and hashes carry their own parameters so they can be raised over time.
- Session token: 256 random bits, only its hash is stored (`sessions.token_hash`). Cookie flags `HttpOnly`, `Secure`, `SameSite=Lax`. Sliding idle timeout plus an absolute lifetime. Admin can revoke any session, and logout revokes the current one.
- State-changing requests require a CSRF defence (an anti-forgery token or a custom header together with an `Origin` check).
- Login throttling by username and by IP with exponential back-off and lockout, identical error text for wrong user and wrong password, no user enumeration on reset flows.
- Minimum password length 10 with a breached-password check. Admin two-factor (TOTP) in R2 (AUTH-08).
- Factory and artisan users log in with mobile number and password in R1; OTP login is a candidate for R2 once SMS sender registration is sorted.

### 9.2 Authorization

Permission keys are listed in Appendix B. Effective permissions for a request are `(role permissions ∪ user ALLOW overrides) − user DENY overrides`, computed once per request and cached for that request only. A global guard denies any route that has not declared a permission; public routes must opt out explicitly and are listed in one file for review.

### 9.3 Party isolation: three independent layers

The PDF's rule that Factory A must never see Factory B (Source §11, §36, Rule 8) is enforced three times, so a single mistake cannot leak data.

1. **API layer.** Every portal query filters by the caller's `job_worker_id`, and portal routes accept no `jobWorkerId` parameter at all. An ID belonging to another factory returns `NOT_FOUND`, not `FORBIDDEN`, so its existence is not disclosed.
2. **Row-level security in PostgreSQL.** Policies reference session settings, not role names, and fail closed when the context is unset:

```sql
CREATE FUNCTION app_principal() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.principal', true), '') $$;
CREATE FUNCTION app_job_worker_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.job_worker_id', true), '')::uuid $$;

ALTER TABLE job_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_slips FORCE  ROW LEVEL SECURITY;      -- applies to the table owner too
CREATE POLICY job_slips_scope ON job_slips
  USING      (app_principal() = 'internal'
              OR (app_principal() = 'party' AND job_worker_id = app_job_worker_id()))
  WITH CHECK (app_principal() = 'internal'
              OR (app_principal() = 'party' AND job_worker_id = app_job_worker_id()));
-- Repeated on: job_slip_lines, material_issues (+lines), material_returns (+lines),
-- job_receipts (+lines), job_material_lines, job_workers (own row), stock_locations
-- (own custody location), and the custody rows of stock_balances.
```

3. **Least-privilege database role.** The portal API connects as `app_portal`, which has no grants on business tables at all. It can `SELECT` only from a `portal` schema of views that expose safe columns (no rates, costs, purchases, customers) and can `EXECUTE` a handful of functions (`portal.acknowledge_material`, `portal.set_job_status`, `portal.declare_dispatch`) that verify ownership from `app_job_worker_id()`. Even a SQL-injection or a forgotten filter in the portal code cannot read a purchase rate, because the role cannot see the table.

Because RLS is the mechanism behind layer 2 and the view layer sits on top of it, the exact grant and view-ownership arrangement is proven by the RLS test suite (§14.4), not assumed. If that suite shows a gap the design is adjusted; the test is the source of truth. A simpler fallback, if timelines press, is layers 1 and 2 in Phase 1 and the `app_portal` role hardening in Phase 4.

### 9.4 Field-level protection (AUTH-07)

- Responses are built by explicit mapper functions per resource and per permission set. There is no "return the row".
- Rates, costs, and margins live in separate DTOs that are only constructed when the caller holds `costing.view`, `purchase.rates.view`, or `design.rate.view`.
- A **leak test** in CI logs in as each role, exercises every readable endpoint, and asserts that no response body contains a forbidden key (`cost`, `rate`, `price`, `margin`, `landed`, and so on) unless the role is allowed it.

### 9.5 Audit

Triggers (§4.4) capture every insert, update, and delete on business tables with before and after images, the actor from `app.user_id`, and the request ID. They cover the PDF's examples (purchase edited, stock adjusted, selling price changed, invoice cancelled, job slip updated, quantity changed) without any application code having to remember. `audit_log` has the same no-update, no-delete, no-truncate protections as the ledger; the application role cannot alter it, and there is no delete endpoint. Reading requires `audit.view`. Audit rows can hold personal data, so retention is set deliberately (Q14 in `prd.md`).

### 9.6 Data protection and secrets

TLS for every connection, including to the database. Encryption at rest through the managed database and object store. Backups encrypted. Secrets only from the environment or a secret manager, never logged, never in the repository (a secret scanner runs in CI). Application logs scrub passwords, tokens, and personal fields. Uploads are limited by type and size, stored under random keys outside any web root, served through short-lived signed URLs, and never executed or rendered inline from an untrusted origin.

### 9.7 Threat table

| Threat | Example | Mitigation | Verified by |
|---|---|---|---|
| Cross-party read | Factory A requests Factory B's job ID | API scoping, RLS, `NOT_FOUND`, no grants on base tables | RLS test matrix, leak test |
| Cost leakage | Packing user or factory sees rates or costs | Field-level DTOs, portal views | Leak test |
| Ledger tampering | A bug or a DBA edits or deletes a movement | Trigger and REVOKE, reversal-only corrections, nightly reconciliation | Immutability test, reconciliation job |
| Double posting | Retry on a bad mobile connection posts twice | `Idempotency-Key` stored in the same transaction as the effect | Concurrency test |
| Overselling | Two orders confirmed against the same stock | Item-row locks, ATP, balance trigger | Concurrency test |
| Credential attacks | Guessing factory passwords | Argon2id, throttling, lockout, breached-password check, admin 2FA (R2) | Security test |
| Privilege escalation | Editing a role or override without rights | `identity.role.manage` only for Super Admin; role edits audited | Permission tests |
| Malicious upload | Script disguised as an invoice image | Type and size limits, random keys, signed URLs, no inline execution | Security test |
| Injection | Crafted search text | Parameterised queries only (query builder), Zod validation, no string-built SQL | Static check, security test |
| Secret exposure | Key committed to the repository | Secret scanning in CI; environment-only configuration | CI |

### 9.8 Abuse limits

Rate limits per IP and per user (stricter on login and on export), request body size limits, `statement_timeout` on every database session (short for interactive, longer for the export role), and pagination caps.

---

## 10. API design

### 10.1 Surfaces

| Surface | Prefix | Callers | Database role |
|---|---|---|---|
| Admin API | `/api/v1` | Admin web app, future integrations | `app_admin` (and `report_ro` for reports) |
| Portal API | `/portal/v1` | Factory / artisan PWA | `app_portal` |

The two surfaces have separate route trees, separate authentication cookies, and separate OpenAPI documents, so the portal's published contract cannot expose an admin capability.

### 10.2 Conventions

| Topic | Rule |
|---|---|
| Format | JSON, `camelCase`. Decimals as strings (`"95.000"`), never JSON numbers. Dates ISO 8601. IDs are UUIDs. |
| Lists | `?limit=` (max 200) and `?cursor=` for large or ordered sets (ledger, audit); `?page=` and `?pageSize=` for ordinary lists. `?sort=-createdAt`. `?q=` free text. `?filter[status]=CONFIRMED` per field. Responses carry a total count where cheap. |
| Updates | Draft documents use `PATCH` with `If-Match: "<version>"`; a mismatch is `412` with code `CONFLICT_VERSION`. |
| Commands | State changes are `POST` sub-resources (`/purchases/{id}/confirm`), never a status field in a `PATCH`. |
| Idempotency | Every posting command accepts `Idempotency-Key`. The key, request hash, and stored response are written in the **same transaction** as the effect, so a retry returns the original result and a concurrent duplicate waits on the unique key and then reads it. Reusing a key with a different body is `422 IDEMPOTENCY_KEY_REUSED`. |
| Errors | RFC 9457 `application/problem+json` with a stable `code`, a human `detail`, and a `fieldErrors` map for validation. |
| Versioning | Major version in the URL. Additive changes are not breaking. Breaking-change detection runs in CI against the committed spec. |

Error codes (initial set): `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404 (also for out-of-scope rows), `VALIDATION_FAILED` 422, `CONFLICT_VERSION` 412, `DUPLICATE_NUMBER` 409, `INSUFFICIENT_STOCK` 409, `INVALID_STATE_TRANSITION` 409, `RECONCILIATION_REQUIRED` 409, `IDEMPOTENCY_KEY_REUSED` 422, `RATE_LIMITED` 429, `INTERNAL` 500.

### 10.3 Endpoint catalogue

`CRUD` means list, create, read, update, and deactivate (no hard delete). All list endpoints follow §10.2.

| Module | Endpoints |
|---|---|
| Auth and identity | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`; `CRUD /users`, `POST /users/{id}/reset-password`, `POST /users/{id}/revoke-sessions`, `PUT /users/{id}/roles`, `PUT /users/{id}/permission-overrides`; `CRUD /roles`, `PUT /roles/{id}/permissions`; `GET /permissions` |
| Master data | `CRUD /suppliers`, `/customers`, `/job-workers` (+ `/job-workers/{id}/users`), `/material-categories`, `/materials` (+ `/materials/{id}/variants`, `/materials/{id}/uom-conversions`), `/colours`, `/uoms`, `/sizes`, `/product-categories`, `/processing-types`, `/locations`, `/tax-rules`; `GET/PUT /settings/company`, `/settings/number-series`; `POST /imports/{entity}/dry-run`, `POST /imports/{entity}/commit` |
| Purchasing | `CRUD /purchases`; `POST /purchases/{id}/confirm`, `/cancel`; `POST /purchases/{id}/attachments`; `GET /purchases/pending-inward`; `CRUD /inwards`; `POST /inwards/{id}/confirm`, `/cancel` |
| Inventory | `GET /stock/balances`, `/stock/ledger`, `/stock/lots`, `/stock/valuation`, `/stock/availability`; `POST /stock/adjustments`; `POST /stock/adjustments/{id}/approve`, `/reject` |
| Design | `CRUD /designs`; `GET/POST /designs/{id}/variants`; `GET/POST /designs/{id}/bom` (a POST creates a new version); `GET /designs/{id}/requirements?qty=`; `GET /designs/{id}/rate-history`; `POST /designs/{id}/rate` |
| Job work | `CRUD /production-orders`; `CRUD /job-slips`; `POST /job-slips/{id}/start`, `/ready`, `/short-close`, `/close`, `/cancel`; `GET /job-slips/{id}/reconciliation`; `CRUD /material-issues`, `POST /material-issues/{id}/confirm`, `/cancel`; `CRUD /material-returns`, `POST /material-returns/{id}/confirm`; `CRUD /job-receipts`, `POST /job-receipts/{id}/confirm`, `/cancel`; `POST /job-slips/{id}/write-off` |
| Costing | `GET /job-slips/{id}/cost-sheet`; `GET /costing/designs/{id}`; `GET /costing/margins` |
| Ready stock and packing | `GET /ready-stock`; `POST /ready-stock/packing` |
| Sales | `CRUD /sales-orders`, `POST /sales-orders/{id}/confirm`, `/cancel`; `CRUD /invoices`, `POST /invoices/{id}/confirm`, `/cancel`, `GET /invoices/{id}/print`; `CRUD /payments`; `GET /customers/{id}/statement` |
| Trace, audit, reports | `GET /trace/invoice-lines/{id}`, `/trace/lots/{id}`, `/trace/designs/{id}`; `GET /audit-log`, `POST /audit-log/export`; `GET /reports/{name}`, `POST /reports/{name}/export`, `GET /exports/{id}`; `GET /dashboards/{name}`; `GET /alerts` (R2) |
| Portal (`/portal/v1`) | `POST /auth/login`, `POST /auth/logout`, `GET /me`; `GET /dashboard`; `GET /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/material`; `POST /jobs/{id}/acknowledge`, `/status`, `/dispatch-declaration` |

### 10.4 OpenAPI workflow

Zod schemas generate the OpenAPI document, which is **committed**. CI regenerates it and fails on any difference (so the spec cannot drift from the code) and runs a breaking-change check against the previous version. A typed TypeScript client is generated into `packages/contracts` for both frontends. Swagger UI is served on `staging`, and a Postman collection is generated for the business owner to try flows before any frontend exists.

### 10.5 Long-running work

Exports and heavy reports return `202` with a job ID. The client polls `GET /exports/{id}` and downloads from a signed URL when ready. Interactive endpoints never exceed the session `statement_timeout`.

---

## 11. Background jobs and integrations

| Job | Schedule | Purpose | Rel |
|---|---|---|---|
| `recon-ledger` | Nightly | Balances vs ledger; invariants I-1 to I-5; alert on drift | R1 |
| `refresh-read-models` | Every few minutes and on demand | Refresh materialised views behind dashboards | R1 |
| `export-report` | On request | Build CSV (R1) or Excel (R2) for a report or the audit log | R1 |
| `job-ageing` | Daily | Days since issue per factory and lot; flags approaching the one-year job-work limit | R1 |
| `session-cleanup`, `idempotency-purge` | Daily | Remove expired sessions and keys older than 48 hours | R1 |
| `backup-check` | Weekly | Verify last backup and restore-test timestamps | R1 |
| `evaluate-alerts` | Every 15 minutes | Turn PRD §6.3 rules into notifications | R2 |
| `render-pdf` | On request | HTML template to PDF | R2 |
| `send-notification` | On event | Email, later WhatsApp | R2/R3 |

Events that must not be lost (alerts, document generation) are written to an `outbox_events` table inside the originating transaction and dispatched by the worker, so a crash between commit and dispatch cannot drop them. External integrations (WhatsApp Business API, accounting export) sit behind adapters so they can be swapped without touching the domain.

---

## 12. Reporting and read models

- Reports and dashboards read from SQL views and materialised views under the `report_ro` role. Interactive queries have a short `statement_timeout`; anything slower becomes an export job (NFR-01).
- Dashboards are computed from small aggregate views and cached in-process for 30 to 60 seconds. They are not real-time to the second, and the doc says so, because "real-time" for stock is provided by `stock_balances`, which is transactionally exact.
- Reports are declared as data: name, permission, filter schema, and a view or query. The generic `/reports/{name}` endpoint validates filters, applies pagination, and streams CSV. Adding a report is a definition, not a new endpoint.
- Costing reports pass through the same redaction as any cost-bearing response.
- If report load ever hurts the primary, add a read replica; nothing else changes because reports already use their own role and connection.

---

## 13. Operations

### 13.1 CI/CD pipeline

Every pull request: format and lint, module-boundary check, type-check, unit tests, integration tests against a real Postgres container, migration test (up on an empty database and on a snapshot), OpenAPI drift and breaking-change check, RLS and leak tests, dependency and secret scanning. Merge to `main` deploys to `staging` automatically; production is a manual promotion of the same image.

### 13.2 Migrations and releases

Migrations are forward-only SQL files, reviewed like code. Changes follow **expand, then contract**: add the new column or table, deploy code that writes both, backfill, switch reads, and only later remove the old shape. Migrations run as a separate release step before the new version takes traffic and must be compatible with the previous version of the code. A bad release is fixed forward or by redeploying the previous image, not by hand-editing production.

### 13.3 Backup and recovery (NFR-03)

Managed automatic backups with point-in-time recovery, plus a daily encrypted logical dump copied to a separate account or region. Targets: recovery point ≤ 15 minutes, recovery time ≤ 4 hours. A restore into a scratch environment is rehearsed every quarter, with a check that ledger reconciliation passes on the restored copy. The runbook is written before go-live, not after the first incident.

### 13.4 Observability

Structured logs with request ID and user ID on every line, error tracking with release tagging, request-rate/latency/error metrics per route, database metrics (connections, slow queries, locks), job queue depth and failure counts. Alerts: any failed reconciliation, failed backup, 5xx rate, p95 latency breach, queue backlog, disk and connection limits.

### 13.5 Go-live tooling (A-14, A-30)

An import command-line tool and the `/imports` endpoints load masters and opening stock. They always support a dry run that reports every rejected row with its reason. After loading, a **stock take report** compares imported opening quantities with the counted quantities, and the reconciliation job runs immediately. A parallel-run period (manual registers and the system side by side) precedes retiring the registers (success criterion S5).

### 13.6 Runbooks (written during Phase 7)

Reconciliation drift, failed migration, failed backup, restoring to a point in time, rotating credentials, revoking a compromised user, and re-running a failed job.

---
## 14. Testing strategy

The costliest bugs in this system are silent ones: a stock figure that is wrong by five metres, a cost off by a rupee, a factory seeing a rate. The strategy is built around making those loud.

### 14.1 Layers

| Layer | Scope | Tools (suggested) |
|---|---|---|
| Unit | Pure engines: tax and totals (§8.1), costing (§6), shortage and consumption (§7.4), state machine, apportionment | Vitest; property tests with fast-check |
| Integration | Services against a real PostgreSQL in a container, with the real triggers, constraints, and RLS. Never a mocked database | Vitest + Testcontainers |
| Contract | Every endpoint matches the OpenAPI document; fuzzing of inputs | OpenAPI-driven tests (for example Schemathesis) |
| Scenario | The acceptance scenario, `prd.md` §10, at API level | Vitest, hitting the real HTTP API |
| Load | Mixed workload against the targets in NFR-01 | k6 |
| Security | RLS matrix, leak test, permission matrix, immutability, dependency and baseline scans | Custom suites, OWASP ZAP baseline |
| UI end-to-end | Admin flows and portal on a phone viewport (after the Backend Gate) | Playwright |

### 14.2 Ledger and data invariants

These run in the integration suite after every scenario and every property-test run, and in production nightly (`recon-ledger`).

| # | Invariant |
|---|---|
| I-1 | For every lot and location, `stock_balances.qty` equals the sum of ledger movements in minus out. |
| I-2 | No physical location (warehouse, custody, quarantine) has a negative balance. |
| I-3 | `UPDATE`, `DELETE`, and `TRUNCATE` on `stock_ledger` and `audit_log` fail for every application role. |
| I-4 | Quantity is conserved: for every lot, the sum of balances over all locations, including virtual ones, is zero. |
| I-5 | For every factory, the sum over its jobs of `issued − returned − consumed − written_off` equals its custody balance. |
| I-6 | Every ledger row references a document that exists and is `CONFIRMED` (or is a reversal of such a row). |
| I-7 | Invoice numbers within a financial year are unique and gapless, counting cancelled invoices as used. |
| I-8 | For every invoice line, the allocated lot quantities sum to the line quantity, and lot cost components sum to `unit_cost`. |
| I-9 | No document in `DRAFT` has any ledger row. |
| I-10 | For every party-scoped table, a `party` principal for factory A reads zero rows belonging to factory B. |

### 14.3 Property-based and concurrency tests

- **Model-based property test:** generate long random sequences of commands (purchase, inward, issue, return, receipt, adjustment, order, invoice, cancel) with random quantities and orderings; after every step assert I-1 to I-9. Failures shrink to a minimal reproducing sequence.
- **Concurrency tests:** many parallel issues of the same lot; parallel invoice confirmations against limited stock (exactly as many succeed as the stock allows, the rest get `INSUFFICIENT_STOCK`, nothing goes negative); parallel duplicate requests with the same `Idempotency-Key` (one effect, identical responses); parallel invoice numbering (no gaps, no duplicates) including forced rollbacks (numbers return to the pool).
- **Pure-function checks:** apportionment always sums to the total; `computeInvoice` matches hand-checked examples, including the ₹1,330 / 5% case and the boundary at the slab threshold.

### 14.4 Security tests

- **RLS matrix:** generated from table metadata. For every party-scoped table and each of SELECT, INSERT, UPDATE, DELETE, log in as factory A, attempt to touch factory B's rows, and assert zero rows or an error. Also assert that with no context set, every policy denies. This suite is what proves the isolation design in §9.3.
- **Leak test:** for every role, call every readable endpoint and scan responses for forbidden keys (§9.4).
- **Permission matrix:** the proposed matrix in `prd.md` §2.2 is encoded as a data file, and the test asserts each role can and cannot call each endpoint accordingly. Changing the matrix means changing the file, so it is reviewed.
- Immutability, secret scanning, dependency audit, and an authenticated baseline scan on `staging` before every release.

### 14.5 The acceptance scenario as code

`scenario-r1.spec.ts` implements `prd.md` §10 step by step (all twenty steps, with Path A and Path B as two runs), asserting every number in the "Expected result" column including the ₹93,100 / ₹980.00, ₹88,825 / ₹935.00, ₹27,930, and ₹7,000 figures, and finishing by running invariants I-1 to I-10. It must be green on `main` at all times and is the exit criterion of Phase 6.

### 14.6 Performance

Seed a realistic volume (about a million ledger rows, ten thousand documents), then run k6 with about 50 concurrent virtual users on a mixed workload. Pass criteria are the NFR-01 targets. Query plans for the ledger, balances, and dashboards are reviewed against that dataset, not against an empty database.

### 14.7 Quality gates

A pull request needs: green CI, review, and tests for any changed business rule. Coverage is measured but gated only on the domain packages (costing, tax, shortage, state machines, stock engine), at 90% lines and 85% branches; a global percentage would reward trivial tests. Costing and tax functions are also candidates for mutation testing. A bug found in production gets a regression test before the fix merges.

---

## 15. Frontend (starts after the Backend Gate)

Nothing in this section is built until `plan.md`'s Backend Gate is passed, because the contract it depends on (the OpenAPI document and the behaviour behind it) must be stable first. The one thing to do earlier is design work: the screen list below can be turned into wireframes while the backend is being built.

### 15.1 Approach

- **Contract-driven.** Both apps use the generated typed client from `packages/contracts`. A backend change that breaks the contract fails the frontend build, not the customer.
- **Two applications, one repository.** `admin-web` for internal roles and `factory-portal` for factories and artisans. They share `packages/ui` (components) and `packages/contracts`, but the portal bundle contains no admin screens, no admin permission map, and no admin routes (UX-02). External users are never sent code that describes internal capabilities.
- **Server is the authority.** The UI hides what a user may not do for convenience, but every action is re-checked by the API. Costs and rates are simply absent from responses when not permitted; screens must render without them.

### 15.2 Admin web app

**Stack:** React, TypeScript, Vite, TanStack Query (server state) and TanStack Table, React Hook Form with the shared Zod schemas, Tailwind with accessible primitives, en-IN number and date formatting through one helper.

**Navigation** follows the modules: Dashboard; Purchasing (Purchases, Inward); Inventory (Raw stock, Lots, Ledger, Adjustments); Design (Designs, BOM); Production (Requirements, Job slips, Material issue and return, Receiving); Costing; Ready stock and Packing; Sales (Orders, Invoices, Payments, Customers); Reports; Audit log; Settings (Users, Roles, Masters, Tax, Numbering, Import). Menu entries appear only where the user holds a view permission.

**Screen patterns (UX-01):**

| Pattern | Rule |
|---|---|
| List | Server-side search, filters, sorting, pagination (XC-01); saved filters; CSV export; status badges; loading, empty, and error states. |
| Document form | Header plus a line editor with keyboard-friendly entry; live totals shown but always recomputed by the server on save; unsaved-changes guard; optimistic concurrency via the version. |
| Posting action | Confirm, issue, receive, invoice, and cancel actions open a confirmation dialog that states the stock effect ("This will deduct 20 pcs from D-100 Blue L"). Buttons disable while the request is in flight; the form's `Idempotency-Key` is generated once per submit attempt so a retry cannot double-post. |
| Stock indicators | On hand, with factory, quarantined, reserved, available; low-stock colour states; every number links to the ledger rows behind it. |
| Errors | Server problem codes map to specific messages (`INSUFFICIENT_STOCK` shows item, location, and shortfall). |
| Traceability | An invoice line, lot, or design opens a trace view (the query in §8.5) as a vertical timeline. |
| Reconciliation | The job close screen shows issued, returned, consumed, shortage, shortage %, and remaining per material, with the action needed to reach zero. |

### 15.3 Factory and artisan portal (PWA)

**Principles (UX-02):** mobile-first, single column, one primary action per screen, large touch targets (at least 48 px), plain language, no jargon, no admin navigation.

**Screens:** Home (my jobs: pending, in progress, completed); Job detail (material received with dates and quantities, design and instructions, expected production, material still with me, what I have sent back); Acknowledge material (received quantity, discrepancy note); Update status (Start, Mark ready); Declare dispatch (quantity by colour and size); History.

**Behaviour:** installable as a home-screen app; last-loaded jobs are cached for reading when the signal drops (stale-while-revalidate), but every write needs a connection and shows clear pending, success, and failure states; all writes use idempotency keys so a retry is safe; login by mobile number; initial JavaScript budget of about 150 KB gzipped so it loads on a weak connection; images resized server-side. All text lives in translation catalogues (NFR-10), so Hindi or Gujarati can be added without code changes once decided (Q6). It is deployed on its own hostname.

### 15.4 Frontend quality

- Component tests (Vitest and Testing Library) for forms and tables; Playwright end-to-end for the admin path of `prd.md` §10 and for the portal on a phone-sized viewport.
- Accessibility: keyboard operable, labelled controls, visible focus, sufficient contrast; WCAG 2.1 AA as the portal's target.
- Performance budgets enforced in CI (bundle size, and Lighthouse checks on the portal).
- Browser support: the last two versions of Chrome, Edge, and Safari; Android Chrome for the portal.

---

## 16. Repository layout and conventions

```
garment-erp/
├─ apps/
│  ├─ api/                  NestJS: admin and portal route trees, worker entrypoint
│  │   └─ src/modules/      identity · master · purchasing · inventory · design · jobwork
│  │                        · costing · sales · reporting · audit · documents · notifications
│  │        └─ <module>/    domain/ (pure rules) · application/ (services) · infra/ (SQL) · http/ (routes, DTOs)
│  ├─ admin-web/            React SPA (after the Backend Gate)
│  └─ factory-portal/       React PWA (after the Backend Gate)
├─ packages/
│  ├─ contracts/            Zod schemas, OpenAPI documents, generated clients
│  ├─ ui/                   shared components
│  └─ config/               lint, TypeScript, and test configuration
├─ db/
│  ├─ migrations/           forward-only .sql
│  └─ seeds/                roles, permissions, default categories, UoMs, demo dataset
├─ scenarios/               acceptance scenario and fixtures (prd.md §10)
├─ docs/                    prd.md, tech.md, plan.md, ADRs, runbooks
└─ infra/                   Dockerfiles, compose, CI workflows
```

Conventions: trunk-based with short-lived branches and required review; conventional commit messages; formatter and linter enforced in CI; module-boundary lint (§3.2); one ADR per significant decision under `docs/adr`; no business logic in controllers or SQL triggers beyond the integrity rules in §4.

---

## 17. Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| Stock engine defect (wrong quantities) | Loses trust in the whole system | Trigger-enforced balances, property tests, nightly reconciliation, reversal-only corrections |
| Building the backend for months before anyone sees a screen | Late discovery that a workflow is wrong | Executable scenario from Phase 2 onward, demo checkpoints at every phase gate using Swagger and the Postman collection, a seeded demo dataset, and an optional throwaway internal UI on the API for the owner to click through. See `plan.md` §3 |
| RLS or portal-role complexity | Isolation gap, or effort overrun | Keep policies to single equality tests on a denormalised column; the RLS matrix suite is the proof; fallback order in §9.3 |
| GST rules modelled wrongly | Non-compliant invoices, rework | Rates and rules are data; pure tax function; CA sign-off on examples before Phase 6 |
| Costing method disputed after launch | Restating history | Decide Q1 before Phase 2; lot costs and revaluations are append-only and reportable |
| Scope creep from R2 and R3 | R1 never ships | Release gates; new requests enter the backlog under a release tag |
| Single developer (bus factor) | Continuity | Tests, ADRs, runbooks, and this documentation set |
| Poor opening data | Wrong stock from day one | Dry-run imports, stock-take report, parallel run |
| Mobile networks (retries, drops) | Double posting, lost updates | Idempotency keys, optimistic concurrency, clear in-flight UI |
| Hosting or vendor lock-in | Migration pain | Standard Postgres, S3-compatible storage, containers; no proprietary services in the core |

---

## 18. Assumptions and open technical decisions

Assumptions made so work is not blocked (each can be revised; none changes §4 to §8):

- Node.js and TypeScript are acceptable to the team (`T-02`); if the builder prefers Python, use Django with the same schema and rules.
- Managed PostgreSQL with point-in-time recovery is available in an India region.
- One company, one warehouse at launch, INR, IST, Indian financial year.
- Volumes: up to about 5,000 ledger rows a day, about 50 internal and 200 external users.
- The build team is one to two developers.

Open technical decisions, each with the owner question it hangs on in `prd.md` §11:

| # | Decision | Default | Ties to |
|---|---|---|---|
| TD-1 | Costing basis | Lot-actual FIFO, provisional-then-true-up | Q1 |
| TD-2 | Tax-slab value basis (before or after discount) | After discount, configurable | Q2 |
| TD-3 | Portal write actions | Acknowledge, start, ready, declare dispatch | Q3 |
| TD-4 | Stack (`T-02`, `T-03`) | TypeScript, NestJS | Q10 |
| TD-5 | Hosting provider and region | Managed container host and managed Postgres in India | Q14 |
| TD-6 | Audit retention period | Indefinite until a policy is set | Q14 |

---

## Appendix A. The PDF's 34 entities mapped to tables (Source §38)

| # | PDF entity | Table(s) |
|---|---|---|
| 1 | Users | `users`, `sessions`, `user_roles`, `user_permission_overrides` |
| 2 | Roles | `roles` |
| 3 | Permissions | `permissions`, `role_permissions` |
| 4 | Suppliers | `suppliers` |
| 5 | Customers | `customers` |
| 6 | Materials | `materials`, `material_variants`, `colours` |
| 7 | Material Categories | `material_categories` |
| 8 | Purchases | `purchases` |
| 9 | Purchase Items | `purchase_items` |
| 10 | Inward Entries | `inwards`, `inward_lines` |
| 11 | Raw Material Inventory | `stock_items`, `stock_lots`, `stock_balances` (views `v_raw_stock`) |
| 12 | Stock Transactions | `stock_ledger` |
| 13 | Designs | `designs`, `design_variants` |
| 14 | Design Materials | `design_bom_versions`, `design_bom_lines` |
| 15 | Factories | `job_workers` (type FACTORY) |
| 16 | Artisans | `job_workers` (type ARTISAN) |
| 17 | Job Slips | `job_slips`, `job_slip_lines` |
| 18 | Material Issues | `material_issues`, `material_issue_lines`, `job_material_lines` |
| 19 | Processing Entries | `job_receipts`, `job_receipt_lines` where the slip is a PROCESSING job; `processing_types` |
| 20 | Production Entries | `job_receipts`, `job_receipt_lines` where the slip is a MANUFACTURING job; `production_orders` and lines |
| 21 | Finished Products | `job_receipt_lines` (output) and `stock_items` of kind FINISHED_GOOD |
| 22 | Finished Stock | `stock_balances` for finished items (view `v_ready_stock`) |
| 23 | Costing | `job_cost_sheets`, `job_cost_lines`, `stock_lot_cost_components`, `lot_revaluations`, `job_charges` |
| 24 | Selling Prices | `design_rate_history`, `customer_prices` (R2) |
| 25 | Sales Orders | `sales_orders` |
| 26 | Sales Order Items | `sales_order_lines` |
| 27 | Invoices | `invoices` |
| 28 | Invoice Items | `invoice_lines`, `invoice_line_allocations` |
| 29 | Sales Returns | `sales_returns` and lines (R2) |
| 30 | Purchase Returns | `purchase_returns` and lines (R2) |
| 31 | Payments | `payments`, `payment_allocations` |
| 32 | Notifications | `notifications`, `notification_rules` (R2) |
| 33 | Audit Logs | `audit_log` |
| 34 | Locations | `stock_locations` |

**Needed but missing from the PDF's list** (`prd.md` A-13): `uoms`, `uom_conversions`, `sizes`, `product_categories`, `processing_types`, `production_orders`, `production_order_lines`, `production_order_requirements`, `material_returns` and lines, `job_charges`, `job_material_lines`, `stock_lots`, `stock_adjustments`, `tax_rules`, `company_settings`, `number_series`, `attachments`, `import_batches`, `recon_runs`, `idempotency_keys`, `outbox_events`. There is no `stock_reservations` table on purpose: reservations are derived (§5.9).

---

## Appendix B. Permission catalogue

Keys follow `module.resource.action`. Roles are bundles of these; the proposed role matrix is `prd.md` §2.2 and is encoded as test data (§14.4). External users additionally carry the implicit party scope and only the `portal.*` keys.

| Module | Keys |
|---|---|
| Identity and settings | `identity.user.manage`, `identity.role.manage`, `settings.manage`, `tax.manage`, `numbering.manage` |
| Master data | `master.supplier.view`, `.edit`; `master.material.view`, `.edit`; `master.customer.view`, `.edit`; `master.jobworker.view`, `.edit`; `master.location.edit`; `master.import.run` |
| Purchasing | `purchase.view`, `.edit`, `.confirm`, `.cancel`, `purchase.rates.view`; `inward.view`, `.edit`, `.confirm`, `.cancel` |
| Inventory | `stock.view`, `stock.ledger.view`, `stock.value.view`, `stock.adjust.propose`, `stock.adjust.approve`, `stock.lot.pick` |
| Design | `design.view`, `.edit`, `design.bom.view`, `design.rate.view`, `design.rate.edit` |
| Job work | `production.view`, `.edit`; `jobslip.view`, `.edit`, `.cancel`, `.close`; `issue.view`, `.edit`, `.confirm`, `.cancel`; `receipt.view`, `.edit`, `.confirm`, `.cancel`, `receipt.charges.edit`; `shortage.view`, `.approve`; `writeoff.approve` |
| Costing | `costing.view` |
| Ready stock | `readystock.view`, `packing.update` |
| Sales | `sales.order.view`, `.edit`, `.confirm`, `.cancel`; `sales.invoice.view`, `.edit`, `.confirm`, `.cancel`; `sales.discount.apply`, `sales.discount.overcap`; `sales.negative_stock.allow` (R2); `payment.view`, `.record` |
| Reports and dashboards | `report.<family>.view`, `report.export`, `dashboard.<name>.view` |
| Audit | `audit.view`, `audit.export` |
| Portal (external, party-scoped) | `portal.job.view`, `portal.job.acknowledge`, `portal.job.status`, `portal.job.dispatch` |

---

## Appendix C. Ledger walkthrough of the acceptance scenario

`prd.md` §10, Path A. Lots: `C-001` Cotton Blue, `P-001` Printed Blue, `FG-M-001` and `FG-L-001` finished D-100 Blue M and L. WH = Warehouse, CA = Factory A custody, PROD, LOSS, CUST = virtual locations.

| Step | Type | Item / lot | From → To | Qty | Unit cost | Note |
|---|---|---|---|---|---|---|
| 2 | INWARD | Cotton Blue / C-001 | SUPPLIER → WH | 500 | 120.0000 | Lot created from purchase P1 |
| 2 | INWARD | Printed Blue / P-001 | SUPPLIER → WH | 300 | 150.0000 | Lot created from purchase P2 |
| 5 | ISSUE | Cotton Blue / C-001 | WH → CA | 400 | 120.0000 | `job_material_lines` J1: issued 400 |
| 5 | ISSUE | Printed Blue / P-001 | WH → CA | 250 | 150.0000 | `job_material_lines` J1: issued 250 |
| 8 | CONSUMPTION | Cotton Blue / C-001 | CA → PROD | 380 | 120.0000 | 95 pieces × 4.0 m |
| 8 | CONSUMPTION | Printed Blue / P-001 | CA → PROD | 237.5 | 150.0000 | 95 pieces × 2.5 m |
| 8 | PRODUCTION_RECEIPT | D-100 Blue M / FG-M-001 | PROD → WH | 38 | 935.0000 | Provisional: 855 + 80 |
| 8 | PRODUCTION_RECEIPT | D-100 Blue L / FG-L-001 | PROD → WH | 57 | 935.0000 | Provisional: 855 + 80 |
| 11a | SHORTAGE_WRITE_OFF | Cotton Blue / C-001 | CA → LOSS | 20 | 120.0000 | Custody for J1 now zero |
| 11a | SHORTAGE_WRITE_OFF | Printed Blue / P-001 | CA → LOSS | 12.5 | 150.0000 | |
| 11a | *(revaluation, not a ledger row)* | FG-M-001, FG-L-001 | | | 935 → 980 | `lot_revaluations`; cost sheet FINAL: ₹93,100 ÷ 95 |
| 13 | SALE | D-100 Blue L / FG-L-001 | WH → CUST | 20 | 980.0000 | `invoice_line_allocations`: 20 from FG-L-001, cost ₹19,600 |
| 17 | REVERSAL | D-100 Blue L / FG-L-001 | CUST → WH | 20 | 980.0000 | `reverses_id` = the SALE row; invoice cancelled, number kept |

Balances after step 8: WH cotton 100, printed 50, D-100 M 38, L 57; CA cotton 20, printed 12.5. After step 11a: CA zero. After step 13: WH D-100 L 37, M 38 (75). After step 17: L 57 again (95).


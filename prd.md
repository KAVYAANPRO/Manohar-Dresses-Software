# PRD: Garment Manufacturing, Inventory, Job Work, Costing & Sales Management System

| | |
|---|---|
| **Document** | Product Requirements Document |
| **Version** | 1.1 (restructured and corrected from source PRD v1.0) |
| **Date** | 24 Sep 2026 |
| **Status** | Draft for owner review |
| **Source** | `FINAL GARMENT SALE.pdf` (57 pages, 51 sections) |
| **Companions** | `tech.md` (architecture, backend first), `plan.md` (phase-wise delivery) |

---

## 0. How to read this document

The source PDF is a good statement of intent but it is not build-ready. It contains internal contradictions, a defective stock formula, several missing entities, and a "first release" that is really the whole product. This document keeps everything the PDF asks for, fixes what is broken, and fills the gaps so that a developer can build from it without guessing.

**Conventions**

- **Source §n** means section *n* of the PDF. Every module below cites its source sections. Appendix A maps all 51 sections to this document.
- **Requirement IDs** look like `PUR-03`. They are stable; `tech.md` and `plan.md` refer to them.
- **Origin**: `SRC` = stated in the PDF. `ADD` = added by this analysis to close a gap. `ADD⚑` = added and needs an owner decision (listed in §11).
- **Release**: `R1` = first production release (the PDF calls this "MVP", but see §9). `R2` = PDF Phase 2 (§45). `R3` = PDF Phase 3 (§46). A few items moved between releases; §9 lists every move and why.
- **Priority language**: "must" = required for the release it is tagged with. "should" = strong default, may slip.

**Facts I inferred rather than read.** The PDF never states the industry segment or country. The examples (Kurti Set, Dupatta, "GST Number if applicable") strongly indicate Indian ethnic wear with outsourced production. I have written for that context. If it is wrong, §5.3, Appendix B, and the GST parts of `SAL-05` change; nothing else does.

---

## 1. Product summary

### 1.1 Problem

The business buys fabric, sends it out to external factories and artisans (for dyeing/processing and for stitching), gets finished garments back, and sells them. Today this runs on manual registers and spreadsheets. Material physically leaves the premises, and nobody can say with confidence how much is at which factory, how much was lost, what a garment actually cost, or which purchase a sold garment came from.

### 1.2 Product principles (Source §1, §51)

1. One centralised source of truth for the whole business, from raw material purchase to final garment sale.
2. Every important business event creates a record. Nothing changes silently.
3. Every material movement affects inventory correctly. Inventory history is never edited or deleted.
4. Every manufacturing job is traceable end to end.
5. Every finished garment has a calculated, actual cost.
6. Every sale updates stock.
7. Every external factory or artisan sees only its own information.

### 1.3 Goals (Source §2, grouped)

| Group | Goal |
|---|---|
| Inventory | Maintain raw-material and finished-garment inventory in real time, with a full movement history. |
| Job work | Track material issued to factories/artisans, returned, consumed, and lost, per job. |
| Design | Track designs and the materials each requires; compute expected material and expected output. |
| Costing | Automatically calculate actual garment cost from real material, processing, and manufacturing data. |
| Sales | Manage customers, sales orders, invoices; deduct stock automatically on confirmed sale. |
| Control | Role-based access, isolated factory/artisan accounts, audit trail, management reports and dashboards. |

### 1.4 Proposed non-goals (`ADD⚑`)

The PDF does not list non-goals, which invites scope creep. Proposed, for confirmation:

- Not a general-ledger accounting system. It exports to one (R3 "Accounting integration"); it does not replace it.
- Not GST return filing. It captures the data and produces the reports a CA needs (Appendix B).
- Not payroll, HR, or attendance.
- Not a customer-facing e-commerce store.
- Not offline-first in R1. Factory users need internet (mobile data is enough).

### 1.5 Success criteria (Source §49, made measurable)

Source §49 says the system succeeds when the business can run the full flow digitally "without needing to maintain the same information manually in multiple systems". That is not testable as written. Proposed measurable criteria (`ADD⚑`, targets are proposals):

| # | Criterion | Target |
|---|---|---|
| S1 | The end-to-end scenario in §10 runs as an automated test and passes. | 100% |
| S2 | Ledger-derived stock equals a physical count of raw fabric and ready garments at the first audit after go-live. | ≤ 1% variance per item, no unexplained variance |
| S3 | Every closed job has a stored cost per piece. | 100% |
| S4 | Cross-party data leaks found in security testing (Factory A reading Factory B). | 0 |
| S5 | Parallel-run period: manual registers and the system agree, then registers are retired. | 1 full month agreement |
| S6 | Any sold garment can be traced back to its supplier purchase in one screen or one API call. | 100% of sales |

### 1.6 Assumptions (`ADD⚑`)

- Single company, single legal entity. INR only. Indian financial year (1 Apr to 31 Mar). Times are IST.
- Internal users ≤ 50; external factory/artisan users ≤ 200; growth is modest (Source §47 asks only that the architecture "support future growth").
- English UI at launch. Factory/artisan UI language is an open question (§11, Q6).
- Factories and artisans have a smartphone and mobile internet.

---

## 2. Users and roles

### 2.1 Roles (Source §3, §4)

| Role | Purpose | Type |
|---|---|---|
| Super Admin / Owner | Everything, including users, roles, rates, settings, audit log, cancellations, approvals. | Internal |
| Purchase Department | Records purchases; sees purchase rates. | Internal |
| Raw Material / Inventory Department | Receives inward, keeps raw stock, issues and takes back material, proposes stock adjustments. | Internal |
| Design Department | Owns designs, design images, and the design-to-material mapping (BOM). | Internal |
| Production Department | Plans production, creates job slips, receives finished goods, monitors factories. | Internal |
| Packing Department | Sees ready stock and records packing. No purchase or cost visibility. | Internal |
| Sales Department | Customers, sales orders, invoices, payments. | Internal |
| Factory User | External. Sees only its own jobs, material and returns. | External, party-scoped |
| Artisan User | Same permission set as Factory User. | External, party-scoped |

The PDF says each role "should only have access to the modules and data required" but never defines what that is. §2.2 is the proposed matrix.

### 2.2 Proposed permission matrix (`ADD⚑`)

Legend: **V** view, **C** create, **E** edit while draft, **X** confirm/post, **N** cancel/reverse (reason required), **A** approve. **–** no access. `*` = rate/cost fields hidden. **own** = party-scoped rows only. Super Admin has everything.

| Module | Purchase | Inventory | Design | Production | Packing | Sales | Factory / Artisan |
|---|---|---|---|---|---|---|---|
| Users, roles, settings, tax, numbering | – | – | – | – | – | – | – |
| Suppliers | VCE | V | – | – | – | – | – |
| Materials, colours, categories, UoM | VC | VCE | V | V | – | – | – |
| Customers | – | – | – | – | – | VCE | – |
| Factories / artisans (master data) | – | V | – | VCE | – | – | own V (profile) |
| Purchases (with rates) | VCEXN | V* | – | – | – | – | – |
| Inward | V | VCEX | – | – | – | – | – |
| Raw stock and ledger | V | VCE | V* | V* | – | – | – |
| Stock adjustments | – | C | – | – | – | – | – |
| Designs and BOM | V* | V | VCE | V | V* | V* | own: instructions only |
| Production requirements | V | V | V | VCE | – | – | – |
| Job slips | V | V | V | VCEXN | – | – | own V, status update |
| Material issue and return | – | VCEXN | – | V | – | – | own V, acknowledge |
| Processing and finished receiving | – | V | – | VCEXN | V* | – | own V, declare dispatch |
| Shortage reconciliation | – | V | – | VA | – | – | own: quantities only, off by default |
| Costing and margin | – | – | – | – | – | – | – (grantable per user) |
| Ready stock | – | V | V | V | V + pack | V | – |
| Sales orders | – | – | – | – | V | VCEXN | – |
| Invoices and payments | – | – | – | – | – | VCEX, pay C | – |
| Audit log | – | – | – | – | – | – | – |

Approvals (`A`, `stock adjustments`, `invoice cancel`, discount above limit) rest with Super Admin unless delegated. The Sales role can *request* an invoice cancellation.

### 2.3 Access principles (Source §36, §41)

- **Default deny.** No permission, no access.
- Permissions are fine-grained keys. Roles are bundles of keys. Individual users can receive extra grants or denials. This is required because the PDF says Packing and Factory users are blocked from costing "unless explicitly permitted", which a pure role model cannot express.
- **Party scope.** A Factory/Artisan user is bound to exactly one party and only ever sees rows belonging to it.
- **Field-level protection.** Rates, costs, and margins are not sent to users who lack the permission. Hiding a column in the UI is cosmetic; the API must not return the value.
- A factory or artisan may have more than one login (staff turnover, shared workshops). The PDF says "each factory/artisan will have a unique account"; that is read as *unique per user*, all pointing at one party. Sharing one password across a factory is a security and audit failure.

---

## 3. The business flow and vocabulary

### 3.1 End-to-end flow (Source §1, §25, §49)

```
Supplier -> Purchase -> Inward -> Raw Material Stock
                                     |
Design + BOM -> Production Requirement -> Job Slip
                                     |
   Material Issue (warehouse -> factory custody)
                                     |
   [optional] Processing / Dyeing job: raw fabric -> processed fabric (with shortage)
                                     |
   Manufacturing job at Factory / Artisan
                                     |
   Finished Product Receiving (accepted / rejected / damaged, by colour and size)
                                     |
   Shortage reconciliation -> Job close -> Actual Costing
                                     |
   Ready Garment Stock -> Sales Order -> Invoice -> Automatic Stock Deduction
```

### 3.2 Glossary

| Term | Meaning |
|---|---|
| **Material** | A purchasable raw item, for example "Cotton Fabric". Belongs to a material category (Top Fabric, Bottom Fabric, Dupatta Fabric, Trims, and so on). |
| **Material variant** | A material in a colour, for example "Cotton Fabric - Blue". This is what is actually stocked. |
| **Processed material** | The output of a processing job, for example "Printed Fabric - Blue" made from raw dupatta cloth. It is a new material variant. |
| **Design** | A garment design with a unique Design Number, for example `D-1025`. |
| **Design variant** | A design in a colour and size, for example `D-1025 / Blue / L`. This is what finished stock and sales use. |
| **BOM** | Bill of materials: the materials and quantity per garment for a design. Source §9 calls this "design-material mapping". |
| **Location** | Where stock physically or logically is: a warehouse, a factory's custody, quarantine. |
| **Custody** | Material that belongs to the company but is physically at a factory or artisan. It is reduced from warehouse stock at issue and shown as "Material Currently With Factory / Artisan". |
| **Lot** | A traceable batch of one item with one unit cost, created by an inward, an opening balance, or a production receipt. |
| **Production requirement** | A plan to make *N* garments of a design; computes how much material is needed. Source §48 step 7 uses it but the PDF's entity list omits it. |
| **Job slip** | The work order sent to one factory/artisan for one design (or one processing step). |
| **Quarantine** | A location for rejected, damaged, or returned-damaged goods. Not sellable. |
| **ATP** | Available to promise: sellable ready stock minus quantities already promised on confirmed, un-invoiced sales orders. |

---
## 4. Functional requirements

Columns: **Rel** = release, **Origin** = SRC / ADD / ADD⚑ (see §0), **Src §** = source PDF section.

### 4.1 AUTH: Access and security (Source §3, §4, §11, §36)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| AUTH-01 | Username and password login. A mobile number may be the username (artisans often have no email). Passwords hashed with a modern adaptive algorithm, never stored or logged in clear text. Throttling and lockout after repeated failures. | R1 | SRC | 36 |
| AUTH-02 | Server-side sessions with expiry, logout, and admin "force logout" of any user. | R1 | SRC | 36 |
| AUTH-03 | Admin creates users, assigns roles, links a user to a party if external, and deactivates users (never deletes). | R1 | SRC | 3, 4, 10 |
| AUTH-04 | Permissions are keys, roles are bundles of keys, individual users can have allow/deny overrides. Nine default roles seeded; custom roles allowed. | R1 | ADD | 3, 11, 20 |
| AUTH-05 | Every API request is authorised on the server. The frontend is never the control. | R1 | SRC | 36 |
| AUTH-06 | Party-scoped users read and write only rows of their own party, enforced in the API **and** in the database. | R1 | SRC | 11, 36, Rule 8 |
| AUTH-07 | Rates, costs, and margins are omitted from responses for users without the matching permission. | R1 | SRC/ADD | 11, 20 |
| AUTH-08 | Admin password reset (R1). Self-service reset and admin two-factor authentication (R2). | R1/R2 | ADD | 36 |
| AUTH-09 | Secrets only through environment or a secret store, never in source code. | R1 | SRC | 43 |

### 4.2 MST: Master data (Source §5, §8, §10, §22, §37)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| MST-01 | Suppliers: name, contact, GSTIN, address, payment terms, status. (§38 lists the entity but no fields.) | R1 | ADD | 38 |
| MST-02 | Material categories. Top Fabric, Bottom Fabric, Dupatta Fabric seeded; more can be added (Lining, Trims, Packing material). | R1 | SRC | 5 |
| MST-03 | Materials and variants: material has category, fabric type, base unit, minimum stock level, status. Colours are a master. A variant is material × colour and is what gets stocked. | R1 | SRC/ADD | 5, 7 |
| MST-04 | Units of measure with per-material conversion to a base unit (metre). A purchase may be in rolls, kg, or than; stock and BOM are always in the base unit. Resolves the three overlapping fields Quantity / Unit / Meter Quantity (A-15). | R1 | ADD | 5 |
| MST-05 | Product categories and types configurable (Kurti Set seeded). Sizes master (XS to XXL, configurable). | R1 | SRC | 8, 19 |
| MST-06 | Locations: default Main Warehouse; a custody location per factory/artisan and a quarantine location, created automatically. Multi-warehouse screens R2; the schema supports it from R1 because inward and stock already carry Location. | R1 | SRC | 6, 7, 19, 37 |
| MST-07 | Factories and artisans: name, type, contact person, mobile, address, email, login account(s), status, notes. | R1 | SRC | 10 |
| MST-08 | Customers: ID, name, business name, contact person, mobile, email, billing and shipping address, GSTIN, default discount %, payment terms, notes. Customer-specific price lists R2. | R1 | SRC | 22 |
| MST-09 | Processing types (Dyeing, Printing, Embroidery, and so on), configurable. | R1 | ADD | 14 |
| MST-10 | Company profile and tax setup: legal name, GSTIN, state, address; tax rules by HSN and per-piece value band, effective-dated; financial-year and document number-series settings. | R1 | ADD⚑ | 23, 35 |
| MST-11 | CSV import with dry-run validation for masters and for opening stock. The stock formula in §7 starts from "Opening Stock" but nothing loads it, and the stated goal is to replace spreadsheets. | R1 | ADD | 7 |
| MST-12 | Anything referenced by a transaction can be deactivated, never deleted. | R1 | SRC/ADD | Rule 9 |

### 4.3 PUR: Purchase (Source §5)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| PUR-01 | Purchase entry. Header: purchase ID, date, supplier, supplier invoice number, other charges, notes, attachment. Lines: category, material, fabric type, colour, quantity, unit, metre quantity, rate, amount. Statuses: Draft, Confirmed, Partially Received, Received, Cancelled. | R1 | SRC | 5 |
| PUR-02 | Duplicate purchase numbers blocked. The same supplier invoice number cannot be entered twice for one supplier. | R1 | SRC/ADD | 35 |
| PUR-03 | The server computes amounts and metre quantities using MST-04. Client-supplied totals are never trusted. | R1 | ADD | 5 |
| PUR-04 | Other charges (freight and so on) are apportioned over lines, by value by default, to give a landed unit cost per lot. | R1 | ADD⚑ | 5, 18 |
| PUR-05 | Confirming a purchase creates an expected receipt only. It must not create stock (Rule 1). | R1 | SRC | 5, Rule 1 |
| PUR-06 | Confirmed purchases are locked. Only notes and attachments stay editable; otherwise cancel with a reason. Cancel is blocked while any inward exists against the purchase. | R1 | SRC/ADD | Rule 9 |
| PUR-07 | Invoice attachment upload (image or PDF, optional). | R1 | SRC | 5 |
| PUR-08 | Purchase return: Purchase → Inward → Inspection → Return → Stock adjustment. | R2 | SRC | 30 |

### 4.4 INW: Raw material inward (Source §6)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| INW-01 | Inward against a confirmed purchase; partial and multiple inwards per purchase line; over-receipt beyond a configurable tolerance is blocked. | R1 | SRC/ADD | 6 |
| INW-02 | Fields: inward number, purchase reference, date, supplier, material, category, colour, quantity, unit, metre, rate, location, batch/lot (optional), remarks. If batch/lot is blank the system creates a lot, so traceability is never partial. | R1 | SRC/ADD | 6 |
| INW-03 | Confirming an inward puts the material into raw-material stock at the chosen location as a new lot carrying the landed unit cost. | R1 | SRC | 6 |
| INW-04 | Every inward links to its purchase line. Exceptions (opening balance, adjustment) carry their own source type. | R1 | SRC | 6 |
| INW-05 | Pending-inward list: confirmed purchases not fully received. | R1 | SRC | 26 |

### 4.5 STK: Stock ledger and inventory (Source §7, §28, §31, §37; Rules 1, 2, 9)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| STK-01 | One append-only ledger records every movement of every item, raw or finished. Fields: transaction ID, date, type, item, lot, quantity, unit, reference number, user, source, destination, remarks. | R1 | SRC | 28 |
| STK-02 | Movement types: Opening, Inward, Issue, Return-from-factory, Consumption, Process-output, Production-receipt, Rejection, Shortage-write-off, Adjustment (in and out), Sale, Sales-return, Purchase-return, Transfer, Reversal. "Purchase" is **not** a stock movement (Rule 1; see A-07). | R1 | SRC, corrected | 28 |
| STK-03 | Nobody can edit or delete a ledger row through the application. Corrections are new entries that reverse and reference the original. | R1 | SRC | 33, Rule 9 |
| STK-04 | Stock is reported as: on hand at warehouse, with factory (custody), in quarantine, reserved for orders, available (ATP). | R1 | SRC | 12, 26 |
| STK-05 | Stock adjustment: item, current quantity, adjusted quantity, difference, reason (mandatory), user, date, approval above a configurable threshold. Signed: it can add or remove. | R1 | SRC | 31 |
| STK-06 | Physical locations cannot go negative; selling more than is available is blocked. Admin-authorised negative or backorder sale is R2. | R1/R2 | SRC | 24 |
| STK-07 | Lot tracking with FIFO by default; a permitted user may choose a specific lot. Needed for actual costing and for traceability. | R1 | ADD | 18, 25 |
| STK-08 | Minimum stock level per item and a low-stock flag on dashboards. Automated reorder suggestions are R3. | R1/R3 | SRC/ADD | 26, 46 |
| STK-09 | Stock valuation report: quantity × lot cost by item and location. | R1 | ADD | 18 |
| STK-10 | Nightly reconciliation of balances against the ledger; any drift raises an alert. | R1 | ADD | 47 |
| STK-11 | Transfers between warehouses. | R2 | SRC | 37, 45 |

### 4.6 DSN: Design and design-material mapping (Source §8, §9)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| DSN-01 | Design master: design number (unique), name, product category, product type, description, status, colour options, size options, expected production quantity, manufacturing instructions, default selling rate, images (optional), notes. | R1 | SRC | 8 |
| DSN-02 | Design variants (colour × size) are generated from the options. They are the finished-stock unit. | R1 | ADD | 19 |
| DSN-03 | BOM as generic lines: role (Top, Bottom, Dupatta, Lining, Trim, ...), material variant, quantity per garment in base unit, planned allowance %. Do not hard-code three fabric columns: costing (§18) already has "Other Material Cost". | R1 | SRC/ADD | 9, 18 |
| DSN-04 | BOM edits create a new version. A production requirement copies the BOM version at creation so history and costing never shift. | R1 | ADD | 9 |
| DSN-05 | Requirement calculator: garments × BOM (+ allowance) = required material, compared with stock. Example: 2 m × 50 = 100 m. | R1 | SRC | 9 |
| DSN-06 | Default selling rate keeps an effective-dated history; every change is audited. | R1 | SRC | 33 |
| DSN-07 | Size-wise consumption overrides (an XXL takes more cloth than an S). | R2 | ADD⚑ | 9 |

### 4.7 JOB: Job work, material issue, processing, receiving (Source §11–17, §48)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| JOB-01 | Production requirement: design, quantities by colour and size, planned dates, computed material requirement, status. The PDF uses this at §48 step 7 but omits the entity from §38. | R1 | SRC/ADD | 16, 48 |
| JOB-02 | Job slip: unique number, date, factory/artisan, design, product category, type (Processing or Manufacturing), expected output by colour and size, expected completion date, charge basis (per piece / per metre / lump sum) with agreed rate, instructions, status, remarks. One job slip = one party and one design. | R1 | SRC | 13 |
| JOB-03 | Job status machine as tabled below. | R1 | SRC | 13 |
| JOB-04 | Material issue: issue number, date, party, design, lines (material, category, colour, quantity, metre, expected usage) with lot picked FIFO by default, job slip reference, notes. Multiple issues per job slip. Reduces warehouse stock and creates custody stock. Blocked if insufficient. | R1 | SRC | 12 |
| JOB-05 | Printable material issue slip: print-ready HTML in R1, PDF in R2. | R1/R2 | SRC | 42 |
| JOB-06 | Factory acknowledgement of material received, with a discrepancy note that flags the Inventory role. | R1 | ADD⚑ | 11, 48 |
| JOB-07 | Material return from a factory (unused or rejected input) back to the warehouse in its original lot. | R1 | SRC | 2 |
| JOB-08 | Processing/dyeing jobs are conversions: input item and quantity sent → output item and quantity received. Track processing type, issue date, processing date, expected quantity, actual received, shortage, shortage %, final processed quantity, processing charges, remarks. Output enters raw stock as a processed material variant. | R1 | SRC/ADD | 14 |
| JOB-09 | Finished product receiving: receiving number, job slip, party, design, category, date sent, expected, actual received, accepted, rejected, damaged, manufacturing charges, other charges, remarks. Quantities entered per colour and size. Partial and multiple receipts. | R1 | SRC/ADD | 17, 19 |
| JOB-10 | Accepted quantity enters ready stock automatically. Rejected and damaged go to quarantine; visible, never sellable. | R1 | SRC/ADD | 17 |
| JOB-11 | Production comparison per job: expected, actual, difference, material consumed, remaining, shortage, status, party, design, job slip. | R1 | SRC | 16 |
| JOB-12 | Close job. Allowed only after reconciliation. Material still in custody must be returned or written off as shortage (reason; approval above tolerance). Closing locks the job and finalises its cost. | R1 | ADD | 13, 15 |
| JOB-13 | Overdue detection: expected completion date passed and job not closed. | R1 | SRC | 32 |
| JOB-14 | Factory portal actions: acknowledge material, mark In Process, mark Ready, declare dispatch quantity. A factory never posts stock; company staff confirm the receiving. | R1 | ADD⚑ | 11 |
| JOB-15 | Statement of agreed job-work charges payable by party. Actual payments to parties are R3. | R2 | ADD⚑ | none |

**Job slip status machine (Source §13)**

| Status | Entered when | By |
|---|---|---|
| Created | Slip saved | Production |
| Material Issued | First material issue confirmed | Automatic |
| In Process | Work started | Factory or Production |
| Ready | Goods ready to dispatch | Factory or Production |
| Partially Received | A receipt confirmed; cumulative received is below expected | Automatic |
| Received | Cumulative received reaches expected, or short-closed with a reason | Automatic / Production |
| Closed | Reconciliation passed | Production / Admin |
| Cancelled | Only from Created, or from Material Issued if all issued material is returned; reason required | Production / Admin |

Receipts are allowed from Material Issued, In Process, Ready, or Partially Received, because factories often ship before marking Ready. Closed and Cancelled are terminal.

### 4.8 SHR: Shortage and wastage (Source §15)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| SHR-01 | Processing shortage = Quantity Sent − Quantity Received. Shortage % = Shortage ÷ Quantity Sent × 100. Division by zero guarded. | R1 | SRC | 15 |
| SHR-02 | Manufacturing material reconciliation (formulas in §5.4): issued, returned, consumed by BOM, shortage, shortage %. The PDF asks for "material consumed, remaining, shortage" but gives no formula. | R1 | ADD | 16 |
| SHR-03 | Configurable tolerance % per material, process type, and party. No tolerance is set until the owner sets one; "high shortage" alerts depend on it. | R1 | ADD⚑ | 32 |
| SHR-04 | Historical shortage retained and reportable by factory, artisan, material, design, date, and job. | R1 | SRC | 15 |

### 4.9 CST: Costing (Source §18; Rule 5)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| CST-01 | Cost sheet per job, with components: top, bottom, dupatta and other material; dyeing/processing; artisan; factory; job work; other. Components come from real records, not typed in. | R1 | SRC | 18 |
| CST-02 | Material cost = actual cost of the lots issued to the job, net of material returned. Consumed, lost, and written-off material stays inside the cost. | R1 | ADD | 18 |
| CST-03 | Processing, manufacturing, and other charges come from the job's processing entries and receipts. Each charge is entered once, on one document type (A-09). | R1 | SRC/ADD | 14, 17, 18 |
| CST-04 | Cost per garment = Total production cost ÷ accepted quantity, guarded against zero. Provisional until the job closes; final after. | R1 | SRC | 18 |
| CST-05 | A processing job's output lot carries its own cost, so processed-fabric cost flows into the garment job that consumes it. No manual roll-up. | R1 | ADD | 14, 18 |
| CST-06 | Display total cost, cost per piece, selling price, the difference, and a customer-specific price where one exists. | R1/R2 | SRC | 18 |
| CST-07 | Fixed-precision decimals. Visible only with the costing permission. | R1 | SRC/ADD | 11, 20 |
| CST-08 | On job close, provisional lot costs are trued up. Variance on stock already sold is recorded and reported, not restated on posted invoices. | R1 | ADD⚑ | 18 |

### 4.10 RGS / PKG: Ready stock and packing (Source §19, §20)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| RGS-01 | Ready stock by design, category, colour, size, quantity, date received, factory/artisan, and location. | R1 | SRC | 19 |
| RGS-02 | Accepted quantities from receiving enter ready stock automatically, carrying the job's cost. | R1 | SRC | 17, 19 |
| RGS-03 | Current available stock always visible with size breakdown (example: M 20, L 35, XL 25, XXL 10 = 90). | R1 | SRC | 19 |
| RGS-04 | ATP = sellable on-hand minus quantity on confirmed, un-invoiced sales orders (A-18). | R1 | ADD | 21, Rule 6 |
| PKG-01 | Packing dashboard: ready stock by design, category, colour, size, available quantity, packing status, packed and pending quantity. Packing is a status on stock and does not move it. | R1 | SRC/ADD⚑ | 20 |
| PKG-02 | Packing users cannot see purchase or costing data unless explicitly granted. | R1 | SRC | 20 |

### 4.11 SAL: Sales, invoicing, stock deduction (Source §21–24, §29)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| SAL-01 | Sales order. Header: number, date, customer, notes, status. Lines: design, category, colour, size, quantity, rate, discount, tax, amount. Statuses: Draft, Confirmed, Partially Invoiced, Invoiced, Cancelled. | R1 | SRC | 21 |
| SAL-02 | On confirm, check ATP per line and reject with a clear shortfall message. | R1 | SRC | 21 |
| SAL-03 | Selling rate defaults from the design. The customer's default discount applies automatically. Extra discount needs the permission and is capped by a per-role limit. | R1 | SRC | 22, 23 |
| SAL-04 | Invoice created from a confirmed sales order (fully or partly) or directly. | R1 | SRC | 23 |
| SAL-05 | Invoice contents: number, date, customer, address, product/design, category, quantity, rate, discount, tax, subtotal, final amount, payment status, notes. GST (⚑): HSN per line, place of supply, CGST+SGST or IGST split, tax rate from configurable rules, and a snapshot of customer name, address and GSTIN at time of invoice. | R1 | SRC/ADD⚑ | 23, App. B |
| SAL-06 | Invoice numbers are unique, sequential per financial year, gapless, at most 16 characters (example `INV/26-27/00001`). Cancelled numbers are never reused. | R1 | SRC/ADD | 35, App. B |
| SAL-07 | Confirming an invoice atomically deducts stock (FIFO lots) and records which lots were sold. Nothing reduces stock before the invoice is confirmed (Rules 6 and 7). | R1 | SRC | 24 |
| SAL-08 | Cancel a confirmed invoice: permission, reason, reverses the stock movement, keeps the number. Credit-note documents R2. | R1/R2 | SRC/ADD | 33 |
| SAL-09 | Payments: record receipts against invoices; status derived (Unpaid, Partial, Paid); pending-payments dashboard. Advances, allocations and credit-note offsets R2. | R1/R2 | ADD | 23, 26, 38 |
| SAL-10 | Sales return: pick invoice, product, quantity, reason. Stock goes to Ready (accepted) or Quarantine (damaged). Financial adjustment recorded. | R2 | SRC | 29 |
| SAL-11 | Backorder or negative stock for an admin-authorised sale. | R2 | SRC | 24 |

### 4.12 TRC: Traceability (Source §25)

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| TRC-01 | From an invoice line, lot, or design, walk back to job slip, factory, issued material lots, inward, purchase, supplier. | R1 | SRC | 25 |
| TRC-02 | The design screen shows its history: material purchases, jobs, receipts, cost, stock, sales. | R1 | SRC | 25 |
| TRC-03 | Traceability is at lot and job level, not per individual garment. Garments are counted, not serialised, so §25's "every finished garment" is reinterpreted (A-20). | R1 | ADD | 25 |

### 4.13 Audit, reports, dashboards, alerts, documents

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| AUD-01 | Append-only audit log: user, date, time, module, action, record ID, previous value, new value. Covers purchase edited, stock adjusted, selling price changed, invoice cancelled, job slip updated, quantity changed, and every other business-table change. | R1 | SRC | 33, Rule 10 |
| AUD-02 | Audit log searchable and exportable by admin. Nobody can delete entries through the application. | R1 | SRC | 33 |
| DSH-01 | Seven dashboards (Admin, Purchase, Raw Material, Design, Factory/Artisan, Packing, Sales) with the KPIs in §6.1. Core KPIs R1, advanced R2. | R1/R2 | SRC | 26 |
| RPT-01 | The reports in §6.2. R1 = the basic set marked there; R2 = the rest. | R1/R2 | SRC | 27 |
| RPT-02 | Export: CSV in R1, Excel in R2. Heavy reports must not block the rest of the application. | R1/R2 | SRC | 34, 47 |
| ALT-01 | Alerts in §6.3: in-app in R2; email and WhatsApp in R3. | R2/R3 | SRC | 32, 46 |
| DOC-01 | Printable invoice, job slip, material issue slip as print-optimised HTML. | R1 | ADD | 23, 42 |
| DOC-02 | PDF for purchase entry, material issue slip, job slip, production receipt, finished goods receipt, sales order, customer invoice. | R2 | SRC | 42 |

### 4.14 Cross-cutting

| ID | Requirement | Rel | Origin | Src § |
|---|---|---|---|---|
| XC-01 | Every list supports search, filters, sorting, pagination. Search keys: date, design number, material, category, factory, artisan, customer, supplier, job slip, invoice number, purchase number, stock status. | R1 | SRC | 34 |
| VAL-01 | Validate required fields, numeric quantities, negative quantities, duplicate design, invoice, and purchase numbers, stock availability, dates, rates, discounts. Critical transactions require confirmation before final submission. | R1 | SRC | 35 |
| UX-01 | Admin web app: responsive and desktop-first; clear navigation; role-specific dashboards; filtered tables; easy forms; confirmation dialogs for important actions; clear stock and status indicators; minimal clicks; consistent components; loading, empty, error, success states. Business usability over visual complexity. | R1 | SRC | 40 |
| UX-02 | Factory/artisan portal: mobile-first, simple, fast, large touch targets, only their own jobs and material, a separate app from the admin interface (no admin navigation and no admin code delivered to external users). | R1 | SRC | 41 |

---
## 5. Business rules and calculations

### 5.1 Business rules (Source §39, restated)

| ID | Rule | Src |
|---|---|---|
| BR-01 | Purchased material is not available stock until the inward is confirmed. | Rule 1 |
| BR-02 | Issuing material to a factory removes it from available warehouse stock and creates custody stock for that party. It is still company property and still counted, but it is not available. | Rule 2 |
| BR-03 | Receiving processed material calculates shortage automatically. | Rule 3 |
| BR-04 | Finished-garment receiving adds only the accepted quantity to ready stock. | Rule 4 |
| BR-05 | Costing uses the actual material, processing, and manufacturing data associated with the job. | Rule 5 |
| BR-06 | A sales order never changes stock. Only a confirmed invoice does. | Rule 6 |
| BR-07 | A confirmed sale reduces ready stock automatically, in the same transaction. | Rule 7 |
| BR-08 | Factory users can only see their own factory's data. | Rule 8 |
| BR-09 | Deleting or editing a transaction must never silently change inventory history. Nothing is deleted; documents are cancelled and their stock effect reversed with new entries. | Rule 9 |
| BR-10 | Important transactions are auditable. | Rule 10 |
| BR-11 | Confirmed documents are immutable apart from a short list of non-financial fields (notes, attachments). | ADD |
| BR-12 | A document's stock effect and the document's status change happen in one atomic transaction. Either both happen or neither. | ADD, §47 |
| BR-13 | Each charge is entered once, on exactly one document type (A-09). | ADD |
| BR-14 | A factory's declaration ("ready", "dispatched 95") is a claim, not stock. Only company confirmation of a receiving posts to the ledger. | ADD⚑ |

### 5.2 Stock model (replaces the formula in Source §7)

The PDF's formula is `Opening + Purchase/Inward − Issued − Consumed − Adjustments = Current`. It is wrong. Rule 2 already removes material from company stock at issue, so subtracting "Consumed" again would deduct the same metres twice, and the formula has no place for material sitting at a factory. Adjustments are also signed but the formula only subtracts them (A-01).

The corrected model treats stock as movements between **locations**. Every movement takes a quantity out of one location and puts it into another, so quantity is conserved and every figure the PDF wants falls out of a location balance.

| Event | From | To |
|---|---|---|
| Opening balance | Adjustment (virtual) | Warehouse |
| Inward | Supplier (virtual) | Warehouse |
| Issue to factory | Warehouse | Factory custody |
| Return from factory | Factory custody | Warehouse |
| Consumption (BOM × garments received) | Factory custody | Production (virtual) |
| Processing output | Production (virtual) | Warehouse |
| Production receipt (accepted) | Production (virtual) | Warehouse |
| Rejection (rejected or damaged) | Production (virtual) | Quarantine |
| Shortage write-off | Factory custody | Loss (virtual) |
| Adjustment in / out | Adjustment (virtual) | Any location, or the reverse |
| Sale | Warehouse | Customer (virtual) |
| Sales return, good / damaged | Customer (virtual) | Warehouse / Quarantine |
| Purchase return | Warehouse | Supplier (virtual) |

Derived figures:

- **Company-owned stock** = warehouse + custody + quarantine.
- **Available (raw)** = warehouse balance.
- **Material currently with factory / artisan** (Source §12) = that party's custody balance.
- **Available to promise (finished)** = warehouse balance of sellable goods − quantity on confirmed, un-invoiced sales orders.

Invariants the system must hold: no physical location is negative (STK-06); every row has a source document; ledger rows are never changed (STK-03); balances always equal the sum of ledger rows (STK-10).

### 5.3 Sales pricing, discount, and tax

**Rate resolution** on an order or invoice line: (1) a customer-specific price for the design on that date (R2); otherwise (2) the design's default selling rate on that date. Then the customer's default discount applies; a user may add more discount only with the permission and within their role's cap.

**Tax (`ADD⚑`).** The PDF says only "Tax if applicable". For an Indian garment seller the invoice has to carry a GST split and an HSN. The system must:

- choose **CGST + SGST** when the customer's state equals the company's state and **IGST** otherwise (place of supply);
- look up the rate from a data table of *HSN × value band × effective dates*, never from code. As of 22 Sep 2025 readymade garments are 5% up to ₹2,500 per piece and 18% above, decided on sale value per piece; before that the threshold was ₹1,000 with 12% above (Appendix B). Rates like this change, which is why they are data;
- round line tax to paise and the invoice total to the nearest rupee with a separate round-off line (configurable);
- snapshot the customer's name, address, and GSTIN onto the invoice so a later master-data edit cannot change a posted invoice.

Whether the value band is tested before or after discount is a question for the business's CA (Q2).

### 5.4 Shortage and material reconciliation

**Processing job** (Source §15):

```
Shortage      = Quantity Sent − Quantity Received
Shortage %    = Shortage ÷ Quantity Sent × 100        (guard: Sent = 0)
```

**Manufacturing job.** The PDF asks for "material consumed, remaining, shortage" without formulas. For each input item *i* on a job:

```
Required_i        = Garments × BOM_qty_i × (1 + allowance_i %)      (planning, DSN-05)
Pieces            = Accepted + Rejected + Damaged                   (all garments that consumed cloth)
Consumed_i        = Σ over variants ( Pieces_v × BOM_qty_i )        (standard consumption)
Shortage_i        = Issued_i − Returned_i − Consumed_i
Shortage %_i      = Shortage_i ÷ Issued_i × 100
Remaining_i       = Issued_i − Returned_i − Consumed_i − WrittenOff_i   (must be 0 to close)
Expected output   = Issued_i ÷ BOM_qty_i                            (PDF §16: 100 m ÷ 2 m = 50 pieces)
Garment shortfall = Expected pieces − Received pieces               (reported separately, not a material shortage)
```

A negative `Shortage_i` means the factory used less than standard, so the leftover must come back and is a flag. Shortage is compared with the tolerance from SHR-03. The PDF does not say who bears a shortage or a garment shortfall; until decided (Q5, Q9) both are absorbed in cost by the formula in §5.5 and reported.

### 5.5 Costing

```
Landed unit cost (lot)   = (Line amount + apportioned other charges) ÷ base-unit quantity
Material cost (job)      = Σ over issued lots ( (Issued − Returned) × lot unit cost )
Total production cost    = Material + Processing + Manufacturing + Other applicable
Cost per garment         = Total production cost ÷ Accepted garment quantity
Margin per garment       = Selling price − Cost per garment
Gross margin on a sale   = Net invoice value − Σ ( pieces sold × cost of the lot they came from )
```

- A processing job's output lot carries `(material cost + processing charges) ÷ quantity received`. When that fabric is issued to a garment job it is costed at that lot cost, so dyeing cost flows into garment cost automatically. The dyeing/processing line in the garment's cost breakdown is read from the lot's cost components.
- **Partial receipts.** Garments arrive over time but all material is issued up front, so the first receipt cannot carry the whole material bill. Provisional lot cost at each receipt = `(net material value issued to date ÷ expected pieces) + (charges recognised on this receipt ÷ accepted quantity of this receipt)`. On close, the final cost per piece is computed from the formula above; on-hand lots are revalued by the difference, and any difference on pieces already sold is reported as variance rather than restated (CST-08, `ADD⚑`). A simpler alternative, if the owner prefers, is to cost only at close and mark earlier lots "cost pending".
- **Precision.** Quantities 3 decimals; unit costs 4; money 2. No floating point anywhere.

### 5.6 The PDF's own numbers, checked

| Source | Input | Result |
|---|---|---|
| §9 requirement | 2 m per garment × 50 garments | 100 m |
| §15 shortage | 100 m sent, 95 m received | 5 m, 5% |
| §16 production | 100 m ÷ 2 m per garment; 47 made | 50 expected, difference 3 |
| §19 ready stock | M 20, L 35, XL 25, XXL 10 | 90 pieces |
| §24 deduction | 100 in stock, 25 sold | 75 |
| §48 | 95 received, 20 sold | 75 (but see A-28: the example's fabric quantities do not add up) |

---

## 6. Dashboards, reports, alerts

### 6.1 Dashboards (Source §26)

| Dashboard | KPIs |
|---|---|
| Admin | Total raw stock; total ready stock; material with factories; jobs in progress; pending jobs; production completed; sales; pending payments; low stock; shortage summary |
| Purchase | Recent purchases; pending inward; supplier-wise purchases; material purchased |
| Raw material | Current stock; material issued; material with factories; processed material; shortage; low stock |
| Design | Total designs; active designs; design-wise production; design-wise stock |
| Factory / artisan (own data only) | Assigned jobs; material received; pending jobs; completed jobs; expected production; actual production; returned products |
| Packing | Ready stock; pending packing; packed quantity; design-wise stock |
| Sales | Sales orders; recent sales; customers; available ready stock; billing; sales history |

### 6.2 Reports (Source §27). ● = R1 basic set, the rest R2

| Family | Reports |
|---|---|
| Purchase | Purchase history ●; supplier-wise ●; material-wise; date-wise |
| Inventory | Current raw stock ●; finished-product stock ●; stock movement (ledger) ●; material issued ●; material with factory ●; stock adjustments ●; stock valuation ● |
| Manufacturing | Factory-wise production; artisan-wise production; design-wise production; expected vs actual ●; pending jobs ●; completed jobs ● |
| Shortage | Material sent vs received ●; shortage quantity and % ●; factory-wise shortage; artisan-wise shortage |
| Costing | Design-wise cost ●; material, processing, manufacturing cost; cost per piece ●; selling price and margin ● |
| Sales | Customer-wise ●; design-wise; category-wise; quantity sold; revenue ●; discounts; payment status ● |
| Compliance (`ADD`) | Job-work ageing: material at each party by days since issue ● (R1); ITC-04 support report (R2) |

Filters on every report: date range, design, material, category, factory/artisan, customer, supplier. Export CSV (R1), Excel (R2).

### 6.3 Alerts (Source §32)

| Alert | Trigger (proposed) | Config needed |
|---|---|---|
| Low raw-material stock | Warehouse balance ≤ item minimum level | Minimum level per item |
| Low ready stock | Sellable balance ≤ design-variant minimum | Minimum level per design variant |
| Pending factory jobs | Job not closed after N days | N |
| Overdue jobs | Expected completion date passed, job not closed | none |
| Material pending with factory | Custody balance > 0 for a job older than N days | N |
| Finished goods received | Receipt confirmed | none (informational) |
| High shortage % | Shortage % > tolerance | Tolerance (SHR-03) |
| Pending purchase inward | Confirmed purchase not received after N days | N |
| Pending sales orders | Confirmed order not invoiced after N days | N |
| Payment pending | Invoice unpaid past customer's payment terms | Payment terms |

---

## 7. Non-functional requirements (Source §35, §36, §43, §47)

The PDF's non-functional section says "load quickly", "optimized", "future growth" without numbers. Those cannot be tested. Below, the source intent is kept and numbers are proposed (`ADD⚑`); adjust them, but do not leave them blank.

| ID | Area | Requirement |
|---|---|---|
| NFR-01 | Performance | p95 latency under 300 ms for paginated lists and single-record reads; dashboards under 2 s; a posting transaction (issue, receipt, invoice confirm) under 1 s. Lists over 50 rows are paginated. Reports slower than 5 s run as background jobs and are delivered as downloads, so they never block other users. |
| NFR-02 | Reliability | Every stock-affecting action is one database transaction (BR-12). Retries are safe (idempotent), because mobile networks drop requests and users double-tap. Inventory never silently becomes inconsistent: nightly reconciliation (STK-10). |
| NFR-03 | Availability and recovery | 99.5% during business hours. Automatic backups with point-in-time recovery. Recovery point ≤ 15 minutes, recovery time ≤ 4 hours. A restore is rehearsed each quarter; a backup that has never been restored is not a backup. |
| NFR-04 | Security | Everything in §4.1. TLS everywhere. Rate limiting. Security headers. Safe file upload (type, size, storage outside the web root). Dependency scanning. A security test that specifically tries Factory A reading Factory B before go-live. No secrets in source (AUTH-09). |
| NFR-05 | Scalability | Designed for ~10× today's assumed volume (≈ 5,000 ledger rows a day, ≈ 250 users) without redesign. Growth axes named in the PDF: users, products, designs, factories, transactions, customers, inventory. |
| NFR-06 | Integrity | Foreign keys everywhere; constraints in the database, not only in code; append-only ledger and audit log enforced by the database. |
| NFR-07 | Maintainability | Modular architecture, clear API structure, environment-based configuration, uniform error handling, automated tests, versioned migrations. |
| NFR-08 | Data protection | Customer and artisan personal data (names, mobiles, addresses) is held. Collect the minimum, restrict by role, log access to exports. Confirm obligations under India's data-protection law with counsel. |
| NFR-09 | Usability | Latest two versions of Chrome, Edge, Safari; Android Chrome for the factory portal. Touch targets at least 44 px on the portal. WCAG 2.1 AA as a target on the portal. |
| NFR-10 | Localisation | Dates DD-MM-YYYY. INR with lakh/crore grouping (en-IN). All UI text in translation catalogues from day one so a regional language can be added without a rewrite (Q6). |
| NFR-11 | Observability | Structured logs with a request ID on every line, error tracking, health endpoints, and alerts on failed jobs and reconciliation drift. |

---
## 8. Analysis of the source PRD

**Verdict.** The PDF is a strong workflow narrative with complete field lists for most screens. It is weak where builds go wrong: rules, formulas, state definitions, and scope. Left as written it would produce rework in five places, listed first. Everything below is either resolved in this PRD (column "Resolution") or marked as an owner decision in §11.

**The five that hurt most if ignored:** A-01 (the stock formula double-deducts), A-09 (costing basis undefined and charge fields overlap), A-10 (no size/colour at receiving although stock needs it), A-12 (processing is a material transformation, not a status), A-19 (India GST job-work and invoicing rules are absent).

Severity: **Blocker** = build cannot start correctly without a decision; **High** = likely rework; **Medium** = wrong or confusing behaviour; **Low** = polish.

| ID | Sev | Type | Src § | Finding | Resolution |
|---|---|---|---|---|---|
| A-01 | High | Defect | 7, 39 | Stock formula subtracts both "Material Issued" and "Material Consumed" from company stock. Rule 2 already removes issued material at issue, so consumption is deducted twice. "Adjustments" are only subtracted although they can be positive. There is no place for material at a factory. | Location-based model (§5.2). Consumption is drawn from the factory's custody, not the warehouse. Adjustments are signed. |
| A-02 | High | Contradiction | 44, 50 | The "MVP" has 22 items and is effectively the whole product. It also disagrees with the priority list: Raw material inward, Admin dashboard, Processing/dyeing tracking and Shortage calculation are in §44 but in neither P0 nor P1 of §50; P0 contains "Database", which is not a feature; and Audit logs are P1 although Rules 9 and 10 require them from day one. | Re-cut in §9. Audit is a foundation item. |
| A-03 | High | Contradiction | 18, 22, 23, 45, 48 | Customer-specific pricing and discount rules are Phase 2 in §45, yet §18 shows "applicable customer-specific price", §22 stores discount rules, §23 lets users apply customer discounts, and §48 step 20 applies a customer discount. | R1 has a per-customer default discount and per-line discount. Price lists and advanced pricing rules stay R2. |
| A-04 | Medium | Contradiction | 23, 26, 32, 38, 45 | Invoices carry "Payment Status", the Admin dashboard shows "Pending Payments", alerts include "Payment pending", and §38 has a Payments entity, but "Payment management" is Phase 2. Without payments the status is a manual label that will be wrong. | Minimal payments in R1 (SAL-09); full payment management R2. |
| A-05 | Medium | Contradiction | 26, 32, 46 | Dashboards and alerts show "Low Stock" but there is no reorder-level field; "Automated reorder levels" is Phase 3. | Manual minimum level per item in R1 (STK-08). Automation R3. |
| A-06 | Medium | Contradiction | 23, 42, 45 | Invoices and job slips must be printed for daily operation, but "PDF documents" are Phase 2. | R1 print-ready HTML (DOC-01). PDF R2 (DOC-02). |
| A-07 | Medium | Defect | 5, 28, 39 | The ledger lists "Purchase" as a stock transaction type. Rule 1 says a purchase is not stock until inward. Missing types: purchase return, transfer, reversal, opening, write-off, rejection. | Purchase is not a movement. Type list corrected (STK-02). |
| A-08 | Medium | Contradiction | 6, 7, 19, 37, 45 | Multiple locations are Phase 2, but inward, raw stock, and ready stock all already carry "Location". Adding location later means rewriting every stock table. | Location is in the schema from R1 (MST-06). Multi-warehouse screens R2. |
| A-09 | High | Gap | 13, 14, 17, 18 | Costing never says which purchase rate is used when the same fabric was bought at several rates, whether shortage and rejected garments are absorbed, or what "Other Charges" means. Charges appear in four places (Job Slip "Manufacturing Charges", Receiving "Manufacturing Charges" and "Other Charges", Processing "Processing charges", and Costing's Artisan, Factory, Job-work, Other): that invites double counting, and it is unclear whether a charge is per piece or a lump sum. | Actual-lot costing (§5.5, CST-02). Job slip holds the *agreed rate and basis*; receipts hold the *actual charge*; each charge exists once (BR-13). Basis is per piece, per metre, or lump sum (JOB-02). |
| A-10 | High | Gap | 16, 17, 19 | Expected and received production are single numbers, but ready stock is by colour and size. The receiving form has no size or colour breakdown, so ready stock cannot be filled from it. | Quantities are entered per design variant at expectation and at receiving (JOB-01, JOB-09). |
| A-11 | High | Gap | 11, 48 | The factory portal is described as a read-only dashboard, yet §48 step 10 has the factory "receive" material. What a factory user can *do* is never defined. | Acknowledge material, mark In Process / Ready, declare dispatch quantity; company staff confirm the actual receiving (JOB-06, JOB-14, BR-14). Owner to confirm (Q3). |
| A-12 | High | Gap | 13, 14 | Dyeing is drawn as a status flow (Raw → Sent → Processed → Received back), but it changes the item: raw dupatta cloth becomes printed dupatta cloth. The PDF never says what the output item is, where it goes next (back to the warehouse, or straight to the stitching factory), or how a processing entry relates to a job slip. | Processing is a conversion job with an input item and an output item (JOB-08). Output lands in the warehouse as a processed material variant, carrying its own cost (CST-05). |
| A-13 | High | Gap | 38, 48 | The 34-entity list is missing: production requirement (used in §48), unit of measure, colour, size, design variant, lot, location balance, processing type, cost sheet, tax/HSN rules, number series, settings, attachments, stock reservation, quarantine. Several list items are ambiguous ("Finished Products" versus "Finished Stock"; "Selling Prices"). | Full entity mapping in `tech.md` Appendix A. |
| A-14 | High | Gap | 7 | The stock formula starts at "Opening Stock" but there is no way to enter it, and the stated goal is to replace registers and spreadsheets. Go-live is impossible without loading current stock and open jobs. | Opening-balance import and CSV master import (MST-11). |
| A-15 | Medium | Ambiguity | 5, 6, 12 | Quantity, Unit and Meter Quantity are three separate fields with no conversion rule; "Rate per Meter / Unit" is likewise ambiguous. | One base unit per material, explicit conversion per material (MST-04, PUR-03). |
| A-16 | Medium | Gap | 15, 16, 32 | Shortage is defined only for a processing job. The manufacturing module lists "material consumed, remaining, shortage" with no formula. There is no tolerance, so "high shortage percentage" cannot be evaluated. A shortfall in garments (100 planned, 95 received) has no treatment. | Formulas in §5.4; tolerance configurable (SHR-03); garment shortfall reported separately. |
| A-17 | Medium | Gap | 17, 29 | Rejected and damaged garments at receiving have no stated destination. Sales returns get a "separate damaged/rejected stock category" but receiving does not. Rework, write-off, and charge-back are not addressed. | Quarantine location for both (JOB-10). Rework and charge-back decided in Q9. |
| A-18 | Medium | Gap | 21, 39 | Order confirmation checks stock, but Rule 6 says orders do not reduce stock. Two confirmed orders can each pass the check against the same 20 pieces. | ATP with derived reservations (RGS-04, SAL-02). |
| A-19 | High | Compliance | 22, 23, 12 | "Tax if applicable" and "GST Number if applicable" are the only tax content. For an Indian business, goods sent for job work need a delivery challan and a return-within-time discipline (one year for inputs; deemed supply and ITC reversal if missed) plus periodic ITC-04 reporting, and invoices need HSN, place of supply, a CGST/SGST/IGST split, GST-compliant sequential numbering of at most 16 characters, and a rate that depends on per-piece value (changed on 22 Sep 2025). | Data capture and tax computation in R1 (SAL-05, SAL-06, MST-10); challan-grade fields on material issue; job-work ageing report R1; ITC-04 report R2. Details and sources in Appendix B. Needs the business's CA (Q2). |
| A-20 | Medium | Gap | 6, 25 | §25 promises tracing of "every finished garment". Garments are counted, not serialised, and batch/lot on inward is optional, so tracing would stop at the first blank lot. Sales do not say which received lot they consume. | Lot and job level traceability (TRC-03). Lots auto-created when blank (INW-02). Sales consume identified lots FIFO and store the allocation (SAL-07). |
| A-21 | Medium | Gap | 8, 9, 18 | The design has three hard-coded fabric fields (Top, Bottom, Dupatta) but costing includes "Other Material Cost" (lining, buttons, lace). "Product Category" and "Product Type" are both listed and never distinguished. Consumption is one number per design although larger sizes use more cloth. | Generic BOM lines (DSN-03). Category = kind of garment (Kurti Set); Type = its construction (for example 2-piece / 3-piece), confirmed in Q11. Size-wise consumption R2 (DSN-07, Q12). |
| A-22 | Medium | Ambiguity | 20 | Packing shows "packing status", "packed quantity", "pending quantity" but does not say whether packing moves stock, or whether unpacked goods can be sold. | Packing is a status on stock and does not move it (PKG-01). Whether packing gates sales is Q4. |
| A-23 | Medium | Gap | 3, 4, 11, 20, 36 | Nine roles exist but no permission matrix. "Unless explicitly permitted" appears for Packing and Factory, implying per-user grants that a role-only model cannot express. Field-level hiding of cost is required but not specified. | Proposed matrix (§2.2); permission keys with user overrides (AUTH-04); field-level omission (AUTH-07). |
| A-24 | Medium | Gap | 47 | Performance and scalability are stated as "quickly", "optimized", "future growth". Untestable. | Measurable targets (§7), flagged as proposals. |
| A-25 | Low | Gap | 31, 23 | "Approval if required" (adjustments) and "Authorized users can apply discounts" have no thresholds or approver. | Configurable thresholds and per-role caps; approver is Super Admin by default (Q7). |
| A-26 | Low | Gap | none | Job-work charges are owed to factories and artisans, yet the PDF has no payable side: nothing records what is owed or paid to a party. | Statement of charges payable R2 (JOB-15); payments to parties R3. Q8. |
| A-27 | Low | Ambiguity | 10, 11 | "Each factory/artisan will have a unique account." Read literally a factory with three staff shares one login. | Many users per party (§2.3). |
| A-28 | Low | Defect | 48 | The worked example does not reconcile. It buys 500 m of fabric, but D-100 needs 2 + 2 + 2.5 = 6.5 m per garment, so 100 garments need 650 m across three fabrics. The system's own stock check would block step 9 as written. | §10 rebuilds the example with fixtures that reconcile. |
| A-29 | Low | Gap | 40, 41 | Factory and artisan users are described as mobile users, but the language of the interface is never mentioned. Many artisans work in a regional language. | i18n-ready UI (NFR-10); languages decided in Q6. |
| A-30 | Low | Gap | 44 | No data migration or rollout plan: no parallel run, training, or cutover, although success (§49) depends on retiring the manual registers. | `plan.md` Phase 10. Success criterion S5. |

---

## 9. Scope and releases (re-cut of Source §44–§46, §50)

### 9.1 What changes and why

| Item | PDF | This PRD | Why |
|---|---|---|---|
| Audit log | P1 | R1, built first | Rules 9 and 10 apply to the first transaction. Retrofitting an audit trail is costly and leaves gaps. |
| Payments | Phase 2 | Minimal in R1, full in R2 | Payment status and "pending payments" are in the MVP (A-04). |
| Customer discount | MVP by implication, Phase 2 by list | Default discount and line discount R1; price lists R2 | A-03. |
| Minimum stock level | Auto reorder Phase 3 | Manual level R1, automation R3 | Low-stock indicators are in R1 dashboards (A-05). |
| Printing | PDF Phase 2 | Print-ready HTML R1, PDF R2 | Operations need paper on day one (A-06). |
| Locations | Phase 2 | Schema R1, screens R2 | Avoids rewriting stock tables (A-08). |
| Opening stock and CSV import | absent | R1 | Go-live prerequisite (A-14). |
| Invoice cancellation | unspecified | R1 | Errors will happen on day one; the alternative is deleting. Credit notes R2. |
| Negative/backorder sale | "must prevent … unless admin allows" | Block in R1; admin override R2 | The prevention is the requirement; the override is an exception that adds ledger complexity. |
| Alerts | Phase 2 | In-app R2, email/WhatsApp R3 | Unchanged from the PDF. |
| Sales and purchase returns | Phase 2 | Unchanged R2; ledger types defined R1 | Avoids a ledger migration later. |

### 9.2 Release contents

**R1: first production release.** AUTH, MST, PUR, INW, STK, DSN, JOB (including processing), SHR, CST, RGS/PKG, SAL (orders, GST invoices, stock deduction, minimal payments, invoice cancel), TRC, AUD, basic reports and core dashboards, print-ready documents, admin web app, factory portal, CSV import, and opening-stock load. Everything on the PDF's MVP list, with the corrections above.

**R2: PDF Phase 2.** Sales and purchase returns and credit notes, full payment management, PDF documents, in-app notifications, advanced reports and dashboards, multi-warehouse and transfers, customer-specific price lists and advanced pricing rules, size-wise consumption, negative/backorder override, self-service password reset and admin 2FA, ITC-04 report, job-work charges statement, better mobile experience.

**R3: PDF Phase 3.** Barcode/QR, WhatsApp and email notifications, automated purchase suggestions and reorder levels, demand forecasting, production planning, profitability analytics, supplier and factory performance analytics, accounting/GST integrations, native mobile app, third-party APIs, payments to parties and charge-backs.

---

## 10. Acceptance scenario (Source §48, corrected)

This scenario is the release gate for R1. It is implemented as an automated test in `tech.md` §14 and is the exit criterion of `plan.md` Phase 6. It reuses the PDF's story with numbers that reconcile (A-28). Rates and prices below are illustrative fixtures, not business data.

**Fixtures.** Supplier S1. Materials: *Cotton Fabric - Blue* (used for top and bottom) and *Printed Fabric - Blue* (dupatta). Design D-100, category Kurti Set, colour Blue, sizes M and L. BOM: top 2.0 m, bottom 2.0 m (both cotton), dupatta 2.5 m (printed). Default selling rate ₹1,400. Customer C1 in the same state as the company with a 5% default discount. Factory A and Factory B, each with one user. Manufacturing charge ₹80 per accepted piece.

| # | Action | Expected result |
|---|---|---|
| 1 | Purchase P1: 500 m Cotton Blue at ₹120/m. Purchase P2: 300 m Printed Blue at ₹150/m. Confirm both. | Purchases confirmed. **Raw stock is still 0** (BR-01). Both show as pending inward. |
| 2 | Inward for P1 (500 m) and P2 (300 m), confirmed. | Raw stock: cotton 500 m, printed 300 m. Lots created with unit costs ₹120 and ₹150. Pending inward empty. |
| 3 | Create production requirement for 100 garments of D-100 (M 40, L 60). | Requirement calculated automatically: cotton 400 m (top 200 + bottom 200), printed 250 m. Stock check passes. |
| 4 | Create job slip J1 for Factory A: type Manufacturing, per-piece ₹80, expected completion date set. | J1 status Created. |
| 5 | Issue to J1: cotton 400 m, printed 250 m. | Warehouse: cotton 100 m, printed 50 m. Factory A custody: 400 m / 250 m. J1 status Material Issued. Trying to issue 200 m more cotton fails with an insufficient-stock error. |
| 6 | Log in as Factory A. | Sees only J1, the 400 m / 250 m received, D-100 instructions, expected production. Does not see rates, costs, purchases, or any other party. Requesting Factory B's job by ID returns not found. |
| 7 | Factory A acknowledges the material, marks J1 In Process, then Ready, declaring 95 pieces. | Statuses update. **Stock unchanged** (BR-14). |
| 8 | Production confirms receiving R1 on J1: expected 100, received 95, accepted 95, rejected 0, damaged 0 (M 38, L 57), manufacturing charges ₹7,600 (95 × ₹80). | Ready stock: D-100 Blue M 38, L 57 = 95. Consumption posted from custody: cotton 380 m, printed 237.5 m. J1 status Partially Received. Difference recorded: 5 pieces. |
| 9 | Short-close J1 with reason "factory could not complete the last 5". | J1 status Received. |
| 10 | Reconciliation for J1. | Cotton: issued 400, consumed 380, shortage 20 m (5.0%). Printed: issued 250, consumed 237.5, shortage 12.5 m (5.0%). Custody still holds 20 m and 12.5 m; close is blocked. |
| 11a | **Path A.** Write the residual off as shortage (reason recorded), then close J1. | Custody 0. Total cost = 48,000 + 37,500 + 7,600 = **₹93,100**; cost per piece = ₹93,100 ÷ 95 = **₹980.00**. |
| 11b | **Path B** (alternative run). Factory returns the 20 m and 12.5 m, then close. | Warehouse gets the metres back in their original lots. Material cost = 380 × 120 + 237.5 × 150 = 81,225; total = 88,825; cost per piece **₹935.00**. |
| 12 | Continue with Path A. Sales user creates a sales order for C1: D-100 Blue L × 20. | Rate ₹1,400 and 5% customer discount auto-populate. Order confirms. ATP falls 95 → 75 but **on-hand stays 95** (BR-06). |
| 13 | Generate the invoice from the order and confirm it. | Number `INV/26-27/00001`. Taxable ₹26,600 (20 × 1,400 − 5%). Unit taxable value ₹1,330 is at or below ₹2,500 so GST 5% = ₹1,330 (CGST 665 + SGST 665). Total **₹27,930**. Ledger Sale of 20 L from the L lot. Ready stock **75**. |
| 14 | Margin. | COGS = 20 × ₹980 = ₹19,600. Gross margin = 26,600 − 19,600 = **₹7,000** (26.3%). |
| 15 | Trace the invoice line. | Invoice → L lot → J1 → issued cotton and printed lots → inwards → P1 and P2 → S1, in one call. |
| 16 | Try to cancel P1. | Blocked: inward exists. |
| 17 | Cancel the invoice with a reason. | Reversal entries; ready stock back to 95; number 00001 stays used; next invoice is 00002. |
| 18 | Attempt to change or delete a ledger row using the application's database account. | Rejected by the database. |
| 19 | Sell 1,000 pieces. | Blocked with a shortfall message. |
| 20 | Read the audit log. | Entries exist for steps 1 to 17 with user, time, module, record, previous and new values. |

---

## 11. Open decisions for the owner

Each item has a default that this PRD and `tech.md` already assume, so work is not blocked. "Needed by" is the `plan.md` phase that would be built on the wrong assumption.

| # | Question | Default assumed | Needed by |
|---|---|---|---|
| Q1 | Costing basis: actual cost by lot (FIFO) or moving weighted average? | Actual lot cost, FIFO (matches "actual data", Rule 5, and gives traceability) | Phase 2 |
| Q2 | GST scope: does the system compute GST on invoices and produce challan-grade issue slips, or hand invoicing to accounting software? And is the rate band tested before or after discount? Ask your CA. | System computes GST; material issue slip doubles as delivery challan; ITC-04 report in R2 | Phase 6 (data capture from Phase 1) |
| Q3 | What may a factory do in the portal? | Acknowledge, In Process, Ready, declare dispatch; never post stock | Phase 4 |
| Q4 | Must goods be packed before they can be sold? | No. Packing is a status only | Phase 5 |
| Q5 | Who bears material shortage and garment shortfall, and at what tolerance? | Absorbed in cost, reported; no tolerance until set | Phase 4 |
| Q6 | Interface languages for the factory and artisan portal (English, Hindi, Gujarati, ...)? | English at launch, text catalogues ready for more | Phase 9 (design from Phase 8) |
| Q7 | Approval thresholds: stock adjustments, discounts, write-offs, invoice cancellation. | Super Admin approves; thresholds zero (everything needs approval) until set | Phase 2 |
| Q8 | Job-work charge basis and payables: per piece on accepted, received, or issued quantity? Is payment to artisans in scope? | Per piece on accepted quantity; statement only (R2), payments R3 | Phase 4 |
| Q9 | Rejected and damaged garments: rework, write-off, or charge-back to the factory? | Quarantine only, visible; decision manual | Phase 4 |
| Q10 | Accept the technology choices in `tech.md` §2, and who builds? | As written | Phase 0 |
| Q11 | Difference between Product Category and Product Type. | Category = garment kind, Type = construction | Phase 3 |
| Q12 | Is size-wise fabric consumption needed at launch? | No (R2) | Phase 3 |
| Q13 | Migration depth: opening balances only, or also open jobs, open purchases, unpaid invoices? | Opening stock, open jobs, unpaid invoices | Phase 10 (plan from Phase 2) |
| Q14 | Hosting region, budget ceiling, and who operates production? | Managed cloud in an India region, small budget | Phase 0 |

---

## Appendix A. Coverage: every source section mapped

| Src § | Title | Covered by |
|---|---|---|
| §1 | Product overview | §1, §3.1 |
| §2 | Core objectives | §1.3 |
| §3 | User roles | §2 |
| §4 | Super admin / owner | §2, AUTH-03, AUTH-04, AUD-02 |
| §5 | Purchase module | PUR-01 to PUR-08, MST-01 to MST-04 |
| §6 | Raw material inward | INW-01 to INW-05 |
| §7 | Raw material inventory | STK-01 to STK-10, §5.2 |
| §8 | Design management | DSN-01, DSN-02, DSN-06, MST-05 |
| §9 | Design-material mapping | DSN-03 to DSN-05, DSN-07 |
| §10 | Artisan / factory management | MST-07 |
| §11 | Factory / artisan portal | AUTH-06, AUTH-07, JOB-06, JOB-14, UX-02 |
| §12 | Material issue | JOB-04 to JOB-07 |
| §13 | Job slip | JOB-02, JOB-03, JOB-12 |
| §14 | Processing / dyeing | JOB-08, MST-09, CST-05 |
| §15 | Shortage / wastage | SHR-01 to SHR-04, §5.4 |
| §16 | Manufacturing | JOB-01, JOB-11, §5.4 |
| §17 | Finished product receiving | JOB-09, JOB-10 |
| §18 | Garment costing | CST-01 to CST-08, §5.5 |
| §19 | Ready garment stock | RGS-01 to RGS-04 |
| §20 | Packing department | PKG-01, PKG-02 |
| §21 | Sales order | SAL-01, SAL-02 |
| §22 | Customer management | MST-08, SAL-03 |
| §23 | Billing / invoice | SAL-04 to SAL-06, SAL-09, DOC-01 |
| §24 | Automatic stock deduction | SAL-07, SAL-11, STK-06 |
| §25 | Product traceability | TRC-01 to TRC-03 |
| §26 | Dashboards | DSH-01, §6.1 |
| §27 | Reports | RPT-01, RPT-02, §6.2 |
| §28 | Stock transaction ledger | STK-01 to STK-03, §5.2 |
| §29 | Sales return | SAL-10 |
| §30 | Purchase return | PUR-08 |
| §31 | Inventory adjustment | STK-05 |
| §32 | Notifications / alerts | ALT-01, §6.3, SHR-03 |
| §33 | Audit log | AUD-01, AUD-02 |
| §34 | Search and filtering | XC-01, RPT-02 |
| §35 | Data validation | VAL-01, PUR-02, SAL-06 |
| §36 | Security | AUTH-01 to AUTH-09, NFR-04 |
| §37 | Multi-location support | MST-06, STK-11 |
| §38 | Database requirements | `tech.md` Appendix A, A-13 |
| §39 | Core business rules | BR-01 to BR-14 |
| §40 | User experience | UX-01 |
| §41 | Mobile / factory experience | UX-02 |
| §42 | Documents | DOC-01, DOC-02, JOB-05 |
| §43 | Backup and data safety | NFR-03, AUTH-09 |
| §44 | MVP scope | §9, A-02 |
| §45 | Phase 2 | §9.2 (R2) |
| §46 | Phase 3 | §9.2 (R3) |
| §47 | Non-functional requirements | §7 |
| §48 | Complete end-to-end example | §10, A-28 |
| §49 | Success criteria | §1.5 |
| §50 | Development priority | §9, A-02 |
| §51 | Final product principle | §1.2 |

---

## Appendix B. Indian compliance notes (for the CA to confirm)

These were gathered from secondary sources during this analysis, not from primary legal text. Treat them as prompts for the conversation with your CA, not as tax advice. Everything here is designed to be configuration and data capture, so a correction from the CA is a settings change rather than a rewrite.

1. **GST rate on readymade garments.** Effective 22 Sep 2025: 5% where the sale value per piece is up to ₹2,500 and 18% above; before that it was 5% up to ₹1,000 and 12% above. Applies to HSN chapters 61 and 62. Source: [Busy: GST on Readymade Clothes](https://busy.in/gst-rates/readymade-clothes/). *Design consequence:* tax rules are effective-dated rows keyed by HSN and value band (MST-10).
2. **Goods sent for job work.** A delivery challan is required for goods sent to a job worker (CGST Rule 55: serial number, date, names, addresses, GSTINs of both parties, item description). Inputs are to be received back within one year and capital goods within three; otherwise the movement is treated as a supply by the principal on the original dispatch date, with GST and interest, and input tax credit already claimed is reversed. ITC-04 is filed periodically; one source states half-yearly above ₹5 crore turnover and annually otherwise, so confirm the current frequency. Source: [Tally: Job work under GST](https://tallysolutions.com/gst/job-work-transactions-under-gst/). *Design consequence:* the material issue carries challan-grade fields; the system tracks days since issue per party and lot (§6.2 ageing report); an ITC-04 support report is R2.
3. **Invoice numbering.** Serial number of at most 16 characters (letters, digits, hyphen, slash), unique within a financial year and sequential; separate series per branch or document type are allowed. Source: [Gimbooks: Invoice numbering rules under GST](https://www.gimbooks.com/blog/invoice-numbering-rules-under-gst/). *Design consequence:* gapless per-year series allocated transactionally (SAL-06), example `INV/26-27/00001` (15 characters).
4. **Not verified here:** e-invoicing turnover thresholds, e-way bill rules for goods sent to factories, and the treatment of shortage under job work. Ask the CA.


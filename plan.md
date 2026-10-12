# Delivery Plan: Garment ERP (phase-wise, backend first)

| | |
|---|---|
| **Document** | Phase-wise delivery plan |
| **Version** | 1.0 |
| **Date** | 24 Sep 2026 |
| **Status** | Draft for owner review |
| **Inputs** | `prd.md` v1.1 (requirement IDs), `tech.md` v1.0 (design and decisions `T-nn`, invariants `I-n`) |

---

## 1. Summary

The plan builds the **entire backend first**, proves it with an automated end-to-end scenario, passes a **Backend Gate**, and only then builds the two frontends. Backend phases are ordered by dependency: the things that are hard to change later (the stock ledger, costing, and security) come before the things that sit on top of them (sales, reports, screens).

**Estimate.** About 44 working weeks for one experienced full-stack developer, with a realistic range of 36 to 52. These are planning estimates, not commitments. Two developers, or a second developer joining for the frontend, shortens the calendar; §6 shows where. Each phase estimate below includes writing its tests and documentation, because in this system the tests are most of the value.

| Phase | Name | Weeks | Ends at week | Type |
|---|---|---|---|---|
| 0 | Foundations | 2 | 2 | Backend |
| 1 | Identity, master data, party isolation | 3 | 5 | Backend |
| 2 | Stock engine, purchase, inward | 4 | 9 | Backend |
| 3 | Design, BOM, production requirement | 2 | 11 | Backend |
| 4 | Job work (issue, slips, processing, receiving, shortage) | 6 | 17 | Backend |
| 5 | Costing and ready stock | 2 | 19 | Backend |
| 6 | Sales, GST invoicing, payments | 4 | 23 | Backend |
| 7 | Reporting, dashboards, hardening | 3 | 26 | Backend |
| **Gate** | **Backend Gate** | 0 | **26** | Milestone |
| 8 | Admin web app | 8 | 34 | Frontend |
| 9 | Factory and artisan portal (PWA) | 4 | 38 | Frontend |
| 10 | UAT, data migration, parallel run, go-live | 6 | 44 | Launch |
| 11 | Release 2 (PDF Phase 2) | about 16 | after launch | Post-launch |
| 12 | Release 3 (PDF Phase 3) | backlog | after R2 | Post-launch |

```
Week  0        10        20        26        34        38        44
      |---P0-P1--|---P2-P3--|---P4-----|-P5-P6-P7-|==GATE==|---P8 Admin---|-P9-|---P10 go-live---|
      foundations  stock+design  job work   costing/sales/    frontend                 UAT + parallel
                                            reports/harden                              run
```

---

## 2. Ground rules

**Estimation basis.** One experienced full-stack developer, working weeks not calendar weeks, AI-assisted coding assumed for boilerplate, not for design or review. Owner availability of one hour a week for the demo and decisions is assumed.

**Definition of Done, for every feature:**

1. Code merged with review.
2. Automated tests, including a test for every business rule it touches.
3. Migration written and applied on `staging`.
4. OpenAPI document updated and regenerated without drift.
5. Permission keys defined, seeded, and covered by the permission-matrix test.
6. Audit rows verified for its writes.
7. If it posts stock, invariants I-1 to I-9 pass after its tests.
8. Runbook or documentation updated if it changes operations.

**Phase gate.** A phase is finished only when every exit criterion is green, the owner has seen the demo, and the decisions listed for the next phase (§4) are recorded. Unfinished work does not roll silently into the next phase; it is re-planned.

**Change control.** New requests go to the backlog tagged R1, R2, or R3. Anything that changes R1 scope needs the owner's approval and a plan update. The scenario in `prd.md` §10 is the definition of R1 behaviour.

**Never cut.** Ledger integrity, the audit trail, party isolation, and the scenario tests. §8 lists what may be cut if time slips.

---

## 3. Backend first, and how its risk is managed

Building the backend first is the right order for this product: the stock ledger, costing, and isolation are what fail expensively if wrong, and a frontend built against an unstable backend is rebuilt. The cost is that nobody clicks through real screens for about six months, so a misunderstanding of the workflow could survive that long. The plan counters this directly:

1. **The scenario grows every phase.** By the end of Phase 2 steps 1 and 2 of `prd.md` §10 are automated; by Phase 4, steps 1 to 11; by Phase 6, all twenty. The owner can watch the business flow work, in numbers, long before any screen exists.
2. **A demo at every gate.** Each phase ends with a scripted walkthrough using Swagger UI or the generated Postman collection against `staging`, on a seeded demo dataset. The owner performs the steps, not just watches.
3. **Wireframes in parallel.** Screen design for the admin app and the portal happens during Phases 4 to 7 as design work, with real users reviewing paper or clickable mock-ups. It costs no backend time and de-risks Phases 8 and 9.
4. **Optional throwaway UI.** If the owner wants to click through data earlier, a disposable internal-tool front end (a low-code tool pointed at the admin API) can be stood up from Phase 4. It is not part of the product and is discarded.
5. **Overlap if a second developer is available.** Once a module's contract is frozen at its gate, its screens can start. This is the main lever for compressing the calendar (§6).

**What "Backend Gate" means.** All R1 backend requirements are implemented, or explicitly deferred with the owner's written approval; the §10 scenario is green in CI; invariants I-1 to I-10 pass; the isolation and leak suites pass; load targets are met; a restore drill has been performed; the OpenAPI v1 document is frozen. Full criteria are at the end of Phase 7.

---

## 4. Decisions needed before each phase

From `prd.md` §11. Each has a default so the build can start, but building on a default that is later reversed costs rework, so the owner should confirm before the phase begins.

| Phase | Decisions to close before it starts |
|---|---|
| 0 | Q10 stack and who builds; Q14 hosting region, budget, operator, retention |
| 1 | Q2 (at least: capture GSTIN, HSN, and state fields); Q7 approval thresholds (draft) |
| 2 | **Q1 costing basis** (lot-actual FIFO or weighted average); Q7 thresholds for stock adjustments |
| 3 | Q11 category versus type; Q12 size-wise consumption |
| 4 | Q3 portal write actions; Q5 shortage tolerance and who bears it; Q8 charge basis and payables; Q9 rejected and damaged goods |
| 5 | Q4 does packing gate sales |
| 6 | **Q2 final**: GST scope and value basis, with the CA's review of the worked examples |
| 8 | Q6 portal languages (design implication); wireframe sign-off |
| 10 | Q13 migration depth |

---

## 5. Phases

### Phase 0: Foundations (2 weeks)

**Goal.** A walking skeleton carrying every platform concern the rest of the system depends on.

**Scope.** AUTH-01, AUTH-02, AUTH-05, AUTH-09, AUD-01 (infrastructure), NFR-11, `T-01` to `T-16`, numbering, idempotency, error model.

**Work**

- Repository, tooling, lint, module-boundary check, CI with a real PostgreSQL container, Docker Compose for local work.
- Environment configuration validated at start-up; health endpoints; structured logging with request ID.
- Migration runner; database roles `migrator`, `app_admin`, `app_portal`, `report_ro`; base grants.
- Request context middleware (`SET LOCAL app.*`); fail-closed default.
- Session authentication (login, logout, me), Argon2id, throttling, CSRF defence.
- Permission guard that rejects any route without a declared permission; permission seed loader.
- `audit_row()` and `forbid_mutation()` infrastructure; `number_series` and `next_doc_number()`; idempotency middleware; problem+json error model.
- OpenAPI generation with the CI drift check; Swagger UI on `staging`.
- `staging` deployment; first ADRs; runbook skeleton.

**Exit criteria**

- Login, logout, and session revocation work; failed-login throttling works.
- A route without a declared permission fails the build or start-up.
- Updating a sample table produces an audit row with actor and request ID.
- `UPDATE` and `DELETE` on a sample append-only table fail for the application role.
- Concurrent number allocation test: no gaps, no duplicates, including forced rollbacks.
- Idempotency test: a retried request returns the original response with one effect.
- CI is green including migration-up on an empty database; `staging` is deployed and reachable.

**Demo.** Log in through Swagger UI, call a protected endpoint with and without the permission, show the audit row.

**Main risk.** Over-engineering the skeleton. Keep it to what §3 and §4 of `tech.md` describe.

---

### Phase 1: Identity, master data, party isolation (3 weeks)

**Goal.** Everyone and everything the business refers to exists, and factory isolation is proven before any sensitive data does.

**Scope.** AUTH-03, AUTH-04, AUTH-06, AUTH-07, AUTH-08 (admin reset), MST-01 to MST-10, MST-12, MST-11 (framework and masters), MST-06.

**Work**

- User, role, permission, and override APIs; seed the nine default roles from the matrix in `prd.md` §2.2.
- Suppliers, customers, job workers (with user links and an automatic custody location), materials, categories, colours, units and conversions, material variants, sizes, product categories, processing types, locations, tax rules, company settings, number series.
- CSV import framework with dry run and per-row rejection reasons (suppliers, customers, materials, job workers now; opening stock in Phase 2).
- Soft deactivation everywhere; audit triggers attached to all tables.
- First row-level security policies (on `job_workers` and the first party-scoped tables); the **RLS matrix generator**, the **leak-test harness**, and the **permission-matrix test data file**.

**Exit criteria**

- An admin creates every master through the API; every change has an audit row.
- A factory user can log in, sees exactly one job-worker row (its own), and cannot see any other.
- The RLS matrix passes for every party-scoped table that exists so far; with no context set, every policy denies.
- The permission-matrix test passes for the seeded roles.
- Import dry runs report bad rows with reasons and change nothing; a committed import is audited.
- Unit conversion works: a purchase in rolls or kilograms resolves to base metres.

**Demo.** Create a factory and its user; log in as that user; show that another factory's ID returns not found.

**Main risk.** Permission granularity swelling. Keep keys to the catalogue in `tech.md` Appendix B and add sparingly.

---

### Phase 2: Stock engine, purchase, inward (4 weeks)

**Goal.** Materials can be bought, received, and counted, and no one can change history. This is the foundation everything else stands on, so it gets the most testing.

**Scope.** STK-01 to STK-10, PUR-01 to PUR-07, INW-01 to INW-05, MST-11 (opening stock), BR-01, BR-09, BR-11, BR-12.

**Work**

- Stock tables, the balance and immutability triggers, `StockService` (post, FIFO allocate, reverse, availability); item and lot model; location model.
- Purchases with draft, confirm, and cancel; unit conversion; landed-cost apportionment; duplicate checks; attachments.
- Inwards: partial and multiple, over-receipt tolerance, automatic lots, links to purchase lines; pending-inward list.
- Stock adjustments with propose and approve and configurable thresholds; opening-stock import; stock query APIs (balances, ledger, lots, valuation); minimum stock level and low-stock flag.
- Nightly reconciliation job; invariants I-1 to I-4, I-6, I-9 implemented as reusable assertions.
- Model-based property tests (purchase, inward, adjust, reverse) and concurrency tests.

**Exit criteria**

- After purchase confirmation, raw stock is still zero; after inward confirmation it is exactly the received quantity with a lot carrying landed cost (BR-01).
- Cancelling a purchase with an inward is blocked; reversing an inward whose stock has since left fails with the blocking documents listed.
- `UPDATE` and `DELETE` on `stock_ledger` fail for all application roles.
- Property tests run 10,000 randomised sequences with invariants holding; parallel-posting tests show no negative balance and no lost update.
- Steps 1 and 2 of the §10 scenario pass automatically.
- Opening-stock dry run and commit work; nightly reconciliation runs clean on a seeded dataset.

**Demo.** Buy 500 m of fabric, see zero stock, confirm inward, see the lot and stock, try to cancel the purchase (blocked), try to change a ledger row through the database (rejected).

**Main risk.** Getting the lot and location model wrong. Mitigation: decision Q1 closed first; the design in `tech.md` §4.3 and §5 is reviewed before coding.

---

### Phase 3: Design, BOM, production requirement (2 weeks)

**Goal.** Designs and what they need to be made.

**Scope.** DSN-01 to DSN-06, JOB-01, TRC-02 (data side).

**Work**

- Designs with unique numbers, images, options, statuses; variant generation (colour × size) and finished-item creation.
- BOM versions and generic lines; requirement calculator with allowance; comparison against available stock.
- Design rate history with audit of every change.
- Production orders that snapshot the BOM version and compute requirements.

**Exit criteria**

- The PDF's example (2 m × 50 = 100 m) is a passing test; requirement with allowance percentages is correct.
- Editing a BOM creates a new version, and an existing production order still uses its snapshot.
- Duplicate design numbers are rejected; a rate change shows previous and new values in the audit log.
- Step 3 of the §10 scenario passes (cotton 400 m, printed 250 m for 100 garments).

**Demo.** Create D-100 with its BOM, generate a requirement for 100 garments, change the BOM, show the old order unchanged.

---

### Phase 4: Job work (6 weeks)

The largest phase, in three parts, each with its own mini-gate.

**Scope.** JOB-02 to JOB-14, SHR-01 to SHR-04, AUTH-06 (portal role hardening), BR-02 to BR-05, BR-08, BR-13, BR-14.

**4a: Slips, issue, custody, portal foundation (2 weeks)**

- Job slips with the status machine (every from/to pair tested); expected output lines by colour and size.
- Material issue with lot allocation; custody stock; `job_material_lines` and invariant I-5; material return; acknowledgement with discrepancy.
- The `app_portal` role, the `portal` view schema, and the portal API for jobs, material, acknowledge, and status.
- Exit: scenario steps 4 to 7 pass; issuing more than the warehouse holds returns `INSUFFICIENT_STOCK`; custody equals the sum of job lines (I-5); Factory A cannot read Factory B through any portal endpoint.

**4b: Receiving, processing, quarantine (2 weeks)**

- Garment receiving by colour and size with accepted, rejected, and damaged; partial receipts and short-close.
- BOM-based consumption posted from the job's custody lines; production receipt into ready stock (provisional cost placeholder until Phase 5); rejection to quarantine.
- Processing jobs as conversions with an output lot; `job_charges` as the single home for charges.
- Exit: scenario step 8 passes; processing 100 m sent and 95 m received shows a 5 m, 5% shortage (PDF §15); a receiving with 47 pieces against 50 expected shows a difference of 3 (PDF §16).

**4c: Reconciliation, close, overdue (2 weeks)**

- Reconciliation formulas (`prd.md` §5.4) exposed per job; tolerance configuration; write-off with approval; close gate returning `RECONCILIATION_REQUIRED` with the numbers; cancel job; overdue detection; job-ageing view.
- Manufacturing and shortage report queries; portal dashboard endpoint.
- Exit: scenario steps 9 to 11 pass (both paths); all-pairs state-machine test passes; idempotent replay of issue and receipt yields one effect; portal leak test clean.

**Overall exit criteria.** Every 4a, 4b, and 4c criterion, plus invariants I-1 to I-6 and I-9 after the whole scenario, and the RLS matrix covering all new party-scoped tables.

**Demo.** Issue material to a factory, log in as the factory and acknowledge it, receive 95 of 100 garments, watch the ledger and the reconciliation numbers, close the job.

**Main risk.** State-machine and reconciliation edge cases (partial receipts, returns, cancellations). Mitigation: property tests extended to job commands; owner confirms Q3, Q5, Q8, Q9 up front.

---

### Phase 5: Costing and ready stock (2 weeks)

**Goal.** Every closed job has a stored, correct cost per piece, and ready stock is visible by design, colour, and size.

**Scope.** CST-01 to CST-08, RGS-01 to RGS-04, PKG-01, PKG-02, STK-09, TRC-03.

**Work**

- Lot cost components; provisional cost at receipt; true-up at close with `lot_revaluations`; job cost sheets and lines; variance on sold stock.
- Cost and margin read APIs; cost redaction for users without `costing.view`.
- Ready-stock views by design, category, colour, size, location, factory; ATP; packing status API.

**Exit criteria**

- Path A yields exactly ₹93,100 total and ₹980.00 per piece; Path B yields ₹88,825 and ₹935.00.
- The receipt-time provisional cost is ₹935.00 and the two finished lots are revalued to ₹980.00 at close, with history preserved.
- A processed-fabric lot carries its processing cost into the garment job that consumes it.
- The leak test proves cost fields are absent for Packing, Sales, and Factory roles.
- Ready stock shows the size breakdown (the PDF's M 20, L 35, XL 25, XXL 10 = 90 as a fixture).

**Demo.** Close the job both ways and show the cost sheet; log in as Packing and show the same data without costs.

---

### Phase 6: Sales, GST invoicing, payments (4 weeks)

**Goal.** Finished goods can be sold, stock is deducted correctly, and invoices are compliant. Ends with the full scenario green.

**Scope.** SAL-01 to SAL-09, TRC-01, DOC-01, MST-08 (pricing fields), BR-06, BR-07.

**Work**

- Customer discount and payment terms; sales orders with availability check and item locks; rate resolution.
- The pure `computeInvoice` function with data-driven tax rules; invoices from orders or direct; FIFO deduction with `invoice_line_allocations`; gapless invoice numbering with the 16-character constraint; cancel with reversal.
- Minimal payments with derived payment status; customer statement.
- Trace endpoints; print-ready HTML for invoice, job slip, and material issue slip.
- CA review of the tax examples in `prd.md` §10 and §5.3.

**Exit criteria**

- The entire §10 scenario, steps 1 to 20, both paths, is green in CI.
- Parallel confirmation of invoices against limited stock: exactly as many succeed as stock allows, none negative.
- Numbering test with forced rollbacks: no gaps; a cancelled invoice's number is not reused.
- Tax unit tests pass including the ₹1,330 at 5% example and the slab boundary; the CA has signed off the worked examples.
- Trace from an invoice line reaches the supplier in one call.
- Invariants I-1 to I-10 pass after the full scenario.

**Demo.** Take an order to an invoice, watch stock fall by 20, trace the line back to the supplier, cancel the invoice and see stock return.

**Main risk.** Tax rules. Mitigation: rules as data, a pure function, and the CA's sign-off before the phase closes.

---

### Phase 7: Reporting, dashboards, hardening (3 weeks)

**Goal.** Management views exist, and the backend is proven safe and fast enough to build a frontend on.

**Scope.** DSH-01 (core KPIs), RPT-01 (the ● set), RPT-02 (CSV), AUD-02, XC-01, NFR-01 to NFR-06, NFR-11.

**Work**

- Read models and materialised views; seven dashboard endpoints; the R1 report set; export jobs; audit-log query and export.
- Load test with about a million ledger rows; query-plan review; indexes.
- Security round: baseline scan, dependency audit, review of the RLS suite, permission-matrix test against the final matrix.
- Backup and restore drill on `staging`, measuring recovery point and time; runbooks (`tech.md` §13.6).
- Freeze OpenAPI v1; publish the Postman collection and a seeded demo dataset.

**Backend Gate: exit criteria**

- Every R1 backend requirement is done or explicitly deferred with the owner's written approval.
- The §10 scenario is green on `main` and has been for at least two consecutive weeks.
- Invariants I-1 to I-10, the RLS matrix, the leak test, and the permission-matrix test are green.
- k6 results meet NFR-01 on the seeded dataset.
- A restore has been performed and reconciliation passes on the restored copy; measured recovery point and time are recorded.
- No open critical or high defects; security findings resolved or accepted in writing.
- The owner has personally run the demo script end to end and signed off the behaviour.

**Demo.** The full R1 flow through the API, including dashboards and a CSV export, with the owner at the keyboard.

---
<!-- PLAN_PART_2 -->

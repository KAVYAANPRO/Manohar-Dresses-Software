# Frontend Specification — Garment Manufacturing, Inventory, Job Work, Costing & Sales System

## 1. Purpose

Build the frontend for the product defined in `prd.md`.

The frontend must be production-oriented, responsive, maintainable, role-aware, and designed for real business operations rather than as a visual demo.

### Mandatory frontend requirements

- Use **React**.
- Use a modern React architecture with reusable components.
- The application must be **fully mobile compatible**.
- The admin application should be **desktop-first but responsive**.
- The Factory / Artisan portal must be **mobile-first**.
- Support desktop, tablet, and mobile screen sizes.
- Use large touch targets and simple flows for factory/artisan users.
- Never rely on frontend-only security. The backend/API is authoritative for permissions.
- Never expose rates, costs, margins, or other protected fields merely by hiding them visually.
- Provide loading, empty, error, success, confirmation, and validation states throughout the application.
- Use consistent navigation, components, spacing, typography, forms, tables, status badges, dialogs, and feedback patterns.
- Keep all user-facing text in a translation-ready structure from day one.
- Use INR formatting with Indian lakh/crore grouping and DD-MM-YYYY dates.
- Avoid unnecessary visual complexity. Business usability is more important than decorative UI.

The PRD explicitly requires a responsive desktop-first admin app and a separate mobile-first Factory/Artisan experience. fileciteturn0file0L380-L385

---

# 2. Product Context

The system manages the complete flow:

Supplier
→ Purchase
→ Inward
→ Raw Material Stock
→ Design + BOM
→ Production Requirement
→ Job Slip
→ Material Issue
→ Processing / Manufacturing
→ Finished Goods Receiving
→ Reconciliation
→ Costing
→ Ready Stock
→ Sales Order
→ Invoice
→ Stock Deduction

The UI must make this workflow understandable without requiring users to understand the database or accounting model.

The application is a centralized source of truth. Business events must be visible as records and inventory history must never appear to change silently.

---

# 3. Technology Requirements

## 3.1 Frontend

Use:

- React
- TypeScript
- Vite or the project's chosen React build system
- React Router for routing
- A component library or custom component system with consistent design tokens
- TanStack Query or an equivalent server-state solution for API data
- A form solution such as React Hook Form
- A schema validation solution such as Zod
- A charting library for dashboard analytics
- A date utility library
- An icon library

Do not build the application as one giant component.

## 3.2 Suggested frontend architecture

Use a feature-oriented structure:

```text
src/
  app/
    router/
    providers/
    config/

  components/
    ui/
    forms/
    tables/
    charts/
    feedback/
    navigation/
    documents/

  features/
    auth/
    dashboard/
    purchases/
    inward/
    inventory/
    materials/
    designs/
    production/
    jobs/
    processing/
    costing/
    packing/
    sales/
    customers/
    suppliers/
    factories/
    artisans/
    reports/
    audit/
    settings/

  layouts/
    AdminLayout/
    FactoryPortalLayout/
    AuthLayout/

  pages/
    ...

  hooks/
    ...

  lib/
    api/
    permissions/
    formatting/
    validation/
    errors/

  types/
    ...

  styles/
    ...

  i18n/
```

Keep business logic out of presentational components wherever possible.

---

# 4. Application Structure

There are two frontend experiences.

## 4.1 Admin Application

Used by:

- Super Admin / Owner
- Purchase Department
- Raw Material / Inventory Department
- Design Department
- Production Department
- Packing Department
- Sales Department

The admin application is desktop-first but must work properly on tablet and mobile.

## 4.2 Factory / Artisan Portal

Used by:

- Factory User
- Artisan User

This must be a separate experience from the admin application.

It must:

- Be mobile-first.
- Be fast on mobile internet.
- Use large touch targets.
- Show only the user's own party data.
- Avoid admin navigation.
- Never expose purchases, rates, costs, margins, or other unauthorized information.
- Make job actions extremely simple.

The PRD specifically requires a separate Factory/Artisan experience rather than delivering admin navigation/code to external users. fileciteturn0file0L138-L142

---

# 5. Responsive Design System

## 5.1 Breakpoints

Use responsive breakpoints approximately around:

- Mobile: `< 640px`
- Tablet: `640px – 1023px`
- Desktop: `1024px – 1279px`
- Large desktop: `1280px+`

Do not design only for one exact device width.

## 5.2 Mobile rules

On mobile:

- Replace wide tables with cards, stacked rows, or horizontal scrolling where appropriate.
- Never allow important actions to disappear below an inaccessible table.
- Use sticky primary actions where useful.
- Use bottom sheets or full-screen dialogs for complex mobile forms.
- Keep buttons at least 44px high.
- Keep destructive actions visually separated.
- Keep important status visible without opening another screen.
- Avoid tiny text.
- Avoid multi-column forms where fields become cramped.
- Use progressive disclosure for advanced fields.
- Allow users to complete common tasks with one hand where practical.

The PRD targets at least 44px touch targets for the portal and WCAG 2.1 AA as the portal accessibility target. fileciteturn0file0L554-L565

---

# 6. Visual Direction

Create a polished modern business application.

The design should feel:

- Professional
- Clean
- Trustworthy
- Operational
- Fast
- Information-dense without feeling cluttered

Do not create a generic template dashboard.

## 6.1 Design principles

1. Clear hierarchy.
2. Strong readability.
3. Important numbers are easy to scan.
4. Status is immediately recognizable.
5. Forms are optimized for fast data entry.
6. Tables support real operational work.
7. Destructive actions require confirmation.
8. Use whitespace to separate business sections.
9. Use subtle animation rather than excessive animation.
10. Keep animations fast and purposeful.

## 6.2 Animation

Use tasteful micro-interactions:

- Button hover/press states
- Smooth sidebar transitions
- Table row hover
- Modal/sheet transitions
- Toast enter/exit
- Skeleton loading
- KPI number transitions where appropriate
- Status changes
- Page transitions kept subtle
- Expand/collapse animations
- Mobile drawer transitions

Do not use animations that slow down business workflows.

Respect `prefers-reduced-motion`.

---

# 7. Authentication

## 7.1 Login

Create a clean login screen.

Fields:

- Username / mobile number
- Password

Features:

- Show/hide password
- Loading state
- Invalid credentials state
- Account locked state
- Deactivated account state
- Session expiration handling

The backend controls authentication and authorization.

## 7.2 Session

Frontend must:

- Restore authenticated sessions when supported by the backend.
- Handle expiry.
- Handle logout.
- Handle forced logout.
- Redirect unauthorized users.
- Never assume a user is authorized merely because a route exists.

---

# 8. Authorization UX

Create a permission-aware frontend.

Permissions can control:

- View
- Create
- Edit
- Confirm/Post
- Cancel/Reverse
- Approve

Roles are permission bundles, but users can have additional allow/deny overrides.

The UI should not show actions the current user cannot perform.

However, frontend permissions are only UX controls. The API must remain authoritative.

## 8.1 Protected fields

If a user does not have costing/rate permission:

- Do not render the value.
- Do not fetch it unnecessarily.
- Show an appropriate restricted state only when useful.

Never return protected financial values and merely blur them in CSS.

---

# 9. Global Admin Layout

## Desktop

Use:

- Left sidebar navigation
- Top header
- Breadcrumbs
- Page title
- Optional page actions
- Main content area
- Global notification area
- User/profile menu

Sidebar should support collapsed mode.

## Tablet

Use a collapsible sidebar/drawer.

## Mobile

Use:

- Compact top bar
- Menu drawer
- Bottom navigation only for the most important sections if it improves usability
- Contextual actions instead of forcing a large desktop navigation structure

---

# 10. Main Navigation

Navigation should be role-aware.

Potential admin navigation groups:

### Overview
- Dashboard

### Procurement
- Suppliers
- Purchases
- Pending Inward

### Inventory
- Materials
- Raw Stock
- Finished Stock
- Stock Ledger
- Stock Adjustments
- Locations

### Design
- Designs
- BOM / Material Mapping
- Design Variants

### Production
- Production Requirements
- Job Slips
- Material Issues
- Processing Jobs
- Finished Goods Receiving
- Reconciliation

### Costing
- Cost Sheets
- Job Costing
- Margins

### Packing
- Packing Dashboard

### Sales
- Customers
- Sales Orders
- Invoices
- Payments

### Reports
- Reports
- Traceability

### Administration
- Users
- Roles & Permissions
- Factories / Artisans
- Settings
- Audit Log

Only show sections the current user can access.

---

# 11. Dashboard System

Create role-specific dashboards.

The PRD defines seven dashboard types:

- Admin
- Purchase
- Raw Material
- Design
- Factory / Artisan
- Packing
- Sales

fileciteturn0file0L505-L517

## 11.1 Admin Dashboard

Show:

- Total raw stock
- Total ready stock
- Material with factories
- Jobs in progress
- Pending jobs
- Production completed
- Sales
- Pending payments
- Low stock
- Shortage summary

Use:

- KPI cards
- Trend charts
- Alert cards
- Recent activity
- Pending actions
- Quick actions

## 11.2 Purchase Dashboard

Show:

- Recent purchases
- Pending inward
- Supplier-wise purchases
- Material purchased

## 11.3 Raw Material Dashboard

Show:

- Current stock
- Material issued
- Material with factories
- Processed material
- Shortage
- Low stock

## 11.4 Design Dashboard

Show:

- Total designs
- Active designs
- Design-wise production
- Design-wise stock

## 11.5 Factory / Artisan Dashboard

Show only that party's:

- Assigned jobs
- Material received
- Pending jobs
- Completed jobs
- Expected production
- Actual production
- Returned products

## 11.6 Packing Dashboard

Show:

- Ready stock
- Pending packing
- Packed quantity
- Design-wise stock

## 11.7 Sales Dashboard

Show:

- Sales orders
- Recent sales
- Customers
- Available ready stock
- Billing
- Sales history

---

# 12. Reusable Data Table

Create a reusable enterprise-grade data table.

Required capabilities:

- Search
- Filters
- Sorting
- Pagination
- Column visibility where appropriate
- Row actions
- Bulk selection where appropriate
- Responsive mobile rendering
- Loading skeleton
- Empty state
- Error state
- Export action where allowed

The PRD requires search, filtering, sorting and pagination across lists. fileciteturn0file0L378-L385

## Mobile behavior

Do not simply shrink desktop tables.

For mobile:

- Convert rows to cards when appropriate.
- Prioritize the most important 3–5 fields.
- Put secondary fields in an expandable section.
- Preserve row actions.
- Allow horizontal scrolling only for genuinely tabular data.

---

# 13. Master Data Screens

Build reusable CRUD patterns for:

- Suppliers
- Materials
- Material Categories
- Colours
- Units of Measure
- Product Categories
- Product Types
- Sizes
- Locations
- Factories
- Artisans
- Customers
- Processing Types
- Company / Tax Settings

Referenced transactional master records must be deactivated rather than deleted.

Use:

- List page
- Search/filter
- Create form
- Edit form
- Details page
- Deactivate confirmation
- Activity/history where appropriate

---

# 14. Supplier Management

## Supplier list

Columns:

- Supplier
- Contact
- GSTIN
- Payment Terms
- Status
- Actions

## Supplier detail

Show:

- Basic information
- Contact information
- Address
- GSTIN
- Payment terms
- Purchase history
- Related transactions

---

# 15. Material Management

## Material list

Show:

- Material
- Category
- Fabric Type
- Base Unit
- Minimum Stock
- Status

## Material variant

Represent:

`Material × Colour`

Example:

`Cotton Fabric — Blue`

## Material detail

Show:

- Material information
- Variants
- Current stock
- Locations
- Lots
- Minimum stock
- Movement history

---

# 16. Purchase Module

## Purchase list

Show:

- Purchase number
- Date
- Supplier
- Total
- Status
- Pending inward
- Actions

Statuses:

- Draft
- Confirmed
- Partially Received
- Received
- Cancelled

## Purchase form

Header:

- Purchase ID
- Date
- Supplier
- Supplier invoice number
- Other charges
- Notes
- Attachment

Line items:

- Category
- Material
- Fabric type
- Colour
- Quantity
- Unit
- Base/metre quantity
- Rate
- Amount

Do not trust client-calculated totals. Display server-calculated totals.

## Important UX

When confirming:

- Show confirmation dialog.
- Clearly state that confirmation does NOT create stock.
- Show pending inward status after confirmation.

---

# 17. Raw Material Inward

Inward form:

- Inward number
- Purchase reference
- Date
- Supplier
- Material
- Category
- Colour
- Quantity
- Unit
- Metre/base quantity
- Rate
- Location
- Batch/Lot
- Remarks

After confirmation:

- Stock increases.
- New lot appears.
- Pending inward decreases.

Show clear success feedback.

---

# 18. Inventory / Stock UI

Inventory is one of the most important modules.

## Stock overview

Tabs or filters:

- Warehouse
- Factory Custody
- Quarantine
- Reserved
- Available / ATP

Show:

- Item
- Variant
- Location
- Quantity
- Unit
- Lot
- Unit cost where permitted
- Status

## Stock detail

Show:

- Current balance
- Location breakdown
- Lot breakdown
- Ledger movement
- Source documents
- Traceability

## Stock ledger

Append-only UI.

Columns:

- Transaction ID
- Date
- Movement Type
- Item
- Lot
- Quantity
- Unit
- Reference
- User
- Source
- Destination
- Remarks

Never provide edit/delete controls for posted ledger rows.

Corrections should show a reversal/new transaction flow.

---

# 19. Stock Adjustment

Form:

- Item
- Current quantity
- Adjusted quantity
- Difference
- Reason
- Date

Show approval requirement if threshold is exceeded.

Require confirmation before submission.

Make the effect obvious:

`Current → Adjusted`

---

# 20. Design Management

## Design list

Show:

- Design Number
- Name
- Category
- Type
- Status
- Available variants
- Default selling rate if permitted
- Updated date

## Design detail

Sections:

1. Overview
2. Images
3. Colour options
4. Size options
5. Design variants
6. BOM
7. Manufacturing instructions
8. Production history
9. Stock
10. Cost
11. Sales
12. Traceability

## Design variant

Represent:

`Design / Colour / Size`

Example:

`D-1025 / Blue / L`

---

# 21. BOM / Material Mapping

BOM must support generic lines.

Each row:

- Material role
- Material variant
- Quantity per garment
- Base unit
- Planned allowance %

Do not hard-code only Top / Bottom / Dupatta.

Show a live calculation:

`Garments × BOM quantity × allowance = Required material`

Also show:

- Required
- Available
- Shortfall / surplus
- Stock check status

---

# 22. Production Requirement

Form:

- Design
- Colour
- Size
- Quantity
- Planned dates

Show calculated material requirements.

Example:

```text
Production: 100 garments

Cotton:
Required: 400 m
Available: 500 m
Status: Available

Printed Fabric:
Required: 250 m
Available: 300 m
Status: Available
```

Make stock availability visually obvious.

---

# 23. Job Slip

## Job slip creation

Fields:

- Job number
- Date
- Factory / Artisan
- Design
- Product category
- Type: Processing / Manufacturing
- Expected output by colour and size
- Expected completion date
- Charge basis
- Agreed rate
- Instructions
- Remarks

Charge basis:

- Per piece
- Per metre
- Lump sum

## Status timeline

Display:

```text
Created
   ↓
Material Issued
   ↓
In Process
   ↓
Ready
   ↓
Partially Received
   ↓
Received
   ↓
Closed
```

Cancelled should appear as a terminal state.

Use a visual timeline/stepper on desktop and a compact vertical timeline on mobile.

---

# 24. Material Issue

Material issue must show:

- Issue number
- Date
- Factory / Artisan
- Design
- Job slip
- Material
- Category
- Colour
- Quantity
- Base/metre quantity
- Expected usage
- Lot

Use FIFO by default.

Before confirmation:

- Show warehouse available quantity.
- Show quantity being issued.
- Show resulting warehouse balance.
- Block insufficient stock.

After confirmation:

`Warehouse → Factory Custody`

Create a printable material issue slip.

---

# 25. Factory / Artisan Portal

This deserves a dedicated mobile UX.

## Home

Show:

- Active jobs
- Pending actions
- Material received
- Jobs nearing due date
- Simple status cards

Avoid admin-style charts unless genuinely useful.

## Job list

Each job card:

- Job number
- Design
- Expected quantity
- Expected completion
- Current status
- Required action

## Job detail

Show:

- Design
- Instructions
- Expected output
- Material received
- Current status
- Important dates
- Action buttons

Do not show:

- Purchase rates
- Material cost
- Production cost
- Margin
- Other factory data
- Other party's jobs

## Actions

Factory/artisan can, according to permission:

- Acknowledge material
- Mark In Process
- Mark Ready
- Declare dispatch quantity

These declarations do NOT post stock.

Company staff confirm receiving.

---

# 26. Processing / Dyeing

Processing is a material conversion.

UI should clearly communicate:

`Input Material → Processing → Output Material`

Show:

- Processing type
- Input material
- Quantity sent
- Output material
- Expected quantity
- Actual received
- Shortage
- Shortage %
- Processing charges
- Date
- Remarks

Formula display:

```text
Shortage = Sent − Received
Shortage % = Shortage / Sent × 100
```

Guard zero quantity.

---

# 27. Finished Goods Receiving

Receiving form:

- Receiving number
- Job slip
- Factory / Artisan
- Design
- Date
- Expected quantity
- Actual quantity
- Accepted
- Rejected
- Damaged
- Manufacturing charges
- Other charges
- Remarks

Quantities MUST be entered by:

- Colour
- Size

Example:

```text
Blue
M     38
L     57
Total 95
```

After confirmation:

- Accepted → Ready Stock
- Rejected → Quarantine
- Damaged → Quarantine

Show the inventory impact before confirmation.

---

# 28. Production Comparison

For each job show:

- Expected
- Actual
- Difference
- Material consumed
- Material returned
- Shortage
- Status
- Factory
- Design

Use a visual comparison layout.

Example:

```text
Expected       100
Received        95
Difference      -5

Material:
Issued         400 m
Consumed       380 m
Shortage        20 m
Shortage         5%
```

---

# 29. Reconciliation

Create a reconciliation workspace for closing jobs.

For each material:

- Issued
- Returned
- Consumed
- Written off
- Remaining
- Shortage
- Shortage %

A job cannot close while residual custody material remains unresolved.

Possible actions:

- Record return
- Write off shortage
- Request approval
- Add reason
- Close job

Make unresolved quantities visually prominent.

---

# 30. Costing

Only users with costing permission can see cost data.

## Cost sheet

Sections:

- Material cost
- Processing cost
- Manufacturing cost
- Other applicable cost
- Total production cost
- Accepted quantity
- Cost per garment
- Selling price
- Margin per garment

Use clear calculation hierarchy.

Example:

```text
Material Cost                 ₹81,225
Manufacturing                 ₹7,600
--------------------------------------
Total Production Cost        ₹88,825

Accepted Quantity                 95
Cost / Garment                ₹935.00
```

Distinguish:

- Provisional
- Final

When a job closes, show the final cost state.

---

# 31. Ready Stock

Ready stock screen must support:

- Design
- Category
- Colour
- Size
- Quantity
- Date received
- Factory / Artisan
- Location
- Cost where permitted

Show size breakdown.

Example:

```text
M      20
L      35
XL     25
XXL    10
------------
Total  90
```

Also show:

- On hand
- Reserved
- ATP

---

# 32. Packing

Packing dashboard:

- Design
- Category
- Colour
- Size
- Available quantity
- Packing status
- Packed quantity
- Pending quantity

Packing is a status and does not itself move stock.

Packing users must not see purchasing/costing information unless explicitly permitted.

---

# 33. Customers

Customer list:

- Customer ID
- Name
- Business name
- Contact
- Mobile
- GSTIN
- Payment terms
- Status

Customer detail:

- Contact information
- Billing address
- Shipping address
- GSTIN
- Default discount
- Payment terms
- Sales history
- Invoices
- Outstanding payments

---

# 34. Sales Orders

## Sales order form

Header:

- Order number
- Date
- Customer
- Notes

Lines:

- Design
- Category
- Colour
- Size
- Quantity
- Rate
- Discount
- Tax
- Amount

Statuses:

- Draft
- Confirmed
- Partially Invoiced
- Invoiced
- Cancelled

## Confirmation UX

Before confirming:

- Check ATP.
- Show available quantity.
- Show requested quantity.
- Show shortfall if any.

Important:

Confirming a sales order does NOT reduce on-hand stock.

It reserves availability for ATP.

---

# 35. Invoicing

Invoice screen must clearly show:

- Invoice number
- Date
- Customer
- Address
- GSTIN
- Products
- Design
- Category
- Quantity
- Rate
- Discount
- HSN
- Tax
- Subtotal
- Round-off
- Final amount
- Payment status
- Notes

Tax UI should visually distinguish:

- CGST
- SGST
- IGST

Do not hard-code tax rates in the frontend.

Tax rules come from backend-configured data.

## Invoice confirmation

Before confirming:

Show a summary:

```text
Stock deduction
20 × D-100 / Blue / L

Invoice total
₹27,930

Tax
CGST ₹665
SGST ₹665
```

Confirming the invoice should show a strong success state because it creates the stock deduction.

---

# 36. Payments

R1 supports basic payment recording.

Show:

- Invoice
- Invoice amount
- Paid amount
- Remaining amount
- Payment status

Statuses:

- Unpaid
- Partial
- Paid

Create a pending payments dashboard.

---

# 37. Traceability

Traceability should be visually powerful.

From an invoice line, user should be able to navigate:

```text
Invoice
  ↓
Finished Lot
  ↓
Job Slip
  ↓
Factory / Artisan
  ↓
Material Issued
  ↓
Material Lot
  ↓
Inward
  ↓
Purchase
  ↓
Supplier
```

Use a timeline/tree/relationship view.

Every node should link to its source record where permitted.

Also allow traceability from:

- Design
- Lot
- Invoice line

---

# 38. Reports

Create a unified Reports page.

Report families:

### Purchase
- Purchase history
- Supplier-wise purchases
- Material-wise
- Date-wise

### Inventory
- Current raw stock
- Finished stock
- Stock movement
- Material issued
- Material with factory
- Stock adjustments
- Stock valuation

### Manufacturing
- Factory-wise production
- Artisan-wise production
- Design-wise production
- Expected vs actual
- Pending jobs
- Completed jobs

### Shortage
- Material sent vs received
- Shortage quantity
- Shortage %
- Factory-wise shortage
- Artisan-wise shortage

### Costing
- Design-wise cost
- Material cost
- Processing cost
- Manufacturing cost
- Cost per piece
- Selling price and margin

### Sales
- Customer-wise
- Design-wise
- Category-wise
- Quantity sold
- Revenue
- Discounts
- Payment status

### Compliance
- Job-work ageing
- ITC-04 support report when available

All reports should support relevant filters:

- Date range
- Design
- Material
- Category
- Factory / Artisan
- Customer
- Supplier

R1 export is CSV; Excel is R2.

---

# 39. Alerts

Create an alerts center.

Alert types:

- Low raw-material stock
- Low ready stock
- Pending factory jobs
- Overdue jobs
- Material pending with factory
- Finished goods received
- High shortage %
- Pending purchase inward
- Pending sales orders
- Payment pending

R2:

- In-app alerts

R3:

- Email
- WhatsApp

Alerts should include:

- Severity
- Title
- Short explanation
- Date
- Related record
- Action button

---

# 40. Audit Log

Admin-only screen.

Filters:

- User
- Date
- Module
- Action
- Record ID

Each entry:

- User
- Timestamp
- Module
- Action
- Record ID
- Previous value
- New value

Use a diff viewer for changed values.

Never provide delete controls.

---

# 41. Settings

Create settings sections:

### Company
- Legal name
- GSTIN
- State
- Address

### Tax
- HSN rules
- Value bands
- Effective dates

### Financial year
- Start/end
- Current financial year

### Number series
- Invoice numbering
- Other document numbering

### Business rules
- Minimum stock
- Approval thresholds
- Shortage tolerance
- Payment terms

### Users and permissions
- Roles
- Permission keys
- User overrides

---

# 42. CSV Import

Create a reusable import workflow.

Steps:

1. Select data type.
2. Download template.
3. Upload CSV.
4. Parse file.
5. Preview.
6. Validate.
7. Show row-level errors.
8. Confirm import.
9. Show import result.

Support:

- Master data
- Opening stock

Never import invalid rows silently.

---

# 43. Forms

Create consistent form patterns.

## Form rules

- Clear labels
- Required indicators
- Inline validation
- Server error display
- Numeric formatting
- Appropriate keyboard types on mobile
- Auto-complete/select controls for master data
- Confirmation before posting important transactions
- Unsaved changes warning where appropriate

## Complex forms

Use sections:

```text
Basic Information
↓
Items
↓
Charges
↓
Attachments
↓
Notes
↓
Summary
↓
Actions
```

On mobile, collapse secondary sections.

---

# 44. Status System

Use a consistent status component.

Statuses should not rely only on color.

Every status should have:

- Text
- Icon where useful
- Accessible label
- Consistent visual treatment

Examples:

- Draft
- Confirmed
- Pending
- In Process
- Ready
- Partially Received
- Received
- Closed
- Cancelled
- Quarantined
- Paid
- Partial
- Unpaid

Do not use color alone to communicate status.

---

# 45. Confirmation Dialogs

Required for:

- Confirm purchase
- Confirm inward
- Issue material
- Receive finished goods
- Write off shortage
- Close job
- Confirm invoice
- Cancel invoice
- Cancel purchase
- Stock adjustment
- Deactivate master record

Confirmation dialog should explain the actual business impact.

Bad:

> Are you sure?

Good:

> Confirm invoice and deduct 20 pieces from ready stock?

---

# 46. Loading, Empty, Error and Success States

Every asynchronous screen must have explicit states.

## Loading

Use skeletons rather than a blank page.

## Empty

Explain what is empty and provide a relevant action.

Example:

> No pending inward  
> All confirmed purchases have been received.

## Error

Show:

- What failed
- Whether data may have been saved
- Retry action
- Relevant error message

Never show raw stack traces to users.

## Success

Use toast plus page-level confirmation for important transactions.

For important postings, show the created document number and a link to it.

---

# 47. Mobile UX Rules

The mobile experience must be genuinely usable, not merely responsive.

## Navigation

Use:

- Mobile drawer
- Contextual navigation
- Sticky action area for important forms

## Forms

Use:

- One-column layout
- Large controls
- Native mobile keyboard types
- Select/search sheets for long lists

## Tables

Convert to cards when useful.

## Actions

Place the primary action where the thumb can reach it.

## Factory portal

Optimize for:

- Android Chrome
- Mobile data
- Slow connections
- Quick repeated use

The portal should feel closer to a simple operational mobile app than an ERP desktop screen.

---

# 48. Accessibility

Target WCAG 2.1 AA where applicable.

Requirements:

- Keyboard navigation
- Visible focus
- Semantic HTML
- Accessible labels
- ARIA where necessary
- Screen-reader friendly status
- Sufficient contrast
- No color-only communication
- 44px+ touch targets on mobile portal
- Reduced motion support
- Form errors associated with their fields

---

# 49. Internationalization

All UI strings must come from a translation-ready catalogue.

Do not scatter user-facing strings throughout business logic.

Launch language:

- English

Architecture must allow future:

- Hindi
- Gujarati
- Other regional languages

Formatting:

- Date: DD-MM-YYYY
- Currency: INR
- Indian number grouping: lakh/crore

---

# 50. Performance

Frontend must feel fast.

Requirements:

- Paginate large lists.
- Lazy-load large modules.
- Avoid unnecessary API requests.
- Cache stable master data where appropriate.
- Debounce search inputs.
- Use skeletons.
- Virtualize extremely large lists where needed.
- Avoid rendering thousands of rows at once.
- Optimize images.
- Keep factory portal bundle lightweight.

The PRD proposes p95 under 300ms for paginated list/single-record reads and dashboard rendering under 2 seconds; the frontend should therefore avoid unnecessary client-side work that undermines these targets. fileciteturn0file0L550-L565

---

# 51. Error Handling

Normalize API errors into user-friendly frontend messages.

Handle:

- 400 validation errors
- 401 authentication errors
- 403 permission errors
- 404 not found
- 409 business conflicts
- 422 validation/business rules
- 429 rate limiting
- 500 server errors
- Network failures
- Timeout
- Session expiration

For stock conflicts, show actionable messages.

Example:

> Insufficient stock  
> Cotton Fabric — Blue has 100 m available, but this issue requires 200 m.

---

# 52. Business Rule UX

Frontend must reflect these rules:

1. Purchase confirmation does not create stock.
2. Inward confirmation creates raw stock.
3. Issuing material moves it from warehouse to factory custody.
4. Factory declarations do not post stock.
5. Company receiving posts accepted goods to ready stock.
6. Rejected/damaged goods go to quarantine.
7. Sales order does not reduce on-hand stock.
8. Confirmed invoice reduces stock.
9. Posted ledger entries cannot be edited/deleted.
10. Corrections happen through reversals/new entries.
11. A factory only sees its own party data.
12. A job cannot close while unresolved custody remains.
13. Costing uses actual transaction data.
14. Protected financial fields are permission controlled.

---

# 53. End-to-End UI Acceptance Flow

The frontend must support this complete R1 scenario:

1. Create and confirm purchase.
2. Verify stock remains zero before inward.
3. Create inward.
4. Verify raw stock.
5. Create production requirement.
6. Verify material requirement calculation.
7. Create manufacturing job.
8. Issue material.
9. Log into Factory A.
10. Verify only Factory A data is visible.
11. Factory acknowledges material.
12. Factory marks job In Process.
13. Factory marks Ready.
14. Factory declares dispatch quantity.
15. Production confirms finished receiving.
16. Verify accepted stock.
17. Verify rejected/damaged routing.
18. Reconcile material.
19. Resolve remaining custody.
20. Close job.
21. View final costing.
22. Create sales order.
23. Verify ATP changes but on-hand does not.
24. Generate invoice.
25. Confirm invoice.
26. Verify stock deduction.
27. View invoice.
28. View margin if permitted.
29. Trace invoice → lot → job → material → inward → purchase → supplier.
30. Cancel invoice with reason.
31. Verify stock reversal.
32. Verify audit log.

The PRD's corrected acceptance scenario is the release gate for R1. fileciteturn0file0

---

# 54. Frontend Testing

Write tests for:

## Component tests

- Forms
- Tables
- Status badges
- Permission gates
- Calculations displayed in UI
- Dialogs

## Integration tests

- Login
- Purchase → inward
- Job → issue → receiving
- Sales order → invoice
- Traceability
- Permission isolation

## Responsive tests

Verify:

- Mobile
- Tablet
- Desktop
- Large desktop

## Factory portal security tests

Verify:

- Factory A cannot view Factory B.
- Protected cost/rate fields are absent.
- Admin navigation is absent.
- Unauthorized actions are unavailable.

---

# 55. Definition of Done

A frontend feature is not complete until:

- React implementation exists.
- TypeScript types are defined.
- API integration is connected.
- Loading state exists.
- Empty state exists.
- Error state exists.
- Success state exists.
- Validation exists.
- Permission behavior exists.
- Mobile layout exists.
- Desktop layout exists.
- Accessibility has been considered.
- Important destructive actions require confirmation.
- No unauthorized financial information is displayed.
- Tests cover the critical behavior.
- No console errors remain.
- No obvious layout overflow exists on mobile.

---

# 56. What NOT to Do

Do not:

- Build a generic admin template with placeholder screens.
- Invent business rules not present in `prd.md`.
- Put all business logic into React components.
- Trust client-side calculations for financial/stock truth.
- Treat frontend permission checks as security.
- Hide protected values with CSS.
- Make factory users navigate the admin application.
- Make the mobile UI a shrunken desktop layout.
- Allow ledger editing/deletion from the UI.
- Automatically reduce stock when a sales order is confirmed.
- Automatically create stock when a purchase is merely confirmed.
- Let factory declarations post inventory.
- Hard-code GST rates.
- Hard-code tax calculations that should come from backend configuration.
- Use fake data as a substitute for API integration in production flows.
- Add excessive animations.
- Use color alone to communicate status.
- Remove audit-related UI because it seems secondary.
- Build every module as an unrelated visual design.

---

# 57. Priority

Implement in this order.

## R1 / Production Release

### Foundation
- React app
- Routing
- Auth
- Permission system
- Layout
- Design system
- Responsive system
- Error handling
- API state management

### Master data
- Suppliers
- Materials
- Colours
- Units
- Categories
- Sizes
- Locations
- Factories / Artisans
- Customers
- Processing types
- Company/tax settings

### Procurement
- Purchases
- Pending inward
- Inward

### Inventory
- Stock overview
- Stock ledger
- Lots
- Stock adjustments
- Stock valuation

### Design
- Designs
- Variants
- BOM
- Production requirements

### Production
- Job slips
- Material issue
- Factory portal
- Processing
- Receiving
- Reconciliation
- Job close

### Costing
- Cost sheets
- Cost per garment
- Margin

### Ready stock
- Ready stock
- Packing dashboard

### Sales
- Sales orders
- ATP
- Invoices
- Payments

### Traceability
- Full traceability UI

### Control
- Audit log
- Dashboards
- R1 reports
- CSV exports
- Alerts foundation
- Printable documents

## R2

Prepare extension points for:

- Multi-warehouse screens
- Purchase returns
- Sales returns
- Credit notes
- Advanced payments
- Customer price lists
- Excel export
- PDF documents
- Size-wise consumption
- In-app alerts
- Job-work charge statements
- ITC-04 report

## R3

Do not prematurely build:

- Barcode / QR
- WhatsApp notifications
- Email notifications
- Automated reorder suggestions
- Demand forecasting
- Advanced profitability analytics
- Supplier/factory performance analytics
- Accounting/GST integrations
- Native mobile app
- Third-party APIs
- Party payments
- Charge-backs

---

# 58. Final Claude Code Instructions

When implementing this frontend:

1. Read `prd.md` completely before coding.
2. Treat `prd.md` as the product source of truth.
3. Build with React and TypeScript.
4. Make the entire web app responsive.
5. Make the Factory / Artisan portal mobile-first.
6. Build reusable components instead of duplicated UI.
7. Implement the R1 workflow end-to-end before polishing secondary R2/R3 features.
8. Do not invent missing backend behavior.
9. When backend behavior is undefined, create a clear typed API boundary and document the assumption rather than silently inventing logic.
10. Keep permission checks centralized.
11. Keep API calls/data fetching separate from visual components.
12. Use consistent loading, empty, error, and success states.
13. Use accessible controls.
14. Use responsive layouts from the beginning, not as a final patch.
15. Use realistic garment-business terminology from `prd.md`.
16. Do not replace business terminology with generic SaaS terminology.
17. Do not expose protected financial information.
18. Do not allow frontend actions that contradict the inventory rules.
19. Use subtle professional animations and micro-interactions.
20. Ensure the application feels like a serious production ERP/workflow system, not a school-project dashboard.
21. Test the complete R1 acceptance scenario.
22. Before considering the frontend complete, verify mobile, tablet, desktop, permissions, loading/error states, and critical transaction flows.

## Core UX principle

The frontend should make the correct business action obvious.

A user should always understand:

- What record they are viewing.
- What state it is in.
- What they can do next.
- What will happen if they confirm the action.
- What inventory/business impact the action has.
- Whether the action requires approval.
- Whether the action has already been posted and is therefore immutable.

Build the UI around this principle throughout the application.

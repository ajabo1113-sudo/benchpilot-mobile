# BenchPilot invoicing and quotes

## Implementation delivered

- Added a first-class Invoicing & Quotes section with search, status filters, and outstanding, paid, overdue, and pending-quote summaries.
- Added reusable customer records, invoice/quote documents, immutable customer and business detail snapshots, and reusable labor/service line-item templates.
- Material pricing is stored on existing Materials records; documents copy the item description, unit, quantity, and unit price so future catalog edits do not change issued documents.
- Drafts can be edited. Marking a draft sent locks its financial content. Payments are separately recorded with date, amount, method, reference, and notes.
- Quotes can be marked accepted or declined. Accepted quotes convert to new invoice drafts while moving the project reservation from the quote to the invoice.
- Documents can be previewed and printed or saved as PDF from the browser print dialog. No email, payment processor, retailer service, or external document service was added.
- Project pages show their related quotes and invoices and open those actual document records.
- State version 13 adds optional `customers`, `invoices`, `lineItemTemplates`, `documentLogos`, invoicing defaults, and optional price fields on materials. Existing version 1–12 local, backup, and cloud data normalizes to version 13 with empty new collections and defaults.

## Data model

- `customers[]`: stable ID and editable reusable contact fields.
- `invoices[]`: shared invoice/quote record with a stable ID, unique display number, type/status, customer ID plus customer snapshot, project IDs and displayed-name snapshots, item snapshots, calculations, dates, terms, business snapshot, and payments.
- `lineItemTemplates[]`: reusable custom description, unit, and default rate. Editing/removing a template does not change document snapshots.
- `documentLogos[]`: each distinct resized shop logo is stored once and referenced by documents, rather than copying the large base64 image into every invoice.
- `materials[]`: existing records gain optional `price` and `priceUnit`; no duplicate product catalog is created.
- `settings.invoicing`: business address/contact, numbering prefixes and next sequence, terms, quote validity, tax default, payment instructions, and footer.

The Supabase JSONB table accepts extra root properties and already validates the main collection shape. No SQL migration is required for this additive snapshot change. RLS and account ownership remain those of the existing per-user workshop row.

## Project reservation rule

The UI and data validators reject duplicate active project assignments. Import and cloud snapshot normalization also reject documents that reference missing projects or duplicate active project links. Draft/sent/accepted quotes reserve a project until declined, cancelled, expired, or converted. Draft/sent/partially paid invoices reserve it until cancelled or fully paid. Quote conversion saves the quote as historical `converted` and the new invoice as the active reservation in one workshop save.

This is an application-level rule because projects and documents currently live inside one JSONB snapshot. Revision conflicts prevent a stale device from silently replacing newer cloud state, but two devices editing from the same revision still require the existing conflict-choice flow. A future row-per-document schema can enforce the constraint with a database uniqueness mechanism.

## Deliberately deferred / limitations

- Currency is currently USD. Add currency selection before use in another currency or for multi-currency tax/accounting.
- No tax advice, region-specific tax rules, tax exemption certificates, credit notes, accounting exports, or legal compliance claims are included. Tax defaults to 0 and can be overridden per document.
- No email sending, hosted customer portal, viewed tracking, payment collection, online checkout, retailer pricing, or API integration is included.
- PDF output uses the browser print dialog and Save as PDF. Validate printer margins and page breaks on the owner’s target browser/printer before sending documents commercially.
- Sent financial documents are locked; revisions and formal invoice correction/credit-note flows are future work. Payment records can still be added to sent invoices.
- Price-per-foot and square-foot units are labels/entry quantities, not automatic conversions from board dimensions. The user enters the billed quantity.
- Materials pricing, customers, and documents use the existing whole-snapshot local/cloud sync. No record-level synchronization or database migration was introduced.
- Business contact details are new invoicing defaults. The existing shop name and logo are reused. A logo image is deduplicated and retained only while a document references it; snapshot size still grows when a distinct logo is used.

## Manual review steps

1. Open Invoicing & Quotes and set business defaults, numbering, terms, and tax. Set a price and billing unit for a material.
2. Create a quote for a new customer, link a project, add material and labor/template rows, and apply a discount/tax/charge. Confirm live and final totals.
3. Try creating a second active document for that project; it should be unavailable. Mark the quote sent, accept it, and convert it. Confirm the project appears on the resulting invoice and is reserved only once.
4. Print or save the quote/invoice to PDF and check its logo, addresses, line items, amounts, page breaks, and phone layout.
5. Record multiple partial payments and confirm paid/remaining values and status; complete payment and confirm project reservation releases. Verify overdue after a sent invoice passes its due date.
6. Update/reload BenchPilot online on every device before syncing version-13 data; older cached app code only accepts snapshots through version 12. Then sign in on the other device to verify snapshot sync. Download a backup and confirm it can be restored without losing customer or document records.

## Deferred Toolbox items retained

The existing [Toolbox implementation plan](TOOLBOX_IMPLEMENTATION_PLAN.md) remains the source for deferred equipment inventory and maintenance, shared project/build notes, QR codes and labels, Dashboard widgets for tools, background timer notifications, and saved calculations/weight presets. Equipment photos and their file-storage work remain out of scope as requested.

# Client Documentation Contract & Payment Schedule

## Purpose

The Client Documentation module now records the contract Google Drive link and a documentation-level installment schedule for each client. The schedule helps the documentation team see the agreed contract value, paid amount, remaining balance, due or overdue amount, next installment, due dates, and linked payment receipts without leaving the client profile.

> The Financial module remains the authoritative accounting ledger. Marking an installment paid in Client Documentation does not create, edit, or delete a Financial transaction or receipt.

## New Client Workflow

The new-client form still starts by selecting an existing Financial Client by name or code. It then requires a separate contract Google Drive link and displays three blank payment rows. Each row requires a manually entered payment name, positive EUR amount, and due date. No payment name or amount is fixed or prefilled. Users may remove rows or add up to 30 installments before creation.

Client case, document checklist, contract link, Finance-client reference, and installments are created in one database transaction. If any part fails, none of the new records are retained.

## Client Profile Workflow

Every Client Documentation profile contains a responsive **Contract & Payments** section. Users can open or update the contract link, add custom installments, edit unpaid installments, mark installments paid, add or replace receipt names and HTTP(S) Drive links, and archive unpaid installments that have no receipt evidence.

Paid payment names, amounts, due dates, and paid dates are protected from later rewriting. Existing receipt links cannot be removed, although an incorrect link may be replaced. Paid or receipt-linked installments cannot be archived. Every create, update, paid-status, contract-link, and archive action writes to the existing audit log.

## Calculations

All values are calculated from active installment rows in EUR. **Contract Value** is the sum of active installments. **Paid** is the sum of installments with a paid date. **Remaining** is contract value minus paid. **Due / Overdue** is the sum of unpaid installments whose due date is today or earlier in Cairo. **Next Payment** is the earliest unpaid installment. Archived rows are excluded.

## Backward Compatibility

Existing Client Documentation clients are not modified or backfilled. Their new section opens with zero totals and a clear empty state until a contract link or payment is added. Existing document folders, document status, Client Portal assignments, and Financial transactions remain unchanged.

## Validation and Evidence

The additive migration introduced nullable `finClientId` and `contractDriveLink` fields on `clientCases` plus the `clientDocumentationPayments` table. Contract and receipt evidence accept only HTTP(S) URLs. Payment names are case-insensitively unique per active client schedule; amounts must be positive; due and paid dates must be real ISO calendar dates. The implementation has focused calculation and wiring regression tests and a successful production build.

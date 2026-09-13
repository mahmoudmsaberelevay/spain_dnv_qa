# ELEVAY CRM Integrated Client Workflow Update

**Release date:** 13 September 2026  
**Prepared by:** Manus AI

## Executive Summary

This release coordinates four connected ELEVAY workflows. Client Documentation Chat now displays the authorized users associated with delivery, read, and listening receipts directly under each applicable message, while per-message notifications retain a concise preview and protected navigation target. Contract creation now records whether the client came through **Referral** or **Marketing**; Marketing requires a verified Lead Number ID and converts that existing Lead to **Client** inside the same database transaction as Contract creation. Existing Client Documentation folders now include an **Employees with access** multi-select that grants folder and Chat access only to employees with full Client Documentation permission. New Client Documentation cases use three fixed payments linked to **Signed**, **Submission**, and **Approval**, with automatic and scheduled behavior matching the requested milestones.

## Delivered Changes

| Area | Delivered behavior | Safeguard |
|---|---|---|
| Chat receipts | Inline **Delivered to**, **Read by**, and **Listened by** labels include authorized participant display names. | Internal identifiers and unauthorized participants are not exposed. |
| Chat notifications | Each new message uses the existing participant notification fan-out with a compact preview and protected deep link. | Mute and channel preferences, retry idempotency, and access checks remain active. |
| Contract source | Contract creation requires **Referral** or **Marketing**. Marketing conditionally requires a Lead Number ID and previews the matched Lead before submission. | Missing Leads and Leads already linked to an active Contract are rejected before document generation and rechecked transactionally. |
| Lead conversion | A Marketing Contract links the existing Lead, changes its stage to **Client**, records Lead activity, and enqueues the mapped Meta CRM event after commit. | No duplicate Lead or second active Contract is created; Referral Contracts do not touch Lead records. |
| Employees with access | Existing Client Documentation folders provide a searchable multi-select employee directory. Selected employees receive folder and Chat access. | Only full-access Client Documentation employees are eligible; creator, owner escalation, assigned consultant, assigned paralegal, portal participant, and internal-note rules remain protected. |
| Initial payment plan | New cases use fixed names: **First payment**, **Second payment**, and **Third payment**, linked respectively to **Signed**, **Submission**, and **Approval**. | Historical date-based payments remain unchanged and continue to display normally. |
| Signed payment | First payment is recorded as paid automatically when the new Client Documentation case is created. | No client reminder is generated for the Signed payment. |
| Submission payment | An unpaid Submission-linked Second payment triggers the client reminder during the twelve-day pre-submission window. | Daily idempotency prevents duplicate delivery for the same case and recorded submission date. |
| Approval payment | An unpaid Approval-linked Third payment triggers from the day after approval is recorded. | Daily idempotency prevents repeat delivery for the same approval event. |

## Data and Authorization Safety

Migration `0078_contract_source_payment_milestones.sql` is additive and TiDB-compatible. Existing Contract source fields and payment milestones remain `NULL` until a new workflow uses them. Existing payment dates were not rewritten. Count-only production validation found zero duplicate active milestones, zero legacy rows missing both a milestone and due date, and zero orphan active staff Chat participants.

Marketing Lead conversion is transaction-bound: the service validates the Lead, checks for another non-cancelled Contract link, inserts the Contract, updates the Lead stage, and writes the Lead activity before commit. The external Meta synchronization request occurs only after that commit and cannot roll back or duplicate the Contract transaction.

The employee-access control reuses the authoritative Client Chat participant model. Access removal revokes optional staff participation without deleting history, while mandatory participants remain selected and cannot be removed from the interface.

## Validation Evidence

The final integrated run passed **61 tests across 10 files**, including three behavioral Contract-to-Lead tests. The production build completed successfully. Browser verification covered the Contract source dialog, conditional Marketing Lead ID field, fixed milestone payment rows, the Employees with access selector, loaded named Chat receipts, and phone-width Client Documentation layouts. The daily authenticated Client Lifecycle Heartbeat remains enabled and points to the deployed scheduled reminder handler.

The project still reports the longstanding unrelated global TypeScript baseline and three existing authentication-route bundler warnings. Changed-file TypeScript filtering returned no diagnostics for the files introduced or modified by this release.

## Operational Notes

For new Client Documentation cases, employees enter only the three EUR amounts; the names and application statuses are fixed. Submission reminders depend on the recorded expected or actual Submission date. Approval reminders depend on the recorded Approval date. The Financial module remains the authoritative accounting source; the Client Documentation schedule remains an operational planning view.

For a Marketing Contract, the employee must select **Marketing**, enter the Lead Number ID from the Leads module, and wait for the verified preview before generating the Contract. Selecting **Referral** does not request or accept a Lead ID.

## Supporting Records

Detailed non-mutating browser, database, build, test, and runtime evidence is available in [`INTEGRATED_CRM_UPDATE_VALIDATION.md`](./INTEGRATED_CRM_UPDATE_VALIDATION.md). The implementation is tracked in the project [`todo.md`](../todo.md), and the reviewed additive migration is stored at [`drizzle/0078_contract_source_payment_milestones.sql`](../drizzle/0078_contract_source_payment_milestones.sql).

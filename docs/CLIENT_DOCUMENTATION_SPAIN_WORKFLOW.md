# Client Documentation Spain Workflow

## Overview

The Client Documentation module now tracks each required document from receipt through Ministry of Foreign Affairs and embassy handling, and tracks the Spain application from preparation through Spain-team receipt, official submission, approval, travel, biometrics, bank-account completion, and residency-card collection readiness.

## Per-Document Evidence and Authority Lifecycle

Every checklist row has its own validated HTTP(S) document link. Documents requiring official processing have four separate dated actions: **Submitted to MOFA**, **Received from MOFA**, **Submitted to Embassy**, and **Received from Embassy**. A document must first be received by ELEVAY; MOFA receipt requires MOFA submission; embassy submission requires MOFA receipt; embassy receipt requires embassy submission. Each action writes to the existing audit log and updates authorized Client Portal visibility.

Completed legacy `mofaAttested` and `embassyAttested` records were conservatively mapped to both submitted and received using their historical attestation dates. No document or case record was deleted or reset. Deprecated bulk shortcuts are blocked so they cannot bypass the four dated actions.

## Spain Case Stages

The stage sequence is **Preparation → Spain Team Received → Submission → Approved**. Spain Team Received requires a date. Submission requires the Spain-team date, official submission date, and an HTTP(S) submission receipt link. Approval requires an existing submission, an approval date not earlier than submission, and an HTTP(S) approval-letter link. Expected approval continues to calculate as 25 working days after submission.

## Spain Milestones

The profile includes dated controls for sworn-translator submission, travel to Spain with ticket and hotel links, arrival confirmation, biometrics appointment, biometrics completion, bank-account completion, and residency-card readiness for collection. Translator submission is intentionally a milestone note rather than a stage.

Chronological safeguards require arrival on or after travel, biometrics completion on or after the appointment, bank-account completion after biometrics, and residency-card readiness only after approval and biometrics. Links accept only HTTP(S) URLs.

## Reporting and Client Portal

The Client Documentation dashboard includes the Spain Team Received stage in counts, filters, and badges. Document reports distinguish submitted and received totals for both authorities while retaining legacy compatibility.

Authenticated Client Portal users can see only applications assigned to their account. Their application timeline includes Spain Team Received, submission, approval, biometrics, and residency-card readiness. Their document list includes safe document links and authority statuses. Internal audit details, payment controls, assignment data, and unrelated clients are not exposed.

## Validation Evidence

The additive migration preserved 23 existing Client Documentation cases and 427 checklist rows. All cases remained in their existing stage, all three legacy MOFA completions and all three legacy embassy completions were mapped successfully, and no new case milestone, document link, or payment row was fabricated. Twenty focused workflow, payment, and Client Portal security tests passed, and the production build completed successfully. Authenticated profile and dashboard rendering were verified without writing test data.

## Operational Notes

All workflow mutations require authentication and write audit history. Portal notifications are sent only for relevant document, authority, travel, arrival, biometrics, and residency-card updates. The Financial module remains independent and authoritative for accounting. Rollback should restore the prior application checkpoint while retaining the additive columns and historical data; the migration contains no destructive `DROP`, `DELETE`, or `TRUNCATE` statements.

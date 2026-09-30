# ELEVAY CRM — Pass 2, Batch 1 Remediation

**Date:** 2026-09-30  
**Branch:** `fix/pass2-finance-reliability-20260930`  
**Scope:** Financial integrity, compiler-confirmed defects, and behavior-preserving runtime safety corrections.

## Completed locally

- Made receipt settlement and Financial-client synchronization transactional and idempotent in the application layer.
- Added a database migration proposal for one payment projection per receipt and one Financial client per contract.
- Corrected the three compiler-confirmed authentication-route database imports without changing login methods, credentials, password hashes, sessions, cookies, tokens, OAuth enrollment, password-reset behavior, or secrets.
- Repaired server and UI type defects across backup exports, Contract DOCX appendix merging, Financial pages, Support, Analytics, AI Council, WhatsApp QC, Attestation, Paralegal lookup, Marketing audit typing, and RTL DOCX generators.
- Restored the already-designed, server-admin-protected Security & Audit procedures to the active `admin` tRPC router: paginated audit logs, encrypted backup status, and full backup export.
- Hardened the storage-signing proxy to validate the upstream response shape before redirecting.
- Corrected backup preview parser typing and target-compatible regular expressions; dynamic table identifiers are escaped before use in the parser regex.

## Financial migration status

`drizzle/0105_atomic_receipt_payment_integrity.sql` is **proposed only** and was **not applied** to the CRM database or production.

It adds:

1. A unique `payments.invoiceId` constraint to prevent duplicate receipt-payment projections.
2. An index on `(payments.contractId, payments.paidAt)`.
3. A unique `finClients.contractId` constraint to prevent duplicate Financial client projections.

The migration contains no executable data rewrite. Existing records were checked before preparation for duplicate non-null `payments.invoiceId` and `finClients.contractId` values. Per the owner instruction, production migrations remain awaiting explicit approval.

### Rollback sequence

If the application release must be rolled back, roll back the application code first. Then run the commented index/constraint drops in `0105_atomic_receipt_payment_integrity.sql` only after verifying they exist in the target database.

## Verification

| Check | Result |
|---|---:|
| Project TypeScript check | **0 errors** |
| Focused remediation regressions | **21 passed / 4 files** |
| Full CRM regression suite | **685 passed, 1 skipped / 137 files** |
| Production build | **Passed** |
| `git diff --check` | **Passed** |

The one skipped test is the intentionally optional live Creatomate probe; it is excluded from deterministic CRM regression results.

## Deferred or not included in this batch

- No production deployment.
- No production database migration execution.
- No credential-system change: usernames, passwords, hashes, sessions, cookies, OAuth enrollment, reset flows, secrets, and API credentials remain untouched.
- Broader Pass 2 work remains: document-level permission enforcement, storage-signing authorization, webhook validation/idempotency, worker leases, outbound timeout/retry policy, notification redelivery, and query scalability work.

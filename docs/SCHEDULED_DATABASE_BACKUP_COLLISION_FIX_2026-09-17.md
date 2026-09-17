# Scheduled Database Backup — 18:00 Collision Fix

**Date:** 17 September 2026  
**Author:** Manus AI

## Outcome

The scheduled 18:00 Cairo backup completed successfully, produced one full encrypted database artifact, and sent one notification to each of the two approved email addresses. The playbook invocation that arrived moments later initially reported a duplicate insert error because the database driver wrapped the underlying unique-key error. The existing backup itself was not lost or failed.

The collision path is now fully idempotent. Repeated or concurrent invocations for the same Cairo date return the authoritative existing status without creating another artifact or sending another email.

| Control | Verified result |
| --- | --- |
| Successful backups for 17 September | 1 |
| Daily run key | `db-backup:primary-database-backup:2026-09-17` |
| Encryption | AES-256-GCM, authenticated and decryptable |
| Encrypted artifact size | 2,198,155 bytes |
| Live database tables | 121 |
| Exported database tables | 121 |
| Missing tables | 0 |
| Notification emails sent | 2 |
| Notification failures | 0 |
| Backup error code | None |
| Active schedule binding | Current scheduled task |
| Schedule | Monday–Thursday at 18:00 Africa/Cairo |

## Root Causes

Two independent issues were exposed by the near-simultaneous 18:00 invocations. First, the query layer wrapped the database driver’s duplicate-key error, while duplicate detection inspected only the outer error. Second, the backup date key and artifact filename were not sufficiently canonical across trigger identities and same-day executions.

The daily idempotency key is now based on the single logical backup name and Cairo date rather than the trigger identity. Duplicate detection walks nested error causes and recognizes standard MySQL/TiDB duplicate indicators. Encrypted artifacts now use immutable run-specific storage keys, preventing same-day retries from overwriting or returning a cached date-only object.

## Data and Notification Safety

Today’s successful ledger entry was consolidated to the stable daily key and current schedule binding. The encrypted artifact was regenerated once under an immutable run-specific storage key without resending email notifications. The resulting artifact was downloaded through the storage layer, authenticated, decrypted, decompressed, and inspected. It contains every one of the 121 live database tables required for complete Financial, Contracting, Leads, Client Documentation, Client Portal, chat, reporting, marketing, access-control, audit, and system restoration.

Repeated execution of the exact playbook now returns:

```json
{"ok":true,"status":"success","duplicate":true}
```

This response confirms the existing backup is authoritative and no duplicate email or artifact is created.

## Validation

Twenty focused tests passed across encryption, tamper rejection, Cairo scheduling, handler authorization, wrapped duplicate-key detection, trigger-independent daily idempotency, immutable storage naming, full-table export, email safety, and playbook behavior. The production build completed successfully. Changed files introduced no TypeScript diagnostics; the existing unrelated global TypeScript baseline and authentication-route build warnings remain separate.

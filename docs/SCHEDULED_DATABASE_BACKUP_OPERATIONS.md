# ELEVAY Scheduled Database Backup Operations

**Author:** Manus AI  
**Validated:** 7 September 2026  
**Production schedule:** Monday–Thursday at 18:00 Africa/Cairo

## Purpose and Scope

The managed backup job exports the complete production database, including all financial, contracting, Client Documentation, application-analysis, Leads, activity, audit, and system-support tables. The SQL export contains table definitions and data inserts, is compressed with gzip, encrypted with authenticated **AES-256-GCM**, stored as a durable S3 artifact, and followed by two email notifications.[1] [2]

> The restoration password is a server-only secret. It is not stored in source code, email content, API responses, browser pages, logs, or this document.

## Production Architecture

| Component | Production behavior |
|---|---|
| Managed task | `db-backup-encrypted-cairo`, task UID `ekg7Ju3tix7vfk6qaWLb7c` |
| Callback | `POST /api/scheduled/dbBackup` |
| Authentication | Heartbeat request identity from the platform SDK; normal users, spoofed headers, and orphan task UIDs are rejected or safely skipped.[1] |
| Schedule | `0 0 15,16 * * 1-4` in UTC. The handler executes only when local time is 18:00 in `Africa/Cairo`; the alternate daylight-saving trigger is skipped.[2] |
| Idempotency | One durable run claim per scheduler/date, with a separate stable key for a bounded controlled test run.[2] |
| Export | Complete schema and rows from every table returned by `INFORMATION_SCHEMA`, with foreign-key checks disabled during recovery and restored at the end.[2] |
| Encryption | gzip followed by AES-256-GCM with a random salt, random IV, scrypt-derived key, and authentication tag.[3] |
| Storage | Durable S3 key under `backups/scheduled/`; retry reuses an already uploaded artifact rather than creating another copy.[2] |
| Notifications | SMTP delivery to `mahmoud.saberelevay@gmail.com` and `mahmoud.saber@elevay.com`; the sender must be a configured non-`@elevay.com` address.[2] [4] |
| Evidence | Privacy-safe settings and run ledgers store status, times, size, artifact key, recipient success/failure counts, duration, and sanitized error code.[5] |

The obsolete `db-backup-daily` task is paused. The previous in-process AES-CBC scheduler and the browser-visible four-digit restoration password have been removed.[1] [6]

## Controlled Production Validation

The repaired job completed one controlled production run through the real managed scheduler. The callback returned **HTTP 200** in approximately **9.9 seconds**. The durable ledger records one successful run, one nonempty artifact, two successful notification sends, zero notification failures, and no error code.

The artifact was then downloaded through the storage helper and verified entirely in memory. AES-256-GCM authenticated decryption passed, gzip decompression passed, the SQL contained both foreign-key recovery boundaries, the encrypted size matched the ledger, and the backup contained **93 CREATE TABLE statements for 93 live production tables**.[2] [3] [7]

## Monitoring

Use the following scheduler commands from the ELEVAY project directory:

```bash
manus-heartbeat list
manus-heartbeat logs --task-uid ekg7Ju3tix7vfk6qaWLb7c --page-size 10
```

A healthy state has an enabled fresh task, cron `0 0 15,16 * * 1-4`, and a latest applicable 18:00 Cairo execution with HTTP 200. The database tables `database_backup_settings` and `database_backup_runs` provide durable evidence even when scheduler logs are unavailable.[5]

Treat any of the following as actionable: no success after a scheduled backup day, `lastErrorCode` populated, a failed run row, missing/zero artifact size, `emailSuccessCount` below two, or a task UID that differs from the enabled managed task. Error codes are intentionally sanitized and do not contain SQL, credentials, recipient contents, or contact data.[1] [2]

## Pause and Resume

Pause the job before maintenance, a suspected storage/security incident, or recovery testing:

```bash
manus-heartbeat pause --task-uid ekg7Ju3tix7vfk6qaWLb7c
```

Resume it only after confirming the production database, storage helper, email sender, and encryption secret are available:

```bash
manus-heartbeat resume --task-uid ekg7Ju3tix7vfk6qaWLb7c
```

Pausing stops future callbacks but does not delete prior artifacts or evidence. The application-side `isEnabled` setting is a second safety gate and should remain true during normal operations.[2] [5]

## Recovery Procedure

Recovery is a controlled administrator operation. First pause the schedule and download the chosen encrypted artifact through an authenticated administrator path. Use **Backup Preview** to validate server-side authenticated decryption, gzip integrity, expected tables, and row structure; the browser never receives the restoration password.[3] [6]

Restore only into an isolated recovery database. After importing the SQL, compare table counts, critical module totals, referential integrity, and a sample of financial, contracting, Leads, Client Documentation, and audit records. Production replacement requires separate explicit authorization and a fresh pre-restore backup. Never paste the restoration password into chat, email, source code, a shell command, or a browser form.

## Rollback

If the backup code becomes unhealthy, pause the fresh managed task first. The repaired pre-validation checkpoint is `6bc0a448`; rollback through the project version history only when a code rollback is necessary. Database rollback does not remove the additive backup settings or run-ledger tables, so preserve them for investigation. Do not reactivate the obsolete task or restore the removed hardcoded password path.

After rollback, confirm the callback route returns an authentication error for an unsigned request, the fresh task UID still matches `database_backup_settings`, and the next test is explicitly bounded before re-enabling the schedule.

## References

[1]: ../server/scheduledDbBackupHandler.ts "Authenticated Scheduled Backup Handler"
[2]: ../server/scheduledDbBackupService.ts "Scheduled Database Backup Service"
[3]: ../server/backupEncryption.ts "AES-256-GCM Backup Encryption"
[4]: ../server/backupEmailService.ts "Backup Email Sender Policy"
[5]: ../drizzle/schema.ts "Database Backup Settings and Run Ledger"
[6]: ../server/backupAccess.ts "Administrator Backup Access Guard"
[7]: ../scripts/verify-latest-elevay-backup.ts "Privacy-safe Artifact Verification"

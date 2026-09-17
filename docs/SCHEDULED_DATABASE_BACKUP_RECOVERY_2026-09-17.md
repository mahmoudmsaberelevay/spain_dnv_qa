# Scheduled Full-System Database Backup — Recovery and Validation

**Date:** 17 September 2026  
**Author:** Manus AI

## Outcome

The ELEVAY automatic database-backup automation is active and corrected to run **Monday through Thursday at 18:00 Africa/Cairo**. The exact scheduled playbook is:

```bash
bash /home/ubuntu/backup_final.sh
```

The missing home-directory script was restored as a locked-down executable wrapper around the CRM’s current scheduled backup service. Its canonical version is kept in the source repository so it can be recovered reliably. The service exports every live database table, compresses the SQL, encrypts it with authenticated **AES-256-GCM**, uploads the encrypted artifact to protected application storage, records an idempotent run ledger, and sends completion emails to the two explicitly approved addresses.

| Control | Verified result |
| --- | --- |
| Schedule | Monday, Tuesday, Wednesday, and Thursday |
| Time zone | Africa/Cairo |
| Trigger time | 18:00 |
| Cron expression | `0 0 18 * * 1-4` |
| Schedule state | Active |
| Playbook | `bash /home/ubuntu/backup_final.sh` |
| Backup scope | Every live database table |
| Encryption | AES-256-GCM authenticated encryption |
| Compression | Gzip level 9 before encryption |
| Email delivery | Two approved recipients |
| Restoration credential | Stored separately; never included in email or source |
| Duplicate protection | One authoritative run key per Cairo calendar date |

## Live Backup Evidence

A controlled full backup completed successfully on 17 September 2026. The encrypted artifact was downloaded through the storage layer, authenticated, decrypted, decompressed, and inspected without restoring it over production. The backup contained **121 of 121 live database tables**, with zero missing tables. This includes Financial, Contracting, Leads, Client Documentation, Client Portal, chat, reporting, marketing, authorization, audit, and all other database-backed CRM modules.

The encrypted artifact size was **2,194,830 bytes**. Both requested notification emails were sent successfully, with zero email failures and no backup error code. The one-time test authorization cleared automatically after completion.

## Repairs Applied

The previous schedule was active but represented only Monday and Thursday and used a 15:00 trigger in its cron expression. It was updated to all four weekdays at 18:00 Cairo. The home-directory playbook referenced by the schedule was missing, so it was restored with permission mode `700`. The playbook contains no database, email, storage, or encryption credentials.

The current secure backup service had also inherited a general executive-notification filter that suppressed these backup emails. Because the owner explicitly requested these two addresses for backup delivery, the backup service now uses a narrowly scoped recipient exception. Other system notification rules remain unchanged.

The old AES-256-CBC implementation was not restored. The active implementation uses AES-256-GCM with PBKDF2-HMAC-SHA256 key derivation and authentication-tag verification, which detects tampering before decryption.

## Validation

Fifteen focused backup tests passed, covering authenticated encryption and tamper rejection, Cairo timing, idempotency, cron-only handler authorization, recipient safety, absence of embedded secrets, full-table export semantics, and playbook behavior. A second out-of-window playbook execution exited normally in four seconds without creating a duplicate backup or sending duplicate emails. The production build completed successfully after the implementation changes. Existing unrelated TypeScript baseline diagnostics remain separate from this work.

## Operating Notes

The next automatic run occurs on the next Monday–Thursday occurrence at 18:00 Cairo. A successful email contains only backup metadata and an encrypted download link; it never contains the restoration password. A disaster-recovery exercise should periodically restore the decrypted SQL into an isolated database and run record-count and application smoke checks before declaring the recovery test complete.

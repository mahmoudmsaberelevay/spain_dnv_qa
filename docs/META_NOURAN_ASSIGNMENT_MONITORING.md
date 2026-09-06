# ELEVAY Meta Monitoring and Nouran Auto-Assignment

## 1. Release status

The specification in `ELEVAY_Meta_Monitoring_and_Nouran_Auto_Assignment_Prompt_EN.pdf` is implemented directly in the existing **ELEVAY Leads** module. It does not create a parallel Lead database or a disconnected monitoring application.

The active policy resolves the single existing, active **Nouran Mamdouh** consultant account that already has Leads access. No duplicate user was created. All verified unassigned real Meta Leads after the specified baseline were assigned through the same durable policy. Existing non-empty consultant assignments were preserved.

> **Production CAPI remains disabled.** `META_CRM_PRODUCTION_ENABLED` is not `true`. Scheduled jobs cannot use an environment Test Events code implicitly. A Test Lead event can be sent only through the existing administrator action with an explicitly entered Meta Test Events code.

## 2. Assignment policy

The server-side policy key is `META_DEFAULT_CONSULTANT`. The policy stores the resolved consultant user ID, display name, activation state, backfill baseline, and the owned monitoring Heartbeat task UID. Browser clients cannot supply or replace the consultant ID during webhook ingestion.

Consultant resolution is fail-closed. The resolver normalizes the requested name and requires exactly one safe existing active account with Leads access. Zero or multiple candidates produce an assignment-pending/manual-review state and an administrator warning instead of guessing.

| Lead situation | Result |
|---|---|
| New real Meta Lead, no existing contact | Create one Lead and assign Nouran atomically |
| Existing real contact, consultant empty | Attach immutable inquiry and assign Nouran atomically |
| Existing contact already assigned | Preserve the existing consultant; record a `preserved` audit outcome |
| Multiple conservative contact matches | Do not merge or assign; store manual-review state |
| Missing or ambiguous Nouran policy | Keep assignment pending; alert administrators |
| Meta Test Lead | Mark explicitly, record `skipped_test`, do not assign, and do not send Lead alerts |
| Duplicate webhook replay | Reuse the durable inbox/attribution/event keys; do not create a second Lead or assignment |

Lead creation or matching, immutable attribution, assignment, inquiry activity, assignment audit, and the initial CRM event are performed in a database transaction. Notification delivery is intentionally outside the transaction, after durable deduplicated queueing.

## 3. Conservative matching and immutable attribution

Real and Test Leads are never merged with each other. The safe precedence is exact Meta Lead ID, normalized phone hash, then normalized email hash. Multiple candidates are not auto-selected. A returning real contact retains every immutable Meta inquiry attribution; the current Lead profile is not used as a substitute for attribution history.

The immutable attribution records now include the routing consultant ID/name, assignment outcome, match method, duplicate flag, ambiguity flag, and explicit Test Lead flag. These fields are visible in the Lead Profile's Meta inquiry history without exposing tokens.

## 4. Historical backfill

The backfill uses the PDF baseline **4 September 2026, 21:51:07 Cairo time**. It is restricted to verified real Meta Leads with Meta attribution, no current consultant, no Test Lead marker, and no ambiguity/manual-review state.

The administrator workflow is two-step: a PII-free dry run returns only internal Lead IDs and counts; the apply action rechecks the same conditions inside transactions. Deterministic assignment keys make reruns idempotent.

The live backfill assigned **29 verified real Meta Leads** in total: 28 during the initial validated run and one real Lead that arrived during final reconciliation testing. A subsequent dry run returned zero eligible Leads. Historical backfill Lead alerts were stored as `suppressed`, preventing an email burst, while new real Meta Lead alerts remain enabled.

## 5. Notifications

Newly ingested real Meta Leads generate one durable notification key. The assigned consultant and Mahmoud receive the Lead name, phone, program, and safe Meta source context. Recipients are resolved server-side. No `@elevay.com` address is configured as the sender; configured ELEVAY addresses may be recipients only.

Administrator alerts use safe codes and no Lead PII. Covered conditions include missing or ambiguous assignment policy, assignment failure, contact ambiguity, unassigned real Leads older than ten minutes, webhook/signature failures, reconciliation failures or staleness, retry exhaustion, duplicate attribution growth, stage-order violations, notification backlog, and Test Lead reporting leakage.

Notification rows are deduplicated by deterministic keys and retried with bounded attempts. Resolved unassigned alerts are automatically suppressed when the Lead is assigned. Gmail connection, greeting, and socket waits are bounded so reconciliation cannot hang indefinitely.

## 6. Monitoring and evidence

The administrator-only **Leads Settings → Meta Ops** dashboard now shows assignment policy status, resolved consultant, backfill baseline, dry-run/apply controls, 24-hour monitoring metrics, reconciliation freshness, notification backlog, retry exhaustion, and the production CAPI gate.

The monitoring snapshot excludes Meta Test Leads from operational metrics and excludes historical/reconciliation rows from real-time ingestion-delay percentiles. It stores no names, phone numbers, email addresses, tokens, or raw webhook payloads.

| Metric or warning | Current validated result |
|---|---:|
| Assignment coverage | 100.00% |
| Real Meta Leads unassigned over 10 minutes | 0 |
| Duplicate immutable attributions | 0 |
| Ambiguous matches | 0 |
| Manual-review items | 0 |
| Test Lead reporting leakage | 0 |
| Production CAPI enabled | No |

`Data not available` is shown when no trustworthy observation exists for a metric rather than displaying a fabricated zero.

## 7. Heartbeat automation

Two project-level Heartbeat jobs are active:

| Job | Cadence | Callback | Purpose |
|---|---|---|---|
| `meta-leads-monitoring-five-minute` | Every five minutes | `POST /api/scheduled/metaMonitoring` | Lightweight database monitoring, assignment coverage, unassigned-over-ten-minute detection, snapshots, and notification retries |
| `meta-leads-reconciliation-daily` | Daily at 06:15 Cairo | `POST /api/scheduled/metaReconciliation` | Meta reconciliation, durable inbox recovery, assignment recovery, and ordered outbox retry handling |

The five-minute callback accepts only a verified cron identity whose task UID matches the active assignment policy. An orphan or replaced task cannot run monitoring. The callback performs no broad Meta Graph scan, which keeps it within Heartbeat's short execution budget.

The first production monitoring callback attempted before deployment propagation and received 403. After deployment, the job accumulated more than 80 authenticated production executions. The latest post-Test-Lead runs returned HTTP 200 with 100% assignment coverage, zero unassigned/duplicate/ambiguity/manual-review/Test Lead leakage counts, no pending notification work, and `productionSendingEnabled: false`. The cadence was restored to five minutes after a temporary one-minute validation interval.

## 8. Reconciliation safeguards

Reconciliation now routes every recovered Lead through the durable ingestion and assignment architecture. Legacy pull paths cannot create Leads directly. Known Meta Lead IDs are skipped before detail retrieval, overlapping runs are rejected under a bounded lease, stale interrupted leases can be recovered, and every Meta Graph/CAPI request has a timeout.

Scheduled reconciliation cannot transmit a Test Events event from an environment fallback. Real CRM events remain queued/manual-review while production CAPI is disabled.

## 9. Read-only connector

The existing ELEVAY CRM connector now exposes `get_meta_lead_monitoring`. It is read-only and supports privacy-safe filters for date range, program, campaign, ad set, ad, form, consultant, Lead status, Meta sync status, and CRM event status.

Returned fields are limited to internal Lead ID, Meta Lead ID, explicit Test Lead flag, Meta attribution identifiers/names, program, consultant display, assignment status, synchronization status, event status/count, inquiry count, and business timestamps. It never returns phone numbers, emails, raw payloads, access tokens, App Secret, verify token, or CAPI token.

## 10. Controlled live validation

The latest real Meta Lead validation used identifiers and counts only. It showed one inbox record, one immutable attribution, one Nouran policy assignment, one assignment audit, one sent Lead alert, one queued outbox event, and zero sent CAPI events.

After user confirmation, one new Meta Test Lead was created through Meta's official Lead Ads Testing Tool. Contact-free database evidence showed:

| Test evidence | Count |
|---|---:|
| Durable inbox records | 1 |
| Signed and processed marked inbox records | 1 |
| Immutable Test Lead attributions | 1 |
| Explicitly marked unassigned Test Lead records | 1 |
| `skipped_test` assignment audits | 1 |
| Active consultant Lead alerts | 0 |
| Marked Test Lead outbox events | 1 |
| Sent CAPI events | 0 |

The Test Lead remains auditable in Leads and Meta Ops but is excluded from operational funnels, assignment coverage, consultant/program performance, and notification delivery.

## 11. Database migrations

| Migration | Purpose |
|---|---|
| `0055_meta_nouran_assignment_monitoring.sql` | Add assignment state, immutable routing context, assignment policy/audit, notification log, webhook security events, monitoring snapshots, and manual-review state |
| `0056_meta_notification_suppression.sql` | Add auditable notification suppression and suppress historical/resolved alert rows |
| `0057_meta_monitoring_heartbeat.sql` | Add the durable five-minute monitoring Heartbeat task UID owner |

All migrations are additive and preserve existing Lead, attribution, event, consultant, and reporting data.

## 12. Main changed files

The primary implementation files are `server/metaAssignmentMonitoring.ts`, `server/metaLeadsService.ts`, `server/metaAdsWebhook.ts`, `server/metaLeadSync.ts`, `server/emailService.ts`, `server/mcpServer.ts`, `server/routers/leadsSettings.ts`, `server/scheduledMetaMonitoringHandler.ts`, `server/_core/index.ts`, `client/src/pages/leads/MetaOperationsTab.tsx`, `client/src/pages/leads/LeadProfile.tsx`, `drizzle/schema.ts`, migrations `0055`–`0057`, and the focused Meta/Nouran test files.

## 13. Environment variable names

The implementation references these server-side names without exposing their values: `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_CAPI_TOKEN`, `META_DATASET_ID`, `META_CRM_PRODUCTION_ENABLED`, `META_TEST_EVENT_CODE`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD`.

`META_TEST_EVENT_CODE` is not consumed automatically by the scheduled outbox. The administrator must explicitly enter a Test Events code for a selected manual test retry.

## 14. Authorization

Meta health, monitoring, assignment policy, backfill, mappings, diagnostics, reconciliation, and retry procedures are protected by `adminProcedure`. Non-admin users cannot run assignment backfills or access operational diagnostics. The connector is read-only.

## 15. Validation summary

The release passed **51 focused tests** across signed webhook routing, consultant resolution, new/existing/assigned/ambiguous/Test Lead assignment cases, duplicate replay, transaction and audit safeguards, backfill dry-run/rerun, notification suppression, connector privacy, Meta Ops authorization, event ordering, browser tracking isolation, scheduled callback ownership, and the production CAPI gate.

The production frontend and server bundles completed successfully. The project-wide TypeScript command continues to report unrelated legacy errors in `backupDownload.ts` and `workflowDocxGenerator.ts`; no focused error was introduced in the Meta/Nouran files.

## 16. Rollback

Checkpoint `38f7b5a5` is the last verified Meta release before Nouran auto-assignment and monitoring. Checkpoint `80941195` contains the main assignment/monitoring implementation. A later final checkpoint includes the monitoring schedule handler, validation evidence, documentation, and completed checklist.

Rollback through project version history restores source code. Database rollback must be non-destructive: disable the `META_DEFAULT_CONSULTANT` policy and Heartbeat job first; do not drop audit, notification, attribution, or monitoring records. The added nullable columns and new tables may remain safely unused.

## 17. Remaining approval boundary

No further technical setup is required for Meta Lead ingestion, Nouran assignment, monitoring, or alerts. The only intentionally withheld capability is production CRM event transmission. It remains disabled until Mahmoud reviews live Lead attribution and explicitly approves setting `META_CRM_PRODUCTION_ENABLED=true`.

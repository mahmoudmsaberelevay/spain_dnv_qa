# ELEVAY Client Documentation Notification Implementation Report

**Implementation date:** 8 September 2026
**Scope:** ELEVAY CRM Client Documentation, ELEVAY Client mobile app, client push/in-app notifications, Application Activity, staff alerts, reminders, and secure document exchange

## Executive Summary

The Client Documentation workflow now uses an **idempotent bilingual lifecycle event service** as the shared source for the client’s in-app notifications, optional Expo push notifications, and Application Activity timeline. Required operational alerts are also routed to the assigned paralegal and consultant by email. Client-facing entries contain concise English and Arabic updates; internal database identifiers, staff routing, and audit details remain server-side.

Each assigned application now has a chronological **Application Activity** tab inside its Documentation page. It shows the welcome event, scheduled reminders, checklist submissions, document-authority updates, Spain workflow milestones, payment reminders, approval, travel, biometrics, and residence-card readiness. Client uploads and scans must target an outstanding CRM checklist document, appear immediately beneath that checklist item, and are available to authorized staff in the same Client Documentation folder.

A durable daily reminder endpoint is implemented at `/api/scheduled/clientLifecycleReminders`. It authenticates scheduled callers, binds execution to the stored task UID, catches up safely after a missed daily execution, uses unique rule/date keys to prevent duplicates, records delivery attempts, and returns structured diagnostics for failed scheduled runs. The legacy Client Documentation reminder branch is disabled by default so it cannot duplicate this engine; unrelated finance reminders are preserved.

## Exact 23-Rule Implementation

| # | User rule | Trigger and result | Status |
|---:|---|---|---|
| 1 | Welcome when a client first receives application access | Linking a client account to a Client Documentation folder creates the first bilingual welcome activity and notification | Implemented in CRM and mobile-admin account creation |
| 2 | Appointment-booking reminder after two days | If no appointment booking submission and no appointment date exist two days after access, one reminder is created | Implemented with missed-run catch-up and duplicate suppression |
| 3 | Check Embassy email every three days | While no Embassy appointment or confirmed reply exists, reminders are generated in three-day cycles | Implemented; stops automatically when the appointment/reply is confirmed |
| 4 | Embassy appointment reminders three days and one day before | The daily engine creates separate three-day and one-day reminders | Implemented with catch-up inside each reminder window |
| 5 | Schengen visa expiring in 30 days | A bilingual 30-day warning is sent to the assigned client | Implemented |
| 6 | Urgent Schengen visa expiring in 20 days | A separate urgent 20-day warning is sent | Implemented |
| 7 | Embassy Attestation follow-up after 15 days without confirmed reply | A client reminder and responsible-staff email are created after the threshold | Implemented; stops after reply confirmation |
| 8 | Submission date confirmed | First entry of an expected submission date creates an immediate event containing the date | Implemented in the Client Documentation date mutation |
| 9 | Second-payment reminder 12 days before submission | The client receives the second-payment amount and wording that it becomes due within two days | Implemented from the authoritative Client Documentation payment schedule |
| 10 | Critical second-payment warning seven days before submission | If unpaid, the client is told the payment is already due and the critical limit has passed | Implemented from the authoritative payment schedule |
| 11 | Missing-document list every three days | The notification lists all current checklist items not marked received; its key changes when the missing set changes | Implemented |
| 12 | MOFA/Embassy document status update | Submitted-to-MOFA, received-from-MOFA, submitted-to-Embassy, and received-from-Embassy actions create dated document events naming the affected document | Implemented using separate authoritative milestones |
| 13 | Flight-ticket reminder three days before submission | If no ticket link exists, the client is reminded to share the Spain flight ticket | Implemented |
| 14 | Arrival-confirmation reminder one day after travel | If arrival is not confirmed, the client is asked to confirm arrival | Implemented with missed-run catch-up |
| 15 | Submitted to Spain team | Marking Spain-team receipt creates an immediate bilingual activity and notification | Implemented |
| 16 | Submitted for sworn translation | Marking the translation milestone creates an immediate activity and notification | Implemented |
| 17 | Submitted to Spanish Government with receipt | The submission stage creates an immediate event; staff can upload the official receipt securely and its activity link opens through authenticated document access | Implemented |
| 18 | Application approved with approval document | Approval creates a congratulatory bilingual event; staff can upload the approval document securely and its activity link opens through authenticated access | Implemented |
| 19 | Third-payment reminder one day after approval | If the third payment remains unpaid, the notification includes the authoritative payment amount and due date | Implemented with missed-run catch-up |
| 20 | Travel reminder three days after approval | The client is reminded to travel within 30 days to finish biometrics and the remaining legal process | Implemented with calculated or staff-entered travel deadline |
| 21 | Biometrics date booked | Recording the date, time, location, and time zone creates an immediate bilingual activity and notification | Implemented |
| 22 | Biometrics reminder 48 hours before | A second reminder is generated inside the 48-hour window | Implemented with missed-run catch-up |
| 23 | Residence card ready for collection | Marking the card ready creates a bilingual activity containing the collection location and instructions | Implemented |

## Application Activity and Attached Links

The client sees one ordered history for each assigned application. The first item is the welcome event; later items use their true business time and are shown chronologically with the actor, title, operational description, and date/time. Staff-provided checklist links are visible beneath their related document. Client uploads, government submission receipts, approval letters, and reviewed documents open only through authenticated short-lived access. Flight-ticket and hotel-booking links recorded by staff are mirrored into their related travel activity.

The notification center is protected by client authentication and supports read/unread state. Push permission is requested only after a clear client action. Signed clients can control **push**, **application**, **document**, **payment**, and **message** categories in Account & Legal. The in-app activity ledger remains the durable record when push is disabled or no device token exists.

## Client Upload and Staff Review

Every client upload or native scan must reference an owned checklist document key. The backend resolves the authoritative document name, validates file type and size, stores bytes in managed object storage, links the upload to the CRM checklist row, and writes a client-visible activity entry. The mobile Documentation view groups submissions beneath the selected checklist document and shows their review state.

The assigned CRM Client Documentation folder now contains a **Client app uploads** panel. Authorized staff can securely download submissions, mark them under review, accept them, or request replacement with a staff comment. Review metadata records reviewer identity and time. The Client Documentation stage area also accepts secure staff uploads for the Spanish Government submission receipt and approval letter.

## Reliability and Security Controls

| Control | Result |
|---|---|
| Duplicate prevention | Unique lifecycle and reminder keys prevent repeated events for the same rule, case, source date, and reminder window |
| Missed daily run | Threshold/window rules catch up on the next successful run without creating a second copy |
| Delivery evidence | Durable rows record channel, target, attempts, status, timestamps, and sanitized errors |
| Staff email retry | Bounded retry with backoff; completed staff delivery is not resent |
| Schedule ownership | Only authenticated cron identities run the handler; the first valid task UID is persisted and later orphan schedules are skipped |
| Legacy duplicate path | The old Client Documentation branch is off by default; unrelated rent and unpaid-receipt reminders remain active |
| Ownership | Application, activity, checklist, upload, and document-access routes re-check client ownership |
| Identifier exposure | Client APIs use public identifiers and checklist keys; internal database IDs are not returned |
| File storage | File bytes remain in managed object storage; database rows contain metadata and storage references |
| Sensitive evidence | Client and staff documents use authenticated access procedures rather than public object URLs |
| Notification preferences | Push category preferences are evaluated on the server before device delivery |

## Migration and Backfill

The schema change is additive and preserves existing records. It adds authoritative lifecycle timestamps and links where required, checklist-upload linkage, notification idempotency, client application activities, reminder settings and deliveries, biometrics appointment time, and staff-review metadata. Five existing linked applications were backfilled with a welcome activity entry without sending retroactive notifications.

## Validation Evidence

| Validation | Result |
|---|---|
| Managed database migrations | Applied and verified |
| CRM TypeScript diagnostics for changed lifecycle files | No focused errors |
| CRM production build | Passed |
| Lifecycle, Spain workflow, payment, and portal security tests | 11 passed |
| Mobile TypeScript | Passed |
| Mobile lint | Passed |
| Mobile acceptance tests | 20 passed |
| Expo Doctor | 21/21 checks passed |
| Mobile web export | 17 routes exported successfully |
| Protected scheduled endpoint without cron identity | Correctly returns HTTP 401 |
| Existing application activity backfill | Five linked applications processed |

## Deployment Activation

The code and database are ready. After publishing the saved WebDev checkpoint, create one project Heartbeat at a fixed UTC time equivalent to the selected Cairo operating time and persist its returned task UID in `client_reminder_settings`. The implementation is designed for one deterministic daily invocation. Platform retries of transient `5xx`/`429` responses are safe because lifecycle and delivery writes are idempotent.

## Primary Implementation Files

| Area | File |
|---|---|
| Lifecycle events and reminders | `server/clientLifecycleNotificationService.ts` |
| Scheduled callback | `server/scheduledClientLifecycleRemindersHandler.ts` |
| Client API activity and uploads | `server/clientPortalRoutes.ts` |
| Spain lifecycle transitions | `server/clientDocumentationSpainWorkflow.ts` |
| Staff upload review | `server/clientPortalDocumentReviewRouter.ts` |
| CRM client-upload panel | `client/src/components/ClientPortalUploadsPanel.tsx` |
| CRM stage evidence uploads | `client/src/components/ClientStageEvidenceUpload.tsx` |
| Mobile activity and checklist upload workflow | `app/documents.tsx` |
| Mobile notification center | `app/notifications.tsx` |
| Mobile preferences | `app/account.tsx` |
| Additive migrations | `drizzle/0064_client_lifecycle_notifications.sql`, `drizzle/0068_client_portal_document_review.sql` |

# Client Questionnaire via Existing Mobile Document Link — Validation Record

**Date:** 21 September 2026

## Delivery Boundary

This release does **not** modify or rebuild a native mobile application. The installed client app continues using its existing documentation-folder response and its existing document-link action. The CRM backend adds one virtual **Client Questionnaire** item only to an authorized Caribbean/non-Spain application folder. Its `documentLink` opens the responsive questionnaire hosted by ELEVAY.

Spain documentation folders, persisted document checklist items, chat, activity, and mobile process-timeline responses remain unchanged. The inspected mobile source repository was left clean, and the specifically protected `/home/ubuntu/elevay-mobile` path did not exist in the environment.

## Secure Launch

The virtual item receives a five-minute URL containing only a cryptographically random opaque token in the URL fragment. The URL does not expose a client ID, client code, name, email, or application ID, and the token does not enter the initial web request, server access log, or referrer header. The database stores only a SHA-256 token hash and binds it to one active Client Portal user, assigned application, client case, and source session.

Token consumption is atomic and one-time. Malformed, expired, already-used, Spain, revoked-session, revoked-assignment, inactive-user, application-mismatch, case-mismatch, and user-mismatch records are denied. A successful exchange removes the token from the browser address immediately and establishes an isolated Client Portal web session for the questionnaire.

## Questionnaire and Resume Behavior

The responsive web questionnaire displays one question at a time with Back and Next navigation, percentage progress, English and Arabic labels, and explicit Required or Optional status. Its server-driven metadata supports text, date, month, number, email, phone, select, yes/no, acknowledgement, signature, and repeatable-row inputs.

Repeatable tables show one row at a time. Clients can move between rows, add another row, remove a row, skip an optional table, and retain all previously entered rows. Draft writes use the existing protected PUT endpoint and a serialized save queue so a slower request cannot overwrite a newer answer snapshot. The page saves after 2.5 seconds of editing, periodically while unsaved edits remain, and before Back, Next, Skip, or final review. Opening the questionnaire without editing does not create an empty draft.

Every saved draft stores the complete normalized answer set, the current question key, the originating portal user, start time, and latest save time. Reopening the questionnaire reloads those answers and resumes from the saved question. Before immutable submission, the client receives a complete review of every visible answer with direct Edit actions; final submission revalidates every required field on the server.

## Additive Data Changes

Migration 0086 adds the `client_questionnaire_launch_tokens` table and three nullable draft-audit columns—`startedByPortalUserId`, `startedAt`, and `lastSavedAt`—to the existing Caribbean questionnaire table. The Drizzle model is aligned to the already-applied physical `caribbeanQuestionnaires` table and its existing `version` and `answersJson` columns.

The live database contained **28 Client Documentation cases: 26 Spain and 2 Caribbean**. It contained zero questionnaire drafts or submissions before this release. A rollback-only integration check inserted and read a draft for an existing Caribbean case, verified its saved current question, rolled the transaction back, and reconfirmed that zero questionnaire records remained.

## End-to-End Verification

| Check | Verified result |
|---|---|
| Authorized Caribbean document response | Exactly one `client_questionnaire` item with the **Client Questionnaire** label and fragment-based secure link |
| Authorized Spain document response | Zero questionnaire items; original folder response preserved |
| Authorized link launch | Token exchanged once and opened the assigned **Grenada Citizenship** questionnaire at Question 1 of 137 |
| Rendered questionnaire | One question, bilingual labels, Required indicator, progress, Back, Save draft, and Next |
| Unauthorized token | Dedicated privacy-safe unavailable screen; questionnaire remained inaccessible |
| Reused token | Second fresh-page launch denied |
| Draft persistence | Rollback-only insert/read round trip succeeded without leaving a record |
| Validation cleanup | Consumed validation token deleted; generated validation session revoked; temporary endpoint sessions and tokens removed |
| Native app | No source change, route change, or rebuild |

The first browser attempt changed only the hash on an already-mounted questionnaire page, so React correctly did not remount or issue a launch request. The accepted end-to-end result used a true fresh-page navigation, matching how the mobile app opens an external document link.

## Release Evidence

Seventeen focused Client Documentation, Client Portal, payment, Spain workflow, Caribbean workflow, mobile timeline, and security suites passed **98 tests**. The full production build passed with only the three documented pre-existing authentication import warnings. The full TypeScript checker retained **83 unrelated baseline diagnostics** and reported **zero diagnostics in files changed by this release**. `git diff --check` passed, no temporary questionnaire scripts remained, and no validation token value was committed.

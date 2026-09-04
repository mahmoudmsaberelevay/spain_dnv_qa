# ELEVAY Meta Lead Ads and CRM Conversions Integration

## Final Implementation, Live Evidence, Safeguards, and Deployment Report

**Prepared for:** Mahmoud Saber, Country Manager  
**Prepared by:** Manus AI  
**System:** ELEVAY CRM — Leads Module  
**Report date:** 4 September 2026  
**Latest verified checkpoint:** `38f7b5a5`

## 1. Executive summary

The ELEVAY Leads module now has a production-safe Meta Lead Ads integration that receives signed `leadgen` webhooks, durably records notification identifiers before processing, retrieves complete Lead data server-to-server, conservatively matches contacts, preserves immutable inquiry attribution, and creates ordered CRM conversion events in a database outbox. The integration is not a disconnected module; it is embedded in the existing Leads list, Lead profiles, lifecycle actions, signed-contract workflow, Leads Settings, reports, alerts, and administrator operations.

The production routing defect reported for `https://elevay.vip/api/webhooks/meta-leads-v2` has been corrected. The exact plural callback path now reaches the webhook handler before JSON parsing, static files, and the single-page application fallback. Independent live checks confirmed the required verification and signature behavior, and Meta's official Lead Ads Testing Tool reported a successful realtime delivery to the ELEVAY CRM Integration app.

> **Production Conversions API transmission remains disabled.** `META_CRM_PRODUCTION_ENABLED` is absent or false, test-marked records are blocked from the production queue, and no new production conversion event was sent during this remediation. Enabling production CRM events still requires Mahmoud's explicit approval after reviewing this evidence.

## 2. Current status at a glance

| Control area | Final status | Evidence |
|---|---|---|
| Exact production callback | **Fixed and live** | The exact `/api/webhooks/meta-leads-v2` route returns webhook responses rather than CRM HTML. |
| Verification challenge | **Passed** | Valid token returned HTTP 200 and the exact challenge body. |
| Invalid verification token | **Passed** | Returned HTTP 403 with `Forbidden`. |
| Unsigned POST | **Passed** | Returned HTTP 401 with `Invalid signature`. |
| Correctly signed POST | **Passed** | Returned HTTP 200 with a JSON acknowledgement. |
| Meta realtime delivery | **Passed** | Meta Testing Tool reported `Success — Successful webhook integration`. |
| Durable Test Lead processing | **Passed** | One processed inbox row, one immutable attribution, one marked Lead, and one deterministic outbox event. |
| Duplicate prevention | **Passed** | One Meta Lead ID produced one attribution and one distinct event ID. |
| Test Lead isolation | **Passed** | All validation Test Leads are explicitly marked and excluded from operational reporting. |
| Production CAPI | **Disabled** | Environment gate remains disabled; the fresh Test Lead has zero sent production events. |
| Focused regression coverage | **Passed** | 30 focused Meta tests passed. |
| Production build | **Passed** | Frontend and server production build completed successfully. |
| Scheduled recovery | **Enabled** | Daily Heartbeat reconciliation/retry job is registered with task-UID ownership validation. |

## 3. Production routing defect and correction

The reported failure was accurate: the exact callback path contained a plural path segment and hyphenated endpoint name, while the earlier server registrations used different singular route patterns. Because Express did not match the exact public URL, the request continued through the server and reached the static/SPA fallback. That produced HTTP 200 CRM HTML for requests that should have been rejected by the webhook handler.

The correction centralizes Meta webhook registration and explicitly registers the exact production path:

```text
/api/webhooks/meta-leads-v2
```

This route is installed before the general Express JSON parser, tRPC middleware, static serving, and SPA fallback. POST requests use raw `application/json` bytes so the server validates Meta's HMAC against the unchanged body. Compatibility routes remain available, but Meta's registered production callback and operational documentation use the exact verified plural path.

| Live request | Required result | Verified result |
|---|---:|---:|
| Valid GET verification | HTTP 200 plus exact challenge | **Passed** — `elevay-production-proof` |
| Invalid GET token | HTTP 403 | **Passed** — `Forbidden` |
| Unsigned POST | HTTP 401 | **Passed** — `Invalid signature` |
| Correctly signed PII-free POST | HTTP 200 JSON acknowledgement | **Passed** — accepted by the webhook adapter |

The valid verification token and App Secret were used only as server-side secrets. They were not included in source code, logs, the report, frontend responses, or checkpoint descriptions.

## 4. Webhook security and durable ingestion

The webhook adapter verifies GET subscription requests and validates `X-Hub-Signature-256` before parsing a POST payload. Invalid or missing signatures are rejected before database storage. Valid lead notifications are reduced to Meta identifiers and delivery metadata, then inserted into a durable idempotent inbox. The inbox does not store form answers, names, phone numbers, email addresses, tokens, or access credentials.

Acknowledgement is intentionally separated from full Lead processing. Once the notification has been durably accepted, the request returns quickly and deferred processing retrieves the Lead server-to-server. This protects Meta delivery from slow CRM operations and allows failed work to be retried from persistent state.

| Inbox safeguard | Implementation |
|---|---|
| Idempotency | A deterministic webhook key and uniqueness constraint prevent duplicate notification rows. |
| Privacy | Only Lead, Page, Form, Ad, Ad Group, and timestamp identifiers are stored. |
| Recovery | Status, attempts, next-attempt time, last safe error, and processed time are persisted. |
| Error safety | Query strings, bearer tokens, access tokens, and request context are redacted from persisted errors. |
| Fast response | Full retrieval and matching run after durable acknowledgement. |

## 5. Meta Test Lead identification and isolation

Meta Test Leads are no longer inferred from names, phone numbers, email addresses, or other contact values. During ingestion, ELEVAY checks the Form's Meta test-leads registry and explicitly classifies the Meta Lead ID. If Meta cannot confirm the classification, processing fails closed and retries rather than silently treating a possible test record as operational data.

The explicit marker is propagated to four durable layers:

| Layer | Marker |
|---|---|
| CRM Lead | `leads.isMetaTestLead` |
| Immutable inquiry | `lead_meta_attributions.isTestLead` |
| Webhook inbox | `meta_webhook_inbox.isTestLead` |
| CRM event outbox | `meta_crm_event_log.isTestLead` |

Marked Test Leads remain visible in the Leads list and Lead profile with a clear Test Lead badge so administrators can audit them. They are excluded from operational funnel totals, conversion rates, Lead ID/hash coverage, consultant performance, program performance, Campaign/Form analytics, monthly summaries, stage-change reports, new-Lead reports, and daily/user activity reporting.

Test-marked outbox events cannot be transmitted through the production queue. A Test Lead event can leave ELEVAY only through the administrator's explicit test-only action with a Meta Test Event Code. This preserves diagnostic capability while preventing test records from influencing Meta production optimization.

## 6. Lead retrieval, normalization, matching, and deduplication

After signed notification acceptance, the service retrieves the full Lead from Meta using the server-side Page token. ELEVAY preserves Meta's actual Lead creation time and available Page, Form, Campaign, Ad Set, and Ad context. Normalized phone and email values are used for matching and hashing; raw values remain in the authorized CRM Lead record and are not placed in the webhook inbox or outbox payload snapshot.

Matching follows a conservative sequence. The service first checks the unique Meta Lead ID, then normalized phone, then normalized email. A single safe match updates the existing contact and creates a new immutable inquiry attribution. Ambiguous matches are routed to manual review instead of automatically merging records.

This design separates the **person/contact** from the **inquiry**. A returning contact can submit multiple Meta forms over time without creating duplicate CRM Leads or losing the source history of earlier campaigns and advertisements.

## 7. Immutable Meta attribution

Each distinct Meta Lead ID has one immutable attribution row. The row preserves the Page, Form, Campaign, Ad Set, Ad, organic status, source, mapped program, UTM context when available, Meta creation time, and first-received time. New submissions do not overwrite previous inquiry rows.

The Lead profile shows current Meta identifiers, sync state, errors, immutable inquiry history, and CRM event history. Legacy Meta imports that lack a Meta Lead ID retain their historical campaign/form fields and display an accurate coverage notice rather than receiving fabricated attribution.

## 8. CRM event outbox and funnel rules

CRM events are never sent directly from a browser page or generic analytics event. Authoritative business actions create deterministic outbox rows, and only the outbox sender communicates with Meta. The previous direct CAPI helper was retired so it cannot bypass ordering, approval, retry, or audit controls.

| Authoritative ELEVAY action | CRM event | Required prerequisite |
|---|---|---|
| Signed Meta inquiry stored | Initial Lead from Facebook | Durable webhook and immutable attribution |
| Lead moves to Contacted | Contacted | Initial Lead event exists |
| Genuine meeting scheduled or Lead becomes Qualified | Marketing Qualified Lead | Initial Lead event exists |
| Lead moves to Prospect | Sales Opportunity | Marketing Qualified Lead exists |
| Contract changes from non-signed to Signed | Converted | Sales Opportunity exists and Lead match is conservative |

Imported stages are not converted into invented historical events. Event time comes from the real authoritative transition. Converted is queued only for an actual transition into signed contract status, not from a repeated save, inferred date, imported status, browser activity, or approximate match.

Every event has a deterministic SHA-256 event ID, source type and source ID, event time, event name, Lead and Meta Lead identifiers, hash-coverage booleans, status, attempts, next retry, response/error audit, and sent time. Event ordering and uniqueness prevent duplicate conversions.

## 9. CAPI payload privacy and transmission controls

The server builds `system_generated` CRM payloads using real event time, deterministic event ID, Meta Lead ID when available, hashed external ID, mapped program, and non-sensitive internal Lead context. Email and phone are normalized and SHA-256 hashed before inclusion. Unavailable fields are omitted rather than fabricated.

Events older than Meta's accepted seven-day upload window are moved to manual review rather than retried indefinitely. Retryable failures use exponential backoff while retaining the same event ID. Ambiguous matching, missing prerequisites, expired events, and ordering conflicts remain visible for administrator review.

The following independent safeguards currently prevent production conversion sending:

| Safeguard | Current condition |
|---|---|
| Environment approval gate | `META_CRM_PRODUCTION_ENABLED` is disabled. |
| Test Lead guard | `isTestLead` events are blocked from the production queue. |
| Ordered prerequisites | Advanced events cannot send without prior valid funnel events. |
| Seven-day limit | Expired events move to manual review. |
| Deterministic IDs | Retries cannot create new event identities. |
| Admin test action | Requires a Meta Test Event Code and a selected event. |

## 10. Reconciliation and recovery

The legacy in-process Meta polling loop was replaced by a supported Heartbeat schedule. The daily job calls the protected reconciliation endpoint, which accepts only a valid cron identity with the registered task UID. An ordinary authenticated user, an anonymous request, or an orphan cron identity cannot execute reconciliation.

Reconciliation recovers missed Meta Leads, pending or failed inbox records, and eligible outbox retries using persistent cursor/watermark state. This provides recovery if Meta delivery is delayed, a transient Graph request fails, or an application instance restarts.

## 11. Leads user interface and administrator operations

The existing Leads module was extended rather than replaced. The Leads list now supports Meta Form, Campaign, Ad Set, Ad, sync status, and event-status filters. Optional columns expose attribution and lifecycle information, including campaign, ad set, ad, form, sync status, Meta Lead ID coverage, meeting date, and signing date. Test records carry an explicit badge.

Lead profiles display full Meta context, immutable inquiry history, sync/error state, and CRM event history with status, attempts, event ID, timestamps, and safe diagnostic text. Legacy records without immutable Meta IDs show a coverage explanation.

The administrator-only Meta Ops area provides health status, secret-readiness booleans, webhook freshness, Lead synchronization status, event counters, failure-rate warnings, mapping management, date-range funnel reporting, match-quality metrics, diagnostics, reconciliation controls, and test-only retry. Non-administrators are blocked by backend authorization even if they attempt direct API calls.

## 12. Reporting behavior

Meta reports use real timestamps and actual CRM records. Filters cover Program, Campaign, Ad Set, Ad, Form, consultant, Lead status, presets, and custom date ranges. Metrics include Meta Leads, qualified meetings, conversions, funnel rates, event delivery success, processing delays, and Lead ID/hash coverage. The system does not invent ad spend, cost per Lead, return on ad spend, or other unavailable Meta cost data.

Operational reports now apply a reusable `isMetaTestLead = false` condition. This includes general Leads totals and stage distribution, source/campaign/form analytics, monthly trends, stage-change reporting, user activity, daily activity, new-Lead reporting, and Meta Ops funnel/coverage calculations.

## 13. Alerts and email safety

Meta Lead alert emails include the Lead's name and phone number so the assigned team can act without opening the CRM. Alerts go to Mahmoud and the assigned consultant when a consultant address is available. Test Leads do not trigger operational Lead alerts.

The sender policy blocks `@elevay.com` addresses from being configured as senders. ELEVAY-domain addresses may remain recipients. The current development logs also show an unrelated Gmail daily sending-limit response for another reminder workflow; it does not affect webhook acceptance, attribution, or the outbox and should be handled separately if email reminders are required immediately.

## 14. Meta Business configuration completed

The ELEVAY CRM Integration Meta app is published and associated with the Elevay Global Page. The Page administrator granted least-privilege Page permissions, the app is assigned direct Lead Access without removing the existing LSQ connector, and the Page is subscribed to the `leadgen` webhook field. Meta's active callback points to the exact verified production URL.

| Meta component | Verified configuration |
|---|---|
| App | ELEVAY CRM Integration (`2057654031829453`) |
| Page | Elevay Global (`817555428107479`) |
| Active Form tested | Spain 28 April 2026-copy (`1987288625511898`) |
| Callback | `https://elevay.vip/api/webhooks/meta-leads-v2` |
| Webhook object/field | Page / `leadgen` |
| Lead Access | ELEVAY CRM app assigned; LSQ preserved |
| App mode | Published |

## 15. Independent live verification evidence

Meta's Testing Tool created fresh Test Lead `1839262023725676`. The realtime status for the ELEVAY CRM Integration app was **Success — Successful webhook integration**. The notification contained only the expected Page, Form, Lead, and timestamp identifiers.

The database verification deliberately avoided names, phone numbers, email addresses, and form answers. It returned the following counts:

| Database proof for the fresh Test Lead | Count |
|---|---:|
| Durable inbox rows | 1 |
| Inbox rows marked as Test Lead | 1 |
| Processed inbox rows | 1 |
| Immutable attribution rows | 1 |
| Attribution rows marked as Test Lead | 1 |
| CRM Lead rows explicitly marked as Test Lead | 1 |
| Outbox rows | 1 |
| Outbox rows marked as Test Lead | 1 |
| Distinct deterministic event IDs | 1 |
| Sent production events | 0 |

Two earlier Test Leads created during setup were also backfilled. All three validation Test Leads are now marked consistently on the Lead, attribution, inbox, and outbox records. Earlier events accepted through Meta Test Events remain auditable as test sends but are excluded from operational reports.

## 16. Automated validation

Thirty focused tests passed across six Meta suites. Coverage includes the exact production path, middleware ordering, valid and invalid verification, signed and unsigned POST handling, durable-first acknowledgement, notification idempotency, Test Lead registry classification, fail-closed classification, contact matching precedence, repeat-inquiry attribution, deterministic IDs, funnel prerequisites, genuine signed-contract conversion eligibility, seven-day retry behavior, payload hashing/privacy, token redaction, admin authorization, browser tracking isolation, legacy sender isolation, operational report exclusions, and scheduler authentication.

The production build passed. The repository's global TypeScript command still reports 121 pre-existing errors, including legacy backup-download typing and an unsupported DOCX paragraph property. No focused error references the Meta remediation files. The complete historical test suite also contains pre-existing Reports fixture uniqueness collisions. These legacy issues are documented rather than represented as Meta failures.

## 17. Checkpoints and deployment record

| Checkpoint | Purpose | Status |
|---|---|---|
| `048c7a69` | Production remediation implementation: exact route, raw-body registration, durable Test Lead markers, report exclusions, UI badges, production-send blocking, and regression tests | Published |
| `38f7b5a5` | Final independently verified evidence, operations documentation, completed checklist, and confirmation of zero production sends for the fresh Test Lead | **Latest published checkpoint** |

The current project version for review and rollback is `manus-webdev://38f7b5a5`.

## 18. Benefits

| Benefit | Business impact |
|---|---|
| Near-real-time Lead ingestion | New Meta inquiries enter the existing Leads workflow without manual copying. |
| Conservative deduplication | Returning contacts do not automatically create duplicate Lead records. |
| Immutable attribution | Marketing history survives repeated forms and campaigns. |
| Authoritative conversion events | Meta receives CRM outcomes derived from genuine actions rather than page views or guessed dates. |
| Durable recovery | Temporary failures do not silently lose Leads or events. |
| Test isolation | Testing does not inflate funnel, consultant, program, or campaign performance. |
| Approval gate | Production optimization data cannot begin without explicit authorization. |
| Administrator visibility | Health, mappings, failures, coverage, and retries are available without exposing credentials. |

## 19. Trade-offs and remaining risks

The fail-closed Test Lead classifier protects reporting integrity, but a temporary Meta test-registry failure can delay ingestion until retry. This is intentional: a delayed record is safer than silently counting test data as real. The integration also depends on continued Meta Page permissions, App Secret validity, Page token validity, Lead Access assignment, and the published app subscription.

Legacy Meta Leads that predate durable attribution cannot be reconstructed perfectly without original Meta Lead IDs. Their historical fields remain visible, but they are not assigned fabricated inquiry rows. The daily reconciliation job reduces missed-delivery risk but is not a replacement for monitoring webhook freshness.

Production CAPI is deliberately not active, so Meta is not yet receiving real downstream Contacted, Qualified, Opportunity, or Converted events. This is a safeguard, not an implementation defect. Enabling it changes the system from Lead collection to production advertising optimization and should follow a controlled review of the first real Lead.

## 20. Remaining safeguards and approval boundary

No additional implementation blocker remains for Lead Ads ingestion. The remaining action is a business approval decision, not a technical gap.

Before enabling production CAPI, Mahmoud should review one real Meta Lead in the Leads module and confirm the matched contact, program, consultant, Form/Campaign/Ad attribution, immutable inquiry history, and initial outbox event. The Meta Ops report should also remain healthy for at least 24–48 hours with no signature failures, duplicate attributions, unexpected manual-review growth, or stale reconciliation.

Only after that review should the production flag be changed to true through the secure environment-secret mechanism. The flag must not be changed in source code, ordinary settings forms, database text fields, or chat. After activation, the first production event should be monitored in both Meta Ops and Meta Events Manager before normal queue processing is allowed to continue unattended.

## 21. Final conclusion

The production routing defect is fixed and independently proven on the exact callback URL. Meta's official tool successfully delivered a fresh Lead to ELEVAY CRM Integration. That record was processed exactly once, explicitly marked as a Test Lead, excluded from operational reporting, and prevented from production transmission. The durable ingestion, matching, immutable attribution, ordered outbox, reconciliation, administrator operations, security controls, and UI visibility are implemented and deployed.

**Final control state:** Lead Ads ingestion is live; Test Lead isolation is live; production Conversions API transmission is still disabled pending Mahmoud's explicit approval.

## References

[1]: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/ "Meta Lead Ads: Retrieving Leads"
[2]: https://developers.facebook.com/docs/marketing-api/conversions-api/ "Meta Conversions API"
[3]: https://developers.facebook.com/tools/lead-ads-testing/ "Meta Lead Ads Testing Tool"

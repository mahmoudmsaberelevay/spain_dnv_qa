# Meta Lead Ads and CRM Events Operations

**Owner:** ELEVAY administrators  
**Scope:** ELEVAY Leads module  
**Last updated:** 4 September 2026

## Purpose

This integration receives Meta Instant Form notifications, stores each notification in a durable PII-free inbox, retrieves the full Lead server-to-server, conservatively matches it to the existing Leads database, and preserves every Meta inquiry as immutable attribution history. CRM conversion events are created only from authoritative ELEVAY business actions and leave the system only through the ordered database outbox.

Meta documents Page webhook subscription and Lead Ads retrieval in its [Lead Ads webhook documentation][1]. CRM events are sent through the [Conversions API][2] using real event times and deterministic event identifiers.

## Architecture and safety boundaries

| Area | Production behavior |
|---|---|
| Webhook verification | GET returns the challenge only for the exact configured verify token. POST requires a valid `X-Hub-Signature-256` HMAC created with the Meta App Secret. |
| Durable receipt | The raw notification is parsed only after signature validation. The inbox stores Meta IDs and delivery metadata, not form answers, names, phones, or emails. |
| Lead retrieval | Full answers are requested server-to-server from `/{leadgen_id}` using the Page access token. |
| Contact matching | Meta Lead ID is checked first, then normalized phone, then normalized email. Ambiguous matches are routed to manual review rather than merged automatically. |
| Attribution | Every distinct Meta Lead ID produces an immutable inquiry row. A returning contact can therefore retain multiple Form, Campaign, Ad Set, and Ad inquiries on one CRM Lead. |
| CRM events | Events are queued from genuine Lead stage/activity transitions and signed-contract transitions only. Browser page views and general analytics never create CRM conversions. |
| Delivery | The outbox enforces deterministic event IDs, prerequisite ordering, retry backoff, the seven-day upload window, dead-letter/manual-review states, and response auditing. |
| Customer data | Email and phone are normalized and SHA-256 hashed before transmission. Outbox snapshots contain hashes and non-sensitive CRM context, not raw contact data. |
| Production approval | `META_CRM_PRODUCTION_ENABLED` must equal `true` before production events can be transmitted. It must remain absent or false during setup and Test Events validation. |
| Test retries | Manual retry requires a Meta Test Event Code and retries only the selected outbox event. It cannot silently replay the production queue. |

## Authoritative funnel mapping

| ELEVAY action | Meta CRM event | Required prerequisite |
|---|---|---|
| New Meta inquiry stored | Initial Lead from Facebook | Signed webhook inquiry and durable attribution |
| Lead moves to Contacted | Contacted | Initial Lead event |
| Genuine meeting is scheduled or Lead becomes Qualified | Marketing Qualified Lead | Initial Lead event |
| Lead moves to Prospect | Sales Opportunity | Marketing Qualified Lead event |
| Contract changes from a non-signed status to Signed | Converted | Sales Opportunity event and conservative Meta-attributed Lead match |

Imported historical stages are not converted into fabricated backdated events. Legacy Meta records that lack Meta Lead IDs keep their existing Form/Campaign/Ad fields and show a coverage notice in the Lead profile. A future signed webhook submission can add immutable attribution to the existing contact.

## Required server configuration

| Setting | Current role |
|---|---|
| `META_PAGE_ACCESS_TOKEN` | Retrieves Lead details and reconciles missed Form leads. An existing stored integration token is supported for backward-compatible read access but is never returned to the browser. |
| `META_PAGE_ID` | Identifies the Page that owns the Instant Forms. Existing stored Page metadata is supported. |
| `META_APP_SECRET` | Required for POST signature validation. This must be present as a server secret before a real webhook can be accepted. |
| `META_WEBHOOK_VERIFY_TOKEN` | Used during Meta webhook subscription. If absent, the existing Meta integration webhook token is reused server-side and is not returned through the API. |
| `META_CAPI_TOKEN` | Authenticates Conversions API requests. |
| `META_DATASET_ID` or `META_PIXEL_ID` | Identifies the Meta dataset receiving CRM events. |
| `META_CRM_PRODUCTION_ENABLED` | Explicit production transmission switch. Keep false until Test Events validation is approved. |

No secret value may be entered in a normal Leads form, returned by tRPC, printed in logs, included in diagnostics, or committed to source control.

## Meta Business configuration

In Meta for Developers, configure the public callback as `https://elevay.vip/api/webhook/meta-leads`, use the existing ELEVAY verify token, and subscribe the connected Page to the `leadgen` field. The Meta App Secret must be stored in ELEVAY server secrets before completing the subscription. Confirm that the Page token can list the Page's leadgen forms and retrieve a test Lead.

Use Meta's [Lead Ads Testing Tool][3] to create a test Lead. Confirm in **Leads Settings → Meta Ops** that the webhook time updates, the Lead is retrieved, the existing contact is matched or a single new Lead is created, and the immutable inquiry appears. Then use Meta Events Manager Test Events with a Test Event Code to validate the selected queued CRM event. Do not enable production transmission during this step.

## Admin operations

The Meta Ops tab is restricted in both the interface and the backend to administrators. It provides secret-safe readiness booleans, last webhook/sync/event timestamps, pending and failure counts, Lead ID and hash coverage, mapping management, real-timestamp funnel reporting, reconciliation, failure diagnostics, and test-only retry.

Daily reconciliation should call `POST /api/scheduled/metaReconciliation` through the supported Heartbeat scheduler. The route accepts only an authenticated cron identity with a task UID. It must not be called by an ordinary user session or an anonymous request.

## Validation evidence

| Validation | Result |
|---|---|
| Focused Meta Vitest suites | 24 tests passed across signature verification, durable receipt ordering, matching, immutable inquiries, deterministic IDs, event prerequisites, seven-day window, payload privacy, token redaction, admin authorization, browser isolation, and cron authentication. |
| Production build | Passed. Existing bundle-size and unrelated legacy authentication import warnings remain outside this Meta change. |
| Complete project test run | Meta tests passed. The global run still has pre-existing Reports fixture collisions caused by duplicate unique report dates; these are unrelated to the Meta integration. |
| Authenticated desktop UI | Leads filters, column chooser, Lead profile, Meta Ops health/reporting/mappings/diagnostics, and approval gate rendered successfully against live CRM data. |
| Mobile rendering | Leads Settings uses a horizontally scrollable tab strip; the Leads list and filters render at a 390-pixel viewport. |
| Endpoint protection | A wrong verification token returns 403, an invalid POST signature returns 401, and an anonymous scheduled request returns 401. |

## Go-live sequence

Production readiness requires the Meta App Secret, successful Page `leadgen` subscription, one successful Test Lead, one successful Test Events transmission, and administrator review of matching and event ordering. Only after those checks should `META_CRM_PRODUCTION_ENABLED` be set to `true`. After activation, monitor Meta Ops for webhook freshness, reconciliation status, pending/retrying/dead-letter events, upload-window expiry, and Lead ID/hash coverage.

## References

[1]: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/ "Meta Lead Ads: Retrieving Leads"
[2]: https://developers.facebook.com/docs/marketing-api/conversions-api/ "Meta Conversions API"
[3]: https://developers.facebook.com/tools/lead-ads-testing/ "Meta Lead Ads Testing Tool"

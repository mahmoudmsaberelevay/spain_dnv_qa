# Spain Digital Nomad Landing Page → ELEVAY Leads Integration

## Final Architecture, Controlled Verification, Safeguards, and Operations Runbook

**Prepared for:** Mahmoud Saber, Country Manager  
**Prepared by:** Manus AI  
**System:** ELEVAY CRM — Leads Module  
**Verification date:** 7 September 2026  
**CRM checkpoint:** `f3ac27b4`  
**Landing website checkpoint:** `357e1bb3`

## 1. Executive summary

The public Spain Digital Nomad qualification form now forwards every locally accepted, qualified submission to the existing ELEVAY Leads module through a **server-to-server pull design**. The visitor’s browser continues to communicate only with the landing website. It never receives a CRM credential, forwarding secret, opaque pull token, or CRM payload, and it never submits contact data directly to `elevay.vip`.[1] [2]

The CRM creates a new Lead only when no unique normalized phone or email match exists. A unique match preserves the existing Lead, while conflicting or multiple matches enter manual review rather than being merged automatically. Every accepted external submission has one durable inquiry-ledger row, enabling safe retries and concurrent-delivery protection.[2] [3]

> **Meta Lead Ads ingestion remains unchanged and independent.** Spain landing submissions do not create Meta attribution, webhook-inbox, or CRM-event outbox rows. `META_CRM_PRODUCTION_ENABLED=false` remained confirmed during the final verification, so production Conversions API transmission is still disabled.

## 2. Current status

| Control area | Final status | Verified evidence |
|---|---|---|
| Public Arabic qualification journey | **Passed** | All three qualifying answers completed and the contact form submitted successfully. |
| Landing storage outcome | **Passed** | The public mutation returned HTTP 200, displayed the success page, and reported a non-duplicate local submission. |
| CRM ingestion | **Passed** | One new durable inquiry and one new CRM Lead were added. |
| Required Lead source | **Passed** | The inquiry and Lead use exactly `Spain_landing page`. |
| Required CRM program | **Passed** | The inquiry and Lead use `Spain DNV`. |
| Conservative matching | **Passed** | The controlled unique contact produced `matchMethod=new` and `status=created`. |
| Activity history | **Passed** | Exactly one landing-source Lead activity was created. |
| Idempotent replay | **Passed** | The replay returned HTTP 200 with `duplicate=true`; Lead, inquiry, and activity counts stayed unchanged. |
| Leads user interface | **Passed** | The authenticated All Leads table displayed the controlled record at the top with program `Spain DNV`, source `Spain_landing page`, and stage `Fresh`. |
| Meta attribution isolation | **Passed** | The controlled Lead has zero immutable Meta-attribution rows. |
| Meta CRM-event isolation | **Passed** | The controlled Lead has zero Meta CRM-event outbox rows. |
| Production CAPI | **Disabled** | `META_CRM_PRODUCTION_ENABLED=false` was reconfirmed after deployment. |
| Regression coverage | **Passed** | Nine focused CRM tests and thirteen landing tests passed; both production builds passed. |

## 3. End-to-end architecture

The integration deliberately separates the public browser, landing server, and CRM server. The browser follows the existing three-question bilingual flow and submits the existing landing mutation. The landing backend validates qualification, stores or retrieves the local submission, creates a short-lived HMAC-protected opaque token, and forwards only an integer submission reference plus the opaque token to ELEVAY CRM.[1] [4]

The CRM then calls the landing website’s private pull endpoint. The landing backend validates the token, verifies that the referenced submission exists and is qualified, and returns a strict allowlisted payload. The CRM validates that payload again before matching or creating a Lead and recording the durable inquiry outcome.[2] [4]

| Step | Component | Action | Data boundary |
|---:|---|---|---|
| 1 | Visitor browser | Completes the Arabic or English three-step qualification flow and contact form. | Browser sends contact data only to the landing website. |
| 2 | Landing backend | Validates qualification and preserves the existing local submission/duplicate behavior. | No CRM credential is exposed to the browser. |
| 3 | Landing backend | Creates a short-lived opaque pull token and calls the CRM intake endpoint. | Forwarded request contains only `submissionId` and `pullToken`. |
| 4 | CRM backend | Calls the private landing pull alias server-to-server. | CRM does not trust browser-supplied contact fields. |
| 5 | Landing backend | Validates the token and returns one allowlisted qualified payload. | Invalid tokens return a non-disclosing not-found response. |
| 6 | CRM backend | Claims the external submission, matches conservatively, creates or links one Lead, and writes activity history. | One unique ledger row controls retries and concurrency. |

## 4. Production endpoints

| Purpose | Method and endpoint | Public behavior |
|---|---|---|
| CRM submission-reference intake | `POST https://elevay.vip/api/integrations/spain-landing` | Accepts only a strict JSON object containing `submissionId` and `pullToken`; invalid shapes return HTTP 400 JSON. |
| Private landing payload pull | `POST https://elevayconsult-yttdaxru.manus.space/api/trpc/integrations/spain-dnv-leads/pull` | Validates the opaque token and referenced local submission; invalid tokens return HTTP 404 JSON. |
| Compatibility landing pull route | `POST /api/integrations/spain-dnv-leads/pull` on the landing website | Retained for compatibility; CRM production uses the `/api/trpc/` alias. |
| Visitor-facing page | `GET https://elevayconsult-yttdaxru.manus.space/spain-digital-nomad?lang=ar` | Preserves the Arabic/English qualification and success/error experience. |

The CRM route is registered before generic website ingestion, tRPC middleware, static assets, and the single-page application fallback. Live invalid-request checks returned JSON from both handlers rather than HTML from either website’s SPA fallback.[2] [5]

## 5. Qualification and allowed fields

The landing backend accepts only the established qualified pathway. The visitor must select residency/investment/business/financial intent, select either freelancer/business owner or high-salary employee, confirm the programme-fee commitment, provide a valid allowed-country phone number, and confirm consent.[1]

| Field | Validation | CRM use |
|---|---|---|
| `submissionId` | Positive integer; must match the pulled payload. | Durable external identity and idempotency key. |
| `fullName` | Trimmed, 2–256 characters. | New Lead name only; not used to merge contacts. |
| `email` | Valid email or empty/null. | Normalized fallback match after phone. |
| `phoneE164` | Strict E.164 format. | Primary normalized contact match. |
| `phoneCountry` | `AE`, `SA`, `KW`, `QA`, `OM`, or `EG`. | Qualification context. |
| `language` | `en` or `ar`. | Lead preferred language and inquiry context. |
| `lookingFor` | Exact qualifying intent literal. | Server-side qualification enforcement. |
| `jobPosition` | Freelancer/business owner or high-salary employee. | Lead occupation and inquiry context. |
| `feeCommitment` | Exact `yes` literal. | Server-side qualification enforcement. |
| `consentConfirmed` | Must be `true`. | New-Lead consent fields only. |
| `program` | Exact landing programme literal. | Mapped to CRM programme `Spain DNV`. |
| `source` | Exact landing source literal. | Mapped to CRM Lead source `Spain_landing page`. |
| `submittedAt` | ISO datetime. | New-Lead consent timestamp. |

The browser does not choose the CRM source or programme values. Those are fixed server-side as `Spain_landing page` and `Spain DNV`, preventing a visitor from injecting arbitrary CRM routing or attribution values.[2]

## 6. Lead matching, preservation, and consent

The CRM compares normalized phone and email values only against non-test Leads. Phone is authoritative when it identifies exactly one Lead. Email is used only when phone finds none. If phone and email point to different Leads, or either identifier returns multiple possible records, the inquiry is marked for manual review.[2]

| Match condition | Outcome | Existing-record behavior |
|---|---|---|
| One unique phone match; email absent or agrees | `matched` by phone | Preserve source, stage, consultant, consent, Meta attribution, and history. |
| No phone match and one unique email match | `matched` by email | Preserve source, stage, consultant, consent, Meta attribution, and history. |
| Conflicting phone/email or multiple candidates | `manual_review` | Do not merge or overwrite a Lead automatically. |
| No phone or email match | `created` | Create one fresh Spain DNV Lead with the landing source and confirmed consent. |

Consent from the landing form is applied only when a new Lead is created. A returning contact’s existing consent state is not overwritten by a new inquiry. New landing Leads are explicitly non-test, have `metaAssignmentStatus=not_applicable`, and do not enter the Nouran Meta auto-assignment path.[2]

## 7. Idempotency and concurrency safety

The `spain_landing_inquiries` table has a unique `externalSubmissionId`. The first request inserts or claims the ledger row with a cryptographically random processing token. Only the claimant may complete matching and Lead creation. Concurrent requests that lose the claim return the durable ledger state rather than performing duplicate work.[2] [3]

After a submission reaches `created`, `matched`, or `manual_review`, later requests return the stored outcome with `duplicate=true`. This early durable-ledger check is why the controlled replay could use a non-sensitive placeholder token: the CRM did not call the landing pull endpoint or process the contact again.

## 8. Security and privacy controls

| Control | Implementation |
|---|---|
| Browser isolation | No CRM credential, opaque pull token, or direct CRM contact payload exists in browser code or browser requests. |
| Short token lifetime | Pull tokens expire after a short server-defined period. |
| Token binding | The HMAC token binds the submission reference and expiry. |
| Constant-time validation | Token signatures are compared using timing-safe comparison. |
| Qualification revalidation | Both landing and CRM backends enforce the exact qualification contract. |
| Strict allowlists | Request and pulled-payload schemas reject unknown or malformed fields. |
| Payload size limit | CRM rejects intake requests over 4,096 bytes. |
| Abuse protection | CRM applies a bounded per-IP request rate. |
| Safe public errors | Public responses do not expose tokens, contact values, database errors, or internal stack traces. |
| No token persistence | The opaque pull token is not stored in the CRM inquiry ledger. |
| Safe evidence | Final verification used counts and status fields; no contact values or credentials are recorded in this runbook. |

## 9. Controlled production verification

One clearly synthetic, qualified record was submitted through the published Arabic visitor journey after explicit approval. The contact values were used only for the controlled transaction and are intentionally omitted from this report.

| Verification point | Before | After first submission | After replay |
|---|---:|---:|---:|
| Total CRM Leads | 9,255 | 9,256 | 9,256 |
| Leads with source `Spain_landing page` | 1 | 2 | 2 |
| Spain landing inquiry-ledger rows | 1 | 2 | 2 |
| Ledger rows for the controlled external submission | 0 | 1 | 1 |
| Landing-source activities for the controlled Lead | 0 | 1 | 1 |
| Meta CRM-event rows for the controlled Lead | 0 | 0 | 0 |
| Immutable Meta-attribution rows for the controlled Lead | 0 | 0 | 0 |

The first visitor transaction returned HTTP 200, displayed the Arabic success page, and reported `duplicate=false` from the landing mutation. The newest CRM inquiry reported `source=Spain_landing page`, `program=Spain DNV`, `language=ar`, `jobPosition=freelancer_or_business_owner`, `matchMethod=new`, `status=created`, no processing token, and no error code.

The replay returned HTTP 200 with `duplicate=true` and the durable outcome `created`. All relevant Lead, inquiry, activity, Meta-event, and Meta-attribution counts remained unchanged after that replay.

## 10. Leads user-interface verification

The authenticated ELEVAY All Leads screen loaded 9,256 Leads and displayed the controlled record as the newest table row. The visible operational fields showed **Program: Spain DNV**, **Source: Spain_landing page**, **Stage: Fresh**, and **Assigned: Unassigned**. No Meta Test Lead badge or Meta Instant Form source was shown for the controlled landing record.

The UI verification screenshot is intentionally not attached to this runbook because the operational Leads table contains contact details for other real Leads. The count-safe database and route evidence above is the shareable verification record.

## 11. Meta and Nouran isolation

The Spain landing service does not call Meta webhook ingestion, Meta Lead retrieval, Meta attribution creation, the CRM-event outbox, test-event dispatch, or the Nouran Meta assignment policy. It creates no `meta_webhook_inbox`, `lead_meta_attributions`, or `meta_crm_event_log` row for a landing Lead.[2]

Existing Meta routes, immutable attribution, Test Lead markers, report exclusions, Nouran assignment, durable outbox ordering, and monitoring remain unchanged. Production CAPI continues to require the separate explicit environment approval `META_CRM_PRODUCTION_ENABLED=true`; the value remained false throughout this verification.[6]

## 12. Validation record

| Validation | Result |
|---|---|
| Landing TypeScript check | Passed |
| Landing focused Spain DNV suites | 13 tests passed |
| Landing production build | Passed |
| CRM Spain landing service suite | Passed |
| CRM browser/Meta isolation suite | Passed |
| CRM production routing/Test Lead isolation suite | Passed |
| CRM focused total | 9 tests passed |
| CRM production build | Passed |
| Live CRM invalid-shape route check | HTTP 400 JSON: handler reached |
| Live landing invalid-token pull check | HTTP 404 JSON: handler reached |

The CRM build emitted three known pre-existing `server/_core/auth-routes.ts` bundler warnings. The managed TypeScript health watcher also reports unrelated legacy errors and a stale missing-export diagnostic for `spainLandingInquiries`; the export is present in `drizzle/schema.ts`, the migration is applied, focused tests pass, and the production build succeeds.[3]

## 13. Monitoring and operational checks

Operations can monitor the integration without viewing contact values by tracking the following aggregates:

| Check | Healthy expectation |
|---|---|
| Inquiry status distribution | New records normally end in `created` or `matched`; `failed` should remain zero or be investigated promptly. |
| Processing claims | Completed rows should have `processingToken IS NULL`. |
| Error codes | Completed rows should have `lastErrorCode IS NULL`. |
| Lead linkage | Every `created` or `matched` inquiry should have one non-null `leadId`. |
| Source consistency | New landing-created Leads and inquiry rows should use exactly `Spain_landing page`. |
| Programme consistency | New landing-created Leads and inquiry rows should use `Spain DNV`. |
| Meta isolation | Landing Leads should have zero Meta attribution and zero Meta CRM-event rows. |
| Replay behavior | Repeated external submission references should keep one ledger row and one Lead linkage. |

## 14. Deployment and rollback

| Checkpoint | Purpose | Status |
|---|---|---|
| CRM `ae9fc22a` | Initial intake service, source seed, durable ledger, matching, activity history, and Meta isolation | Published predecessor |
| CRM `f3ac27b4` | Production-routed landing pull alias plus regression validation | Published implementation checkpoint |
| CRM `543b497e` | Controlled end-to-end verification, replay evidence, and initial operating runbook | Published verification checkpoint |
| Landing `357e1bb3` | Server-only forwarding plus production `/api/trpc/` private pull alias | Published predecessor |
| Landing `48d9a9e1` | Restored both private pull aliases before generic tRPC/static handling | Published predecessor |
| CRM `6a394f9c` | Added secure primary-to-compatibility pull failover for routing resilience | Published resilience checkpoint |
| Landing `104bbca2` | Six-hour reconciliation, durable run ledger, single-use controlled-run gate, and guaranteed claim cleanup | **Current published landing version** |

The least disruptive rollback is to remove or revert only the landing router’s call to `forwardSpainDnvLeadToCrm(lead.id)` and republish the landing website. This immediately stops CRM forwarding while preserving the public qualification form, local landing storage, duplicate behavior, owner notification, Arabic/English experience, and all ELEVAY CRM data already created.[1]

If the CRM implementation itself must be rolled back, restore the CRM to checkpoint `7aaf1e7b`, the last published version before the Spain landing intake feature. The additive `spain_landing_inquiries` table can safely remain in the database while unused; no destructive schema rollback is required. Existing Leads created or matched before rollback must be preserved.

Meta webhook routes, Meta credentials, the durable Meta inbox/outbox, Test Lead safeguards, production CAPI gate, and Nouran assignment must not be changed as part of a Spain landing rollback.

## 15. One-time historical backfill — 7 September 2026

A privacy-safe production audit found **18 qualified Spain Digital Nomad landing submissions**. Two already had durable CRM inquiry rows from the controlled integration verification, leaving **16 unsynchronized historical submissions**. Mahmoud selected a one-time secure backfill rather than a permanent administrative control.

The landing website task created a temporary server-side runner that selected only records meeting the exact qualification contract, sorted them by submission ID, and reused `forwardSpainDnvLeadToCrm(id)` sequentially. A dry-run reported 18 eligible IDs, the expected minimum and maximum ID boundary, and a deterministic SHA-256 hash of the sorted ID list. TypeScript checking and 14 focused landing/backfill tests passed before apply mode was authorized.[4]

| Backfill execution metric | Result |
|---|---:|
| Eligible submissions in the frozen dry-run list | 18 |
| Attempted | 18 |
| Successful server-to-server responses | 18 |
| Idempotent duplicate responses | 2 |
| Previously unsynchronized records processed | 16 |
| Failed responses | 0 |
| Stopped early | No |

Post-run CRM verification found **18 historical inquiry rows and 18 distinct Lead links** inside the audited ID boundary. All 18 have `status=created`, exact source `Spain_landing page`, programme `Spain DNV`, released processing claims, no error code, the expected Arabic/consent/non-test context, and exactly one landing-source activity. The historical set has **zero manual-review rows, zero failed rows, zero processing rows, zero Meta attribution rows, and zero Meta CRM-event rows**.

One additional qualified live submission arrived after the dry-run boundary and synchronized automatically during the execution window. It was not part of the frozen historical batch. Consequently, the overall database moved from 9,256 to 9,273 Leads and from 2 to 19 Spain-landing-source Leads: 16 historical backfill creations plus one independent contemporaneous live submission.

The temporary runner and its one-off test artifact were removed after success. No permanent route or application code was added to the landing website, and no landing checkpoint or publication was required for that backfill. The live landing version at the time of the backfill was `357e1bb3`. `META_CRM_PRODUCTION_ENABLED=false` was reconfirmed after the backfill.

## 16. Live alias regression and repair — 7 September 2026

A later landing deployment temporarily allowed `POST /api/trpc/integrations/spain-dnv-leads/pull` to fall through to the generic tRPC router, which returned a path-not-found response instead of the private token handler. The public landing page remained available, the CRM intake route remained active, the compatibility private pull alias remained available, and all 21 previously synchronized inquiry/Lead links remained intact with zero failed or stuck records.

Landing version `48d9a9e1` restored both private POST aliases before generic tRPC/static/SPA handling. Live verification then proved both aliases return HTTP 404 `Not found` for a correctly shaped but invalid opaque token, while the CRM intake endpoint returns HTTP 400 `Invalid submission reference` for an invalid public request. These are the intended privacy-safe handler responses.

The CRM additionally gained defense in depth: it tries the production-routed `/api/trpc/` alias first and, only for a route 404 or transport failure, retries the same server-only request through the compatibility alias. Fifteen focused Spain landing, shared-deduplication, and Meta-isolation tests passed, and the production build succeeded.[2]

An already authorized synthetic Spain submission then synchronized successfully after publication, increasing the durable set from 21 to **22 inquiry rows and 22 distinct Lead links**. All 22 have outcome `created`, exact source `Spain_landing page`, programme `Spain DNV`, no failed/processing/manual-review rows, and zero Meta attribution or Meta CRM-event rows.

## 17. Complete qualified-submission reconciliation — 8 September 2026

A fresh privacy-safe audit found **32 currently qualified Spain DNV landing submissions**. The one-time server-side reconciliation processed the exact audited set sequentially through `forwardSpainDnvLeadToCrm(id)`: all 32 requests succeeded, 26 returned idempotent duplicate outcomes, six previously unsynchronized references were processed, zero requests failed, and execution did not stop early. The temporary runner was removed after completion; no permanent landing route or website publication was required.

Post-run CRM verification found **32 distinct external submission references**, 32 linked inquiry outcomes, and **31 distinct Lead records**. This is the expected conservative result: 31 inquiries created Leads and one inquiry matched an existing Lead rather than creating a duplicate. Every linked inquiry has exact source `Spain_landing page`, programme `Spain DNV`, non-test context, released processing claims, and no error code. There are zero failed, processing, or manual-review outcomes, zero Meta attribution rows, and zero Meta CRM-event rows. `META_CRM_PRODUCTION_ENABLED=false` was reconfirmed after the reconciliation.

## 18. Automated six-hour reconciliation — 8 September 2026

The landing project now runs one authenticated managed reconciliation job at **00:00, 06:00, 12:00, and 18:00 Africa/Cairo time**. The platform schedule is `0 0 3,4,9,10,15,16,21,22 * * *`; paired UTC hours make the schedule safe across Cairo daylight-saving transitions, while the server-side Cairo window gate executes only the valid local slot and treats the companion trigger as a no-op. Exactly one matching managed job is enabled.

Each valid run authenticates the managed task identity, verifies durable task ownership, claims one unique local time slot, rejects overlaps, recovers only genuinely stale claims, and processes qualified pending or failed submissions sequentially in bounded batches of 25. Existing immediate per-submission forwarding remains the primary path. The six-hour job is a reconciliation safety net and reuses the same qualification gate, opaque-token pull, conservative Lead matching, exact source/program attribution, and Meta-isolated CRM intake.[2] [4]

Landing version `104bbca2` fixed the controlled-run validation path so a valid single-use authorization can execute outside the normal Cairo window, creates a durable run-ledger row, consumes the authorization atomically, and releases the settings claim on every completion or exception path. The focused landing validation completed with **28 passing tests**, TypeScript checking, and a production build.

Two bounded controlled production batches validated the live workflow. The first completed run attempted 25 qualified records and received 25 matched/idempotent outcomes with zero failure or manual review. The second completed run attempted the remaining seven and received seven matched/idempotent outcomes with zero failure or manual review. Final landing state is **32 matched, zero pending, zero failed, zero manual-review, zero stale-processing, and zero active claims**.

Independent CRM verification remains authoritative for the resulting customer records: there are 32 distinct landing inquiry references linked to 31 distinct Leads, comprising 31 `created` outcomes and one conservative `matched` outcome. All 32 inquiry rows retain exact source `Spain_landing page` and programme `Spain DNV`; there are no processing claims or error codes. The linked Lead set contains zero Meta Test Leads, zero Meta Lead IDs, zero immutable Meta attribution rows, and zero Meta CRM outbox rows. The production CAPI path remains disabled because dispatch requires `META_CRM_PRODUCTION_ENABLED === "true"`, and the variable is not enabled.[2] [3] [6]

| Operating action | Procedure |
|---|---|
| Monitor | Review the managed schedule execution history and the landing reconciliation run ledger. Use aggregate counts only: eligible, attempted, matched/synchronized, manual review, failed, pending, and stale-processing. |
| Retry | Leave failed or pending qualified rows unchanged; the next valid six-hour slot selects them automatically. Investigate before manually retrying a systemic failure. |
| Pause | Pause the single managed reconciliation job and set the durable reconciliation setting to disabled. Immediate visitor-submission forwarding remains available unless separately disabled. |
| Resume | Re-enable the durable setting, then resume the same managed task. Confirm there is exactly one matching job and verify the next Cairo-valid trigger. |
| Roll back | The safest rollback is to pause the managed job while retaining the additive tables and all existing Lead/inquiry history. Revert only the scheduled handler, route registration, and sync-state writes after reviewing newer landing changes; do not roll back the entire website blindly. |

## 19. References

[1]: ../../elevay-website/server/routers/spainDnvLanding.ts "Landing qualification submission router"
[2]: ../server/spainLandingLeadsService.ts "ELEVAY CRM Spain landing ingestion service"
[3]: ../drizzle/schema.ts "ELEVAY CRM schema, including Spain landing inquiry ledger"
[4]: ../../elevay-website/server/spainDnvCrmForwarding.ts "Landing server-only HMAC forwarding and private payload pull"
[5]: ../server/_core/index.ts "ELEVAY CRM route registration order"
[6]: ./META_LEADS_FINAL_IMPLEMENTATION_REPORT.md "Meta Leads implementation and production safeguards"

# Spain DNV Landing Reconciliation Investigation

**Alerted slot:** `2026-09-14T00:00:00 Africa/Cairo`  
**Landing URL:** `https://elevayconsult-yttdaxru.manus.space/spain-digital-nomad?lang=ar`  
**Landing website ID:** `YTTDAXrUNpcFjUU52AAzrW`  
**Published landing version observed:** `ae09c725`

The notification reported one attempted submission and zero synchronized or matched outcomes. The landing repository is `mahmoudmsaberelevay/elevay-website`, with the six-hour reconciliation implementation at commit `fd678893`. The scheduled handler uses the durable `spain_dnv_reconciliation_runs` and `spain_dnv_reconciliation_settings` tables, claims Cairo slots, retrieves pending internal submission IDs, forwards each submission through the existing idempotent private CRM path, and stores count-only outcomes.

The landing project and CRM are intentionally separate managed websites and databases. The original ELEVAY website task (`qLCZ9OGio1BY7Hl6sao9pg`) owns the landing website context; it must be used for production database and schedule investigation. No client name, phone, email, request token, database URL, or record content should be included in the investigation output.

Required resolution evidence: sanitized failure code or nonterminal outcome; one final inquiry outcome and conservative Lead linkage; source `Spain_landing page`; zero duplicate Leads; zero landing-generated Meta attribution/outbox rows; and a clean future six-hour schedule state.

## Gmail Alert Evidence

The connected mailbox `mahmoud.saberelevay@gmail.com` contains one notification thread with the subject **Spain DNV CRM reconciliation attention required**. The first observed failure was the `2026-09-10T18:00 Africa/Cairo` slot, followed by the same aggregate outcome every six hours through the user-reported `2026-09-14T00:00 Africa/Cairo` slot:

`attempted=1; synchronized=0; matched=0; manual_review=0; failed=1; result=failed`

The notification body contains no contact data and no sanitized error code. This proves the same single pending submission has repeatedly failed rather than the alert representing a one-time empty or manual-review run.

**Sources:** Gmail thread `1a08bdad665dc5b5`; landing repository `mahmoudmsaberelevay/elevay-website`; landing website status from the Manus Website API for task `qLCZ9OGio1BY7Hl6sao9pg`.

## Root Cause and Repair

CRM production logs showed the landing ingestion failing with HTTP **403** immediately before each sanitized `LANDING_INGESTION_FAILED` entry. The landing website successfully called the CRM ingestion endpoint. The CRM then attempted to retrieve the qualified payload from the landing website's routed alias under `/api/trpc/...`; the landing site's authentication middleware intercepted that alias and returned 403. Although the CRM already had a dedicated public compatibility pull route, its fallback logic continued only after a 404 or a transport failure, so it never attempted the working public route after a 403.

The CRM puller now falls back from the routed alias to the existing dedicated public compatibility route when the first route returns 401, 403, 404, or 405. The opaque per-submission pull token, ten-minute expiry, payload schema validation, contact deduplication, and Meta isolation remain unchanged. Focused regression coverage reproduces the production 403 and proves that the fallback returns the validated server payload. Seven focused tests passed, changed-file TypeScript diagnostics were clean, `git diff --check` passed, and the production build completed successfully with only the documented pre-existing authentication warnings.

The repair was auto-published as ELEVAY CRM checkpoint `c011518a`. A post-publish count-only CRM query showed 84 `created` and 4 `matched` Spain landing inquiries, no inquiry rows remaining in `failed`, 84 Leads whose source is exactly `Spain_landing page`, and zero Meta attribution or Meta CRM event rows for those Leads. This confirms the CRM side is healthy and Meta-isolated after publication.

The scheduled `2026-09-14T06:00:Africa/Cairo` run still reported one failed submission. Read-only landing evidence identified run `720001`, internal submission `1110001`, four cumulative attempts, and sanitized error `CRM_TEMPORARILY_UNAVAILABLE`. CRM production logs at `03:03:30Z` proved that payload retrieval progressed past the earlier 403 but then failed inside Lead processing with the sanitized generic code.

The second root cause was a database-driver assumption in new-Lead creation: the service relied on `insertId`, which is not reliably populated by the production TiDB driver. The transaction therefore could not persist the authoritative Lead relationship and rolled back. The service now inserts the Lead, resolves its ID from the unique non-test normalized phone identity inside the same transaction, rejects an impossible empty lookup with `LANDING_LEAD_LOOKUP_FAILED`, and stores/logs only approved operational error codes. It never emits raw database details. Nine focused tests, changed-file TypeScript diagnostics, `git diff --check`, and the production build passed before publication.

After the noon retry still returned the sanitized `LANDING_PROCESSING_FAILED` code, the Lead creation path was also hardened against TiDB duplicate-key races. New-Lead insertion now uses a no-op upsert on the existing contact uniqueness constraints and then resolves the authoritative Lead through the shared phone/email matcher. A concurrent existing Lead is linked as `matched`, while multiple conflicting records are moved to manual review rather than failing or creating a duplicate. The focused nine-test suite and production build passed after this safeguard.

The landing project's historical reconciliation task confirmed that a separate earlier phone-normalization defect for internal submission `780001` had already been repaired and synchronized as one new Lead in landing checkpoint `22ed4900`; that historical result reported one other unrelated pending/failed qualified submission. The current controlled retry requested through the original landing WebDev task did not complete within the active task window, so it was stopped to prevent unrelated operations. The existing enabled Heartbeat schedule remains the authoritative retry mechanism. Its next execution is `2026-09-14T03:00:00Z` (06:00 Cairo). Final closure requires confirming that this run clears the remaining landing pending/failed item without duplicate Leads or Meta artifacts.

## Final pre-ingestion failure identified

The post-18:00 Cairo retry still failed before creating a CRM inquiry row. A read-only production check in the landing project confirmed that the affected qualified submission exists and otherwise satisfies the forwarding contract, but its stored `phoneE164` has 16 digits and fails the CRM schema at `phoneE164` with Zod code `invalid_format`.

The selected country is Egypt. Without recording the phone value, the structural check proved that the stored number contains the selected calling code, followed by a redundant international access prefix and the selected calling code again. Removing the redundant `00` plus selected calling code and prefixing the selected calling code exactly once produces a valid 12-digit international number. The repair must canonicalize the phone before CRM payload validation, continue to reject any final value outside 8–15 international digits, and correct future landing-form phone construction so the malformed pattern is not stored again.

The CRM now accepts only a restricted phone transport alphabet, canonicalizes the value against the selected country before fingerprinting or matching, removes the observed redundant international prefix only when the selected country proves the transformation, and rejects any result outside 8–15 international digits. It does not guess a different country. Eleven focused Spain landing tests passed, the changed files introduced no TypeScript diagnostics, `git diff --check` passed, and the production build completed successfully with only the documented baseline authentication warnings.

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

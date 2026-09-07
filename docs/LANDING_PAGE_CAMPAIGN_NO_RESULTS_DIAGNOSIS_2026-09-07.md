# Landing page test 2 — no Results diagnosis

**Campaign:** `Landing page test 2` (`120246544122900741`)  
**Ad Set:** `120246544122910741`  
**Ad:** `120246544122920741`  
**Account:** `act_548667060148825`  
**Mode:** Read-only; no Meta or CRM setting was changed.

## Verified Meta evidence

The Campaign is `OUTCOME_LEADS`, `ACTIVE`, and uses a Campaign-level `Daily budget` of 8,940 EGP. Meta reported 44,455 Impressions, Reach 31,495, Frequency 1.411, 1,199 Clicks (all), 761 Link clicks, 2.697% CTR (all), and 3,761.87 EGP Amount spent for 6–7 September 2026. The result indicator is `actions:offsite_conversion.fb_pixel_lead`, but no `offsite_conversion.fb_pixel_lead` action and no `landing_page_view` action were returned.

This means Meta is expecting a Website `Lead` conversion, but has received no attributable Website Lead event for the Campaign. Successful form storage by the Landing Page platform is not itself a Meta Result.

## Verified ELEVAY evidence

The ELEVAY `Website / Landing Page Lead Webhook` creates a CRM Lead record after a valid form submission. It does not fire a browser Meta Pixel event and does not send a Website `Lead` server event to Meta. The route currently reads basic lead fields and only `utm_source`, `utm_medium`, and `utm_campaign`; it does not capture `fbclid`, `_fbc`, `_fbp`, a shared `event_id`, or the browser user agent/IP for Website conversion attribution.

The live `lead_integrations` table currently contains only one active integration of type `meta` (`Elevay Global — All Lead Forms`) and no integration of type `website`. The ELEVAY Leads created since this Campaign began were all `Meta Instant Form` Leads from the separate Campaign and not Website submissions.

## Root cause

There is a measurement gap between the Landing Page success state and the Meta Dataset selected for optimization. The form platform can record successful submissions while Ads Manager remains at no Results because the standard `Lead` event is not dispatched to Meta after a successful server-confirmed submission.

## Evidence gap

The Meta connector confirms the expected result type but does not expose the Ad Set's selected Dataset/Pixel ID or the Ad destination URL. A screenshot of the Ad Set `Conversion` section and the Landing Page URL is required to confirm whether the Campaign selected `ELEVAY CRM Integration`, `ELEVAY CRM Server`, or another Dataset. No Dataset should be switched until the Landing Page sends a verified `Lead` event to that Dataset in `Test events`.

## Confirmed Ad Set and Landing Page evidence

The supplied Ad Set screenshot confirms `Conversion location = Website`, `Performance goal = Maximize number of leads`, `Dataset = ELEVAY CRM Server`, and `Conversion event = Lead`. These settings are logically aligned with a Website Lead campaign.

The screenshot was additionally processed with local OCR. The extracted text independently includes `Conversion location`, `Website`, `Performance goal`, `Maximize number of leads`, `Dataset`, `ELEVAY CRM Server`, `Conversion event`, and `Lead`, providing text-verifiable evidence of the selected Ad Set settings.

The active destination is `https://elevayconsult-yttdaxru.manus.space/spain-digital-nomad?lang=ar`. A read-only runtime inspection found:

| Browser tracking check | Result |
|---|---|
| `window.fbq` | Undefined |
| Meta Pixel loaded | No |
| `fbevents.js` or Meta tracking resources | None |
| Meta-related script sources | None |
| `_fbp` cookie | Absent |
| `_fbc` cookie | Absent |

This explains both missing `landing_page_view` and missing `offsite_conversion.fb_pixel_lead` in Meta. The Landing Page can store a form successfully while Ads Manager shows no Results because no browser PageView or Lead event is sent to `ELEVAY CRM Server`. A server-side CAPI `Lead` event with a stable `event_id`, `fbclid`/`_fbc`, `_fbp`, client IP, and user agent could close this gap, with optional browser Pixel `Lead` using the same `event_id` for deduplication.

## Landing Page application bundle

The active JavaScript bundle uses the tRPC mutation `spainDnvLanding.submitQualifiedLead` when the user completes the qualification form. The bundle contains no `fbq`, `fbevents.js`, `fbclid`, `_fbc`, or `_fbp` handling. This confirms that the current success flow is an application-database success only, not a Meta Website Lead conversion.

The submitted mutation payload contains `fullName`, `email`, `phoneCountry`, `phoneNumber`, `language`, `lookingFor`, `jobPosition`, and `feeCommitment`. The success handler only switches the UI to the success state. It does not submit `utm_source`, `utm_campaign`, `fbclid`, `_fbc`, `_fbp`, `event_id`, or a Meta `Lead` event. Therefore the 15 successful form records cannot be attributed to the Campaign by the current implementation, even if all were genuine submissions.

## User-reported form economics

Using the user-reported 15 successful submissions and the latest Campaign Amount spent snapshot of 3,769.03 EGP, the implied cost per stored submission is 251.27 EGP. The implied Link click-to-form rate is 1.97% from 761 Link clicks. These are external diagnostic calculations, not Meta `Results` or Meta `Cost per result`, because Meta has not received the `Lead` event.

## Corrective implementation — Landing Page project only

The Campaign's `Dataset` and `Conversion event` should not be changed. The repair belongs in the Landing Page project:

1. Install the Meta Pixel base code for Dataset `26912248165053068` (`ELEVAY CRM Server`) on the public Landing Page so Meta can receive browser `PageView`.
2. Preserve `fbclid` and all `utm_*` parameters from the first landing visit. Read `_fbp` and derive/store `_fbc` from `fbclid` when available.
3. Generate one stable UUID `event_id` for each submitted form before the tRPC mutation.
4. Extend `spainDnvLanding.submitQualifiedLead` so the backend receives the attribution fields, `event_id`, `event_source_url`, client user agent, and request IP, stores them with the submission, and sends one CAPI standard event named `Lead` with `action_source = website` only after the database commit succeeds.
5. Hash normalized email and phone server-side with SHA-256; never expose the CAPI token in the browser.
6. After the backend confirms success, optionally fire browser `fbq('track', 'Lead', {}, { eventID: event_id })` with the same `event_id`. Meta can then deduplicate the browser and server copies.
7. Add durable outbox/idempotency protection so retries cannot create duplicate CAPI events or duplicate Landing Page submissions.
8. Validate first in `ELEVAY CRM Server → Test events` using one synthetic submission and a current Test Event Code. Confirm one browser/server pair deduplicates into one `Lead` event.
9. Do not backfill the 15 historical submissions until their timestamps, consent, normalized contact data, and attribution evidence are audited. Do not enable ELEVAY CRM Production CAPI as part of this Campaign diagnosis.

## Operational recommendation

Do not modify Creative, Audience, Placements, Dataset, or Conversion event to solve this issue. The Campaign is delivering traffic but is operating without the Website conversion feedback signal needed for optimization. Prioritize the Landing Page tracking repair immediately. If it cannot be completed and validated within hours, consider temporarily pausing this Campaign as a measurement-safety action rather than judging Ad performance from missing Results. No Pause or Meta change was executed during this audit.

The verified root cause is therefore not the Ad Set selection: the Ad Set correctly selects `ELEVAY CRM Server` and the standard `Lead` event, but the Landing Page does not send that event to the selected Dataset after `submitQualifiedLead` succeeds.

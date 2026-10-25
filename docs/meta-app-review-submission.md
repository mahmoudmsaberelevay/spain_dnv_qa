# ELEVAY CRM Integration — Meta App Review Resubmission Pack

**App:** Marketing Command Center (existing ELEVAY CRM Integration app)  
**Site:** `https://elevay.vip/admin`  
**Privacy policy:** `https://elevay.vip/privacy`  
**Terms:** `https://elevay.vip/terms`  
**Data deletion callback:** `https://elevay.vip/api/meta/data-deletion`

## Immediate resubmission scope

Request **only `leads_retrieval`** in this submission. It is needed for the live ELEVAY CRM Lead Ads flow: ELEVAY receives a signed `leadgen` webhook for an Instant Form submission, retrieves that prospective client's submitted form answers server-to-server using the Lead ID, conservatively matches or creates the CRM Lead, preserves the form/campaign attribution, and lets authorized ELEVAY staff follow up on the customer's own request for information.

The integration does not use `leads_retrieval` for Messenger marketing, paid promotional messages, campaign edits, budget changes, or publishing. It improves follow-up because staff can see the information a person voluntarily submitted in ELEVAY's own Lead Ad form instead of asking the person to repeat it. Duplicate or ambiguous contacts are never silently merged.

Do not include `business_management`, Instagram Direct messaging, Instagram publishing, Page publishing, Page engagement management, campaign management, or a Marketing API access-tier request in this submission. Each is either unnecessary for the immediate Lead Ads flow or awaits its own verified evidence gate below.

## Reviewer access path

1. Sign in to the supplied Meta test account (to be added in the App Dashboard for review).
2. Open `https://elevay.vip/admin` and sign in with the supplied ELEVAY reviewer account.
3. Select **Meta** in the Command Center menu.
4. Open **Leads → Settings → Meta Ops** to view the signed webhook/reconciliation status and the list of connected Lead Forms.
5. Use Meta's Lead Ads Testing Tool with the designated test form. Show the webhook audit and the resulting test Lead only. Do not expose a production lead, customer conversation, token, secret, or payment data.

The reviewer account must be a dedicated, least-privilege ELEVAY CRM account containing test data only. Enter its active access instructions in the App Review form, not in this repository or a recording.

## Permission decision register

| Permission or feature | Current decision | Evidence gate |
|---|---|---|
| `leads_retrieval` | **Request now.** Retrieve submitted Lead Ads form responses after signed `leadgen` webhook delivery. CRM fields are mapped from the submitted form only; contact matching is conservative and attribution is preserved. | Lead Ads Testing Tool → signed webhook audit → test Lead / immutable attribution in ELEVAY CRM. |
| Supporting Lead Ads Page permissions | Retain only those Meta requires for the exact webhook and form retrieval flow, subject to the App Dashboard's permission requirements. | Same Lead Ads test flow; exact callback is `https://elevay.vip/api/webhooks/meta-leads-v2`. |
| Marketing API access tier / `ads_read` | **Defer.** The GET-only EGP reporting screen is implemented, but Meta rejected the previous request for insufficient recent application activity. | Establish legitimate successful read-only reporting calls over Meta's required rolling period, retain safe evidence, then submit separately. |
| `pages_messaging` | **Defer.** The CRM now blocks a reply both when queued and immediately before dispatch if the verified 24-hour window is closed. | Record the selected Page in the CRM, an approved test reply sent from the CRM, and that exact message visible in native Messenger. |
| Instagram comments / Instagram Direct | **Defer.** Comment handling may be reviewed later; Direct-message sending is intentionally disabled pending a supported separate Instagram Messaging API connection and native-client delivery proof. | Use only a dedicated professional test account and demonstrate a correctly delivered message before requesting any Direct-message permission. |
| `business_management` | **Do not request.** No current ELEVAY CRM feature requires it. | Not applicable. |

## Safeguards to call out in the Lead Ads submission

- The webhook is signed and verified before its notification is stored or processed.
- Full form details are retrieved only server-to-server. The access token remains on the server and is never sent to the browser.
- Contact matching checks Meta Lead ID first, then normalized telephone and email. Ambiguous matches remain in manual review.
- Every submitted Lead Ad receives immutable form/campaign/ad attribution and a durable processing record; retries are idempotent.
- A form submission does not imply GDPR, data-sharing, or marketing consent. New Leads start with those optional flags false unless a separately verified, explicit form consent mapping is implemented.
- Lead and webhook processing is asynchronous, signed, idempotent and retried from durable tables.
- The CAPI integration uses hashed identifiers and `event_id` deduplication; production delivery is disabled until its separate approval gate is intentionally enabled.

## Submission and recording checklist

1. For `leads_retrieval`, use the exact written use-case above. State that this is a server-to-server Lead Ads retrieval workflow, not a Messenger use case.
2. Confirm the App Review form names the actual ELEVAY legal controller and every relevant processor accurately. Do not substitute an individual's name or invent a legal entity.
3. Provide dedicated reviewer access that remains active and contains test data only. Never place credentials in the repository, video, or public documentation.
4. If Meta requires a recording, make one short, English, high-resolution Lead Ads test recording: testing tool → ELEVAY webhook / Meta Ops status → resulting CRM test Lead. Keep tokens and real contact data off screen.
5. Before requesting any deferred permission, make a separate recording for that permission's exact feature. For Messenger this must show selected Page → CRM send action → matching native Messenger delivery.

Do not include a production lead, customer conversation, token, secret, payment data, or any unimplemented feature in the review submission or recordings.

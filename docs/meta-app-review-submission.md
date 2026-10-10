# ELEVAY Marketing Command Center — Meta App Review Pack

**App:** Marketing Command Center (existing ELEVAY CRM Integration app)  
**Site:** `https://elevay.vip/admin`  
**Privacy policy:** `https://elevay.vip/privacy`  
**Terms:** `https://elevay.vip/terms`  
**Data deletion callback:** `https://elevay.vip/api/meta/data-deletion`

## Reviewer access path

1. Sign in to the supplied Meta test account (to be added in the App Dashboard for review).
2. Open `https://elevay.vip/admin` and sign in with the supplied ELEVAY reviewer account.
3. Select **Meta** in the Command Center menu.
4. Use **Check Meta connection** to show read-only Page, lead-form, inbox and Ads connections.
5. Review queued actions, drafts and audit records. No action is sent to Meta without owner approval during the first six weeks.

## Permission matrix

| Permission | Capability and data use | Reviewer demonstration |
|---|---|---|
| `leads_retrieval` | Fetch a submitted Lead Ad form response after an authenticated `leadgen` webhook. ELEVAY maps name, telephone, email, programme interest and Meta attribution into the CRM, with phone/email deduplication. | Submit a test lead with the Lead Ads Testing Tool; show the webhook audit and the resulting deduplicated CRM lead. |
| `pages_manage_ads`, `ads_read`, `ads_management`, `business_management` | Read campaign/ad set/ad insights; queue owner-reviewed actions; create new campaigns **paused** only; apply spend/CPL safeguards. | Open **Meta → Campaigns**. Show insights, then create a paused test campaign and delete it without delivery. |
| `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement` | Read Page posts/comments and queue a safe, owner-reviewed Arabic reply or hide action. | Post a test comment. Show the inbox item and owner approval before replying or hiding. |
| `pages_manage_metadata` | Receive and validate Page webhook subscriptions. | Show the signed `https://elevay.vip/api/meta/webhook` callback subscription and a successful test delivery. |
| `pages_messaging` | Read Messenger conversations and queue replies within Meta’s 24-hour response policy. | Send a test Page message; show the inbox item, reply draft and the approval gate. |
| `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages` | Read professional-account media, comments and DMs; draft owner-reviewed responses. | Add a test Instagram comment/DM; show the Command Center inbox and queued draft. |
| `instagram_content_publish` | Publish an owner-approved static post, carousel or Reel via the Instagram container flow. | Use an owner-approved test asset; show media container creation, processing status and final publish. |
| `pages_manage_posts` | Schedule an owner-approved Page post. | Create an unpublished Page test post, then delete it. |

## Safeguards to call out in every submission

- Public comments and DMs use professional Modern Standard Arabic; no guarantees, legal/tax advice, phone numbers, or public links.
- The system substitutes **إقامة** for prohibited **تأشيرة** terminology in public response templates.
- Each Meta write has a durable audit record: requestor, approver, timestamps, before/after values and result.
- Owner approval is mandatory for the first six weeks; later automation stays subject to the 90% first-pass-approval gate.
- New campaigns remain **PAUSED**. Budget prechecks reject cap breaches, >20% daily budget increases and campaigns over the configured CPL ceiling.
- Lead and webhook processing is asynchronous, signed, idempotent and retried from durable tables.
- The CAPI integration uses hashed identifiers and `event_id` deduplication; production delivery is disabled until its separate approval gate is intentionally enabled.

## Recording checklist

Record one short continuous video per relevant grouped capability, with visible URLs and test assets:

1. **Leads + webhook:** test lead → webhook audit → CRM lead deduplication.
2. **CAPI:** test event in Events Manager → Command Center evidence.
3. **Inbox:** Page comment, Instagram comment, Messenger and Instagram DM → safe queued drafts.
4. **Ads:** insights read → paused campaign proposal → approval gate/audit.
5. **Publishing:** owner-approved test asset → Page schedule and Instagram container flow.
6. **Privacy:** privacy page and data-deletion status URL.

Do not include a production lead, customer conversation, token, secret or payment data in recordings.

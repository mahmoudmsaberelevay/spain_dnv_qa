# ELEVAY Lead calling — setup and validation

The calling feature is implemented inside the existing Lead Module, not as a separate application. Live calling must remain disabled until the owner configures Twilio, approves the recording notices and provider spending, enables protected recording media, grants agents access and authorizes an internal test. No real calls, audio transcriptions or paid AI requests were made during implementation.

## What the feature adds

Eligible agents receive a **Call Now** control beside a Lead’s phone number and in the existing list. A compact in-CRM panel handles microphone access, initialization, ringing, connection, duration, mute, hangup and safe errors. The SDK is loaded only after an explicit agent action. Duplicate clicks and concurrent reservations for the same agent or Lead are blocked.

The server reads the destination from the authorized Lead record. The browser cannot choose an arbitrary telephone number, caller ID or agent identity. The initial scope is valid Egyptian mobile numbers. Each call uses a short-lived, single-use intent and short-lived Voice access tokens generated on the backend. Twilio call legs are associated with the correct Lead and the already-created timeline activity.

Recording starts only after the customer answers and gives affirmative consent by pressing 1 after the owner-approved notice. Silence or another key declines consent and ends the screening flow without recording. This deliberately takes precedence over recording immediately on answer: pre-consent audio is not recorded. The calling agent does not need to press a separate record button.

Completed recordings are fetched over authenticated HTTPS from Twilio. The CRM exposes only an authenticated, permission-checked playback route, not a public media URL. The Twilio account itself must have media authentication enabled; merely adding a CRM proxy does not protect Twilio’s original media URLs. [1]

Azure fast transcription preserves Arabic and English. It supports dual-channel transcription, or anonymous-speaker diarization for mono fallback. Speaker channels remain labelled as channels until their actual agent/customer ordering is verified in an authorized pilot; the implementation does not invent speaker roles. The AI summary extracts evidence-supported interests, requirements, pricing questions, objections, commitments, outcome and suggested follow-ups. Suggestions never automatically create tasks, change stages or contact customers.

The original Call Activity is updated rather than inserting a disconnected duplicate. Detailed transcripts, summaries and playback require separate listening permission as well as access to the Lead. Failed and pending processing states appear on the activity and update without refreshing the whole CRM.

## Database migration

`drizzle/0127_crm_lead_calls.sql` adds three empty tables: `lead_call_records`, `lead_call_agent_settings` and `lead_call_policies`. It adds their indexes and unique reservation/provider identifiers. The corresponding schema snapshot and migration journal are included.

The migration does not alter existing Lead, activity, user, financial or client tables. No existing Lead was used as a test fixture. All new call tables were verified empty after schema application; no agent grants, recording policy or processing schedule were enabled.

In a fresh independent deployment, run this migration through the existing migration process. Do not blindly rerun the CREATE statements on a database where they have already been applied. Preserve the current database’s migration bookkeeping and take a backup before production schema work.

## Required managed configuration

Enter credentials only in the project’s secure Secrets panel or the secure input card. Never paste them into chat, browser source, logs, repositories or command-line arguments.

Mandatory Twilio settings are:

- `TWILIO_ACCOUNT_SID`: Account SID beginning with `AC`.
- `TWILIO_API_KEY_SID`: API key SID beginning with `SK`.
- `TWILIO_API_KEY_SECRET`: Secret paired with that API key.
- `TWILIO_AUTH_TOKEN`: Account Auth Token used to validate signed webhooks and access protected media.
- `TWILIO_TWIML_APP_SID`: Voice TwiML application SID beginning with `AP`.
- `TWILIO_DEFAULT_CALLER_ID`: An authorized Twilio/verified caller ID in E.164 format.
- `TWILIO_WEBHOOK_BASE_URL`: The exact HTTPS origin used for all callbacks, normally `https://elevay.vip`, with no path, query or credentials.

Optional `TWILIO_APPROVED_CALLER_IDS` is a comma-separated E.164 allowlist for per-agent caller IDs. The configured default is included in the allowlist. A sales agent’s existing Orange Egypt number is not automatically eligible or guaranteed to be displayed; verification, Twilio support and destination-carrier rules still apply. [2]

The owner is identified through the existing configured CRM owner identity. `ELEVAY_CALL_POLICY_OWNER_USER_ID` can explicitly identify an existing owner administrator if needed. This must not be used to grant general administrator status or create another user.

Mandatory Azure/AI processing settings are:

- `AZURE_SPEECH_KEY`: Azure AI Speech subscription key.
- `AZURE_SPEECH_REGION`: Speech resource region, or `AZURE_SPEECH_ENDPOINT` as its trusted HTTPS resource endpoint.
- `CALL_SUMMARY_MODEL`: An owner-selected OpenAI model supporting the Responses API and structured JSON output.
- `OPENAI_API_KEY`: Existing server-side OpenAI project credential; do not rotate an existing key solely for this feature.

`CALL_TRANSCRIPTION_LOCALES` defaults to `ar-EG,en-US`. Use `ar-EG,ar-SA,en-US` where Egyptian Arabic, Standard Arabic and English are expected. `CALL_TRANSCRIPTION_MULTILINGUAL=true` opts into the provider’s multilingual detection path. Actual mixed-language recognition and speaker separation must be checked on the authorized real-call sample; synthetically mocked tests do not prove recognition quality.

## Activation is separate from supplying credentials

The following switches are **not** enabled by implementation or deployment:

```text
ELEVAY_CALLING_ENABLED=false
ELEVAY_CALL_PROCESSING_ENABLED=false
ELEVAY_CALL_PROCESSING_APPROVED=false
ELEVAY_CALL_RETENTION_ENABLED=false
ELEVAY_CALL_RETENTION_APPROVED=false
```

After approving paid calling, set `ELEVAY_CALLING_ENABLED=true`. After separately approving paid Azure/OpenAI processing, set `ELEVAY_CALL_PROCESSING_ENABLED=true` and `ELEVAY_CALL_PROCESSING_APPROVED=true`. The owner must also approve the matching database policy in the existing Lead settings. Supplying a key alone is not spending approval.

## Twilio Console setup

1. Use the intended Twilio account/subaccount. Ensure billing is usable. For a trial account, verify the internal test destination and understand trial restrictions before any call.
2. Create a server-side API key and a Voice TwiML Application. Set its Voice request URL to `https://elevay.vip/api/twilio/voice` with method **POST**. Use the same account for the API key, Auth Token and application.
3. Select a Twilio-owned or verified outbound caller ID. Enter only approved numbers in the managed caller-ID allowlist. Do not assume any Egyptian mobile number can be presented as caller ID. [2]
4. In **Voice → Settings → Geo Permissions**, enable the required Egyptian destinations. Do not blanket-enable high-risk ranges. Geo-permission and blocklist restrictions are distinct and can still prevent a call. [3]
5. In the account’s security settings, enable **Enforce HTTP Auth on Media URLs** before recording is activated. Twilio documents that media authentication is not on by default. [1]
6. The CRM generates exact signed POST callback URLs for status, consent screening, consent result, dial completion and recording completion. Do not edit them, add redirects or substitute another host. Keep `TWILIO_WEBHOOK_BASE_URL` aligned with the publicly deployed host.

Callback paths are `/api/twilio/voice`, `/api/twilio/status`, `/api/twilio/consent`, `/api/twilio/consent-result`, `/api/twilio/dial-complete` and `/api/twilio/recording`. Twilio supplies the generated `callId` query where required. Signatures are validated against the fixed configured origin and exact request URL, not untrusted proxy headers.

## Owner policy and agent permissions

After the disabled feature is deployed and managed settings load, open the existing **Lead Module → Settings → Calling** area.

The owner must enter approved Arabic and English recording notices, a policy version and the retention period. Each notice must explain recording/transcription and instruct the customer to press 1 to consent. Confirm media authentication only after it has actually been enabled in Twilio. Approve calling and paid processing separately. The implementation does not certify the notices as legal advice; the business must approve the applicable recording, processing and retention policy.

Example notice wording for review, not automatic adoption:

> المكالمة دي هتتسجّل بعد موافقتك، وممكن نستخدم خدمات معالجة عشان نطلع نص مكتوب وملخص لمتابعة طلبك وتحسين جودة الخدمة. لو موافق اضغط 1. لو مش موافق، ما تضغطش 1 والمكالمة هتنتهي من غير تسجيل.

> With your consent, this call will be recorded and processed to create a transcript and summary for following up your request and improving service quality. Press 1 to consent. Otherwise, do not press 1; the call will end without recording.

Administrators can grant `canCall` and `canListen` separately, select an approved caller ID and set an hourly call limit. Existing Lead visibility/edit permissions remain required. A generic CRM login or possession of a Lead ID is not calling permission. Revoke either grant to remove the corresponding capability.

## Automatic processing and retention

Only after deployment, provider configuration and policy approval, the owner can explicitly enable automatic processing recovery in Calling settings. This creates one managed Heartbeat at `/api/scheduled/lead-calls`, running at a one-minute cadence. No in-process polling daemon or external render worker is used.

The callback authenticates the platform scheduler and looks up its persisted policy by the verified task UID. It ignores Lead IDs or ownership values in the request body. Paused and orphan callbacks do no provider work. Database leases enforce one processing stage at a time across instances, and commits are fenced against stale workers.

Transcription and summarization are separate persisted stages so each callback fits the hosted request budget. A successfully stored transcript is reused on a summary retry; it is not transcribed again. Retryable failures use bounded backoff. Credential, permission and invalid-data failures remain blocked or failed rather than retrying forever. Durable error fields contain safe categories, not tokens, raw provider responses or private audio/transcript content.

Retention is separately approved. Its default period is 90 days; each call’s expiry is saved when created. Expired audio/transcripts are inaccessible through CRM endpoints even if provider deletion has not yet run. Set `ELEVAY_CALL_RETENTION_ENABLED=true`, `ELEVAY_CALL_RETENTION_APPROVED=true` and an explicit `ELEVAY_CALL_RETENTION_POLICY_OWNER` only after approving destructive cleanup. The cleanup removes the expired call’s sensitive transcript, summary and provider recording, while preserving minimal timeline metadata. It does not delete the Lead or its unrelated history.

## Deployment and real-call acceptance

Review the saved checkpoint, then deploy it to the current CRM domain. Do not create the recovery schedule before the callback is publicly deployed. Enter credentials through secure managed input, redeploy/restart to load them, perform read-only provider checks and complete the owner policy/agent configuration.

Before an actual test, explicitly authorize the internal test destination, maximum call duration and paid Twilio/Azure/OpenAI usage. Use an owner-controlled test Lead with permission to ring that number; do not call a real customer merely to test integration.

The authorized pilot must verify the customer leg rings, the headset works, statuses and duration are correct, consent is honoured, both channels are recorded, playback is restricted, Arabic/English transcription succeeds and the summary appears on the same timeline activity. Test rejection/no-consent, no-answer, busy, duplicate webhook delivery and unauthorized playback. Confirm channel ordering before calling channel labels Agent/Customer.

The code/build and synthetic tests establish implementation behaviour, not carrier delivery, Twilio account approval, real speaker recognition or legal compliance. Missing provider credentials and paid-test approval remain blockers to claiming the complete end-to-end integration works.

## References

[1]: https://www.twilio.com/docs/usage/security "Twilio security and media HTTP authentication"
[2]: https://help.twilio.com/articles/223180048-How-to-Add-and-Remove-a-Verified-Phone-Number-or-Caller-ID-with-Twilio "Twilio verified caller ID requirements"
[3]: https://help.twilio.com/articles/223180228-International-Voice-Dialing-Geographic-Permissions-Geo-Permissions-and-How-They-Work "Twilio outbound geographic permissions"

## Additional operating limits

Set `TWILIO_BROWSER_ORIGINS` to an explicit comma-separated HTTPS origin allowlist when agents use both the canonical domain and `www`, for example `https://elevay.vip,https://www.elevay.vip`. These are public origin settings, not credentials. Webhook signature validation still uses the single exact `TWILIO_WEBHOOK_BASE_URL`; additional browser origins do not change callback signing.

Calls are bounded to 30 minutes. The initial processing deployment is deliberately serialized: one transcription or summary stage per managed tick. This limits memory and duplicate processing but can create a backlog under sustained high call volume. Supporting ten simultaneous agent call sessions does not mean ten simultaneous transcriptions. Monitor queue delay during the pilot before broad rollout.

Normal summary retries reuse the saved transcript. A process crash after a paid provider finishes but before its result is committed can cause that external work to be retried and billed again; database fencing prevents duplicate or stale CRM writes but cannot guarantee exactly-once external billing without a provider idempotency feature.

The consent notice uses a supported Twilio Arabic TTS locale, not the ELEVAY ElevenLabs reel voice. Egyptian Arabic text and Egyptian Arabic transcription are distinct from guaranteeing an Egyptian accent in the telephone notice. No voice clone, keyframe or reel asset was generated or modified for this feature.

Azure documentation for the chosen private multipart and multilingual path: [4] [5].

[4]: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/fast-transcription-create "Azure private multipart fast transcription and language identification"
[5]: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt "Azure speech locale support"

## TwiML Application parent status callback

In addition to the Voice request URL, set the TwiML Application **Status Callback URL** to `https://elevay.vip/api/twilio/parent-status`, method **POST**, with no query string. This signed callback matches an already-bound browser-parent Call SID; it never creates an orphan call. It releases active reservations when the browser leg ends. All generated child/status/recording callback URLs retain their server-generated call association.

## Created and modified files

Existing files modified only for feature integration:

```text
client/src/App.tsx
client/src/pages/leads/LeadProfile.tsx
client/src/pages/leads/LeadsList.tsx
client/src/pages/leads/LeadsSettings.tsx
server/_core/index.ts
server/routers.ts
drizzle/schema.ts
drizzle/meta/_journal.json
package.json
pnpm-lock.yaml
```

New feature files:

```text
client/src/components/lead-calls/CallSession.ts
client/src/components/lead-calls/CallPanel.tsx
client/src/components/lead-calls/LeadCallProvider.tsx
client/src/components/lead-calls/CallNowButton.tsx
client/src/components/lead-calls/CallActivityCard.tsx
client/src/components/lead-calls/CallsSettings.tsx
client/src/components/lead-calls/useLeadCallHistory.ts
client/src/components/lead-calls/callUi.ts
server/leadCallsAccess.ts
server/leadCallsConfig.ts
server/leadCallsDb.ts
server/leadCallsService.ts
server/leadCallsRouter.ts
server/leadCallsWebhooks.ts
server/leadCalls.test.ts
server/leadCallRecovery.ts
server/leadCallRecovery.test.ts
server/leadCallProcessingProviders.ts
server/leadCallProcessing.ts
server/leadCallProcessingWorker.ts
server/leadCallProcessing.test.ts
server/leadCallProcessingWorker.test.ts
server/leadCallUi.test.ts
shared/leadCalls.ts
drizzle/0127_crm_lead_calls.sql
drizzle/meta/0061_snapshot.json
```

Official `twilio`, `@twilio/voice-sdk` and `libphonenumber-js` dependencies are pinned in the existing project lockfile. No external calling application, replacement CRM, public recording bucket or reel render worker was created.

## Final implementation validation — 9 November 2026

- Locked dependency installation passed.
- Final full regression suite: **227 passed files, 5 skipped; 1,707 passed tests, 5 skipped**.
- Final focused calling suite: **93 passed tests across 5 files**. These are synthetic/mocked call, webhook, processing, recovery and UI tests; they do not dial Twilio or upload real audio.
- Responsive synthetic UI checks passed at desktop/laptop and 390/320px mobile widths. The final 390px panel stayed within the viewport, and bilingual transcript channel labels were readable without inventing Agent/Customer roles.
- Existing schema snapshot entries were verified unchanged. The three newly created call tables were empty after migration.
- No real customer/test phone was dialled, no paid transcription/summary was generated, no agent grant or reviewed policy was saved, and no processing/retention schedule was enabled.

All seven required Twilio settings, Azure Speech key/region and the owner-selected summary model were absent by environment-variable name checks. The existing OpenAI key was present; its value was not displayed or copied. These missing settings, owner-approved recording/spending/media policy and an explicitly authorized internal test are still necessary before live acceptance can be claimed.

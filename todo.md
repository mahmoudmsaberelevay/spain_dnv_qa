

## AI Agentic Marketing System — Manus Creative-Production Scope

- [x] Expanded the readiness-connected Manus API v2 profile from research-only orchestration to its future bounded role for approved static assets, carousel visuals, reel storyboards, and short-form 9:16 reels.
- [x] Clarified provider responsibilities: Manus coordinates approved research and creative production; Creatomate remains the approved template renderer; Runway remains optional specialty footage; ELEVAY ElevenLabs remains the final-script Arabic voice-over path; Meta remains the restricted paid-media destination.
- [x] Added the Manus creative-scope badges to Provider Connection Center and the central Agentic Marketing hub while keeping all profiles disabled and all external operations locked.
- [x] Added the mandatory final-preview QA control for human depiction and reel continuity: realistic head-to-toe wardrobe and appropriate formal footwear, anatomy/hands, accessories, continuity, safe handling of no-person assets, and rejection of visual mutations.
- [x] No Manus task, media generation, video, static image, render, voice synthesis, publication, campaign operation, spend, CAPI event, schedule, client/Lead access, or CRM operating-data mutation was created.

> **Next gate:** The Creative Production execution release must define a bounded task/output schema, per-asset costs and caps, signed task callbacks, idempotent delivery, final asset storage, and the required approval/QA flow before a Manus static or reel task can be dispatched.


## AI Agentic Marketing System — Settings & Production Redesign

- [x] Reframed the central AI Agentic Marketing System around two primary sections: **1. Settings** and **2. Production**, without removing any existing governed workspace, saved record, role, route, or provider profile.
- [x] Expanded Settings with editable 30-day target inputs for likes, views, leads, qualified leads, signed clients, CPL, maximum ad spend, weekly Cairo weekday/time, delivery time, programme/source/creative rules, allocation, content mix, and feedback learning.
- [x] Added a versioned, server-side **Design System and official logo** intake: PDF/DOCX/Markdown/text instruction document; PNG/JPEG/WebP/SVG official logo; 10 MB limit; SHA-256; non-destructive activation/archive history; privacy-aware text extraction; and a bounded reviewable instruction summary.
- [x] Bound new Content Studio creative packets to an active Design System document and active official logo. Asset keys are recorded in the packet audit trail. No creative provider task is dispatched.
- [x] Retained Production's research/post/static/carousel/reel/ad plan review, final-preview/claim gates, individual decisions, mandatory feedback for change/reject/stop, feedback memory, revision cap, and aggregate performance inputs.
- [x] Stored the 90–100% requested approval-rate target strictly as a quality KPI. It cannot bypass individual approval and no publish button or autonomous publishing path exists.
- [x] Applied reviewed additive migration `0102_agentic_marketing_settings_production.sql`; database verification found seven target columns and the new Design System table. No Design System asset/test record was inserted.
- [x] Passed 18 focused tests across 4 suites, production build, changed-file diagnostic review with no new errors beyond the 83-error repository baseline, and diff/secret hygiene.

> **Execution remains locked:** no scheduled agent run, Manus task, model generation, media render, voice synthesis, provider callback, notification, publication, Meta/CAPI operation, campaign edit, spend, billing, Lead/client/CRM change, or external action was enabled. The future execution release still requires signed callbacks, idempotency, durable worker controls, exact schemas, cost caps, final-asset storage, QA, a pilot, monitoring/rollback, and a separate owner release.


## AI Agentic Marketing System — Owner-Confirmed Design System Activation

- [x] Registered the user-supplied `16327B5C-89A7-4BDE-9CB7-E560D4D38BEE.png` as the active official ELEVAY origami bird logo.
- [x] Activated **ELEVAY Design System v1 — owner-confirmed starting rules**, based on the supplied logo and existing approved ELEVAY palette, premium-editorial, Arabic-first, vertical-video, and full visual/wardrobe-continuity requirements.
- [x] Stored both assets server-side with SHA-256, owner attribution, an audit-log record, versioned active-state controls, and independent CRM verification: exactly two active assets (`logo`, `design_instruction`), both `owner_confirmed`.
- [x] Intentionally ignored the unrelated `Claude(1).dmg` attachment; it was not opened, stored, or registered.

> **Execution remains locked:** activating the assets did not dispatch an AI task, render any asset, synthesize audio, schedule work, publish, modify Meta/CAPI, create campaigns, spend funds, or change CRM operating data.


## AI Agentic Marketing System — Creative Language Policy

- [x] Enforced Arabic-only campaign, post, carousel, reel, caption, CTA, and voice-over copy; English-only text is reserved for text visibly rendered inside static designs, carousels, reels, images, graphics, and lead-ad visuals.
- [x] Added an exact **English text shown inside the visual** field to Content Studio and Weekly Results. Visual formats require its English content or `NONE` when no text is visible in the visual.
- [x] Added server-side review gates: invalid Content Studio packets and Weekly Results creative items cannot enter individual review. The final-preview QA contract now includes a dedicated creative-language compliance check.
- [x] Enforced ElevenLabs Arabic TTS scripts so only country names may be written in English; other English is rejected before any synthesis request. The TTS interface explains this exception.
- [x] Added the fixed language policy inside the Settings workspace, updated forms/review details, and passed 19 focused language, voice, Content Studio, Weekly Results, and Agentic hub tests plus production build and changed-file type-check review.

> This is a creative-control update only. It did not create or dispatch any Manus task, image, reel, audio asset, renderer action, scheduled job, publication, Meta/CAPI action, campaign change, spend, or CRM data mutation.


## AI Agentic Marketing System — Full Operational Readiness Audit

- [x] Ran the full CRM regression suite: **132 test files / 662 tests passed**.
- [x] Updated obsolete test expectations to preserve the two-section Settings/Production navigation model, include the Caribbean-safe Schengen condition, and avoid dummy write/delete operations in live CRM reporting tests.
- [x] Independently verified the encrypted full-system backup schedule is active, its latest run succeeded, and delivery completed to two approved recipients with zero failures.
- [x] Independently verified the Agentic Marketing master kill switch is enabled; all ten provider profiles are disabled with their kill switches enabled; the weekly setting remains `waiting_execution_release`; no plans, production items, provider callback events, work orders, content packets, approved claims, strategy packets, or pilot proposals exist.
- [x] Verified the active owner-confirmed logo and design instruction assets; recorded current Settings targets and statuses in the Arabic readiness guide.
- [x] Created the user-facing Arabic readiness report: `deliverables/elevay-agentic-marketing-readiness/AGENTIC_MARKETING_OPERATIONAL_READINESS_AR.md`.

> **First permitted test:** an internal, manually created weekly planning/review test after Brand Studio, approved claims, and Meta Strategy inputs are completed. No live media generation, publishing, campaign change, spend, CAPI, or automated weekly preparation is permitted until a separate Execution Release is implemented and owner-approved.


## AI Agentic Marketing System — Bounded Weekly Multi-Model Automation Engine

- [x] Added the owner-selected CRM-resident weekly production engine with a hard **USD 100 monthly internal reservation cap** and **USD 20 maximum per-run reservation**.
- [x] Implemented governed collaboration: OpenAI strategy → Claude independent challenge → Manus structured research/creative-production task. The full context rejects personal data and includes only governed Marketing inputs, aggregate performance, feedback memory, active brand/design rules, and approved evidence claims.
- [x] Added additive migration `0103_agentic_marketing_weekly_automation.sql` with controls, idempotent jobs, and budget ledger tables; verified all tables are present.
- [x] Added authenticated Heartbeat scheduling, Cairo weekday/exact-time evaluation, activation/pause lifecycle, idempotent Manus webhook registration, raw-body RSA-SHA256 callback verification, five-minute freshness, durable callback ledger, and a master-stop path.
- [x] Added Settings UI for live prerequisite visibility, cap/status/job history, enable/pause controls, and one review-only first-test action. Automation output creates individual draft/on-hold Production items only.
- [x] Preserved all boundaries: no automatic publishing, social scheduling, Meta campaign/ad/audience/budget/spend/billing operation, CAPI, messaging, CRM operating-data mutation, bulk approval, or 90% quality-bypass path.
- [x] Passed 6 focused suites / 25 tests, production build, local unsigned-callback and scheduler 401 probes, changed-file TypeScript diagnostic review with no new errors beyond the documented baseline, and diff/secret/Meta-mutation hygiene.
- [x] Passed the full deterministic CRM suite: **133 test files / 668 tests**. The Creatomate read-only live probe is intentionally opt-in (`RUN_LIVE_PROVIDER_VALIDATIONS=true`) so a temporary upstream stall cannot block ordinary regression coverage; its credential was validated at connection time.

> **Live activation is intentionally blocked until its Settings prerequisites are green**—active owner-approved Brand Book, owner-provided internal references covering the selected programmes, saved weekly timing/settings, active Design System/logo, and server-side provider credentials. Official sources stay opt-in and require Mahmoud's confirmation on the related content. Once green, Settings provides **Enable USD 100 engine** then **Run first test**; the first run is review-only, not publication or advertising execution.


## AI Agentic Marketing System — Owner Default Targets and Weekly Timing

- [x] Saved as persistent Settings defaults, retained until an authorized administrator changes them: **10,000 likes**, **2,000,000 views**, **2,000 leads**, **200 qualified leads**, and **20 signed clients** per 30 days; **EGP 100** target CPL; and **EGP 200,000** maximum 30-day ad spend.
- [x] Saved the automated preparation window as **Saturday, 10:00 Africa/Cairo**, with the schedule preference enabled. The existing delivery time and other saved production preferences were preserved.
- [x] Verified the persisted CRM Settings through the protected Marketing router: all exact target values, Cairo timezone, Saturday setting, 10:00 time, and schedule preference matched the owner-authorized input.
- [x] These values are configuration only; provider automation remains **disabled** and external operations remain **false**. No task, publication, campaign operation, spend, CAPI event, message, or client/Lead action was triggered.


## AI Agentic Marketing System — Permanent Internal Programme Source Policy

- [x] Set **Spain Digital Nomad Residency** and **Malta Permanent Residence Programme** as the two equal permanent programme priorities until an authorized administrator changes them.
- [x] Saved the owner instruction that the two supplied internal programme references are the primary source for all review-only weekly planning and content drafting.
- [x] Updated the OpenAI → Claude → Manus planning context so it receives only bounded analysis from those internal references. Any returned research item must identify an `internal://` reference; non-internal sources are blocked before a plan is stored.
- [x] Government and other external sources are neither retrieved nor cited automatically. They may be considered only after Mahmoud confirms the related specific content draft; internal references remain non-official and cannot alone support publication or a programme claim.
- [x] Verified reference coverage for both selected programme keys: 2 owner-provided internal references found, no selected programme is missing coverage, 0 official claims are required for this review-only internal planning gate, automation remains disabled, and external operations remain false.


## AI Agentic Marketing System — Spain DNV Internal Training Reference

- [x] Added the owner-supplied bilingual file `Spain_Digital_Nomad_Training_QA_AR_EN.md` as a separate Spain DNV internal programme reference (`spain_dnv_training_qa_ar_en_2026_09_30`).
- [x] Preserved it as `internal_reference_only` / `user_supplied_internal_training_draft`, companion to the original Spain reference; its SHA-256 fingerprint, draft/non-legal-review flags, and audit record were verified.
- [x] The weekly AI planning context will use this source together with the original Spain internal material whenever Spain DNV is selected. It remains internal analysis material only—not an official source, approved claim, client advice, publication authority, or model-weight training.
- [x] Government/external research remains disabled by default and requires Mahmoud’s later confirmation for the relevant content review.


## AI Agentic Marketing System — Owner-Confirmed Spain DNV Internal Claims

- [x] Following Mahmoud’s explicit confirmation that the supplied Spain DNV training material is 100% confirmed, created a separate, auditable set of **11 owner-confirmed internal claims** tied to the exact current hash of `spain_dnv_training_qa_ar_en_2026_09_30`.
- [x] Claims cover the source’s programme overview, eligibility, household income, family eligibility, documents, health-insurance position, application route/duration, post-approval steps, renewal, tax summary, and stated social-security fees. Each is labelled `owner_confirmed`, has an explicit source section, high-risk classification, owner confirmation note, source hash, and audit entry.
- [x] Added the additive migration `0104_agentic_marketing_owner_confirmed_internal_claims.sql` and the matching schema/control plane. The Knowledge Library now displays this category separately from approved official claims.
- [x] The OpenAI → Claude → Manus planning contract can reference only current-hash owner-confirmed internal claim IDs, and records them as `internalClaimReviewOnly` in created draft items. A changed/retired source or an unknown ID is blocked.
- [x] Retained the boundary: these are not official/government evidence, legal advice, automatic publication authority, or a replacement for an official-source review. Government/external research remains opt-in after Mahmoud’s content-specific confirmation; individual review and every publication gate remain mandatory.
- [x] Read-only verification confirmed 11 claims, all mapped to Spain DNV, all source-current, and all owner-confirmed; focused policy/automation tests passed.


## AI Agentic Marketing System — Malta MPRP Internal Training Reference

- [x] Added the owner-supplied bilingual file `Malta_Permanent_Residence_Training_QA_AR_EN.md` as a separate Malta Permanent Residence Programme internal reference (`malta_mprp_training_qa_ar_en_2026_09_30`).
- [x] Preserved it as `internal_reference_only` / `user_supplied_internal_training_draft`, companion to the existing Malta material; its SHA-256 fingerprint, programme mapping, internal-only classification, and structured analysis were verified.
- [x] The OpenAI → Claude → Manus review-only planning context will now use it alongside the original Malta internal material whenever Malta MPRP is selected. It remains internal analysis material only—not official evidence, legal advice, client advice, publication authority, or model-weight training.
- [x] No Malta owner-confirmed internal claims were created because the user did not yet expressly confirm this source’s factual content in the same way as the Spain source. Government/external research remains disabled by default.


## Arabic Voice-over — Diagnosis and Reliability Repair

- [x] Reproduced the actual production-adapter failure with a short Arabic smoke test: ElevenLabs returned `404 voice_not_found` for the configured ELEVAY voice before any MP3 was created or stored.
- [x] Confirmed this is not an audio-quality, video-render, export, or synchronization failure. The configured voice is unavailable to the ElevenLabs workspace behind the current key; the key also lacks optional `voices_read` permission for future voice-list health diagnostics.
- [x] Hardened the voice adapter with 60-second timeout protection, explicit inaccessible-voice precondition handling, no silent voice fallback, audio content-type validation, MP3 header validation before storage, and privacy-safe provider logging.
- [x] Improved the Voice-over screen with readable configuration/transport errors, stale HTML-vs-JSON request recovery guidance, and browser-playback fallback guidance.
- [x] Passed 14 focused tests, production build, zero-error TypeScript check, and diff hygiene. No invalid audio, substitute voice, video render, publication, Meta action, campaign change, spend, or CRM operating-data change was created.

> **Required external correction:** replace the server-side ElevenLabs key with one from the workspace that owns or is authorized for voice `9JAj5x86tg9L2DFnuxOw`, with Text to Speech and preferably Voices Read permissions. The separate video-compositor release is still required to embed a verified MP3 and enforce real voice/video synchronization.


## Arabic Voice-over — Approved Replacement Voice Activated

- [x] Following Mahmoud’s explicit selection, changed ELEVAY’s default ElevenLabs voice from the inaccessible historical ID to `nc8XQG8lRYRZDnjvKW0H`.
- [x] Verified a live Arabic Eleven v3 request with the secure current key: HTTP 200, `audio/*` content type, valid MP3 signature, and 48,527-byte direct MP3 response.
- [x] Verified the full CRM adapter path using Arabic-only text: Eleven v3 and `mp3_44100_128`; server-side storage succeeded; stored MP3 was retrievable with HTTP 200, `audio/mpeg`, 72,768 bytes, and a valid MP3 signature.
- [x] Retained Arabic language enforcement: an English brand word in the spoken script was rejected before provider use; an Arabic-only retry passed. Country names remain the only permitted English exception.
- [x] Passed 12 focused voice/provider/UI tests, production build, zero-error TypeScript check, and secret/diff hygiene. The current UI can now generate and play verified MP3 files through the owner-selected voice.

> **Remaining media boundary:** a separate video-compositor release is still required to mux a verified MP3 into final reel footage, measure both durations, mix background audio safely, and verify the final MP4 audio stream before approval.


## Agentic Marketing — Bounded Weekly Activation, Review Governance, and Narration Composition

- [x] Refactored weekly planning activation so it no longer changes shared provider profiles, the global Autopilot control, Meta/CAPI, social publishing, campaign, or spending authority. The weekly control alone enables internal review-only planning.
- [x] Activated the permanent Saturday 10:00 Africa/Cairo Heartbeat-backed planner with the USD 100/month and USD 20/run limits. All shared provider profiles remain disabled and their kill switches remain engaged.
- [x] Completed one bounded OpenAI → Anthropic → Manus planning test. The verified Manus structured result was recovered through the same idempotent callback processor after callback delivery did not update the CRM job. No second Manus task was created.
- [x] Repaired strict schedule-label handling by constraining the Manus schema and normalizing supported Arabic day labels into the CRM’s stored English day values before validation.
- [x] Generated one review-only weekly plan with five items. All five are automatically `on_hold` because their scripts did not satisfy Arabic-only creative policy. They remain editable/reviewable; no material was approved, rendered, published, scheduled, or used in advertising.
- [x] Added and applied additive migration `0106_review_only_reel_composition_and_social_release_governance.sql`: owner-pinned composition-input approvals, review-only composition records, and future per-channel social-release authorization evidence.
- [x] Added FFmpeg/ffprobe review-only narration composition. It requires an owner-approved source reel and SHA-256-pinned approved Arabic MP3, validates strict 9:16/video/audio/duration constraints, mixes audio, validates output streams, stores only final metadata/URL/hash, and assigns a new draft preview. It has no video-generation, publishing, Meta, campaign, CAPI, spend, Lead, or client path.
- [x] Added transparent trailing 30-day 90% governance calculation: an item counts only with selected status, exact final-preview fingerprint, individual approval, and resolved-feedback evidence. First month and samples under 10 eligible items cannot authorize release. The score can never publish; a future exact-preview, per-channel owner authorization plus separately validated Meta configuration remains required.
- [x] Mahmoud explicitly replaced the previous Higgsfield-only reel rule with Manus native video generation. Manus is now the sole future reel provider, but no video-generation task or release is enabled by this policy change. Meta Page/Instagram publishing credentials remain unconfigured; the existing Meta system-user/ad-account configuration was not changed or used.

> **Next gate:** Build a separately owner-approved, bounded Manus reel-generation task with cost tracking, callback/idempotency, final 9:16 QA, and review-only delivery; then separately configure and validate Meta Page/Instagram publishing scopes. Do not add social posting, campaign, spend, CAPI, or Lead/client operations until their independent authorization, idempotency, audit, and owner-release controls are implemented and passed.

- [x] Removed manual SHA-256 fingerprint entry from Weekly Results. Users now paste only a public HTTPS preview URL; the CRM downloads it through SSRF/size controls, computes and persists the integrity fingerprint automatically, preserves it through unrelated edits, and re-verifies changed preview URLs. A single Verify Preview action covers legacy URLs without a stored fingerprint.
- [x] Updated the provider policy exactly as Mahmoud confirmed: Manus native video generation is the designated future ELEVAY reel provider. This remains a policy/configuration change only; no Manus video-generation job, rendering action, or external production release was activated.
- [x] Updated the creative language policy: campaign copy, CTAs, reel scripts and voice-over remain Arabic; post captions may now be bilingual Arabic–English, with Arabic required. The same validation is applied to generated weekly plans, Content Studio, and individual review.
- [x] Removed all Marketing-screen inputs for preview image/video files, asset URLs, MIME types, and SHA-256 values in Weekly Results and Content Studio. The interface now states that ELEVAY will create/store/fingerprint previews internally through the separately governed Manus production release, and shows only the system-generated review preview when ready.
> **Media-release boundary:** The active USD 100/month cap covers weekly multi-model planning only. No separate cost cap, per-reel production job, or Manus video-generation release exists yet, so no images/videos have been generated and no media cost has been incurred.

- [x] Enforced a system-media association control: no Marketing user or API caller can attach a preview URL or technical fingerprint to a weekly item or Content Studio packet. Final QA/approval now accepts only a `review_ready`, `system_generated` media record whose URL and integrity fingerprint match the exact item/packet; replacement output supersedes the old record.
- [x] Applied migration `0107_system_generated_marketing_media_association.sql` to add the additive media-record control plane. It records only asset metadata, storage reference, integrity value, provider alias/task ID, item/packet linkage and audit timestamps—never media bytes, credentials, Lead/client data, Meta publication, campaign, spend or CAPI details.
- [x] Split the user experience correctly: **Review plan & copy** reviews title, programme key, objective, creative direction, bilingual Arabic-first caption, scheduled Cairo day/time and claims before media exists. **Approve final item** remains disabled until ELEVAY has generated and linked the exact final media preview.
- [x] Built and activated the separately budgeted Manus media-production dispatcher after Mahmoud approved the USD 100/month and USD 15 per-item media caps. It is a distinct ledger from the planning engine; the prior USD 80 planning reservation is never silently reused for image/video/reel generation.

## Agentic Marketing — Bounded System-Owned Manus Media Production

- [x] Mahmoud approved a separate review-media limit of **USD 100/month** and **USD 15 maximum per item**. Stored the active `manus-orchestrator` control independently from the USD 100/month planning ledger; this does not authorize publishing, Meta campaigns, ad spend, CAPI, messages, Leads, or client records.
- [x] Added and applied migration `0108_bounded_manus_media_production_controls.sql`: separate owner-configured media controls plus idempotent item-level job/audit records.
- [x] Added a system-only Manus review-media dispatcher. A creative plan item is transformed into a constrained Manus task using the approved ELEVAY media/video skills; static assets require one finished PNG/JPEG, reels require one vertical 9:16 MP4, no visual reel text, no music/narration in the generated source, white ELEVAY logo outro, strict wardrobe/anatomy/continuity requirements, no personal data, no external/government sources, and no contact details or guarantees.
- [x] Attached task completion to the existing signed/idempotent Manus callback. Output is downloaded with bounds, fingerprinted, stored, registered only as `system_generated`, linked to its exact item, and replaces older previews safely. Reels generate the approved Arabic ElevenLabs narration and compose it into the validated source MP4 before their final preview is linked.
- [x] Added **Generate system media** on each Production weekly-plan header. For future successful weekly plans, the system queues bounded media automatically immediately after review-plan persistence. Current-plan generation remains a one-click action to avoid an unrequested retroactive charge.
- [x] Verified with TypeScript check, 24 focused regressions across 5 suites, production build, diff check, and credential scan. No media task was dispatched during implementation or validation.

## Agentic Marketing — Media Reliability and Owner Channel Release

- [x] Reduced the owner-approved Manus review-preview ceiling to **USD 1.50 per item** while preserving the separate **USD 100/month** review-media cap. The stored active control was updated accordingly; this budget remains independent of the planning cap.
- [x] Repaired the failed first media dispatch: the MySQL/Drizzle insert result is now destructured before reading `insertId`, so state updates target a valid job instead of `NaN`. Interrupted pre-task jobs are marked as failed/released and can be retried cleanly without silently reusing a broken idempotency key.
- [x] Aligned media-task creation with the successful weekly-planning task: the standard Manus task profile and default account skills are used, and safe vendor error diagnostics are retained. No secret is exposed.
- [x] Removed an incorrect official-claim requirement from **Review plan & copy**. Initial review now correctly accepts planning/copy/creative-direction review before a final preview exists; final approval still requires the exact system-generated preview and final QA.
- [x] Added a per-item **System media progress** panel: queued/creating/completed/failed state, per-item reserved cost, safe error summary and one bounded retry action. Completion failures automatically receive one best-effort bounded retry; subsequent failure remains visible for manual owner action.
- [x] Added owner-only, per-item Facebook Page/Instagram **channel-release authorization** controls. They require the exact system preview, individual final approval, resolved feedback and the full trailing 30-day 90% policy. They record `authorized_pending_channel_setup` only; there is no Meta API call, post, campaign action, spend, CAPI action or contact operation, and the owner may revoke the authorization.

- [x] Recovered the first completed Manus review-media outputs through the governed idempotent processor after the provider callback did not update the CRM. Four static previews are now stored, fingerprinted, item-linked and `review_ready`. The remaining reel is in its one allowed automatic retry while the vendor reports an active motion-render subtask; no user confirmation is required.
- [x] Updated attachment parsing to accept both Manus `file_name` and canonical `filename` response fields, preventing completed future media tasks from being discarded solely because of metadata naming. TypeScript check, focused media regression, production build and diff validation passed.



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

- [x] Updated the global left navigation ribbon so the visible toggle can switch it between a full-width menu and a fully hidden desktop panel. A persistent top-bar control remains available to restore the menu after it is hidden. The preference is stored locally and follows the user across CRM pages; existing width resize behavior remains available while the ribbon is visible.

## Agentic Marketing — Preview Visibility, System Text, and Reel Synchronization Repair

- [x] Recovered the completed generated source reel from its task attachment. The source existed; the original compositor rejected it because the approved Arabic narration was longer than the source MP4.
- [x] Updated the review compositor to preserve source visuals and extend the final source frame (the required white logo outro) only when narration is longer. The output is revalidated for vertical video/audio streams and final narration-aligned duration before review storage. Added a regression test for the longer-narration case.
- [x] Added direct in-card previews: generated static images render inline, generated reels render with native video controls, and every asset has an **Open full preview** link. A safe reconciliation path now repairs any missing item preview link from a verified system-generated asset.
- [x] Added read-only automatic English in-design text. For static/carousel/graphic material, the system writes a programme-appropriate English-only visual title before dispatch; no marketing user manually enters it. Reels remain no-on-screen-text by policy.
- [x] Hid all seven existing Manus-generated media tasks from the Manus task list at Mahmoud’s request and changed future media dispatches to create/confirm private hidden tasks automatically. The CRM remains the sole production progress surface.
- [x] Added bounded task-status reconciliation on Production refresh: stopped hidden tasks retrieve their own attachment output into the same governed preview pipeline, while an active task maintains its percentage stage.

- [x] Regenerated the four static/carousel/image/graphic assets through hidden system-owned Manus jobs so the actual rendered previews include their new system-generated English-only in-design text; prior review assets were safely superseded rather than overwritten.
- [x] Verified the complete current plan: all five items have an item preview URL plus matching review-ready system-generated asset/hash; all four non-reel items have the automatic English-text metadata; the reel is linked to its completed narration-composed MP4; and there are zero active media jobs.


## Agentic Marketing — Comment Revision and Active Owner Design Standard

- [x] Removed approved-claim-reference IDs as a requirement from Weekly Results review and final individual approval. Programme key, Arabic/caption policy, system-generated exact preview, resolved feedback, individual approval, and separate channel-release governance remain intact. Internal source use remains owner-provided only; no automatic external/government research is enabled.
- [x] **Request changes & regenerate** now saves the comment as a future active preference and immediately queues one replacement, item-linked system preview using the comment as a mandatory generation instruction. It clears the old preview from the active CRM item and removes its active CRM media record before dispatch; prior creative is not offered as a review/version choice. A failed queue leaves a readable in-CRM status and the saved feedback remains intact.
- [x] Registered Mahmoud’s supplied `ELEVAYDesignInstructions.md` as the active owner-confirmed Design System instruction asset, retiring the prior active instruction document while preserving the existing official logo record.
- [x] Added a compact execution version of the owner design standard to every bounded Manus media prompt: luxury-editorial brand, 90% palette, exact logo restrictions, white 3-second logo outro, no forbidden visual elements, Arabic/Middle Eastern wardrobe/realism requirements, 9:16 reel standards, sentence-case English visual text, Egyptian-Arabic narration default, and premium non-guaranteed copy rules. Automatic visual copy now uses sentence case.
- [x] TypeScript check, focused media/review/language regressions, production build and diff check passed. No new media task was dispatched while making these changes.


## Agentic Marketing — Manus Production Credential Repair

- [x] Diagnosed the repeated replacement-generation failures as a production-only `401 unauthenticated: invalid api key` response. The sandbox key probe succeeded, confirming an environment mismatch rather than an item, feedback, or media-policy fault.
- [x] Replaced the deployed server-side `MANUS_API_KEY` through managed secret configuration without exposing it. Added and passed a live, non-disclosing `task.list?limit=1` credential regression test (HTTP 200 / API envelope `ok: true`).
- [x] Deployed the refreshed secret and retried both current comment-driven replacements. Verified the reel and static jobs are `completed`, each has a current `review_ready` system-generated asset, and each item has a matching preview URL/hash linked for review. The retries remained bounded to the existing USD 1.50 per-item review-media policy and did not publish, call Meta, change campaigns, spend ad money, invoke CAPI, or modify Leads/clients.


## Agentic Marketing — Production Credential Hardening and Egyptian Arabic Narration

- [x] Diagnosed recurring comment-regeneration failures as a production runtime credential drift: the sandbox validation could list Manus tasks while new production tRPC media calls returned Manus `401 unauthenticated: invalid api key`. Each affected item safely remains `changes_requested` with no active preview rather than using an unverified fallback.
- [x] Normalized `MANUS_API_KEY` at the central environment boundary (trim whitespace/newlines), added an exact server-side media credential helper, and added non-secret SHA-256 fingerprint logging for each task create/update attempt. The key itself is never logged, persisted, rendered, or exposed.
- [x] Enforced Egyptian Arabic for all new reel narration scripts in planning prompts, generated-plan validation, manual-review validation and reel-production briefs. English in spoken voice-over is now limited strictly to approved country names and the company name `ELEVAY`; captions remain Arabic-first bilingual by policy.
- [x] Passed TypeScript check, 18 focused policy/automation/media tests, production build and diff validation. The managed runtime was restarted to clear cached development secrets. A fresh managed production secret refresh is required before retrying the two newly failed replacement jobs.
- [x] Refreshed `MANUS_API_KEY` through managed WebDev secrets and passed the secure live Manus task-list authorization test. Retried both pending comment-driven replacement jobs through the exact media-dispatch path; both returned new private Manus task IDs successfully with a shared non-secret credential fingerprint, resolving the prior `401 invalid api key` failure. The newly queued replacements remain governed by the existing USD 1.50 per-item / USD 100 monthly media limits and are still review-only.

## 2026-10-04 — Manus media 401 production repair
- Verified the root cause with a temporary signed read-only probe: the live generic Manus key differed from the valid workspace key and returned HTTP 401; the workspace returned HTTP 200.
- Added a dedicated `MANUS_MEDIA_API_KEY` through secure project secrets. After deployment, the **live server** returned HTTP 200 to a read-only Manus test and its credential fingerprint matched the validated key. No credential value was logged.
- Added fail-closed preflight to plan media, comment-driven replacements, and retries: an invalid live key now causes no task or reservation; late 401s refund the reservation. UI disables the retry/generate controls and explains the reason.
- Released USD 15.00 in reservations for ten historical 401 jobs with no Manus task ID while retaining failure records. One bounded owner-requested graphic retry was accepted by Manus as job 300004, capped at USD 1.50. Existing previews were preserved.
- Removed the temporary production diagnostic route after verifying the live fix. Meta publishing, campaigns, ad spend, CAPI, Leads and client data remain unchanged.

## 2026-10-04 — Media narration, brand QC, ETA and recovery
- [x] Egyptian-Arabic normalization before the ElevenLabs video/reel request; country and ELEVAY names normalized to English; actual script retained for the reviewer.
- [x] New static outputs receive the SHA-256-verified exact active logo via FFmpeg; new reels get a deterministic centered exact-logo three-second white outro. Generation prompts forbid AI-made logos. Existing outputs are not silently changed.
- [x] Final item approval requires an explicit reviewer design-QC acknowledgement for brand, palette, copy, head-to-toe wardrobe, footwear and continuity. The existing active design instructions require at least 90% palette-conformant designed elements.
- [x] Per-item progress shows a transparent non-guaranteed remaining-time range or overdue/provider-input state; 55% is labelled stage-only, not a vendor completion percentage.
- [x] Independent two-minute authenticated Heartbeat `4FUr4KjS8Wkk6mjgxY7rox` reconciles existing Manus tasks without a browser session; interrupted local processing is recovered from the original task, stop events are claimed once, and failures have a capped single automatic retry. Waiting provider confirmations are surfaced and never automatically approved.
- [x] Type check, 147 test files / 723 tests (2 skipped), production build and diff hygiene passed; checkpoint d95d361b. Live task/heartbeat completion verification is in progress.

### 2026-10-04 — Production media renderer follow-up
The first live recovery exposed a separate deployment root cause: `spawn ffprobe ENOENT` on the published CRM server. This is independent of Manus generation, and the initial failed job was followed by its one already-authorized bounded retry. Pinned `ffmpeg-static@5.3.0` and `ffprobe-static@3.1.0` as production dependencies and allowlisted only `ffmpeg-static`'s install script in `pnpm-workspace.yaml`. Static and reel postprocessors now launch the app-bundled absolute binary paths. A runtime preflight prevents future paid Manus dispatches, retries and budget reservations if the renderer is unavailable, and the Production UI displays that blocker. Verified both binaries execute with an empty shell PATH. All 147 test files and 723 tests passed (2 skips); TypeScript, production build and diff hygiene passed. Checkpoint 677bb892. An existing retry is being reconciled with these tools; final live preview verification remains outstanding.

## 2026-10-04 — Three workspaces and current-week planning
- [x] Agentic main page has exactly Settings, Media Production and META ADS Production. New weekly plans require two reels and five static posts with Cairo posting slots and Egyptian-Arabic copy; current-week unapproved media can be regenerated within the existing budget and item-review gates.
- [x] User-selected Meta account yielded a GET-only EGP report for 2026-09-27–2026-10-03: one campaign, one ad, one finding and no supported creative-change proposal. The page supports explicit dated read-only capture; Meta publication, ad/budget changes, CAPI and Leads remain locked. Migration 0109 applied; checkpoint 6a02aee8. Full validation: 149 passing test files/730 tests (2 skipped), type check, build and diff check.
- [x] Corrected four failed pre-Manus October planner reservations via auditable USD -19 entries, retaining USD 1 each for uncertain OpenAI/Claude usage. Future pre-Manus failures release the unused reservation idempotently; the monthly USD 100 cap remains intact. Weekly Manus task creation now selects the independently validated server credential and preflights it.
- [ ] Current 2026-10-03 Cairo week has no generated seven-item plan yet. Initial bounded attempts failed on a transient Anthropic `UND_ERR_SOCKET`, then the Manus task-create endpoint rejected the seven-item request with HTTP 400 `invalid_argument: unexpected error from node server` before issuing any Manus task ID. Claude socket retries are now bounded inside one reservation, but the Manus rejection remains an upstream blocker. No current-week assets or approved ad media have been claimed complete; do not exceed the monthly budget by repeated unverified retries.

## 2026-10-04 — Open Higgsfield single-key authentication correction
- [x] Replaced all active split-key references with the single server-only `HF_API_KEY` in the provider registry, CRM readiness notice and opt-in read-only test. REST auth uses `Authorization: Key ${HF_API_KEY}` against `https://api.higgsfield.ai`, preserving the supplied value as-is; no Bearer, splitting or key assembly.
- [x] Cross-checked the owner-approved single-key contract against the official [Open Higgsfield quick start](https://open.higgsfield.ai/quick-start). Older authentication documentation still describes a different split-key flow; it is not used by this CRM.
- [x] Obtained the complete `HF_API_KEY` through secure WebDev project secrets and passed the opt-in, non-generative GET check (HTTP 404 for a nonexistent request) from the sandbox. No API key was printed. This does not prove deployed runtime access, model access, price, or generation readiness.
- [ ] Implement and independently validate a separate OpenAI-keyframe → Higgsfield-only clip pipeline, with verified model schema/pricing, bounded combined USD 100 Cairo-month and USD 1.50/item reservations, persisted request ownership/idempotency, polling/cancel, head-to-toe clip QA, ELEVAY-only audio and logo-outro export. Keep legacy Manus-footage weekly/media dispatch paused and fail-closed.
- [ ] Add verified citations to news-led external research, resolve Saturday 09:00 Cairo scheduling semantics, and test all separate individual approval and channel-release gates before any automation release. Do not publish, change Meta ads/spend, send CAPI, or modify Leads/CRM records during credential validation.
- [x] Verified the official four-clip (5 seconds each) candidate endpoint `kling-video/v2.5-turbo/standard/image-to-video` and obtained an authenticated **estimate-only** quote of USD 0.179 per illustrative clip (USD 0.716 for four, rounded up to USD 0.72). Added a test-covered, non-generative quote helper using the full `HF_API_KEY` as-is. No input upload or clip generation occurred.
- [ ] Before any paid reel, verify the model's actual 9:16 vertical result, 1080×1920 quality after export, source audio stripping, four verified OpenAI keyframes, full cost of OpenAI/voice/QA within the remaining USD 0.78/item, a durable Cairo-month reservation/ownership/idempotency path, and exact-logo/wardrobe QA. The estimate alone is not approval to spend.
- [x] Corrected inactive first-use defaults to Friday 11:00 preparation and Saturday 09:00 Cairo delivery target; Friday plans now select the **following** Sunday–Saturday publishing week instead of the week that is ending. Focused schedule tests and TypeScript passed. This does not enable a job or guarantee Saturday delivery; durable completion/deadline handling remains pending.
- [x] Hardened official-source URL normalization against credential-bearing, alternate-port, and control-character URLs. Added a bounded, allowlisted, read-only HTML citation verifier that requires an exact public-source quote, hashes the fetched snapshot, records retrieval time, blocks redirects/non-HTML/oversize content, and returns `publicationAuthority: false`. Focused tests and TypeScript pass. It is **not yet connected** to weekly research output or public-post approval and does not establish that a paraphrased claim is true.
- [ ] Integrate fresh citation snapshots into each news-led item, persist the source URL/quote/hash/program/date, prioritize owner-provided internal references, handle authoritative and owner-reviewed reputable domains, and block media approval/publication on unsupported or stale claims. Leave the old planner locked until this is verified end to end.

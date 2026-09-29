# ELEVAY AI Agentic Marketing System — Weekly Multi-Model Automation Engine

**Status:** Implemented and deployed to the CRM source as a **bounded review-production engine**. It is **not activated** and no provider task, rendering, voice synthesis, post, campaign, CAPI event, spend, or CRM operating-data change has been created by this release.

## Owner-approved operating model

Mahmoud selected the CRM-resident weekly engine with a **maximum internal monthly reservation cap of USD 100**.

When its independently verified prerequisites are complete and it is enabled from **AI Agentic Marketing System → Settings**, one configured weekly cycle performs this bounded sequence:

1. **OpenAI** produces the structured weekly strategy and research direction.
2. **Claude** produces an independent structured editorial/claim/brand challenge.
3. **Manus API v2** receives only the governed planning snapshot and both opinions, then creates a strictly structured, review-ready production pack for research, post/static/carousel/reel concepts, visual briefs, Arabic scripts, captions, English on-screen design text, proposed ad recommendations, and safe generated attachments when available.
4. The CRM stores the result as a **new internal weekly plan** and individual **draft** or **on-hold** Production items. Every item requires final preview/evidence checks and an individual human decision.

The engine runs through an authenticated CRM Heartbeat endpoint each hour and evaluates the selected **Africa/Cairo weekday and exact start time** inside the CRM. This design handles Cairo daylight-saving changes and Settings changes without silently modifying the schedule expression. Outside the selected minute it does nothing.

## Controls implemented

| Control | Implementation |
|---|---|
| Budget | Hard input maximum: USD 100/month; per-run reservation maximum: USD 20; ledger entry is created before providers are called. A run is rejected before dispatch if the reservation would exceed the cap. |
| Idempotency | One unique job key per Saturday–Friday period. A duplicate schedule/manual request returns the existing job instead of creating a second provider sequence. |
| Roles | Only the existing scoped `marketing_system_admin` and CRM owner can enable/pause automation or run a test. This remains scoped to Agentic Marketing. |
| Durable schedule | Authenticated Heartbeat job calls `/api/scheduled/weeklyMarketingAutomation`; handler accepts only `isCron + taskUid`. |
| Manus callbacks | `/api/webhooks/marketing/manus` is raw-body, RSA-SHA256 verified, timestamp-limited to five minutes, public-key cached, and idempotently recorded before processing. |
| Privacy | The prompt snapshot rejects personal data and contains only governed Marketing settings, active brand rules, active Design System extraction summary, approved claim metadata, feedback memory, and aggregate performance. |
| Language | Campaign/reel/caption/voice content must be Arabic. Text physically rendered inside visuals must be English. Arabic voice-over permits English only for country names. |
| Review | Generated items never publish. Each is draft/on-hold with `requiresIndividualApproval=true`; final preview, claims, language, visual continuity, and all Content Studio QA checks remain required. |
| Immediate stop | **Pause engine** disables the control, locks the three planning provider profiles, engages the master kill switch, and pauses the Heartbeat job. |

## Explicit exclusions

This engine does **not**:

- publish or schedule social posts;
- create/edit Meta campaigns, ad sets, ads, audiences, budgets, billing, or spend;
- send CAPI events or modify existing Meta lead/callback safeguards;
- contact a Lead, client, staff member, or external party;
- modify Financial, Contracting, Leads, Client Documentation, Client Portal, chat, or any other CRM operating data;
- automatically approve a plan or use the 90% quality target as a bypass;
- apply the optional Creatomate, Runway, or ElevenLabs render/synthesis operations in this release.

## Activation prerequisites — current required configuration

The CRM shows the precise live blockers in Settings. Activation requires all of the following:

1. Complete all 35 **Brand Studio** answers, propose and activate the Brand Book.
2. Keep the already registered active **Design System document** and official ELEVAY logo active.
3. Approve at least one **official Knowledge Library claim**. User-supplied Spain/Malta references remain internal only; they are not converted to official evidence without Mahmoud's explicit approval.
4. Save the weekly weekday/time, weekly goal, programme priorities, content mix, targets, and allocation direction in Settings.
5. Keep server-side OpenAI, Anthropic, and Manus credentials available. No value is exposed by this release.
6. Use **Enable USD 100 engine** in Settings. It securely registers/reuses the Manus callback then provisions/resumes the authenticated Heartbeat schedule. If provisioning fails, the engine pauses itself.
7. Choose **Run first test**. This creates one review-only job for the current Saturday–Friday period; it is not a post or campaign action.

## Validation evidence

- Migration `0103_agentic_marketing_weekly_automation.sql` applied three additive control-plane tables: automation controls, jobs, and budget ledger.
- Focused regressions passed: **6 files / 25 tests** covering bounded schemas, budget caps, Cairo timing, callback signatures/idempotency, scheduler authentication, language policy, provider readiness, and Weekly Results controls.
- Full CRM regression passed: **133 test files / 668 tests**, with the optional live Creatomate template-list check intentionally skipped unless `RUN_LIVE_PROVIDER_VALIDATIONS=true` is set. This keeps the ordinary suite deterministic when a third-party read-only endpoint stalls; the Creatomate credential had already been validated when it was connected.
- Production build passed with only the three documented legacy auth-route warnings.
- Direct local probes returned HTTP **401** for an unsigned Manus callback and an unauthenticated scheduler request.
- `git diff --check` and credential/Meta-mutation hygiene checks passed.

## First real test expectation

After prerequisites are green, the first test consumes at most the internal **USD 20 reservation** and creates a review-only weekly plan. You will see the OpenAI/Claude/Manus job status, source opinions, any Manus attachments, generated research, and individual Production items in the CRM. Review each item; the current system still has **no Publish button and no Meta action path**.

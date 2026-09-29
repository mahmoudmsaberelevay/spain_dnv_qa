# ELEVAY AI Agentic Marketing System — Settings & Production Validation

**Scope:** Controlled CRM configuration and internal weekly-review workflow only.  
**Status:** Implemented and checkpoint-ready on 29 September 2026.

## Two main sections

The central **AI Agentic Marketing System** now begins with two clear sections:

1. **Settings** — the controlled source of truth for Brand Identity, the Design System, commercial targets, weekly preparation timing, model/provider roles, sources, allocation, and learning rules.
2. **Production** — the owner-facing weekly workspace for reviewing research, post/static/carousel/reel proposals, ad proposals, final-preview evidence, individual decisions, edits, feedback memory, and aggregate outcomes.

Existing governed controls remain accessible under the same central hub. No prior Agentic Marketing records, routes, roles, or provider profiles were removed.

## Settings capabilities

### Brand identity

- The existing 35-question Brand Discovery and versioned Brand Book remain unchanged.
- The active Brand Book remains a required creative governance source.

### Design System and official logo

- Settings now accepts one active **Design Instruction** document at a time: PDF, DOCX, Markdown, or plain text, up to 10 MB.
- Settings now accepts one active **official logo** at a time: PNG, JPEG, WebP, or SVG, up to 10 MB.
- Files are stored server-side with a SHA-256 digest and a versioned audit record.
- Instruction text is extracted server-side; when extraction succeeds, `gpt-5-mini` creates a bounded, reviewable summary of mandatory rules, prohibited rules, and visual direction. It does not invent instructions.
- Source text that appears to contain contact, client, or Lead identity data is not sent to the extractor; it is marked for review.
- Uploading a newer asset of the same type makes the older active asset inactive while retaining its version history. Archiving is non-destructive.
- New Content Studio creative packets now require both an active Design Instruction document and an active official logo. Their asset keys are captured in the packet audit event. This binds future creative work to the active Design System without dispatching a provider task.

### 30-day targets and weekly preparation

Settings records these planning inputs:

| Input | Purpose |
|---|---|
| Likes, views, leads, qualified leads, signed clients | 30-day commercial/awareness targets |
| Target CPL and maximum 30-day ad spend (EGP) | Planning limits only; no Meta budget or spend action |
| Weekly preparation day, start time, and delivery target | Stored in **Africa/Cairo** time |
| Content mix, programme priorities, source requirements, creative direction, allocation, and feedback learning | Inputs for future governed planning |
| Requested 90–100% approval-rate target | A quality KPI only; never a publish authorization |

The CRM schedule remains explicitly **`waiting_execution_release`**. Saving settings does not trigger an agent, notification, provider, Meta action, content creation, rendering, campaign, CAPI event, spend, or publication.

## Production safeguards

- Weekly plans remain Saturday–Friday plans with research updates, posts, static designs, carousels, reels, images/graphics, and ad-setups as separate items.
- Every selected item still has an individual review decision. There is no bulk approval path.
- A disapproval/request for changes requires a comment; comments feed item-scoped feedback memory.
- The 90% approval-rate target is displayed as a measurement goal only. It cannot bypass individual approval, and there is no publish button or autonomous publishing path.
- Research/creative final previews and claims remain subject to existing preview fingerprint, official-claim, work-order, Brand Book, QA, and individual-decision gates.

## Deliberately not enabled

This release did **not** enable:

- Manus task dispatch, OpenAI/Claude generation, Creatomate rendering, Runway generation, or ElevenLabs synthesis;
- scheduled preparation, push/email notifications, callbacks, webhooks, or durable background workers;
- Meta campaign/ad/ad-set/audience creation, publishing, CAPI changes, live lead changes, budget mutation, billing, or spend;
- publication to any Meta platform;
- CRM client, Lead, contract, financial, documentation, portal, chat, or access-control operating-data changes.

> The 90% quality target cannot be interpreted as permission to publish. A future execution release must separately provide signed callbacks, idempotency, durable worker controls, cost caps, exact output schemas, final asset storage, per-item execution authorization, monitoring/rollback, an approved pilot, and a separate owner execution release before any external action is allowed.

## Database change

Migration `0102_agentic_marketing_settings_production.sql` is additive:

- Adds seven numerical/financial target fields and the requested approval-rate target to `marketing_weekly_results_settings`.
- Adds `marketing_design_system_assets` for versioned Design Instruction and official-logo metadata, storage references, SHA-256 digest, extraction status, reviewable extraction output, lifecycle, and audit linkage.
- Contains a documented rollback plan; no existing CRM data/table was deleted or renamed.

## Verification

- **18 focused tests across 4 suites passed:** Weekly Results, Agentic hub, Content Studio, and Provider Connection Center.
- **Production build passed** with the existing three unrelated auth-route warnings only.
- **Type check:** 83 existing repository diagnostics; no diagnostics in changed Settings/Production files.
- **Database shape:** seven target columns and the `marketing_design_system_assets` table confirmed present; no Design System asset was inserted during implementation.
- `git diff --check` passed; diff scanning found no configured credential value.

## Owner-supplied Design System activation — 29 September 2026

- Registered the supplied `16327B5C-89A7-4BDE-9CB7-E560D4D38BEE.png` as the active **Official ELEVAY origami bird logo**.
- Registered an active **ELEVAY Design System v1 — owner-confirmed starting rules** record derived from the supplied official logo and the existing approved ELEVAY brand rules (palette, premium editorial direction, Arabic-first vertical creative, and mandatory visual/wardrobe continuity controls).
- Both assets are server-stored, SHA-256 recorded, owner-attributed, active, and independently verified in the CRM. The registration produced an audit-log record.
- The supplied `Claude(1).dmg` was intentionally not opened, stored, or registered because it is unrelated to the Marketing Design System.
- Asset registration did not create a provider task, generate visual/video/audio content, publish, schedule work, change Meta/CAPI, spend money, or modify CRM operating data.

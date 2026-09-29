
## Agentic Marketing System — Brand Discovery Complete Form

- [x] Replaced the original one-question presentation with Mahmoud’s requested complete, sectioned 35-question owner form.
- [x] Preserved the exact question order, owner-only access, per-question evidence, recommendation confirmation, partial completion, resume, reset/versioning and immutable Brand Book approval workflow.
- [x] Added a bounded owner-only bulk-save procedure that rejects duplicate question numbers, validates the existing answer limits, updates answers and progression atomically, and writes a privacy-safe audit event with question numbers/count only.
- [x] Ensured a new interview version clears only unsaved local drafts while saved answers reload into their original questions.
- [x] Kept the Brand Book proposal unavailable until all 35 stored answers are complete and all suggested answers are explicitly confirmed.
- [x] Added privacy-safe validation documentation and updated Phase 1 architecture/validation records.
- [x] Passed 33 focused Marketing System tests, production build, zero changed-file TypeScript diagnostics against the documented 83-error legacy baseline, protected-route check, and diff hygiene.

## Agentic Marketing System — Meta Ads Strategy Intake

- [x] Added the exact 66-question Meta Ads Strategy Intake in the supplied source order and section ranges.
- [x] Implemented Mahmoud-only one-question interaction, 1–66 progress, per-answer save/resume, Back/Edit, evidence attachments and secure protected-route access.
- [x] Enforced that every Unknown answer becomes a Mahmoud-owned data gap with a required follow-up deadline; no commercial figure is silently inferred.
- [x] Added deliberate versioned reset controls that retain previous history and can reset all or one section.
- [x] Created and applied reviewed additive session/answer tables; verified they started empty and left all CRM, Meta, campaign, financial and client data unchanged.
- [x] Added desktop and mobile Marketing navigation to the planning-only intake.
- [x] Passed Meta strategy and Marketing System regressions, production builds, protected-route authentication validation, TypeScript changed-file review and diff hygiene.
- [x] Recorded the privacy-safe implementation and updated the architecture decision record.

> **Next gate (not part of this completed intake scope):** Mahmoud must complete company answers, confirm program-specific Spain DNV and Malta MPRP variations, and explicitly approve a separate Strategy Approval Packet before any Phase 5b campaign-operation, Meta permission, budget, spend or pilot proposal can be considered.

## Agentic Marketing System — Strategy Approval Packet (Phase 5a)

- [x] Added a separate additive, owner-only Meta Ads Strategy Approval Packet control-plane table.
- [x] Required active Brand Book, all 66 company answers with no Unknown gaps, and explicit Spain DNV/Malta MPRP program confirmations before a packet can be proposed.
- [x] Preserved company answers as the reference; program-specific confirmations do not overwrite them.
- [x] Added deterministic source-answer and packet SHA-256 hashes, revalidation at approval, versioned packets and explicit owner decision notes.
- [x] Added protected desktop/mobile packet workspace with readiness blockers, confirmation controls and deliberate planning-only approval.
- [x] Verified the new table was created empty; no commercial, CRM, Meta, CAPI, campaign, payment, provider or message action occurred.
- [x] Passed 42 focused Marketing System regressions, production build, changed-file diagnostic review, unauthenticated protected-route validation and diff hygiene.
- [x] Recorded the privacy-safe validation and architecture decision.

> **Next gate (not part of Phase 5a):** Complete the interview, confirm both program variations and approve a packet. Only then may a separate Phase 5b proposal be prepared for review; it must disclose exact Meta permissions, measurement pilot, budget/spend cap, rollback and monitoring before any external action is considered.

## Agentic Marketing System — Central Hub

- [x] Added one central Marketing-module control center named **Agentic Marketing System**.
- [x] Linked the complete gated sequence: Brand Studio, Official Knowledge Library, Controlled Work Orders, Content Studio & Approval Inbox, Meta Ads Strategy Intake and Strategy Approval Packet.
- [x] Added the central entry to the desktop Marketing dashboard and the mobile Marketing sidebar.
- [x] Explained each step and its guardrail in plain language, including the current no-Meta/no-campaign/no-spend/no-publication boundary.
- [x] Passed focused hub and Strategy Packet regressions, production build and diff hygiene; the hub route remains protected by CRM sign-in.

## Agentic Marketing System — Navigation and Session Handoff

- [x] Added direct **Marketing Dashboard** and **Agentic Marketing System** entries to the desktop Marketing sidebar.
- [x] Added the same direct dashboard and Agentic System navigation on mobile.
- [x] Corrected protected-module handoff from the authenticated home: each card now confirms the server session before navigation and preserves the requested module as the CRM sign-in return path when the session is no longer valid.
- [x] Added a bounded **Checking session…** transition state that prevents duplicate navigation clicks.
- [x] Passed 9 focused regressions, production build, changed-file TypeScript diagnostic review, browser validation of `/login?returnTo=%2Fmarketing`, and diff hygiene.
- [x] Recorded a privacy-safe validation document; no CRM, marketing, Meta, campaign, CAPI, provider, publication, financial, or client data was changed.

## Agentic Marketing System — Campaign Pilot Proposal

- [x] Model a proposal-only future measurement-pilot control plane after an approved Strategy Packet.
- [x] Require the newest approved packet, matching active Brand Book, reviewed program scope, bounded permission vocabulary, and explicit caps.
- [x] Capture immutable measurement, monitoring, stop, rollback, source-hash and owner-decision evidence without personal CRM data.
- [x] Add owner-only proposal, internal decision, change, rejection and immediate stop controls with no external action path.
- [x] Add the protected desktop/mobile/Agentic Hub workspace entry.
- [x] Apply the reviewed additive migration and verify the table is empty.
- [x] Pass focused regressions, production build, changed-file TypeScript review, protected-route check and diff hygiene.
- [x] Save final checkpoint preparation.

## Agentic Marketing System — Pilot Readiness & Executive Measurement

- [x] Add a protected aggregate-only read model for 90-day CRM funnel, contract-origin, Meta monitoring, reconciliation, and control-plane evidence.
- [x] Add deterministic readiness gates for Brand Book, Strategy Packet, Pilot Proposal, monitoring, attribution quality, actual pilot evidence, and spend reconciliation.
- [x] Keep optimisation blocked when a real pilot has not produced attribution/rollback and spend-reconciliation evidence.
- [x] Add responsive desktop/mobile navigation and Agentic Marketing System hub access at `/marketing/pilot-readiness`.
- [x] Validate through focused safety regressions, production build, direct protected aggregate-query check, TypeScript baseline review, and diff hygiene.
- [x] Save final checkpoint.

## Agentic Marketing System — Weekly Executive Brief & Decision Log

- [x] Implemented a manual, owner-controlled weekly aggregate snapshot for Monday-start review periods.
- [x] Added SHA-256 snapshot hashing, versioned records, and append-only capture/decision events.
- [x] Recomputed evidence server-side from existing aggregate Pilot Readiness data; browser metrics are never accepted.
- [x] Restricted snapshot capture and decisions to Mahmoud; retained read-only aggregate history for existing analytics roles.
- [x] Added privacy filters for email, telephone, passport/national-ID, client-code, client, and Lead references in notes.
- [x] Added protected desktop, mobile, Marketing dashboard, and Agentic Marketing System hub navigation.
- [x] Applied reviewed additive migration `0098_agentic_marketing_weekly_executive_briefs.sql`; no test data was created.
- [x] Verified zero records in both new tables, 21 focused regressions, production build, TypeScript changed-file baseline review, protected-route handling, and diff hygiene.
- [x] Documented the strict no-schedule, no-email, no-Meta, no-provider, no-publish, no-CAPI, no-spend, and no-CRM-mutation boundary.

## Agentic Marketing System — Provider Readiness, Scoped Administrator & Internal Programme References

- [x] Added a non-secret Provider Connection Center for the selected Full Autopilot after pilot safeguards model.
- [x] Registered disabled readiness profiles for Manus API v2, OpenAI, Anthropic, Creatomate, optional Runway, existing ELEVAY ElevenLabs voice and Meta Marketing API.
- [x] Added provider callback audit and master-autopilot-control tables without storing credentials, raw callback payloads or client data.
- [x] Kept a hard `executionAllowed: false` lock and master kill switch; no provider call, task dispatch, render, Meta operation, CAPI action, campaign mutation, publication, schedule or spend is possible from this phase.
- [x] Added Provider Connection Center routes to desktop dashboard, desktop sidebar, mobile sidebar and AI Agentic Marketing hub.
- [x] Granted Ziad El Shurafa the active `marketing_system_admin` role—a full Agentic Marketing System administrator role only, not CRM-wide ownership.
- [x] Updated server guards, lifecycle actions and UI role checks so Ziad can answer, edit, reset, approve and administer all Agentic Marketing System workflows.
- [x] Analysed the supplied Spain and Malta PDFs and stored exactly two clearly separated internal retrieval/reference records. They cannot create official claims and are not model fine-tuning.
- [x] Paused all government-source ingestion/approval pending Mahmoud’s explicit approval; no approved claims were created.
- [x] Verified one active scoped administrator assignment, two internal references, zero approved claims and zero provider webhook events.
- [x] Passed 43 focused Agentic Marketing regressions, production build, changed-file TypeScript review and diff hygiene.

> **Next gate:** Add external credentials only through protected server environment secrets. Then, after government-source approval and all strategy/content/pilot gates are complete, separately validate signed callbacks and request an explicit bounded execution-release approval. Never place API keys in the CRM, documents, source code or chat.

## AI Agentic Marketing System — Ziad Brand Discovery Access Correction

- [x] Analysed the supplied recording and confirmed that it showed the Marketing dashboard information card rather than the complete Brand Discovery form.
- [x] Audited the active account and found its scoped Marketing System role was still Marketing Manager rather than the requested Agentic Marketing Administrator.
- [x] Corrected the active scoped assignment to `marketing_system_admin` without changing any CRM-wide authority.
- [x] Confirmed server-side Brand Discovery start, save, evidence, reset, proposal and approval actions use the scoped administrator guard.
- [x] Made Brand Studio automatically open the active/new complete 35-question form for a scoped administrator, with a clear manual fallback button.
- [x] Added the direct **Brand Discovery — 35 Questions** Marketing sidebar path and explicit dashboard card label.
- [x] Passed 14 focused regressions, production build, changed-file diagnostics review and diff hygiene.
- [x] Added a privacy-safe access-correction validation record.

## AI Agentic Marketing System — OpenAI Editorial Provider Connection

- [x] Added `OPENAI_API_KEY` as a protected server-side secret; no value was stored or displayed in CRM, source, files or chat.
- [x] Validated the credential with OpenAI’s read-only models endpoint; no model generation request, content generation or model-metadata logging occurred.
- [x] Verified Provider Connection Center reports OpenAI as **server secret present**.
- [x] Verified the OpenAI profile remains disabled, external operations remain disabled, autopilot execution remains disabled and the master kill switch remains engaged.
- [x] Added secret-mapping and live credential validation regressions plus a privacy-safe validation record.

> **Connection status:** OpenAI is available only as a future editorial provider. It cannot yet generate CRM content, publish, change Meta campaigns, spend money, send CAPI events or access client/Lead records. Those controls remain behind the existing full-autopilot gates and a separate execution-release approval.

## AI Agentic Marketing System — Claude Editorial Challenge Provider Connection

- [x] Added `ANTHROPIC_API_KEY` as a protected server-side secret; no value was stored or displayed in CRM, source, files or chat.
- [x] Validated the credential with Anthropic’s read-only Models endpoint; no content-generation request or model-metadata logging occurred.
- [x] Verified Provider Connection Center reports Claude as **server secret present**.
- [x] Verified the Claude profile remains disabled, external operations remain disabled, autopilot execution remains disabled and the master kill switch remains engaged.
- [x] Added secret-mapping and live credential validation regressions plus a privacy-safe validation record.

> **Connection status:** Claude is available only as a future independent editorial and claim-review provider. It cannot yet generate CRM content, publish, change Meta campaigns, spend money, send CAPI events or access client/Lead records. All existing full-autopilot gates and separate execution-release approval remain mandatory.

## AI Agentic Marketing System — Manus API v2 Orchestration Provider Connection

- [x] Added `MANUS_API_KEY` only as a protected server-side environment secret; no value was stored or displayed in CRM, source, files, documentation or chat.
- [x] Validated the credential with Manus API v2’s protected read-only webhook public-key endpoint; no task creation, callback registration, schedule, provider output, content generation or external operation was requested.
- [x] Verified Provider Connection Center reports Manus as **server secret present** while its profile remains disabled, the provider/profile kill switches remain engaged, external operations remain disabled, and autopilot execution remains disabled.
- [x] Reasserted the existing full-autopilot master kill switch as enabled through the protected CRM control plane.
- [x] Added Manus mapping and live credential regressions plus a privacy-safe validation record; the future callback path remains reserved only and is not implemented or registered.

> **Connection status:** Manus API v2 is available only as a future bounded research and structured-output task orchestration provider. It cannot yet create tasks, receive callbacks, generate marketing content, publish, alter Meta, spend money, send CAPI events, access client/Lead records or change CRM records. The full-autopilot gates and a separate execution-release approval remain mandatory.

## AI Agentic Marketing System — Creatomate Template-Rendering Provider Connection

- [x] Added `CREATOMATE_API_KEY` only as a protected server-side environment secret; no value was stored or displayed in CRM, source, files, documentation or chat.
- [x] Validated the credential through Creatomate’s read-only template-list endpoint; no template mutation, render, callback registration, content generation, publication, Meta operation, spend or CRM operation was requested.
- [x] Corrected the provider policy to require only the documented Creatomate API key; no unsupported webhook-secret requirement is retained.
- [x] Verified Provider Connection Center reports Creatomate as **server secret present** while its profile remains disabled, the provider/profile kill switches remain engaged, external operations remain disabled, and autopilot execution remains disabled.
- [x] Added Creatomate mapping and live credential regressions plus a privacy-safe validation record; the future callback path remains reserved only and is not implemented or registered.

> **Connection status:** Creatomate is available only as a future approved-template rendering provider. It cannot yet create or edit templates, render media, receive callbacks, publish, alter Meta, spend money, send CAPI events, access client/Lead records or change CRM records. The full-autopilot gates, visual QA, cost controls and a separate rendering/execution-release approval remain mandatory.

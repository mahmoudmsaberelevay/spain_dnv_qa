

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



## 2026-10-04 — Governed one-click weekly production integration
- [x] Added an owner-only one-click Generate workflow in Media Production that uses saved ELEVAY Settings and the council planner without a details form.
- [x] Added durable `marketing_one_click_weekly_runs` and `marketing_one_click_weekly_run_items` tables, protected run-status query, per-item state, and percentage progress tracking; verified both tables exist in the live database.
- [x] Persisted exactly three reel and four static weekly items with individual review status and explicit `reviewOnly`, `mediaDispatchStarted: false`, and `publishingEnabled: false` boundaries.
- [x] Added a visible Generate weekly pack button and run panel showing planning progress, phase, planned 3/4 mix, and the fact that media is not started while the OpenAI → Higgsfield → ELEVAY release remains locked.
- [x] Added integration regression coverage; 19 focused tests, TypeScript, production build, diff check, and WebDev health passed. No Meta publication, ad spend, CRM/Lead mutation, or paid generation occurred.

> **Remaining release gate:** actual paid OpenAI keyframe and Higgsfield clip dispatch, fresh itemized owner review, durable provider receipts/idempotency, real output/wardrobe/audio/logo QA, citation snapshots, and final individual preview approval remain intentionally locked. The one-click workflow currently creates the governed weekly plan and durable progress records; it does not falsely claim that media exists.

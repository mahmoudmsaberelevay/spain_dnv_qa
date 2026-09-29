

## AI Agentic Marketing System — Setup & Weekly Results Control Plane

- [x] Reorganized the Marketing dashboard into two primary sections: **1. Setup** and **2. Weekly Results**, while retaining compact links to every existing governed Marketing workspace.
- [x] Added Saturday (Africa/Cairo) preparation configuration with configurable preparation time, initial 10:00 Cairo delivery target, programme priorities, source/creative direction, content mix, allocation, and aggregate-learning controls.
- [x] Added controlled Saturday–Friday internal plans with research-update, static-post, carousel, reel, image, graphic, and ad-setup item types; plans, items, events, feedback memory, settings, and aggregate performance use additive control-plane tables only.
- [x] Added individual item selection, final-preview/evidence gate, individual approval/request-changes/reject/stop decisions, required note controls, optional feedback categories, append-only decision events, and programme-scoped feedback memory. No bulk approval path exists.
- [x] Enforced aggregate-only weekly performance notes and preserved Brand Book/advertising strategy as explicit separate approvals rather than silently learning into global rules.
- [x] Applied reviewed migration `0101_agentic_marketing_weekly_results.sql`; verified all six newly added tables began empty.
- [x] Passed 45 focused Marketing regression tests across 9 suites, production build, changed-file TypeScript baseline review, and diff/secret/execution-call hygiene.
- [x] Documented that the displayed Saturday CRM schedule is **waiting execution release** only: no provider call, Manus task, rendering, voice synthesis, notification, publication, Meta/CAPI change, campaign, spend, or CRM operating-data mutation is activated.

> **Next gate:** Complete the separate execution-release architecture (signed callbacks, idempotency, durable worker decision, content/output schemas, cost limits, render/audio QA, pilot proof and explicit owner release) before activating any Saturday provider preparation or notification. Meta credential validation is still deferred at Mahmoud’s request.

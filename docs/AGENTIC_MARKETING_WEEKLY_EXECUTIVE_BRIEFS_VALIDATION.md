# ELEVAY Agentic Marketing System — Weekly Executive Brief & Decision Log

**Date:** 29 September 2026

## Result

The CRM now includes a protected **Weekly Executive Brief & Decision Log** at `/marketing/weekly-executive-briefs`. It lets Mahmoud manually capture a versioned, hash-locked snapshot of the existing aggregate Pilot Readiness evidence. He can then record one internal decision: acknowledge the planning-only state, request additional aggregate evidence, hold planning, or stop that brief.

The feature is a governance record. It is not a scheduled report, an email digest, a campaign tool, or a Meta integration.

## Data and access controls

The two additive control-plane tables are `marketing_weekly_executive_briefs` and `marketing_weekly_executive_brief_events`. The main record stores an immutable JSON snapshot, its SHA-256 hash, review-period Monday, version, status, and decision metadata. The event table stores append-only capture and decision history.

The snapshot is recomputed on the server from the existing protected aggregate readiness query. The browser cannot submit metrics, gates, counts, CRM records, or operational state. The record includes aggregate 90-day Lead and contract indicators, aggregate Meta monitoring and reconciliation controls, and the established readiness gates. It excludes client, Lead, contact, passport, identity, financial-row, campaign, and individual-event data.

Any user with the existing `view_analytics` capability can read the aggregate history. Only Mahmoud can capture a snapshot or record a decision. Context and decision notes reject email addresses, phone numbers, passport or national-ID terms, client codes, and client or Lead identity references.

## Operating boundary

The feature is intentionally manual. It has no cron job, no background worker, no email sender, and no notification action. It cannot connect Meta, request permissions, create or edit a campaign, ad set, ad, audience, budget or spend. It cannot publish content, call a provider, send a message, emit CAPI, record payment activity, or update any CRM record.

A decision records governance only. It never converts a planning record into permission to operate. Existing readiness gates continue to block optimisation until a separately approved real pilot has produced measured attribution, reconciliation, monitoring, rollback, and spend evidence.

## Verification

The migration was reviewed as additive and applied successfully. Both new tables exist and contained zero records after validation. No validation fixture was created.

Twenty-one focused regressions across five Marketing System suites passed. The production build passed. The TypeScript checker still reports the documented 83 unrelated repository diagnostics, with no diagnostic in the weekly executive brief change set. `git diff --check` passed.

The protected browser route was also tested without a valid session. It displayed the CRM sign-in page and did not expose brief content or aggregate metrics.

## How to use it

Open **Marketing → Agentic Marketing System → Weekly Executive Brief & Decision Log**, or use the direct Marketing sidebar entry. Mahmoud selects the Monday that starts the review period, optionally adds an aggregate-only context note, and captures the brief. He can then review the immutable readiness gates and write one planning-only decision. Existing versions stay available as historical evidence.

## Next gate

The safe internal control-plane phases are complete. A future operating phase is blocked until Mahmoud completes the Brand Book and paid-media planning prerequisites, explicitly approves the relevant records, and separately authorizes a real measurement pilot with configured Meta access and an approved cap. That authorization must be handled as a new decision because it would enable consequential external actions.

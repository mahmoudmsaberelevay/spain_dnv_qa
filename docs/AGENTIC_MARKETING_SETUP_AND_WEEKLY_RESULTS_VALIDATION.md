# ELEVAY AI Agentic Marketing System — Setup & Weekly Results Validation

**Scope:** Controlled Marketing UI, planning, individual review, feedback memory, and aggregate-performance handling.

## Delivered structure

The Marketing dashboard now presents two primary sections:

1. **Setup** — Saturday (Africa/Cairo) preparation settings, a configurable preparation time and **10:00 Cairo** initial delivery target, programme priorities, source-update instruction, creative direction, content mix, allocation rules, and aggregate-learning preference.
2. **Weekly Results** — internal Saturday–Friday plans that contain individually selectable **research updates, static posts, carousels, reels, images, graphics, and ad setups**.

Existing Agentic Marketing foundations remain available as compact supporting links: Provider Connection Center, Brand Studio, Knowledge Library, Work Orders, Content Studio, Meta strategy, Pilot controls, Executive Briefs, Ready Summaries, voice, comparison, and proposal workspaces. Existing CRM records and permissions are not replaced.

## Controlled review behavior

- Each item is versioned within its saved plan and has append-only item events.
- Every selected item requires an explicit, individual review decision; there is **no batch approval**.
- Review requires the specific item to have a final HTTPS preview fingerprint and programme-matched owner-approved claims.
- Approve, request-changes, reject, and stop decisions require a written note; feedback may be categorised as factual accuracy, brand, wording, visual design, voice, targeting, budget, timing, or other.
- Feedback on request-changes/rejection becomes programme-scoped Feedback Memory for future briefs. It does **not** silently modify the Brand Book or advertising strategy.
- Aggregate performance snapshots are stored only by Saturday-start week and prohibit email, contact number, client, Lead, passport, and client-code data.
- Items with incomplete evidence/preview cannot enter individual review; they remain non-approved drafts and display their explicit blocker reason when one exists.

## Database change

Applied additive migration `0101_agentic_marketing_weekly_results.sql` adds six control-plane tables:

- `marketing_weekly_results_settings`
- `marketing_weekly_results_plans`
- `marketing_weekly_results_items`
- `marketing_weekly_results_item_events`
- `marketing_weekly_results_preference_memories`
- `marketing_weekly_results_performance_snapshots`

The migration only creates new tables. It contains no drop, delete, truncate, rename, or update statement. A direct post-apply count check confirmed all six tables were empty before operational use.

## Safety and automation boundary

The saved schedule configuration is visible as **CRM background schedule — waiting execution release**. It is deliberately not an active provider job.

> Until the existing separate execution-release checkpoint is approved, the system cannot call an AI provider, create a Manus task, render media, synthesize voice, publish or schedule a social post, modify Meta/CAPI, create a campaign, spend, send notifications/messages, or modify CRM operating data.

Therefore, this implementation does not claim that a Saturday notification, content generation, finished rendered reel, live URL, Meta ID, campaign activation, or automatic provider action is active. Those require the already-defined signed callbacks, idempotency, cost limits, content/claim gates, render QA, durable worker/schedule decision, pilot validation, and explicit execution release.

## Validation evidence

- **45 focused Marketing regression tests** passed across 9 suites.
- `pnpm build` passed. The build continues to show the repository’s three pre-existing authentication-route warnings.
- `pnpm check` shows no diagnostics in the changed Weekly Results files; the known repository-wide baseline diagnostics remain outside this scope.
- `git diff --check` passed.
- Diff scan found no API secret values and no newly introduced provider, task, publish, Meta/CAPI, campaign, or scheduler execution call.

# ELEVAY Agentic Marketing System — Pilot Readiness & Executive Measurement

**Date:** 29 September 2026

## Purpose

This phase provides a **read-only, aggregate-only** executive dashboard at:

`/marketing/pilot-readiness`

It exposes the distinction between an existing CRM/Meta baseline and a future evidence-proven measurement pilot. It does not change operational data or unlock an external integration.

## What is measured

- Rolling 90-day non-test Lead totals: raw, qualified, client-stage, and campaign-attributed.
- Marketing-origin and signed marketing-origin contract counts.
- Latest aggregate CRM attribution-coverage indicator.
- Aggregate Meta operational evidence: reconciliation state, monitoring snapshot freshness, failure/retry indicators, test-lead leakage indicator, and event attention queue.
- Control-plane prerequisite counts: active Brand Book, approved Strategy Approval Packet, and internally approved Campaign Pilot Proposal.

The endpoint returns **counts, percentages, timestamps, statuses, and readiness gates only**. It does not return Lead names, contact data, client data, IDs, financial rows, campaign identifiers, or individual event data.

## Readiness contract

The dashboard evaluates these gates:

1. Active Brand Book.
2. Current approved Strategy Approval Packet.
3. Current internally approved Campaign Pilot Proposal.
4. Fresh monitoring and successful reconciliation evidence.
5. Attribution/inbox/test-lead/event-queue quality.
6. Proven actual-pilot attribution and rollback evidence.
7. Reconciled actual pilot spend evidence.

The last two gates are intentionally false until a separate, explicitly approved real pilot produces evidence. Therefore the initial dashboard correctly reports **Optimisation blocked** rather than implying that planning records are permission to operate.

## Security and operating boundary

- Requires the existing `view_analytics` Marketing System capability.
- Uses one protected tRPC **query** only; there is no mutation, schedule, provider call, Meta request, campaign action, CAPI event, publishing action, budget reservation, spend, payment, Lead change, or CRM write path.
- Production CAPI sending is displayed as evidence only and remains independently controlled by existing safeguards.
- No schema or live CRM data change was made for this phase.

## Validation evidence

- **16 focused regressions across 4 suites passed**.
- Full production build passed.
- The direct owner-context protected endpoint check completed against live aggregate data and returned:
  - `externalOperationsEnabled: false`
  - `readinessStatus: blocked`
  - a 90-day window
  - only documented aggregate metric/control keys
  - all seven readiness gates
  - no individual identity fields.
- Repository TypeScript check remains at the previously documented **83 unrelated diagnostics**; no Pilot Readiness changed-file diagnostic was reported.
- `git diff --check` passed before release documentation.

## Next gate

A later operational phase must not proceed merely because this dashboard exists. Mahmoud must first complete and approve the prerequisite planning records, then separately approve a real pilot. Only measured attribution, reconciliation, monitoring, rollback, and spend evidence from that pilot can satisfy the final two gates.

# ELEVAY Controlled Meta Test Event — Independent Audit

**Audit date:** 6 September 2026  
**Scope:** Privacy-safe, read-only verification of the attached validation evidence against the live ELEVAY database and `Meta Ops`.

## Verified test-event record

| Check | Live result |
|---|---|
| Internal Lead ID | `16830004` |
| Meta Lead ID | `4523451277907571` |
| Marked Test Lead | Yes |
| Consultant assignment | Not applicable; no consultant user ID |
| Durable inbox / processed signed inbox | `1 / 1` |
| Immutable Test attribution | `1` |
| `skipped_test` assignment audits | `1` |
| Lead alert rows | `0` |
| CRM outbox rows | `1` |
| Event | `Initial Lead from Facebook` |
| Final status / delivery mode | `sent / test` |
| Test Events code used | Yes, boolean evidence only |
| Production gate enabled at attempt | No |
| Request dispatched / Meta receipt retained | Yes / Yes |
| Evidence code / attempts | `META_TEST_EVENT_ACKNOWLEDGED / 1` |

## Isolation and production boundary

| Check | Live result |
|---|---:|
| Production-mode dispatched events | 0 |
| Approval-gated dispatched events | 0 |
| Duplicate deterministic Event ID groups | 0 |
| Duplicate Meta Lead attribution groups | 0 |
| Real approval-gated events retained without dispatch | 2 |

One real `Marketing Qualified Lead` event was independently created during the broad validation time window. It has no Meta Lead ID, remains `pending`, has zero attempts, no delivery mode, and no dispatch timestamp; its `createdAt` and `updatedAt` are identical. This is a separate CRM-stage creation, not evidence that the controlled Test Event modified or dispatched a Real Lead.

The live `Meta Ops` page shows `Production CAPI: Disabled`, both Real Lead events held as `approval_gated`, and Test Lead `16830004` as `sent` in `test` mode with dispatch and acknowledgement evidence. A separate summary tile still displayed `Test sent: 0`; this should be investigated as a monitoring snapshot freshness or aggregation discrepancy before declaring every dashboard counter fully reconciled.

No Event, Retry, Backfill, Reconciliation, or configuration mutation was executed during this independent audit.

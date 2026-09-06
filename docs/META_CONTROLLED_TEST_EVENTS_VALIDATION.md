# ELEVAY Controlled Meta Test Events — Live Validation Evidence

**Validation date:** 6 September 2026  
**Scope:** ELEVAY Leads module, Meta Test Lead ingestion, controlled one-event Test Events dispatch, and production-event isolation.  
**Secret handling:** The current Test Events code was entered only in the masked browser field, cleared immediately after the attempt, and is not recorded in this document, the API response, or the database.

## 1. Pre-dispatch Test Lead evidence

Exactly one synthetic Meta Test Lead was created through Meta's official Lead Ads Testing Tool after deleting the previous form test record.

| Evidence | Verified result |
|---|---:|
| Internal Lead ID | 16830004 |
| Meta Lead ID | 4523451277907571 |
| Durable inbox rows | 1 |
| Processed and explicitly marked inbox rows | 1 |
| CRM Lead rows | 1 |
| Explicitly marked Test Lead rows | 1 |
| Immutable attribution rows | 1 |
| Assignment audit rows with `skipped_test` | 1 |
| Consultant assignment | Not applicable |
| Lead notification rows | 0 |
| CRM outbox rows | 1 |
| Pre-dispatch status | `manual_review` |
| Pre-dispatch evidence code | `META_TEST_EVENT_CODE_REQUIRED` |
| Operational report rows | 0 |
| References to a real Lead | 0 |

The Test Lead was not assigned to Nouran, did not generate a Lead alert, did not enter operational funnel reporting, and did not alter a real Lead.

## 2. Explicit one-event authorization and dispatch

The administrator selected only **Test Lead #16830004 — Initial Lead from Facebook**. The browser displayed a second confirmation dialog containing the internal Lead ID, Meta Lead ID, and event name. Mahmoud separately confirmed this specific outbound test before the confirmation action was completed.

| Persisted provenance | Verified result |
|---|---:|
| Selected event rows | 1 |
| Final status | `sent` |
| Delivery mode | `test` |
| Explicit Test Lead marker | Yes |
| Current Test Events code used | Yes — boolean only |
| Production gate enabled at attempt | No |
| Request dispatched | Yes |
| Meta receipt retained | Yes |
| Delivery evidence code | `META_TEST_EVENT_ACKNOWLEDGED` |
| Attempts | 1 |

The masked code field was empty immediately after the request completed.

## 3. Meta Events Manager confirmation

Meta Events Manager was opened on the verified **ELEVAY CRM Server** dataset, and the CRM Test Events channel showed the event as received and processed.

| Meta Events Manager field | Verified value |
|---|---|
| Dataset | ELEVAY CRM Server |
| Dataset ID | 26912248165053068 |
| Event | Initial Lead from Facebook |
| Processing state | Processed |
| Channel | CRM |
| Lead event source | ELEVAY Lead Module |
| Customer information shown | `lead_id` only in the evidence view |
| Time received | 6 September 2026, 11:37:04 AM in the Meta interface |

## 4. Isolation and idempotency proof

| Safeguard | Verified result |
|---|---:|
| Production-mode dispatched events | 0 |
| Approval-gated dispatched events | 0 |
| Duplicate deterministic event ID groups | 0 |
| Duplicate Meta Lead attribution groups | 0 |
| Real production events modified by this test | 0 |

Real approval-gated events remained in the diagnostic section and had no Test retry action. Only explicitly marked Test Leads in `manual_review` were eligible for the controlled action.

## 5. Current safety position

`META_CRM_PRODUCTION_ENABLED` remains disabled. This test did not activate or approve production CAPI delivery. Enabling production delivery still requires Mahmoud's separate written approval after reviewing the accumulated real-Lead evidence.

# ELEVAY Lead Contact Duplicate Prevention

## Purpose

All active Lead intake paths use one conservative contact-identity policy. A new record is created only when no existing real Lead matches the submitted mobile, WhatsApp number, or email address. A unique match returns the existing Lead; multiple conflicting matches block creation for review.

## Covered Intake Paths

| Intake path | Unique match behavior | Conflicting match behavior |
| --- | --- | --- |
| Manual New Lead | Returns the existing Lead ID and opens its profile | Shows a clear message and creates nothing |
| CSV/manual import | Counts the row as skipped and creates nothing | Counts the row as an error/skipped review item |
| Meta signed webhook/reconciliation | Attaches the new Meta inquiry and immutable attribution to the existing Lead | Sends the inbox item to manual review |
| Legacy Meta synchronization | Records a repeat inquiry without changing the existing stage or owner | Skips creation and records a safe sync error |
| Spain DNV landing page | Links the inquiry ledger and activity to the existing Lead | Marks the landing inquiry for manual review |
| Generic website webhook | Returns the existing Lead ID with `duplicate: true` | Returns `AMBIGUOUS_CONTACT_MATCH` and creates nothing |

## Normalization and Matching

Phone and WhatsApp values are reduced to a canonical international number. Egyptian local formats such as `010…`, `20…`, `+20…`, and `0020…` resolve to the same identity. Email addresses are Unicode-normalized, trimmed, and lowercased. The matcher checks both the normalized columns and legacy raw values so older records remain protected.

Phone, WhatsApp, and email are evaluated together. If the submitted phone matches one Lead while the email matches a different Lead, the system does not choose either record automatically. It blocks creation to prevent an incorrect merge.

## Preserved Data and Source Behavior

Matching an existing Lead does not overwrite its consultant, stage, source, consent, or existing Meta attribution. Real Leads and Meta Test Leads are matched in separate partitions. Meta inquiries retain their immutable attribution and normal notification/assignment safeguards; Spain landing inquiries retain their source ledger, activity history, and qualification controls.

## Concurrent Submission Protection

Composite unique indexes protect normalized phone and email identities separately for real and Meta Test Leads. If two sources submit the same contact simultaneously, the first insert wins and the other flow resolves the unique-index race to the existing Lead. Multiple `NULL` normalized values remain allowed, so records without usable contact data are not incorrectly merged.

## Validation Record

Before the change, the production database contained 9,275 Leads, with zero conflicts among populated normalized phone and email identities. The additive indexes were applied without modifying Lead rows. The same total remained after implementation. A privacy-safe read-only probe confirmed that formatted phone, WhatsApp, and case-insensitive email variants each resolved to one existing synthetic QA Lead.

Focused regression coverage validates phone formatting, WhatsApp matching, email normalization, same-record phone/email matches, conflicting-record ambiguity, historical duplicate ambiguity, unusable contact values, unique-index race detection, all active ingestion wiring, automatic manual navigation, Meta Test Lead isolation, Spain landing manual review, and Meta race retry. The production build also passed. Existing unrelated TypeScript watcher diagnostics remain outside this change.

`META_CRM_PRODUCTION_ENABLED` was reconfirmed as `false`. This implementation does not enable or dispatch production Meta CAPI events.

## Monitoring

Operational monitoring should watch for Meta inbox items and Spain landing inquiries in `manual_review`, generic website responses with `AMBIGUOUS_CONTACT_MATCH`, and unexpected unique-index errors that fail to resolve to an existing Lead. A rising manual-review count usually indicates historical duplicate records that should be reviewed by an administrator rather than merged automatically.

## Rollback

Application rollback may restore the previous checkpoint. The two additive database indexes can remain safely in place because they do not modify Lead rows and continue preventing concurrent duplicates. If removal is explicitly required, first restore the previous application version, confirm no new code depends on the indexes, and then drop only `leads_test_normalized_phone_uq` and `leads_test_normalized_email_uq`. Existing Lead records must never be deleted or merged as part of rollback.

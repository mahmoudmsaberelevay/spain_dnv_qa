# Landing Page Meta Restoration Audit

## Attachment review

The attached implementation report states that the active Landing Page workspace was rolled back to version `352c23b6`, restoring the original Spain landing-to-CRM connection while excluding the later uncheckpointed Meta Pixel, attribution, deduplication, CAPI outbox, retry, diagnostics, and consent work.

## Live Spain verification

The published Arabic Spain route was inspected read-only at `https://elevayconsult-yttdaxru.manus.space/spain-digital-nomad?lang=ar`.

| Runtime check | Result |
|---|---|
| `window.fbq` | Undefined |
| Meta Pixel loaded | No |
| Meta tracking resources | None |
| `_fbp` cookie | Absent |
| `_fbc` cookie | Absent |

This independently confirms that the rollback report is accurate for the Spain page: Meta Website tracking is not active in the currently published version.

## Published Malta route discovery

The current production JavaScript bundle exposes the dedicated Malta qualification route `/malta-residency` and the mutation `maltaResidencyLanding.submitQualifiedLead`. The separate informational route `/residency/malta` also exists, but the qualification landing page to validate for advertising is `/malta-residency?lang=ar`.

## Live Malta verification

The published Arabic Malta qualification route was inspected read-only at `https://elevayconsult-yttdaxru.manus.space/malta-residency?lang=ar`.

| Runtime check | Result |
|---|---|
| `window.fbq` | Undefined |
| Meta Pixel loaded | No |
| Meta tracking resources | None |
| `_fbp` cookie | Absent |
| `_fbc` cookie | Absent |

The rollback report is therefore accurate for both advertising landing pages. Spain and Malta forms are active, but Meta Website tracking, attribution capture, browser/server deduplication, and CAPI outbox delivery are not active in the currently published Landing Page version.

## Verification matrix

| Capability | Spain Arabic | Malta Arabic | Evidence |
|---|---|---|---|
| Meta Pixel base code | Not active | Not active | `window.fbq` undefined and no Meta resources on both live routes |
| Browser `PageView` path | Not active | Not active | No Pixel runtime exists |
| `fbclid` capture | Not active | Not active | Production bundle contains zero `fbclid` occurrences |
| `_fbc` handling | Not active | Not active | Production bundle contains zero `_fbc` occurrences |
| `_fbp` handling | Not active | Not active | Production bundle contains zero `_fbp` occurrences |
| Stable `event_id` / `eventID` | Not active | Not active | Production bundle contains zero `event_id` and zero `eventID` occurrences |
| Browser `Lead` event after confirmed storage | Not active | Not active | No `fbq` runtime or source term; form success remains application-only |
| Browser/server deduplication | Not active | Not active | No shared event identifier path exists |
| Meta CAPI outbox and diagnostics | Not active in rolled-back Landing Page tree | Not active in rolled-back Landing Page tree | Confirmed by the attached implementation report and the active bundle |

No form was submitted during this audit. Lead delivery and deduplication are classified as **not active** from the absence of their required runtime and source paths, not from an outbound Test Event.

## Acceptance decision

The attached report is accurate as a rollback/status report but must not be accepted as completion of the requested Meta tracking task. The active version preserves Spain and Malta forms and the Spain landing-to-CRM connection, while all requested Meta Pixel, Website CAPI, attribution, consent, outbox, diagnostics, and deduplication capabilities remain absent. A dedicated Meta-tracking checkpoint must be implemented and validated separately before the Landing Page Campaign can optimize against the standard `Lead` event.

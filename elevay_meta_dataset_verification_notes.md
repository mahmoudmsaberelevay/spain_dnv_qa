# ELEVAY Meta Dataset Verification Notes

- Verified authenticated administrator access to `elevay.vip/leads/settings`.
- `Meta Ops` is available for read-only inspection.
- No Event was sent and no ELEVAY or Meta configuration was changed during this verification.

The live `Meta Ops` dashboard loads its evidence through authenticated read-only queries including `leadsSettings.metaAdmin.health`, `monitoring`, `assignmentPolicy`, `diagnostics`, and `privacySafeMonitoring`. The Dataset identifier can therefore be confirmed from the `health` response without running `Run Reconciliation`, `Retry as Test`, or any other mutation.

## Confirmed ELEVAY destination

| Field | Verified value |
|---|---|
| Dataset ID used by ELEVAY server | `26912248165053068` |
| Page ID | `100123051604258` |
| Graph version | `v26.0` |
| CAPI configured | Yes |
| Production sending | Disabled |
| Production events sent under current provenance | `0` |

The CAPI token is valid for delivery but Meta Graph returned `Missing Permission` when asked to read the Dataset display name. The available Meta Ads connector does not expose a Dataset-listing operation. Therefore the display-name match must be verified by comparing the numeric Dataset ID inside `Meta Events Manager → Settings`; no name should be inferred solely from visible event counts.

## Final name-to-ID match

The user supplied a Meta Events Manager screenshot that displays both source names and identifiers. `ELEVAY CRM Server` has ID `26912248165053068`, which is an exact match with the Dataset ID returned by the live ELEVAY Backend. `ELEVAY CRM Integration` has ID `2057654031829453` and is a separate source. Controlled server-side CRM Test Events must therefore use `ELEVAY CRM Server`, not `ELEVAY CRM Integration`.

Local OCR verification of the supplied Meta Events Manager screenshot independently extracted the following visible strings: `ELEVAY CRM Server`, `26912248165053068`, `ELEVAY CRM Integration`, and `2057654031829453`. This provides a text-auditable name-to-ID match in addition to the screenshot.

No Event was sent and no ELEVAY or Meta configuration was changed during this verification.

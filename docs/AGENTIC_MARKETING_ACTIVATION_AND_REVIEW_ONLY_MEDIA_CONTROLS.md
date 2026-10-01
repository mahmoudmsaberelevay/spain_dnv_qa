# ELEVAY Agentic Marketing — Activation and Review-Only Media Controls

**Updated:** 1 October 2026  
**Scope:** bounded weekly planning, durable review governance, and review-only Arabic narration composition.  
**Not in scope:** social publication, campaign changes, advertising spend, CAPI, Lead/client messaging, or video generation.

## Current operational state

| Control | State | Evidence / boundary |
| --- | --- | --- |
| Weekly multi-model planner | **Active** | Cairo-time hourly Heartbeat checks the permanent Saturday 10:00 setting and only starts at that configured minute. |
| Planning collaboration | **Enabled** | OpenAI strategy, Anthropic independent challenge, then one Manus structured production-plan task. |
| Monthly planning cap | **USD 100** | Per-cycle reservation is capped at **USD 20**; the October ledger currently shows USD 80 reserved across bounded attempts. |
| First live test | **Completed and held for review** | The verified Manus task produced one plan with five draft candidates. All five were automatically put **on hold** because their generated scripts did not meet ELEVAY Arabic copy validation. No material was silently accepted. |
| Global provider / autopilot controls | **Still locked** | Enabling weekly planning does not enable shared provider profiles, Meta/CAPI, rendering, publishing, campaign, or spend controls. |
| Social publishing | **Disabled** | There is no publishing API call, token use, campaign/ad action, CAPI call, or schedule-to-post path. |
| Reel generation | **Disabled** | Higgsfield remains required for future ELEVAY reels and is not configured. The compositor never generates footage. |

## First live planning-test recovery

The external Manus task stopped with a valid structured result, but its webhook callback did not update the CRM job. The result was recovered only after a direct API lifecycle check verified `stopped` plus a successful structured-output event for the stored task ID. The same idempotent CRM callback processor was then used.

The initial CRM validation correctly rejected Arabic day labels such as `الأربعاء` because the output contract previously accepted only English stored schedule values. The contract now constrains allowed day values and deterministically maps supported Arabic day labels to the CRM’s English scheduling vocabulary (for example, `الأربعاء` → `Wednesday`) before strict validation. This is a presentation/normalization repair only; it does not alter content, claims, approvals, or external actions.

## Review-only FFmpeg compositor

The new server-side compositor accepts **only owner-approved, SHA-256-pinned assets**:

1. A selected draft reel’s existing reviewed source video URL and fingerprint.
2. A final Arabic narration MP3 URL and fingerprint.
3. An owner-only command records both input approvals, downloads them to a locked temporary directory, and verifies fingerprint and media type.
4. `ffprobe` validates a playable vertical 9:16 source video and a playable narration no longer than the source.
5. `ffmpeg` mixes narration with source audio at a reduced bed level, pads narration as needed, preserves source duration, writes MP4/H.264/AAC, and validates the resulting audio/video streams and duration again with `ffprobe`.
6. Only the verified output is uploaded to storage and assigned as a **new draft preview**. It must still pass final-preview QA and individual review before approval.

The compositor rejects private-network input hosts, non-HTTPS URLs, unpinned assets, non-media responses, invalid streams, non-vertical footage, overlong narration, and invalid output. It has no code path to generate footage, invoke Higgsfield/Runway/Creatomate, publish social content, contact Meta, alter campaigns, spend money, send CAPI, or contact Leads/clients.

Arabic voice-over responses now also include a SHA-256 fingerprint so a verified MP3 can become a pinned composition input.

## Durable 90% governance policy

The CRM now calculates and exposes a transparent 30-day release-governance snapshot.

An item is eligible only if it is:

- selected;
- individually approved;
- approved against the exact current final-preview hash;
- recorded with `finalPreviewApproved` and `feedbackResolved` evidence; and
- approved within the trailing 30-day window.

Pending, rejected, on-hold, changed, stopped, superseded, stale-preview, or unresolved-feedback items are excluded and reported with their reason. The first month can **never** authorize release: the system requires a full 30-day history and at least 10 eligible final approvals. The score must meet the 90% threshold.

Even when the score is eligible, it **does not publish**. A future channel requires a separate, explicit owner per-platform release record tied to the exact preview hash, plus validated publishing credentials/scopes and an independent implementation. The new database tables preserve only the auditable future release evidence and idempotency foundations; no Meta publishing routine exists.

## Required external prerequisites before future execution

| Capability | Still required | Current state |
| --- | --- | --- |
| Higgsfield reel generation | A securely configured `HIGGSFIELD_API_KEY`, read-only/low-impact connection validation, provider cost/task/poll/callback controls, and a separate disabled profile | **Not configured** |
| Facebook Page publishing | Page access token, Page ID, permissions/app-review confirmation, read-only account validation, idempotent publication ledger and reconciliation | **Not configured** |
| Instagram publishing | Instagram Business Account ID, Page linkage, permissions/app-review confirmation, read-only validation, idempotent publication ledger and reconciliation | **Not configured** |
| Release execution | Per-channel owner authorization for the exact final preview after the valid 30-day policy | **Not implemented and intentionally disabled** |

The existing Meta system-user token and ad-account ID remain scoped to the protected marketing/lead system and are not treated as social publishing authority.

## Reference material consulted

- [Manus API v2 task lifecycle](https://open.manus.ai/docs/v2/task-lifecycle) and [structured output](https://open.manus.ai/docs/v2/structured-output)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Higgsfield API guidance](https://higgsfield.ai/blog/generate-ai-videos-higgsfield-api)
- [Meta Instagram content publishing documentation](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [Meta Pages API documentation](https://developers.facebook.com/documentation/pages-api)

No credentials, API values, client data, Lead data, or programme material are included in this record.

# AI Agentic Marketing System — Optional Runway Provider Connection Validation

**Date:** 29 September 2026

## Connection completed

The optional **Runway specialty-motion** provider is readiness-connected through one protected server-side `RUNWAY_API_KEY` environment secret.

The key is not stored in CRM tables, source code, project files, browser storage, chat messages, audit metadata, or validation output. The CRM Provider Connection Center reports only readiness presence; it neither displays nor accepts credentials.

## Independent validation

A dedicated Vitest validation used the documented non-generative `GET https://api.dev.runwayml.com/v1/workflows` operation with the required bearer authentication and `X-Runway-Version: 2024-11-06` header. The test verified only that the authenticated list response had the expected collection shape; it did not retain, print, or expose the list content.

| Check | Result |
|---|---|
| Protected Runway key present | Passed |
| Runway credential accepted | Passed |
| Non-generative workflow-list response shape validated | Passed |
| Video, image, or audio generation task created | **Not made** |
| Existing task retrieved or polled | **Not made** |
| Render output, task metadata, or provider response logged | **Not logged** |
| Callback/webhook registered or accepted | **Not made** |
| Credit purchase, billing, or auto-billing change | **Not made** |

The first validation candidate (`/v1/organization/usage`) was safely rejected with `404` because it is not an available public endpoint for this request. It did not create any provider work and did not indicate a credential failure. The final validation uses Runway’s documented workflow-list operation.

## CRM control-plane verification

A protected owner-context query to the CRM Provider Connection Center returned the following selected state:

| State | Verified value |
|---|---|
| Runway configuration | Server secret present |
| Provider profile execution flag | Disabled |
| Provider profile kill switch | Engaged |
| Master automation kill switch | Engaged |
| External operations | Disabled |
| Autopilot execution | Disabled |

## Callback and generation boundary

The checked official Runway documentation documents polling a submitted task using `GET /v1/tasks/{id}` and does not document a public signed webhook/callback protocol for this integration. The earlier placeholder `RUNWAY_WEBHOOK_SECRET` requirement and reserved Runway callback path were therefore removed rather than claimed as implemented.

Before any future Runway generation, ELEVAY must separately implement and approve a bounded task model: per-clip owner approval, provider/task schema validation, credit and duration cap before task creation, a durable idempotent task ledger, controlled polling with backoff, private output storage, output provenance, full visual and frame-by-frame wardrobe QA, monitoring/rollback, and a distinct execution-release approval. No future task may receive CRM client or Lead identity data.

## Purpose and retained controls

Runway is registered only for future selected **specialty motion footage**. It cannot currently generate media, create or poll a Runway task, publish content, schedule operations, create or change a Meta campaign, spend money, send CAPI events, access clients or Leads, or change CRM data.

All existing gates remain mandatory: an approved Brand Book; owner-approved official claims; an approved work order and final Content Studio packet; approved strategy and pilot materials; per-clip approval; costs and quality controls; durable bounded task handling; and a separate execution-release decision with a deliberate master-kill-switch review.

## Sources

- [Runway API Setup & Configuration](https://docs.dev.runwayml.com/guides/setup/)
- [Runway Software Development Kits and task retrieval](https://docs.dev.runwayml.com/api-details/sdks/)
- [Runway API Pricing & Costs](https://docs.dev.runwayml.com/guides/pricing/)
- [Runway Production Launch Checklist](https://docs.dev.runwayml.com/guides/go-live/)
- [Runway HTTP Error Codes](https://docs.dev.runwayml.com/errors/errors/)

## Regression coverage

- `marketingRunwayProviderConnection.test.ts` verifies API-key-only mapping, removal of the unsupported callback-secret requirement, and the permanent execution lock.
- `marketingRunwayProviderLive.test.ts` calls only Runway’s authenticated non-generative workflow-list endpoint when the protected key is available.
- `marketingProviderConnectionCenter.test.ts` continues to verify disabled provider profiles and full-autopilot execution locks.
- All focused Runway/provider-connection tests passed in the configured server environment.

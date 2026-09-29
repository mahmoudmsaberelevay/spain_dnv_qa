# AI Agentic Marketing System — Creatomate Provider Connection Validation

**Date:** 29 September 2026

## Connection completed

The **Creatomate template-rendering** provider is readiness-connected through a protected server-side `CREATOMATE_API_KEY` environment secret.

The key is not stored in CRM tables, source code, project files, browser storage, chat messages, audit metadata, or validation output. The CRM exposes only the provider’s presence/absence readiness state; it does not reveal or accept credentials.

## Independent validation

A dedicated Vitest connection test called the protected, read-only `GET https://api.creatomate.com/v2/templates` endpoint from the server environment.

| Check | Result |
|---|---|
| Protected Creatomate key present | Passed |
| Creatomate credential accepted | Passed |
| Template-list response shape validated | Passed |
| Template created, changed, or deleted | **Not made** |
| Render job created | **Not made** |
| Webhook registered or accepted | **Not made** |
| Template metadata or secret logged | **Not logged** |

A second protected CRM Provider Connection Center verification returned:

| State | Verified value |
|---|---|
| Creatomate configuration | Server secret present |
| Provider profile execution flag | Disabled |
| Provider profile kill switch | Engaged |
| Master automation kill switch | Engaged |
| External operations | Disabled |
| Autopilot execution | Disabled |

## Webhook and rendering boundary

Creatomate’s checked official documentation supports project-level and per-render webhook URLs, but the connection phase did **not** register any webhook. The checked documentation does not document a signed webhook-secret mechanism, so ELEVAY does not claim to have webhook authentication configured. The reserved callback path `/api/webhooks/marketing/creatomate` remains unimplemented and unavailable.

Before any inbound callback can be accepted, the future design must be reviewed and implemented with a vendor-supported verification approach, strict route isolation, render-status reconciliation through a server-side API call, timestamp/data minimisation, idempotent event storage, and no raw CRM/client data in callback payloads.

## Purpose and retained controls

Creatomate is registered only for future **template-based branded image and reel rendering**. It cannot currently render media, create or edit a template, publish content, create or change a Meta campaign, spend money, send CAPI events, access clients or Leads, or trigger an automation.

All existing gates remain mandatory: an approved Brand Book; owner-approved, tracked official claims; an approved work order and final Content Studio packet; approved templates; full visual and wardrobe QA; an approved strategy packet; an internally approved pilot proposal; verified signed or vendor-supported callbacks and durable idempotency; cost and monitoring controls; and a separate bounded rendering/execution-release approval with a deliberate master-kill-switch review.

## Regression coverage

- `marketingCreatomateProviderConnection.test.ts` verifies the protected provider alias, API-key-only mapping, reserved callback path, secret redaction, and locked rendering boundary.
- `marketingCreatomateProviderLive.test.ts` performs the real read-only template-list credential validation only when the protected secret is available.
- `marketingProviderConnectionCenter.test.ts` continues to verify that profiles and full-autopilot execution remain locked.
- All focused Creatomate/provider connection tests passed in the configured server environment.

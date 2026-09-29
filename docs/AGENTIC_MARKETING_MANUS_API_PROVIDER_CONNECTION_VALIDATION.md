# AI Agentic Marketing System — Manus API v2 Provider Connection Validation

**Date:** 29 September 2026

## Connection completed

The **Manus API v2 Orchestration** provider is readiness-connected through a protected server-side `MANUS_API_KEY` environment secret.

The key is not stored in CRM tables, source code, project files, browser storage, chat messages, audit metadata, or validation output. The CRM exposes only a provider readiness state; it does not reveal or accept credentials.

## Independent validation

A dedicated Vitest connection test called the protected, read-only `GET https://api.manus.ai/v2/webhook.publicKey` endpoint from the server environment.

| Check | Result |
|---|---|
| Protected Manus key present | Passed |
| Manus credential accepted | Passed |
| RSA-SHA256 public-key response shape validated | Passed |
| Manus task created | **Not made** |
| Callback registered or accepted | **Not made** |
| Provider response payload or secret logged | **Not logged** |

A second protected CRM Provider Connection Center verification returned:

| State | Verified value |
|---|---|
| Manus configuration | Server secret present |
| Manus profile execution flag | Disabled |
| Manus profile kill switch | Engaged |
| Master automation kill switch | Engaged |
| External operations | Disabled |
| Autopilot execution | Disabled |

## Purpose and retained controls

Manus API v2 is registered only for a future, bounded **asynchronous research and structured-output task orchestration** role. It cannot currently make marketing automatically, create a Manus task, create a callback subscription, schedule work, generate content, render media, publish, alter Meta, spend money, send CAPI events, access client or Lead records, or change CRM records.

The reserved callback path is `/api/webhooks/marketing/manus`, but it is **not implemented or registered**. Before that path could be used, it must verify Manus RSA-SHA256 signatures over the timestamp, full callback URL, and raw-body SHA-256 hash; reject timestamps older than five minutes; cache the public key; and persist idempotent event metadata without raw client data.

All existing gates remain mandatory: an approved Brand Book; owner-approved, tracked official claims; an approved work order and Content Studio packet; an approved strategy packet; an internally approved pilot proposal; verified signed callbacks and durable idempotency; cost and monitoring controls; and a separate bounded execution-release approval with a deliberate master-kill-switch review.

## Regression coverage

- `marketingManusApiProviderConnection.test.ts` verifies the protected alias, secret mapping, reserved callback path, secret redaction, and task-creation boundary.
- `marketingManusApiProviderLive.test.ts` performs the real read-only credential validation only when the protected secret is available.
- `marketingProviderConnectionCenter.test.ts` continues to verify that profiles and full-autopilot execution remain locked.
- All focused Manus/provider connection tests passed in the configured server environment.

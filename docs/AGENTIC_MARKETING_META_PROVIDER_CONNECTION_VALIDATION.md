# ELEVAY AI Agentic Marketing System — Meta Marketing API Provider Connection Validation

**Status:** Connected for protected, read-only readiness validation only.  
**Validation date:** 29 September 2026.  
**Scope:** Meta Marketing API control-plane readiness; no advertising or CRM execution release.

## Credential handling

The following provider prerequisites are configured only as protected server-side environment values. They are not stored in CRM records, source code, project files, logs, test output, or the Provider Connection Center response:

| Prerequisite | Role |
|---|---|
| `META_SYSTEM_USER_ACCESS_TOKEN` | Restricted system-user identity used for the read-only Marketing API validation. |
| `META_AD_ACCOUNT_ID` | Selected ad account validated as accessible to that system user. |
| `META_APP_SECRET` | Existing legacy Lead-webhook signature verification secret. |
| `META_WEBHOOK_VERIFY_TOKEN` | Existing legacy Lead-webhook verification token. |

## Evidence

1. A live Vitest check made only two HTTPS `GET` requests to Meta Graph API v26.0:
   - list a maximum of one accessible ad account; and
   - read the configured ad account's identifier, name, account status, and currency.
2. Both requests returned successful responses. The test records neither the account data nor any credential value.
3. A protected CRM Provider Connection Center query reports Meta Marketing API as `server_secret_present`.
4. The provider profile remains `profileEnabled: false` with its profile kill switch enabled.
5. The control-plane response remains `externalOperationsEnabled: false`; the master kill switch remains engaged and `executionAllowed: false`.

## Boundaries preserved

This connection did **not**:

- create, edit, publish, pause, or inspect any campaign, ad set, ad, creative, audience, budget, or billing setting;
- send a Conversions API event or change `META_CRM_PRODUCTION_ENABLED` (production CAPI remains disabled);
- create or retrieve a lead, submit a Meta Test Lead, subscribe a webhook, or change the existing Lead webhook configuration;
- create a callback handler, register a callback with Meta, change CRM/client/Lead data, schedule work, publish content, or spend money.

Existing Meta Lead webhook signature verification, Test Lead isolation, durable outbox controls, CAPI approval gate, and all Meta/CRM reconciliation safeguards remain separate from this Agentic Marketing provider readiness record.

## Remaining execution-release gates

The user-selected Full Autopilot model still requires every existing governance gate, including an owner-approved Brand Book, approved claims and work order/content packet, completed Meta Ads Strategy Approval Packet, internally approved pilot proposal, signed callback verification and idempotent storage, a durable worker decision, bounded provider schemas, budget/cost limits, real pilot evidence, monitoring/rollback, and an explicit owner execution release.

Provider connection readiness alone cannot authorize a campaign, advertising spend, publication, CAPI mutation, lead action, or CRM data change.

# ELEVAY Agentic Marketing System — Campaign Pilot Proposal Validation

**Date:** 29 September 2026
**Status:** Implemented and validated as an **internal planning and decision control only**

## Purpose

This phase introduces the protected **Campaign Pilot Proposal** workspace at:

- Marketing → Agentic Marketing System → Campaign Pilot Proposal
- `/marketing/campaign-pilot-proposal`

It lets the owner document a potential future paid-media measurement pilot only after the latest **approved Strategy Approval Packet** is available. The feature is deliberately not a Meta operating integration.

## Owner-only prerequisites and controls

A proposal can be created only when all of the following remain true:

1. A Strategy Approval Packet is explicitly owner-approved.
2. That packet is the latest approved packet.
3. The current active Brand Book still matches the approved packet.
4. The proposed programs are limited to the confirmed Spain Digital Nomad Residency and/or Malta Permanent Residence Programme variations.
5. The proposed permission identifiers are restricted to the reviewed internal vocabulary.
6. The proposed monthly cap does not exceed **EGP 200,000**; daily and per-campaign caps cannot exceed the monthly cap.
7. The request has no email address, phone number, client code, Lead ID, passport, national-ID, or comparable personal/identity reference.
8. The proposal includes success evidence, missing-data lockout, monitoring cadence and owner, alerts, stop conditions, rollback owner and rollback steps.

All owner decisions require a written note. A proposal can be internally approved, returned for changes, rejected, or stopped. A newly approved strategy packet or changed active Brand Book blocks internal approval of the older proposal and requires a fresh proposal.

## Immutable lineage

Each proposal stores a unique proposal key and version, the source Strategy Packet identifier and hash, an immutable proposal payload hash, caps, reviewed permission labels, monitoring plan, rollback plan, decision metadata, and audit record. The additive table contains **zero proposal records** at validation time.

## Hard no-execution boundary

Creating, reviewing, internally approving, rejecting, changing, or stopping this proposal does **not**:

- sign in to Meta;
- grant an external permission;
- create a campaign, ad set, ad, audience, account, or pixel;
- reserve a budget, move money, make a payment, or create spend;
- send CAPI events, publish creative, send a message, or call a provider;
- modify Leads, Financial, Contracts, Client Documentation, Client Portal, chat, or any existing CRM record.

No Meta credential, payment credential, campaign ID, ad account ID, API call, provider execution path, or scheduled operating task was introduced.

## Validation evidence

- The reviewed additive migration `0097_agentic_marketing_meta_campaign_pilot_proposals.sql` passed a destructive-operation scan and was applied successfully.
- Live schema verification returned `table_exists = 1` and `proposal_count = 0`.
- `pnpm drizzle-kit generate` was started as required, then safely stopped at a pre-existing interactive legacy `marketing_plans` rename prompt; no generated migration or legacy schema decision was accepted.
- Focused safety suite passed: **5 files / 19 tests**.
- The full production build passed. It retained only the documented pre-existing authentication-route warnings and bundle-size warnings.
- Repository TypeScript checking retains the documented baseline diagnostics; no diagnostics referenced the Campaign Pilot Proposal changed files.
- The protected browser route showed the intended sign-in gate with an unauthenticated browser session. No proposal was created during browser validation.

## Next gate

This proposal is not an authorization to operate paid media. A future external-integration phase may start only after a separate explicit owner request and a fresh review of Meta requirements, permissions, consent, measurement, credentials, billing, rollback, and the exact externally consequential payload.

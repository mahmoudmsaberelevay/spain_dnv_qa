# ELEVAY Agentic Marketing System — Architecture Decision Record

**Date:** 29 September 2026  
**Status:** Phase 0 complete; Phase 1 Brand Studio implemented in controlled setup mode  
**Scope:** Existing `elevay.vip` CRM; no replacement CRM, no local client database, no automatic publishing or paid-media execution.

## 1. Decision summary

ELEVAY will extend the existing CRM with a separate **Agentic Marketing System control plane**. The control plane stores governed marketing configuration, interview answers, role assignments, provider readiness, source/claim artifacts, approvals, and later work-order lineage. It does not duplicate CRM Leads, clients, Contracts, receipts, financial data, or Meta webhooks.

> **Phase 1 decision:** build the prerequisite Brand Studio and governance foundation before any research, content generation, publishing, Meta campaign mutation, spend, or production CAPI change.

## 2. Existing system observations

| Area | Observed state | Phase 1 decision |
|---|---|---|
| CRM | React 19, Express 4, tRPC 11, Drizzle and MySQL/TiDB | Reuse the current app router, auth, audit log, storage and deployment pipeline. |
| Leads / contracts | Leads retain stage and campaign attribution; marketing contracts retain `marketingLeadId` | Do not change current Lead stages, attribution or contract handling in Phase 1. |
| Meta | Existing verified Lead webhook, inbox, reconciliation and conversion event log | Preserve current Meta safeguards. No new campaign or CAPI mutation is added. |
| Voice | Existing secure ELEVAY server-side ElevenLabs adapter | Record as disabled-by-default provider readiness; do not invoke it until an approved script/work order phase. |
| Permissions | Existing general module/page permissions; owner identity is already authoritative | Add an explicit Marketing System role layer; it never expands existing CRM permissions. |
| Providers | Built-in models currently available: GPT-5, GPT-5.5, GPT-5-mini, GPT-5-nano; Claude Haiku/Opus/Sonnet 4.x; Gemini 3.x | Keep versioned aliases as configuration, not permanent model winners. External vendor aliases remain disabled until server-side configuration. |

## 3. Read-only CRM baseline (90 days; non-test Leads)

| KPI | Observed value | Interpretation |
|---|---:|---|
| Raw Leads | 1,737 | Baseline only; not a paid-client success metric. |
| Qualified Leads | 151 | Qualification must remain reasoned and auditable before optimisation. |
| Client-stage Leads | 8 | Client stage is not treated as signed-and-paid revenue. |
| Leads with campaign attribution | 1,622 (93%) | Good coverage; remaining 115 need attribution-gap reporting. |
| Marketing-origin contracts | 3 | All three retain a Lead link; two are signed. |

The existing Meta event log contains deliberately controlled states including approval-gated, manual-review, pending, retrying and sent. Phase 1 does not bypass these states.

## 4. Phase 1 architecture

### Additive data model

| Table | Purpose | Sensitive data policy |
|---|---|---|
| `marketing_system_role_assignments` | Explicit Agentic Marketing System roles | User IDs and role names only. |
| `marketing_provider_profiles` | Versioned provider aliases, readiness and kill switches | No secret/API key is stored. |
| `marketing_brand_discovery_sessions` | Versioned 35-question interview lifecycle | Owner-controlled interview metadata. |
| `marketing_brand_discovery_answers` | Exact answer, normalized fields, safe evidence links, author/time | No client records; only owner-provided brand evidence. |
| `marketing_brand_books` | Immutable proposed/active/superseded Brand Book payload and hash | No silent edits after approval. |

The reviewed migration is **additive only**: it has no `UPDATE`, `DELETE`, `DROP`, or `ALTER` statement and does not touch legacy Marketing, CRM, Meta, Contracting, Financial, Client Documentation, or Client Portal data.

### Access matrix

| Capability | Owner | Marketing Manager | Researcher | Creative Producer | Analyst |
|---|---:|---:|---:|---:|---:|
| View approved Brand Book | Yes | Yes | Yes | Yes | Yes |
| Start/reset/answer Brand Discovery | Yes | No | No | No | No |
| Approve/activate Brand Book | Yes | No | No | No | No |
| Assign/revoke marketing-system roles | Yes | No | No | No | No |
| Create research work orders (future) | Yes | Yes | Yes | No | No |
| Create creative work orders (future) | Yes | Yes | No | Yes | No |
| Review creative (future) | Yes | Yes | No | No | No |
| View/export analytics (future) | Yes | Yes | Yes | No | Yes |
| Publish or change campaigns/spend | **Future owner-approved policy only** | No | No | No | No |

### Initial provider registry

| Alias | Route | Current state | Phase 1 rule |
|---|---|---|---|
| `routine-copy` | Built-in `gpt-5-mini` | Internal capability available | Disabled; later use only inside approved work orders. |
| `strategy-synthesis` | Built-in `gpt-5` | Internal capability available | Disabled; no production calls in Phase 1. |
| `editorial-challenge` | Claude Sonnet alias | External configuration required | Disabled; no credential is stored in the database. |
| `source-research` | Manus API task alias | Configuration/webhook required | Disabled. |
| `template-render` | Creatomate | External configuration required | Disabled. |
| `specialty-motion` | Runway | External configuration required | Disabled. |
| `elevay-arabic-voice` | Existing ELEVAY Voice Adapter / `eleven_v3` | Internal adapter available | Disabled; future use requires approved Arabic script and cache key. |

## 5. Brand Discovery governance

The owner-facing Brand Studio implements the blueprint’s exact 35 questions in source order. It displays only one question per interaction; supports Save and Continue, Back/Edit, owner-provided evidence files, safe recommendation confirmation, logout/restart resume, whole-interview or section reset, and immutable version history.

A Brand Book can be proposed only once all 35 questions are answered and no answer is pending owner confirmation. The proposal includes cited question numbers, unknown data gaps, machine-readable design tokens, prohibited claims, voice and imagery policy. It remains `proposed` until Mahmoud explicitly approves it; approval activates a new immutable version and supersedes the old active version.

## 6. Safety, privacy and production controls

- No client documents, passports, phone numbers, emails, or full CRM records are sent to content models.
- No secret is written to a database row or browser payload.
- No feature in Phase 1 calls Meta, Creatomate, Runway, Manus API, Anthropic, or ElevenLabs.
- Existing Meta Lead sync and current CAPI approval controls remain unchanged.
- No provider is enabled by default; each profile begins with an active kill switch.
- Brand, provider and role changes are recorded in the existing audit log.
- Existing ELEVAY media rules remain binding: no passports; Arabic content where required; no guarantees; no fake official documents; and the ELEVAY premium visual QC requirements.

## 7. Rollout plan

| Phase | Deliverable | Hard gate |
|---|---|---|
| 0 | Discovery, ADR, CRM baseline, provider readiness assessment | Complete. |
| 1 | Brand Studio, 35-question interview, roles, Brand Book/version governance | Complete after validation; no autonomous output. |
| 2 | Source library, programme knowledge, official-source allowlist, claim review | Requires active Brand Book and source owners. |
| 3 | Work-order engine, immutable artifacts, provider adapters, cost ledger and dry runs | Requires provider credentials/configuration and owner-approved cost caps. |
| 4 | Content Studio, QA and Approval Inbox with final previews | Requires Brand Book and claim-source gates. |
| 5 | Meta Campaign Operations, CRM attribution, budget ledger and measurement pilot | Requires separate Ads Strategy Intake approval, Meta permissions and explicit spend caps. |
| 6 | Controlled optimisation and weekly executive reporting | Requires proven pilot attribution, reconciliation and rollback evidence. |

## 8. Phase 1 acceptance record

- [x] Exact 35-question discovery contract represented in code and tested.
- [x] One-question user interface with progress, resume and Back/Edit.
- [x] Owner-only discovery, approval, role and provider governance.
- [x] Immutable Brand Book versions with SHA-256 payload hash.
- [x] Additive schema reviewed and applied.
- [x] Provider alias registry seeded as disabled/kill-switched readiness records.
- [x] No publishing, campaign, budget, CAPI, or external-provider action exists in this phase.
- [ ] Mahmoud begins Question 01 and approves a completed Brand Book.
- [ ] Separate owner approval for Phase 2 knowledge/claims implementation.

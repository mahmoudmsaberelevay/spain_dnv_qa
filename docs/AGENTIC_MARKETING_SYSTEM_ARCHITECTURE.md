# ELEVAY Agentic Marketing System — Architecture Decision Record

**Date:** 29 September 2026  
**Status:** Phases 0–4 complete in controlled internal-only mode; provider execution, publishing, campaign mutation, and spend remain locked
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

The owner-facing Brand Studio implements the blueprint’s exact 35 questions in source order. Per Mahmoud’s workflow preference, it displays the complete question set in one sectioned owner form; supports one secure Save Complete Form action for all completed answers, per-question edit, owner-provided evidence files, safe recommendation confirmation, logout/restart resume, whole-interview or section reset, and immutable version history.

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
| 2 | Source library, programme knowledge, official-source allowlist, claim review | Implemented in internal-only mode; Brand Book and explicit claim approval remain required before downstream content work. |
| 3 | Work-order engine, immutable artifacts, cost ledger and zero-cost dry runs | Complete as a control plane. Provider execution remains excluded pending a later explicit approval. |
| 4 | Content Studio, QA and Approval Inbox with final previews | Complete as a manual evidence-and-approval control plane; it cannot generate, render, publish, schedule, campaign-mutate, or spend. |
| 5 | Meta Campaign Operations, CRM attribution, budget ledger and measurement pilot | Requires separate Ads Strategy Intake approval, Meta permissions and explicit spend caps. |
| 6 | Controlled optimisation and weekly executive reporting | Requires proven pilot attribution, reconciliation and rollback evidence. |

## 8. Phase 1 acceptance record

- [x] Exact 35-question discovery contract represented in code and tested.
- [x] Complete sectioned 35-question owner form with progress, secure bulk save, resume and per-question editing.
- [x] Owner-only discovery, approval, role and provider governance.
- [x] Immutable Brand Book versions with SHA-256 payload hash.
- [x] Additive schema reviewed and applied.
- [x] Provider alias registry seeded as disabled/kill-switched readiness records.
- [x] No publishing, campaign, budget, CAPI, or external-provider action exists in this phase.
- [ ] Mahmoud begins Question 01 and approves a completed Brand Book.
- [ ] Separate owner approval for Phase 2 knowledge/claims implementation.

## 9. Phase 2 knowledge-governance decision

Phase 2 introduces an **internal-only Official Knowledge Library** that is intentionally separate from existing programme summaries and marketing plans.

| Record | Purpose | Guardrail |
|---|---|---|
| `marketing_knowledge_sources` | Versioned programme authority source, source snapshot/hash, authority, programme, review and material-change state | Exact HTTPS authority-domain allowlist; initial sources are candidates only. |
| `marketing_knowledge_claims` | A proposed or reviewed internal statement tied to the exact supporting source snapshot hash | Cannot be proposed without a same-programme approved/tracked source; cannot be approved after source change. |

### Phase 2 access and lifecycle

- Researchers and Marketing Managers may submit an allowlisted authority source and propose a source-backed claim.
- Mahmoud alone approves a source, approves/holds/rejects a claim, or marks a material source change.
- A material change immediately sets the source to `needs_review` and demotes every dependent approved claim to `needs_review`.
- No query, source, or claim is a publish action. The library creates no external-provider request, Meta update, campaign, budget, CAPI event, email, WhatsApp message, client advice, or legal conclusion.
- Three reviewed authority records for Spain international teleworker residency and Malta MPRP were seeded as `candidate`; no source or claim is approved.

### Phase 2 acceptance record

- [x] Additive schema with source/claim hashes, review state and source-change state applied.
- [x] Official-domain allowlist rejects non-HTTPS and lookalike hostnames.
- [x] Candidate evidence is separate from approved claims and has no client/Lead data.
- [x] Owner-only approval and review gates are enforced server-side.
- [x] Material-source-change flow demotes dependent claims instead of silently changing wording.
- [x] Desktop and mobile Marketing navigation expose the protected Knowledge Library route.
- [x] No provider, publication, campaign, budget or CAPI action exists in Phase 2.

## 10. Phase 3 controlled work-order decision

Phase 3 implements the blueprint's orchestration **control plane**, not its execution plane. The four additive tables below create fully inspectable lineage without calling a model or vendor:

| Record | Purpose | Guardrail |
|---|---|---|
| `marketing_work_orders` | Typed objective, programme, provider alias/model, Brand Book version, claim/input references, output schema, state, cost ceiling/estimate and review state | Rejects client/Lead contact and identity references; non-research types require active Brand Book and approved tracked claims. |
| `marketing_work_order_artifacts` | Immutable SHA-256-hashed dry-run validation or later typed artifact metadata | Phase 3 creates dry-run metadata only; it stores no model output, client content, media bytes or provider response. |
| `marketing_work_order_events` | Append-only human-visible transition and decision trail | Approval, hold, rejection and cancellation retain actor, reason, state transition and timestamp. |
| `marketing_work_order_cost_ledger` | Separate ceiling, estimate, actual and dry-run cost events | Phase 3 writes only ceiling, estimate and `0.00` dry-run entries. It never authorizes or records a payment. |

### Phase 3 lifecycle and authority

- A permitted role creates a `draft`; its creator or Mahmoud submits it.
- Mahmoud alone can `approve`, `hold`, or `reject` a submitted work order with a retained decision note.
- Only Mahmoud can request a dry run, and only for an explicitly approved work order.
- A dry run validates provider alias/kill-switch state, active Brand Book, approved claims and Phase 3 execution prohibition. It creates a zero-cost immutable validation artifact; it cannot invoke any provider.
- The creator or Mahmoud can cancel a non-terminal work order with a retained reason. Records are never deleted.

### Phase 3 acceptance record

- [x] Typed work-order schemas and safe state machine added.
- [x] Owner review, cancellation, cost-ceiling, estimate and immutable lineage enforced server-side.
- [x] Privacy filter rejects email, phone/contact, passport, national-ID and client-code references in model-ready fields.
- [x] Provider execution, publishing, client messaging, campaign changes, CAPI changes, spend and payment remain unavailable.
- [x] Protected responsive Work Orders route added to desktop and mobile Marketing navigation.
- [x] Additive migration applied with all four tables initially empty.
- [x] Focused tests, production build, access-guard check and diff hygiene completed before checkpoint.

## 11. Phase 4 Content Studio and Approval Inbox decision

Phase 4 creates the blueprint's **human-controlled content review layer** without adding any generator, renderer, scheduler, publisher, campaign operator, message sender or payment pathway. It is the first point where a human can store a platform-shaped marketing packet, but it remains fully internal.

| Record | Purpose | Guardrail |
|---|---|---|
| `marketing_content_packets` | Versioned manual static-post, carousel, reel, lead-ad or landing-page packet; exact copy, claims, final-preview URL/hash, QA state and owner decision | Requires an owner-approved creative work order anchored to the current Brand Book, plus only tracked owner-approved claims already attached to that work order. Rejects client/Lead identity data. |
| `marketing_content_review_events` | Append-only QA, feedback, owner decision, revision, supersession and stop history | The original copy is preserved; a revision creates a new hash/version and marks the predecessor superseded. |
| `marketing_content_approval_batches` | Explicit owner weekly batch decision for multiple routine final packets | Every item must be `approval_ready`, must be fully reviewed explicitly, and cannot have an exceptional claim. |

### Phase 4 lifecycle and authority

1. A permitted Creative Producer, Marketing Manager or owner creates a manual `draft` from an **approved creative work order**. It contains Arabic-first copy, platform variants, objective, audience, verified claim IDs, visual brief and optional final preview.
2. The creator submits it for `in_review`. A Marketing Manager or owner records every deterministic QA check: factual/claim links, brand tone, Arabic, visual identity, safe areas, accessibility, CTA/destination, asset provenance, no guarantees and preview equivalence.
3. A packet with a final HTTPS preview, SHA-256 preview fingerprint and all ten checks passed becomes `qa_passed`; a qualified reviewer moves it to `approval_ready`.
4. Mahmoud can approve, request structured changes or reject an Approval Ready packet. Approval always remains `not_published`; it never triggers an external action.
5. Mahmoud may approve a fully reviewed routine batch only after explicitly confirming every selected final packet. Exceptional claims stay individual-only.
6. The creator, Marketing Manager or Mahmoud can stop a non-terminal packet immediately, with an immutable reason. No record is deleted.

### Phase 4 hard boundaries

- Content packets are manual records, not AI generation requests. No provider/model, ElevenLabs, image generator, video renderer, Creatomate, Runway, Manus task or external credential is invoked.
- No approval transmits content, creates a social draft, schedules a post, sends a notification, creates or activates Meta ads, changes CAPI, modifies budgets, reserves spend, contacts a client/Lead, or marks anything published.
- A final preview is represented only by a stored **HTTPS URL and SHA-256 fingerprint**; the system does not assert that a preview is a final asset until an authorized human has checked it.
- Existing ELEVAY premium visual, Arabic, non-guarantee, no-passport, and wardrobe/visual-QC rules remain QA requirements. The Content Studio does not weaken them.

### Phase 4 acceptance record

- [x] Additive packet, event and batch schema applied without changing existing CRM or Marketing records.
- [x] Brand Book, approved creative work-order, claim-source tracking, Arabic-first copy and no-PII gates enforced server-side.
- [x] Full QA checklist and final HTTPS preview/SHA-256 fingerprint gate enforced before Approval Ready.
- [x] Owner-only individual approval; batch approval requires explicit full-review acknowledgement and excludes exceptional claims.
- [x] Versioned revisions, structured feedback, rejection and stop controls retain immutable lineage; no content packet is deleted.
- [x] Protected responsive Content Studio and Approval Inbox route added to desktop and mobile Marketing navigation.
- [x] No provider invocation, media rendering, publishing, scheduling, campaign mutation, CAPI change, messaging or paid spend path exists in Phase 4.

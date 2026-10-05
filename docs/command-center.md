# ELEVAY Marketing Command Center (`/admin/`)

A separate section of elevay.vip where the marketing team approves the work Manus produces, alongside the existing Agentic Marketing System at `/marketing/agentic-system`.

## What it adds

- **Weekly plan approval**: 7 posts a week (4 static by OpenAI, 3 reels by Higgsfield as 4 × 5 s clips joined into one video plus the 3 s white logo outro). Approve, request changes (scope suggested from the comment so Manus regenerates only that part), reject, or approve all.
- **Automatic brand and compliance check** on every brief: no تأشيرة/Visa, guarantees, fake urgency, broker wording or contact details in captions; disclaimer required; 100–150 words with hook and CTA; English-only design text; reel structure; Elevay.vip voice for speech.
- **Spend guardrails**: 200,000 EGP monthly cap with projected month-end spend; 100 EGP max cost per lead (ad set above it for 3+ days with 1,000+ EGP spent is flagged); budget increases that would break the cap are refused.
- **First-pass approval tracker and autopublish gate**: owner-only switch after 6 weeks at 90%+, kill switch on any rejection, compliance flag, or rolling 4-week rate below 85%.
- **Manus job queue**: every decision becomes a job for Manus; Manus questions show up for the team to answer.
- Friday action plan, Meta report view, weekly news with confidence levels, monthly plan approval, audit log.

## Access

People sign in with their elevay.vip accounts. Access comes from the Agentic Marketing roles:

| Agentic Marketing role | Command Center |
|---|---|
| CRM owner, Agentic Marketing administrator | Owner: approves content, Meta actions, plans, autopublish, limits |
| Marketing manager, creative producer, researcher | Marketer: requests changes, asks Manus |
| Analyst | Viewer |
| No role | No access |

## Data

Stored in its own tables (`ec_meta`, `ec_items`, `ec_jobs`, `ec_audit`, `ec_kv`), created automatically on first use with `CREATE TABLE IF NOT EXISTS`. It does not read or write Lead, client, CRM or finance tables. It reads `users` and `marketing_system_role_assignments` only to decide access.

## Manus connection

The owner opens **Manus bridge → Show credentials** to get:

- Agent API base: `https://elevay.vip/admin/api/agent`
- Agent token: save in Manus secrets as `ELEVAY_AGENT_TOKEN` (Authorization: Bearer)
- Webhook URL for Manus API task events

Endpoints (all JSON, Bearer token):

| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs?status=pending` | Work to do (schedule_post, revise_item, item_rejected, execute_action, pause_adset, autopublish_on/off, custom) |
| POST | `/jobs/{id}/ack` · `/complete` · `/fail` · `/ask` | Job lifecycle |
| POST | `/briefs` | Weekly content briefs (Saturday 09:00) and revisions; re-posting an item_id makes the next version |
| POST | `/items/{item_id}/publish-status` | `scheduled` / `published` |
| POST | `/reports` | Friday Meta report (`month`, `asOf`, `spendMtdEgp`, `adsets[]` with `cplHistory`) |
| POST | `/actions` · `/actions/{id}/result` | Friday action plan and execution results |
| POST | `/news` · `/plans` | Weekly news, monthly plan |
| GET | `/summary` · `/items` · `/ping` | Read state |

Optional push mode: set the secret `ELEVAY_COMMAND_CENTER_MANUS_API_KEY` (and optionally `ELEVAY_COMMAND_CENTER_MANUS_PROJECT_ID`) so each new job also starts a Manus task immediately.

## Files

- `server/commandCenter/routes.ts`: routes, storage, access
- `server/commandCenter/{rules,engine,demo-data,manus}.ts`: generated from `client/public/admin-cc/shared/*.js` and `manus.src.js` by `node scripts/build-command-center-modules.mjs`; the browser and the server run the same rules
- `client/public/admin-cc/`: dashboard (plain JS + CSS)
- `server/commandCenter/commandCenter.test.ts`: tests

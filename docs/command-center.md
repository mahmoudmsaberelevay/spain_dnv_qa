# ELEVAY Marketing Command Center (`/admin/`)

A separate section of elevay.vip where the marketing team approves the work Manus produces, alongside the existing Agentic Marketing System at `/marketing/agentic-system`.

## What it adds

- **Weekly plan approval**: 7 posts a week (4 static by OpenAI, 3 reels by Higgsfield as 4 × 5 s clips joined into one video plus the 3 s white logo outro). Approve, request changes (scope suggested from the comment so Manus regenerates only that part), reject, or approve all.
- **Automatic brand and compliance check** on every brief: no تأشيرة/Visa, guarantees, fake urgency, broker wording or contact details in captions; disclaimer required; 100–150 words with hook and CTA; English-only design text; reel structure; Elevay.vip voice for speech.
- **Spend guardrails**: 200,000 EGP monthly cap with projected month-end spend; 100 EGP max cost per lead (ad set above it for 3+ days with 1,000+ EGP spent is flagged); budget increases that would break the cap are refused.
- **First-pass approval tracker and autopublish gate**: owner-only switch after 6 weeks at 90%+, kill switch on any rejection, compliance flag, or rolling 4-week rate below 85%.
- **Manus job queue**: every decision becomes a job for Manus; Manus questions show up for the team to answer.
- Friday action plan, Meta report view, weekly news with confidence levels, monthly plan approval, audit log.

## Live Meta + CRM data (read-only)

`GET /admin/api/live` (team) and `GET /admin/api/agent/live` (Manus) build one report, cached 30 minutes in `ec_cache` (Refresh forces a rebuild, at most every 2 minutes):

- **Meta ads, last 30 complete Cairo days**: spend, Meta leads, CPL, reach, frequency, impressions, CPM, clicks, CTR, video views, ThruPlays, page likes and messages from ads, per campaign and best/weakest ads. Uses `META_SYSTEM_USER_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID` (needs `ads_read`).
- **Page growth**: page views, new likes/follows, unfollows, video views and Instagram views/new followers. Uses `META_PAGE_ACCESS_TOKEN` / `META_PAGE_ID`, falling back to the active Meta lead integration (needs `read_insights`, `pages_read_engagement`, `instagram_manage_insights` for Instagram). Each metric tries Meta's current name first and older names after, and the page shows which one answered.
- **CRM funnel (ELEVAY CRM, same database)**: new leads, moved to qualified, moved to unqualified (with reasons), new clients (stage Client or contract signed), from Meta and all sources, plus where the 30-day leads stand today. Each campaign is joined with its CRM outcomes for cost per qualified lead.
- **6-month analysis** for the monthly plan: month-by-month spend, CPL, CRM leads, qualified rate, clients and cost per qualified, trends against the last complete month, top unqualified reason, best program, and campaign suggestions (scale / reduce / fix quality) with a budget split inside 90% of the cap. *Ask Manus to update the plan* turns it into a Manus job; the revised plan comes back for owner approval.

All Meta calls are GET. It reads `leads`, `lead_activities` and `lead_integrations` and writes nothing to them.

## AI Studio (Claude ⇄ OpenAI ⇄ Higgsfield ⇄ Manus)

The **AI Studio** tab (`server/commandCenter/ai.ts`) runs requests through the models. Claude is the conductor: it routes a free request, writes briefs, storyboards and plans, fixes brand blocks once, and checks the generated visuals. Every instruction and answer is kept in the run's "Conversation between the models".

| Request | Steps |
|---|---|
| Static post | Claude brief → ELEVAY rules check → **OpenAI** design (approval: marketer/owner) → official logo composited → Claude visual QC → weekly plan |
| Reel | Claude storyboard + Egyptian Arabic voice-over → rules check → **OpenAI** 4 keyframes (approval) → Claude QC → **Higgsfield** 4 × 5 s clips (owner approval) → weekly plan |
| Monthly plan from data | Claude reads the live Meta + CRM report → monthly plan for owner approval |
| Meta / Manus task | Claude writes Manus instructions → owner approval when it changes Meta → **Manus** job → Claude summary |
| Question | Claude answers from the live data |

Keys used on the server: `ANTHROPIC_API_KEY` (optional `ELEVAY_CLAUDE_MODEL`), `OPENAI_API_KEY`, `HF_API_KEY`; Manus through the existing job queue. Runs are stored in `ec_ai_runs`; waiting runs resume every 45 s, and a step interrupted by a restart is marked failed for a manual retry (paid work is never re-run silently). Manus can read runs (`GET /agent/ai/runs`) and start one (`POST /agent/ai/runs` with `kind` and `request`); paid steps still wait for a person.

## Access

People sign in with their elevay.vip accounts. Access comes from the Agentic Marketing roles:

| Agentic Marketing role | Command Center |
|---|---|
| CRM owner, Agentic Marketing administrator | Owner: approves content, Meta actions, plans, autopublish, limits |
| Marketing manager, creative producer, researcher | Marketer: requests changes, asks Manus |
| Analyst | Viewer |
| No role | No access |

## Data

Stored in its own tables (`ec_meta`, `ec_items`, `ec_jobs`, `ec_audit`, `ec_kv`, `ec_cache`), created automatically on first use with `CREATE TABLE IF NOT EXISTS`. It reads `users` and `marketing_system_role_assignments` to decide access and reads (never writes) `leads`, `lead_activities` and `lead_integrations` for the live report.

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
| GET | `/live` | Live Meta + CRM report and the 6-month analysis (use it for the monthly plan) |

Optional push mode: set the secret `ELEVAY_COMMAND_CENTER_MANUS_API_KEY` (and optionally `ELEVAY_COMMAND_CENTER_MANUS_PROJECT_ID`) so each new job also starts a Manus task immediately.

## Files

- `server/commandCenter/routes.ts`: routes, storage, access
- `server/commandCenter/ai.ts`: AI Studio orchestrator and provider adapters (`ai.test.ts`)
- `server/commandCenter/live.ts`: live Meta + CRM report and 6-month analysis (`live.test.ts`)
- `server/commandCenter/{rules,engine,demo-data,manus}.ts`: generated from `client/public/admin-cc/shared/*.js` and `manus.src.js` by `node scripts/build-command-center-modules.mjs`; the browser and the server run the same rules
- `client/public/admin-cc/`: dashboard (plain JS + CSS)
- `server/commandCenter/commandCenter.test.ts`: tests

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
| Reel | Claude storyboard + Egyptian Arabic voice-over → rules check → **OpenAI** 4 keyframes → Claude QC → **Higgsfield** 4 × 5 s clips (owner approval until autopilot) → clip QC → **ELEVAY voice clone** → final 23 s edit with logo outro → final QC → weekly plan |
| Monthly plan from data | Claude reads the live Meta + CRM report → monthly plan for owner approval |
| Meta / Manus task | Claude writes Manus instructions → owner approval when it changes Meta → **Manus** job → Claude summary |
| Question | Claude answers from the live data |

Keys used on the server: `ANTHROPIC_API_KEY` (optional `ELEVAY_CLAUDE_MODEL`), `OPENAI_API_KEY`, `HF_API_KEY`; Manus through the existing job queue. Runs are stored in `ec_ai_runs`; waiting runs resume every 45 s, and a step interrupted by a restart is marked failed for a manual retry (paid work is never re-run silently). Manus can read runs (`GET /agent/ai/runs`) and start one (`POST /agent/ai/runs` with `kind` and `request`); paid steps still wait for a person.

### Autopilot

- **Weekly**: every Saturday from 09:00 Cairo, Claude plans next week's 7 posts (4 static + 3 reels) from the live Meta + CRM data, the approved monthly plan and verified news, then starts their production as items 01–07. **Monthly**: from the 25th, Claude drafts next month's plan. Buttons in AI Studio start either immediately.
- **Approvals**: OpenAI never waits. During the first weeks the owner approves Higgsfield clips, Meta-changing Manus tasks, posts and plans. The first time the 6-week / 90% first-pass gate is reached, autopilot switches on by itself: clips, Meta tasks (inside the cap and max CPL), Friday action-plan items (cap-breaking ones are still refused), posts that pass QC and compliance, and monthly plans then go ahead automatically. Auto-approved posts don't count toward the human first-pass rate. Any rejection, compliance flag or rolling rate below 85% switches it off; the owner switches it back on in Settings.
- **Runs started by Manus** are automatic. A reel limit per 7 days (default 6, Settings in AI Studio) caps Higgsfield spend.

### Strict design rules

Every design goes through three layers; nothing that fails reaches autopilot or publishing:

1. **Rules check before any paid generation** (`rules.js`, shared with the dashboard and applied to Manus briefs too): sentence-case English design text; image and keyframe prompts with Arab/Middle Eastern people, complete outfits and formal shoes with suits; no passports, flags, seals, documents, portals, sculptures, QR/contact details, traditional headwear, handshakes or AI-drawn logos (negated phrases like "no passports" are allowed); reel motion prompts without on-screen text or flashy effects; voice-over names in English letters. Claude fixes blocks once, otherwise the run stops.
2. **Server-side composition**: statics are 1080×1350 (4:5, default) or 1080×1080, full-bleed photograph, Apex Sans headline, official logo in the top-left corner; OpenAI never draws text or the logo.
3. **Strict Claude review**: the finished static (or each reel keyframe) is checked against the delivery checklist; failing designs are redone with Claude's fix (only the failing keyframes), up to 2 times. Reel clips get a frame-by-frame review (start, middle, end of each clip) with one automatic re-generation of failing clips. Still failing → the item goes to the owner as **QC failed**, is never auto-approved, and a reel with failing keyframes never reaches the paid Higgsfield step.

### Reel voice-over and final edit

After the clips pass review: Claude's script must be natural Egyptian Arabic (checked on the whole script), with only country names and ELEVAY in English letters. The **ELEVAY voice clone configured on elevay.vip** (`ELEVAY_ARABIC_VOICE_DEFAULTS`, ElevenLabs `eleven_v3`, `[thoughtful]` delivery) records one take per scene. The final edit (`composeElevayReel`) is 1080×1920 at 30 fps, about 23 s: four 5-second clips with 0.3 s cross-dissolves, each scene's voice starting with its scene and finishing before the outro (a line longer than 5 s is sped up at most 12%, otherwise Claude shortens it once and that scene is re-recorded), then 3 s of the official logo static and centred on white with no narration. Optional licensed music: set `ELEVAY_REEL_MUSIC_URLS` (comma-separated MP3 links); it is ducked under the voice and fades over the outro. Claude reviews 6 frames of the final reel (one per scene plus the outro); a failure marks the reel QC failed. Under autopilot, a reel that passes every review is approved automatically like a static.

### Approved sources

`server/commandCenter/assets/` (copied to `dist/command-center-assets/` on build):
- `knowledge/spain-digital-nomad.md`, `knowledge/malta-permanent-residence.md`: owner-approved program Q&A. `knowledge.ts` turns them into fact sheets for Claude; program figures may only come from these sources, and other programs are described without numbers.
- `creative/*.md`: ELEVAY creative direction (brand identity, design, video and audio, delivery checklist), condensed into the rules every model receives; the checklist drives Claude's visual QC.
- `elevay-logo.png` (official logo) and `ApexSansBook.ttf` (official font): statics are composed server-side (photo + Apex Sans headline + exact logo); OpenAI never draws text or the logo.

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

// @ts-nocheck
/**
 * Credits tab: what each AI platform has left, read live wherever the platform offers an API for it.
 *
 *   Manus               live remaining credits          GET api.manus.ai/v2/usage.availableCredits (MANUS_API_KEY)
 *   ElevenLabs (voice)  live characters used / left      GET api.elevenlabs.io/v1/user/subscription (ELEVENLABS_API_KEY)
 *   Claude API          live spend this month (USD)      Admin API cost_report (ANTHROPIC_ADMIN_KEY, sk-ant-admin…)
 *   OpenAI API          live spend this month (USD)      Admin API organization/costs (OPENAI_ADMIN_KEY, sk-admin…)
 *   Higgsfield API      no balance API → owner-entered balance, minus clips the system made since then
 *   Claude / ChatGPT / Higgsfield subscriptions: no API → owner-entered plan details + link to the usage page
 *
 * "Remaining" for the Claude and OpenAI APIs = the prepaid balance the owner enters − live spend since that date.
 * Keys are read from the server environment only; nothing here returns a key.
 */

const TTL = 10 * 60 * 1000;
let cache = { at: 0, data: null };

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

async function getJson(fetcher, url, headers) {
  const r = await fetcher(url, { headers, signal: AbortSignal.timeout(20000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || body?.detail?.message || body?.message || `HTTP ${r.status}`);
  return body;
}

export async function manusCredits(fetcher = fetch) {
  const key = process.env.MANUS_API_KEY;
  if (!key) return { status: "needs_key", need: "MANUS_API_KEY" };
  const b = await getJson(fetcher, "https://api.manus.ai/v2/usage.availableCredits", { "x-manus-api-key": key });
  const d = b.data || {};
  return {
    status: "live", unit: "credits", remaining: num(d.total_credits),
    breakdown: { monthly: num(d.periodic_credits), add_on: num(d.addon_credits), free: num(d.free_credits), refresh: num(d.refresh_credits) },
    renews_at: d.current_period_end ? new Date(d.current_period_end * 1000).toISOString() : null,
    next_refresh: d.next_refresh_time ? new Date(d.next_refresh_time * 1000).toISOString() : null,
  };
}

export async function elevenLabsCredits(fetcher = fetch) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { status: "needs_key", need: "ELEVENLABS_API_KEY" };
  const b = await getJson(fetcher, "https://api.elevenlabs.io/v1/user/subscription", { "xi-api-key": key });
  const used = num(b.character_count), limit = num(b.character_limit);
  return {
    status: "live", unit: "characters", used, limit, remaining: used !== null && limit !== null ? Math.max(0, limit - used) : null,
    plan: b.tier || null, renews_at: b.next_character_count_reset_unix ? new Date(b.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

/** Claude API spend in USD between `from` and now (cost_report amounts are decimal strings in cents). */
export async function claudeApiSpend(fetcher = fetch, from = monthStart()) {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { status: "needs_key", need: "ANTHROPIC_ADMIN_KEY" };
  let cents = 0, page = null;
  for (let i = 0; i < 6; i++) {
    const qs = new URLSearchParams({ starting_at: from.toISOString(), ending_at: new Date().toISOString(), bucket_width: "1d", limit: "31" });
    if (page) qs.set("page", page);
    const b = await getJson(fetcher, `https://api.anthropic.com/v1/organizations/cost_report?${qs}`, { "x-api-key": key, "anthropic-version": "2023-06-01" });
    for (const bucket of b.data || []) for (const r of bucket.results || []) cents += Number(r.amount) || 0;
    if (!b.has_more || !b.next_page) break;
    page = b.next_page;
  }
  return { status: "live", unit: "USD", spent: Math.round(cents) / 100, since: from.toISOString() };
}

/** OpenAI API spend in USD between `from` and now. */
export async function openAiApiSpend(fetcher = fetch, from = monthStart()) {
  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) return { status: "needs_key", need: "OPENAI_ADMIN_KEY" };
  let usd = 0, page = null;
  for (let i = 0; i < 6; i++) {
    const qs = new URLSearchParams({ start_time: String(Math.floor(from.getTime() / 1000)), bucket_width: "1d", limit: "31" });
    if (page) qs.set("page", page);
    const b = await getJson(fetcher, `https://api.openai.com/v1/organization/costs?${qs}`, { Authorization: `Bearer ${key}` });
    for (const bucket of b.data || []) for (const r of bucket.results || []) usd += Number(r.amount?.value) || 0;
    if (!b.has_more || !b.next_page) break;
    page = b.next_page;
  }
  return { status: "live", unit: "USD", spent: Math.round(usd * 100) / 100, since: from.toISOString() };
}

/** Higgsfield clips the AI Studio made since a date (each reel = 4 clips). */
export async function higgsfieldClipsSince(q, sinceIso) {
  const since = Date.parse(sinceIso || monthStart().toISOString());
  const rows = await q("SELECT doc FROM ec_ai_runs ORDER BY id DESC LIMIT 400");
  let clips = 0;
  for (const r of rows) {
    let doc; try { doc = JSON.parse(r.doc); } catch { continue; }
    for (const c of doc.artifacts?.clips || []) if (c?.url && Date.parse(c.completed_at || c.created_at || doc.updated_at || doc.created_at) >= since) clips++;
  }
  return clips;
}

const LINKS = {
  claude_api: "https://platform.claude.com/settings/billing",
  openai_api: "https://platform.openai.com/settings/organization/billing/overview",
  higgsfield_api: "https://cloud.higgsfield.ai",
  manus: "https://manus.im",
  elevenlabs: "https://elevenlabs.io/app/subscription",
  claude_app: "https://claude.ai/settings/usage",
  chatgpt_app: "https://chatgpt.com/#settings",
  higgsfield_app: "https://higgsfield.ai",
};

/** Full report. `manual` = owner-entered balances/plans from settings.credits. */
export async function creditsReport({ q, manual = {}, fetcher = fetch, refresh = false }) {
  if (!refresh && cache.data && Date.now() - cache.at < TTL) return { ...cache.data, cached: true };
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { status: "error", error: String(e?.message || e).slice(0, 200) }; } };
  const m = (k) => manual[k] || {};
  const since = (k) => (m(k).updated_at ? new Date(m(k).updated_at) : monthStart());

  const [manus, eleven, claudeMonth, openaiMonth, claudeSince, openaiSince] = await Promise.all([
    safe(() => manusCredits(fetcher)), safe(() => elevenLabsCredits(fetcher)),
    safe(() => claudeApiSpend(fetcher)), safe(() => openAiApiSpend(fetcher)),
    m("claude_api").balance != null ? safe(() => claudeApiSpend(fetcher, since("claude_api"))) : null,
    m("openai_api").balance != null ? safe(() => openAiApiSpend(fetcher, since("openai_api"))) : null,
  ]);
  const remainingFrom = (k, sinceSpend) => (m(k).balance != null && sinceSpend?.status === "live" ? Math.round((Number(m(k).balance) - sinceSpend.spent) * 100) / 100 : null);
  const hfClipsMonth = await higgsfieldClipsSince(q).catch(() => null);
  const hfClipsSince = m("higgsfield_api").balance != null ? await higgsfieldClipsSince(q, m("higgsfield_api").updated_at).catch(() => null) : null;
  const perClip = num(m("higgsfield_api").credits_per_clip);

  const platforms = [
    { id: "claude_api", name: "Claude API", source: claudeMonth?.status === "live" ? "live spend" : claudeMonth?.status, unit: "USD", spent_this_month: claudeMonth?.spent ?? null, remaining: remainingFrom("claude_api", claudeSince), entered: m("claude_api"), error: claudeMonth?.error, need: claudeMonth?.need, link: LINKS.claude_api, note: "Anthropic does not publish the prepaid balance through its API. Enter your balance once; the tab subtracts live spend since then." },
    { id: "openai_api", name: "OpenAI API", source: openaiMonth?.status === "live" ? "live spend" : openaiMonth?.status, unit: "USD", spent_this_month: openaiMonth?.spent ?? null, remaining: remainingFrom("openai_api", openaiSince), entered: m("openai_api"), error: openaiMonth?.error, need: openaiMonth?.need, link: LINKS.openai_api, note: "OpenAI does not publish the prepaid balance through its API. Enter your balance once; the tab subtracts live spend since then." },
    { id: "higgsfield_api", name: "Higgsfield API", source: "estimate", unit: "credits", used_this_month: hfClipsMonth != null ? `${hfClipsMonth} clips` : null, remaining: m("higgsfield_api").balance != null && perClip != null && hfClipsSince != null ? Math.round((Number(m("higgsfield_api").balance) - hfClipsSince * perClip) * 10) / 10 : (m("higgsfield_api").balance ?? null), entered: m("higgsfield_api"), link: LINKS.higgsfield_api, note: "Higgsfield has no balance API. Enter your balance and the credits one 5-second clip costs; the tab subtracts the clips the AI Studio has made since." },
    { id: "manus", name: "Manus", source: manus?.status, unit: "credits", remaining: manus?.remaining ?? null, breakdown: manus?.breakdown, renews_at: manus?.renews_at, error: manus?.error, need: manus?.need, link: LINKS.manus },
    { id: "elevenlabs", name: "ElevenLabs (ELEVAY voice)", source: eleven?.status, unit: "characters", used: eleven?.used ?? null, limit: eleven?.limit ?? null, remaining: eleven?.remaining ?? null, plan: eleven?.plan, renews_at: eleven?.renews_at, error: eleven?.error, need: eleven?.need, link: LINKS.elevenlabs },
    { id: "claude_app", name: "Claude (subscription)", source: "manual", entered: m("claude_app"), link: LINKS.claude_app, note: "The Claude app has no usage API; open the usage page or note your plan here." },
    { id: "chatgpt_app", name: "ChatGPT / OpenAI (subscription)", source: "manual", entered: m("chatgpt_app"), link: LINKS.chatgpt_app, note: "ChatGPT has no usage API; note your plan here." },
    { id: "higgsfield_app", name: "Higgsfield (app subscription)", source: "manual", entered: m("higgsfield_app"), link: LINKS.higgsfield_app, note: "Enter the credits shown in your Higgsfield account." },
  ];
  const data = { ok: true, generated_at: new Date().toISOString(), platforms };
  cache = { at: Date.now(), data };
  return data;
}

export const CREDIT_IDS = ["claude_api", "openai_api", "higgsfield_api", "manus", "elevenlabs", "claude_app", "chatgpt_app", "higgsfield_app"];
export function cleanManualCredit(body) {
  const balance = num(body.balance);
  return {
    balance, credits_per_clip: num(body.credits_per_clip),
    plan: String(body.plan || "").slice(0, 80), renews_on: /^\d{4}-\d{2}-\d{2}$/.test(body.renews_on || "") ? body.renews_on : "",
    note: String(body.note || "").slice(0, 300), updated_at: new Date().toISOString(),
  };
}
export function clearCreditsCache() { cache = { at: 0, data: null }; }

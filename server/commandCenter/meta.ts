// @ts-nocheck
/*
 * Meta actions for the Command Center: replies to comments and messages, publishing approved
 * posts, and campaign changes (pause/activate, daily budget, new lead campaigns).
 *
 * Every change is an action in a queue. It runs only after the owner approves it in /admin —
 * or automatically once the 6-week / 90% autopilot gate is reached. Even then:
 *   - complaints, sensitive conversations and anything Claude marks "needs a person" wait for a human;
 *   - budget increases and activations are refused when they would break the 200,000 EGP monthly cap,
 *     or raise budget on a campaign above the 100 EGP max CPL;
 *   - new campaigns are always created PAUSED (activation is a separate action).
 * Publishing an approved post needs no second approval: the item approval is the approval.
 *
 * Tokens: META_PAGE_ACCESS_TOKEN (page: posts, comments, messages, Instagram) and
 * META_SYSTEM_USER_ACCESS_TOKEN + META_AD_ACCOUNT_ID (ads).
 */
import { pageCredentials, lastDays } from "./live";
import { ELEVAY_RULES } from "./ai";
import { programFactsFor } from "./knowledge";

const ver = () => process.env.META_GRAPH_API_VERSION || "v26.0";
const nowIso = () => new Date().toISOString();
const clip = (s, n = 2000) => { const t = typeof s === "string" ? s : JSON.stringify(s); return t && t.length > n ? t.slice(0, n) + "…" : t; };

export const META_KINDS = {
  reply_comment: "Reply to a comment",
  reply_message: "Reply to a message",
  campaign_status: "Pause or activate",
  campaign_budget: "Change daily budget",
  create_campaign: "Create a lead campaign (paused)",
};

const SPECIAL_AD_CATEGORIES = new Set(["HOUSING", "EMPLOYMENT", "CREDIT", "ISSUES_ELECTIONS_POLITICS"]);

/**
 * Meta treats Housing, Employment, Credit and social issues/politics as special
 * categories. Residency and citizenship marketing is deliberately not inferred
 * into one of those categories; the actual brief/copy is evaluated instead.
 * A matching campaign cannot be proposed unless the owner-selected category is
 * explicit, so the creation call never makes that compliance decision silently.
 */
export function resolveSpecialAdCategories(campaign) {
  const text = [campaign?.name, campaign?.headline, campaign?.message].filter(Boolean).join(" ").toLowerCase();
  const inferred = /\b(job|jobs|career|hiring|employment|recruit(?:ment|ing)?)\b|وظيف|توظيف/.test(text) ? "EMPLOYMENT"
    : /\b(house|housing|home loan|mortgage|real estate|property)\b|عقار|سكن|تمويل عقاري/.test(text) ? "HOUSING"
    : /\b(credit|loan|lending|finance offer)\b|قرض|ائتمان/.test(text) ? "CREDIT"
    : /\b(election|politic|political|referendum|social issue)\b|انتخاب|سياس/.test(text) ? "ISSUES_ELECTIONS_POLITICS"
    : null;
  const requested = Array.isArray(campaign?.special_ad_categories)
    ? campaign.special_ad_categories.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
    : campaign?.special_ad_category ? [String(campaign.special_ad_category).trim().toUpperCase()] : [];
  if (requested.some((x) => x !== "NONE" && !SPECIAL_AD_CATEGORIES.has(x))) throw new Error("Unknown Meta Special Ad Category.");
  if (requested.includes("NONE") && requested.length > 1) throw new Error("NONE cannot be combined with a Meta Special Ad Category.");
  if (inferred && !requested.includes(inferred)) throw new Error(`This campaign appears to require Meta's ${inferred} Special Ad Category. Select it explicitly before proposing the campaign.`);
  if (!inferred && requested.some((x) => x !== "NONE")) throw new Error("The selected Meta Special Ad Category does not match the proposed campaign copy.");
  return inferred ? [inferred] : [];
}

/** Validates a campaign action proposed by the team, Claude or Manus. */
export function cleanMetaAction(b, R) {
  const kind = String(b.kind || "");
  if (!["campaign_status", "campaign_budget", "create_campaign"].includes(kind)) throw new Error("Unsupported action.");
  if (kind === "campaign_status") { if (!/^\d+$/.test(String(b.target_id))) throw new Error("Campaign or ad set id required."); if (!["ACTIVE", "PAUSED"].includes(b.status_to)) throw new Error("status_to must be ACTIVE or PAUSED."); return { kind, target_id: String(b.target_id), target_name: String(b.target_name || "").slice(0, 200), status_to: b.status_to, preview: `${b.status_to === "ACTIVE" ? "Activate" : "Pause"} ${b.target_name || b.target_id}`, reason: String(b.reason || "").slice(0, 500) }; }
  if (kind === "campaign_budget") { const v = Number(b.daily_budget_egp); if (!/^\d+$/.test(String(b.target_id)) || !(v >= 50 && v <= 50000)) throw new Error("Campaign/ad set id and a daily budget between 50 and 50,000 EGP are required."); return { kind, target_id: String(b.target_id), target_name: String(b.target_name || "").slice(0, 200), daily_budget_egp: v, preview: `Set daily budget of ${b.target_name || b.target_id} to ${v.toLocaleString("en-US")} EGP`, reason: String(b.reason || "").slice(0, 500) }; }
  const c = b.campaign || {};
  const daily = Number(c.daily_budget_egp);
  if (!c.name || !(daily >= 100 && daily <= 50000) || !/^\d+$/.test(String(c.form_id || "")) || !/^https:\/\//.test(String(c.image_url || "")) || !c.message) throw new Error("A new campaign needs a name, a daily budget (100–50,000 EGP), a lead form, an approved design and ad text.");
  const bad = R.checkBrief({ type: "static", caption_ar: String(c.message), disclaimer_used: "x", design: { headline_en: String(c.headline || "") } }).blocks.filter((x) => /^term_|^contact_|^headline_/.test(x.id));
  if (bad.length) throw new Error("Ad text breaks the ELEVAY rules: " + bad.map((x) => x.label).join(" "));
  const special_ad_categories = resolveSpecialAdCategories(c);
  return { kind, campaign: { name: String(c.name).slice(0, 120), daily_budget_egp: daily, countries: (Array.isArray(c.countries) ? c.countries : ["EG"]).map((x) => String(x).toUpperCase().slice(0, 2)), age_min: Math.max(18, Number(c.age_min || 28)), age_max: Math.min(65, Number(c.age_max || 60)), form_id: String(c.form_id), image_url: String(c.image_url), message: String(c.message).slice(0, 2000), headline: String(c.headline || "").slice(0, 80), special_ad_categories, item_id: c.item_id || null }, preview: `Create lead campaign "${c.name}" (paused) at ${daily.toLocaleString("en-US")} EGP/day`, reason: String(b.reason || "").slice(0, 500) };
}

export function makeMetaGraph(fetcher = fetch) {
  async function call(method, path, token, params = {}) {
    const url = new URL(`https://graph.facebook.com/${ver()}/${path}`);
    const init = { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) };
    if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    else { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(params); }
    const res = await fetcher(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw Object.assign(new Error(`Meta: ${body.error?.message || `HTTP ${res.status}`}`), { code: body.error?.code });
    return body;
  }
  return { get: (p, t, q) => call("GET", p, t, q), post: (p, t, b) => call("POST", p, t, b) };
}

const cairoNowLocal = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");

export function createMetaHub(deps) {
  const { q, E, R, providers } = deps;
  const graph = makeMetaGraph(deps.fetcher || fetch);
  const adsToken = () => process.env.META_SYSTEM_USER_ACCESS_TOKEN || "";
  const account = () => "act_" + String(process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/i, "");

  async function ensureTables() {
    await q("CREATE TABLE IF NOT EXISTS ec_meta_actions (id INT AUTO_INCREMENT PRIMARY KEY, created_at BIGINT NOT NULL, status VARCHAR(24) NOT NULL, ver INT NOT NULL DEFAULT 0, doc LONGTEXT NOT NULL, INDEX ec_meta_actions_status (status))");
    await q("CREATE TABLE IF NOT EXISTS ec_meta_seen (id VARCHAR(128) PRIMARY KEY, at BIGINT NOT NULL)");
  }
  async function getA(id) { const r = (await q("SELECT id, ver, doc FROM ec_meta_actions WHERE id=?", [id]))[0]; return r ? { a: { ...JSON.parse(r.doc), id: r.id }, ver: r.ver } : null; }
  async function saveA(a, v) {
    a.updated_at = nowIso();
    const res = await q("UPDATE ec_meta_actions SET doc=?, status=?, ver=ver+1 WHERE id=? AND ver=?", [JSON.stringify(a), a.status, a.id, v]);
    if (res.affectedRows !== 1) throw new Error("The action changed while saving. Refresh and try again.");
    return v + 1;
  }
  async function list({ status, limit = 100 } = {}) {
    const rows = status ? await q("SELECT id, doc FROM ec_meta_actions WHERE status=? ORDER BY id DESC LIMIT ?", [status, limit]) : await q("SELECT id, doc FROM ec_meta_actions ORDER BY id DESC LIMIT ?", [limit]);
    return rows.map((r) => ({ ...JSON.parse(r.doc), id: r.id }));
  }
  async function autopilotOn() { const { state } = await deps.loadState(); return { on: !!state.settings.autopublish?.enabled, state }; }

  /** Queue an action; it auto-runs under autopilot unless it needs a person. */
  async function enqueue(action, by) {
    const a = { status: "pending", created_at: nowIso(), created_by: by, log: [], ...action };
    a.check = await precheck(a).catch((e) => ({ ok: false, reason: e.message }));
    if (a.check && a.check.ok === false) a.status = "blocked";
    const res = await q("INSERT INTO ec_meta_actions (created_at, status, doc) VALUES (?, ?, ?)", [Date.now(), a.status, JSON.stringify(a)]);
    a.id = res.insertId;
    if (a.status === "pending") {
      const { on } = await autopilotOn();
      if (on && !a.needs_human) await approve(a.id, { email: "autopilot (6-week gate reached)", role: "owner" }).catch(() => {});
    }
    return a;
  }

  // ---------------------------------------------------------------- guardrails
  async function adsSnapshot() {
    const t = adsToken();
    if (!t || !process.env.META_AD_ACCOUNT_ID) throw new Error("META_SYSTEM_USER_ACCESS_TOKEN or META_AD_ACCOUNT_ID is not set.");
    const d30 = lastDays(30);
    const [mtd, camps, adsets, ins] = await Promise.all([
      graph.get(`${account()}/insights`, t, { date_preset: "this_month", fields: "spend" }),
      graph.get(`${account()}/campaigns`, t, { fields: "id,name,effective_status,daily_budget", limit: "200" }),
      graph.get(`${account()}/adsets`, t, { fields: "id,name,campaign_id,effective_status,daily_budget", limit: "300" }),
      graph.get(`${account()}/insights`, t, { level: "campaign", fields: "campaign_id,spend,actions", time_range: JSON.stringify({ since: d30.since, until: d30.until }), limit: "200" }),
    ]);
    const egp = (x) => Number(x || 0) / 100;
    const active = (s) => s === "ACTIVE";
    const campaigns = (camps.data || []).map((c) => ({ id: c.id, name: c.name, status: c.effective_status, daily: egp(c.daily_budget) }));
    const sets = (adsets.data || []).map((s) => ({ id: s.id, campaign_id: s.campaign_id, status: s.effective_status, daily: egp(s.daily_budget) }));
    const leadsOf = (acts) => { for (const k of ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"]) { const v = (acts || []).find((a) => a.action_type === k); if (v) return Number(v.value); } return 0; };
    const cpl = Object.fromEntries((ins.data || []).map((r) => { const l = leadsOf(r.actions); return [r.campaign_id, l ? Number(r.spend) / l : null]; }));
    const dailyTotal = campaigns.filter((c) => active(c.status)).reduce((s, c) => s + c.daily, 0) + sets.filter((s) => active(s.status) && !campaigns.find((c) => c.id === s.campaign_id && c.daily)).reduce((s, x) => s + x.daily, 0);
    return { mtd: Number(mtd.data?.[0]?.spend || 0), campaigns, adsets: sets, cpl, dailyTotal };
  }
  function daysLeftInMonth() {
    const c = cairoNowLocal(); const y = +c.slice(0, 4), m = +c.slice(5, 7), d = +c.slice(8, 10);
    return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
  }
  /** Projected month-end spend if this action runs, against the cap; CPL ceiling for increases. */
  async function precheck(a) {
    if (!["campaign_status", "campaign_budget", "create_campaign"].includes(a.kind)) return { ok: true };
    const { state } = await deps.loadState();
    const cap = Number(state.settings.monthlyAdCapEgp || 200000), maxCpl = Number(state.settings.maxCplEgp || 100);
    const snap = await adsSnapshot();
    let addDaily = 0;
    const target = snap.campaigns.find((c) => c.id === a.target_id) || snap.adsets.find((s) => s.id === a.target_id);
    if (a.kind === "campaign_status") {
      if (a.status_to !== "ACTIVE") return { ok: true, note: "Pausing never adds spend." };
      if (target && target.status !== "ACTIVE") addDaily = target.daily || snap.adsets.filter((s) => s.campaign_id === a.target_id).reduce((s, x) => s + x.daily, 0);
    }
    if (a.kind === "campaign_budget") {
      const cur = target?.daily || 0;
      addDaily = Number(a.daily_budget_egp) - cur;
      const campId = target?.campaign_id || a.target_id;
      if (addDaily > 0 && snap.cpl[campId] && snap.cpl[campId] > maxCpl) return { ok: false, reason: `Budget increase refused: this campaign's 30-day CPL is ${Math.round(snap.cpl[campId])} EGP, above the ${maxCpl} EGP ceiling.` };
    }
    // New campaigns are created paused, so they add nothing until activated.
    const projected = snap.mtd + (snap.dailyTotal + Math.max(0, addDaily)) * daysLeftInMonth();
    const out = { ok: projected <= cap, projected: Math.round(projected), cap, mtd: Math.round(snap.mtd), dailyAfter: Math.round(snap.dailyTotal + addDaily) };
    if (!out.ok) out.reason = `Refused: projected month-end spend ${out.projected.toLocaleString("en-US")} EGP would exceed the ${cap.toLocaleString("en-US")} EGP cap.`;
    return out;
  }

  // ---------------------------------------------------------------- execution
  async function execute(a) {
    const page = await pageCredentials(q, deps.fetcher || fetch);
    switch (a.kind) {
      case "reply_comment": {
        const r = a.platform === "instagram" ? await graph.post(`${a.target_id}/replies`, page.token, { message: a.text }) : await graph.post(`${a.target_id}/comments`, page.token, { message: a.text });
        return { reply_id: r.id };
      }
      case "reply_message": {
        const r = await graph.post(`${page.pageId}/messages`, page.token, { recipient: { id: a.recipient_id }, messaging_type: "RESPONSE", message: { text: a.text } });
        return { message_id: r.message_id || r.id };
      }
      case "campaign_status": {
        await graph.post(a.target_id, adsToken(), { status: a.status_to });
        return { status: a.status_to };
      }
      case "campaign_budget": {
        await graph.post(a.target_id, adsToken(), { daily_budget: Math.round(Number(a.daily_budget_egp) * 100) });
        return { daily_budget_egp: Number(a.daily_budget_egp) };
      }
      case "create_campaign": {
        const t = adsToken(), acct = account(), c = a.campaign;
        const camp = await graph.post(`${acct}/campaigns`, t, { name: c.name, objective: "OUTCOME_LEADS", status: "PAUSED", special_ad_categories: c.special_ad_categories || [], buying_type: "AUCTION" });
        const set = await graph.post(`${acct}/adsets`, t, {
          name: `${c.name} | ad set`, campaign_id: camp.id, status: "PAUSED", daily_budget: Math.round(Number(c.daily_budget_egp) * 100),
          billing_event: "IMPRESSIONS", optimization_goal: "LEAD_GENERATION", bid_strategy: "LOWEST_COST_WITHOUT_CAP", destination_type: "ON_AD",
          promoted_object: { page_id: page.pageId },
          targeting: { geo_locations: { countries: c.countries?.length ? c.countries : ["EG"] }, age_min: c.age_min || 28, age_max: c.age_max || 60, publisher_platforms: ["facebook", "instagram"] },
        });
        const creative = await graph.post(`${acct}/adcreatives`, t, {
          name: `${c.name} | creative`,
          object_story_spec: { page_id: page.pageId, link_data: { message: c.message, name: c.headline, picture: c.image_url, link: c.link || "https://elevay.vip/", call_to_action: { type: "LEARN_MORE", value: { lead_gen_form_id: c.form_id } } } },
        });
        const ad = await graph.post(`${acct}/ads`, t, { name: `${c.name} | ad`, adset_id: set.id, creative: { creative_id: creative.id }, status: "PAUSED" });
        return { campaign_id: camp.id, adset_id: set.id, creative_id: creative.id, ad_id: ad.id, status: "PAUSED" };
      }
      default: throw new Error("Unknown Meta action.");
    }
  }

  async function approve(id, user, edits = {}) {
    if (user.role !== "owner") throw new Error("Only the owner can approve Meta actions.");
    const g = await getA(id);
    if (!g) throw new Error("Action not found.");
    const a = g.a;
    if (a.status !== "pending") throw new Error(`This action is ${a.status}.`);
    if (typeof edits.text === "string" && ["reply_comment", "reply_message"].includes(a.kind)) {
      const t = edits.text.trim();
      if (!t) throw new Error("The reply is empty.");
      const bad = replyProblems(t, a.kind === "reply_comment", (await deps.loadState()).state.settings.meta?.contactPhone);
      if (bad.length) throw new Error("Reply breaks the ELEVAY rules: " + bad.join(" "));
      a.text = t; a.edited = true;
    }
    if (edits.daily_budget_egp !== undefined && a.kind === "campaign_budget") a.daily_budget_egp = Number(edits.daily_budget_egp);
    a.check = await precheck(a).catch((e) => ({ ok: false, reason: e.message }));
    if (a.check.ok === false) { a.status = "blocked"; a.log.push({ at: nowIso(), by: user.email, text: a.check.reason }); await saveA(a, g.ver); throw new Error(a.check.reason); }
    a.status = "running"; a.approved_by = user.email; a.approved_at = nowIso();
    let v = await saveA(a, g.ver);
    try { a.result = await execute(a); a.status = "done"; a.log.push({ at: nowIso(), by: "elevay.vip", text: "Done on Meta." }); }
    catch (e) { a.status = "failed"; a.error = String(e.message || e); a.log.push({ at: nowIso(), by: "meta", text: a.error }); }
    await saveA(a, v);
    if (a.status === "failed") throw new Error(a.error);
    return a;
  }
  async function reject(id, user, reason = "") {
    const g = await getA(id);
    if (!g) throw new Error("Action not found.");
    if (!["pending", "blocked", "failed"].includes(g.a.status)) throw new Error(`This action is ${g.a.status}.`);
    g.a.status = "rejected"; g.a.log.push({ at: nowIso(), by: user.email, text: reason || "Rejected" });
    await saveA(g.a, g.ver);
  }

  // ---------------------------------------------------------------- replies (inbox)
  function replyProblems(text, isPublic, contactPhone = "") {
    const c = R.checkBrief({ type: "static", caption_ar: text, disclaimer_used: "x" });
    const out = c.blocks.filter((b) => /^term_|^contact_/.test(b.id) && (isPublic || !/^contact_/.test(b.id))).map((b) => b.label);
    // Private replies may only give the contact number the owner saved in Meta settings — never one Claude made up.
    if (!isPublic) {
      const allowed = String(contactPhone || "").replace(/\D/g, "");
      const phones = (String(text).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\+?\d[\d\s().-]{6,}\d/g) || []).map((x) => x.replace(/\D/g, ""));
      if (phones.some((d) => !allowed || !(d.endsWith(allowed.slice(-9)) && allowed.endsWith(d.slice(-9))))) out.push("Reply contains a phone number that is not the saved ELEVAY contact number.");
      if (/https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,}/i.test(text)) out.push("Reply contains a link or email address.");
    }
    if (text.length > 900) out.push("Reply is too long.");
    return out;
  }
  async function seen(id) { const r = await q("INSERT IGNORE INTO ec_meta_seen (id, at) VALUES (?, ?)", [id, Date.now()]); return r.affectedRows === 0; }

  async function draftReply({ platform, channel, text, from, context, contactPhone = "" }) {
    const contactRule = channel === "comment" ? "" : contactPhone
      ? `\n- Never invent contact details. If a phone number helps, use exactly this ELEVAY WhatsApp number and no other: ${contactPhone}. No links or emails.`
      : "\n- Never write any phone number, email or link: ELEVAY's consultant will contact them.";
    const r = await providers.claude({
      system: ELEVAY_RULES,
      prompt: `${programFactsFor(text + " " + (context || ""))}\n\nA person wrote to ELEVAY on ${platform} (${channel === "comment" ? "a PUBLIC comment" : "a private message"}).\n${context ? "Post/context: " + clip(context, 600) + "\n" : ""}Their words: """${clip(text, 1500)}"""\n\nDraft ELEVAY's reply:\n- Same language as the person (Arabic → clear, warm Arabic that Egyptians read naturally; English → English). 1–3 short sentences.\n- Never use "تأشيرة"/Visa (say إقامة/Residency), never guarantee anything, no legal or tax advice.\n- ${channel === "comment" ? "Public comment: no prices, no personal details, no phone numbers or links; thank them and invite them to send a private message or book a consultation." : "Private message: answer from the approved facts only (with \"subject to approval and individual circumstances\" when giving conditions), then ask for their name and the best time for an ELEVAY consultant to call."}${contactRule}\n- Spam, ads or abuse: do not reply. Complaints, refunds, legal threats, personal/sensitive situations or anything unclear: set needs_human.\nReturn JSON: {"category": "lead"|"question"|"complaint"|"spam"|"thanks"|"other", "reply": "text or empty", "needs_human": true/false, "reason": "short"}`,
      maxTokens: 700,
    });
    return r.data || {};
  }

  /** Pull new comments (Facebook + Instagram) and messages, draft replies, queue them. */
  async function syncInbox({ maxPosts = 10 } = {}) {
    const page = await pageCredentials(q, deps.fetcher || fetch);
    if (!page.token) throw new Error("No Meta Page access token.");
    const found = [], errors = [];
    const since = Date.now() - 7 * 86400000;
    const contactPhone = (await deps.loadState()).state.settings.meta?.contactPhone || "";
    const consider = async (item) => {
      if (await seen(item.key)) return;
      const d = await draftReply({ ...item, contactPhone }).catch((e) => ({ category: "other", needs_human: true, reason: "Claude could not draft: " + e.message }));
      if (d.category === "spam" || (!d.reply && !d.needs_human)) return;
      const problems = d.reply ? replyProblems(d.reply, item.channel === "comment", contactPhone) : [];
      found.push(await enqueue({
        kind: item.channel === "comment" ? "reply_comment" : "reply_message", platform: item.platform, target_id: item.target_id, recipient_id: item.recipient_id,
        from: item.from, incoming: clip(item.text, 1500), context: clip(item.context || "", 300), permalink: item.permalink || null,
        text: d.reply || "", category: d.category, needs_human: !!d.needs_human || !d.reply || problems.length > 0, reason: problems.length ? "Draft broke a rule: " + problems.join(" ") : d.reason || "",
        preview: `${item.platform === "instagram" ? "Instagram" : "Facebook"} ${item.channel} from ${item.from || "someone"}`,
      }, "claude"));
    };
    // Facebook comments on recent posts
    try {
      const posts = await graph.get(`${page.pageId}/published_posts`, page.token, { fields: "id,message,permalink_url,created_time", limit: String(maxPosts) });
      for (const p of posts.data || []) {
        const cs = await graph.get(`${p.id}/comments`, page.token, { fields: "id,message,from,created_time", filter: "stream", order: "reverse_chronological", limit: "25" });
        for (const c of cs.data || []) {
          if (!c.message || c.from?.id === page.pageId || Date.parse(c.created_time) < since) continue;
          await consider({ key: "fbc_" + c.id, platform: "facebook", channel: "comment", target_id: c.id, text: c.message, from: c.from?.name, context: p.message, permalink: p.permalink_url });
        }
      }
    } catch (e) { errors.push("Facebook comments: " + e.message); }
    // Instagram comments
    let igId = null;
    try {
      const pg = await graph.get(page.pageId, page.token, { fields: "instagram_business_account{id,username}" });
      igId = pg.instagram_business_account?.id || null;
      if (igId) {
        const media = await graph.get(`${igId}/media`, page.token, { fields: "id,caption,permalink,timestamp", limit: String(maxPosts) });
        for (const m of media.data || []) {
          const cs = await graph.get(`${m.id}/comments`, page.token, { fields: "id,text,username,timestamp", limit: "25" });
          for (const c of cs.data || []) {
            if (!c.text || c.username === pg.instagram_business_account.username || Date.parse(c.timestamp) < since) continue;
            await consider({ key: "igc_" + c.id, platform: "instagram", channel: "comment", target_id: c.id, text: c.text, from: c.username, context: m.caption, permalink: m.permalink });
          }
        }
      }
    } catch (e) { errors.push("Instagram comments: " + e.message); }
    // Messenger and Instagram direct messages (reply window: 24 h)
    for (const platform of ["messenger", "instagram"]) {
      try {
        const convs = await graph.get(`${page.pageId}/conversations`, page.token, { platform, fields: "id,updated_time,messages.limit(3){id,message,from,created_time}", limit: "25" });
        for (const cv of convs.data || []) {
          const last = cv.messages?.data?.[0];
          if (!last || !last.message || last.from?.id === page.pageId || last.from?.id === igId) continue;
          if (Date.now() - Date.parse(last.created_time) > 23 * 3600000) continue;
          await consider({ key: "msg_" + last.id, platform: platform === "messenger" ? "facebook" : "instagram", channel: "message", recipient_id: last.from?.id, text: last.message, from: last.from?.name || last.from?.username });
        }
      } catch (e) { errors.push(`${platform} messages: ` + e.message); }
    }
    return { queued: found.length, errors };
  }

  // ---------------------------------------------------------------- publishing approved posts
  /** Publish approved items whose time has come (Cairo), on Facebook and/or Instagram. */
  async function publishDue() {
    const { state } = await deps.loadState();
    if (!state.settings.meta?.directPublish) return { published: 0 };
    const now = cairoNowLocal();
    // A final-QC-reviewed content replacement is intentionally not a fresh Meta
    // authorization. Never direct-publish an item while its per-version revision
    // hold is active; an explicit future owner publishing release is required.
    const due = state.items.filter((i) => i.status === "approved" && i.publish?.datetime_cairo && i.publish.datetime_cairo <= now && !(i.publish.direct?.done) && !i.publish?.revision_hold?.active);
    let n = 0;
    for (const item of due.slice(0, 3)) {
      try { const r = await publishItem(item); if (r) n++; } catch (e) {
        await deps.mutate({}, (st) => { const it = st.items.find((x) => x.item_id === item.item_id); if (it) { it.publish = { ...it.publish, direct: { ...(it.publish.direct || {}), error: String(e.message).slice(0, 300), tries: (it.publish.direct?.tries || 0) + 1, done: (it.publish.direct?.tries || 0) >= 2 } }; } return { ok: true }; });
      }
    }
    return { published: n };
  }

  async function publishItem(item) {
    const page = await pageCredentials(q, deps.fetcher || fetch);
    const m = item.media || {}, caption = item.caption_ar || "";
    const channel = item.publish?.channel || "both";
    const d = { ...(item.publish?.direct || {}) };
    if (item.type === "reel" && !m.video_url) throw new Error("The final reel video is missing.");
    if (item.type !== "reel" && !m.image_url) throw new Error("The design image is missing.");
    if ((channel === "both" || channel === "facebook") && !d.facebook) {
      const r = item.type === "reel" ? await graph.post(`${page.pageId}/videos`, page.token, { file_url: m.video_url, description: caption }) : await graph.post(`${page.pageId}/photos`, page.token, { url: m.image_url, caption });
      d.facebook = r.post_id || r.id;
    }
    if ((channel === "both" || channel === "instagram") && !d.instagram) {
      const pg = await graph.get(page.pageId, page.token, { fields: "instagram_business_account{id}" });
      const ig = pg.instagram_business_account?.id;
      if (!ig) throw new Error("No Instagram business account is linked to the page.");
      if (!d.ig_container) {
        const c = item.type === "reel" ? await graph.post(`${ig}/media`, page.token, { media_type: "REELS", video_url: m.video_url, caption, share_to_feed: true }) : await graph.post(`${ig}/media`, page.token, { image_url: m.image_url, caption });
        d.ig_container = c.id;
      }
      const st = await graph.get(d.ig_container, page.token, { fields: "status_code" });
      if (st.status_code === "ERROR") throw new Error("Instagram could not process the media.");
      if (st.status_code !== "FINISHED") { // reels take a while; try again on the next tick
        await deps.mutate({}, (s2) => { const it = s2.items.find((x) => x.item_id === item.item_id); if (it) it.publish = { ...it.publish, direct: d }; return { ok: true }; });
        return false;
      }
      const p = await graph.post(`${ig}/media_publish`, page.token, { creation_id: d.ig_container });
      d.instagram = p.id;
    }
    d.done = true; d.at = nowIso();
    await deps.mutate({}, (s2) => E.markPublished(s2, item.item_id, "published", { direct: d, meta_post_id: d.facebook || d.instagram, published_by: "elevay.vip" }, "elevay.vip"));
    return true;
  }

  // ---------------------------------------------------------------- connection check
  async function checkConnection() {
    const out = {};
    const page = await pageCredentials(q, deps.fetcher || fetch);
    const probe = async (name, fn) => { try { out[name] = { ok: true, detail: await fn() }; } catch (e) { out[name] = { ok: false, detail: e.message }; } };
    await probe("key", async () => {
      const need = ["ads_management", "ads_read", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement", "pages_messaging", "read_insights", "leads_retrieval", "instagram_basic", "instagram_manage_insights", "instagram_manage_comments", "instagram_manage_messages", "instagram_content_publish"];
      const granted = new Set(((await graph.get("me/permissions", adsToken(), {})).data || []).filter((x) => x.status === "granted").map((x) => x.permission));
      const missing = need.filter((x) => !granted.has(x));
      if (missing.length) throw new Error("Key is missing: " + missing.join(", "));
      return "Key has every permission";
    });
    await probe("page", async () => `${(await graph.get(page.pageId, page.token, { fields: "name" })).name} (${page.source === "system_user" ? "key from the system user" : "separate Page key"})`);
    await probe("insights", async () => { const p = await graph.get(page.pageId, page.token, { fields: "instagram_business_account{id}" }); const ig = p.instagram_business_account?.id; if (!ig) throw new Error("No Instagram account linked"); await graph.get(`${ig}/insights`, page.token, { metric: "reach", period: "day" }); return "Instagram insights allowed"; });
    await probe("comments", async () => { await graph.get(`${page.pageId}/published_posts`, page.token, { fields: "id", limit: "1" }); return "Can read posts and comments"; });
    await probe("messages", async () => { await graph.get(`${page.pageId}/conversations`, page.token, { platform: "messenger", limit: "1" }); return "Can read Messenger"; });
    await probe("instagram", async () => { const p = await graph.get(page.pageId, page.token, { fields: "instagram_business_account{username}" }); if (!p.instagram_business_account) throw new Error("No Instagram account linked"); return "@" + p.instagram_business_account.username; });
    await probe("ads", async () => { const a = await graph.get(account(), adsToken(), { fields: "name,currency" }); return `${a.name} (${a.currency})`; });
    await probe("forms", async () => `${(await graph.get(`${page.pageId}/leadgen_forms`, page.token, { fields: "id", limit: "50" })).data?.length || 0} lead forms`);
    return out;
  }
  async function leadForms() {
    const page = await pageCredentials(q, deps.fetcher || fetch);
    return ((await graph.get(`${page.pageId}/leadgen_forms`, page.token, { fields: "id,name,status", limit: "100" })).data || []).filter((f) => f.status === "ACTIVE");
  }

  /** Background work: publish due posts every tick; check the inbox every 10 minutes. */
  async function tick() {
    await publishDue().catch(() => {});
    const last = Number((await q("SELECT value FROM ec_kv WHERE name='meta_inbox_sync'"))[0]?.value || 0);
    const { state } = await deps.loadState();
    if (state.settings.meta?.inbox === false || Date.now() - last < 10 * 60000) return;
    await q("INSERT INTO ec_kv (name, value) VALUES ('meta_inbox_sync', ?) ON DUPLICATE KEY UPDATE value=VALUES(value)", [String(Date.now())]);
    await syncInbox().catch(() => {});
  }

  return { ensureTables, enqueue, approve, reject, list, syncInbox, publishDue, publishItem, precheck, checkConnection, leadForms, tick, replyProblems, adsSnapshot };
}

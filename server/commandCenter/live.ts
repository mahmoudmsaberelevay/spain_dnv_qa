// @ts-nocheck
/*
 * Live data for the Command Center (read-only).
 *
 *   Meta Marketing API  → last 30 days ad results + 6 months by month   (META_SYSTEM_USER_ACCESS_TOKEN, META_AD_ACCOUNT_ID)
 *   Meta Page Insights  → views and new page likes/follows, last 30 days (META_PAGE_ACCESS_TOKEN or the active Meta lead integration)
 *   ELEVAY CRM (leads, lead_activities in the same database) → leads, qualified, unqualified, clients
 *
 * Nothing here writes to Meta or to the CRM. Every Graph call is a GET.
 */

const DAY = 86400000;
const TZ = "Africa/Cairo";
const QUALIFIED_OR_BETTER = new Set(["qualified", "prospect", "client"]);
const isUnq = (s) => typeof s === "string" && s.startsWith("not_qualified");

// ------------------------------------------------------------------ dates (Cairo)
export function cairoDate(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function tzOffsetMs(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
/** Epoch ms of 00:00 Cairo on YYYY-MM-DD. */
export function cairoMidnight(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - tzOffsetMs(guess - tzOffsetMs(guess));
}
const addDays = (date: string, n: number) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n)).toISOString().slice(0, 10);

/** Last N complete Cairo days (today excluded), matching Meta's "last_30d". */
export function lastDays(n: number, now = Date.now()) {
  const today = cairoDate(now);
  const since = addDays(today, -n), until = addDays(today, -1);
  return { since, until, fromMs: cairoMidnight(since), toMs: cairoMidnight(today) - 1 };
}
/** First day of the month N-1 months ago through yesterday, plus the month keys. */
export function lastMonths(n: number, now = Date.now()) {
  const today = cairoDate(now);
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  const months = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  const since = months[0] + "-01", until = addDays(today, -1);
  return { months, since, until, fromMs: cairoMidnight(since), toMs: cairoMidnight(today) - 1 };
}

// ------------------------------------------------------------------ Meta helpers
const graphVersion = () => process.env.META_GRAPH_API_VERSION || "v26.0";

export function makeGraph(fetcher = fetch) {
  async function get(path: string, token: string, params: Record<string, string> = {}) {
    const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetcher(url, { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, signal: ctrl.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        const e = body.error || {};
        throw Object.assign(new Error(`Meta: ${e.message || `request failed (${res.status})`}`), { code: e.code, subcode: e.error_subcode });
      }
      return body;
    } finally { clearTimeout(t); }
  }
  async function all(path: string, token: string, params: Record<string, string> = {}, maxPages = 10) {
    const rows = [];
    let after;
    for (let i = 0; i < maxPages; i++) {
      const b = await get(path, token, { limit: "200", ...params, ...(after ? { after } : {}) });
      rows.push(...(b.data || []));
      after = b.paging?.next ? b.paging?.cursors?.after : null;
      if (!after) break;
    }
    return rows;
  }
  return { get, all };
}

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const actionValue = (actions, type) => num((actions || []).find((a) => a.action_type === type)?.value);
/** Meta reports the same lead under several action types; take one, never the sum. */
export function leadsFromActions(actions) {
  for (const t of ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"]) {
    const v = actionValue(actions, t);
    if (v > 0) return v;
  }
  return 0;
}
function insightRow(r) {
  const spend = num(r.spend), leads = leadsFromActions(r.actions);
  return {
    campaignId: r.campaign_id || null, campaign: r.campaign_name || null, adId: r.ad_id || null, ad: r.ad_name || null, objective: r.objective || null,
    month: r.date_start ? r.date_start.slice(0, 7) : null,
    spend, impressions: num(r.impressions), reach: num(r.reach), clicks: num(r.clicks), linkClicks: num(r.inline_link_clicks),
    ctr: num(r.ctr) / 100, cpm: num(r.cpm), frequency: num(r.frequency),
    leads, cpl: leads ? spend / leads : null,
    videoViews: actionValue(r.actions, "video_view"),
    thruplays: num((r.video_thruplay_watched_actions || [])[0]?.value),
    pageLikes: actionValue(r.actions, "like") || actionValue(r.actions, "onsite_conversion.page_like"),
    messages: actionValue(r.actions, "onsite_conversion.messaging_conversation_started_7d"),
  };
}
const INSIGHT_FIELDS = "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpm,frequency,actions,video_thruplay_watched_actions";

export async function metaAds(graph, { token, account, d30, m6 }) {
  const acct = "act_" + String(account).trim().replace(/^act_/i, "");
  const range = (r) => JSON.stringify({ since: r.since, until: r.until });
  const [info, total, campaigns, ads, monthlyCampaigns, monthlyTotal, list] = await Promise.all([
    graph.get(acct, token, { fields: "name,currency,timezone_name,account_status" }),
    graph.get(`${acct}/insights`, token, { fields: INSIGHT_FIELDS, time_range: range(d30) }),
    graph.all(`${acct}/insights`, token, { level: "campaign", fields: "campaign_id,campaign_name,objective," + INSIGHT_FIELDS, time_range: range(d30) }),
    graph.all(`${acct}/insights`, token, { level: "ad", fields: "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,ctr,actions", time_range: range(d30) }, 5),
    graph.all(`${acct}/insights`, token, { level: "campaign", time_increment: "monthly", fields: "campaign_id,campaign_name,objective,spend,impressions,reach,clicks,actions", time_range: range(m6) }),
    graph.all(`${acct}/insights`, token, { time_increment: "monthly", fields: "spend,impressions,reach,clicks,ctr,cpm,actions,video_thruplay_watched_actions", time_range: range(m6) }),
    graph.all(`${acct}/campaigns`, token, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget" }, 3),
  ]);
  const status = Object.fromEntries(list.map((c) => [c.id, { status: c.effective_status || c.status, dailyBudget: c.daily_budget ? num(c.daily_budget) / 100 : null, lifetimeBudget: c.lifetime_budget ? num(c.lifetime_budget) / 100 : null }]));
  const adRows = ads.map(insightRow).filter((a) => a.spend > 0);
  const campRows = campaigns.map(insightRow);
  const leadCamps = campRows.filter((c) => c.leads > 0 || /LEAD/i.test(c.objective || ""));
  const leadSpend = leadCamps.reduce((s, c) => s + c.spend, 0), leadCount = leadCamps.reduce((s, c) => s + c.leads, 0);
  return {
    account: { id: acct, name: info.name, currency: info.currency, timezone: info.timezone_name, status: info.account_status },
    last30: {
      total: { ...insightRow((total.data || [])[0] || {}), leadCampaignSpend: leadSpend, leadCampaignCpl: leadCount ? leadSpend / leadCount : null },
      campaigns: campRows.map((c) => ({ ...c, ...(status[c.campaignId] || {}) })).sort((a, b) => b.spend - a.spend),
      topAds: adRows.filter((a) => a.leads > 0).sort((a, b) => a.cpl - b.cpl).slice(0, 5),
      bottomAds: adRows.filter((a) => a.spend >= 500).sort((a, b) => (b.cpl ?? Infinity) - (a.cpl ?? Infinity)).slice(0, 5),
    },
    monthly: { total: monthlyTotal.map(insightRow), campaigns: monthlyCampaigns.map(insightRow) },
  };
}

/** Page token + id: META_PAGE_ACCESS_TOKEN / META_PAGE_ID first, then the active Meta lead integration. */
let derivedPage = { key: "", token: "", at: 0 };
/**
 * Page token + id. Preferred: a Page token derived from the system-user token
 * (META_SYSTEM_USER_ACCESS_TOKEN), so it carries every permission granted to the system user,
 * including Instagram insights, and one key covers ads, Page and Instagram. Falls back to
 * META_PAGE_ACCESS_TOKEN / the active Meta lead integration.
 */
export async function pageCredentials(q, fetcher = fetch) {
  let cfg = {};
  try {
    const row = (await q("SELECT config FROM lead_integrations WHERE type='meta' AND isActive=1 ORDER BY updatedAt DESC LIMIT 1"))[0];
    if (row?.config) cfg = JSON.parse(row.config);
  } catch { cfg = {}; }
  const pageId = process.env.META_PAGE_ID || cfg.page_id || "100123051604258";
  const fallback = process.env.META_PAGE_ACCESS_TOKEN || cfg.page_access_token || cfg.access_token || "";
  const sys = process.env.META_SYSTEM_USER_ACCESS_TOKEN || "";
  if (sys && process.env.ELEVAY_DERIVE_PAGE_TOKEN !== "false") {
    const key = pageId + ":" + sys.slice(-12);
    if (derivedPage.key === key && Date.now() - derivedPage.at < 3600000) return { token: derivedPage.token, pageId, source: "system_user" };
    try {
      const res = await fetcher(`https://graph.facebook.com/${graphVersion()}/${pageId}?fields=access_token`, { method: "GET", headers: { Authorization: `Bearer ${sys}` }, signal: AbortSignal.timeout(20000) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.access_token) { derivedPage = { key, token: body.access_token, at: Date.now() }; return { token: body.access_token, pageId, source: "system_user" }; }
    } catch { /* fall back */ }
  }
  return { token: fallback, pageId, source: "page_token" };
}

async function firstMetric(graph, path, token, candidates, extra) {
  const errors = [];
  for (const metric of candidates) {
    try {
      const b = await graph.get(path, token, { metric, ...extra });
      const series = b.data?.[0];
      if (!series) { errors.push(`${metric}: no data`); continue; }
      const total = series.total_value ? num(series.total_value.value) : (series.values || []).reduce((s, v) => s + num(v.value), 0);
      return { metric, total, daily: (series.values || []).map((v) => ({ date: String(v.end_time || "").slice(0, 10), value: num(v.value) })) };
    } catch (e) { errors.push(`${metric}: ${e.message}`); }
  }
  return { metric: null, total: null, error: errors.join(" | ") };
}

export async function metaPage(graph, { token, pageId, d30 }) {
  const since = String(Math.floor(cairoMidnight(d30.since) / 1000));
  const until = String(Math.floor((d30.toMs + 1) / 1000));
  const range = { period: "day", since, until };
  const page = await graph.get(pageId, token, { fields: "name,fan_count,followers_count,instagram_business_account{id,username,followers_count}" });
  const [views, follows, unfollows, videoViews] = await Promise.all([
    firstMetric(graph, `${pageId}/insights`, token, ["page_media_view", "page_views_total", "page_impressions"], range),
    firstMetric(graph, `${pageId}/insights`, token, ["page_daily_follows_unique", "page_fan_adds_unique", "page_fan_adds"], range),
    firstMetric(graph, `${pageId}/insights`, token, ["page_daily_unfollows_unique", "page_fan_removes_unique"], range),
    firstMetric(graph, `${pageId}/insights`, token, ["page_video_views"], range),
  ]);
  let instagram = null;
  const ig = page.instagram_business_account;
  if (ig?.id) {
    const [igViews, igFollows] = await Promise.all([
      firstMetric(graph, `${ig.id}/insights`, token, ["views", "impressions"], { ...range, metric_type: "total_value" }),
      firstMetric(graph, `${ig.id}/insights`, token, ["follower_count"], range),
    ]);
    instagram = { id: ig.id, username: ig.username, followers: num(ig.followers_count), views: igViews, newFollowers: igFollows };
  }
  return { id: pageId, name: page.name, likesTotal: num(page.fan_count), followersTotal: num(page.followers_count), views, newLikes: follows, unlikes: unfollows, videoViews, instagram };
}

// ------------------------------------------------------------------ CRM (same database, read-only)
const LEAD_TS = "COALESCE(l.metaLeadCreatedAt, l.firstReceivedAt, l.createdAt)";
const IS_META = "(l.metaLeadId IS NOT NULL OR l.metaCampaignId IS NOT NULL OR LOWER(COALESCE(l.leadSource,'')) REGEXP 'meta|facebook|instagram')";

export function parseStageChange(description) {
  const m = String(description || "").match(/Stage changed from "([^"]+)" to "([^"]+)"/);
  return m ? { from: m[1], to: m[2] } : null;
}

/** Leads created in the window plus stage movements recorded in the window. */
export async function crmWindow(q, fromMs: number, toMs: number) {
  const created = await q(
    `SELECT l.id, l.stage, l.metaCampaignId, l.metaCampaign, l.interestedProgram, ${IS_META} AS isMeta, ${LEAD_TS} AS ts,
            (SELECT a.metaCampaignId FROM lead_meta_attributions a WHERE a.leadId = l.id AND a.metaCampaignId IS NOT NULL ORDER BY a.isPrimary DESC, a.id ASC LIMIT 1) AS attrCampaignId,
            (SELECT a.metaCampaignName FROM lead_meta_attributions a WHERE a.leadId = l.id AND a.metaCampaignName IS NOT NULL ORDER BY a.isPrimary DESC, a.id ASC LIMIT 1) AS attrCampaignName
       FROM leads l WHERE l.isMetaTestLead = 0 AND ${LEAD_TS} BETWEEN ? AND ? LIMIT 100000`, [fromMs, toMs]);
  const moves = await q(
    `SELECT a.leadId, a.description, a.createdAt, ${IS_META} AS isMeta
       FROM lead_activities a JOIN leads l ON l.id = a.leadId
      WHERE l.isMetaTestLead = 0 AND a.activityType IN ('stage_changed','stage_change') AND a.createdAt BETWEEN ? AND ? LIMIT 200000`, [fromMs, toMs]);
  const signed = await q(
    `SELECT l.id, ${IS_META} AS isMeta FROM leads l WHERE l.isMetaTestLead = 0 AND l.contractSignedDate BETWEEN ? AND ? LIMIT 100000`, [fromMs, toMs]);
  return { created, moves, signed };
}

export function summarizeCrm({ created, moves, signed }) {
  const make = () => ({ leads: 0, qualified: new Set(), unqualified: new Set(), clients: new Set(), unqualifiedReasons: {}, cohortStages: {} });
  const all = make(), meta = make();
  for (const l of created) {
    for (const b of l.isMeta ? [all, meta] : [all]) { b.leads++; b.cohortStages[l.stage] = (b.cohortStages[l.stage] || 0) + 1; }
  }
  for (const m of moves) {
    const c = parseStageChange(m.description);
    if (!c || c.from === c.to) continue;
    for (const b of m.isMeta ? [all, meta] : [all]) {
      if (c.to === "qualified") b.qualified.add(m.leadId);
      else if (isUnq(c.to)) { b.unqualified.add(m.leadId); b.unqualifiedReasons[c.to.replace("not_qualified_", "")] = (b.unqualifiedReasons[c.to.replace("not_qualified_", "")] || 0) + 1; }
      else if (c.to === "client") b.clients.add(m.leadId);
    }
  }
  for (const s of signed) for (const b of s.isMeta ? [all, meta] : [all]) b.clients.add(s.id);
  const out = (b) => {
    const cs = b.cohortStages, cohortQualified = Object.entries(cs).filter(([k]) => QUALIFIED_OR_BETTER.has(k)).reduce((s, [, v]) => s + v, 0);
    return {
      leads: b.leads, qualified: b.qualified.size, unqualified: b.unqualified.size, clients: b.clients.size, unqualifiedReasons: b.unqualifiedReasons,
      cohort: { stages: cs, qualifiedOrBetter: cohortQualified, unqualified: Object.entries(cs).filter(([k]) => isUnq(k)).reduce((s, [, v]) => s + v, 0), clients: cs.client || 0, open: (cs.fresh || 0) + (cs.contacted || 0) },
    };
  };
  return { all: out(all), meta: out(meta) };
}

/**
 * Campaign of a CRM lead as a Meta campaign id. Leads carry it in different places
 * (leads.metaCampaignId, the primary lead_meta_attributions row, or only the campaign
 * name in leads.metaCampaign), so names are mapped back to ids using Meta's own list.
 */
export function campaignKeyResolver(metaCampaigns = []) {
  const norm = (x) => String(x || "").trim().toLowerCase();
  const ids = new Set(metaCampaigns.map((c) => String(c.campaignId || c.id || "")).filter(Boolean));
  const byName = new Map();
  for (const c of metaCampaigns) { const n = norm(c.campaign || c.name); if (n && !byName.has(n)) byName.set(n, String(c.campaignId || c.id)); }
  return (l) => {
    for (const v of [l.metaCampaignId, l.attrCampaignId]) if (v && String(v).trim()) return String(v).trim();
    for (const v of [l.metaCampaign, l.attrCampaignName]) {
      if (!v) continue;
      const t = String(v).trim();
      if (ids.has(t)) return t;
      const id = byName.get(norm(t));
      if (id) return id;
    }
    return l.metaCampaign || l.attrCampaignName || null;
  };
}

/** One name per program, however it was typed in the CRM ("Spain", "spain dnv", "Digital Nomad Spain"…). */
export function canonicalProgram(v) {
  const t = String(v || "").trim().toLowerCase();
  if (!t) return null;
  const rules = [
    [/spain|españa|اسبانيا|إسبانيا|digital nomad|\bdnv\b/, "Spain Digital Nomad"],
    [/malta|مالطا/, "Malta Permanent Residence"],
    [/portugal.*(golden|gv)|golden.*portugal/, "Portugal Golden Visa"],
    [/\bd8\b/, "Portugal D8"], [/\bd7\b|portugal/, "Portugal D7"], [/\bd2\b/, "Portugal D2"],
    [/greece|greek|اليونان/, "Greece Golden Visa"],
    [/caribbean|grenada|dominica|antigua|st\.? ?kitts|saint kitts|st\.? ?lucia|saint lucia|vanuatu|cbi|citizenship/, "Caribbean Citizenship"],
    [/\buk\b|united kingdom|britain|expansion worker/, "UK Expansion Worker"],
    [/canada|express entry/, "Canada Skilled Migration"],
  ];
  for (const [re, name] of rules) if (re.test(t)) return name;
  return String(v).trim();
}

/** Leads grouped by key with current-stage outcomes (for campaign/program/month quality). */
export function outcomesBy(rows, keyFn) {
  const map = new Map();
  for (const l of rows) {
    const k = keyFn(l);
    if (k === null || k === undefined || k === "") continue;
    const o = map.get(k) || { key: k, leads: 0, qualifiedOrBetter: 0, unqualified: 0, clients: 0, name: null };
    o.leads++;
    if (QUALIFIED_OR_BETTER.has(l.stage)) o.qualifiedOrBetter++;
    if (isUnq(l.stage)) o.unqualified++;
    if (l.stage === "client") o.clients++;
    if (!o.name && (l.metaCampaign || l.attrCampaignName)) o.name = l.attrCampaignName || l.metaCampaign;
    map.set(k, o);
  }
  return [...map.values()];
}

// ------------------------------------------------------------------ analysis → plan inputs
/**
 * Deterministic 6-month read used by the monthly plan. It suggests; the owner decides,
 * and any Meta change still goes through the action plan approval and the spend cap.
 */
export function analyze({ meta, crm6, months, settings }) {
  const maxCpl = settings?.maxCplEgp ?? 100, cap = settings?.monthlyAdCapEgp ?? 200000;
  const byMonth = months.map((m) => {
    const t = (meta?.monthly?.total || []).find((r) => r.month === m) || {};
    const crm = crm6.byMonth.find((r) => r.key === m) || { leads: 0, qualifiedOrBetter: 0, clients: 0, unqualified: 0 };
    return { month: m, spend: t.spend || 0, metaLeads: t.leads || 0, cpl: t.leads ? t.spend / t.leads : null, reach: t.reach || 0, crmLeads: crm.leads, qualified: crm.qualifiedOrBetter, unqualified: crm.unqualified, clients: crm.clients, qualifiedRate: crm.leads ? crm.qualifiedOrBetter / crm.leads : null, costPerQualified: crm.qualifiedOrBetter && t.spend ? t.spend / crm.qualifiedOrBetter : null };
  });

  const camp = new Map();
  for (const r of meta?.monthly?.campaigns || []) {
    const c = camp.get(r.campaignId) || { campaignId: r.campaignId, campaign: r.campaign, objective: r.objective, spend: 0, metaLeads: 0 };
    c.spend += r.spend; c.metaLeads += r.leads; camp.set(r.campaignId, c);
  }
  for (const o of crm6.byCampaign) {
    const c = camp.get(o.key) || { campaignId: o.key, campaign: o.name, objective: null, spend: 0, metaLeads: 0 };
    Object.assign(c, { crmLeads: o.leads, qualified: o.qualifiedOrBetter, unqualified: o.unqualified, clients: o.clients }); camp.set(o.key, c);
  }
  const campaigns = [...camp.values()].map((c) => ({
    ...c, crmLeads: c.crmLeads || 0, qualified: c.qualified || 0, clients: c.clients || 0, unqualified: c.unqualified || 0,
    cpl: c.metaLeads ? c.spend / c.metaLeads : null,
    qualifiedRate: c.crmLeads ? (c.qualified || 0) / c.crmLeads : null,
    costPerQualified: c.qualified && c.spend ? c.spend / c.qualified : null,
    costPerClient: c.clients && c.spend ? c.spend / c.clients : null,
  })).sort((a, b) => b.spend - a.spend);

  const findings = [], recommendations = [];
  // The current month is partial and its newest leads are not worked yet, so trends use the last complete month.
  const recent = byMonth.slice(-2)[0], prior = byMonth.slice(-5, -2).filter((m) => m.spend > 0);
  if (byMonth.length) byMonth[byMonth.length - 1].partial = true;
  const avg = (arr, k) => { const v = arr.map((x) => x[k]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const pCpl = avg(prior, "cpl"), pQr = avg(prior, "qualifiedRate");
  if (recent?.cpl && pCpl) findings.push({ code: "cpl_trend", text: `CPL in ${recent.month} ${Math.round(recent.cpl)} EGP vs ${Math.round(pCpl)} EGP average of the previous 3 months (${recent.cpl > pCpl ? "+" : ""}${Math.round((recent.cpl / pCpl - 1) * 100)}%).` });
  if (recent?.qualifiedRate !== null && pQr) findings.push({ code: "qualified_trend", text: `Qualified rate in ${recent.month} ${(recent.qualifiedRate * 100).toFixed(1)}% vs ${(pQr * 100).toFixed(1)}% before.` });

  // Recommend only on campaigns that spent in the last 30 days; ended ones are history.
  const running = new Set((meta?.last30?.campaigns || []).filter((c) => c.spend > 0).map((c) => c.campaignId));
  const allLead = campaigns.filter((c) => c.spend >= 2000 && c.metaLeads >= 10);
  const lead = running.size ? allLead.filter((c) => running.has(c.campaignId)) : allLead;
  const endedOver = allLead.filter((c) => !lead.includes(c) && c.cpl > maxCpl);
  if (endedOver.length) findings.push({ code: "ended_over_ceiling", text: `${endedOver.length} earlier campaign(s) that are no longer spending also ran above the ${maxCpl} EGP ceiling (6-month CPL ${Math.round(Math.min(...endedOver.map((c) => c.cpl)))}–${Math.round(Math.max(...endedOver.map((c) => c.cpl)))} EGP); don't relaunch them unchanged.` });
  const withQ = lead.filter((c) => c.costPerQualified);
  const medianCpq = withQ.length ? withQ.map((c) => c.costPerQualified).sort((a, b) => a - b)[Math.floor(withQ.length / 2)] : null;
  for (const c of lead) {
    if (c.cpl > maxCpl) recommendations.push({ type: "reduce", campaignId: c.campaignId, campaign: c.campaign, why: `6-month CPL ${Math.round(c.cpl)} EGP is above the ${maxCpl} EGP ceiling.` });
    else if (c.crmLeads >= 20 && c.qualifiedRate !== null && c.qualifiedRate < 0.05) recommendations.push({ type: "fix_quality", campaignId: c.campaignId, campaign: c.campaign, why: `Cheap leads but only ${(c.qualifiedRate * 100).toFixed(1)}% qualify (${c.qualified}/${c.crmLeads}). Tighten the form questions and audience before adding budget.` });
    else if (medianCpq && c.costPerQualified && c.costPerQualified <= medianCpq * 0.8) recommendations.push({ type: "scale", campaignId: c.campaignId, campaign: c.campaign, why: `Cost per qualified lead ${Math.round(c.costPerQualified)} EGP vs ${Math.round(medianCpq)} EGP median; ${c.clients} client(s) in 6 months.` });
  }

  const reasons = crm6.unqualifiedReasons, totalUnq = Object.values(reasons).reduce((s, v) => s + v, 0);
  const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  if (topReason && totalUnq >= 10) {
    const share = topReason[1] / totalUnq;
    const advice = { budget: "State the investment or income threshold clearly in creatives and add a budget question to the lead form.", work: "Target remote workers and business owners; spell out the income-source requirement.", study: "Exclude student interests or create a separate study-route offer.", criminal: "Add a clean-record eligibility line in the form intro.", other: "Review CRM notes for the common reason." }[topReason[0]] || "";
    findings.push({ code: "unqualified_reason", text: `${Math.round(share * 100)}% of unqualified leads in 6 months were "${topReason[0]}". ${advice}` });
  }
  const programs = crm6.byProgram.filter((p) => p.leads >= 15).map((p) => ({ ...p, qualifiedRate: p.qualifiedOrBetter / p.leads })).sort((a, b) => b.qualifiedRate - a.qualifiedRate);
  if (programs.length >= 2) findings.push({ code: "program_mix", text: `Best-qualifying program: ${programs[0].key} (${(programs[0].qualifiedRate * 100).toFixed(1)}%, ${programs[0].clients} clients). Weakest: ${programs[programs.length - 1].key} (${(programs[programs.length - 1].qualifiedRate * 100).toFixed(1)}%).` });

  // Budget split proposal inside the cap, weighted by qualified leads of campaigns that stay within the CPL ceiling.
  const eligible = lead.filter((c) => c.cpl <= maxCpl && c.qualified > 0);
  const wSum = eligible.reduce((s, c) => s + c.qualified, 0);
  const budgetSplit = wSum ? eligible.map((c) => ({ campaignId: c.campaignId, campaign: c.campaign, shareOfCap: c.qualified / wSum, monthlyEgp: Math.round((cap * 0.9 * c.qualified) / wSum / 100) * 100 })) : [];

  return { byMonth, campaigns, programs, unqualifiedReasons: reasons, findings, recommendations, budgetSplit, note: "Suggestions only. Budget changes still need the owner's approval in the action plan and stay inside the monthly cap (10% kept as reserve)." };
}

// ------------------------------------------------------------------ assemble
export async function buildLiveReport({ q, fetcher = fetch, settings, now = Date.now() }) {
  const graph = makeGraph(fetcher);
  const d30 = lastDays(30, now), m6 = lastMonths(6, now);
  const errors = {};
  const adsToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || "", account = process.env.META_AD_ACCOUNT_ID || "";
  const page = await pageCredentials(q, fetcher);

  const [meta, pageData, crm30raw, crm6raw] = await Promise.all([
    adsToken && account ? metaAds(graph, { token: adsToken, account, d30, m6 }).catch((e) => { errors.ads = e.message; return null; }) : (errors.ads = "META_SYSTEM_USER_ACCESS_TOKEN or META_AD_ACCOUNT_ID is not set", null),
    page.token ? metaPage(graph, { token: page.token, pageId: page.pageId, d30 }).catch((e) => { errors.page = e.message; return null; }) : (errors.page = "No Meta Page access token", null),
    crmWindow(q, d30.fromMs, d30.toMs).catch((e) => { errors.crm = e.message; return null; }),
    crmWindow(q, m6.fromMs, m6.toMs).catch((e) => { errors.crm6 = e.message; return null; }),
  ]);

  const crm30 = crm30raw ? summarizeCrm(crm30raw) : null;
  let crmByCampaign30 = [];
  const allMetaCampaigns = meta ? [...meta.last30.campaigns, ...meta.monthly.campaigns] : [];
  const campKey = campaignKeyResolver(allMetaCampaigns);
  if (crm30raw) crmByCampaign30 = outcomesBy(crm30raw.created.filter((l) => l.isMeta), campKey);
  if (meta) for (const c of meta.last30.campaigns) {
    const o = crmByCampaign30.find((x) => x.key === c.campaignId);
    Object.assign(c, { crmLeads: o?.leads || 0, qualified: o?.qualifiedOrBetter || 0, unqualified: o?.unqualified || 0, clients: o?.clients || 0, costPerQualified: o?.qualifiedOrBetter ? c.spend / o.qualifiedOrBetter : null });
  }

  let analysis = null;
  if (crm6raw) {
    const s6 = summarizeCrm(crm6raw);
    const crm6 = {
      // Meta-sourced CRM leads only, so the month table compares like with like (imports and other sources excluded).
      byMonth: outcomesBy(crm6raw.created.filter((l) => l.isMeta), (l) => cairoDate(Number(l.ts)).slice(0, 7)),
      byCampaign: outcomesBy(crm6raw.created.filter((l) => l.isMeta), campKey),
      byProgram: outcomesBy(crm6raw.created, (l) => canonicalProgram(l.interestedProgram)),
      unqualifiedReasons: Object.fromEntries(Object.entries(s6.all.cohort.stages).filter(([k]) => isUnq(k)).map(([k, v]) => [k.replace("not_qualified_", ""), v])),
    };
    analysis = analyze({ meta, crm6, months: m6.months, settings });
  }

  const alerts = [];
  const cap = settings?.monthlyAdCapEgp ?? 200000, maxCpl = settings?.maxCplEgp ?? 100;
  if (meta) {
    const t = meta.last30.total;
    if (t.spend > cap) alerts.push({ level: "critical", text: `Spend in the last 30 days is ${Math.round(t.spend).toLocaleString("en-US")} EGP, above the ${cap.toLocaleString("en-US")} EGP monthly cap.` });
    for (const c of meta.last30.campaigns) if (c.leads > 0 && c.spend >= 1000 && c.cpl > maxCpl) alerts.push({ level: "critical", text: `${c.campaign}: CPL ${Math.round(c.cpl)} EGP over 30 days, above the ${maxCpl} EGP ceiling.` });
    const unmatched = crm30 ? crm30.meta.leads - meta.last30.campaigns.reduce((s, c) => s + (c.crmLeads || 0), 0) : 0;
    if (crm30 && crm30.meta.leads && unmatched / crm30.meta.leads > 0.2) alerts.push({ level: "warning", text: `${unmatched} of ${crm30.meta.leads} Meta leads in the CRM could not be matched to a campaign, so campaign quality numbers are partial.` });
  }

  return {
    ok: true, generatedAt: new Date(now).toISOString(), alerts,
    window: { since: d30.since, until: d30.until }, sixMonths: { since: m6.since, until: m6.until, months: m6.months },
    ads: meta ? { account: meta.account, ...meta.last30 } : null,
    page: pageData, crm: crm30, analysis, errors,
    definitions: {
      leads: "Leads created in the CRM in the window (Meta test leads excluded). Meta = has a Meta lead id or campaign, or a Meta/Facebook/Instagram source.",
      qualified: "Leads moved to Qualified during the window (from the CRM stage history).",
      unqualified: "Leads moved to any Not qualified stage during the window.",
      clients: "Leads moved to Client or with a contract signed during the window.",
      cohort: "Where the leads created in the window stand today.",
      metaLeads: "Leads Meta attributes to the ads (lead action), which can differ slightly from CRM leads.",
    },
  };
}

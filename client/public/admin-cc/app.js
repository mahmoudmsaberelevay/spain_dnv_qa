/* ELEVAY Marketing Command Center — browser app.
 * Server mode: talks to /api/* (team session cookie).
 * Demo mode: runs the same shared engine on example data in this browser.
 */
(function () {
  'use strict';
  const R = window.ElevayRules, E = window.ElevayEngine, Demo = window.ElevayDemo;
  const app = document.getElementById('app');
  const S = { mode: null, ext: null, data: null, view: 'overview', week: null, jobFilter: 'open', openItem: null, demoRole: 'owner', busy: false };
  const VIEWS = [
    ['overview', 'Overview'], ['plan', 'Weekly plan'], ['actions', 'Action plan'], ['performance', 'Performance'],
    ['news', 'News'], ['monthly', 'Monthly plan'], ['studio', 'AI Studio'], ['manus', 'Manus bridge'], ['settings', 'Settings'],
  ];

  // ------------------------------------------------------------ utils
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (v) => (v === null || v === undefined || isNaN(v) ? '—' : Math.round(Number(v)).toLocaleString('en-US'));
  const pct = (v, d = 0) => (v === null || v === undefined || isNaN(v) ? '—' : (Number(v) * 100).toFixed(d) + '%');
  const TZ = 'Africa/Cairo';
  const fmtDT = (iso) => { if (!iso) return '—'; const d = new Date(iso.length <= 16 ? iso + ':00+03:00' : iso); return isNaN(d) ? esc(iso) : d.toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const ago = (iso) => { if (!iso) return 'never'; const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago'; };
  const role = () => (S.data && S.data.me ? S.data.me.role : 'viewer');
  const isOwner = () => role() === 'owner';
  const canEdit = () => role() !== 'viewer';
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } } };

  let toastTimer;
  function toast(msg, bad) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), bad ? 6000 : 3000);
  }

  const STATUS_PILL = {
    draft: ['', 'Draft'], qc_failed: ['bad', 'QC failed'], pending_approval: ['warn', 'Awaiting approval'], changes_requested: ['info', 'Changes requested'],
    approved: ['ok', 'Approved'], scheduled: ['ok', 'Scheduled'], published: ['ok', 'Published'], rejected: ['bad', 'Rejected'],
  };
  const statusPill = (s) => { const [c, l] = STATUS_PILL[s] || ['', s]; return `<span class="pill ${c}">${esc(l)}</span>`; };
  const JOB_PILL = { pending: ['warn', 'Waiting for Manus'], sent: ['info', 'Sent to Manus'], in_progress: ['info', 'Manus working'], needs_input: ['bad', 'Manus has a question'], done: ['ok', 'Done'], failed: ['bad', 'Failed'] };
  const jobPill = (s) => { const [c, l] = JOB_PILL[s] || ['', s]; return `<span class="pill ${c}">${esc(l)}</span>`; };
  const JOB_LABEL = { schedule_post: 'Schedule approved post', revise_item: 'Revise item', item_rejected: 'Item rejected', execute_action: 'Execute Meta action', pause_adset: 'Pause ad set', autopublish_on: 'Autopublish on', autopublish_off: 'Autopublish off', custom: 'Team request' };
  const CONF_PILL = { verified: ['ok', 'Verified (official)'], reported: ['warn', 'Reported by media'], unconfirmed: ['bad', 'Unconfirmed'] };
  const confPill = (c) => { const [k, l] = CONF_PILL[c] || ['', c || '—']; return `<span class="pill ${k}">${esc(l)}</span>`; };

  // ------------------------------------------------------------ API adapter
  const DEMO_KEY = 'elevay-demo-state-v1';
  let demoState = null;
  function demoPayload() {
    const me = { id: 'demo', email: 'demo.owner@elevay.example', name: 'Demo user', role: S.demoRole };
    return {
      ok: true, me, settings: demoState.settings, summary: E.summary(demoState), items: demoState.items, actions: demoState.actions,
      reports: demoState.reports, news: demoState.news, plans: demoState.plans, jobs: demoState.jobs, audit: demoState.audit.slice(0, 300),
      users: [me], manus: { push: false, agentApi: false, webhook: false, lastAgentSeen: null, lastWebhookAt: null, publicUrl: '' }, server_time: new Date().toISOString(),
    };
  }
  function demoCommit() { E.killSwitchCheck(demoState); store.set(DEMO_KEY, JSON.stringify(demoState)); S.data = demoPayload(); }
  const who = () => (S.data.me && S.data.me.email) || 'demo';

  const api = {
    async req(method, path, body) {
      const res = await fetch('api/' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
      let data = {}; try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 401 && path !== 'auth/login') { S.data = null; renderLogin(); throw new Error('Sign in required.'); }
      if (res.status === 403 && path === 'bootstrap') { S.data = null; renderNoAccess(data.error); throw new Error(data.error || 'No access.'); }
      if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data });
      return data;
    },
    async run(serverFn, demoFn) {
      if (S.mode === 'demo') {
        const r = demoFn();
        if (r && r.ok === false) throw Object.assign(new Error(r.error), { data: r });
        demoCommit();
        return r;
      }
      const r = await serverFn();
      await refresh();
      return r;
    },
    decideItem: (id, body) => api.run(() => api.req('POST', `items/${encodeURIComponent(id)}/decision`, body), () => E.decideItem(demoState, id, body.decision, body, who(), role())),
    approveAll: (week) => api.run(() => api.req('POST', `weeks/${week}/approve-all`), () => E.approveAllWeek(demoState, week, who(), role())),
    decideAction: (id, body) => api.run(() => api.req('POST', `actions/${id}/decision`, body), () => E.decideAction(demoState, id, body.decision, body, who(), role())),
    proposePause: (adset) => api.run(() => api.req('POST', 'guardrails/pause', { adset }), () => (isOwner() ? E.proposePause(demoState, adset, who()) : { ok: false, error: 'Owner only.' })),
    decidePlan: (id, body) => api.run(() => api.req('POST', `plans/${id}/decision`, body), () => E.decidePlan(demoState, id, body.decision, body.comment, who(), role())),
    selectNews: (id, selected) => api.run(() => api.req('POST', `news/${id}/select`, { selected }), () => { const n = demoState.news.find((x) => x.id === id); n.selected = selected; return { ok: true }; }),
    createJob: (text) => api.run(() => api.req('POST', 'jobs', { text }), () => ({ ok: true, job: E.enqueueJob(demoState, 'custom', { request: text, requested_by: who() }, who()) })),
    replyJob: (id, message) => api.run(() => api.req('POST', `jobs/${id}/reply`, { message }), () => { const j = demoState.jobs.find((x) => x.id === id); j.replies = j.replies || []; j.replies.push({ at: new Date().toISOString(), by: who(), text: message }); j.manus.question = null; return E.setJobStatus(demoState, id, 'in_progress', {}, who()); }),
    retryJob: (id) => api.run(() => api.req('POST', `jobs/${id}/retry`), () => E.setJobStatus(demoState, id, 'pending', {}, who())),
    saveSettings: (patch) => api.run(() => api.req('PUT', 'settings', patch), () => { if (!isOwner()) return { ok: false, error: 'Owner only.' }; Object.assign(demoState.settings, patch); E.audit(demoState, who(), 'settings.updated', null, Object.keys(patch).join(', ')); return { ok: true }; }),
    autopublish: (on, reason) => api.run(() => api.req('POST', `autopublish/${on ? 'enable' : 'disable'}`, { reason }), () => (on ? E.enableAutopublish(demoState, who(), role()) : E.disableAutopublish(demoState, reason || 'Turned off by owner', who()))),
    addUser: (u) => api.run(() => api.req('POST', 'users', u), () => ({ ok: false, error: 'Team accounts work once the app runs on the server.' })),
    removeUser: (id) => api.run(() => api.req('DELETE', `users/${id}`), () => ({ ok: false, error: 'Team accounts work once the app runs on the server.' })),
    live: (refresh) => api.req('GET', 'live' + (refresh ? '?refresh=1' : '')),
    replan: (note) => api.run(() => api.req('POST', 'live/replan', { note }), () => ({ ok: false, error: 'Live data works on elevay.vip only.' })),
    password: (current, next) => api.run(() => api.req('POST', 'me/password', { current, next }), () => ({ ok: false, error: 'Passwords work once the app runs on the server.' })),
  };

  async function refresh() {
    if (S.mode === 'demo') { S.data = demoPayload(); return; }
    S.data = await api.req('GET', 'bootstrap');
  }

  async function act(fn, okMsg) {
    if (S.busy) return;
    S.busy = true;
    try { await fn(); if (okMsg) toast(okMsg); render(); }
    catch (e) {
      const extra = e.data && e.data.blocks ? ' ' + e.data.blocks.map((b) => b.label).join(' ') : '';
      toast(e.message + extra, true);
    } finally { S.busy = false; }
  }

  // ------------------------------------------------------------ boot
  async function boot() {
    const hash = location.hash.replace('#', '');
    if (VIEWS.some((v) => v[0] === hash)) S.view = hash;
    try {
      const res = await fetch('api/health', { credentials: 'same-origin' });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!data || data.service !== 'elevay-command-center') throw new Error('no server');
      S.mode = 'server';
      if (data.externalAuth) S.ext = { loginUrl: data.loginUrl || '/login' };
      if (data.needsSetup) return renderSetup();
    } catch { S.mode = 'demo'; }

    if (S.mode === 'demo') {
      S.demoRole = store.get('elevay-demo-role') || 'owner';
      const saved = store.get(DEMO_KEY);
      try { demoState = saved ? JSON.parse(saved) : null; } catch { demoState = null; }
      if (!demoState || !demoState.items) demoState = Demo.build();
      S.data = demoPayload();
      return render();
    }
    try { await refresh(); render(); setInterval(poll, 20000); } catch { /* login shown */ }
  }
  async function poll() {
    if (!S.data || document.hidden || S.busy) return;
    if (document.activeElement && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName)) return; // never clobber typing
    try { await refresh(); render(); } catch { /* handled */ }
  }

  function renderLogin(msg) {
    if (S.ext) {
      app.innerHTML = `<div class="login"><form onsubmit="return false">
        <div class="brand"><div class="product">Marketing Command Center</div><div class="tag">EXPANDING YOUR FREEDOM</div></div>
        <p>Sign in with your elevay.vip account to open the Command Center.</p>
        <a class="btn primary" href="${esc(S.ext.loginUrl)}">Sign in to elevay.vip</a>
        <p class="small muted">Access follows your Agentic Marketing role: owner and administrator approve, managers and producers request changes, analysts view.</p></form></div>`;
      return;
    }
    app.innerHTML = `<div class="login"><form id="login" novalidate>
      <div class="brand"><img src="brand/elevay_logo_official.png" alt="ELEVAY" onerror="this.remove()"><div class="product">Marketing Command Center</div><div class="tag">EXPANDING YOUR FREEDOM</div></div>
      <label class="field"><span>Work email</span><input class="input" id="lg-email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input class="input" id="lg-pw" type="password" autocomplete="current-password" required></label>
      ${msg ? `<p class="small" style="color:var(--bad)">${esc(msg)}</p>` : ''}
      <button class="btn primary" type="submit">Sign in</button>
      <p class="small muted">Accounts are created by the owner in Settings → Team.</p></form></div>`;
    document.getElementById('login').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api.req('POST', 'auth/login', { email: document.getElementById('lg-email').value, password: document.getElementById('lg-pw').value });
        await refresh(); render(); setInterval(poll, 20000);
      } catch (e) { renderLogin(e.message); }
    });
  }

  function renderNoAccess(msg) {
    app.innerHTML = `<div class="login"><form onsubmit="return false">
      <div class="brand"><div class="product">Marketing Command Center</div><div class="tag">EXPANDING YOUR FREEDOM</div></div>
      <h2>No access yet</h2><p>${esc(msg || 'Your account has no Agentic Marketing role.')}</p>
      <a class="btn" href="/marketing/agentic-system">Go to the Agentic Marketing System</a></form></div>`;
  }

  function renderSetup(msg) {
    app.innerHTML = `<div class="login"><form id="setup" novalidate>
      <div class="brand"><img src="brand/elevay_logo_official.png" alt="ELEVAY" onerror="this.remove()"><div class="product">Marketing Command Center</div><div class="tag">EXPANDING YOUR FREEDOM</div></div>
      <div><h2>Create the owner account</h2><p class="small muted" style="margin-top:4px">One-time setup. Use the setup code you were given.</p></div>
      <label class="field"><span>Setup code</span><input class="input" id="su-code" autocomplete="one-time-code" required></label>
      <label class="field"><span>Your name</span><input class="input" id="su-name" autocomplete="name" required></label>
      <label class="field"><span>Work email</span><input class="input" id="su-email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password (10+ characters)</span><input class="input" id="su-pw" type="password" autocomplete="new-password" minlength="10" required></label>
      ${msg ? `<p class="small" style="color:var(--bad)">${esc(msg)}</p>` : ''}
      <button class="btn primary" type="submit">Create owner account</button></form></div>`;
    document.getElementById('setup').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (id) => document.getElementById(id).value;
      try {
        await api.req('POST', 'auth/setup', { code: v('su-code'), name: v('su-name'), email: v('su-email'), password: v('su-pw') });
        await refresh(); render(); setInterval(poll, 20000);
      } catch (e) { renderSetup(e.message); }
    });
  }

  // ------------------------------------------------------------ shell
  function navCounts() {
    const d = S.data, s = d.summary;
    return {
      plan: d.items.filter((i) => i.status === 'pending_approval').length,
      actions: s.actionsPending,
      manus: s.needsInput,
      performance: s.guardrails.alerts.filter((a) => a.level === 'critical').length,
      monthly: d.plans.filter((p) => p.status === 'pending_approval').length,
      studio: S.studio ? S.studio.runs.filter((r) => r.status === 'awaiting_approval').length : 0,
    };
  }

  function render() {
    if (!S.data) return;
    const c = navCounts();
    const view = VIEWS.find((v) => v[0] === S.view) || VIEWS[0];
    const me = S.data.me;
    app.innerHTML = `<div class="shell">
      <aside class="rail">
        <div class="brand"><img id="logo" src="brand/elevay_logo_official.png" alt="ELEVAY" onerror="this.remove()"><div><div class="product">Marketing Command Center</div><div class="tag">EXPANDING YOUR FREEDOM</div></div></div>
        <nav class="nav" aria-label="Sections">${VIEWS.map(([k, l]) => `<button data-view="${k}" ${k === S.view ? 'aria-current="page"' : ''}><span>${l}</span>${c[k] ? `<span class="count${k === 'monthly' ? ' quiet' : ''}">${c[k]}</span>` : ''}</button>`).join('')}</nav>
        <div class="rail-foot">
          <div class="who"><span>${esc(me.name || me.email)} · ${esc(me.role)}</span>${S.mode === 'server' && !S.ext ? '<button class="btn ghost sm" id="logout">Sign out</button>' : ''}</div>
          <div>${S.mode === 'server' ? `Synced ${ago(S.data.server_time)}` : 'Demo mode'} · Cairo time</div>
        </div>
      </aside>
      <main class="main" id="main">
        ${S.mode === 'demo' ? demoBanner() : ''}
        <div class="topbar"><div><h1>${view[1]}</h1><div class="sub">${subtitle(S.view)}</div></div><div class="row" id="topActions"></div></div>
        <div id="view"></div>
      </main></div>`;
    const v = document.getElementById('view');
    ({ overview: viewOverview, plan: viewPlan, actions: viewActions, performance: viewPerformance, news: viewNews, monthly: viewMonthly, studio: viewStudio, manus: viewManus, settings: viewSettings })[S.view](v);
    wireShell();
  }

  function subtitle(v) {
    const t = new Date().toLocaleString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return ({
      overview: `${t} Cairo. Targets, spend guardrails and what needs a decision.`,
      plan: '7 posts a week (4 static + 3 reels). Approve, request changes or reject each item. Manus regenerates only what you flag.',
      actions: 'Friday action plan from the Meta report. Manus executes only what the owner approves.',
      performance: 'Live from Meta and the ELEVAY CRM: last 30 days of ads, leads, qualified, unqualified, clients and page growth. Read-only.',
      news: 'Weekly news search: Manus collects, Claude verifies. Only verified or reported items can feed posts.',
      monthly: 'Next month’s plan, built from 6 months of Meta and CRM results. The owner approves it.',
      studio: 'Autopilot plans the week from your Meta and CRM results, Claude hands each part to OpenAI, Higgsfield or Manus, and checks the results.',
      manus: 'Every decision here becomes a job for Manus, which runs Meta, OpenAI, Higgsfield and the Elevay.vip voice module.',
      settings: 'Hard limits, the autopublish gate, team access and the audit log.',
    })[v];
  }

  function demoBanner() {
    return `<div class="demo-banner"><strong>Demo mode</strong><span>Example data only. Changes stay in this browser. Deploy on Manus to connect the real workflow.</span><span class="spacer"></span>
      <label class="row small">Viewing as <select class="input" id="demoRole" style="width:auto;padding:4px 8px">${['owner', 'marketer', 'viewer'].map((r) => `<option ${r === S.demoRole ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <button class="btn sm" id="demoReset">Reset example data</button></div>`;
  }

  function wireShell() {
    document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    const lo = document.getElementById('logout');
    if (lo) lo.onclick = async () => { await api.req('POST', 'auth/logout').catch(() => {}); S.data = null; renderLogin(); };
    const dr = document.getElementById('demoRole');
    if (dr) dr.onchange = () => { S.demoRole = dr.value; store.set('elevay-demo-role', dr.value); S.data = demoPayload(); render(); };
    const rs = document.getElementById('demoReset');
    if (rs) rs.onclick = () => { demoState = Demo.build(); demoCommit(); toast('Example data reset'); render(); };
  }

  function go(view, extra) {
    S.view = view; Object.assign(S, extra || {});
    try { history.replaceState(null, '', '#' + view); } catch { /* ignore */ }
    render(); window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ overview
  function viewOverview(el) {
    const d = S.data, s = d.summary, g = s.guardrails, rep = s.report, set = d.settings;
    const pending = d.items.filter((i) => i.status === 'pending_approval').length;
    const qcFail = d.items.filter((i) => i.status === 'qc_failed').length;
    const crit = g.alerts.filter((a) => a.level === 'critical').length;
    el.innerHTML = `<div class="stack" style="gap:18px">
      <div class="attention">
        ${att('plan', pending, 'posts awaiting approval', qcFail ? `${qcFail} failed QC and are waiting on Manus` : 'This week’s content plan', pending ? 'hot' : 'calm')}
        ${att('actions', s.actionsPending, 'Meta actions to decide', 'Friday action plan', s.actionsPending ? 'hot' : 'calm')}
        ${att('performance', crit, 'guardrail alerts', crit ? 'Spend cap or CPL ceiling at risk' : 'Spend and CPL within limits', crit ? 'bad' : 'calm')}
        ${att('manus', s.needsInput, 'questions from Manus', `${s.jobsOpen} open job${s.jobsOpen === 1 ? '' : 's'} in the bridge`, s.needsInput ? 'bad' : 'calm')}
      </div>
      <div id="liveStrip"></div>
      <section class="panel"><div class="panel-h"><h2>Monthly funnel</h2><span class="muted small">${rep ? `Meta report for ${esc(rep.month)}, as of ${esc(rep.asOf)} · day ${g.day} of ${g.daysInMonth}` : 'No Meta report yet'}</span></div>
        ${rep ? funnel(rep, set, g) : '<div class="empty">Manus posts the Meta report every Friday at 09:00 Cairo. The funnel fills in from it.</div>'}</section>
      <div class="grid g2">
        <section class="panel"><div class="panel-h"><h2>Ad spend pacing</h2><span class="muted small">Cap ${n0(set.monthlyAdCapEgp)} EGP · max CPL ${set.maxCplEgp} EGP</span></div>${rep ? pacing(rep, set, g) : '<div class="empty">Waiting for the first report.</div>'}</section>
        <section class="panel"><div class="panel-h"><h2>First-pass approval</h2>${autopubPill()}</div>${approvalChart(s.approval, set)}</section>
      </div>
      <section class="panel"><div class="panel-h"><h2>This week’s operating calendar</h2><span class="muted small">Sunday to Saturday, Cairo time</span></div><div class="table-wrap">${calendar()}</div></section>
    </div>`;
    el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
    liveInto(document.getElementById('liveStrip'), 'strip').then(() => el.querySelectorAll('#liveStrip [data-go]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); go(b.dataset.go); })));
  }
  const att = (view, n, what, sub, cls) => `<button class="att ${cls}" data-go="${view}"><span class="n">${n}</span><strong>${what}</strong><span class="small muted">${sub}</span></button>`;

  function funnel(rep, set, g) {
    const t = set.targets, pace = g.day / g.daysInMonth;
    const rows = [['Views', rep.videoViews, t.views], ['Page likes', rep.pageLikes, t.pageLikes], ['Meta leads', rep.leads, t.leads], ['Qualified leads', rep.qualifiedLeads, t.qualifiedLeads], ['Signed clients', rep.signedClients, t.signedClients]];
    return `<div class="grid g5">${rows.map(([l, v, tg]) => {
      const p = tg ? Math.min(1, (v || 0) / tg) : 0, behind = p < pace * 0.85;
      return `<div class="kpi"><span class="label">${l}</span><span class="v">${n0(v)}</span><div class="bar ${behind ? 'hot' : 'good'}" title="Pace marker shows where you should be today"><i style="width:${(p * 100).toFixed(1)}%"></i><b style="left:${(pace * 100).toFixed(1)}%"></b></div><span class="t">${pct(p)} of ${n0(tg)} · ${behind ? 'behind pace' : 'on pace'}</span></div>`;
    }).join('')}</div>
    <p class="small muted" style="margin-top:12px">Qualified rate ${rep.leads ? pct(rep.qualifiedLeads / rep.leads, 1) : '—'} (target 10%) · Blended CPL ${rep.leads ? n0(rep.spendMtdEgp / rep.leads) + ' EGP' : '—'} (target ≤ ${set.targetCplEgp} EGP)</p>`;
  }

  function pacing(rep, set, g) {
    const cap = set.monthlyAdCapEgp, spend = rep.spendMtdEgp, proj = Math.min(g.projected, cap * 1.25);
    const scale = Math.max(cap, proj) * 1.02;
    return `<div class="pace">
      <div class="row" style="justify-content:space-between"><div class="kpi"><span class="label">Spent this month</span><span class="v">${n0(spend)} EGP</span></div><div class="kpi" style="text-align:right"><span class="label">Projected month end</span><span class="v" style="color:${g.projected > cap ? 'var(--bad)' : 'inherit'}">${n0(g.projected)} EGP</span></div></div>
      <div class="track" role="img" aria-label="Spend ${n0(spend)} of ${n0(cap)} EGP; projected ${n0(g.projected)}">
        <div class="proj" style="left:0;width:${(proj / scale * 100).toFixed(1)}%"></div>
        <div class="fill" style="width:${(spend / scale * 100).toFixed(1)}%"></div>
        <div class="cap" style="left:${(cap / scale * 100).toFixed(1)}%;right:auto"></div>
      </div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Spent</span><span><i style="background:color-mix(in srgb, var(--warn) 45%, transparent)"></i>Projected</span><span><i style="background:var(--bad)"></i>Cap ${n0(cap)} EGP</span><span>Ideal to date ${n0(g.idealToDate)} EGP</span></div>
      ${g.alerts.length ? `<div class="alerts">${g.alerts.slice(0, 3).map(alertRow).join('')}</div>` : '<p class="small" style="color:var(--ok)">Within the cap and CPL ceiling.</p>'}
    </div>`;
  }
  function alertRow(a) {
    const pause = a.code === 'cpl_breach' && isOwner() ? `<button class="btn sm" data-pause="${esc(a.adset)}">Propose pause</button>` : '';
    return `<div class="alert ${a.level}"><span class="tag">${a.level === 'critical' ? 'Critical' : 'Watch'}</span><span class="grow">${esc(a.text)}</span>${pause}</div>`;
  }

  function autopubPill() {
    const ap = S.data.settings.autopublish;
    return ap.enabled ? '<span class="pill ok">Autopublish on</span>' : '<span class="pill">Manual approval</span>';
  }

  function approvalChart(st, set) {
    const weeks = st.weeks.slice(-8);
    if (!weeks.length) return '<div class="empty">No items presented yet.</div>';
    const W = 520, H = 170, padL = 34, padB = 26, padT = 20, bw = (W - padL - 10) / weeks.length;
    const y = (v) => padT + (1 - v) * (H - padT - padB);
    const thr = set.approvalThreshold;
    const bars = weeks.map((w, i) => {
      const x = padL + i * bw + bw * 0.18, h = (H - padT - padB) * (w.rate || 0), ok = (w.rate || 0) >= thr;
      return `<rect x="${x.toFixed(1)}" y="${y(w.rate || 0).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${ok ? 'var(--accent)' : 'var(--warn)'}"><title>${w.week}: ${w.firstPass}/${w.presented}</title></rect>
        <text x="${(x + bw * 0.32).toFixed(1)}" y="${(y(w.rate || 0) - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--ink-2)">${Math.round((w.rate || 0) * 100)}%</text>
        <text x="${(x + bw * 0.32).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--ink-3)">${w.week.slice(5)}</text>`;
    }).join('');
    const grid = [0, 0.5, 1].map((v) => `<line x1="${padL}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" /><text x="${padL - 6}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="var(--ink-3)">${v * 100}%</text>`).join('');
    const line = `<line x1="${padL}" x2="${W - 6}" y1="${y(thr)}" y2="${y(thr)}" stroke="var(--gold)" stroke-dasharray="4 3" stroke-width="1.5" /><text x="${W - 8}" y="${y(thr) - 4}" text-anchor="end" font-size="10" fill="var(--gold)">${thr * 100}% gate</text>`;
    const weeksLeft = Math.max(0, set.manualWeeks - st.weeksDone);
    return `<div class="weeks-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly first-pass approval rate">${grid}${line}${bars}</svg></div>
      <div class="grid g3" style="margin-top:10px">
        <div class="kpi"><span class="label">Cumulative</span><span class="v">${pct(st.cumulative, 1)}</span><span class="t">${st.firstPass} of ${st.presented} decided items</span></div>
        <div class="kpi"><span class="label">Rolling 4 weeks</span><span class="v">${pct(st.rolling4, 1)}</span><span class="t">Kill switch below ${set.killSwitchRollingThreshold * 100}%</span></div>
        <div class="kpi"><span class="label">Gate</span><span class="v">${st.gateEligible ? 'Eligible' : weeksLeft ? weeksLeft + ' wk left' : 'Below 90%'}</span><span class="t">${st.awaiting} item${st.awaiting === 1 ? '' : 's'} awaiting a first decision</span></div>
      </div>`;
  }

  function calendar() {
    const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const start = new Date(nowCairo); start.setDate(nowCairo.getDate() - nowCairo.getDay()); start.setHours(0, 0, 0, 0);
    const fixed = { 4: [['20:00', 'Deep news search starts', true]], 5: [['09:00', 'Meta report generated', true], ['09:30', 'Claude analysis'], ['10:00', 'Action plan for approval', true], ['11:00', 'Production and QC run']], 6: [['06:00', 'Production complete'], ['09:00', 'Weekly content plan for approval', true], ['20:00', 'Reminder if items are pending']] };
    const posts = S.data.items.filter((i) => i.publish && i.publish.datetime_cairo && ['approved', 'scheduled', 'published', 'pending_approval', 'changes_requested'].includes(i.status));
    let html = '<div class="timeline">';
    for (let i = 0; i < 7; i++) {
      const day = new Date(start); day.setDate(start.getDate() + i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const evs = (fixed[i] || []).map(([t, l, k]) => `<div class="ev ${k ? 'key' : ''}"><b>${t}</b> ${l}</div>`);
      posts.filter((p) => p.publish.datetime_cairo.startsWith(key)).forEach((p) => evs.push(`<div class="ev"><b>${p.publish.datetime_cairo.slice(11, 16)}</b> ${esc(p.type)} ${esc(p.item_id.slice(-2))} · ${STATUS_PILL[p.status][1]}</div>`));
      const today = day.toDateString() === nowCairo.toDateString();
      html += `<div class="day ${today ? 'today' : ''}"><span class="d">${day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${today ? ' · today' : ''}</span>${evs.join('') || '<span class="small muted">Approved posts publish</span>'}</div>`;
    }
    return html + '</div>';
  }

  // ------------------------------------------------------------ weekly plan
  function weeksList() {
    const set = new Set(S.data.items.map((i) => R.weekOf(i.item_id)));
    return [...set].sort().reverse();
  }

  function viewPlan(el) {
    const weeks = weeksList();
    if (!S.week || !weeks.includes(S.week)) {
      const withPending = weeks.find((w) => S.data.items.some((i) => R.weekOf(i.item_id) === w && ['pending_approval', 'qc_failed', 'changes_requested'].includes(i.status)));
      S.week = withPending || weeks[0] || null;
    }
    if (!S.week) {
      el.innerHTML = `<div class="empty stack" style="align-items:center">No content yet. Manus delivers the weekly plan every Saturday at 09:00 Cairo.${isOwner() && S.mode === 'server' ? '<button class="btn" id="seedEx">Load example week to explore</button><span class="small">Only works while the workspace is empty. Example data is clearly marked and is never sent to Meta.</span>' : ''}</div>`;
      const b = document.getElementById('seedEx');
      if (b) b.onclick = () => act(async () => { await api.req('POST', 'admin/seed-example'); await refresh(); }, 'Example week loaded.');
      return;
    }
    const items = S.data.items.filter((i) => R.weekOf(i.item_id) === S.week).sort((a, b) => a.item_id.localeCompare(b.item_id));
    const cnt = (s) => items.filter((i) => i.status === s).length;
    const statics = items.filter((i) => i.type !== 'reel').length, reels = items.filter((i) => i.type === 'reel').length;
    const pend = cnt('pending_approval');
    el.innerHTML = `<div class="stack" style="gap:14px">
      <div class="panel weekbar">
        <div class="row"><label class="field" style="min-width:160px"><span>Week</span><select class="input" id="weekSel">${weeks.map((w) => `<option ${w === S.week ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
          <div class="statusline">${['pending_approval', 'qc_failed', 'changes_requested', 'approved', 'scheduled', 'published', 'rejected'].filter(cnt).map((s) => `${statusPill(s).replace('</span>', ` ${cnt(s)}</span>`)}`).join('')}</div></div>
        <div class="row"><span class="small muted">${statics} static · ${reels} reels${statics === 4 && reels === 3 ? '' : ' (plan calls for 4 + 3)'}</span>
          ${isOwner() ? `<button class="btn primary" id="approveAll" ${pend ? '' : 'disabled'}>Approve all ${pend || ''} passing items</button>` : ''}</div>
      </div>
      <div class="items">${items.map(itemCard).join('')}</div></div>`;
    document.getElementById('weekSel').onchange = (e) => { S.week = e.target.value; render(); };
    const aa = document.getElementById('approveAll');
    if (aa) aa.onclick = () => act(async () => { const r = await api.approveAll(S.week); toast(`Approved ${r.approved.length}${r.skipped.length ? `, skipped ${r.skipped.length} with compliance blocks` : ''}. Manus will schedule them.`); });
    wireItems(el);
    if (S.openItem) { const n = document.getElementById('item-' + S.openItem); if (n) { n.classList.add('focus'); n.scrollIntoView({ block: 'start' }); } S.openItem = null; }
  }

  function mediaBlock(i) {
    const m = i.media || {};
    const fmt = i.design && i.design.format === '1080x1350' ? 'p45' : 'sq';
    if (i.type === 'reel') {
      if (m.video_url) return `<div class="frame v916"><video src="${esc(m.video_url)}" controls playsinline preload="metadata"></video></div>`;
      return `<div class="frame v916" style="max-width:230px"><div class="ph reel"><span class="note">Reel preview pending from Manus</span><div><div class="hl">${esc(i.topic)}</div><div class="small" style="opacity:.8;margin-top:6px">4 × 5 s clips + 3 s white logo outro</div></div><div class="clips">${[1, 2, 3, 4].map((c) => `<span>Clip ${c}</span>`).join('')}</div></div></div>`;
    }
    if (m.image_url) return `<div class="frame ${fmt}"><img src="${esc(m.image_url)}" alt="Design for ${esc(i.item_id)}" loading="lazy"></div>`;
    return `<div class="frame ${fmt}"><div class="ph"><span class="note">Design pending from Manus</span><div class="hl">${esc((i.design && i.design.headline_en) || i.topic)}</div><span class="small" style="opacity:.75">${esc((i.design && i.design.format) || '1080x1080')} · logo composited after generation</span></div></div>`;
  }

  function itemCard(i) {
    const c = i.compliance || { blocks: [], warnings: [], checks: [] };
    const passed = c.checks.filter((x) => x.ok).length;
    const decidable = ['pending_approval', 'qc_failed'].includes(i.status);
    const talent = i.talent && i.talent.mode && i.talent.mode !== 'none' ? (i.talent.mode === 'influencer' ? 'AI influencer + Elevay.vip voice' : 'Elevay.vip voice-over') : 'Music only';
    const lastReq = (i.owner_comments || []).filter((x) => x.kind === 'change_request').slice(-1)[0];
    return `<article class="item" id="item-${esc(i.item_id)}">
      <div class="media">${mediaBlock(i)}
        <dl class="meta-list">
          <dt>Publish</dt><dd>${fmtDT(i.publish && i.publish.datetime_cairo)}</dd>
          <dt>Channel</dt><dd>${esc(({ both: 'Facebook + Instagram', facebook: 'Facebook', instagram: 'Instagram' })[i.publish && i.publish.channel] || '—')}</dd>
          <dt>Program</dt><dd>${esc(i.program || '—')}</dd>
          <dt>Pillar</dt><dd>${esc(i.pillar || '—')}</dd>
          ${i.type === 'reel' ? `<dt>Audio</dt><dd>${talent}</dd>` : ''}
          ${i.source && i.source.url ? `<dt>Source</dt><dd>${confPill(i.source.confidence)} <a href="${esc(i.source.url)}" target="_blank" rel="noopener">link</a></dd>` : ''}
        </dl>
      </div>
      <div class="content">
        <div class="item-h"><div><span class="id">${esc(i.item_id)} · v${i.version} · ${esc(i.type)}</span><h3>${esc(i.topic || 'Untitled')}</h3></div><div class="row">${statusPill(i.status)}${c.pass ? `<span class="pill ok">Compliance ${passed}/${c.checks.length}</span>` : `<span class="pill bad">${c.blocks.length} compliance block${c.blocks.length === 1 ? '' : 's'}</span>`}</div></div>
        ${i.status === 'changes_requested' && lastReq ? `<div class="comment change_request"><strong>Sent to Manus (${esc(scopeLabel(lastReq.scope))}${lastReq.clip ? ' ' + lastReq.clip : ''}):</strong> ${esc(lastReq.text)}</div>` : ''}
        <div><div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="label">Arabic caption</span><span class="small muted num">${c.words || 0} words · target 100–150</span></div>
          <div class="caption ar" dir="rtl" lang="ar">${esc(i.caption_ar || '')}</div></div>
        ${c.blocks.length || c.warnings.length ? `<div class="checks">${c.blocks.map((b) => `<span class="chk block">${esc(b.label)}</span>`).join('')}${c.warnings.map((b) => `<span class="chk warn">${esc(b.label)}</span>`).join('')}</div>` : ''}
        <details class="more"><summary>Brief details, QC and history</summary><div class="stack">
          ${i.type !== 'reel' && i.design ? `<div><span class="label">Design headline (English)</span><p>${esc(i.design.headline_en || '—')}</p></div><div><span class="label">Image prompt</span><p class="small">${esc(i.design.image_prompt || '—')}</p></div>` : ''}
          ${i.type === 'reel' && i.reel ? `<div><span class="label">Storyboard · ${esc(i.reel.duration_s || '?')} s · ${esc(i.reel.music_direction || '')}</span><div class="story" style="margin-top:6px">${(i.reel.storyboard || []).map((s) => `<div class="clip"><strong>Clip ${s.clip}</strong><span>${esc(s.keyframe_prompt)}</span><span class="muted">${esc(s.motion_prompt)}</span>${s.spoken_text_ar ? `<span class="ar" dir="rtl" lang="ar">${esc(s.spoken_text_ar)}</span>` : ''}</div>`).join('')}</div></div>` : ''}
          <div><span class="label">Claude QC</span><p class="small">${i.qc ? `Passed: ${esc((i.qc.checks_passed || []).join(', ') || '—')}${(i.qc.checks_failed || []).length ? ` · Failed: ${esc(i.qc.checks_failed.join(', '))}` : ''}` : 'Not reported'}</p></div>
          <div><span class="label">Compliance checks</span><div class="small">${c.checks.map((x) => `<div>${x.ok ? '✓' : x.severity === 'block' ? '✕' : '!'} ${esc(x.label)}</div>`).join('')}</div></div>
          ${(i.owner_comments || []).length ? `<div><span class="label">Comments</span><div class="comments">${i.owner_comments.map((x) => `<div class="comment ${x.kind}"><span class="muted small">${fmtDT(x.at)} · ${esc(x.by)} · v${x.version}${x.scope ? ' · ' + esc(scopeLabel(x.scope)) : ''}</span><div>${esc(x.text)}</div></div>`).join('')}</div></div>` : ''}
          ${(i.history || []).length ? `<div><span class="label">Versions</span><div class="small">${i.history.map((h) => `<div>v${h.version} replaced ${fmtDT(h.at)} by ${esc(h.by)}</div>`).join('')}</div></div>` : ''}
        </div></details>
        ${decidable && canEdit() ? decideBlock(i) : ''}
      </div></article>`;
  }
  const scopeLabel = (s) => (R.CHANGE_SCOPES.find((x) => x.id === s) || { label: s }).label;

  function decideBlock(i) {
    const blocked = i.compliance && !i.compliance.pass;
    const id = esc(i.item_id);
    return `<div class="decide" data-item="${id}">
      <div class="row">
        ${isOwner() ? `<button class="btn primary" data-do="approve" ${blocked ? 'disabled title="Fix compliance blocks first"' : ''}>Approve</button>` : ''}
        <button class="btn" data-do="toggle-changes">Request changes</button>
        ${isOwner() ? '<button class="btn danger" data-do="toggle-reject">Reject</button>' : ''}
        ${isOwner() && blocked ? '<button class="btn ghost sm" data-do="toggle-override">Approve with override…</button>' : ''}
      </div>
      <div class="stack" data-panel="changes" hidden>
        <label class="field"><span>What should change? Manus regenerates only the scope below.</span><textarea class="input" id="cr-${id}" placeholder="e.g. Shorten the hook and mention that family members can be included."></textarea></label>
        <div class="row"><label class="field" style="min-width:200px"><span>Scope (suggested from your comment)</span><select class="input" id="sc-${id}">${R.CHANGE_SCOPES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></label>
          ${i.type === 'reel' ? `<label class="field" style="width:110px"><span>Clip</span><select class="input" id="cl-${id}"><option value="">—</option>${[1, 2, 3, 4].map((n) => `<option>${n}</option>`).join('')}</select></label>` : ''}
          <span class="small muted grow" id="rg-${id}"></span></div>
        <div class="row"><button class="btn primary" data-do="send-changes">Send to Manus</button><button class="btn ghost" data-do="toggle-changes">Cancel</button></div>
      </div>
      <div class="stack" data-panel="reject" hidden><label class="field"><span>Reason (shared with Manus)</span><textarea class="input" id="rj-${id}"></textarea></label><div class="row"><button class="btn danger" data-do="send-reject">Reject item</button><button class="btn ghost" data-do="toggle-reject">Cancel</button></div></div>
      <div class="stack" data-panel="override" hidden><label class="field"><span>Override reason (logged). Use only when a flagged term is an official program name or a false positive.</span><textarea class="input" id="ov-${id}"></textarea></label><div class="row"><button class="btn primary" data-do="send-override">Approve with override</button><button class="btn ghost" data-do="toggle-override">Cancel</button></div></div>
    </div>`;
  }

  function wireItems(root) {
    root.querySelectorAll('.decide').forEach((box) => {
      const id = box.dataset.item;
      const item = S.data.items.find((x) => x.item_id === id);
      const panel = (p) => box.querySelector(`[data-panel="${p}"]`);
      const ta = box.querySelector(`#cr-${CSS.escape(id)}`), sc = box.querySelector(`#sc-${CSS.escape(id)}`), cl = box.querySelector(`#cl-${CSS.escape(id)}`), rg = box.querySelector(`#rg-${CSS.escape(id)}`);
      let userPicked = false;
      const updateScope = () => {
        if (!userPicked) { const g = R.classifyChange(ta.value, item); sc.value = g.scope; if (cl && g.clip) cl.value = String(g.clip); }
        const s = R.CHANGE_SCOPES.find((x) => x.id === sc.value); rg.textContent = s ? 'Regenerates: ' + s.regenerates : '';
      };
      if (ta) { ta.addEventListener('input', updateScope); sc.addEventListener('change', () => { userPicked = true; updateScope(); }); updateScope(); }
      box.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-do]'); if (!b) return;
        const d = b.dataset.do;
        if (d.startsWith('toggle-')) { const p = panel(d.slice(7)); const open = p.hidden; ['changes', 'reject', 'override'].forEach((k) => panel(k) && (panel(k).hidden = true)); p.hidden = !open; if (open) p.querySelector('textarea').focus(); return; }
        if (d === 'approve') return act(() => api.decideItem(id, { decision: 'approve' }), 'Approved. Manus will schedule it.');
        if (d === 'send-changes') return act(() => api.decideItem(id, { decision: 'request_changes', comment: ta.value, scope: sc.value, clip: cl && cl.value ? Number(cl.value) : null }), 'Change request sent to Manus.');
        if (d === 'send-reject') return act(() => api.decideItem(id, { decision: 'reject', comment: box.querySelector(`#rj-${CSS.escape(id)}`).value }), 'Rejected.');
        if (d === 'send-override') return act(() => api.decideItem(id, { decision: 'approve', override: true, reason: box.querySelector(`#ov-${CSS.escape(id)}`).value }), 'Approved with override. Logged in the audit trail.');
      });
    });
  }

  // ------------------------------------------------------------ action plan
  function viewActions(el) {
    const list = S.data.actions;
    if (!list.length) { el.innerHTML = '<div class="empty">Manus sends the action plan every Friday at 10:00 Cairo, after the 09:00 Meta report and Claude’s analysis.</div>'; return; }
    const groups = [['pending', 'To decide'], ['approved', 'Approved, waiting for Manus'], ['executed', 'Executed'], ['failed', 'Failed'], ['rejected', 'Rejected']];
    el.innerHTML = groups.map(([st, title]) => {
      const rows = list.filter((a) => a.status === st);
      if (!rows.length) return '';
      return `<section class="stack" style="margin-bottom:18px"><h2>${title} <span class="muted small">${rows.length}</span></h2><div class="cards">${rows.map(actionCard).join('')}</div></section>`;
    }).join('');
    el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.id, card = b.closest('.panel');
      if (b.dataset.act === 'approve') {
        const txt = card.querySelector('textarea[data-edit]');
        const edit = txt && txt.value.trim() !== txt.defaultValue.trim() ? { change: txt.value.trim() } : null;
        return act(() => api.decideAction(id, { decision: 'approve', edit }), 'Approved. Manus will execute it and report before/after values.');
      }
      if (b.dataset.act === 'reject') return act(() => api.decideAction(id, { decision: 'reject', comment: (card.querySelector('input[data-comment]') || {}).value || '' }), 'Rejected.');
    }));
  }
  function actionCard(a) {
    const ex = a.execution;
    return `<div class="panel"><div class="panel-h"><div><span class="small muted">${esc(a.id)} · ${esc(a.kind)}${a.week ? ' · ' + esc(a.week) : ''}${a.edited ? ' · edited by owner' : ''}</span>
      ${a.status === 'pending' && isOwner() ? `<textarea class="input" data-edit style="margin-top:6px;min-height:44px;font-weight:600">${esc(a.change)}</textarea>` : `<h3 style="margin-top:4px">${esc(a.change)}</h3>`}</div>
      ${Number(a.budget_delta_egp) > 0 ? `<span class="pill warn">+${n0(a.budget_delta_egp)} EGP/day</span>` : ''}</div>
      <div class="card-grid"><div><span class="label">Why</span><p>${esc(a.reason)}</p></div><div><span class="label">Expected impact</span><p>${esc(a.expected_impact)}</p></div><div><span class="label">Risk</span><p>${esc(a.risk)}</p></div><div><span class="label">Rollback</span><p>${esc(a.rollback)}</p></div></div>
      ${ex ? `<div class="code" style="margin-top:10px">Before: ${esc(JSON.stringify(ex.before))}\nAfter:  ${esc(JSON.stringify(ex.after))}${ex.note ? '\n' + esc(ex.note) : ''}</div>` : ''}
      ${a.status === 'pending' && isOwner() ? `<div class="row" style="margin-top:12px"><button class="btn primary" data-act="approve" data-id="${a.id}">Approve</button><input class="input" data-comment placeholder="Reason if rejecting" style="max-width:280px"><button class="btn danger" data-act="reject" data-id="${a.id}">Reject</button><span class="small muted">Budget increases are refused if they would push the month over the cap.</span></div>` : ''}
      ${a.status === 'pending' && !isOwner() ? '<p class="small muted" style="margin-top:10px">Waiting for the owner’s decision.</p>' : ''}
    </div>`;
  }

  // ------------------------------------------------------------ performance
  function viewPerformance(el) {
    el.innerHTML = '<div id="live"></div><div id="manusReport" style="margin-top:16px"></div>';
    liveInto(document.getElementById('live'), 'full');
    manusReport(document.getElementById('manusReport'));
  }
  function manusReport(el) {
    const s = S.data.summary, rep = s.report, set = S.data.settings, g = s.guardrails;
    if (!rep) { el.innerHTML = ''; return; }
    const cplOf = (a) => (a.leads ? a.spendEgp / a.leads : null);
    el.innerHTML = `<div class="stack" style="gap:16px"><h2 style="margin:8px 0 0">Manus Friday report</h2>
      ${g.alerts.length ? `<section class="panel"><div class="panel-h"><h2>Guardrails</h2><span class="small muted">Breaches need the owner’s approval before Manus acts</span></div><div class="alerts">${g.alerts.map(alertRow).join('')}</div></section>` : ''}
      <section class="panel"><div class="panel-h"><h2>Report ${esc(rep.month)}</h2><span class="small muted">As of ${esc(rep.asOf)} · received ${ago(rep.received_at)}</span></div>
        <div class="grid g5">${[['Spend MTD', n0(rep.spendMtdEgp) + ' EGP'], ['Blended CPL', rep.leads ? n0(rep.spendMtdEgp / rep.leads) + ' EGP' : '—'], ['CTR', pct(rep.ctr, 2)], ['CPM', rep.cpm ? n0(rep.cpm) + ' EGP' : '—'], ['Frequency', rep.frequency || '—'], ['Reach', n0(rep.reach)], ['Impressions', n0(rep.impressions)], ['Video views', n0(rep.videoViews)], ['ThruPlay rate', pct(rep.thruPlayRate, 1)], ['Page likes', n0(rep.pageLikes)]].map(([l, v]) => `<div class="kpi"><span class="label">${l}</span><span class="v">${v}</span></div>`).join('')}</div></section>
      <section class="panel"><div class="panel-h"><h2>Ad sets</h2><span class="small muted">Max CPL ${set.maxCplEgp} EGP · target ≤ ${set.targetCplEgp} EGP</span></div><div class="table-wrap"><table>
        <thead><tr><th>Ad set</th><th class="r">Spend</th><th class="r">Leads</th><th class="r">CPL</th><th>Last days CPL</th><th>Status</th></tr></thead>
        <tbody>${(rep.adsets || []).map((a) => { const c = cplOf(a), flag = (g.flagged || []).includes(a.name); const lead = !a.objective || a.objective === 'leads';
          return `<tr><td>${esc(a.name)}</td><td class="r num">${n0(a.spendEgp)}</td><td class="r num">${n0(a.leads)}</td><td class="r num" style="color:${lead && c > set.maxCplEgp ? 'var(--bad)' : lead && c > set.targetCplEgp ? 'var(--warn)' : 'inherit'}">${lead ? n0(c) : '—'}</td><td class="num small">${(a.cplHistory || []).map((h) => `<span style="color:${h.cpl > set.maxCplEgp ? 'var(--bad)' : 'inherit'}">${n0(h.cpl)}</span>`).join(' · ') || '—'}</td><td>${!lead ? `<span class="pill plain">${esc(a.objective)}</span>` : flag ? `<span class="pill bad">CPL breach</span> ${isOwner() ? `<button class="btn sm" data-pause="${esc(a.name)}">Propose pause</button>` : ''}` : c > set.targetCplEgp ? '<span class="pill warn">Above target</span>' : '<span class="pill ok">Healthy</span>'}</td></tr>`; }).join('')}</tbody></table></div></section>
      <div class="grid g2"><section class="panel"><h3 style="margin-bottom:8px">Top creatives</h3>${list(rep.topCreatives)}</section><section class="panel"><h3 style="margin-bottom:8px">Bottom creatives</h3>${list(rep.bottomCreatives)}</section></div>
    </div>`;
  }
  // ------------------------------------------------------------ live Meta + CRM (read-only)
  const egp = (v) => (v === null || v === undefined || isNaN(v) ? '—' : n0(v) + ' EGP');
  const kpi = (l, v, t) => `<div class="kpi"><span class="label">${l}</span><span class="v">${v}</span>${t ? `<span class="t">${t}</span>` : ''}</div>`;
  async function loadLive(refresh) {
    if (S.mode === 'demo') return null;
    if (!refresh && S.live && Date.now() - S.liveAt < 5 * 60 * 1000) return S.live;
    S.live = await api.req('GET', 'live' + (refresh ? '?refresh=1' : '')); S.liveAt = Date.now();
    return S.live;
  }
  async function liveInto(el, mode, refresh) {
    if (S.mode === 'demo') { el.innerHTML = '<div class="empty">Live Meta and CRM data shows on elevay.vip/admin.</div>'; return; }
    if (!S.live || refresh) el.innerHTML = '<div class="empty">Loading Meta and CRM data…</div>';
    try { const d = await loadLive(refresh); if (el.isConnected) el.innerHTML = mode === 'strip' ? liveStrip(d) : mode === 'analysis' ? liveAnalysis(d) : liveFull(d); }
    catch (e) { el.innerHTML = `<div class="empty">Could not load live data: ${esc(e.message)}</div>`; return; }
    const rb = el.querySelector('[data-live-refresh]');
    if (rb) rb.onclick = () => liveInto(el, mode, true);
    const rp = el.querySelector('[data-replan]');
    if (rp) rp.onclick = () => act(() => api.replan((el.querySelector('#replanNote') || {}).value || ''), 'Sent to Manus. The revised plan will come back here for approval.');
  }
  function liveErrors(d) {
    const e = d.errors || {}, names = { ads: 'Meta ads', page: 'Facebook Page', crm: 'CRM (30 days)', crm6: 'CRM (6 months)' };
    const k = Object.keys(e);
    const al = (d.alerts || []).map((a) => `<div class="alert ${a.level === 'critical' ? 'critical' : ''}"><span class="tag">${a.level === 'critical' ? 'Critical' : 'Check'}</span><span>${esc(a.text)}</span></div>`);
    const er = k.map((x) => `<div class="alert"><strong>${names[x] || x}:</strong> ${esc(e[x])}</div>`);
    return al.length || er.length ? `<div class="alerts" style="margin-bottom:12px">${al.concat(er).join('')}</div>` : '';
  }
  function liveHead(d, title) {
    return `<div class="panel-h"><h2>${title}</h2><span class="row small muted">${esc(d.window.since)} → ${esc(d.window.until)} · updated ${ago(d.generatedAt)} ${canEdit() ? '<button class="btn sm" data-live-refresh>Refresh</button>' : ''}</span></div>`;
  }
  function liveStrip(d) {
    const a = d.ads && d.ads.total, c = d.crm && d.crm.meta, p = d.page;
    return `<section class="panel">${liveHead(d, 'Last 30 days (live)')}${liveErrors(d)}<div class="grid g5">
      ${kpi('Ad spend', egp(a && a.spend), a && a.leads ? 'CPL ' + egp(a.spend / a.leads) : '')}
      ${kpi('Meta leads', n0(c && c.leads), a ? n0(a.leads) + ' reported by Meta' : '')}
      ${kpi('Qualified', n0(c && c.qualified), (c ? n0(c.unqualified) : '—') + ' unqualified')}
      ${kpi('Clients', n0(c && c.clients), '')}
      ${kpi('New page likes', n0(p && p.newLikes && p.newLikes.total), p && p.views && p.views.total !== null ? n0(p.views.total) + ' page views' : '')}
    </div><p class="small muted" style="margin-top:10px">Meta-sourced leads in the CRM. <a href="#performance" data-go="performance">Full report</a></p></section>`;
  }
  function liveFull(d) {
    const a = d.ads, t = a && a.total, crm = d.crm, p = d.page, set = S.data.settings;
    const funnelRow = (label, b) => b ? `<tr><td>${label}</td><td class="r num">${n0(b.leads)}</td><td class="r num">${n0(b.qualified)}</td><td class="r num">${n0(b.unqualified)}</td><td class="r num">${n0(b.clients)}</td><td class="r num">${b.leads ? pct(b.cohort.qualifiedOrBetter / b.leads, 1) : '—'}</td><td class="r num">${n0(b.cohort.open)}</td></tr>` : '';
    const reasons = crm && crm.all.unqualifiedReasons, rk = reasons ? Object.keys(reasons) : [];
    const pv = (m) => (m && m.total !== null && m.total !== undefined ? n0(m.total) : '—');
    const pvNote = (m) => (m && m.metric ? `<span class="t">${esc(m.metric)}</span>` : m && m.error ? `<span class="t" style="color:var(--warn)">Not available: ${esc(String(m.error).split(' | ')[0].replace(/^[^:]+: /, '').slice(0, 160))}</span>` : '');
    const ig = p && p.instagram;
    return `<div class="stack" style="gap:16px">
      <section class="panel">${liveHead(d, 'Meta ads, last 30 days')}${liveErrors(d)}
        ${t ? `<div class="grid g5">${[
          kpi('Spend', egp(t.spend), a.account && a.account.currency !== 'EGP' ? 'Account currency ' + esc(a.account.currency) : ''),
          kpi('Meta leads', n0(t.leads), t.leadCampaignCpl ? 'CPL ' + egp(t.leadCampaignCpl) + ' on lead campaigns' : t.leads ? 'CPL ' + egp(t.cpl) : ''),
          kpi('Reach', n0(t.reach), 'Frequency ' + (t.frequency ? t.frequency.toFixed(2) : '—')),
          kpi('Impressions', n0(t.impressions), 'CPM ' + egp(t.cpm)),
          kpi('Clicks', n0(t.clicks), 'CTR ' + pct(t.ctr, 2)),
          kpi('Video views (3s)', n0(t.videoViews), 'ThruPlays ' + n0(t.thruplays)),
          kpi('Page likes from ads', n0(t.pageLikes), ''),
          kpi('Messages started', n0(t.messages), ''),
          kpi('Cost per qualified', crm && crm.meta.qualified ? egp(t.spend / crm.meta.qualified) : '—', 'Spend ÷ Meta leads qualified'),
          kpi('Cost per client', crm && crm.meta.clients ? egp(t.spend / crm.meta.clients) : '—', ''),
        ].join('')}</div>` : '<div class="empty">No ad data.</div>'}
      </section>
      <section class="panel"><div class="panel-h"><h2>CRM funnel, last 30 days</h2><span class="small muted">From the ELEVAY CRM stage history</span></div>
        ${crm ? `<div class="table-wrap"><table><thead><tr><th>Source</th><th class="r">New leads</th><th class="r">Moved to qualified</th><th class="r">Moved to unqualified</th><th class="r">New clients</th><th class="r">Qualified rate*</th><th class="r">Still open*</th></tr></thead>
          <tbody>${funnelRow('From Meta', crm.meta)}${funnelRow('All sources', crm.all)}</tbody></table></div>
          ${rk.length ? `<p class="small" style="margin-top:10px"><strong>Unqualified reasons:</strong> ${rk.map((k) => `${esc(k)} ${n0(reasons[k])}`).join(' · ')}</p>` : ''}
          <p class="small muted" style="margin-top:6px">*Of the leads created in these 30 days, where they stand today (qualified, prospect or client; still fresh or contacted).</p>` : '<div class="empty">CRM data unavailable.</div>'}
      </section>
      <section class="panel"><div class="panel-h"><h2>Page growth, last 30 days</h2><span class="small muted">${p ? esc(p.name || '') + ' · ' + n0(p.likesTotal) + ' total likes · ' + n0(p.followersTotal) + ' followers' : ''}</span></div>
        ${p ? `<div class="grid g5">
          <div class="kpi"><span class="label">Page views</span><span class="v">${pv(p.views)}</span>${pvNote(p.views)}</div>
          <div class="kpi"><span class="label">New page likes / follows</span><span class="v">${pv(p.newLikes)}</span>${pvNote(p.newLikes)}</div>
          <div class="kpi"><span class="label">Unfollows</span><span class="v">${pv(p.unlikes)}</span>${pvNote(p.unlikes)}</div>
          <div class="kpi"><span class="label">Net new</span><span class="v">${p.newLikes && p.newLikes.total !== null ? n0(p.newLikes.total - ((p.unlikes && p.unlikes.total) || 0)) : '—'}</span></div>
          <div class="kpi"><span class="label">Page video views</span><span class="v">${pv(p.videoViews)}</span>${pvNote(p.videoViews)}</div>
          ${ig ? `<div class="kpi"><span class="label">Instagram views · @${esc(ig.username || '')}</span><span class="v">${pv(ig.views)}</span>${pvNote(ig.views)}</div><div class="kpi"><span class="label">Instagram new followers · ${n0(ig.followers)} total</span><span class="v">${pv(ig.newFollowers)}</span>${pvNote(ig.newFollowers)}</div>` : ''}
        </div>` : '<div class="empty">Page data unavailable.</div>'}
      </section>
      ${a && a.campaigns.length ? `<section class="panel"><div class="panel-h"><h2>Campaigns, last 30 days</h2><span class="small muted">Meta results joined with CRM outcomes · max CPL ${set.maxCplEgp} EGP</span></div><div class="table-wrap"><table>
        <thead><tr><th>Campaign</th><th>Status</th><th class="r">Spend</th><th class="r">Meta leads</th><th class="r">CPL</th><th class="r">CRM leads</th><th class="r">Qualified</th><th class="r">Unqualified</th><th class="r">Clients</th><th class="r">Cost / qualified</th></tr></thead>
        <tbody>${a.campaigns.map((c) => `<tr><td>${esc(c.campaign)}<div class="small muted">${esc(c.objective || '')}</div></td><td class="small">${esc(c.status || '')}</td><td class="r num">${n0(c.spend)}</td><td class="r num">${n0(c.leads)}</td><td class="r num" style="color:${c.cpl > set.maxCplEgp ? 'var(--bad)' : c.cpl > set.targetCplEgp ? 'var(--warn)' : 'inherit'}">${c.cpl ? n0(c.cpl) : '—'}</td><td class="r num">${n0(c.crmLeads)}</td><td class="r num">${n0(c.qualified)}</td><td class="r num">${n0(c.unqualified)}</td><td class="r num">${n0(c.clients)}</td><td class="r num">${c.costPerQualified ? n0(c.costPerQualified) : '—'}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${a ? `<div class="grid g2"><section class="panel"><h3 style="margin-bottom:8px">Best ads by CPL</h3>${adList(a.topAds)}</section><section class="panel"><h3 style="margin-bottom:8px">Weakest ads (500+ EGP spent)</h3>${adList(a.bottomAds)}</section></div>` : ''}
      ${liveAnalysis(d, true)}
      <details class="small muted"><summary>How these numbers are counted</summary><ul>${Object.entries(d.definitions || {}).map(([k, v]) => `<li><strong>${esc(k)}</strong>: ${esc(v)}</li>`).join('')}</ul></details>
    </div>`;
  }
  const adList = (arr) => (arr && arr.length ? `<ol class="small" style="margin:0;padding-left:18px">${arr.map((x) => `<li>${esc(x.ad)} <span class="muted">· ${esc(x.campaign || '')} · ${n0(x.spend)} EGP · ${n0(x.leads)} leads · CPL ${x.cpl ? n0(x.cpl) : '—'}</span></li>`).join('')}</ol>` : '<p class="small muted">None.</p>');
  function liveAnalysis(d, embedded) {
    const an = d.analysis;
    if (!an) return embedded ? '' : `<section class="panel">${liveErrors(d)}<div class="empty">The 6-month analysis is not available yet.</div></section>`;
    const REC = { scale: ['ok', 'Scale'], reduce: ['bad', 'Reduce / pause'], fix_quality: ['warn', 'Fix lead quality'] };
    return `<section class="panel"><div class="panel-h"><h2>6-month analysis for the plan</h2><span class="small muted">${esc(d.sixMonths.since)} → ${esc(d.sixMonths.until)}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Month</th><th class="r">Spend</th><th class="r">Meta leads</th><th class="r">CPL</th><th class="r">CRM leads</th><th class="r">Qualified</th><th class="r">Qualified rate</th><th class="r">Clients</th><th class="r">Cost / qualified</th></tr></thead>
      <tbody>${an.byMonth.map((m) => `<tr><td>${esc(m.month)}${m.partial ? ' <span class="small muted">(so far)</span>' : ''}</td><td class="r num">${n0(m.spend)}</td><td class="r num">${n0(m.metaLeads)}</td><td class="r num">${m.cpl ? n0(m.cpl) : '—'}</td><td class="r num">${n0(m.crmLeads)}</td><td class="r num">${n0(m.qualified)}</td><td class="r num">${pct(m.qualifiedRate, 1)}</td><td class="r num">${n0(m.clients)}</td><td class="r num">${m.costPerQualified ? n0(m.costPerQualified) : '—'}</td></tr>`).join('')}</tbody></table></div>
      ${an.findings.length ? `<h3 style="margin:14px 0 6px">What the data says</h3><ul class="small">${an.findings.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>` : ''}
      ${an.recommendations.length ? `<h3 style="margin:14px 0 6px">Suggested campaign changes</h3><ul class="small" style="list-style:none;padding:0">${an.recommendations.map((r) => { const [c, l] = REC[r.type] || ['', r.type]; return `<li style="margin-bottom:6px"><span class="pill ${c}">${l}</span> <strong>${esc(r.campaign || r.campaignId)}</strong> — ${esc(r.why)}</li>`; }).join('')}</ul>` : ''}
      ${an.budgetSplit.length ? `<h3 style="margin:14px 0 6px">Suggested budget split (within the cap)</h3><div class="table-wrap"><table><thead><tr><th>Campaign</th><th class="r">Share</th><th class="r">Monthly EGP</th></tr></thead><tbody>${an.budgetSplit.map((b) => `<tr><td>${esc(b.campaign || b.campaignId)}</td><td class="r num">${pct(b.shareOfCap)}</td><td class="r num">${n0(b.monthlyEgp)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="small muted" style="margin-top:8px">${esc(an.note)}</p>
      ${canEdit() ? `<div class="row" style="margin-top:12px"><input class="input" id="replanNote" placeholder="Optional note for Manus" style="max-width:420px"><button class="btn primary" data-replan>Ask Manus to update the plan from this data</button></div>` : ''}
    </section>`;
  }
  const list = (arr) => (arr && arr.length ? `<ol class="small" style="margin:0;padding-left:18px">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="small muted">Not reported.</p>');

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pause]');
    if (b) act(() => api.proposePause(b.dataset.pause), 'Pause proposal added to the action plan for approval.');
  });

  // ------------------------------------------------------------ news
  function viewNews(el) {
    const news = S.data.news;
    if (!news.length) { el.innerHTML = '<div class="empty">Manus starts the deep news search every Thursday at 20:00 Cairo.</div>'; return; }
    el.innerHTML = `<section class="panel"><div class="table-wrap"><table><thead><tr><th>Use</th><th>Headline</th><th>Country / program</th><th>Effective</th><th>Confidence</th><th>Marketing angle</th></tr></thead><tbody>
      ${news.map((n) => `<tr><td><input type="checkbox" data-news="${n.id}" ${n.selected ? 'checked' : ''} ${!canEdit() || n.confidence === 'unconfirmed' ? 'disabled' : ''} aria-label="Use this item"></td>
        <td><strong>${esc(n.headline)}</strong><div class="small muted">${esc(n.what_changed || '')}</div>${n.source_url ? `<a class="small" href="${esc(n.source_url)}" target="_blank" rel="noopener">Source</a>` : ''}</td>
        <td class="small">${esc(n.country || '')}<br>${esc(n.program || '')}</td><td class="small num">${esc(n.effective_date || '—')}</td><td>${confPill(n.confidence)}</td><td class="small">${esc(n.marketing_angle || '')}</td></tr>`).join('')}
    </tbody></table></div><p class="small muted" style="margin-top:10px">Unconfirmed items cannot be selected. Every figure needs an official source before it appears in a post.</p></section>`;
    el.querySelectorAll('[data-news]').forEach((cb) => (cb.onchange = () => act(() => api.selectNews(cb.dataset.news, cb.checked))));
  }

  // ------------------------------------------------------------ monthly plan
  function viewMonthly(el) {
    const plans = S.data.plans;
    el.innerHTML = '<div id="liveAnalysis" style="margin-bottom:16px"></div><div id="plans"></div>';
    liveInto(document.getElementById('liveAnalysis'), 'analysis');
    el = document.getElementById('plans');
    if (!plans.length) { el.innerHTML = '<div class="empty">Manus delivers next month’s plan in the last week of each month.</div>'; return; }
    el.innerHTML = `<div class="cards">${plans.map((p) => `<section class="panel"><div class="panel-h"><div><span class="small muted">${esc(p.id)} · ${esc(p.month)}</span><h2>${esc(p.title || 'Marketing plan ' + p.month)}</h2></div>${statusPill(p.status === 'pending_approval' ? 'pending_approval' : p.status === 'approved' ? 'approved' : 'changes_requested')}</div>
      <div style="white-space:pre-wrap;max-width:75ch">${esc(p.body)}</div>
      ${p.url ? `<p style="margin-top:8px"><a href="${esc(p.url)}" target="_blank" rel="noopener">Open the full plan</a></p>` : ''}
      ${(p.comments || []).map((c) => `<div class="comment change_request" style="margin-top:8px"><span class="small muted">${fmtDT(c.at)} · ${esc(c.by)}</span><div>${esc(c.text)}</div></div>`).join('')}
      ${p.status === 'pending_approval' && isOwner() ? `<div class="row" style="margin-top:12px"><button class="btn primary" data-plan="approve" data-id="${p.id}">Approve plan</button><input class="input" id="pc-${p.id}" placeholder="What should change?" style="max-width:360px"><button class="btn" data-plan="changes" data-id="${p.id}">Request changes</button></div>` : ''}
    </section>`).join('')}</div>`;
    el.querySelectorAll('[data-plan]').forEach((b) => (b.onclick = () => {
      const comment = (document.getElementById('pc-' + b.dataset.id) || {}).value || '';
      if (b.dataset.plan === 'changes' && !comment.trim()) return toast('Write what should change.', true);
      act(() => api.decidePlan(b.dataset.id, { decision: b.dataset.plan === 'approve' ? 'approve' : 'changes', comment }), b.dataset.plan === 'approve' ? 'Plan approved.' : 'Sent to Manus for revision.');
    }));
  }

  // ------------------------------------------------------------ AI Studio
  const PROV = { claude: ['Claude', '#C9A84C'], openai: ['OpenAI', '#5BA3B8'], higgsfield: ['Higgsfield', '#7a6fb0'], manus: ['Manus', '#2f8a74'], system: ['ELEVAY rules', '#5E6A71'], studio: ['Studio', '#5E6A71'], team: ['Team', '#1A3A5C'] };
  const provChip = (p) => { const [l, c] = PROV[p] || [p, '#5E6A71']; return `<span class="pchip" style="--c:${c}">${esc(l)}</span>`; };
  const RUN_PILL = { queued: ['info', 'Queued'], running: ['info', 'Working'], waiting: ['info', 'Waiting on provider'], awaiting_approval: ['warn', 'Needs approval'], done: ['ok', 'Done'], failed: ['bad', 'Failed'], cancelled: ['', 'Cancelled'] };
  const STEP_ICON = { pending: '○', running: '◐', waiting: '◔', needs_approval: '!', done: '●', failed: '✕', skipped: '–' };
  let studioTimer = null;
  async function loadStudio() {
    const [p, r, ap] = await Promise.all([S.studio && S.studio.providers ? Promise.resolve(S.studio) : api.req('GET', 'ai/providers'), api.req('GET', 'ai/runs'), api.req('GET', 'ai/autopilot')]);
    S.studio = { providers: p.providers, pipelines: p.pipelines, sources: p.sources, runs: r.runs, autopilot: ap };
    return S.studio;
  }
  function viewStudio(el) {
    if (S.mode === 'demo') { el.innerHTML = '<div class="empty">AI Studio runs on elevay.vip/admin.</div>'; return; }
    el.innerHTML = '<div class="empty">Loading AI Studio…</div>';
    loadStudio().then(() => { if (el.isConnected) drawStudio(el); }).catch((e) => { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
    clearInterval(studioTimer);
    studioTimer = setInterval(async () => {
      if (S.view !== 'studio' || !el.isConnected) return clearInterval(studioTimer);
      if (document.hidden || (document.activeElement && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName))) return;
      if (!S.studio || !S.studio.runs.some((r) => ['queued', 'running', 'waiting'].includes(r.status))) return;
      try { await loadStudio(); drawStudio(el); } catch { /* keep last */ }
    }, 6000);
  }
  function drawStudio(el) {
    const st = S.studio, pv = st.providers;
    const open = new Set([...el.querySelectorAll('details[data-run][open]')].map((d) => d.dataset.run));
    el.innerHTML = `<div class="stack" style="gap:16px">
      <section class="panel"><div class="panel-h"><h2>Connected models</h2>${isOwner() ? '<button class="btn sm" id="provTest">Test connections</button>' : ''}</div>
        <div class="grid g4">${['claude', 'openai', 'higgsfield', 'manus'].map((k) => { const p = pv[k]; return `<div class="kpi">${provChip(k)}<span class="small">${esc(p.role)}</span><span class="t">${p.ready ? '<span class="pill ok">Connected</span>' : `<span class="pill bad">Not set up</span> ${p.key ? esc(p.key) + ' missing' : ''}`}${k === 'manus' && p.lastSeen ? ' · seen ' + ago(p.lastSeen) : ''}${p.model ? ' · ' + esc(p.model) : ''}</span><span class="t" id="pt-${k}"></span></div>`; }).join('')}</div></section>
      ${autopilotPanel(st.autopilot)}
      ${st.sources ? `<section class="panel"><div class="panel-h"><h2>Approved sources the models use</h2></div><div class="row small" style="gap:8px;flex-wrap:wrap">${st.sources.programs.map((x) => `<span class="pill ${x.loaded ? 'ok' : 'bad'}">${esc(x.name)}</span>`).join('')}${st.sources.creative.map((x) => `<span class="pill ${x.loaded ? 'ok' : 'bad'}">Creative direction: ${esc(x.name.replace(/-/g, ' '))}</span>`).join('')}<span class="pill ${st.sources.logo ? 'ok' : 'bad'}">Official logo</span><span class="pill ${st.sources.font ? 'ok' : 'bad'}">Apex Sans font</span></div><p class="small muted" style="margin:8px 0 0">Program figures come only from these approved sources; other programs are described without numbers until their sources are added.</p></section>` : ''}
      ${canEdit() ? `<section class="panel"><div class="panel-h"><h2>Extra request</h2><span class="small muted">Claude plans the work and hands each part to the right model</span></div>
        <div class="stack" style="gap:10px">
          <div class="row"><select class="input" id="stKind" style="max-width:260px">${[['request', 'Let Claude decide'], ['static', 'Static post (OpenAI)'], ['reel', 'Reel (OpenAI + Higgsfield)'], ['plan', 'Monthly plan from data'], ['manus', 'Meta / Manus task'], ['answer', 'Question about our data']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
            <input class="input" id="stProgram" placeholder="Program (optional), e.g. Spain DNV" style="max-width:260px"></div>
          <textarea class="input" id="stReq" rows="3" placeholder="e.g. A reel for Portugal D7 aimed at retired Egyptian couples, calm Lisbon lifestyle"></textarea>
          <div class="row"><button class="btn primary" id="stGo">Start</button><span class="small muted" id="stFlow"></span></div>
        </div></section>` : ''}
      <section class="panel"><div class="panel-h"><h2>Runs</h2><span class="small muted">${st.runs.length} recent</span></div>
        ${st.runs.length ? `<div class="stack" style="gap:10px">${st.runs.map((r) => runCard(r, open.has(String(r.id)))).join('')}</div>` : '<div class="empty">No runs yet.</div>'}
      </section></div>`;
    const kind = el.querySelector('#stKind');
    const flow = () => { const p = st.pipelines[kind.value]; el.querySelector('#stFlow').innerHTML = p ? p.steps.map((x) => provChip(x.provider) + (x.gate ? '<span class="small muted">(approval)</span>' : '')).join(' → ') : ''; };
    if (kind) { kind.onchange = flow; flow(); }
    const go = el.querySelector('#stGo');
    if (go) go.onclick = () => act(async () => {
      const request = el.querySelector('#stReq').value.trim();
      if (!request && kind.value !== 'plan') throw new Error('Describe what you need.');
      await api.req('POST', 'ai/runs', { kind: kind.value, request, program: el.querySelector('#stProgram').value.trim() });
      await loadStudio();
    }, 'Started. Follow it in Runs.');
    const pt = el.querySelector('#provTest');
    if (pt) pt.onclick = () => act(async () => { const r = await api.req('POST', 'ai/providers/test'); for (const [k, v] of Object.entries(r.results)) { const n = document.getElementById('pt-' + k); if (n) n.innerHTML = `${v.ok ? '✓' : '✕'} ${esc(v.detail)}`; } });
    el.querySelectorAll('[data-autoplan]').forEach((b) => (b.onclick = () => act(async () => {
      const k = b.dataset.autoplan;
      await api.req('POST', k === 'monthly' ? 'ai/autoplan/monthly' : 'ai/autoplan/weekly', k === 'monthly' ? { again: true } : { which: k });
      await loadStudio();
    }, 'Started. Claude is planning; production starts automatically.')));
    const aps = el.querySelector('#apSave');
    if (aps) aps.onclick = () => act(async () => {
      await api.saveSettings({ studio: { autoplan: el.querySelector('#apAuto').checked, reelLimitPerWeek: Number(el.querySelector('#apReels').value) } });
      S.studio.autopilot = await api.req('GET', 'ai/autopilot');
    }, 'Autopilot settings saved.');
    el.querySelectorAll('[data-run-act]').forEach((b) => (b.onclick = () => {
      const [a, id, n] = b.dataset.runAct.split(':');
      if (a === 'approve' && b.dataset.cost && !confirm(b.dataset.cost)) return;
      act(async () => { await api.req('POST', a === 'approve' ? `ai/runs/${id}/steps/${n}/approve` : `ai/runs/${id}/${a}`); await loadStudio(); }, a === 'approve' ? 'Approved. The models continue.' : a === 'retry' ? 'Retrying.' : 'Cancelled.');
    }));
    el.querySelectorAll('[data-goview]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); go(b.dataset.goview); }));
  }
  function autopilotPanel(ap) {
    if (!ap) return '';
    const a = ap.approval, on = ap.autopublish && ap.autopublish.enabled, killed = ap.autopublish && ap.autopublish.disabledAt && !on;
    const status = on
      ? `<span class="pill ok">Automatic</span> Higgsfield clips, Meta tasks, approved posts and monthly plans run without waiting. Any rejection, compliance flag or a rolling rate below 85% switches back to manual.`
      : killed
        ? `<span class="pill bad">Back to manual</span> ${esc(ap.autopublish.disabledReason || '')}. The owner can switch it on again in Settings.`
        : `<span class="pill warn">Learning phase</span> Week ${Math.min(a.weeksDone, a.manualWeeks)} of ${a.manualWeeks} · first-pass approval ${pct(a.cumulative)} (needs ${pct(a.threshold)}). Until then the owner approves Higgsfield clips, Meta changes, posts and plans. It switches to automatic by itself when the gate is reached.`;
    return `<section class="panel"><div class="panel-h"><h2>Autopilot</h2><span class="small muted">${ap.studio.autoplan ? 'Plans itself every Saturday 09:00 Cairo (next week) and from the 25th (next month)' : 'Automatic planning is paused'}</span></div>
      <p style="margin:0 0 10px">${status}</p>
      <p class="small muted" style="margin:0 0 12px">OpenAI designs never wait for approval. Requests from Manus run automatically. Higgsfield is limited to ${ap.studio.reelLimitPerWeek} reels per 7 days; Meta work stays inside the 200,000 EGP cap and 100 EGP max CPL.</p>
      ${canEdit() ? `<div class="row"><button class="btn primary" data-autoplan="this">Plan this week now</button><button class="btn" data-autoplan="next">Plan next week now</button><button class="btn" data-autoplan="monthly">Draft next month's plan now</button></div>` : ''}
      ${isOwner() ? `<div class="row small" style="margin-top:12px"><label class="row"><input type="checkbox" id="apAuto" ${ap.studio.autoplan ? 'checked' : ''}> Plan automatically</label><label class="row">Reel limit per 7 days <input class="input" id="apReels" type="number" min="0" max="30" value="${ap.studio.reelLimitPerWeek}" style="width:70px"></label><button class="btn sm" id="apSave">Save</button></div>` : ''}
    </section>`;
  }
  const COST = { higgsfield: 'This submits 4 paid Higgsfield Pro clips. Continue?', manus: 'Manus will act on Meta with these instructions. Continue?' };
  function runCard(r, isOpen) {
    const [pc, pl] = RUN_PILL[r.status] || ['', r.status];
    const A = r.artifacts || {};
    const steps = r.steps.map((s) => `<li class="step ${s.status}"><span class="ico">${STEP_ICON[s.status] || '○'}</span>${provChip(s.provider)} <span>${esc(s.title)}</span>
      ${s.status === 'needs_approval' ? ((s.gate === 'owner' && !isOwner()) || !canEdit() ? `<span class="pill warn">Waiting for ${s.gate === 'owner' ? 'owner' : 'approval'}</span>` : `<button class="btn sm primary" data-run-act="approve:${r.id}:${s.n}" data-cost="${esc(COST[s.provider] || '')}">Approve</button>`) : ''}
      ${s.error ? `<div class="small" style="color:var(--bad)">${esc(s.error)}</div>` : ''}${s.approved_by ? `<span class="small muted"> · approved by ${esc(s.approved_by)}</span>` : ''}</li>`).join('');
    const imgs = (A.images || []).map((i) => i.url).concat(A.keyframes ? A.keyframes.map((k) => k.url) : []);
    const clips = (A.clips || []).filter((c) => c.url);
    const brief = A.brief;
    return `<details class="run" data-run="${r.id}" ${isOpen || ['awaiting_approval', 'failed'].includes(r.status) ? 'open' : ''}><summary><span class="pill ${pc}">${pl}</span> <strong>${esc(r.title)}</strong> <span class="small muted">· ${esc((S.studio.pipelines[r.kind] || {}).label || r.kind)} · #${r.id} · ${esc(r.created_by)} · ${ago(r.created_at)}</span></summary>
      <div class="run-body"><ol class="steps">${steps}</ol>
        ${A.answer ? `<div class="answer">${esc(A.answer)}</div>` : ''}
        ${A.qc && A.qc.pass === false ? `<div class="alert"><span class="tag">Claude QC</span><span>${esc((A.qc.issues || []).join(' · '))}</span></div>` : A.qc ? '<div class="small" style="color:var(--ok)">Claude visual check passed.</div>' : ''}
        ${brief ? `<div class="grid g2" style="margin-top:8px"><div><div class="small muted">Caption (Arabic)</div><div dir="rtl" class="small" style="white-space:pre-wrap">${esc(brief.caption_ar || '')}</div></div><div>${brief.design ? `<div class="small muted">Design text</div><div>${esc(brief.design.headline_en || '')}</div>` : ''}${brief.reel ? `<div class="small muted">Voice-over (Egyptian Arabic)</div><ol class="small" dir="rtl">${brief.reel.storyboard.map((c) => `<li>${esc(c.spoken_text_ar || '')}</li>`).join('')}</ol>` : ''}</div></div>` : ''}
        ${imgs.length ? `<div class="thumbs">${imgs.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Generated design" loading="lazy"></a>`).join('')}</div>` : ''}
        ${clips.length ? `<div class="thumbs">${clips.map((c) => `<video src="${esc(c.url)}" controls playsinline preload="metadata"></video>`).join('')}</div>` : ''}
        ${A.item_id ? `<p class="small">In the weekly plan as <a href="#plan" data-goview="plan">${esc(A.item_id)}</a>.</p>` : ''}
        ${A.plan ? '<p class="small">Plan sent to the <a href="#monthly" data-goview="monthly">Monthly plan</a> tab.</p>' : ''}
        <details class="small"><summary>Conversation between the models (${(r.messages || []).length})</summary><ul class="msgs">${(r.messages || []).map((m) => `<li><span class="muted">${fmtDT(m.at)}</span> ${provChip(m.from)} → ${provChip(m.to)}<pre>${esc(m.text)}</pre></li>`).join('')}</ul></details>
        ${canEdit() ? `<div class="row" style="margin-top:8px">${r.status === 'failed' ? `<button class="btn sm" data-run-act="retry:${r.id}">Retry failed step</button>` : ''}${!['done', 'failed', 'cancelled'].includes(r.status) ? `<button class="btn ghost sm" data-run-act="cancel:${r.id}">Cancel</button>` : ''}</div>` : ''}
      </div></details>`;
  }
  // ------------------------------------------------------------ manus bridge
  function viewManus(el) {
    const m = S.data.manus, jobs = S.data.jobs;
    const filters = { open: ['pending', 'sent', 'in_progress', 'needs_input'], needs_input: ['needs_input'], done: ['done'], failed: ['failed'], all: null };
    const shown = jobs.filter((j) => !filters[S.jobFilter] || filters[S.jobFilter].includes(j.status));
    const base = (m.publicUrl || location.origin).replace(/\/$/, '');
    el.innerHTML = `<div class="stack" style="gap:16px">
      <section class="panel"><div class="panel-h"><h2>How work flows</h2><span class="small muted">Manus is the only system that touches Meta and the creative tools</span></div>
        <div class="flow"><div class="node"><strong>Team</strong><span class="small muted">approves here</span></div><div class="node"><strong>Command Center</strong><span class="small muted">jobs + data contract</span></div><div class="node hub">Manus<span class="small" style="font-weight:400">orchestrator</span></div><div class="node"><strong>Claude · OpenAI · Higgsfield</strong><span class="small muted">copy, QC, design, video</span></div><div class="node"><strong>Meta · Elevay.vip</strong><span class="small muted">ads, publishing, voice</span></div></div></section>
      <div class="grid g2">
        <section class="panel"><div class="panel-h"><h2>Connection</h2></div><div class="conn">
          ${conn('Agent API (Manus → here)', m.agentApi, m.agentApi ? `Last call from Manus: ${ago(m.lastAgentSeen)}` : 'Not configured on the server')}
          ${conn('Task push (here → Manus API)', m.push, m.push ? 'Each new job starts a Manus task' : 'Optional. Add a MANUS_API_KEY secret, or let Manus pull jobs every 15 minutes')}
          ${conn('Webhook (Manus task updates)', m.webhook, m.webhook ? `Last event: ${ago(m.lastWebhookAt)}` : 'Not configured on the server')}
        </div></section>
        <section class="panel"><div class="panel-h"><h2>Endpoints for Manus</h2></div>
          <div class="code">Pull jobs   GET  ${esc(base)}/api/agent/jobs?status=pending
Briefs      POST ${esc(base)}/api/agent/briefs
Report      POST ${esc(base)}/api/agent/reports
Actions     POST ${esc(base)}/api/agent/actions
News        POST ${esc(base)}/api/agent/news
Webhook     POST ${esc(base)}/api/webhooks/manus?secret=…
Auth        Authorization: Bearer &lt;MANUS_AGENT_TOKEN&gt;</div>
          <p class="small muted" style="margin-top:8px">Full reference in AGENT_API.md. Keep tokens in Manus secrets, never in prompts.</p></section>
      </div>
      ${isOwner() && S.mode === 'server' ? `<section class="panel"><div class="panel-h"><h2>Credentials for Manus</h2><span class="small muted">Owner only. Save these in Manus secrets, never in prompts.</span></div><div id="creds"><button class="btn" id="showCreds">Show credentials</button></div></section>` : ''}
      ${canEdit() ? `<section class="panel"><div class="panel-h"><h2>Ask Manus</h2><span class="small muted">Creates a job Manus picks up</span></div><div class="row"><input class="input" id="newJob" placeholder="e.g. Prepare 3 hook options for the Greece post" style="flex:1;min-width:220px"><button class="btn primary" id="sendJob">Send to Manus</button></div></section>` : ''}
      <section class="panel"><div class="panel-h"><h2>Jobs</h2><div class="row">${Object.keys(filters).map((f) => `<button class="btn sm ${S.jobFilter === f ? 'primary' : ''}" data-jf="${f}">${({ open: 'Open', needs_input: 'Questions', done: 'Done', failed: 'Failed', all: 'All' })[f]}</button>`).join('')}</div></div>
        ${shown.length ? shown.map(jobRow).join('') : '<div class="empty">Nothing here.</div>'}</section>
    </div>`;
    el.querySelectorAll('[data-jf]').forEach((b) => (b.onclick = () => { S.jobFilter = b.dataset.jf; render(); }));
    const sc = document.getElementById('showCreds');
    if (sc) sc.onclick = () => loadCreds();
    const sj = document.getElementById('sendJob');
    if (sj) sj.onclick = () => { const v = document.getElementById('newJob').value.trim(); if (!v) return toast('Describe what Manus should do.', true); act(() => api.createJob(v), 'Sent to Manus.'); };
    el.querySelectorAll('[data-reply]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.reply, v = b.dataset.opt || (document.getElementById('rp-' + id) || {}).value || '';
      if (!v.trim()) return toast('Write a reply.', true);
      act(() => api.replyJob(id, v), 'Reply sent to Manus.');
    }));
    el.querySelectorAll('[data-retry]').forEach((b) => (b.onclick = () => act(() => api.retryJob(b.dataset.retry), 'Queued again.')));
    el.querySelectorAll('[data-open-item]').forEach((b) => (b.onclick = () => { const id = b.dataset.openItem; go('plan', { week: R.weekOf(id), openItem: id }); }));
  }
  async function loadCreds() {
    const box = document.getElementById('creds');
    try {
      const c = await api.req('GET', 'admin/integration');
      const row = (label, val, key) => `<div class="field"><span>${label}</span><div class="row"><code class="code" style="flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere">${esc(val)}</code><button class="btn sm" data-copy="${esc(val)}">Copy</button>${key ? `<button class="btn sm danger" data-rotate="${key}">Replace</button>` : ''}</div></div>`;
      box.innerHTML = `<div class="stack">${row('Agent API base URL', c.agentBase)}${row('Agent token (Manus secret ELEVAY_AGENT_TOKEN)', c.agentToken, 'agent')}${row('Webhook URL (Manus API → Webhooks)', c.webhookUrl, 'webhook')}
        <p class="small muted">Replacing a credential stops the old one immediately; update Manus right after.</p></div>`;
      box.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } catch { toast('Select the text and copy it manually.', true); } }));
      box.querySelectorAll('[data-rotate]').forEach((b) => (b.onclick = async () => {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Click again to replace'; return; }
        try { await api.req('POST', 'admin/rotate', { which: b.dataset.rotate }); toast('Replaced. Update Manus with the new value.'); loadCreds(); } catch (e) { toast(e.message, true); }
      }));
    } catch (e) { box.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; }
  }
  const conn = (l, on, sub) => `<div class="c"><div><strong>${l}</strong><div class="small muted">${esc(sub)}</div></div>${on ? '<span class="pill ok">On</span>' : '<span class="pill">Off</span>'}</div>`;
  function jobRow(j) {
    const p = j.payload || {};
    const summary = p.item_id ? `<button class="btn ghost sm" data-open-item="${esc(p.item_id)}">${esc(p.item_id)}</button>${p.scope ? ' · ' + esc(scopeLabel(p.scope)) + (p.clip ? ' ' + p.clip : '') : ''}` : esc(p.change || p.request || p.reason || '');
    const q = j.status === 'needs_input' && j.manus && j.manus.question;
    return `<div class="job"><div><div class="jid">${esc(j.id)}</div><div class="small muted">${ago(j.created_at)}</div></div>
      <div style="min-width:0"><div class="row"><strong>${esc(JOB_LABEL[j.type] || j.type)}</strong>${jobPill(j.status)}${j.manus && j.manus.task_url ? `<a class="small" href="${esc(j.manus.task_url)}" target="_blank" rel="noopener">Open in Manus</a>` : ''}</div>
        <div class="small" style="margin-top:4px">${summary}${p.comment ? ` — “${esc(p.comment)}”` : ''}</div>
        ${j.manus && j.manus.error ? `<div class="small" style="color:var(--bad);margin-top:4px">Push failed: ${esc(j.manus.error)}. Manus can still pull it.</div>` : ''}
        ${j.manus && j.manus.message ? `<pre>${esc(j.manus.message)}</pre>` : ''}
        ${j.result ? `<pre>${esc(JSON.stringify(j.result, null, 2))}</pre>` : ''}
        ${(j.manus && j.manus.attachments || []).map((a) => `<a class="small" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.file_name)}</a>`).join(' ')}
        ${q ? `<div class="question"><strong class="small">${esc(q.text || j.manus.message || 'Manus needs your input')}</strong>${canEdit() ? `<div class="row">${(q.options || []).map((o) => `<button class="btn sm" data-reply="${j.id}" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div><div class="row"><input class="input" id="rp-${j.id}" placeholder="Or write a reply" style="flex:1;min-width:180px"><button class="btn primary sm" data-reply="${j.id}">Reply</button></div>` : ''}</div>` : ''}
      </div>
      <div>${['failed'].includes(j.status) && canEdit() ? `<button class="btn sm" data-retry="${j.id}">Retry</button>` : ''}</div></div>`;
  }

  // ------------------------------------------------------------ settings
  function viewSettings(el) {
    const set = S.data.settings, st = S.data.summary.approval, ap = set.autopublish, owner = isOwner();
    const dis = owner ? '' : 'disabled';
    el.innerHTML = `<div class="stack" style="gap:16px">
      <section class="panel"><div class="panel-h"><h2>Autopublish gate</h2>${autopubPill()}</div>
        <p style="max-width:70ch">Weeks 1–${set.manualWeeks} are manual approval only. After that, if cumulative first-pass approval is ${set.approvalThreshold * 100}% or higher, autopilot switches on by itself (the first time). Then posts that pass QC and compliance, monthly plans, Higgsfield clips and Meta actions from the Friday plan and AI Studio run without approval, always inside the monthly cap and max CPL; actions that would break the cap are still refused. Any rejection, compliance flag or a rolling 4-week rate below ${set.killSwitchRollingThreshold * 100}% switches it off, and the owner switches it back on here.</p>
        <div class="grid g3" style="margin:12px 0"><div class="kpi"><span class="label">Weeks decided</span><span class="v">${st.weeksDone} / ${set.manualWeeks}</span></div><div class="kpi"><span class="label">Cumulative first-pass</span><span class="v">${pct(st.cumulative, 1)}</span></div><div class="kpi"><span class="label">Rolling 4 weeks</span><span class="v">${pct(st.rolling4, 1)}</span></div></div>
        ${ap.disabledReason && !ap.enabled ? `<p class="small" style="color:var(--warn)">Last turned off: ${esc(ap.disabledReason)}</p>` : ''}
        <p class="small muted">Kill switch: turns off on any rejection, any compliance flag, or rolling approval below ${set.killSwitchRollingThreshold * 100}%.</p>
        ${owner ? `<div class="row" style="margin-top:10px">${ap.enabled ? '<button class="btn danger" id="apOff">Turn off autopublish</button>' : `<button class="btn primary" id="apOn" ${st.gateEligible ? '' : 'disabled'}>Enable autopublish</button>${st.gateEligible ? '' : '<span class="small muted">Available once the gate is met.</span>'}`}</div>` : ''}
      </section>
      <section class="panel"><div class="panel-h"><h2>Hard limits and targets</h2><span class="small muted">${owner ? 'Owner can edit' : 'Read only'}</span></div>
        <form id="limits" class="stack"><div class="grid g3">
          ${numField('monthlyAdCapEgp', 'Monthly ad cap (EGP)', set.monthlyAdCapEgp, dis)}${numField('maxCplEgp', 'Max cost per lead (EGP)', set.maxCplEgp, dis)}${numField('targetCplEgp', 'Target CPL (EGP)', set.targetCplEgp, dis)}
          ${numField('t_views', 'Views / month', set.targets.views, dis)}${numField('t_pageLikes', 'Page likes / month', set.targets.pageLikes, dis)}${numField('t_leads', 'Meta leads / month', set.targets.leads, dis)}
          ${numField('t_qualifiedLeads', 'Qualified leads / month', set.targets.qualifiedLeads, dis)}${numField('t_signedClients', 'Signed clients / month', set.targets.signedClients, dis)}
          <label class="field"><span>Approval channel</span><select class="input" id="f-approvalChannel" ${dis}>${['email', 'whatsapp', 'telegram', 'slack'].map((c) => `<option ${c === set.approvalChannel ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        </div>${owner ? '<div class="row"><button class="btn primary" type="submit">Save limits</button><span class="small muted">Raising the cap above 200,000 EGP is blocked unless confirmed on the server.</span></div>' : ''}</form></section>
      ${owner && !S.ext ? teamPanel() : ''}
      ${S.ext ? '<section class="panel"><div class="panel-h"><h2>Team access</h2></div><p class="small" style="max-width:75ch">People sign in with their elevay.vip accounts. Access follows the Agentic Marketing roles you assign in the Marketing settings: owner and Agentic Marketing administrator approve; marketing manager, creative producer and researcher request changes; analyst views.</p></section>' : ''}
      ${S.mode === 'server' && !S.ext ? `<section class="panel"><div class="panel-h"><h2>Your password</h2></div><form id="pw" class="row"><input class="input" type="password" id="pw-cur" placeholder="Current" autocomplete="current-password" style="max-width:200px"><input class="input" type="password" id="pw-new" placeholder="New (10+ characters)" autocomplete="new-password" style="max-width:220px"><button class="btn" type="submit">Change</button></form></section>` : ''}
      <section class="panel"><div class="panel-h"><h2>Brand assets</h2></div><p class="small" style="max-width:75ch">Place the official logo at <code>public/brand/elevay_logo_official.png</code> (transparent PNG, native proportions) and it appears in the header. The logo is never redrawn or generated. Apex Sans is licensed; until its web font files are added, the interface uses Plus Jakarta Sans as the disclosed fallback.</p></section>
      ${owner ? `<section class="panel"><div class="panel-h"><h2>Audit log</h2><span class="small muted">Latest ${S.data.audit.length}</span></div><div class="table-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>${S.data.audit.map((a) => `<tr><td class="small num">${fmtDT(a.at)}</td><td class="small">${esc(a.actor)}</td><td class="small">${esc(a.action)}</td><td class="small">${esc(a.target || '')}</td><td class="small">${esc(a.detail || '')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    </div>`;
    const on = document.getElementById('apOn'), off = document.getElementById('apOff');
    if (on) on.onclick = () => act(() => api.autopublish(true), 'Autopublish enabled. Manus has been told.');
    if (off) off.onclick = () => act(() => api.autopublish(false, 'Turned off by owner'), 'Autopublish turned off.');
    const lf = document.getElementById('limits');
    if (lf && owner) lf.onsubmit = (ev) => {
      ev.preventDefault();
      const v = (k) => Number(document.getElementById('f-' + k).value);
      act(() => api.saveSettings({ monthlyAdCapEgp: v('monthlyAdCapEgp'), maxCplEgp: v('maxCplEgp'), targetCplEgp: v('targetCplEgp'), approvalChannel: document.getElementById('f-approvalChannel').value, targets: { views: v('t_views'), pageLikes: v('t_pageLikes'), leads: v('t_leads'), qualifiedLeads: v('t_qualifiedLeads'), signedClients: v('t_signedClients') } }), 'Limits saved.');
    };
    const pw = document.getElementById('pw');
    if (pw) pw.onsubmit = (ev) => { ev.preventDefault(); act(() => api.password(document.getElementById('pw-cur').value, document.getElementById('pw-new').value), 'Password changed.'); };
    const uf = document.getElementById('userForm');
    if (uf) uf.onsubmit = (ev) => { ev.preventDefault(); act(() => api.addUser({ name: document.getElementById('u-name').value, email: document.getElementById('u-email').value, role: document.getElementById('u-role').value, password: document.getElementById('u-pw').value }), 'Account created. Share the password privately.'); };
    el.querySelectorAll('[data-rm-user]').forEach((b) => (b.onclick = () => {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Click again to remove'; return; }
      act(() => api.removeUser(b.dataset.rmUser), 'Removed.');
    }));
  }
  const numField = (k, l, v, dis) => `<label class="field"><span>${l}</span><input class="input num" type="number" min="0" id="f-${k}" value="${esc(v)}" ${dis}></label>`;
  function teamPanel() {
    const users = S.data.users || [];
    return `<section class="panel"><div class="panel-h"><h2>Team</h2><span class="small muted">Owner approves; marketers request changes; viewers read</span></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="pill plain">${esc(u.role)}</span></td><td class="r">${u.id !== S.data.me.id ? `<button class="btn sm danger" data-rm-user="${u.id}">Remove</button>` : '<span class="small muted">You</span>'}</td></tr>`).join('')}</tbody></table></div>
      <form id="userForm" class="grid g3" style="margin-top:12px;align-items:end">
        <label class="field"><span>Name</span><input class="input" id="u-name" required></label>
        <label class="field"><span>Email</span><input class="input" id="u-email" type="email" required></label>
        <label class="field"><span>Role</span><select class="input" id="u-role"><option>marketer</option><option>viewer</option><option>owner</option></select></label>
        <label class="field"><span>Temporary password (10+)</span><input class="input" id="u-pw" type="text" minlength="10" required></label>
        <div><button class="btn primary" type="submit">Add team member</button></div></form></section>`;
  }

  boot();
})();

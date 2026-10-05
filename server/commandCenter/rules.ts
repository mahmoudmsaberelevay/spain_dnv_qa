// @ts-nocheck
// Generated from client/public/admin-cc/shared (or manus.src.js): edit the source there, then regenerate with scripts/build-command-center-modules.mjs.
const module = { exports: {} };

/*
 * ELEVAY brand + compliance rules, shared by the server and the browser.
 * Source: elevay-creative-direction skill (Master Enterprise Edition) and the
 * Manus master prompt, sections 1, 4, 6, 8, 9.
 *
 * Works as a CommonJS module (Node) and as a browser global (window.ElevayRules).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ElevayRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Business limits (master prompt §1) ----------
  const DEFAULT_SETTINGS = {
    monthlyAdCapEgp: 200000,
    maxCplEgp: 100,
    targetCplEgp: 70,
    cplBreachDays: 3,
    cplBreachMinSpendEgp: 1000,
    targets: { views: 2000000, pageLikes: 10000, leads: 2000, qualifiedLeads: 200, signedClients: 20 },
    approvalThreshold: 0.9,
    killSwitchRollingThreshold: 0.85,
    manualWeeks: 6,
    timezone: 'Africa/Cairo',
    autopublish: { enabled: false, enabledAt: null, enabledBy: null, disabledReason: null },
    approvalChannel: 'email',
  };

  // ---------- Terminology (brand identity §6–7) ----------
  // severity: "block" = must fix before approval; "warn" = review.
  const TERM_RULES = [
    { id: 'visa_ar', re: /تأشير(ة|ات)|فيز[اه]/u, severity: 'block', label: 'Uses "تأشيرة/فيزا". Use "إقامة" (Residency).' },
    { id: 'visa_en', re: /\bvisas?\b/i, severity: 'block', label: 'Uses "Visa". Use "Residency" unless quoting an official program name.' },
    { id: 'guarantee_ar', re: /مضمون|مضمونة|نضمن|ضمان\s+(الموافقة|القبول|الحصول)|موافقة\s+مؤكدة|قبول\s+مؤكد/u, severity: 'block', label: 'Guarantee language. Never guarantee approval, timelines or outcomes.' },
    { id: 'guarantee_en', re: /\bguarantee(d|s)?\b|\b100\s?%\s?(approval|success)\b/i, severity: 'block', label: 'Guarantee language ("Guaranteed").' },
    { id: 'easy_ar', re: /بسهولة|سهل(ة)?\s+(جد[اً]|للغاية)|فور[يًا]+|في\s+الحال|خلال\s+أيام\s+فقط/u, severity: 'warn', label: 'Implies easy/instant results ("Easy", "Instant").' },
    { id: 'easy_en', re: /\b(easy|instant(ly)?|shortcut|quick\s?fix)\b/i, severity: 'warn', label: 'Avoided term: Easy / Instant / Shortcut / Quick fix.' },
    { id: 'broker', re: /\b(broker|immigration agent)\b|سمسار|وسيط\s+هجرة/iu, severity: 'block', label: 'Positions ELEVAY as a broker/agent.' },
    { id: 'urgency_ar', re: /آخر\s+فرصة|عدد\s+محدود|أماكن\s+محدودة|لفترة\s+محدودة|سارع|لا\s+تفوت|ينتهي\s+العرض/u, severity: 'block', label: 'Fake urgency or scarcity.' },
    { id: 'urgency_en', re: /\b(last chance|only \d+ (spots|places) left|limited spots|hurry|act now)\b/i, severity: 'block', label: 'Fake urgency or scarcity.' },
    { id: 'returns', re: /عائد\s+مضمون|أرباح\s+مضمونة|guaranteed\s+returns?/iu, severity: 'block', label: 'Guaranteed investment returns.' },
  ];

  const CONTACT_RULES = [
    { id: 'phone', re: /(\+?\d[\d\s\-()]{7,}\d)/, label: 'Phone number in caption. Keep contact details in bio / link-in-bio.' },
    { id: 'email', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, label: 'Email address in caption.' },
    { id: 'url', re: /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|vip|net|org|io|me)\b/i, label: 'URL in caption.' },
    { id: 'whatsapp', re: /واتس(اب|آب)|whats\s?app|wa\.me/iu, label: 'WhatsApp mention in caption.' },
  ];

  // Disclaimers (brand identity §8) in English and MSA.
  const DISCLAIMERS = [
    { en: 'Subject to government approval', ar: 'يخضع لموافقة الجهات الحكومية المختصة' },
    { en: 'Based on individual circumstances', ar: 'وفقًا للظروف الفردية لكل حالة' },
    { en: 'Consult with legal advisors', ar: 'يُنصح بالتشاور مع مستشار قانوني' },
    { en: 'Terms and conditions apply', ar: 'تطبق الشروط والأحكام' },
  ];
  const DISCLAIMER_RE = /موافقة\s+(الجهات|السلطات)|الظروف\s+الفردية|مستشار\s+قانوني|الشروط\s+والأحكام|subject to government approval|individual circumstances|legal advis|terms and conditions/iu;
  const CTA_RE = /تواصل|احجز|استشارة|اكتشف|تعرّف|تعرف|راسلنا|اطلب|ابدأ|للمزيد|contact|book|learn more/iu;

  const PILLARS = ['Family Security', 'Global Mobility', 'Long-term Planning', 'Premium Service', 'Ethical Advisory'];
  const PROGRAMS = [
    'Spain Digital Nomad Residency', 'Portugal D7', 'Portugal D8', 'Portugal D2', 'Portugal Golden Residency',
    'Greece Golden Residency', 'Malta Permanent Residency', 'UK Expansion Worker', 'Canada Skilled Migration',
    'Caribbean Citizenship by Investment', 'Vanuatu Citizenship', 'Evergreen / multi-program',
  ];
  const STATUSES = ['draft', 'qc_failed', 'pending_approval', 'changes_requested', 'approved', 'scheduled', 'published', 'rejected'];
  const CHANGE_SCOPES = [
    { id: 'caption', label: 'Caption only', regenerates: 'Caption text (no media)' },
    { id: 'schedule', label: 'Schedule only', regenerates: 'Nothing; reschedule' },
    { id: 'static_design', label: 'One static design', regenerates: 'OpenAI design + logo composite' },
    { id: 'reel_clip', label: 'One reel clip', regenerates: 'One Higgsfield clip + re-assembly' },
    { id: 'voice', label: 'Voice / script', regenerates: 'Elevay.vip voice for affected clips' },
    { id: 'whole_concept', label: 'Whole concept', regenerates: 'Full brief and all media' },
  ];

  function countWords(text) {
    return (String(text || '').trim().match(/[^\s]+/gu) || []).length;
  }
  // ---------- Design rules (ELEVAY creative direction) ----------
  // Remove negated phrases ("no passports", "without text", "do not draw the logo") before
  // looking for forbidden subjects, so instructions that forbid them are not flagged.
  function affirmative(text) {
    return String(text || '').toLowerCase()
      .replace(/\b(no|without|never|avoid|not|nor|exclude|excluding|free of)\b[^.;:\n]*/g, ' ')
      .replace(/\bdo not\b[^.;:\n]*|\bdon't\b[^.;:\n]*/g, ' ');
  }
  const FORBIDDEN_VISUAL = [
    { id: 'passport', re: /passports?|visa stamps?/, label: 'Passport or visa imagery' },
    { id: 'flag', re: /\bflags?\b/, label: 'Flags as visual objects' },
    { id: 'seal', re: /\b(seals?|stamps?|government documents?|certificates?)\b/, label: 'Seals, stamps or official-looking documents' },
    { id: 'portal', re: /\b(portals?|sculptures?|museum|installations?|immigration symbols?|cross-sections?)\b/, label: 'Portals, sculptures, museum installations or abstract immigration symbols' },
    { id: 'contact', re: /\b(qr codes?|phone numbers?|whatsapp|email address|urls?|website address)\b/, label: 'QR codes or contact details' },
    { id: 'headwear', re: /\b(keffiyeh|kufiya|ghutra|shemagh|turbans?|agal|igal)\b/, label: 'Traditional headwear not requested' },
    { id: 'handshake', re: /\bhandshakes?\b/, label: 'Staged business handshake' },
    { id: 'logo_ai', re: /\b(draw|draws|drawn|render|renders|rendered|include|includes|add|adds|show|shows|place|places|with|featuring|feature)\s+(the\s+|an?\s+|its\s+)?(elevay\s+|official\s+|company\s+)?(logo|brand mark|wordmark|watermark)\b|\blogo (on|printed|engraved)\b/, label: 'Asks the image model to draw a logo (the official logo is composited afterwards)' },
  ];
  const SUIT_RE = /\b(suits?|suited|blazers?|tuxedos?|business attire|formal wear|businessman|businesswoman|executive)\b/;
  const SHOES_RE = /\b(shoes|loafers|oxfords|brogues|derbies|heels|pumps|footwear|boots)\b/;
  const BAD_SHOES_RE = /\b(slippers|flip[- ]?flops|sandals|sneakers|trainers|house shoes)\b/;
  const PEOPLE_RE = /\b(man|men|woman|women|person|people|family|couple|professional|child|children|kids?|father|mother|son|daughter|businessman|businesswoman|executive|entrepreneur|retiree|investor|traveller|traveler)\b/;
  const ARAB_RE = /\b(arab|middle[- ]eastern|egyptian|gulf|emirati|saudi|levantine)\b/;
  const ARABIC_PLACE_NAMES = /إسبانيا|اسبانيا|مالطا|البرتغال|اليونان|كندا|بريطانيا|المملكة المتحدة|لشبونة|مدريد|برشلونة|أثينا|إيليفاي|إليفاي|ايليفاي|الكاريبي|غرينادا|دومينيكا/u;

  /** Design-rule checks for one image or keyframe prompt. */
  function checkVisualPrompt(prompt, add, prefix, labelPrefix) {
    const raw = String(prompt || '').toLowerCase();
    const yes = affirmative(prompt);
    for (const f of FORBIDDEN_VISUAL) add(`${prefix}_${f.id}`, `${labelPrefix}: no ${f.label.toLowerCase()}`, !f.re.test(yes));
    if (PEOPLE_RE.test(yes)) {
      add(`${prefix}_arab`, `${labelPrefix}: people are Arab / Middle Eastern`, ARAB_RE.test(raw));
      add(`${prefix}_wardrobe`, `${labelPrefix}: complete elegant outfit described`, /\b(cloth|outfit|wear|dressed|attire|suit|dress|shirt|linen|tailored|elegant)\w*/.test(raw), 'warn');
    }
    if (SUIT_RE.test(yes)) add(`${prefix}_footwear`, `${labelPrefix}: suits/business wear come with polished formal shoes or loafers`, SHOES_RE.test(yes) && !BAD_SHOES_RE.test(yes));
    else if (BAD_SHOES_RE.test(yes) && /\b(formal|office|meeting|consultation)\b/.test(yes)) add(`${prefix}_footwear`, `${labelPrefix}: no casual footwear in formal scenes`, false);
  }

  /** English design text must be sentence case (not ALL CAPS, not Title Case). */
  function isSentenceCase(text) {
    const words = String(text || '').trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (!words.length) return true;
    const letters = words.join('').replace(/[^A-Za-z]/g, '');
    if (letters.length > 3 && letters === letters.toUpperCase()) return false;
    const small = /^(a|an|the|and|or|of|in|on|to|for|with|at|by|your|our|from)$/i;
    const significant = words.slice(1).filter((w) => !small.test(w) && !/^[A-Z0-9]{2,}$/.test(w) && !/^(ELEVAY|Spain|Malta|Portugal|Greece|Lisbon|Madrid|Barcelona|Europe|European|Schengen|Canada|UK|Caribbean|Athens|Valletta|Mediterranean|Golden|D7|D8|D2)$/.test(w.replace(/[^A-Za-z0-9]/g, '')));
    return words.length < 3 || significant.length < 1 || !significant.every((w) => /^[A-Z]/.test(w));
  }

  function hasArabic(text) { return /[\u0600-\u06FF]/.test(String(text || '')); }

  /**
   * Check a Content Brief against brand + compliance rules.
   * Returns { pass, blocks, warnings, checks:[{id,label,ok,severity}] }.
   */
  function checkBrief(brief) {
    const checks = [];
    const add = (id, label, ok, severity = 'block') => checks.push({ id, label, ok: !!ok, severity });
    const caption = String(brief.caption_ar || '');
    const words = countWords(caption);

    add('caption_present', 'Arabic caption present', caption.trim().length > 0);
    add('caption_arabic', 'Caption is written in Arabic (MSA)', !caption || hasArabic(caption));
    add('caption_length', `Caption length 100–150 words (now ${words})`, words >= 100 && words <= 150, 'warn');
    const firstLine = caption.split(/\n/).find((l) => l.trim()) || '';
    add('hook', 'Opens with a short hook (≤ 12 words on the first line)', firstLine && countWords(firstLine) <= 12, 'warn');
    add('cta', 'Ends with a call to action', CTA_RE.test(caption.slice(-220)), 'warn');
    add('disclaimer', 'Includes a compliance disclaimer', DISCLAIMER_RE.test(caption) || DISCLAIMER_RE.test(brief.disclaimer_used || ''));

    for (const r of TERM_RULES) {
      const hay = caption + '\n' + (brief.design?.headline_en || '');
      add('term_' + r.id, r.label, !r.re.test(hay), r.severity);
    }
    for (const r of CONTACT_RULES) add('contact_' + r.id, r.label, !r.re.test(caption));

    if (brief.type === 'static') {
      const h = brief.design?.headline_en || '';
      add('headline_english', 'Design text is English only', !hasArabic(h));
      const fmt = brief.design?.format || '';
      add('static_format', 'Static format is 1080x1080 or 1080x1350 (4:5)', /1080x1080|1080x1350/.test(fmt), 'warn');
      if (h) {
        add('headline_case', 'Design text is in sentence case (not ALL CAPS or Title Case)', isSentenceCase(h));
        add('headline_length', 'Design text is short: up to 8 words / 60 characters', h.length <= 60 && h.trim().split(/\s+/).length <= 8, 'warn');
      }
      const prompt = brief.design?.image_prompt || '';
      if (prompt) {
        add('prompt_no_logo', 'Image prompt tells the model not to draw the logo', /no logo|without (the )?logo|do not (draw|render|include) (the )?logo/i.test(prompt), 'warn');
        checkVisualPrompt(prompt, add, 'prompt', 'Image');
      }
    }
    if (brief.type === 'reel') {
      const sb = brief.reel?.storyboard || [];
      add('reel_clips', `Reel has 4 clips of 5 s (now ${sb.length})`, sb.length === 4, 'warn');
      add('reel_duration', 'Reel totals 23 s (4×5 s + 3 s white logo outro)', Number(brief.reel?.duration_s) === 23, 'warn');
      sb.forEach((c, i) => {
        if (c.keyframe_prompt) checkVisualPrompt(c.keyframe_prompt, add, `clip${i + 1}`, `Clip ${i + 1} keyframe`);
        const motion = affirmative(c.motion_prompt);
        if (c.motion_prompt) add(`clip${i + 1}_motion_text`, `Clip ${i + 1} motion: no on-screen text, captions or logos`, !/\b(text|caption|captions|title|titles|subtitle|subtitles|logo|lettering|typography|sign reading)\b/.test(motion));
        if (c.motion_prompt) add(`clip${i + 1}_motion_style`, `Clip ${i + 1} motion: restrained and cinematic (no flashy effects)`, !/\b(whip pan|spin|glitch|zoom burst|bounce|flash|strobe|parallax|warp|morph)\w*/.test(motion), 'warn');
      });
      const mode = brief.talent?.mode || 'none';
      if (mode !== 'none') {
        add('voice_source', 'Voice comes from the Elevay.vip voice clone', (brief.talent?.voice_source || '') === 'elevay_vip_module');
        const spoken = sb.map((c) => c.spoken_text_ar || '').join(' ');
        for (const r of TERM_RULES) if (r.re.test(spoken)) add('spoken_' + r.id, 'Script: ' + r.label, false, r.severity);
        add('spoken_english_names', 'Script writes country, city and company names in English letters (e.g. Spain, Malta, ELEVAY)', !ARABIC_PLACE_NAMES.test(spoken));
        const perClip = sb.map((c) => countWords(c.spoken_text_ar || ''));
        add('spoken_length', 'Script is ~8–13 Arabic words per clip', perClip.every((n) => n === 0 || (n >= 6 && n <= 15)), 'warn');
      }
    }
    if (brief.source && brief.source.url) {
      add('source_confidence', 'News source is verified or reported (not unconfirmed)', brief.source.confidence !== 'unconfirmed');
    }
    const blocks = checks.filter((c) => !c.ok && c.severity === 'block');
    const warnings = checks.filter((c) => !c.ok && c.severity === 'warn');
    return { pass: blocks.length === 0, blocks, warnings, checks, words };
  }

  /** Suggest the change scope from an owner's comment (master prompt §7). */
  function classifyChange(comment, brief) {
    const c = String(comment || '').toLowerCase();
    const clip = c.match(/(clip|scene|مشهد|كليب|لقطة)\s*(\d)/u);
    if (clip) return { scope: 'reel_clip', clip: Number(clip[2]) };
    if (/(voice|صوت|نطق|تعليق صوتي|script|سكريبت)/u.test(c)) return { scope: 'voice' };
    if (/(time|date|schedule|reschedule|\bmove\b|postpone|\b\d{1,2}(:\d{2})?\s?(am|pm)\b|sunday|monday|tuesday|wednesday|thursday|friday|saturday|موعد|وقت|يوم|تاريخ|الساعة|أجّل|اجل|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|publish on)/u.test(c) && !/(caption|كابشن|نص|design|تصميم)/u.test(c)) return { scope: 'schedule' };
    if (/(caption|كابشن|التعليق|النص|الكلمات|hook|cta|wording|text)/u.test(c) && !/(image|design|تصميم|صورة|لون|color)/u.test(c)) return { scope: 'caption' };
    if (/(image|design|تصميم|صورة|لون|color|headline|layout|logo|خلفية)/u.test(c)) return { scope: brief && brief.type === 'reel' ? 'reel_clip' : 'static_design' };
    if (/(concept|idea|topic|فكرة|موضوع|غير الكل|from scratch)/u.test(c)) return { scope: 'whole_concept' };
    return { scope: brief && brief.type === 'reel' ? 'reel_clip' : 'caption' };
  }

  // ---------- Approval metric + autopublish gate (§8, §9) ----------
  /** items: briefs. Returns weekly and cumulative first-pass approval data. */
  function approvalStats(items, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const presented = items.filter((i) => i.presented_at && i.first_pass !== null && i.first_pass !== undefined);
    const awaiting = items.filter((i) => i.presented_at && (i.first_pass === null || i.first_pass === undefined)).length;
    const byWeek = {};
    for (const i of presented) {
      const w = weekOf(i.item_id);
      byWeek[w] = byWeek[w] || { week: w, presented: 0, firstPass: 0 };
      byWeek[w].presented++;
      if (i.first_pass === true) byWeek[w].firstPass++;
    }
    const weeks = Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week));
    weeks.forEach((w) => (w.rate = w.presented ? w.firstPass / w.presented : null));
    const tot = weeks.reduce((a, w) => ({ p: a.p + w.presented, f: a.f + w.firstPass }), { p: 0, f: 0 });
    const last4 = weeks.slice(-4).reduce((a, w) => ({ p: a.p + w.presented, f: a.f + w.firstPass }), { p: 0, f: 0 });
    const cumulative = tot.p ? tot.f / tot.p : null;
    const rolling4 = last4.p ? last4.f / last4.p : null;
    const weeksDone = weeks.length;
    const gateEligible = weeksDone >= s.manualWeeks && cumulative !== null && cumulative >= s.approvalThreshold;
    return { weeks, cumulative, rolling4, presented: tot.p, firstPass: tot.f, awaiting, weeksDone, gateEligible };
  }

  function weekOf(itemId) {
    const m = String(itemId || '').match(/^(\d{4}-W\d{2})/);
    return m ? m[1] : 'unknown';
  }

  // ---------- Spend + CPL guardrails (§1) ----------
  /**
   * report: { month:"2026-10", asOf:"2026-10-05", spendMtdEgp, adsets:[{name, spendEgp, leads, cplHistory:[{date,cpl,spend}] }] }
   */
  function guardrails(report, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const alerts = [];
    if (!report) return { alerts, projected: null, pacePct: null };
    const asOf = new Date((report.asOf || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
    const day = asOf.getUTCDate();
    const daysInMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)).getUTCDate();
    const spend = Number(report.spendMtdEgp || 0);
    const projected = day ? (spend / day) * daysInMonth : spend;
    const idealToDate = (s.monthlyAdCapEgp * day) / daysInMonth;
    if (spend >= s.monthlyAdCapEgp) alerts.push({ level: 'critical', code: 'cap_reached', text: `Month-to-date spend ${fmt(spend)} EGP has reached the ${fmt(s.monthlyAdCapEgp)} EGP cap. Pause all paid delivery.` });
    else if (projected > s.monthlyAdCapEgp) alerts.push({ level: 'critical', code: 'cap_projected', text: `Projected month-end spend ${fmt(projected)} EGP exceeds the ${fmt(s.monthlyAdCapEgp)} EGP cap. Reduce daily budgets.` });
    else if (spend > idealToDate * 1.1) alerts.push({ level: 'warning', code: 'pace_fast', text: `Spending ahead of pace: ${fmt(spend)} EGP vs ${fmt(idealToDate)} EGP ideal to date.` });

    const flagged = [];
    for (const a of report.adsets || []) {
      if (a.objective && a.objective !== 'leads') continue;
      const hist = (a.cplHistory || []).slice().sort((x, y) => String(x.date).localeCompare(String(y.date)));
      let streak = 0, streakSpend = 0;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (Number(hist[i].cpl) > s.maxCplEgp) { streak++; streakSpend += Number(hist[i].spend || 0); } else break;
      }
      const cpl = a.leads ? a.spendEgp / a.leads : null;
      const breach = streak >= s.cplBreachDays && Number(a.spendEgp || 0) >= s.cplBreachMinSpendEgp;
      if (breach) {
        flagged.push(a.name);
        alerts.push({ level: 'critical', code: 'cpl_breach', adset: a.name, text: `Ad set "${a.name}" above ${s.maxCplEgp} EGP CPL for ${streak} days with ${fmt(a.spendEgp)} EGP spent. Pause or fix (needs approval).` });
      } else if (cpl !== null && cpl > s.targetCplEgp) {
        alerts.push({ level: 'warning', code: 'cpl_above_target', adset: a.name, text: `Ad set "${a.name}" CPL ${fmt(cpl)} EGP is above the ${s.targetCplEgp} EGP target.` });
      }
    }
    return { alerts, projected, idealToDate, pacePct: spend / s.monthlyAdCapEgp, day, daysInMonth, flagged };
  }

  function fmt(n) { return Math.round(Number(n || 0)).toLocaleString('en-US'); }

  return {
    affirmative, isSentenceCase,
    DEFAULT_SETTINGS, TERM_RULES, CONTACT_RULES, DISCLAIMERS, PILLARS, PROGRAMS, STATUSES, CHANGE_SCOPES,
    checkBrief, classifyChange, approvalStats, guardrails, countWords, hasArabic, weekOf,
  };
});

export default module.exports;

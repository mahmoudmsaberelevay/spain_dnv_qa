/*
 * ELEVAY Marketing Command Center — domain engine.
 * Pure functions over a plain state object, shared by the Node server and the
 * browser demo mode, so both behave identically.
 *
 * state = { items, actions, reports, news, plans, jobs, audit, settings, counters }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.ElevayEngine = factory(root.ElevayRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const now = () => new Date().toISOString();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const AUDIT_MAX = 5000;
  const JOBS_MAX = 3000;

  function emptyState() {
    return {
      items: [], actions: [], reports: [], news: [], plans: [], jobs: [], audit: [],
      settings: clone(R.DEFAULT_SETTINGS), counters: { job: 0, action: 0, news: 0, report: 0, plan: 0 },
    };
  }

  function nextId(state, kind, prefix) {
    state.counters = state.counters || {};
    state.counters[kind] = (state.counters[kind] || 0) + 1;
    return `${prefix}-${String(state.counters[kind]).padStart(5, '0')}`;
  }

  function audit(state, actor, action, target, detail) {
    state.audit.unshift({ at: now(), actor: actor || 'system', action, target: target || null, detail: detail || null });
    if (state.audit.length > AUDIT_MAX) state.audit.length = AUDIT_MAX;
  }

  // ---------------- Jobs: the outbox Manus works from ----------------
  /**
   * Job types Manus handles:
   *  schedule_post      approved item → schedule in Meta planner at publish.datetime_cairo
   *  revise_item        owner requested changes → regenerate only `scope`
   *  item_rejected      drop the item, propose a replacement if useful
   *  execute_action     approved Friday action → apply in Meta, report before/after
   *  pause_adset        guardrail breach approved by owner
   *  autopublish_on/off gate changes
   *  custom             free-form request from the team
   */
  function enqueueJob(state, type, payload, actor) {
    const job = {
      id: nextId(state, 'job', 'JOB'), type, status: 'pending', payload: payload || {},
      created_at: now(), created_by: actor || 'system', updated_at: now(),
      manus: { task_id: null, task_url: null, stop_reason: null, message: null, attachments: [], question: null },
      result: null, history: [{ at: now(), status: 'pending', by: actor || 'system' }],
    };
    state.jobs.unshift(job);
    if (state.jobs.length > JOBS_MAX) state.jobs.length = JOBS_MAX;
    audit(state, actor, 'job.created', job.id, type);
    return job;
  }

  function setJobStatus(state, id, status, patch, actor) {
    const job = state.jobs.find((j) => j.id === id);
    if (!job) return { ok: false, error: 'Job not found' };
    Object.assign(job, patch || {});
    job.status = status;
    job.updated_at = now();
    job.history.push({ at: now(), status, by: actor || 'manus' });
    audit(state, actor || 'manus', 'job.' + status, id);
    return { ok: true, job };
  }

  /** Apply a Manus API webhook (task_created / task_stopped). */
  function applyManusWebhook(state, evt) {
    const d = (evt && evt.task_detail) || {};
    const job = state.jobs.find((j) => j.manus && j.manus.task_id === d.task_id);
    if (!job) return { ok: false, error: 'No job for task ' + d.task_id };
    job.manus.task_url = d.task_url || job.manus.task_url;
    if (evt.event_type === 'task_created') return setJobStatus(state, job.id, 'in_progress', {}, 'manus');
    if (evt.event_type === 'task_stopped') {
      job.manus.stop_reason = d.stop_reason || null;
      job.manus.message = d.message || null;
      job.manus.attachments = d.attachments || [];
      if (d.stop_reason === 'ask') {
        job.manus.question = d.question_expectation || { options: [] };
        return setJobStatus(state, job.id, 'needs_input', {}, 'manus');
      }
      job.manus.question = null;
      return setJobStatus(state, job.id, 'done', {}, 'manus');
    }
    return { ok: true, job };
  }

  // ---------------- Content briefs ----------------
  /** Manus (or the team) delivers / updates a Content Brief (master prompt §10). */
  function upsertBrief(state, input, actor) {
    if (!input || !input.item_id) return { ok: false, error: 'item_id is required (e.g. 2026-W41-03)' };
    if (!/^\d{4}-W\d{2}-\d{2}$/.test(input.item_id)) return { ok: false, error: 'item_id must look like 2026-W41-03' };
    if (!['static', 'reel', 'carousel'].includes(input.type)) return { ok: false, error: 'type must be static, reel or carousel' };
    const existing = state.items.find((i) => i.item_id === input.item_id);
    const compliance = R.checkBrief(input);
    let item;
    if (existing) {
      const prev = clone(existing);
      delete prev.history;
      item = existing;
      const keep = { history: existing.history || [], owner_comments: existing.owner_comments || [], presented_at: existing.presented_at, first_pass: existing.first_pass, created_at: existing.created_at };
      Object.assign(item, input, keep);
      const pv = Number(prev.version || 1);
      item.version = Number(input.version) > pv ? Number(input.version) : pv + 1;
      item.history.unshift({ at: now(), by: actor, version: prev.version, snapshot: prev });
    } else {
      item = Object.assign({ version: 1, owner_comments: [], history: [], created_at: now() }, input);
      item.version = Number(input.version || 1);
      item.owner_comments = item.owner_comments || [];
      item.history = item.history || [];
      state.items.push(item);
    }
    item.compliance = { pass: compliance.pass, blocks: compliance.blocks, warnings: compliance.warnings, checks: compliance.checks, words: compliance.words, checked_at: now() };
    item.status = input.status || item.status || 'draft';
    if (item.status === 'pending_approval' && !compliance.pass) item.status = 'qc_failed';
    if (item.status === 'pending_approval' && !item.presented_at) item.presented_at = now();
    item.first_pass = item.first_pass === undefined ? null : item.first_pass;
    item.updated_at = now();
    audit(state, actor, existing ? 'brief.updated' : 'brief.created', item.item_id, `v${item.version} → ${item.status}`);
    if (!compliance.pass && state.settings.autopublish.enabled) disableAutopublish(state, `Compliance flag on ${item.item_id}`, 'system');
    return { ok: true, item };
  }

  // ---------------- Reviewed revisions ----------------
  // A history snapshot contains every item field at that version except the history
  // collection itself. Excluding that self-referential collection keeps snapshots
  // immutable and unbounded without recursively duplicating every older version.
  function snapshotForHistory(item) {
    const snapshot = clone(item);
    delete snapshot.history;
    return snapshot;
  }

  function normaliseRevisionScopes(scope) {
    const raw = Array.isArray(scope) ? scope : [scope];
    const values = raw.flatMap((value) => String(value || '').split(','))
      .map((value) => value.trim()).filter(Boolean)
      .map((value) => value === 'all' ? 'whole_concept' : value);
    const scopes = [...new Set(values)];
    if (!scopes.length || !scopes.every((value) => (R.CHANGE_SCOPES || []).some((x) => x.id === value))) return [];
    return scopes.includes('whole_concept') ? ['whole_concept'] : scopes;
  }

  function normaliseRevisionScope(scope) {
    const scopes = normaliseRevisionScopes(scope);
    return scopes.length === 1 ? scopes[0] : null;
  }

  function copyPatchFields(target, source, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = clone(source[key]);
    }
  }

  function mergeReelPatch(existing, incoming, clip, voiceOnly) {
    const reel = clone(existing || {});
    const patch = incoming || {};
    for (const key of Object.keys(patch)) if (key !== 'storyboard') reel[key] = clone(patch[key]);
    if (!Array.isArray(patch.storyboard)) return reel;
    const current = Array.isArray(reel.storyboard) ? reel.storyboard.map(clone) : [];
    // A named clip permits that scene only. Without one, only scenes expressly
    // supplied in the final-QC-passed patch may change; all other scenes remain.
    for (const revised of patch.storyboard) {
      const sceneClip = Number(revised && revised.clip);
      if (!Number.isInteger(sceneClip) || sceneClip < 1 || (clip && sceneClip !== Number(clip))) continue;
      const at = current.findIndex((scene) => Number(scene && scene.clip) === sceneClip);
      if (at < 0) continue;
      current[at] = voiceOnly
        ? Object.assign({}, current[at], Object.prototype.hasOwnProperty.call(revised, 'spoken_text_ar') ? { spoken_text_ar: revised.spoken_text_ar } : {})
        : Object.assign({}, current[at], clone(revised));
    }
    reel.storyboard = current;
    return reel;
  }

  function carouselSlides(item) {
    const slides = item?.carousel?.slides || item?.design?.slides;
    if (!Array.isArray(slides) || !slides.length) return null;
    const normalised = slides.map((slide, index) => Object.assign({}, clone(slide), { slide: Number(slide?.slide || index + 1) }));
    if (normalised.some((slide) => !Number.isInteger(slide.slide) || slide.slide < 1 || !String(slide.headline_en || '').trim() || !String(slide.image_prompt || '').trim())) return null;
    return normalised;
  }

  function carouselImageUrls(item, slides) {
    const urls = Array.isArray(item?.media?.image_urls) ? item.media.image_urls.slice() : slides.map((slide) => slide.image_url || null);
    return urls.length === slides.length && urls.every((url) => typeof url === 'string' && url.trim()) ? urls : null;
  }

  function carouselPatch(item, patch, clip) {
    const existing = carouselSlides(item);
    const previousUrls = existing && carouselImageUrls(item, existing);
    if (!existing || !previousUrls) return { ok: false, error: 'Carousel visual revisions require complete durable carousel.slides (or legacy design.slides) with headline_en, image_prompt, and media.image_urls.' };
    const incoming = patch?.carousel?.slides || patch?.design?.slides;
    if (!Array.isArray(incoming) || !incoming.length) return { ok: false, error: 'Carousel revision must include the reviewed slide descriptions.' };
    const updated = existing.map(clone), urls = previousUrls.slice();
    const indexes = clip ? [Number(clip)] : existing.map((slide) => slide.slide);
    if (clip && (!Number.isInteger(Number(clip)) || Number(clip) < 1 || !existing.some((slide) => slide.slide === Number(clip)))) return { ok: false, error: 'Choose an existing carousel slide.' };
    if (!clip && incoming.length !== existing.length) return { ok: false, error: 'An all-carousel visual revision must provide every slide; no missing slide may be invented.' };
    const patchUrls = Array.isArray(patch?.media?.image_urls) ? patch.media.image_urls : [];
    for (const slideNo of indexes) {
      const at = existing.findIndex((slide) => slide.slide === slideNo);
      const revised = incoming.find((slide, index) => Number(slide?.slide || (clip ? slideNo : index + 1)) === slideNo);
      if (!revised || !String(revised.headline_en || '').trim() || !String(revised.image_prompt || '').trim()) return { ok: false, error: `Carousel slide ${slideNo} needs headline_en and image_prompt.` };
      const imageUrl = revised.image_url || patchUrls[at];
      if (typeof imageUrl !== 'string' || !imageUrl.trim()) return { ok: false, error: `Carousel slide ${slideNo} needs its reviewed image URL.` };
      updated[at] = Object.assign({}, updated[at], clone(revised), { slide: slideNo, image_url: imageUrl });
      urls[at] = imageUrl;
    }
    return { ok: true, slides: updated, image_urls: urls };
  }

  function scopedRevisionPatch(item, patch, scope, clip) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'A revision patch is required.' };
    const next = clone(item);
    const apply = (keys) => copyPatchFields(next, patch, keys);
    if (scope === 'caption') apply(['caption_ar', 'caption_en', 'caption', 'cta', 'hashtags']);
    else if (scope === 'static_design') {
      if (item.type === 'carousel') {
        const carousel = carouselPatch(item, patch, clip);
        if (!carousel.ok) return carousel;
        next.carousel = Object.assign({}, next.carousel || {}, { slides: carousel.slides });
        next.media = Object.assign({}, next.media || {}, { image_urls: carousel.image_urls });
        if (next.design && next.design.slides) delete next.design.slides; // canonical source is carousel.slides
        apply(['qc', 'produced_by']);
      } else apply(['design', 'media', 'qc', 'produced_by']);
    } else if (scope === 'reel_clip') {
      next.reel = mergeReelPatch(item.reel, patch.reel, clip, false);
      apply(['media', 'qc', 'produced_by']);
    } else if (scope === 'voice') {
      next.reel = mergeReelPatch(item.reel, patch.reel, clip, true);
      apply(['media', 'qc', 'produced_by']);
    } else if (scope === 'schedule') {
      if (!patch.publish || typeof patch.publish !== 'object' || Array.isArray(patch.publish)) return { ok: false, error: 'A schedule revision needs a publish patch.' };
      next.publish = Object.assign({}, clone(item.publish || {}), clone(patch.publish));
    }
    else if (scope === 'whole_concept') {
      const immutable = new Set(['item_id', 'version', 'history', 'owner_comments', 'created_at', 'updated_at', 'presented_at', 'first_pass', 'approved_at', 'approved_by', 'status', 'revision', 'revision_status']);
      for (const key of Object.keys(patch)) if (!immutable.has(key)) next[key] = clone(patch[key]);
    } else return { ok: false, error: 'Unknown revision scope.' };
    // Content versions never modify the active posting lifecycle. A reviewed edit is
    // an internal content swap only; no publish, scheduling or Meta configuration is touched.
    next.item_id = item.item_id;
    next.status = item.status;
    // A schedule-only revision changes the stored intended time but deliberately
    // creates no schedule_post/publish job. All other revisions retain it exactly.
    if (scope !== 'schedule') next.publish = clone(item.publish);
    return { ok: true, item: next };
  }

  function ownerRevisionJob(state, itemId, baseVersion, runId) {
    const candidates = state.jobs.filter((job) => job.type === 'revise_item' && job.payload && job.payload.item_id === itemId && job.payload.owner_authorized === true && Number(job.payload.base_version) === Number(baseVersion));
    const exact = candidates.find((job) => job.payload.run_id && String(job.payload.run_id) === String(runId));
    if (exact) return exact;
    // The owner job is created before the AI run. It is still durable authority; bind
    // it to this run during the final, checked commit. A pre-bound different run fails closed.
    return candidates.find((job) => !job.payload.run_id) || null;
  }

  /**
   * Atomically swaps in a scope-limited, Claude-final-QC-passed revision.
   * This deliberately does not enqueue publishing/scheduling work or change Meta settings.
   */
  function applyReviewedRevision(state, itemId, patch, opts) {
    opts = opts || {};
    const item = state.items.find((i) => i.item_id === itemId);
    if (!item) return { ok: false, error: 'Item not found' };
    if (!opts.finalQc || opts.finalQc.pass !== true) return { ok: false, error: 'Final Claude QC must pass before a revision can replace the active version.' };
    if (!opts.runId) return { ok: false, error: 'A durable revision run id is required.' };
    if (!Number.isFinite(Number(opts.baseVersion)) || Number(opts.baseVersion) !== Number(item.version)) return { ok: false, error: `Stale revision: active version is v${item.version}.` };
    const scope = normaliseRevisionScope(opts.scope);
    if (!scope) return { ok: false, error: 'An explicit valid revision scope is required.' };
    const job = ownerRevisionJob(state, itemId, opts.baseVersion, opts.runId);
    if (!job) return { ok: false, error: 'A revised item may only commit against its durable owner-authorized revision job.' };
    const clip = opts.clip || job.payload?.clip || null;
    const scoped = scopedRevisionPatch(item, patch, scope, clip);
    if (!scoped.ok) return scoped;
    const previous = snapshotForHistory(item);
    const history = item.history || [];
    const comments = item.owner_comments || [];
    Object.assign(item, scoped.item);
    item.history = history;
    item.owner_comments = comments;
    item.version = Number(previous.version || 1) + 1;
    item.updated_at = now();
    if (!['scheduled', 'published'].includes(item.status)) item.status = 'revision_approved';
    item.approved_by = opts.actor || 'owner';
    item.approved_at = now();
    // A checked content swap is not a new external publishing authorization. The
    // active item remains visible internally, but every publishing path must stop
    // until a separately implemented owner release removes this versioned hold.
    item.publish = Object.assign({}, item.publish || {}, { revision_hold: { active: true, version: item.version, set_at: now(), set_by: opts.actor || 'owner', reason: 'Reviewed content revision requires separate publishing authorization.' } });
    item.revision_status = 'owner_approved';
    item.revision = {
      status: 'owner_approved', owner_authorized: true, approved_by: opts.actor || 'owner', approved_at: now(),
      scope, clip, change_note: String(opts.request || '').trim(), run_id: String(opts.runId),
      job_id: job.id, base_version: Number(opts.baseVersion), final_qc: clone(opts.finalQc),
    };
    item.history.unshift({
      at: now(), by: opts.actor || 'owner', kind: 'reviewed_revision', version: previous.version, snapshot: previous,
      scope, clip, change_note: item.revision.change_note, run_id: String(opts.runId), final_qc: clone(opts.finalQc),
    });
    job.payload.run_id = String(opts.runId);
    job.payload.committed_version = item.version;
    job.result = { revision_applied: true, item_id: itemId, version: item.version, scope, run_id: String(opts.runId) };
    if (job.status !== 'done') setJobStatus(state, job.id, 'done', {}, opts.actor || 'studio');
    audit(state, opts.actor || 'owner', 'item.revision.approved', itemId, `v${previous.version} → v${item.version}; ${scope}; ${item.revision.change_note}`);
    return { ok: true, item, job };
  }

  /** Owner-only version restore. It creates a new active version and never schedules/publishes it. */
  function restoreItemVersion(state, itemId, version, opts) {
    opts = opts || {};
    if (opts.role !== 'owner') return { ok: false, error: 'Only the owner can restore a content version.' };
    const item = state.items.find((i) => i.item_id === itemId);
    if (!item) return { ok: false, error: 'Item not found' };
    if (!Number.isFinite(Number(opts.baseVersion)) || Number(opts.baseVersion) !== Number(item.version)) return { ok: false, error: `Stale restore: active version is v${item.version}.` };
    const targetVersion = Number(version);
    if (!Number.isFinite(targetVersion) || targetVersion === Number(item.version)) return { ok: false, error: 'Choose a prior version to restore.' };
    const entry = (item.history || []).find((h) => Number(h.version) === targetVersion && h.snapshot);
    if (!entry) return { ok: false, error: `Version v${version} is not available.` };
    const previous = snapshotForHistory(item);
    const restored = clone(entry.snapshot);
    const history = item.history || [];
    const comments = item.owner_comments || [];
    Object.assign(item, restored);
    item.item_id = previous.item_id;
    item.version = Number(previous.version || 1) + 1;
    item.status = previous.status;
    item.publish = clone(previous.publish);
    item.history = history;
    item.owner_comments = comments;
    item.updated_at = now();
    if (!['scheduled', 'published'].includes(item.status)) item.status = 'revision_approved';
    item.approved_by = opts.actor || 'owner';
    item.approved_at = now();
    item.publish = Object.assign({}, item.publish || {}, { revision_hold: { active: true, version: item.version, set_at: now(), set_by: opts.actor || 'owner', reason: 'Restored content version requires separate publishing authorization.' } });
    item.revision_status = 'owner_approved';
    item.revision = {
      status: 'owner_approved', owner_authorized: true, approved_by: opts.actor || 'owner', approved_at: now(),
      scope: 'restore', restored_from_version: targetVersion, change_note: String(opts.request || `Restored v${targetVersion}`).trim(),
      base_version: Number(opts.baseVersion), final_qc: entry.final_qc ? clone(entry.final_qc) : null,
    };
    comments.push({ at: now(), by: opts.actor || 'owner', kind: 'version_restore', text: item.revision.change_note, version: item.version, restored_from_version: targetVersion });
    item.history.unshift({
      at: now(), by: opts.actor || 'owner', kind: 'version_restore', version: previous.version, snapshot: previous,
      restored_from_version: targetVersion, change_note: item.revision.change_note,
    });
    audit(state, opts.actor || 'owner', 'item.version.restored', itemId, `v${targetVersion} restored as v${item.version}; ${item.revision.change_note}`);
    return { ok: true, item, restored_from_version: targetVersion };
  }

  /** Owner / marketer decision on one item. decision: approve | request_changes | reject */
  function decideItem(state, itemId, decision, opts, actor, role) {
    opts = opts || {};
    const item = state.items.find((i) => i.item_id === itemId);
    if (!item) return { ok: false, error: 'Item not found' };
    const ownerRevision = decision === 'request_changes' && role === 'owner';
    if (!ownerRevision && !['pending_approval', 'qc_failed', 'changes_requested', 'draft'].includes(item.status) && decision !== 'reject')
      return { ok: false, error: `Item is ${item.status}; nothing to decide.` };

    if (decision === 'approve') {
      if (role !== 'owner') return { ok: false, error: 'Only the owner can approve content.' };
      if (item.compliance && !item.compliance.pass && !opts.override)
        return { ok: false, error: 'Compliance blocks must be fixed first (or approve with a written override).', blocks: item.compliance.blocks };
      if (opts.override && !String(opts.reason || '').trim()) return { ok: false, error: 'An override needs a written reason.' };
      if (item.first_pass === null && item.version === 1 && item.owner_comments.length === 0) item.first_pass = true;
      else if (item.first_pass === null) item.first_pass = false;
      item.status = 'approved';
      item.approved_at = now();
      item.approved_by = actor;
      if (opts.override) item.owner_comments.push({ at: now(), by: actor, kind: 'override', text: opts.reason, version: item.version });
      audit(state, actor, 'item.approved', itemId, opts.override ? 'override: ' + opts.reason : `v${item.version}`);
      enqueueJob(state, 'schedule_post', { item_id: itemId, version: item.version, publish: item.publish, autopublish: state.settings.autopublish.enabled }, actor);
      return { ok: true, item };
    }

    if (decision === 'request_changes') {
      const text = String(opts.comment || '').trim();
      if (!text) return { ok: false, error: 'Write what should change.' };
      const guess = R.classifyChange(text, item);
      const scope = ownerRevision ? normaliseRevisionScope(opts.scope) : normaliseRevisionScope(opts.scope || guess.scope);
      if (!scope) return { ok: false, error: ownerRevision ? 'The owner must choose one explicit valid revision scope.' : 'Choose one valid revision scope.' };
      const requestedClip = opts.clip === undefined || opts.clip === null || opts.clip === '' ? null : Number(opts.clip);
      const clip = requestedClip || guess.clip || null;
      if (clip && (!Number.isInteger(Number(clip)) || Number(clip) < 1 || Number(clip) > 4)) return { ok: false, error: 'Choose a clip or slide from 1 to 4.' };
      if (item.first_pass === null) item.first_pass = false;
      item.owner_comments.push({ at: now(), by: actor, kind: 'change_request', text, scope, clip, version: item.version, owner_authorized: ownerRevision });
      if (ownerRevision) {
        const job = enqueueJob(state, 'revise_item', {
          item_id: itemId, from_version: item.version, base_version: item.version, scope, clip, comment: text, request: text,
          type: item.type, owner_authorized: true, revision_status: 'revision_pending', run_id: null,
        }, actor);
        // Keep the current content lifecycle (including any existing schedule/publish state) intact.
        item.revision_status = 'revision_pending';
        item.revision = { status: 'revision_pending', owner_authorized: true, requested_by: actor, requested_at: now(), request: text, scope, clip, base_version: item.version, job_id: job.id, run_id: null };
        audit(state, actor, 'item.revision.requested', itemId, `${scope}${clip ? ' clip ' + clip : ''}: ${text}`);
        return { ok: true, item, scope, clip, job };
      }
      item.status = 'changes_requested';
      audit(state, actor, 'item.changes_requested', itemId, `${scope}${clip ? ' clip ' + clip : ''}: ${text}`);
      const job = enqueueJob(state, 'revise_item', { item_id: itemId, from_version: item.version, scope, clip, comment: text, type: item.type, owner_authorized: false }, actor);
      return { ok: true, item, scope, clip, job };
    }

    if (decision === 'reject') {
      if (role !== 'owner') return { ok: false, error: 'Only the owner can reject content.' };
      if (item.first_pass === null) item.first_pass = false;
      item.owner_comments.push({ at: now(), by: actor, kind: 'reject', text: String(opts.comment || ''), version: item.version });
      item.status = 'rejected';
      audit(state, actor, 'item.rejected', itemId, opts.comment || '');
      enqueueJob(state, 'item_rejected', { item_id: itemId, comment: opts.comment || '' }, actor);
      if (state.settings.autopublish.enabled) disableAutopublish(state, `Item ${itemId} rejected`, 'system');
      return { ok: true, item };
    }
    return { ok: false, error: 'Unknown decision' };
  }

  function approveAllWeek(state, week, actor, role) {
    if (role !== 'owner') return { ok: false, error: 'Only the owner can approve content.' };
    const pending = state.items.filter((i) => R.weekOf(i.item_id) === week && i.status === 'pending_approval');
    const approved = [], skipped = [];
    for (const i of pending) {
      const r = decideItem(state, i.item_id, 'approve', {}, actor, role);
      (r.ok ? approved : skipped).push(i.item_id);
    }
    return { ok: true, approved, skipped };
  }

  /** Manus reports a publishing outcome. status: scheduled | published */
  function markPublished(state, itemId, status, info, actor) {
    const item = state.items.find((i) => i.item_id === itemId);
    if (!item) return { ok: false, error: 'Item not found' };
    if (item.publish?.revision_hold?.active) return { ok: false, error: `Item v${item.version} is a reviewed revision held for separate owner publishing authorization.` };
    if (!['scheduled', 'published'].includes(status)) return { ok: false, error: 'status must be scheduled or published' };
    if (!['approved', 'scheduled'].includes(item.status)) return { ok: false, error: `Item is ${item.status}; only approved items can be scheduled or published.` };
    item.status = status;
    item.publish = Object.assign({}, item.publish, info || {});
    audit(state, actor, 'item.' + status, itemId, info && info.meta_post_id ? 'Meta ' + info.meta_post_id : null);
    return { ok: true, item };
  }

  // ---------------- Friday action plan ----------------
  function upsertActions(state, list, actor) {
    const out = [];
    for (const a of list || []) {
      if (!a.change) return { ok: false, error: 'Each action needs a "change" field.' };
      const existing = a.id && state.actions.find((x) => x.id === a.id);
      if (existing) { Object.assign(existing, a, { updated_at: now() }); out.push(existing); continue; }
      const act = Object.assign({
        id: nextId(state, 'action', 'ACT'), week: a.week || null, change: '', reason: '', expected_impact: '', risk: '', rollback: '',
        kind: 'other', budget_delta_egp: 0, status: 'pending', comments: [], created_at: now(),
      }, a);
      act.id = act.id || nextId(state, 'action', 'ACT');
      state.actions.unshift(act);
      out.push(act);
    }
    audit(state, actor, 'actions.delivered', null, `${out.length} action(s)`);
    return { ok: true, actions: out };
  }

  function decideAction(state, id, decision, opts, actor, role) {
    opts = opts || {};
    const a = state.actions.find((x) => x.id === id);
    if (!a) return { ok: false, error: 'Action not found' };
    if (role !== 'owner') return { ok: false, error: 'Only the owner can decide on Meta actions.' };
    if (a.status !== 'pending') return { ok: false, error: `Action is already ${a.status}.` };
    if (opts.edit && typeof opts.edit === 'object') {
      for (const k of ['change', 'budget_delta_egp', 'rollback']) if (k in opts.edit) a[k] = opts.edit[k];
      a.edited = true;
    }
    if (decision === 'approve') {
      const g = summary(state).guardrails;
      const delta = Number(a.budget_delta_egp || 0);
      if (delta > 0 && g.projected !== null && g.daysInMonth) {
        const remainingDays = g.daysInMonth - g.day;
        const newProjected = g.projected + delta * remainingDays;
        if (newProjected > state.settings.monthlyAdCapEgp)
          return { ok: false, error: `Refused: this would project ${Math.round(newProjected).toLocaleString('en-US')} EGP for the month, above the ${state.settings.monthlyAdCapEgp.toLocaleString('en-US')} EGP cap.` };
      }
      a.status = 'approved';
      a.approved_at = now();
      a.approved_by = actor;
      audit(state, actor, 'action.approved', id, a.change);
      enqueueJob(state, a.kind === 'pause_adset' ? 'pause_adset' : 'execute_action', { action_id: id, change: a.change, kind: a.kind, budget_delta_egp: a.budget_delta_egp, rollback: a.rollback }, actor);
      return { ok: true, action: a };
    }
    if (decision === 'reject') {
      a.status = 'rejected';
      if (opts.comment) a.comments.push({ at: now(), by: actor, text: opts.comment });
      audit(state, actor, 'action.rejected', id, opts.comment || '');
      return { ok: true, action: a };
    }
    return { ok: false, error: 'Unknown decision' };
  }

  function actionResult(state, id, result, actor) {
    const a = state.actions.find((x) => x.id === id);
    if (!a) return { ok: false, error: 'Action not found' };
    if (a.status !== 'approved') return { ok: false, error: 'Only approved actions can be executed.' };
    a.status = result.status === 'failed' ? 'failed' : 'executed';
    a.execution = { at: now(), before: result.before || null, after: result.after || null, note: result.note || '' };
    audit(state, actor, 'action.' + a.status, id, result.note || '');
    return { ok: true, action: a };
  }

  /** Owner turns a guardrail alert into a pause action (still executed by Manus). */
  function proposePause(state, adsetName, actor) {
    return upsertActions(state, [{
      kind: 'pause_adset', change: `Pause ad set "${adsetName}"`, reason: 'CPL guardrail breach (above max CPL for 3+ days with 1,000+ EGP spent).',
      expected_impact: 'Stops spend on an ad set above the CPL ceiling.', risk: 'Lower lead volume until a replacement creative runs.',
      rollback: `Re-enable "${adsetName}" at its previous budget.`, budget_delta_egp: 0,
    }], actor);
  }

  // ---------------- Reports, news, plans ----------------
  function addReport(state, rep, actor) {
    if (!rep || !rep.month || rep.spendMtdEgp === undefined) return { ok: false, error: 'Report needs month and spendMtdEgp.' };
    const r = Object.assign({ id: nextId(state, 'report', 'REP'), received_at: now() }, rep);
    state.reports.unshift(r);
    if (state.reports.length > 120) state.reports.length = 120;
    const g = R.guardrails(r, state.settings);
    audit(state, actor, 'report.received', r.id, `${r.month} as of ${r.asOf}; ${g.alerts.length} alert(s)`);
    return { ok: true, report: r, guardrails: g };
  }

  function addNews(state, list, actor) {
    const out = [];
    for (const n of list || []) {
      if (!n.headline) return { ok: false, error: 'Each news item needs a headline.' };
      const item = Object.assign({ id: nextId(state, 'news', 'NEWS'), confidence: 'unconfirmed', selected: false, received_at: now() }, n);
      state.news.unshift(item);
      out.push(item);
    }
    if (state.news.length > 1000) state.news.length = 1000;
    audit(state, actor, 'news.received', null, `${out.length} item(s)`);
    return { ok: true, news: out };
  }

  function addPlan(state, plan, actor) {
    if (!plan || !plan.month || !plan.body) return { ok: false, error: 'Plan needs month and body.' };
    const p = Object.assign({ id: nextId(state, 'plan', 'PLAN'), status: 'pending_approval', received_at: now(), comments: [] }, plan);
    state.plans.unshift(p);
    audit(state, actor, 'plan.received', p.id, p.month);
    return { ok: true, plan: p };
  }

  function decidePlan(state, id, decision, comment, actor, role) {
    if (role !== 'owner') return { ok: false, error: 'Only the owner can decide on the monthly plan.' };
    const p = state.plans.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Plan not found' };
    if (comment) p.comments.push({ at: now(), by: actor, text: comment });
    p.status = decision === 'approve' ? 'approved' : 'changes_requested';
    audit(state, actor, 'plan.' + p.status, id, comment || '');
    if (decision !== 'approve') enqueueJob(state, 'custom', { kind: 'revise_monthly_plan', plan_id: id, comment }, actor);
    return { ok: true, plan: p };
  }

  // ---------------- Autopublish gate ----------------
  function enableAutopublish(state, actor, role) {
    if (role !== 'owner') return { ok: false, error: 'Only the owner can enable autopublish.' };
    const st = R.approvalStats(state.items, state.settings);
    if (!st.gateEligible) return { ok: false, error: `Not eligible yet: needs ${state.settings.manualWeeks} weeks and ≥ ${Math.round(state.settings.approvalThreshold * 100)}% first-pass approval.` };
    state.settings.autopublish = { enabled: true, enabledAt: now(), enabledBy: actor, disabledReason: null };
    audit(state, actor, 'autopublish.enabled', null, `cumulative ${(st.cumulative * 100).toFixed(1)}%`);
    enqueueJob(state, 'autopublish_on', { cumulative: st.cumulative }, actor);
    return { ok: true };
  }

  function disableAutopublish(state, reason, actor) {
    const was = state.settings.autopublish.enabled;
    state.settings.autopublish = Object.assign({}, state.settings.autopublish, { enabled: false, disabledReason: reason, disabledAt: now() });
    audit(state, actor, 'autopublish.disabled', null, reason);
    if (was) enqueueJob(state, 'autopublish_off', { reason }, actor);
    return { ok: true };
  }

  /** Kill switch: rolling 4-week approval below threshold. */
  function killSwitchCheck(state) {
    if (!state.settings.autopublish.enabled) return null;
    const st = R.approvalStats(state.items, state.settings);
    if (st.rolling4 !== null && st.rolling4 < state.settings.killSwitchRollingThreshold) {
      disableAutopublish(state, `Rolling 4-week approval ${(st.rolling4 * 100).toFixed(1)}% fell below ${state.settings.killSwitchRollingThreshold * 100}%`, 'system');
      return 'disabled';
    }
    return null;
  }

  // ---------------- Summary ----------------
  function latestReport(state) {
    return state.reports.slice().sort((a, b) => String(b.asOf || '').localeCompare(String(a.asOf || '')))[0] || null;
  }

  function summary(state) {
    const rep = latestReport(state);
    const stats = R.approvalStats(state.items, state.settings);
    const g = R.guardrails(rep, state.settings);
    const counts = {};
    for (const i of state.items) counts[i.status] = (counts[i.status] || 0) + 1;
    const jobsOpen = state.jobs.filter((j) => ['pending', 'sent', 'in_progress', 'needs_input'].includes(j.status)).length;
    const needsInput = state.jobs.filter((j) => j.status === 'needs_input').length;
    return { report: rep, approval: stats, guardrails: g, counts, jobsOpen, needsInput, actionsPending: state.actions.filter((a) => a.status === 'pending').length };
  }

  return {
    emptyState, enqueueJob, setJobStatus, applyManusWebhook, upsertBrief, normaliseRevisionScopes, applyReviewedRevision, restoreItemVersion, decideItem, approveAllWeek, markPublished,
    upsertActions, decideAction, actionResult, proposePause, addReport, addNews, addPlan, decidePlan,
    enableAutopublish, disableAutopublish, killSwitchCheck, summary, latestReport, audit,
  };
});

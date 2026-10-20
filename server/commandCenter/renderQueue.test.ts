import { describe, it, expect } from 'vitest';
import { createRenderQueue } from './renderQueue';
function setup(options: { fixedOutroUrl?: string } = {}) {
  const rows = new Map<string, any>();
  let inserts = 0;
  const q = async (sql: string, args: any[] = []) => {
    if (sql.startsWith('CREATE')) return [];
    if (sql.startsWith('INSERT IGNORE')) { inserts++; if (!rows.has(args[0])) rows.set(args[0], { id: args[0], status: 'pending', doc: args[4] }); return { affectedRows: 1 }; }
    if (sql.startsWith('SELECT')) return rows.has(args[0]) ? [rows.get(args[0])] : [];
    if (sql.startsWith("UPDATE ec_render_jobs SET status='pending'")) { const r = rows.get(args[2]); if (r && r.status === 'failed') { r.status = 'pending'; r.doc = args[1]; return { affectedRows: 1 }; } return { affectedRows: 0 }; }
    throw new Error('Unexpected SQL');
  };
  return { queue: createRenderQueue(q, { fixedOutroUrl: "https://cdn.example/ELEVAYEXTRO.mov", ...options }), rows, insertCount: () => inserts };
}
const input = { runId: 8, clipUrls: [1, 2, 3, 4].map(i => `https://cdn.example/clip${i}.mp4`), voiceUrls: [1, 2, 3, 4].map(i => `https://cdn.example/voice${i}.mp3`), narrationTargetSeconds: 20, narrationSceneSeconds: 5 };
describe('external render queue', () => {
  it('waits for an external worker and deduplicates identical saved inputs', async () => {
    const { queue, rows } = setup();
    const a = await queue.compose(input), b = await queue.compose(input);
    expect(a).toMatchObject({ pending: true, waitReason: 'Waiting for render worker' });
    expect(a.jobId).toBe(b.jobId); expect(rows.size).toBe(1);
    const d = JSON.parse(rows.get(a.jobId).doc); expect(d.manifest.threads).toBe(1);
    expect(d.manifest.outroUrl).toBe('https://cdn.example/ELEVAYEXTRO.mov');
    expect(d.manifest).toMatchObject({ narrationTargetSeconds: 20, narrationSceneSeconds: 5 });
  });
  it('waits fail-closed for ELEVAYEXTRO.mov rather than generating a logo substitute', async () => {
    // A whitespace override is intentionally truthy before trimming, so this
    // remains a fail-closed test even when the test environment has an outro URL.
    const { queue, rows } = setup({ fixedOutroUrl: " " });
    await expect(queue.compose(input)).resolves.toMatchObject({ stage: 'waiting_for_fixed_outro', jobId: null });
    expect(rows.size).toBe(0);
  });
  it('returns existing completed output instead of regenerating or rendering it again', async () => {
    const { queue, rows } = setup(); const a = await queue.compose(input);
    rows.set(a.jobId, { status: 'done', doc: JSON.stringify({ parts: { final: 'https://cdn.example/final.mp4' }, final: { url: 'https://cdn.example/final.mp4', peakRssBytes: 1234 } }) });
    expect(await queue.compose(input)).toMatchObject({ final: { url: 'https://cdn.example/final.mp4', peakRssBytes: 1234, renderJobId: a.jobId } });
  });
  it('creates a new job only when a saved input changes', async () => {
    const { queue, rows } = setup(); await queue.compose(input);
    await queue.compose({ ...input, clipUrls: ['https://cdn.example/new.mp4', ...input.clipUrls.slice(1)] });
    expect(rows.size).toBe(2);
  });
  it('fails closed on missing stored narration and reports external failures', async () => {
    const { queue, rows } = setup();
    await expect(queue.compose({ ...input, voiceUrls: [null] })).rejects.toThrow(/saved HTTPS/);
    const a = await queue.compose(input); rows.set(a.jobId, { status: 'failed', doc: JSON.stringify({ error: 'Encoder failed' }) });
    await expect(queue.compose(input)).rejects.toThrow(/Encoder failed/);
  });
  it('supports retained legacy jobs but fails closed on an unapproved narration target', async () => {
    const { queue } = setup();
    await expect(queue.compose({ ...input, runId: 9, narrationTargetSeconds: 18, narrationSceneSeconds: 4.5 })).resolves.toMatchObject({ pending: true });
    await expect(queue.compose({ ...input, narrationTargetSeconds: 21 })).rejects.toThrow(/four saved voice takes/);
  });
  it('sends a failed render back to the Mac on Retry, but never re-queues during plain polling', async () => {
    const { queue, rows } = setup(); const a = await queue.compose(input);
    rows.set(a.jobId, { id: a.jobId, status: 'failed', doc: JSON.stringify({ ...JSON.parse(rows.get(a.jobId).doc), error: 'old renderer timing' }) });
    await expect(queue.compose(input)).rejects.toThrow('old renderer timing');
    const retried = await queue.compose({ ...input, requeueFailed: true });
    expect(retried).toMatchObject({ pending: true, jobId: a.jobId });
    expect(rows.get(a.jobId).status).toBe('pending');
    expect(JSON.parse(rows.get(a.jobId).doc)).toMatchObject({ retriedAfter: 'old renderer timing' });
    expect(rows.size).toBe(1);
  });
});

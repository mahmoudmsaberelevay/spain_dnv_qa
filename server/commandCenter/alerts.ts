import { notifyOwner } from '../_core/notification';
import { sendAiStudioFailureAlert } from '../emailService';

export async function notifyAiFailure(run: any, step?: any, error?: string) {
  // Callers may pass an object payload or positional arguments.
  const r = run.run || run;
  const s = step || run.step || {};
  const reason = String(error || run.reason || run.error || s.error || 'Needs owner review').replace(/https?:\/\/\S+/g, '[asset]').slice(0, 1800);
  const label = String(s.title || s.action || run.stepName || 'Final reel review');
  const body = `Run #${r.id || run.runId}: ${label}\n${reason}\nhttps://elevay.vip/admin/#studio`;
  const results = await Promise.allSettled([
    notifyOwner({ title: `ELEVAY AI Studio: run #${r.id || run.runId} needs attention`, content: body }),
    sendAiStudioFailureAlert({ runId: r.id || run.runId, stepName: label, error: reason }),
  ]);
  return { dashboard: results[0].status === 'fulfilled' && results[0].value === true, email: results[1].status === 'fulfilled' && results[1].value === true };
}

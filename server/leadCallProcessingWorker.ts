import { processLeadCallQueue, purgeExpiredLeadCalls } from "./leadCallProcessing";
export { processLeadCallQueue, purgeExpiredLeadCalls, getCallProcessingReadiness } from "./leadCallProcessing";
/** Managed callback only. One stage, one shared request lifetime; never schedules or spawns work. */
export async function runLeadCallProcessingRecovery(options: { limit?: number; signal?: AbortSignal } = {}) {
  const timeout = AbortSignal.timeout(105_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const processing = await processLeadCallQueue({ limit: 1, signal });
  // Processing has priority; retention has an independent destructive-action gate and gets idle ticks.
  // Both share the same total 105-second lifecycle. The provider DELETE has its own 30-second cap.
  const retention = processing.claimed === 0 && !signal.aborted
    ? await purgeExpiredLeadCalls({ limit: 1, signal })
    : { purged: 0, failed: 0, blocked: 0 };
  return { processing, retention };
}

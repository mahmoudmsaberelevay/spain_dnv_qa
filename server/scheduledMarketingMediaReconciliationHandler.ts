import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { reconcileWaitingMarketingMediaJobs } from "./marketingMediaProductionService";

/** Authenticated WebDev Heartbeat: read existing Manus task status and attach
 * completed, system-generated review previews. No publication or ad authority. */
export async function scheduledMarketingMediaReconciliationHandler(req: Request, res: Response) {
  let identity: { isCron?: boolean; taskUid?: string };
  try { identity = await sdk.authenticateRequest(req) as { isCron?: boolean; taskUid?: string }; }
  catch { return res.status(401).json({ error: "authentication_required" }); }
  if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
  try {
    const result = await reconcileWaitingMarketingMediaJobs();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[MarketingMedia] Background reconciliation failed", error instanceof Error ? error.name : "unknown");
    return res.status(503).json({ error: "reconciliation_temporarily_unavailable" });
  }
}

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runMetaReconciliation } from "./metaLeadsService";

export async function scheduledMetaReconciliationHandler(req: Request, res: Response) {
  const startedAt = Date.now();
  let cronIdentity: { isCron?: boolean; taskUid?: string };
  try {
    const user = await sdk.authenticateRequest(req);
    cronIdentity = user as typeof user & { isCron?: boolean; taskUid?: string };
  } catch {
    return res.status(401).json({ error: "authentication-required" });
  }
  if (!cronIdentity.isCron || !cronIdentity.taskUid) {
    return res.status(403).json({ error: "cron-only" });
  }
  try {
    const result = await runMetaReconciliation({ limit: 200 });
    return res.json({
      ok: true,
      taskUid: cronIdentity.taskUid,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[MetaReconciliation] Scheduled run failed:", message);
    return res.status(500).json({
      error: "Meta reconciliation failed; review the sanitized integration diagnostics",
      timestamp: new Date().toISOString(),
    });
  }
}

import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { metaAssignmentPolicies } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { collectMetaMonitoringSnapshot, processMetaNotificationOutbox } from "./metaAssignmentMonitoring";

export async function scheduledMetaMonitoringHandler(req: Request, res: Response) {
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
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [policy] = await db.select({ id: metaAssignmentPolicies.id })
      .from(metaAssignmentPolicies)
      .where(eq(metaAssignmentPolicies.monitoringCronTaskUid, cronIdentity.taskUid))
      .limit(1);
    if (!policy) return res.json({ ok: true, skipped: "orphan-schedule" });

    const monitoring = await collectMetaMonitoringSnapshot();
    const notifications = await processMetaNotificationOutbox(25);
    return res.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      assignmentCoverageBps: monitoring.assignmentCoverageBps,
      unassignedOverTenMinutes: monitoring.unassignedOverTenMinutes,
      duplicateAttributionCount: monitoring.duplicateAttributionCount,
      ambiguousMatchCount: monitoring.ambiguousMatchCount,
      manualReviewCount: monitoring.manualReviewCount,
      testLeadLeakageCount: monitoring.testLeadLeakageCount,
      productionSendingEnabled: monitoring.productionSendingEnabled,
      notifications,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[MetaMonitoring] Scheduled run failed:", message);
    return res.status(500).json({
      error: "Meta monitoring failed; review the sanitized integration diagnostics",
      timestamp: new Date().toISOString(),
    });
  }
}

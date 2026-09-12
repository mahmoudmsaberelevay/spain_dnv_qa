import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { executeScheduledChatMessageByTaskUid } from "./clientChatService";

export async function scheduledClientChatMessageHandler(req: Request, res: Response) {
  let identity: { isCron?: boolean; taskUid?: string };
  try {
    identity = await sdk.authenticateRequest(req) as { isCron?: boolean; taskUid?: string };
  } catch {
    return res.status(401).json({ error: "unauthorized_schedule" });
  }
  if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
  try {
    const result = await executeScheduledChatMessageByTaskUid(identity.taskUid);
    return res.json(result);
  } catch (error) {
    const problem = error instanceof Error ? error : new Error("Scheduled client chat delivery failed");
    return res.status(500).json({
      error: problem.message,
      stack: problem.stack,
      context: { url: req.originalUrl, taskUid: identity.taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}

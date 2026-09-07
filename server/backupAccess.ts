import type { NextFunction, Request, Response } from "express";
import { sdk } from "./_core/sdk";

export async function requireBackupAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin") return res.status(403).json({ error: "admin-only" });
    return next();
  } catch {
    return res.status(401).json({ error: "authentication-required" });
  }
}

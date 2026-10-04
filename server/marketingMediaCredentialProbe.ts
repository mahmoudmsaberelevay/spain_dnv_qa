import crypto from "node:crypto";
import type { Request, Response } from "express";
import { mediaCredential } from "./manusMediaAuthentication";

/** Diagnostic only: signed, read-only, no credential values in responses. Remove after root cause is confirmed. */
export async function handleMarketingMediaCredentialProbe(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.JWT_SECRET;
  const timestamp = req.header("x-elevay-probe-time") ?? "";
  const signature = req.header("x-elevay-probe-signature") ?? "";
  const time = Number(timestamp);
  if (!secret || secret.length < 20 || !/^\d{13}$/.test(timestamp) || !Number.isSafeInteger(time) || Math.abs(Date.now() - time) > 60_000 || !/^[a-f0-9]{64}$/.test(signature)) {
    res.sendStatus(403); return;
  }
  const expected = crypto.createHmac("sha256", secret).update(`marketing-media-probe:${timestamp}`).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"))) { res.sendStatus(403); return; }
  const { value: key, fingerprint: keyFingerprint } = mediaCredential();
  let upstreamStatus = 0;
  try {
    const response = await fetch("https://api.manus.ai/v2/task.list?limit=1", {
      headers: { "x-manus-api-key": key }, signal: AbortSignal.timeout(12_000),
    });
    upstreamStatus = response.status;
  } catch { upstreamStatus = 0; }
  res.status(200).json({ credentialPresent: Boolean(key), keyFingerprint, upstreamStatus, route: "production-read-only-probe" });
}

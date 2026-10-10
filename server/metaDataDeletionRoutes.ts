import express, { type Express, type Request, type Response } from "express";
import {
  getMetaDataDeletionRequestStatus,
  registerMetaDataDeletionRequest,
} from "./metaPlatformEvents";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character] || character));
}

function deletionStatusPage(input: { code?: string; status?: string; receivedAt?: number | null }) {
  const status = input.status || "not-found";
  const title = status === "completed" ? "Data deletion completed" : status === "not-found" ? "Data deletion request" : "Data deletion request received";
  const message = status === "completed"
    ? "The data deletion request recorded by ELEVAY has been completed."
    : status === "not-found"
      ? "Enter the confirmation link supplied by ELEVAY to check the status of a Meta data deletion request."
      : "ELEVAY has received this verified Meta data deletion request. It is being handled under our published Privacy Policy and applicable retention obligations.";
  const reference = input.code ? `<p class="reference">Reference: ${escapeHtml(input.code)}</p>` : "";
  const received = input.receivedAt ? `<p class="small">Received: ${new Date(input.receivedAt).toISOString()}</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | ELEVAY</title><style>body{margin:0;background:#f8fafb;color:#1a2a3a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.65}.wrap{max-width:720px;margin:8vh auto;padding:36px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 36px #1a3a5c12}h1{color:#1A3A5C;margin:0 0 10px}.small{color:#64748b}.reference{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f0f9ff;padding:12px;border-radius:8px;word-break:break-all}a{color:#5BA3B8}</style></head><body><main class="wrap"><h1>${title}</h1><p>${message}</p>${reference}${received}<p><a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a></p></main></body></html>`;
}

/**
 * Meta posts a signed_request when a person requests data deletion. This route
 * verifies the app-secret signature and stores only a one-way user hash.
 */
export function registerMetaDataDeletionRoutes(app: Express) {
  app.post(
    "/api/meta/data-deletion",
    express.urlencoded({ extended: false, limit: "64kb" }),
    express.json({ type: "application/json", limit: "64kb" }),
    async (req: Request, res: Response) => {
      try {
        const signedRequest = typeof req.body?.signed_request === "string" ? req.body.signed_request : "";
        if (!signedRequest) return res.status(400).json({ error: "signed_request is required" });
        const result = await registerMetaDataDeletionRequest(signedRequest);
        return res.status(200).json({ url: result.statusUrl, confirmation_code: result.confirmationCode });
      } catch (error) {
        console.warn("[MetaDataDeletion] Rejected callback:", error instanceof Error ? error.message : "unknown");
        return res.status(400).json({ error: "Invalid data deletion request" });
      }
    },
  );

  app.get("/data-deletion", async (req: Request, res: Response) => {
    const code = typeof req.query.confirmation_code === "string" ? req.query.confirmation_code.slice(0, 80) : "";
    if (!code) return res.status(200).type("html").send(deletionStatusPage({}));
    const status = await getMetaDataDeletionRequestStatus(code).catch(() => null);
    return res.status(200).type("html").send(deletionStatusPage({
      code,
      status: status?.status,
      receivedAt: status?.receivedAt,
    }));
  });
}

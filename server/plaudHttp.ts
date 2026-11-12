import type { Express } from "express";
import { TRPCError } from "@trpc/server";
import rateLimit from "express-rate-limit";
import { requirePlaudActor, plaudSessionHash } from "./plaudAccess";
import { PlaudProvider } from "./plaudProvider";
import { streamPlaudExport } from "./plaudTranscriptDb";
import { parsePlaudRange, resolvePlaudTimeZone } from "./plaudTranscriptFormat";
const provider = new PlaudProvider();
export function registerPlaudRoutes(app: Express) {
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).type("text/plain").send("PLAUD_RATE_LIMITED"),
  });
  app.use(
    "/api/plaud",
    (_req, res, next) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      next();
    },
    limiter
  );
  app.get("/api/plaud/oauth/callback", async (req, res) => {
    try {
      const actor = await requirePlaudActor(req);
      const state = req.query.state,
        code = req.query.code;
      if (
        req.query.error ||
        typeof state !== "string" ||
        typeof code !== "string" ||
        state.length > 512 ||
        code.length > 4096 ||
        !state ||
        !code
      )
        throw new Error("invalid");
      const completed = await provider.finish(
        actor.id,
        plaudSessionHash(req),
        state,
        code
      );
      if (
        !/^\/leads\/[1-9]\d*$/.test(completed.returnPath) &&
        completed.returnPath !== "/profile"
      )
        throw new Error("return");
      res.redirect(303, completed.returnPath);
    } catch {
      // No raw query, authorization code, provider message, credential or profile data.
      res
        .status(400)
        .type("text/plain")
        .send(
          "Plaud connection was not completed. Return to the CRM Lead, reconnect Plaud, and authorize with the same signed-in CRM user."
        );
    }
  });
  app.get("/api/plaud/transcripts/export", async (req, res) => {
    try {
      const actor = await requirePlaudActor(req);
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "PLAUD_EXPORT_ORIGIN_DENIED",
        });
      if (
        Object.keys(req.query).some(key => !["from", "to"].includes(key)) ||
        typeof req.query.from !== "string" ||
        typeof req.query.to !== "string"
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "PLAUD_DATE_RANGE_INVALID",
        });
      const range = { from: req.query.from, to: req.query.to };
      try {
        parsePlaudRange(range, resolvePlaudTimeZone(), true);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "PLAUD_DATE_RANGE_INVALID",
        });
      }
      await streamPlaudExport(actor, range, res);
      res.end();
    } catch (error) {
      // After streaming starts abort rather than returning a deceptively complete .txt.
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status =
        error instanceof TRPCError
          ? ((
              {
                UNAUTHORIZED: 401,
                FORBIDDEN: 403,
                BAD_REQUEST: 400,
                NOT_FOUND: 404,
              } as Record<string, number>
            )[error.code] ?? 503)
          : 503;
      const message =
        status === 404
          ? "No Plaud transcripts found for this date range"
          : status === 400
            ? "PLAUD_DATE_RANGE_INVALID"
            : status === 401
              ? "PLAUD_SIGN_IN_REQUIRED"
              : "PLAUD_EXPORT_FAILED";
      res.removeHeader("Content-Disposition");
      res.removeHeader("X-Plaud-Transcript-Count");
      res.status(status).type("text/plain; charset=utf-8").send(message);
    }
  });
}

import express from "express";
import { createServer, get, type Server, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), sessionHash: vi.fn(), stream: vi.fn(), finish: vi.fn() }));
vi.mock("./plaudAccess", () => ({ requirePlaudActor: mocks.actor, plaudSessionHash: mocks.sessionHash }));
vi.mock("./plaudTranscriptDb", () => ({ streamPlaudExport: mocks.stream }));
vi.mock("./plaudProvider", () => ({ PlaudProvider: class { finish = mocks.finish; } }));
import { registerPlaudRoutes } from "./plaudHttp";

const actor = { id: 7, name: "Synthetic employee", email: "synthetic@example.invalid", openId: "synthetic-7", role: "user" as const };
const validPath = "/api/plaud/transcripts/export?from=2026-11-01&to=2026-11-12";
const range = { from: "2026-11-01", to: "2026-11-12" };
let server: Server;
let port: number;

type HttpResult = { status: number; headers: IncomingHttpHeaders; body: Buffer; aborted: boolean; complete: boolean };
/** Only talks to this test's loopback server. No supertest package, external
 * requests, live DB, provider credentials or production cookies are involved. */
function request(path = validPath, authenticated = true, headers: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = get({ host: "127.0.0.1", port, path, headers: { ...(authenticated ? { cookie: "synthetic_session=present" } : {}), ...headers } }, res => {
      const chunks: Buffer[] = [];
      let settled = false;
      const settle = (aborted: boolean) => {
        if (settled) return;
        settled = true;
        resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks), aborted, complete: res.complete });
      };
      res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("end", () => settle(false));
      res.on("aborted", () => settle(true));
      res.on("error", () => settle(true));
    });
    req.setTimeout(4000, () => req.destroy(Error("test HTTP timeout")));
    req.on("error", reject);
  });
}
function exportHeaders(res: any, count: number) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="plaud_transcripts_2026-11-01_to_2026-11-12.txt"');
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Plaud-Transcript-Count", String(count));
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("ELEVAY_BUSINESS_TIME_ZONE", "Africa/Cairo");
  mocks.actor.mockImplementation(async req => {
    if (!req.headers.cookie?.includes("synthetic_session=present")) throw new TRPCError({ code: "UNAUTHORIZED" });
    return actor;
  });
  mocks.sessionHash.mockReturnValue("synthetic-session-hash");
  mocks.finish.mockResolvedValue({ returnPath: "/leads/42" });
  mocks.stream.mockImplementation(async (_actor, _range, res) => { exportHeaders(res, 1); res.write("Speaker: original synthetic transcript أهلاً\n\nInternal paragraph.", "utf8"); return { count: 1 }; });
  const app = express();
  registerPlaudRoutes(app);
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("authenticated PLAUD TXT download HTTP contract", () => {
  it("rejects logged-out requests with 401 before data retrieval or provider access", async () => {
    const result = await request(validPath, false);
    expect(result.status).toBe(401);
    expect(result.body.toString()).toBe("PLAUD_SIGN_IN_REQUIRED");
    expect(result.headers["content-disposition"]).toBeUndefined();
    expect(result.headers["cache-control"]).toContain("no-store");
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("admits a non-admin CRM actor and forwards the complete range without pagination to the shared stream", async () => {
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.complete).toBe(true);
    expect(result.aborted).toBe(false);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0].slice(0, 2)).toEqual([actor, range]);
    expect(result.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(result.headers["content-disposition"]).toBe('attachment; filename="plaud_transcripts_2026-11-01_to_2026-11-12.txt"');
    expect(result.headers["cache-control"]).toContain("no-store");
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
    expect(result.headers["referrer-policy"]).toBe("no-referrer");
    expect(result.headers.location).toBeUndefined();
    expect(result.body.toString("utf8")).toBe("Speaker: original synthetic transcript أهلاً\n\nInternal paragraph.");
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it.each([
    "", "?from=2026-11-01", "?to=2026-11-12", "?from=&to=", "?from=2026-02-29&to=2026-11-12",
    "?from=2026-11-13&to=2026-11-12", "?from=2026-11-01&to=2026-13-01", "?from=2026-1-01&to=2026-11-12",
    "?from=2026-11-01T00%3A00%3A00Z&to=2026-11-12", "?from=2026-11-01&to=2026-11-12&page=2",
    "?from=2026-11-01&to=2026-11-12&limit=100", "?from=2026-11-01&from=2026-11-02&to=2026-11-12",
    "?from[x]=2026-11-01&to=2026-11-12",
  ])("rejects incomplete, malformed, reversed or extra-filter query %s with 400", async query => {
    const result = await request("/api/plaud/transcripts/export" + query);
    expect(result.status).toBe(400);
    expect(result.body.toString()).toBe("PLAUD_DATE_RANGE_INVALID");
    expect(result.headers["content-disposition"]).toBeUndefined();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("rejects cross-site export before data access", async () => {
    const result = await request(validPath, true, { "sec-fetch-site": "cross-site" });
    expect(result.status).toBe(403);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(result.headers["content-disposition"]).toBeUndefined();
  });
  it("returns the exact no-match message with 404 and strips stale download headers", async () => {
    mocks.stream.mockImplementationOnce(async (_actor, _range, res) => {
      exportHeaders(res, 0);
      throw new TRPCError({ code: "NOT_FOUND", message: "No Plaud transcripts found for this date range" });
    });
    const result = await request();
    expect(result.status).toBe(404);
    expect(result.body.toString()).toBe("No Plaud transcripts found for this date range");
    expect(result.headers["content-disposition"]).toBeUndefined();
    expect(result.headers["x-plaud-transcript-count"]).toBeUndefined();
    expect(result.headers["cache-control"]).toContain("no-store");
  });
  it("streams every byte of a large >100-record Arabic/English response with exact three-LF separators, without provider/log/storage side effects", async () => {
    const blocks = Array.from({ length: 301 }, (_, index) => `[00:01] المتحدث ${index}: ${"نص أصلي English 😀 ".repeat(250)}\n\nSpeaker 2: keep internal paragraphs ${index}.`);
    const expected = blocks.join("\n\n\n");
    mocks.stream.mockImplementationOnce(async (_actor, _range, res) => {
      exportHeaders(res, blocks.length);
      for (let index = 0; index < blocks.length; index++) {
        if (!res.write((index ? "\n\n\n" : "") + blocks[index], "utf8")) await once(res, "drain");
      }
      return { count: blocks.length };
    });
    const logs = [vi.spyOn(console, "log").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined), vi.spyOn(console, "error").mockImplementation(() => undefined)];
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.headers["x-plaud-transcript-count"]).toBe("301");
    expect(new TextDecoder("utf-8", { fatal: true }).decode(result.body)).toBe(expected);
    expect(result.body.equals(Buffer.from(expected, "utf8"))).toBe(true);
    expect(result.body.toString().split("\n\n\n")).toHaveLength(301);
    expect(result.complete).toBe(true);
    expect(result.aborted).toBe(false);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.sessionHash).not.toHaveBeenCalled();
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain("نص أصلي");
    expect(result.headers.location).toBeUndefined();
  });
  it("maps pre-header retrieval failures to a private generic 503, never leaking provider body or query secrets", async () => {
    const sensitive = "PRIVATE PROVIDER TOKEN transcript-body مرحباً";
    mocks.stream.mockRejectedValueOnce(Error(sensitive));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await request();
    expect(result.status).toBe(503);
    expect(result.body.toString()).toBe("PLAUD_EXPORT_FAILED");
    expect(result.body.toString()).not.toContain(sensitive);
    expect(result.headers["content-disposition"]).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain(sensitive);
  });
  it("aborts after a partial streamed write rather than completing a corrupt successful attachment", async () => {
    mocks.stream.mockImplementationOnce(async (_actor, _range, res) => {
      exportHeaders(res, 301);
      res.write("Speaker: first partial transcript مرحباً", "utf8");
      await new Promise(resolve => setTimeout(resolve, 25));
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "private retrieval failure" });
    });
    const result = await request();
    expect(result.status).toBe(200); // Headers necessarily precede the later failure.
    expect(result.body.toString()).toBe("Speaker: first partial transcript مرحباً");
    expect(result.aborted).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.body.toString()).not.toContain("PLAUD_EXPORT_FAILED");
    expect(result.body.toString()).not.toContain("private retrieval failure");
  });
  it("does not expose a public transcript URL or additional recording-list endpoint", async () => {
    const result = await request("/api/plaud/transcripts/public/synthetic.txt", false);
    expect(result.status).toBe(404);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
});

describe("PLAUD OAuth callback privacy and binding", () => {
  it("binds completion to the current actor/session and only redirects to a local Lead", async () => {
    const result = await request("/api/plaud/oauth/callback?state=synthetic-state&code=synthetic-authorization-code");
    expect(result.status).toBe(303);
    expect(result.headers.location).toBe("/leads/42");
    expect(mocks.finish).toHaveBeenCalledWith(actor.id, "synthetic-session-hash", "synthetic-state", "synthetic-authorization-code");
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(result.headers["cache-control"]).toContain("no-store");
  });
  it.each(["https://evil.invalid", "//evil.invalid", "/leads/42?token=secret", "/admin", "/leads/0"])("rejects unsafe callback return path %s", async returnPath => {
    mocks.finish.mockResolvedValueOnce({ returnPath });
    const result = await request("/api/plaud/oauth/callback?state=synthetic-state&code=synthetic-code");
    expect(result.status).toBe(400);
    expect(result.headers.location).toBeUndefined();
    expect(result.body.toString()).not.toContain(returnPath);
  });
  it("does not call the provider for a logged-out or denied/malformed callback", async () => {
    const result = await request("/api/plaud/oauth/callback?state=synthetic-state&code=synthetic-code", false);
    expect(result.status).toBe(400);
    expect(mocks.finish).not.toHaveBeenCalled();
    const denied = await request("/api/plaud/oauth/callback?error=access_denied&state=synthetic-state&code=private-code");
    expect(denied.status).toBe(400);
    expect(denied.body.toString()).not.toContain("private-code");
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("does not leak raw provider exceptions or authorization codes in responses/logs", async () => {
    const secret = "PRIVATE provider body and refresh token";
    mocks.finish.mockRejectedValueOnce(Error(secret));
    const logs = [vi.spyOn(console, "error").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined)];
    const result = await request("/api/plaud/oauth/callback?state=synthetic-state&code=private-authorization-code");
    expect(result.status).toBe(400);
    expect(result.body.toString()).not.toContain(secret);
    expect(result.body.toString()).not.toContain("private-authorization-code");
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
});

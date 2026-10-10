import express from "express";
import { createServer, type Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  verifySignature: vi.fn(),
  storeNotifications: vi.fn(),
  storePlatformEvents: vi.fn(),
  processInbox: vi.fn(),
}));

vi.mock("./metaLeadsService", () => ({
  verifyMetaWebhookVerifyToken: mocks.verifyToken,
  verifyMetaWebhookSignature: mocks.verifySignature,
  storeMetaWebhookNotifications: mocks.storeNotifications,
  processMetaWebhookInboxBatch: mocks.processInbox,
}));

vi.mock("./metaPlatformEvents", () => ({
  storeMetaPlatformWebhookEvents: mocks.storePlatformEvents,
}));

import {
  META_WEBHOOK_PATHS,
  processMetaLeadEvent,
  registerMetaAdsWebhookRoutes,
  verifyMetaWebhook,
} from "./metaAdsWebhook";

const servers: Server[] = [];

async function startWebhookTestServer() {
  const app = express();
  registerMetaAdsWebhookRoutes(app);
  app.use((_req, res) => res.status(200).type("html").send("<!doctype html><title>SPA fallback</title>"));
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

function responseRecorder(order: string[] = []) {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    setHeader: vi.fn(),
    type: vi.fn(() => response),
    send: vi.fn((body: unknown) => { order.push("respond"); response.body = body; return response; }),
    json: vi.fn((body: unknown) => { order.push("respond"); response.body = body; return response; }),
  };
  return response;
}

describe("Meta Lead Ads webhook transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
    mocks.verifyToken.mockImplementation(async (value: string) => value === "verify-me");
    mocks.verifySignature.mockReturnValue(true);
    mocks.storeNotifications.mockResolvedValue({ accepted: 1, ignored: 0 });
    mocks.storePlatformEvents.mockResolvedValue({ accepted: 1, ignored: 0 });
    mocks.processInbox.mockResolvedValue({ selected: 1, processed: 1, failed: 0 });
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  });

  it("returns the challenge only for the exact configured verify token", async () => {
    const ok = responseRecorder();
    await verifyMetaWebhook({ query: { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" } } as any, ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("12345");
    expect(ok.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store, no-cache, must-revalidate");

    const denied = responseRecorder();
    await verifyMetaWebhook({ query: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" } } as any, denied);
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toBe("Forbidden");
  });

  it("rejects an invalid signature before parsing or storing a payload", async () => {
    mocks.verifySignature.mockReturnValue(false);
    const response = responseRecorder();
    await processMetaLeadEvent({ body: Buffer.from("{}"), headers: { "x-hub-signature-256": "sha256=bad" } } as any, response);
    expect(response.statusCode).toBe(401);
    expect(mocks.storeNotifications).not.toHaveBeenCalled();
  });

  it("durably stores first, acknowledges, and only then starts deferred processing", async () => {
    const order: string[] = [];
    mocks.storeNotifications.mockImplementation(async () => { order.push("store"); return { accepted: 1, ignored: 0 }; });
    mocks.processInbox.mockImplementation(async () => { order.push("process"); return { selected: 1, processed: 1, failed: 0 }; });
    const response = responseRecorder(order);
    const body = Buffer.from(JSON.stringify({ object: "page", entry: [] }));

    await processMetaLeadEvent({ body, headers: { "x-hub-signature-256": "sha256=valid" } } as any, response);
    await new Promise(resolve => setImmediate(resolve));

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ received: true, accepted: 1, ignored: 0 });
    expect(mocks.storePlatformEvents).toHaveBeenCalledWith({ object: "page", entry: [] }, true);
    expect(order.slice(0, 3)).toEqual(["store", "respond", "process"]);
  });

  it("routes the exact production callback before an SPA fallback and preserves all required statuses", async () => {
    expect(META_WEBHOOK_PATHS).toContain("/api/webhooks/meta-leads-v2");
    const baseUrl = await startWebhookTestServer();
    const callback = `${baseUrl}/api/webhooks/meta-leads-v2`;

    const validGet = await fetch(`${callback}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=challenge-123`);
    expect(validGet.status).toBe(200);
    expect(await validGet.text()).toBe("challenge-123");

    const invalidGet = await fetch(`${callback}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`);
    expect(invalidGet.status).toBe(403);
    expect(await invalidGet.text()).toBe("Forbidden");

    mocks.verifySignature.mockReturnValue(false);
    const unsignedPost = await fetch(callback, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "page", entry: [] }),
    });
    expect(unsignedPost.status).toBe(401);
    expect(await unsignedPost.text()).toBe("Invalid signature");

    mocks.verifySignature.mockReturnValue(true);
    const signedPost = await fetch(callback, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=valid" },
      body: JSON.stringify({ object: "page", entry: [] }),
    });
    expect(signedPost.status).toBe(200);
    expect(await signedPost.json()).toEqual({ received: true, accepted: 1, ignored: 0 });
    expect(mocks.storeNotifications).toHaveBeenCalledTimes(1);
  });
});

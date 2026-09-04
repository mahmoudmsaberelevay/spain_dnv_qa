import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  verifySignature: vi.fn(),
  storeNotifications: vi.fn(),
  processInbox: vi.fn(),
}));

vi.mock("./metaLeadsService", () => ({
  verifyMetaWebhookVerifyToken: mocks.verifyToken,
  verifyMetaWebhookSignature: mocks.verifySignature,
  storeMetaWebhookNotifications: mocks.storeNotifications,
  processMetaWebhookInboxBatch: mocks.processInbox,
}));

import { processMetaLeadEvent, verifyMetaWebhook } from "./metaAdsWebhook";

function responseRecorder(order: string[] = []) {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
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
    mocks.processInbox.mockResolvedValue({ selected: 1, processed: 1, failed: 0 });
  });

  it("returns the challenge only for the exact configured verify token", async () => {
    const ok = responseRecorder();
    await verifyMetaWebhook({ query: { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" } } as any, ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("12345");

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
    expect(order.slice(0, 3)).toEqual(["store", "respond", "process"]);
  });
});

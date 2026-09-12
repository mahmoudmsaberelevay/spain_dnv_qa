import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, executeScheduledClientChatMessage } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  executeScheduledClientChatMessage: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("./clientChatService", () => ({ executeScheduledChatMessageByTaskUid: executeScheduledClientChatMessage }));

import { scheduledClientChatMessageHandler } from "./scheduledClientChatMessageHandler";

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("scheduled Client Chat message handler", () => {
  beforeEach(() => {
    authenticateRequest.mockReset();
    executeScheduledClientChatMessage.mockReset();
  });

  it("rejects unauthenticated and non-cron callers", async () => {
    authenticateRequest.mockRejectedValueOnce(new Error("no session"));
    const unauthorized = response();
    await scheduledClientChatMessageHandler({ originalUrl: "/api/scheduled/clientChatMessage" } as any, unauthorized);
    expect(unauthorized.status).toHaveBeenCalledWith(401);

    authenticateRequest.mockResolvedValueOnce({ isCron: false });
    const forbidden = response();
    await scheduledClientChatMessageHandler({ originalUrl: "/api/scheduled/clientChatMessage" } as any, forbidden);
    expect(forbidden.status).toHaveBeenCalledWith(403);
  });

  it("executes only by the authenticated task UID", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-task-1" });
    executeScheduledClientChatMessage.mockResolvedValue({ ok: true, sent: true });
    const res = response();
    await scheduledClientChatMessageHandler({ originalUrl: "/api/scheduled/clientChatMessage", body: { scheduledMessageId: 999 } } as any, res);
    expect(executeScheduledClientChatMessage).toHaveBeenCalledWith("cron-task-1");
    expect(res.json).toHaveBeenCalledWith({ ok: true, sent: true });
  });

  it("returns an investigation-safe JSON error for retryable failures", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-task-2" });
    executeScheduledClientChatMessage.mockRejectedValue(new Error("temporary delivery failure"));
    const res = response();
    await scheduledClientChatMessageHandler({ originalUrl: "/api/scheduled/clientChatMessage" } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "temporary delivery failure", context: { url: "/api/scheduled/clientChatMessage", taskUid: "cron-task-2" } }));
  });
});

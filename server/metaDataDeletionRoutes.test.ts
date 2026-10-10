import express from "express";
import { createServer, type Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  status: vi.fn(),
}));

vi.mock("./metaPlatformEvents", () => ({
  registerMetaDataDeletionRequest: mocks.register,
  getMetaDataDeletionRequestStatus: mocks.status,
}));

import { registerMetaDataDeletionRoutes } from "./metaDataDeletionRoutes";

const servers: Server[] = [];

async function startServer() {
  const app = express();
  registerMetaDataDeletionRoutes(app);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  return `http://127.0.0.1:${address.port}`;
}

describe("Meta data deletion callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.register.mockResolvedValue({ confirmationCode: "elevay-confirmation", statusUrl: "https://elevay.vip/data-deletion?confirmation_code=elevay-confirmation" });
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  });

  it("accepts a form-encoded signed request and returns Meta's confirmation contract", async () => {
    const base = await startServer();
    const result = await fetch(`${base}/api/meta/data-deletion`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: "signed-value" }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      url: "https://elevay.vip/data-deletion?confirmation_code=elevay-confirmation",
      confirmation_code: "elevay-confirmation",
    });
    expect(mocks.register).toHaveBeenCalledWith("signed-value");
  });

  it("does not expose raw deletion records on the public status page", async () => {
    mocks.status.mockResolvedValue({ confirmationCode: "elevay-confirmation", status: "received", receivedAt: 1_791_000_000_000 });
    const base = await startServer();
    const result = await fetch(`${base}/data-deletion?confirmation_code=elevay-confirmation`);
    expect(result.status).toBe(200);
    const html = await result.text();
    expect(html).toContain("Data deletion request received");
    expect(html).toContain("elevay-confirmation");
    expect(html).not.toContain("metaUserHash");
  });
});

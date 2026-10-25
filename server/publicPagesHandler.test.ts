import express from "express";
import { createServer, type Server } from "http";
import { afterEach, describe, expect, it } from "vitest";
import { registerPublicPages } from "./publicPagesHandler";

const servers: Server[] = [];

async function startServer() {
  const app = express();
  registerPublicPages(app);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("public ELEVAY privacy policy", () => {
  it("accurately describes the current Meta Lead Ads-only scope without claiming pending messaging or publishing features", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/privacy`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("receive Lead Ads webhook notifications");
    expect(html).toContain("retrieve submitted Lead Ad responses server-to-server");
    expect(html).toContain("Messaging, Page/Instagram publishing, and interaction features remain inactive");
    expect(html).not.toContain("support approved business Page and Instagram interactions");
  });
});

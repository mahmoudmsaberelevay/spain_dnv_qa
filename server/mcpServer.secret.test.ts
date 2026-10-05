import { describe, expect, it } from "vitest";

describe("ELEVAY Claude MCP configured secret", () => {
  it.skipIf(!process.env.ELEVAY_CLAUDE_MCP_READ_TOKEN)("reaches the protected endpoint with the configured token", async () => {
    const baseUrl = process.env.ELEVAY_MCP_TEST_URL ?? "http://127.0.0.1:3000";
    const response = await fetch(`${baseUrl}/api/mcp`, {
      headers: {
        authorization: `Bearer ${process.env.ELEVAY_CLAUDE_MCP_READ_TOKEN}`,
        accept: "application/json, text/event-stream",
      },
    });
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(503);
  });
});

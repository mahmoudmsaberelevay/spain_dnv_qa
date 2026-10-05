import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./mcpServer.ts", import.meta.url), "utf8");

describe("ELEVAY Claude MCP read-only boundary", () => {
  it("fails closed without a configured bearer token and validates it safely", () => {
    expect(source).toContain("ELEVAY_CLAUDE_MCP_READ_TOKEN");
    expect(source).toContain('authorization.startsWith("Bearer ")');
    expect(source).toContain("crypto.timingSafeEqual");
    expect(source).toContain("MCP connector is not configured");
  });

  it("exposes complete Lead read tools and no mutation tools", () => {
    expect(source).toContain('server.registerTool("search_leads"');
    expect(source).toContain('server.registerTool("get_lead_details"');
    expect(source).toContain("leadActivities");
    expect(source).toContain("leadNotes");
    expect(source).toContain("leadTasks");
    expect(source).not.toMatch(/server\.registerTool\("(create|update|delete|assign|message)_lead/);
  });

  it("mounts authentication before the remote MCP handler", () => {
    expect(source).toContain('app.all("/api/mcp"');
    expect(source).toContain("if (!authenticateReadOnlyMcp(req, res)) return;");
  });
});

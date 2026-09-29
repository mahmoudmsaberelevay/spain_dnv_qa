import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Brand Studio implementation contract", () => {
  it("persists a separate additive control plane without altering legacy Marketing or CRM records", () => {
    const migration = read("drizzle/0091_agentic_marketing_brand_studio.sql");
    for (const table of [
      "marketing_system_role_assignments",
      "marketing_provider_profiles",
      "marketing_brand_discovery_sessions",
      "marketing_brand_discovery_answers",
      "marketing_brand_books",
    ]) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \`${table}\``);
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER)\b/i);
  });

  it("requires owner control for discovery, reset, approval, provider configuration, and role administration", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("await requireOwner(ctx.user);");
    expect(router).toContain("Only Mahmoud can change Brand Studio, provider, role, approval, or campaign governance.");
    expect(router).toContain("status: \"active\"");
    expect(router).toContain("status: \"superseded\"");
    expect(router).toContain("contentHash");
    expect(router).toContain("writeAuditLog");
    expect(router).toContain("Provider profiles are disabled by default");
  });

  it("keeps the UI one-question-at-a-time and states that publishing is locked", () => {
    const page = read("client/src/pages/marketing/BrandStudio.tsx");
    expect(page).toContain("one question is visible at a time");
    expect(page).toContain("Question {currentQuestion.number} of {session.totalQuestions}");
    expect(page).toContain("Publishing locked");
    expect(page).toContain("No client PII is sent to a content model");
    expect(page).toContain("Save and continue");
  });
});

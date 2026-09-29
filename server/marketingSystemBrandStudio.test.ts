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
    expect(router).toContain("await requireMarketingSystemAdministrator(ctx.user);");
    expect(router).toContain("This action requires the scoped Agentic Marketing System administrator role.");
    expect(router).toContain("status: \"active\"");
    expect(router).toContain("status: \"superseded\"");
    expect(router).toContain("contentHash");
    expect(router).toContain("writeAuditLog");
    expect(router).toContain("Provider profiles are disabled by default");
  });

  it("shows the complete resumable owner form and states that publishing is locked", () => {
    const page = read("client/src/pages/marketing/BrandStudio.tsx");
    expect(page).toContain("ELEVAY Brand Discovery — 35 Questions");
    expect(page).toContain("all questions in one form");
    expect(page).toContain("Save complete form");
    expect(page).toContain("questionsBySection.map");
    expect(page).toContain("Publishing locked");
    expect(page).toContain("No client PII is sent to a content model");
  });

  it("keeps full-form saves owner-only, bounded, atomic, and auditable", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("const bulkAnswerInput");
    expect(router).toContain("answers: z.array(answerInput.omit({ sessionId: true })).min(1).max(BRAND_DISCOVERY_TOTAL_QUESTIONS)");
    expect(router).toContain("saveDiscoveryAnswers: protectedProcedure.input(bulkAnswerInput)");
    expect(router).toContain("await requireMarketingSystemAdministrator(ctx.user);");
    expect(router).toContain("await db.transaction(async tx =>");
    expect(router).toContain("marketing_brand_discovery_bulk_answers");
    expect(router).toContain("Each Brand Discovery question can appear only once in a save request.");
  });
});

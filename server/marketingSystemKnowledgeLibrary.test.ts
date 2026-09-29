import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Marketing System Knowledge Library contract", () => {
  it("uses an additive source-and-claim schema with evidence hashes and status indexes", () => {
    const migration = read("drizzle/0092_agentic_marketing_knowledge_library.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_knowledge_sources`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_knowledge_claims`");
    expect(migration).toContain("`snapshotHash` VARCHAR(64)");
    expect(migration).toContain("`sourceSnapshotHash` VARCHAR(64) NOT NULL");
    expect(migration).toContain("`contentHash` VARCHAR(64) NOT NULL");
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER)\b/i);
  });

  it("requires a role for source submission, an owner for approval, and a tracked approved source for claims", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain('await requireCapability(ctx.user, "manage_knowledge_sources")');
    expect(router).toContain("await requireOwner(ctx.user);");
    expect(router).toContain("Only an owner-approved, tracked source snapshot may support a proposed claim.");
    expect(router).toContain("The source changed or is not approved. Refresh the evidence and create a new claim before approval.");
    expect(router).toContain("Source was marked as materially changed; the claim must be reviewed before reuse.");
    expect(router).toContain("normalizeOfficialKnowledgeUrl(input.sourceUrl)");
  });

  it("keeps the library internal and non-publishing in both server policy and user interface", () => {
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/KnowledgeLibrary.tsx");
    expect(router).toContain("The library has no publishing or client-advice action.");
    expect(page).toContain("It does not provide legal advice, publish content, contact clients, or change advertising.");
    expect(page).toContain("Never state that an approval, outcome, fee, processing timeline or eligibility is guaranteed.");
  });
});

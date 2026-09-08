import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("unified Lead duplicate prevention wiring", () => {
  it("routes every active Lead ingestion path through the shared matcher", () => {
    for (const file of [
      "server/routers/leads.ts",
      "server/metaAssignmentMonitoring.ts",
      "server/metaLeadSync.ts",
      "server/spainLandingLeadsService.ts",
      "server/_core/index.ts",
    ]) {
      expect(read(file), file).toContain("findLeadContactMatch");
    }
  });

  it("opens the registered Lead automatically for a manual duplicate", () => {
    const source = read("client/src/pages/leads/LeadsList.tsx");
    expect(source).toContain("if (!result.created)");
    expect(source).toContain("navigate(`/leads/${result.id}`)");
  });

  it("preserves Meta Test Lead isolation in shared matching", () => {
    const matcher = read("server/leadContactMatcher.ts");
    expect(matcher).toContain("eq(leads.isMetaTestLead, input.isMetaTestLead ?? false)");
    expect(read("server/metaAssignmentMonitoring.ts")).toContain("isMetaTestLead: input.isTestLead");
  });

  it("enforces concurrent uniqueness separately for real and Meta Test Leads", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read("drizzle/0064_lead_contact_uniqueness.sql");
    expect(schema).toContain("leads_test_normalized_phone_uq");
    expect(schema).toContain("leads_test_normalized_email_uq");
    expect(migration).toContain("(`isMetaTestLead`, `normalizedPhone`)");
    expect(migration).toContain("(`isMetaTestLead`, `normalizedEmail`)");
  });

  it("keeps landing and Meta duplicate flows conservative", () => {
    expect(read("server/spainLandingLeadsService.ts")).toContain('matchMethod: "manual_review"');
    expect(read("server/metaAssignmentMonitoring.ts")).toContain('status: "ambiguous"');
    expect(read("server/metaLeadsService.ts")).toContain("contactRaceRetried");
  });
});

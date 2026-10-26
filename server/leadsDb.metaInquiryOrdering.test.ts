import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leadsDbSource = readFileSync(new URL("./leadsDb.ts", import.meta.url), "utf8");
const leadsListSource = readFileSync(new URL("../client/src/pages/leads/LeadsList.tsx", import.meta.url), "utf8");

describe("Meta inquiry operational ordering", () => {
  it("orders the default list by the latest activity while preserving created date as a visible audit column", () => {
    expect(leadsDbSource).toContain("COALESCE(${leads.lastContactAt}, ${leads.createdAt})");
    expect(leadsDbSource).toContain("desc(leads.id)");
    expect(leadsListSource).toContain('key: "createdAt", label: "Created Date"');
    expect(leadsListSource).toContain('"createdAt", "lastActivity"');
  });
});

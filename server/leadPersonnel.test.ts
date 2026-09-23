import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLeadPersonnelOptions,
  isLeadQualifierRole,
} from "../shared/leadPersonnel";

const readProject = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Leads personnel options", () => {
  it("recognizes Abdelrahman's Qualifier role and legacy CS role names", () => {
    expect(isLeadQualifierRole("Qualifier")).toBe(true);
    expect(isLeadQualifierRole(" Qualifier ")).toBe(true);
    expect(isLeadQualifierRole("CS")).toBe(true);
    expect(isLeadQualifierRole("CS TL")).toBe(true);
    expect(isLeadQualifierRole("Consultant")).toBe(false);
  });

  it("returns every unique active employee with a real role as a Lead owner", () => {
    const result = buildLeadPersonnelOptions([
      { id: 4, name: "Mahmoud Saber", role: "Country Manager", isActive: true },
      { id: 2, name: " Abdelrahman ", role: " Qualifier ", isActive: true },
      { id: 3, name: "abdelrahman", role: "Qualifier", isActive: true },
      { id: 5, name: "Dubai Branch Expenses", role: null, isActive: true },
      { id: 6, name: "Former Employee", role: "Consultant", isActive: false },
    ]);

    expect(result.owners).toEqual([
      { id: 2, name: "Abdelrahman", role: "Qualifier" },
      { id: 4, name: "Mahmoud Saber", role: "Country Manager" },
    ]);
    expect(result.qualifiers).toEqual([
      { id: 2, name: "Abdelrahman", role: "Qualifier" },
    ]);
  });

  it("uses the protected employee-backed roster in every Leads owner selector", () => {
    const router = readProject("server/routers/leads.ts");
    const db = readProject("server/leadsDb.ts");
    const list = readProject("client/src/pages/leads/LeadsList.tsx");
    const profile = readProject("client/src/pages/leads/LeadProfile.tsx");
    const tasks = readProject("client/src/pages/leads/TasksPage.tsx");

    expect(router).toContain("personnelOptions: protectedProcedure");
    expect(db).toContain(".where(eq(finEmployees.isActive, true))");
    expect(list).toContain("trpc.leads.personnelOptions.useQuery()");
    expect(profile).toContain("trpc.leads.personnelOptions.useQuery()");
    expect(tasks).toContain("trpc.leads.personnelOptions.useQuery()");
    expect(list).not.toContain("const TEAM =");
    expect(profile).not.toContain("const TEAM =");
    expect(tasks).not.toContain("const TEAM =");
  });

  it("uses the shared qualifier role policy in the commission Qualifier Name list", () => {
    const commissions = readProject("client/src/pages/FinCommissions.tsx");
    expect(commissions).toContain("isLeadQualifierRole(e.role)");
    expect(commissions).toContain("e.isActive");
  });
});

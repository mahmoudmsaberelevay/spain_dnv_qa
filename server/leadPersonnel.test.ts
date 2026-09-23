import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLeadPersonnelOptions,
  isLeadQualifierRole,
  resolveCanonicalLeadOwnerName,
} from "../shared/leadPersonnel";

const readProject = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const ownerMergeMigration = readProject("drizzle/0090_lead_owner_account_merge.sql");

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
      { id: 2, name: "Abdelrahman", role: "Qualifier", userId: null, email: null },
      { id: 4, name: "Mahmoud Saber", role: "Country Manager", userId: null, email: null },
    ]);
    expect(result.qualifiers).toEqual([
      { id: 2, name: "Abdelrahman", role: "Qualifier", userId: null, email: null },
    ]);
  });

  it("uses the unique current username for an employee while rejecting ambiguous matches", () => {
    const users = [
      { id: 1, name: "Nouran Mamdouh", email: "nouran.mamdouh@elevay.com" },
      { id: 2, name: "Hager Hany", email: "hager.hany@elevay.com" },
      { id: 3, name: "Ziad El Shurafa", email: "ziad.private@example.com" },
      { id: 4, name: "Ziad Ahmed", email: "ziad.other@example.com" },
      { id: 5, name: "ziad.elshurafa", email: "ziad.elshurafa@elevay.com" },
    ];

    expect(resolveCanonicalLeadOwnerName("Nourhan Mamdouh", users)).toBe("Nouran Mamdouh");
    expect(resolveCanonicalLeadOwnerName("Hager", users)).toBe("Hager Hany");
    expect(resolveCanonicalLeadOwnerName("Ziad El Shurafa", users)).toBe("ziad.elshurafa");
    expect(resolveCanonicalLeadOwnerName("Ziad", users)).toBe("Ziad");
  });

  it("returns canonical usernames in the employee-backed owner roster", () => {
    const result = buildLeadPersonnelOptions(
      [
        { id: 5, name: "Nourhan Mamdouh", role: "Qualifier TL", isActive: true },
        { id: 17, name: "Hager", role: "Accountant", isActive: true },
      ],
      [
        { id: 56, name: "Nouran Mamdouh", email: "nouran.mamdouh@elevay.com" },
        { id: 57, name: "Hager Hany", email: "hager.hany@elevay.com" },
      ],
    );

    expect(result.owners.map(owner => owner.name)).toEqual(["Hager Hany", "Nouran Mamdouh"]);
    expect(result.owners.map(owner => owner.userId)).toEqual([57, 56]);
    expect(result.qualifiers.map(owner => owner.name)).toEqual(["Nouran Mamdouh"]);
  });

  it("uses the protected employee-backed roster in every Leads owner selector", () => {
    const router = readProject("server/routers/leads.ts");
    const db = readProject("server/leadsDb.ts");
    const list = readProject("client/src/pages/leads/LeadsList.tsx");
    const profile = readProject("client/src/pages/leads/LeadProfile.tsx");
    const tasks = readProject("client/src/pages/leads/TasksPage.tsx");

    expect(router).toContain("personnelOptions: protectedProcedure");
    expect(db).toContain(".where(eq(finEmployees.isActive, true))");
    expect(db).toContain("name: users.name");
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

  it("merges historical aliases into canonical user names and user IDs without deleting records", () => {
    expect(ownerMergeMigration).toContain("'nouran', 'nouran mamdouh', 'nourhan mamdouh'");
    expect(ownerMergeMigration).toContain("THEN 'Nouran Mamdouh'");
    expect(ownerMergeMigration).toContain("THEN 12484156");
    expect(ownerMergeMigration).toContain("UPDATE `leads`");
    expect(ownerMergeMigration).toContain("UPDATE `lead_tasks`");
    expect(ownerMergeMigration).not.toMatch(/\b(?:DELETE|DROP|TRUNCATE)\s+(?:FROM\s+)?`?(?:leads|lead_tasks)`?/i);
  });
});

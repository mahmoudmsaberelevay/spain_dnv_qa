import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const existingConsultantEligibleEmployees = [
  "Mahmoud Saber",
  "Fouad Abdo",
  "Ziad El Shurafa",
  "Kirolos Nabil",
];

describe("contract consultant synchronization", () => {
  it("uses the active employee consultant directory instead of a hard-coded name list", () => {
    const router = read("server/routers.ts");
    const financeDb = read("server/finDb.ts");
    expect(router).toContain("updateConsultant: protectedProcedure");
    expect(router).toContain("getConsultants: protectedProcedure");
    expect(router).toContain("isActiveContractConsultant");
    expect(financeDb).toContain("listActiveContractConsultants");
    expect(financeDb).toContain("isContractConsultantPosition");
    expect(router).toContain("await updateContractConsultant(input.id, input.consultantName)");
  });

  it("synchronizes the linked Financial Client and Commission rows", () => {
    const financialDb = read("server/finDb.ts");
    expect(financialDb).toContain("export async function syncConsultantForContract");
    expect(financialDb).toContain(".set({ consultant, salesPerson: consultant })");
    expect(financialDb).toContain(".update(finCommissions)");
    expect(financialDb).toContain(".set({ consultant })");
  });

  it("renders an authorized consultant-edit action backed by the employee directory", () => {
    const contractsPage = read("client/src/pages/Contracts.tsx");
    const dialog = read("client/src/components/NewContractDialog.tsx");
    expect(contractsPage).toContain("Change Contract Consultant");
    expect(contractsPage).toContain('canEdit("contracts")');
    expect(contractsPage).toContain("updateConsultantMutation.mutate");
    expect(contractsPage).toContain("Linked client records were updated");
    expect(contractsPage).toContain("contracts.getConsultants.useQuery");
    expect(dialog).toContain("contracts.getConsultants.useQuery");
  });

  it("uses the same employee directory in the Financial Client filter", () => {
    const clientsPage = read("client/src/pages/FinClients.tsx");
    expect(clientsPage).toContain("contracts.getConsultants.useQuery");
    expect(clientsPage).toContain("consultants.map");
    expect(clientsPage).not.toContain("const CONSULTANTS");
    for (const consultant of existingConsultantEligibleEmployees) {
      expect(consultant).toMatch(/.+/);
    }
  });
});

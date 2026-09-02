import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const canonicalConsultants = [
  "Mahmoud Saber",
  "Fouad Abdo",
  "Ziad El Shurafa",
  "Kirolos Nabil",
];

describe("contract consultant synchronization", () => {
  it("restricts contract consultant updates to the canonical names", () => {
    const router = read("server/routers.ts");
    expect(router).toContain("updateConsultant: protectedProcedure");
    for (const consultant of canonicalConsultants) {
      expect(router).toContain(`\"${consultant}\"`);
    }
    expect(router).toContain("await updateContractConsultant(input.id, input.consultantName)");
  });

  it("synchronizes the linked Financial Client and Commission rows", () => {
    const financialDb = read("server/finDb.ts");
    expect(financialDb).toContain("export async function syncConsultantForContract");
    expect(financialDb).toContain(".set({ consultant, salesPerson: consultant })");
    expect(financialDb).toContain(".update(finCommissions)");
    expect(financialDb).toContain(".set({ consultant })");
  });

  it("renders an authorized consultant-edit action on every contract row", () => {
    const contractsPage = read("client/src/pages/Contracts.tsx");
    expect(contractsPage).toContain("Change Contract Consultant");
    expect(contractsPage).toContain('canEdit("contracts")');
    expect(contractsPage).toContain("updateConsultantMutation.mutate");
    expect(contractsPage).toContain("Linked client records were updated");
  });

  it("uses the same canonical consultant names in the Financial Client filter", () => {
    const clientsPage = read("client/src/pages/FinClients.tsx");
    for (const consultant of canonicalConsultants) {
      expect(clientsPage).toContain(consultant);
    }
    expect(clientsPage).not.toContain('consultant: "Mahmoud",');
  });
});

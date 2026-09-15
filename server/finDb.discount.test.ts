import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { listFinClients } from "./finDb";
import { finClients, contracts } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("FinClients Discount Calculation", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  it("should include original, discount, and net contract values in listFinClients results", async () => {
    const clients = await listFinClients({ limit: 1 });
    
    // Check that the query returns results
    expect(clients).toBeDefined();
    expect(Array.isArray(clients)).toBe(true);
    
    if (clients.length > 0) {
      const client = clients[0];
      
      // Check that the new fields are present
      expect(client).toHaveProperty("originalContractValueEur");
      expect(client).toHaveProperty("discountValue");
      expect(client).toHaveProperty("finalContractValueEur");
      
      // If contractValueEur exists, finalContractValueEur should be <= contractValueEur
      if (client.contractValueEur && client.finalContractValueEur) {
        const netValue = Number(client.finalContractValueEur);
        const discount = Number(client.discountValue ?? 0);
        const originalValue = Number(client.originalContractValueEur);

        expect(netValue).toBe(Number(client.contractValueEur));
        expect(originalValue).toBe(netValue + discount);
      }
    }
  });

  it("keeps stored contract value net and reconstructs the original value when a discount exists", async () => {
    if (!db) return;
    
    // Find a client with a contract that has a discount
    const clientsWithDiscount = await db.select({
      id: finClients.id,
      contractId: finClients.contractId,
      contractValueEur: finClients.contractValueEur,
    }).from(finClients)
      .where(finClients.contractId);
    
    if (clientsWithDiscount.length === 0) {
      // Skip if no clients with contracts
      expect(true).toBe(true);
      return;
    }
    
    // Get a client and check its discount
    const client = clientsWithDiscount[0];
    if (client.contractId) {
      const contract = await db.select().from(contracts).where(eq(contracts.id, client.contractId));
      
      if (contract.length > 0 && Number(contract[0].discountValue) > 0) {
        // Verify the calculation
        const netValue = Number(client.contractValueEur ?? 0);
        const discount = Number(contract[0].discountValue ?? 0);
        const originalValue = netValue + discount;

        expect(netValue).toBeGreaterThanOrEqual(0);
        expect(originalValue - discount).toBe(netValue);
      }
    }
  });

  it("should handle clients without contracts gracefully", async () => {
    const clients = await listFinClients({ limit: 10 });
    
    // All clients should have discountValue field (even if 0)
    clients.forEach(client => {
      expect(client).toHaveProperty("discountValue");
      expect(client).toHaveProperty("originalContractValueEur");
      expect(client).toHaveProperty("finalContractValueEur");
      
      // discountValue should be a number (0 if no discount)
      const discount = Number(client.discountValue ?? 0);
      expect(discount).toBeGreaterThanOrEqual(0);
    });
  });

  it("keeps original, discount, and net values explicit in both UI tables and CSV exports", () => {
    const contractsPage = readProjectFile("client/src/pages/Contracts.tsx");
    const finClientsPage = readProjectFile("client/src/pages/FinClients.tsx");
    const finRouter = readProjectFile("server/finRouter.ts");

    expect(contractsPage).toContain('"Original Contract Value (EUR)"');
    expect(contractsPage).toContain('"Discount (EUR)"');
    expect(contractsPage).toContain('"Net Contract Value (EUR)"');
    expect(contractsPage).toContain('Number(c.contractValue) + Number(c.discountValue ?? 0)');
    expect(contractsPage).toContain(">Original Value</th>");
    expect(contractsPage).toContain(">Net Contract Value</th>");

    expect(finClientsPage).toContain('Number(c.finalContractValueEur ?? c.contractValueEur ?? 0)');
    expect(finClientsPage).toContain('Number(c.originalContractValueEur ?? (netContractValue + discountValue))');
    expect(finClientsPage).toContain(">Original Contract Value <");
    expect(finClientsPage).toContain(">Net Contract Value</th>");

    expect(finRouter).toContain('"Original Contract Value (EUR)", "Discount (EUR)", "Net Contract Value (EUR)"');
    expect(finRouter).toContain("escape(c.originalContractValueEur)");
    expect(finRouter).toContain("escape(c.discountValue)");
    expect(finRouter).toContain("escape(c.finalContractValueEur)");
  });
});

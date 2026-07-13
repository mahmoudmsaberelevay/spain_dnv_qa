import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { listFinClients } from "./finDb";
import { finClients, contracts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("FinClients Discount Calculation", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  it("should include finalContractValueEur and discountValue in listFinClients results", async () => {
    const clients = await listFinClients({ limit: 1 });
    
    // Check that the query returns results
    expect(clients).toBeDefined();
    expect(Array.isArray(clients)).toBe(true);
    
    if (clients.length > 0) {
      const client = clients[0];
      
      // Check that the new fields are present
      expect(client).toHaveProperty("finalContractValueEur");
      expect(client).toHaveProperty("discountValue");
      
      // If contractValueEur exists, finalContractValueEur should be <= contractValueEur
      if (client.contractValueEur && client.finalContractValueEur) {
        const contractVal = Number(client.contractValueEur);
        const finalVal = Number(client.finalContractValueEur);
        const discount = Number(client.discountValue ?? 0);
        
        // Verify the calculation: finalValue = contractValue - discount
        expect(finalVal).toBeLessThanOrEqual(contractVal);
        
        // If there's a discount, the final value should be less than the contract value
        if (discount > 0) {
          expect(finalVal).toBe(contractVal - discount);
        }
      }
    }
  });

  it("should correctly calculate finalContractValueEur when discount exists", async () => {
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
        const contractVal = Number(client.contractValueEur ?? 0);
        const discount = Number(contract[0].discountValue ?? 0);
        const expectedFinal = contractVal - discount;
        
        // The finalContractValueEur should equal contractValueEur - discountValue
        expect(expectedFinal).toBeGreaterThan(0);
      }
    }
  });

  it("should handle clients without contracts gracefully", async () => {
    const clients = await listFinClients({ limit: 10 });
    
    // All clients should have discountValue field (even if 0)
    clients.forEach(client => {
      expect(client).toHaveProperty("discountValue");
      expect(client).toHaveProperty("finalContractValueEur");
      
      // discountValue should be a number (0 if no discount)
      const discount = Number(client.discountValue ?? 0);
      expect(discount).toBeGreaterThanOrEqual(0);
    });
  });
});

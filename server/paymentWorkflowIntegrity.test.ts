import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("contract, receipt, and client payment workflow", () => {
  const schema = read("drizzle/schema.ts");
  const db = read("server/db.ts");
  const router = read("server/routers.ts");
  const finDb = read("server/finDb.ts");
  const incomeRouter = read("server/finRouter.ts");
  const receiptPdf = read("server/invoiceGenerator.ts");

  it("keeps original, discount, and net contract values separate", () => {
    expect(schema).toContain('originalContractValueEur: decimal("originalContractValueEur"');
    expect(schema).toContain('netContractValueEur: decimal("netContractValueEur"');
    expect(db).toContain("Discount cannot exceed the original contract value.");
    expect(db).toContain("netContractValueEur: newValue.toFixed(2)");
  });

  it("freezes every receipt's actual payment, rate, EUR credit, and balance snapshots", () => {
    expect(schema).toContain('actualReceivedAmount: decimal("actualReceivedAmount"');
    expect(schema).toContain('actualReceivedCurrency: varchar("actualReceivedCurrency"');
    expect(schema).toContain('paymentEurEquivalent: decimal("paymentEurEquivalent"');
    expect(schema).toContain('remainingBeforeEur: decimal("remainingBeforeEur"');
    expect(schema).toContain('remainingAfterEur: decimal("remainingAfterEur"');
    expect(router).toContain("calculateReceiptBalanceSnapshot");
    expect(router).toContain("paymentEurEquivalent: balanceSnapshot.paymentEurEquivalent.toFixed(2)");
    expect(receiptPdf).toContain("REMAINING BEFORE THIS PAYMENT");
    expect(receiptPdf).toContain("PAYMENT CREDITED");
    expect(receiptPdf).toContain("REMAINING AFTER THIS PAYMENT");
  });

  it("uses immutable payment and income ledgers rather than a fixed exchange rate", () => {
    expect(finDb).toContain("rebuildClientPaymentLedger");
    expect(finDb).not.toContain("amountEgp / 55.5");
    expect(finDb).not.toContain("baseEur * 55.5");
    expect(incomeRouter).toContain("transactionCurrency");
    expect(incomeRouter).toContain("eurEquivalent");
    expect(incomeRouter).toContain("calculatePaymentEurEquivalent");
  });
});

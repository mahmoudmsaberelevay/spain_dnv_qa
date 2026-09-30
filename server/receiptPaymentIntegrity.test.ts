import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("atomic receipt payment integrity", () => {
  const db = read("server/db.ts");
  const router = read("server/routers.ts");
  const schema = read("drizzle/schema.ts");
  const migration = read("drizzle/0105_atomic_receipt_payment_integrity.sql");

  it("settles a receipt and all derived Financial state within one transaction", () => {
    expect(db).toContain("export async function markInvoicePaidAndSyncFinancial");
    expect(db).toContain("return db.transaction(async tx => {");
    expect(db).toContain("eq(invoices.status, \"unpaid\")");
    expect(db).toContain("INVOICE_ALREADY_PAID");
    expect(db).toContain("reconcileContractReceiptFinancials(tx, contract.id)");
  });

  it("uses the paid EGP amount and receipt rate for partial-payment EUR reconciliation", () => {
    expect(db).toContain("function actualReceiptPaidEur");
    expect(db).toContain("actualEgp / exchangeRate");
    expect(db).toContain("invoice.actualPaidAmountEgp ?? invoice.amountEgp ?? null");
  });

  it("prevents duplicate receipt payment projections at both application and database levels", () => {
    expect(schema).toContain('uniqueIndex("payments_invoice_unique").on(table.invoiceId)');
    expect(schema).toContain('uniqueIndex("fin_clients_contract_unique").on(table.contractId)');
    expect(migration).toContain("UNIQUE (`invoiceId`)");
    expect(migration).toContain("UNIQUE (`contractId`)");
  });

  it("uses the atomic path from the receipt endpoint and does not separately create a payment", () => {
    const markPaidBlock = router.slice(router.indexOf("markPaid: protectedProcedure"), router.indexOf("createLegacy: protectedProcedure"));
    expect(markPaidBlock).toContain("markInvoicePaidAndSyncFinancial(input.id)");
    expect(markPaidBlock).not.toContain("createPayment(");
    expect(markPaidBlock).not.toContain("markInvoicePaid(input.id)");
  });

  it("reconciles a contract after receipt deletion so an orphan payment cannot remain", () => {
    const deleteBlock = db.slice(db.indexOf("export async function deleteInvoice"), db.indexOf("function actualReceiptPaidEur"));
    expect(deleteBlock).toContain("return db.transaction(async tx => {");
    expect(deleteBlock).toContain("tx.delete(payments).where(eq(payments.invoiceId, id))");
    expect(deleteBlock).toContain("reconcileContractReceiptFinancials(tx, invoice.contractId)");
  });

  it("keeps historical repair separate from the schema migration", () => {
    expect(migration).toContain("does not create, delete, or modify any financial amount");
    expect(migration).toContain("applied only after owner approval");
  });
});

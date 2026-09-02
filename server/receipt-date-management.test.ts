import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (path: string) => readFileSync(resolve(projectRoot, path), "utf8");

describe("contracting receipt date management", () => {
  it("stores a dedicated business date and backfills existing receipts", () => {
    const schema = readProjectFile("drizzle/schema.ts");
    const migration = readProjectFile("drizzle/0050_add_receipt_date.sql");

    expect(schema).toContain('receiptDate: timestamp("receiptDate").defaultNow().notNull()');
    expect(migration).toContain("ADD COLUMN `receiptDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP");
    expect(migration).toContain("SET `receiptDate` = `createdAt`");
  });

  it("accepts dates for standard and legacy receipt creation", () => {
    const router = readProjectFile("server/routers.ts");

    expect(router.match(/receiptDate: z\.string\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\)\.optional\(\)/g)).toHaveLength(2);
    expect(router).toContain("const receiptDate = input.receiptDate ? parseReceiptDate(input.receiptDate) : new Date()");
    expect(router).toContain("createdAt: receiptDate, notes: input.notes");
  });

  it("edits the business date and regenerates the PDF without changing paidAt", () => {
    const router = readProjectFile("server/routers.ts");
    const database = readProjectFile("server/db.ts");
    const updateDateBlock = router.slice(router.indexOf("updateDate: protectedProcedure"), router.indexOf("regeneratePdf: protectedProcedure"));

    expect(updateDateBlock).toContain("updateInvoiceReceiptDate(input.id, receiptDate)");
    expect(updateDateBlock).toContain("regenerateStoredReceiptPdf(updatedInvoice)");
    expect(updateDateBlock).not.toContain("paidAt");
    expect(router).toContain("createdAt: new Date(invoice.receiptDate ?? invoice.createdAt)");
    expect(database).toContain("if (driveFileId !== undefined) updates.driveFileId = driveFileId");
    expect(database).toContain("if (driveLink !== undefined) updates.driveLink = driveLink");
  });

  it("provides create and edit controls in the receipts interface", () => {
    const page = readProjectFile("client/src/pages/Invoices.tsx");

    expect(page).toContain('id="receiptDate"');
    expect(page).toContain('id="legacyReceiptDate"');
    expect(page).toContain("trpc.contracting.invoices.updateDate.useMutation");
    expect(page).toContain("formatDate(invoice.receiptDate ?? invoice.createdAt)");
    expect(page).toContain("Its payment date and financial amounts will not change.");
  });
});

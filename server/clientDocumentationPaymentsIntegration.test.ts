import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const migration = readFileSync(resolve(root, "drizzle/0066_client_documentation_payments.sql"), "utf8");
const service = readFileSync(resolve(root, "server/clientDocumentationPaymentsService.ts"), "utf8");
const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const createPage = readFileSync(resolve(root, "client/src/pages/ClientDocs.tsx"), "utf8");
const detailPage = readFileSync(resolve(root, "client/src/pages/ClientDocDetail.tsx"), "utf8");
const paymentUi = readFileSync(resolve(root, "client/src/components/ClientDocumentationPayments.tsx"), "utf8");
const milestoneMigration = readFileSync(resolve(root, "drizzle/0078_contract_source_payment_milestones.sql"), "utf8");

describe("Client Documentation contract/payment integration", () => {
  it("uses an additive schedule table and separate contract link", () => {
    expect(schema).toContain('finClientId: int("finClientId")');
    expect(schema).toContain('contractDriveLink: text("contractDriveLink")');
    expect(schema).toContain('clientDocumentationPayments = mysqlTable("clientDocumentationPayments"');
    expect(migration).toContain('CREATE TABLE `clientDocumentationPayments`');
    expect(migration).not.toMatch(/\bDROP\b|TRUNCATE|DELETE FROM/i);
  });

  it("creates the case, documents, and schedule in one transaction", () => {
    expect(service).toContain("return db.transaction(async tx =>");
    expect(service).toContain("tx.insert(clientCases)");
    expect(service).toContain("tx.insert(clientDocuments)");
    expect(service).toContain("tx.insert(clientDocumentationPayments)");
    expect(router).toContain("createClientDocumentationBundle");
    expect(router).toContain("contractDriveLink: clientDocumentationHttpUrl");
    expect(router).toContain("payments: z.array");
  });

  it("supports custom payments, receipt evidence, paid state, soft removal, and audit logging", () => {
    expect(router).toContain("addPayment: protectedProcedure");
    expect(router).toContain("updatePayment: protectedProcedure");
    expect(router).toContain("markPaymentPaid: protectedProcedure");
    expect(router).toContain("archivePayment: protectedProcedure");
    expect(router).toContain('"client_documentation_payment"');
    expect(service).toContain("PAYMENT_HISTORY_PROTECTED");
    expect(service).toContain("PAYMENT_RECEIPT_PROTECTED");
    expect(service).toContain("PAYMENT_ALREADY_PAID");
    expect(service).toContain("archivedAt: new Date()");
    expect(paymentUi).toContain("Receipt Drive Link (Optional)");
    expect(paymentUi).toContain("Paid or receipt-linked history cannot be removed");
  });

  it("starts with three fixed milestone-linked payments and shows derived totals on the profile", () => {
    expect(createPage).toContain('paymentName: "First payment"');
    expect(createPage).toContain('paymentName: "Second payment"');
    expect(createPage).toContain('paymentName: "Third payment"');
    expect(createPage).toContain('amountEur: ""');
    expect(createPage).toContain('paymentMilestone: "signed"');
    expect(createPage).toContain('paymentMilestone: "submission"');
    expect(createPage).toContain('paymentMilestone: "approval"');
    expect(createPage).not.toContain("Add Payment");
    expect(createPage).toContain("Contract Google Drive Link");
    expect(service).toContain('paidDate: payment.paymentMilestone === "signed" ? cairoDateKey() : null');
    expect(milestoneMigration).toContain('ADD COLUMN `paymentMilestone`');
    expect(milestoneMigration).not.toMatch(/\bDROP\b|TRUNCATE|DELETE FROM/i);
    expect(detailPage).toContain("<ClientDocumentationPayments");
    expect(paymentUi).toContain("Contract Value");
    expect(paymentUi).toContain("Paid");
    expect(paymentUi).toContain("Remaining");
    expect(paymentUi).toContain("Due / Overdue");
    expect(paymentUi).toContain("Next Payment");
    expect(paymentUi).toContain("Application Status / Due Date");
  });

  it("keeps Client Documentation planning separate from authoritative Finance transactions", () => {
    expect(paymentUi).toContain("Official accounting remains in the Financial module");
    expect(service).not.toContain("finTransactions");
    expect(service).not.toContain("payments).values");
  });
});

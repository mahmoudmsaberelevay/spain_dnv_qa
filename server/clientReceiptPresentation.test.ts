import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { calculatePaymentEurEquivalent, calculateEvidenceReceiptBalanceSnapshot, normalizePaymentCurrency } from "../shared/financialPaymentSnapshots";

vi.mock("./storage", () => ({ storagePut: vi.fn(() => { throw new Error("Storage is forbidden in presentation tests"); }) }));
import { generateInvoicePdfBuffer, generateInvoiceHtml, getReceiptPresentationRows, type ReceiptData } from "./invoiceGenerator";

const syntheticReceipt: ReceiptData = {
  invoiceCode: "SYNTHETIC-ONLY", clientName: "Synthetic Client", amountEur: 3000,
  amountEgp: 186000, exchangeRate: 62, actualReceivedAmount: 186000,
  actualReceivedCurrency: "EGP", paymentExchangeRate: 62, paymentEurEquivalent: 3000,
  netContractValueEur: 10000, remainingBeforeEur: 10000, remainingAfterEur: 7000,
  financialSummary: { status: "available", netContractValueEur: 10000, totalPaidEur: 8000, remainingEur: 2000 },
  createdAt: new Date("2026-01-01T12:00:00Z"),
};

/** Execute only extracted receipt procedures with every dependency mocked.
 * Never import the application router, database connection, notifications or exchange providers.
 */
function isolatedRoutes() {
  const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const helpers = source.slice(source.indexOf("function generateInvoiceCode()"), source.indexOf("// ─── Contracting Router"));
  const routes = source.slice(source.indexOf("  invoices: router({"), source.indexOf("  exchangeRate: router({", source.indexOf("  invoices: router({")));
  const procedure: any = { input: () => procedure, query: (run: any) => ({ run }), mutation: (run: any) => ({ run }) };
  const contract = { id: 1, currency: "EUR", contractCode: "SYN-C", clientName: "Synthetic Client", contractValue: "10000", netContractValueEur: "10000", discountValue: "0" };
  const invoice = { id: 1, invoiceCode: "SYNTHETIC-ONLY", contractId: 1, legacyFinClientId: null, clientName: "Synthetic Client", amountEur: "3000", amountEgp: "186000", exchangeRate: "62", actualReceivedAmount: "186000", actualReceivedCurrency: "EGP", paymentExchangeRate: "62", paymentEurEquivalent: "3000", netContractValueEur: "10000", remainingBeforeEur: "10000", remainingAfterEur: "7000", pdfUrl: "https://example.invalid/original.pdf", status: "paid", receiptDate: new Date("2026-01-01T12:00:00Z"), createdAt: new Date("2026-01-01T12:00:00Z") };
  const client: any = { id: 2, name: "Synthetic Legacy", contractId: null, contractValueEur: "10000", paidAmountEur: "9999" };
  const query: any = { from: () => query, where: () => query, limit: () => Promise.resolve([client]) };
  const db = { select: () => query };
  const dependencies: any = {
    z, TRPCError, protectedProcedure: procedure, adminProcedure: procedure, router: (value: any) => value,
    getAllInvoices: vi.fn(async () => [invoice]), getInvoiceById: vi.fn(async () => invoice),
    getContractById: vi.fn(async () => contract), getTotalPaidByContractId: vi.fn(async () => 8000),
    getClientIncomeBalance: vi.fn(async () => ({ status: "verified", paidAmountEur: 8000, remainingAmountEur: 2000 })),
    generateInvoicePdfBuffer: vi.fn(async () => Buffer.from("synthetic-pdf")),
    generateAndUploadInvoicePdf: vi.fn(async () => "https://example.invalid/new-evidence.pdf"),
    createInvoice: vi.fn(async (data: any) => ({ id: 3, ...data })),
    updateInvoiceReceiptDate: vi.fn(async () => undefined), updateInvoicePdfUrl: vi.fn(),
    getProformaInvoiceById: vi.fn(async () => ({ id: 1, contractId: 1, amountEur: "3000", proformaCode: "SYN-PF" })),
    getEurToEgpRate: vi.fn(async () => ({ rate: 62 })),
    getAutomaticPostingExchangeRate: vi.fn(async () => ({ rate: 62 })),
    convertEurToEgp: (amount: number, rate: number) => amount * rate,
    calculatePaymentEurEquivalent, calculateEvidenceReceiptBalanceSnapshot, normalizePaymentCurrency,
    notifyNewInvoice: vi.fn(async () => undefined),
    modules: {
      "./db": { getDb: vi.fn(async () => db), createNotification: vi.fn(async () => undefined) },
      "../drizzle/schema": { finClients: { id: "clientId" } },
      "drizzle-orm": { eq: vi.fn() },
    },
  };
  const code = `${helpers}\nconst receiptRoutes = {${routes}}; return receiptRoutes;`.replace(/await import\("([^"]+)"\)/g, 'modules["$1"]');
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const loaded = new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies));
  return { ...loaded, dependencies, invoice, client };
}

describe("universal client receipt presentation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always prints current Income totals despite an immutable historical snapshot", () => {
    const rows = getReceiptPresentationRows(syntheticReceipt);
    expect(rows.slice(0, 3).map(row => row.value)).toEqual(["€10,000.00", "€8,000.00", "€2,000.00"]);
    expect(rows.find(row => row.label === "RECEIPT ACTUAL PAID (EGP)")?.value).toContain("186,000.00");
    expect(rows.find(row => row.label.startsWith("STORED RATE"))?.value).toBe("62.0000");
    expect(rows.some(row => row.label.includes("CREDITED") || row.label.includes("AFTER THIS PAYMENT"))).toBe(false);
  });

  it("does not make receipt issuance into a second payment credit", () => {
    const snapshot = calculateEvidenceReceiptBalanceSnapshot({ netContractValueEur: 10000, totalPaidBeforeEur: 8000, paymentEurEquivalent: 3000 });
    expect(snapshot.remainingBeforeEur).toBe(2000);
    expect(snapshot.remainingAfterEur).toBe(2000);
    expect(snapshot.paymentEurEquivalent).toBe(3000);
  });

  it("shows reconciliation labels rather than false zero or stale snapshot totals", () => {
    const rows = getReceiptPresentationRows({ ...syntheticReceipt, financialSummary: { status: "reconciliation_required", netContractValueEur: 10000 } });
    expect(rows[1].value).toBe("Reconciliation required");
    expect(rows[2].value).toBe("Reconciliation required");
    expect(rows.find(row => row.label === "RECEIPT ACTUAL PAID (EGP)")?.value).toContain("186,000.00");
  });

  it("preserves USD actual amounts and the stored USD-per-EUR rate", () => {
    const rows = getReceiptPresentationRows({ ...syntheticReceipt, actualReceivedAmount: 3250, actualReceivedCurrency: "USD", paymentExchangeRate: 1.25, paymentEurEquivalent: 2600 });
    expect(rows.find(row => row.label === "RECEIPT ACTUAL PAID (USD)")?.value).toBe("$3,250.00");
    expect(rows.find(row => row.label === "STORED RATE (1 EUR = USD)")?.value).toBe("1.2500");
  });

  it("does not invent actual payment or rates for old incomplete evidence", () => {
    const rows = getReceiptPresentationRows({ ...syntheticReceipt, actualReceivedAmount: undefined, actualPaidAmountEgp: undefined, paymentExchangeRate: undefined, exchangeRate: NaN });
    expect(rows.find(row => row.label === "RECEIPT ACTUAL PAID (EGP)")?.value).toBe("Not recorded");
    expect(rows.find(row => row.label.startsWith("STORED RATE"))?.value).toBe("Not recorded");
  });

  it("creates a readable synthetic PDF with totals and evidence, without network or uploads", async () => {
    const directory = mkdtempSync(join(tmpdir(), "synthetic-client-receipt-"));
    try {
      const path = join(directory, "synthetic.pdf");
      writeFileSync(path, await generateInvoicePdfBuffer(syntheticReceipt));
      const text = execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
      expect(text).toContain("TOTAL PAID FROM INCOME (EUR)");
      expect(text).toContain("TOTAL REMAINING FROM INCOME (EUR)");
      expect(text).toContain("8,000.00"); expect(text).toContain("2,000.00");
      expect(text).toContain("186,000.00"); expect(text).toContain("62.0000");
      expect(text).not.toContain("PAYMENT CREDITED");
      expect(text).toContain("issuing or marking it paid does not credit the balance");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("renders the same totals in HTML and escapes receipt evidence", () => {
    const html = generateInvoiceHtml({ ...syntheticReceipt, clientName: "<Synthetic & Client>" });
    expect(html).toContain("TOTAL PAID FROM INCOME (EUR)");
    expect(html).toContain("€8,000.00");
    expect(html).toContain("&lt;Synthetic &amp; Client&gt;");
  });

  it.each(["paid", "unpaid"])("downloads current totals for %s receipts without overwriting original PDFs", async status => {
    const state = isolatedRoutes(); state.invoice.status = status;
    const report = await state.invoices.downloadCurrentPdf.run({ input: { id: 1 } });
    const data = state.dependencies.generateInvoicePdfBuffer.mock.calls[0][0];
    expect(data.financialSummary).toEqual({ status: "available", netContractValueEur: 10000, totalPaidEur: 8000, remainingEur: 2000 });
    expect(data.actualReceivedAmount).toBe(186000); expect(data.paymentExchangeRate).toBe(62);
    expect(report.originalPdfUrl).toBe("https://example.invalid/original.pdf");
    expect(report.pdfBase64).toBe(Buffer.from("synthetic-pdf").toString("base64"));
    expect(state.dependencies.updateInvoicePdfUrl).not.toHaveBeenCalled();
    expect(state.dependencies.generateAndUploadInvoicePdf).not.toHaveBeenCalled();
    expect(state.dependencies.getEurToEgpRate).not.toHaveBeenCalled();
  });

  it("legacy regeneration uses only read-only Income totals, not cached paid amounts", async () => {
    const state = isolatedRoutes(); state.invoice.contractId = null as any; state.invoice.legacyFinClientId = 2 as any;
    await state.invoices.regeneratePdf.run({ input: { id: 1 } });
    expect(state.dependencies.getClientIncomeBalance).toHaveBeenCalled();
    expect(state.dependencies.generateInvoicePdfBuffer.mock.calls[0][0].financialSummary.totalPaidEur).toBe(8000);
    expect(state.client.paidAmountEur).toBe("9999");
  });

  it.each(["valuation_required", "legacy_reconciliation_required"])("legacy %s preserves evidence with unknown totals", async status => {
    const state = isolatedRoutes(); state.invoice.contractId = null as any; state.invoice.legacyFinClientId = 2 as any;
    state.dependencies.getClientIncomeBalance.mockResolvedValue({ status, paidAmountEur: null });
    await state.invoices.downloadCurrentPdf.run({ input: { id: 1 } });
    const data = state.dependencies.generateInvoicePdfBuffer.mock.calls[0][0];
    expect(data.financialSummary).toEqual({ status: "reconciliation_required", netContractValueEur: 10000 });
    expect(data.actualReceivedAmount).toBe(186000);
  });

  it("sanitizes a missing frozen-EUR error rather than presenting zero or private details", async () => {
    const state = isolatedRoutes(); state.dependencies.getTotalPaidByContractId.mockRejectedValue(new Error("CLIENT_INCOME_VALUATION_REQUIRED"));
    await state.invoices.regeneratePdf.run({ input: { id: 1 } });
    expect(state.dependencies.generateInvoicePdfBuffer.mock.calls[0][0].financialSummary.status).toBe("reconciliation_required");
  });

  it("does not label an unknown-denomination legacy contractValue as EUR", async () => {
    const state = isolatedRoutes(); state.invoice.contractId = null as any; state.invoice.legacyFinClientId = 2 as any;
    state.client.contractValueEur = null; state.client.contractValue = "600000";
    await state.invoices.downloadCurrentPdf.run({ input: { id: 1 } });
    expect(state.dependencies.generateInvoicePdfBuffer.mock.calls[0][0].financialSummary).toEqual({ status: "reconciliation_required", netContractValueEur: undefined });
  });

  it("does not relabel a foreign-currency contract value as EUR", async () => {
    const state = isolatedRoutes();
    state.dependencies.getContractById.mockResolvedValue({ id: 1, currency: "USD", contractValue: "10000", netContractValueEur: "10000" });
    await state.invoices.downloadCurrentPdf.run({ input: { id: 1 } });
    expect(state.dependencies.generateInvoicePdfBuffer.mock.calls[0][0].financialSummary).toEqual({ status: "reconciliation_required" });
    expect(state.dependencies.getTotalPaidByContractId).not.toHaveBeenCalled();
  });

  it.each([false, true])("creates contract receipt evidence without re-crediting Income, unresolved=%s", async unresolved => {
    const state = isolatedRoutes();
    if (unresolved) state.dependencies.getTotalPaidByContractId.mockRejectedValue(new Error("CLIENT_INCOME_VALUATION_REQUIRED"));
    await state.invoices.create.run({ input: { contractId: 1, amountEur: 3000, actualReceivedAmount: 186000, actualReceivedCurrency: "EGP", notes: "Synthetic test" } });
    const saved = state.dependencies.createInvoice.mock.calls[0][0];
    expect(saved.paymentEurEquivalent).toBe("3000.00");
    expect(saved.remainingAfterEur).toBe(unresolved ? undefined : "2000.00");
    const data = state.dependencies.generateAndUploadInvoicePdf.mock.calls[0][0];
    expect(data.financialSummary.status).toBe(unresolved ? "reconciliation_required" : "available");
  });

  it("creates legacy receipt evidence without adding to paid totals", async () => {
    const state = isolatedRoutes();
    await state.invoices.createLegacy.run({ input: { legacyFinClientId: 2, amountEur: 3000, actualReceivedAmount: 186000, actualReceivedCurrency: "EGP" } });
    const saved = state.dependencies.createInvoice.mock.calls[0][0];
    expect(saved.remainingAfterEur).toBe("2000.00");
    expect(state.dependencies.generateAndUploadInvoicePdf.mock.calls[0][0].financialSummary.totalPaidEur).toBe(8000);
  });

  it("proforma conversion never credits the newly issued receipt amount", async () => {
    const state = isolatedRoutes();
    await state.proformaInvoices.convertToReceipt.run({ input: { id: 1 } });
    expect(state.dependencies.generateAndUploadInvoicePdf.mock.calls[0][0].financialSummary).toEqual({ status: "available", netContractValueEur: 10000, totalPaidEur: 8000, remainingEur: 2000 });
    expect(state.dependencies.createInvoice.mock.calls[0][0].status).toBe("unpaid");
  });

  it("date edits generate a current report and never change original amounts, rates or PDF URL", async () => {
    const state = isolatedRoutes();
    await state.invoices.updateDate.run({ input: { id: 1, receiptDate: "2026-02-02" } });
    expect(state.dependencies.updateInvoiceReceiptDate).toHaveBeenCalled();
    expect(state.dependencies.updateInvoicePdfUrl).not.toHaveBeenCalled();
    expect(state.dependencies.generateAndUploadInvoicePdf).not.toHaveBeenCalled();
    expect(state.invoice.pdfUrl).toBe("https://example.invalid/original.pdf");
    expect(state.invoice.exchangeRate).toBe("62");
  });
});

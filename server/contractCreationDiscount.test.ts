import { readFileSync } from "node:fs";
import { initTRPC, TRPCError } from "@trpc/server";
import ts from "typescript";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateContractCreationPricing } from "./contractCreationPricing";

// Execute only the source procedure under test. Never import routers.ts and its
// provider/DB module tree, read environment files, or access real client records.
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL("./contractGenerator.ts", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const pricingSource = generatorSource.slice(
  generatorSource.indexOf("export function calculateContractValue("),
  generatorSource.indexOf("// ── XML helpers"),
);
const t = initTRPC.context<{ user?: { id: number } }>().create();
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx });
});
const mocks = {
  generateContractCode: vi.fn(),
  generateContractDoc: vi.fn(),
  uploadContractToStorage: vi.fn(),
  createContractWithClientOrigin: vi.fn(),
  getMarketingLeadForContract: vi.fn(),
  notifyNewContract: vi.fn(),
  createNotification: vi.fn(),
  isActiveContractConsultant: vi.fn(),
  getContractById: vi.fn(),
  updateContractDocUrl: vi.fn(),
  applyContractDiscount: vi.fn(),
};

function loadProcedure(source: string) {
  const dependencies = { z, TRPCError, protectedProcedure, ...mocks };
  const exports: Record<string, any> = {};
  const requireSynthetic = (name: string) => {
    if (name === "./contractCreationPricing") return { calculateContractCreationPricing };
    if (name === "./db") return { createNotification: mocks.createNotification };
    if (name === "./finDb") return { isActiveContractConsultant: mocks.isActiveContractConsultant };
    throw new Error(`Unexpected module access in synthetic test: ${name}`);
  };
  const { outputText } = ts.transpileModule(
    `${pricingSource}\nexport const procedure = ${source};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  );
  new Function("require", "exports", ...Object.keys(dependencies), outputText)(
    requireSynthetic, exports, ...Object.values(dependencies),
  );
  return t.router({ run: exports.procedure }).createCaller({ user: { id: 1 } });
}

const contractsBlock = routerSource.slice(routerSource.indexOf("const contractingRouter = router({"));
const creationSource = contractsBlock.slice(
  contractsBlock.indexOf("create: protectedProcedure") + "create: ".length,
  contractsBlock.indexOf("    getCountries: protectedProcedure"),
).trim().replace(/,$/, "");
const creationCaller = loadProcedure(creationSource);
const baseInput = {
  clientName: "Synthetic Arabic Client",
  invoicingName: "Synthetic English Client",
  clientMobile: "+20000000000",
  familyMembers: 5,
  clientOrigin: "referral" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generateContractCode.mockResolvedValue("26001");
  mocks.generateContractDoc.mockResolvedValue({ buffer: Buffer.from("synthetic"), filename: "synthetic.docx" });
  mocks.uploadContractToStorage.mockResolvedValue("https://example.invalid/synthetic.docx");
  mocks.createContractWithClientOrigin.mockImplementation(async ({ contract }) => ({ contract: { ...contract, id: 1 } }));
  mocks.isActiveContractConsultant.mockResolvedValue(true);
  mocks.getMarketingLeadForContract.mockResolvedValue({ id: 12, linkedContract: null });
});

function expectNoCreationWork() {
  expect(mocks.generateContractCode).not.toHaveBeenCalled();
  expect(mocks.generateContractDoc).not.toHaveBeenCalled();
  expect(mocks.uploadContractToStorage).not.toHaveBeenCalled();
  expect(mocks.createContractWithClientOrigin).not.toHaveBeenCalled();
  expect(mocks.notifyNewContract).not.toHaveBeenCalled();
  expect(mocks.createNotification).not.toHaveBeenCalled();
}

describe("pure contract creation pricing in contract currency", () => {
  it("calculates €15,000 less €5,000 as €10,000", () => {
    expect(calculateContractCreationPricing(15000, 5000)).toEqual({
      originalContractValue: 15000, discountValue: 5000, netContractValue: 10000,
    });
  });
  it("rounds the original before subtracting integer cents", () => {
    expect(calculateContractCreationPricing(1.005, 0.01)).toEqual({
      originalContractValue: 1.01, discountValue: 0.01, netContractValue: 1,
    });
    expect(calculateContractCreationPricing(100.129, 0.13).netContractValue).toBe(100);
    expect(calculateContractCreationPricing(0.3, 0.1).netContractValue).toBe(0.2);
  });
  it("defaults empty/omitted discounts to zero and accepts a full discount", () => {
    expect(calculateContractCreationPricing(0)).toEqual({ originalContractValue: 0, discountValue: 0, netContractValue: 0 });
    expect(calculateContractCreationPricing(15000).netContractValue).toBe(15000);
    expect(calculateContractCreationPricing(15000, 15000).netContractValue).toBe(0);
  });
  it.each([-1, 15000.01, NaN, Infinity, -Infinity, 0.001, 1.005, 0.009999999999999998, Number.MAX_VALUE])(
    "rejects invalid discount %s instead of silently rounding it", discount => {
      expect(() => calculateContractCreationPricing(15000, discount)).toThrow();
    },
  );
  it.each([-1, NaN, Infinity, -Infinity, Number.MAX_VALUE])("rejects invalid original %s", original => {
    expect(() => calculateContractCreationPricing(original)).toThrow();
  });
});

describe("contracts.create actual schema/body with synthetic adapters", () => {
  it("persists all three values, generates the net document and sends a net notification", async () => {
    const result = await creationCaller.run({ ...baseInput, discountValue: 5000 });
    expect(result.contract).toMatchObject({
      originalContractValueEur: "15000.00", discountValue: "5000.00",
      netContractValueEur: "10000.00", contractValue: "10000.00", currency: "EUR", country: "spain",
    });
    expect(mocks.generateContractDoc).toHaveBeenCalledWith(baseInput.clientName, 5, "26001", "spain", 10000);
    expect(mocks.notifyNewContract).toHaveBeenCalledWith("26001", baseInput.clientName, 5, 10000);
    expect(mocks.applyContractDiscount).not.toHaveBeenCalled();
  });
  it.each(["spain", "egypt", "dominica", "saint_kitts", "grenada"])(
    "passes explicit NET and commercial-summary metadata to the generator for %s", async country => {
      const result = await creationCaller.run({ ...baseInput, country, contractValueOverride: 15000, discountValue: 5000, currency: "USD" });
      expect(result.contract).toMatchObject({ originalContractValueEur: "15000.00", discountValue: "5000.00", netContractValueEur: "10000.00", contractValue: "10000.00", currency: "USD" });
      expect(mocks.generateContractDoc).toHaveBeenCalledWith(baseInput.clientName, 5, "26001", country, 10000,...(country!=="spain"?[{currency:"USD",originalValue:15000,discountValue:5000}]:[]));
    },
  );
  it.each([[1, 12000], [2, 13000], [3, 14000], [4, 14000], [5, 15000], [6, 15000]])(
    "preserves Spain family %s original pricing without a discount", async (familyMembers, original) => {
      const result = await creationCaller.run({ ...baseInput, familyMembers });
      expect(result.contract.originalContractValueEur).toBe(original.toFixed(2));
      expect(result.contract.contractValue).toBe(original.toFixed(2));
      expect(result.contract.discountValue).toBe("0.00");
    },
  );
  it.each(["egypt", "dominica", "saint_kitts", "grenada"])(
    "preserves %s zero-fee placeholder and default EUR without overrides", async country => {
      const result = await creationCaller.run({ ...baseInput, country });
      expect(result.contract).toMatchObject({ originalContractValueEur: "0.00", discountValue: "0.00", netContractValueEur: "0.00", contractValue: "0.00", currency: "EUR" });
      expect(mocks.generateContractDoc).toHaveBeenCalledWith(baseInput.clientName, 5, "26001", country, 0,{currency:"EUR",originalValue:0,discountValue:0});
    },
  );
  it("preserves explicit zero override, zero discount, and selected USD currency", async () => {
    const result = await creationCaller.run({ ...baseInput, contractValueOverride: 0, discountValue: 0, currency: "USD" });
    expect(result.contract).toMatchObject({ originalContractValueEur: "0.00", netContractValueEur: "0.00", contractValue: "0.00", discountValue: "0.00", currency: "USD" });
  });
  it("stores the rounded manual original and derives an exact-cent net", async () => {
    const result = await creationCaller.run({ ...baseInput, contractValueOverride: 100.129, discountValue: 0.13 });
    expect(result.contract).toMatchObject({ originalContractValueEur: "100.13", discountValue: "0.13", contractValue: "100.00", netContractValueEur: "100.00" });
  });
  it("allows a full discount, including the explicit zero net document override", async () => {
    const result = await creationCaller.run({ ...baseInput, discountValue: 15000 });
    expect(result.contract.contractValue).toBe("0.00");
    expect(mocks.generateContractDoc).toHaveBeenCalledWith(baseInput.clientName, 5, "26001", "spain", 0);
  });
  it.each([-1, 15000.01, NaN, Infinity, -Infinity, 0.001, 1.005, Number.MAX_VALUE])(
    "rejects discount %s with BAD_REQUEST before external work", async discountValue => {
      await expect(creationCaller.run({ ...baseInput, discountValue })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expectNoCreationWork();
    },
  );
  it.each([-1, NaN, Infinity, -Infinity, Number.MAX_VALUE])(
    "rejects invalid manual original %s before external work", async contractValueOverride => {
      await expect(creationCaller.run({ ...baseInput, contractValueOverride })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expectNoCreationWork();
    },
  );
  it("rejects a positive discount against a zero placeholder", async () => {
    await expect(creationCaller.run({ ...baseInput, country: "dominica", discountValue: 0.01 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoCreationWork();
  });
  it("preserves active consultant validation", async () => {
    mocks.isActiveContractConsultant.mockResolvedValue(false);
    await expect(creationCaller.run({ ...baseInput, consultantName: "Synthetic Inactive" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoCreationWork();
  });
  it("preserves Marketing Lead validation and source linkage", async () => {
    const result = await creationCaller.run({ ...baseInput, clientOrigin: "marketing", marketingLeadId: 12, discountValue: 5000 });
    expect(mocks.getMarketingLeadForContract).toHaveBeenCalledWith(12);
    expect(mocks.createContractWithClientOrigin.mock.calls[0][0]).toMatchObject({ clientOrigin: "marketing", marketingLeadId: 12 });
    expect(result.contract.contractValue).toBe("10000.00");
  });
});

describe("unchanged regeneration and one-time receipt discount behavior", () => {
  it("regeneration continues to use the persisted net amount", async () => {
    const regenerationSource = contractsBlock.slice(
      contractsBlock.indexOf("regenerateDoc: protectedProcedure") + "regenerateDoc: ".length,
      contractsBlock.indexOf("    getPaymentSummary: protectedProcedure"),
    ).trim().replace(/,$/, "");
    const caller = loadProcedure(regenerationSource);
    mocks.getContractById.mockResolvedValue({ id: 1, contractCode: "26001", clientName: baseInput.clientName, familyMembers: 5, country: "spain", originalContractValueEur: "15000.00", discountValue: "5000.00", netContractValueEur: "10000.00", contractValue: "10000.00" });
    await caller.run({ id: 1 });
    expect(mocks.generateContractDoc).toHaveBeenCalledWith(baseInput.clientName, 5, "26001", "spain", 10000);
  });
  // Execute the exact receipt schema and discount guard prefix only. Everything
  // after it (rates, receipts, PDF/email adapters) remains outside this harness.
  const invoicesBlock = contractsBlock.slice(contractsBlock.indexOf("  invoices: router({"));
  const receiptPrefix = invoicesBlock.slice(
    invoicesBlock.indexOf("create: protectedProcedure") + "create: ".length,
    invoicesBlock.indexOf("        const actualReceivedCurrency = input.actualReceivedCurrency"),
  );
  const receiptCaller = loadProcedure(`${receiptPrefix}\nreturn contract;\n})`);
  it("blocks reapplying a creation discount at the first receipt", async () => {
    mocks.getContractById.mockResolvedValue({ id: 1, discountValue: "5000.00", contractValue: "10000.00" });
    await expect(receiptCaller.run({ contractId: 1, amountEur: 500, notes: "Synthetic receipt", discountValue: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.applyContractDiscount).not.toHaveBeenCalled();
    expect(dbSource).toContain("if (Number(contract.discountValue ?? 0) > 0)");
  });
  it("leaves existing net billing untouched when no receipt discount is requested", async () => {
    mocks.getContractById.mockResolvedValue({ id: 1, discountValue: "5000.00", contractValue: "10000.00" });
    const result = await receiptCaller.run({ contractId: 1, amountEur: 500, notes: "Synthetic receipt" });
    expect(result.contractValue).toBe("10000.00");
    expect(mocks.applyContractDiscount).not.toHaveBeenCalled();
  });
  it("preserves one-time discount availability for legacy zero-discount contracts", async () => {
    mocks.getContractById.mockResolvedValue({ id: 1, discountValue: "0.00", contractValue: "15000.00" });
    await receiptCaller.run({ contractId: 1, amountEur: 500, notes: "Synthetic receipt", discountValue: 1000 });
    expect(mocks.applyContractDiscount).toHaveBeenCalledWith(1, 1000);
  });
});

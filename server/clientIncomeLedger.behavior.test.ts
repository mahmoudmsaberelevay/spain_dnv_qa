import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { finClients, finTransactions, invoices, payments, contracts, finAccounts } from "../drizzle/schema";
import { calculateClientIncomeLedger, getClientIncomeBalance, rebuildClientPaymentLedger } from "./clientPaymentLedger";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => state.db) }));
vi.mock("./_core/env", () => ({ ENV: { ownerOpenId: "mock-owner" } }));

import {
  applyContractDiscount, createInvoice, createPayment, deleteInvoice,
  getTotalPaidByContractId, markInvoicePaid, markInvoicePaidAndSyncFinancial,
  recalcClientPaidFromReceipts, recalcLegacyClientPaidFromReceipts,
  updateInvoicePdfUrl, updateInvoiceReceiptDate,
} from "./db";
import {
  createFinClient, getFinClientById, getFinClientByContractId, getFinClientTotals,
  listFinClients, recalcClientPaidAmount, updateFinClient,
} from "./finDb";

const client = (overrides: Record<string, unknown> = {}) => ({
  id: 7, contractId: 70, contractValue: "12000.00", contractValueEur: "12000.00",
  paidAmountEur: "9999.00", paidAmountEgp: "999999.00", remainingAmountEur: "2001.00",
  basePaidAmountEur: "0", isLegacy: false, name: "Mock client", ...overrides,
});
const income = (overrides: Record<string, unknown> = {}) => ({
  id: 1, finClientId: 7, type: "income", amount: "6000", transactionCurrency: "EGP",
  eurEquivalent: "100", ...overrides,
});

// In-memory Drizzle executor. It evaluates only bound predicates used here;
// no connection, providers, credentials, secrets or network calls are involved.
const dialect = new MySqlDialect();
let rows: Record<string, any[]>;
let writes: Array<{ table: string; operation: string; values?: any }>;
let forcedAffectedRows: number | undefined;
function matches(row: any, expression?: SQL) {
  if (!expression) return true;
  const { sql, params } = dialect.sqlToQuery(expression);
  let index = 0;
  const predicates = [...sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(=\s*\?|in\s*\((?:\?,?\s*)+\))/gi)];
  if (!predicates.length) throw new Error(`Unsupported mock condition: ${sql}`);
  return predicates.map(match => {
    const count = (match[2].match(/\?/g) ?? []).length;
    const expected = params.slice(index, index + count);
    index += count;
    return expected.includes(row[match[1]]);
  }).every(Boolean);
}
function selectBuilder(selection?: Record<string, any>) {
  let table = "";
  let predicate: SQL | undefined;
  let limit: number | undefined;
  let offset = 0;
  const builder: any = {
    from(value: any) { table = getTableName(value); return builder; },
    where(value: SQL) { predicate = value; return builder; },
    limit(value: number) { limit = value; return builder; },
    offset(value: number) { offset = value; return builder; },
    orderBy() { return builder; },
    then(resolve: any, reject: any) {
      try {
        const found = (rows[table] ?? []).filter(row => matches(row, predicate));
        if (selection && "totalContractValueEur" in selection) {
          return Promise.resolve([{ totalContractValueEur: 12000, totalPaidEur: 999999, totalPaidEgp: 999999, totalRemainingEur: 999999 }]).then(resolve, reject);
        }
        return Promise.resolve(found.slice(offset, limit === undefined ? undefined : offset + limit).map(row => ({ ...row }))).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    },
  };
  return builder;
}
function makeDb() {
  const db: any = {
    select: selectBuilder,
    update(table: any) {
      const name = getTableName(table);
      return { set(values: any) { return { async where(predicate: SQL) {
        writes.push({ table: name, operation: "update", values });
        const found = (rows[name] ?? []).filter(row => matches(row, predicate));
        const affectedRows = forcedAffectedRows ?? found.length;
        forcedAffectedRows = undefined;
        if (affectedRows > 0) found.forEach(row => Object.assign(row, values));
        return [{ affectedRows }];
      } }; } };
    },
    insert(table: any) {
      const name = getTableName(table);
      return { async values(values: any) {
        writes.push({ table: name, operation: "insert", values });
        const entries = Array.isArray(values) ? values : [values];
        rows[name] ??= [];
        entries.forEach(value => rows[name].push({ id: value.id ?? rows[name].length + 100, ...value }));
        return [{ insertId: rows[name].at(-1).id }];
      } };
    },
    delete(table: any) {
      const name = getTableName(table);
      return { async where(predicate: SQL) {
        writes.push({ table: name, operation: "delete" });
        rows[name] = (rows[name] ?? []).filter(row => !matches(row, predicate));
      } };
    },
    async transaction(callback: any) {
      const snapshot = structuredClone(rows);
      try { return await callback(db); }
      catch (error) { rows = snapshot; throw error; }
    },
  };
  return db;
}
const db = makeDb();
state.db = db;
const aggregateWrites = () => writes.filter(write => [getTableName(finClients), getTableName(finAccounts), getTableName(finTransactions)].includes(write.table));

beforeAll(() => vi.stubEnv("DATABASE_URL", "mysql://mock-only:mock-only@invalid.test/mock-only"));
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  rows = {
    [getTableName(finClients)]: [client()],
    [getTableName(finTransactions)]: [income()],
    [getTableName(contracts)]: [{ id: 70, status: "signed", contractValue: "12000", originalContractValueEur: "12000", discountValue: "0" }],
    [getTableName(invoices)]: [], [getTableName(payments)]: [], [getTableName(finAccounts)]: [{ id: 1, balance: "1234" }],
  };
  writes = [];
  forcedAffectedRows = undefined;
});

describe("pure income-only valuation", () => {
  it("totals only actual EGP cash and frozen EUR equivalents across native currencies", () => {
    const result = calculateClientIncomeLedger(client(), [income(), income({ id: 2, amount: "2796.21", transactionCurrency: "EUR", eurEquivalent: "2796.21" }), income({ id: 3, amount: "80", transactionCurrency: "USD", eurEquivalent: "70" })]);
    expect(result).toMatchObject({ status: "verified", incomeCount: 3, paidAmountEur: 2966.21, paidAmountEgp: 6000, remainingAmountEur: 9033.79, issues: [] });
  });

  it("ignores wrong-client, null-linked, expense and transfer rows before valuation", () => {
    expect(calculateClientIncomeLedger(client(), [income(), income({ finClientId: 8, eurEquivalent: null }), income({ finClientId: null, eurEquivalent: null }), income({ type: "expense", eurEquivalent: null }), income({ type: "transfer", eurEquivalent: null })])).toMatchObject({ status: "verified", paidAmountEur: 100, paidAmountEgp: 6000, incomeCount: 1 });
  });

  it.each([null, undefined, "", " ", "not-a-number", "Infinity", Infinity, NaN, -1, "-1", false])("does not turn missing/invalid EUR %s into zero or use a today's/historical rate fallback", eurEquivalent => {
    const result = calculateClientIncomeLedger(client(), [income({ eurEquivalent, exchangeRate: "60", convertedAmount: "100" })]);
    expect(result).toMatchObject({ status: "valuation_required", paidAmountEur: null, remainingAmountEur: null, paidAmountEgp: 6000 });
    expect(result.issues[0].code).toBe("CLIENT_INCOME_VALUATION_REQUIRED");
  });

  it("requires frozen EUR even for EUR-native income and accepts approved EUR without a rate", () => {
    expect(calculateClientIncomeLedger(client(), [income({ transactionCurrency: "EUR", eurEquivalent: null })]).paidAmountEur).toBeNull();
    expect(calculateClientIncomeLedger(client(), [income({ eurEquivalent: "3603.79", exchangeRate: null })])).toMatchObject({ status: "verified", paidAmountEur: 3603.79 });
    expect(calculateClientIncomeLedger(client(), [income({ eurEquivalent: "0.00" })])).toMatchObject({ status: "verified", paidAmountEur: 0 });
  });

  it.each([{ source: [] }, { source: [income()] }])("flags every nonzero legacy base without counting it as credit", ({ source }) => {
    const result = calculateClientIncomeLedger(client({ basePaidAmountEur: "5000" }), source);
    expect(result.status).toBe("legacy_reconciliation_required");
    expect(result.paidAmountEur).toBe(source.length ? 100 : 0);
    expect(result.issues[0].code).toBe("CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED");
  });

  it("rounds and sums in cents deterministically with no discount subtraction twice", () => {
    const source = [income({ eurEquivalent: "0.10" }), income({ eurEquivalent: "0.20" })];
    const once = calculateClientIncomeLedger(client({ contractValueEur: "10000", originalContractValueEur: "12000", discountValue: "2000" }), source);
    expect(once.paidAmountEur).toBe(0.3);
    expect(once.remainingAmountEur).toBe(9999.7);
    expect(calculateClientIncomeLedger(client({ contractValueEur: "10000" }), [...source].reverse())).toEqual(once);
  });

  it.each([null, undefined, "", "bad", "-1", -1, Infinity])("flags invalid base %s instead of treating it as zero", basePaidAmountEur => {
    const audit = calculateClientIncomeLedger(client({ basePaidAmountEur }), [income()]);
    expect(audit.status).toBe("legacy_reconciliation_required");
    expect(audit.issues).toContainEqual({ code: "CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED", reason: "invalid_base" });
  });

  it.each([null, undefined, "", "bad", "-1", -1, Infinity])("flags invalid explicit EUR net %s without using arbitrary contractValue", contractValueEur => {
    const audit = calculateClientIncomeLedger(client({ contractValueEur, contractValue: "12000" }), [income()]);
    expect(audit.status).toBe("valuation_required");
    expect(audit.remainingAmountEur).toBeNull();
    expect(audit.issues).toContainEqual({ code: "CLIENT_INCOME_VALUATION_REQUIRED", reason: "invalid_net_contract" });
  });

  it("does not infer legacy reconciliation from the first valid new Income", () => {
    const legacy = client({ isLegacy: true, basePaidAmountEur: "0", paidAmountEur: "5000", paidAmountEgp: "300000" });
    expect(calculateClientIncomeLedger(legacy, []).status).toBe("legacy_reconciliation_required");
    expect(calculateClientIncomeLedger(legacy, [income()]).status).toBe("legacy_reconciliation_required");
    expect(calculateClientIncomeLedger({ ...legacy, incomeHistoryReconciled: true }, [income()])).toMatchObject({ status: "verified", paidAmountEur: 100 });
  });
});

describe("mocked ledger rebuild and contract reads", () => {
  it("rebuilds deterministically without reading/crediting payment evidence", async () => {
    rows.payments = [{ id: 99, contractId: 70, invoiceId: 99, amountEur: "8000" }];
    const first = await rebuildClientPaymentLedger(db, 7);
    const second = await rebuildClientPaymentLedger(db, 7);
    expect(first).toEqual(second);
    expect(rows.finClients[0]).toMatchObject({ paidAmountEur: "100.00", paidAmountEgp: "6000.00", remainingAmountEur: "11900.00", basePaidAmountEur: "0" });
    expect(writes).toHaveLength(2);
    expect(writes.every(write => write.table === "finClients")).toBe(true);
    expect(rows.payments[0].amountEur).toBe("8000");
  });

  it("fails before any summary write for missing EUR", async () => {
    rows.finTransactions[0].eurEquivalent = null;
    await expect(rebuildClientPaymentLedger(db, 7)).rejects.toThrow(/^CLIENT_INCOME_VALUATION_REQUIRED$/);
    expect(await recalcClientPaidAmount(7)).toMatchObject({ status: "valuation_required" });
    expect(writes).toEqual([]);
    expect(rows.finClients[0].paidAmountEur).toBe("9999.00");
  });

  it.each([{ source: [] }, { source: [income()] }])("does not erase any nonzero legacy base or cached summary", async ({ source }) => {
    rows.finClients[0].basePaidAmountEur = "5000";
    rows.finTransactions = source;
    await expect(rebuildClientPaymentLedger(db, 7)).rejects.toThrow(/^CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED$/);
    expect(await recalcClientPaidAmount(7)).toMatchObject({ status: "legacy_reconciliation_required" });
    expect(writes).toEqual([]);
    expect(rows.finClients[0].paidAmountEur).toBe("9999.00");
  });

  it("preserves unmatched prior legacy cash after a first valid Income", async () => {
    Object.assign(rows.finClients[0], { isLegacy: true, basePaidAmountEur: "0", paidAmountEur: "5000", paidAmountEgp: "300000" });
    expect((await recalcClientPaidAmount(7))?.status).toBe("legacy_reconciliation_required");
    expect(writes).toEqual([]);
    expect(rows.finClients[0].paidAmountEur).toBe("5000");
  });

  it("records zero-history provenance once and permits subsequent valid legacy Incomes", async () => {
    Object.assign(rows.finClients[0], { isLegacy: true, basePaidAmountEur: "0", paidAmountEur: "0", paidAmountEgp: "0" });
    await rebuildClientPaymentLedger(db, 7);
    rows.finTransactions.push(income({ id: 2 }));
    await rebuildClientPaymentLedger(db, 7);
    expect(rows.finClients[0].paidAmountEur).toBe("200.00");
    expect(rows.audit_logs.filter(row => row.action === "CLIENT_INCOME_HISTORY_VERIFIED")).toHaveLength(1);
    expect((await listFinClients())[0].incomeBalanceStatus).toBe("verified");
  });

  it("does not project cached EGP as Income when native cash is unknown", async () => {
    rows.finTransactions[0].transactionCurrency = null;
    const listed = (await listFinClients())[0];
    expect(listed.paidAmountEgp).toBeNull();
    expect(listed.previousUnverifiedPaidAmountEgp).toBe("999999.00");
    const totals = await getFinClientTotals();
    expect(totals?.totalPaidEgp).toBeNull();
    expect(totals?.incomeEgpUnverifiedClientCount).toBe(1);
  });

  it("never swallows unknown database failures during mutation refresh", async () => {
    const failing = vi.spyOn(db, "select").mockImplementationOnce(() => { throw new Error("MOCK_DATABASE_FAILURE"); });
    await expect(recalcClientPaidAmount(7)).rejects.toThrow("MOCK_DATABASE_FAILURE");
    failing.mockRestore();
    expect(writes).toEqual([]);
  });

  it.each([
    { field: "basePaidAmountEur", code: "CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED" },
    { field: "contractValueEur", code: "CLIENT_INCOME_VALUATION_REQUIRED" },
  ])("invalid $field blocks strict rebuild and causes no refresh summary writes", async ({ field, code }) => {
    rows.finClients[0][field] = null;
    await expect(rebuildClientPaymentLedger(db, 7)).rejects.toThrow(code);
    expect((await recalcClientPaidAmount(7))?.status).not.toBe("verified");
    expect(writes).toEqual([]);
    expect(rows.finClients[0].paidAmountEur).toBe("9999.00");
  });

  it("reads contract paid only from linked income and raises flagged sanitized errors", async () => {
    rows.payments = [{ contractId: 70, amountEur: "9000" }];
    rows.finTransactions.push(income({ finClientId: 8, eurEquivalent: "9000" }), income({ type: "expense", eurEquivalent: "8000" }));
    expect(await getTotalPaidByContractId(70)).toBe(100);
    rows.finTransactions[0].eurEquivalent = null;
    await expect(getTotalPaidByContractId(70)).rejects.toThrow(/^CLIENT_INCOME_VALUATION_REQUIRED$/);
    expect(writes).toEqual([]);
  });

  it("exposes read-only status without silently coercing unresolved EUR", async () => {
    rows.finTransactions[0].eurEquivalent = null;
    expect(await getClientIncomeBalance(db, 7)).toMatchObject({ status: "valuation_required", paidAmountEur: null, paidAmountEgp: 6000 });
    expect(await getClientIncomeBalance(db, 888)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("preserves one-time original/net discount and recalculates income-only remaining", async () => {
    await applyContractDiscount(70, 2000);
    expect(rows.contracts[0]).toMatchObject({ originalContractValueEur: "12000.00", netContractValueEur: "10000.00", contractValue: "10000.00", discountValue: "2000.00" });
    expect(rows.finClients[0]).toMatchObject({ contractValueEur: "10000.00", paidAmountEur: "100.00", remainingAmountEur: "9900.00" });
    await expect(applyContractDiscount(70, 1)).rejects.toThrow("A discount has already been applied");
  });
});

describe("receipt evidence mutations never write aggregates", () => {
  const receipt = (legacy: boolean) => ({
    id: 10, invoiceCode: "MOCK-R", contractId: legacy ? null : 70,
    legacyFinClientId: legacy ? 7 : null, isLegacyReceipt: legacy, status: "unpaid",
    clientName: "Mock client", amountEur: "200", amountEgp: "12000", actualPaidAmountEgp: "6000",
    actualReceivedAmount: "6000", actualReceivedCurrency: "EGP", exchangeRate: "60", paymentExchangeRate: "60", paymentEurEquivalent: "100",
  });

  it.each([false, true])("create, settle, edit date/pdf, mark and delete have zero aggregate writes (legacy=%s)", async legacy => {
    const original = structuredClone(rows.finClients[0]);
    await createInvoice(receipt(legacy) as any);
    const result = await markInvoicePaidAndSyncFinancial(10);
    expect(result.clientCreated).toBe(false);
    expect(result.totalPaidEur).toBe(100);
    expect(result.remainingEur).toBe(11900);
    await updateInvoiceReceiptDate(10, new Date("2026-01-01"));
    await updateInvoicePdfUrl(10, "https://invalid.test/mock.pdf");
    await markInvoicePaid(10);
    await recalcClientPaidFromReceipts(70);
    await recalcLegacyClientPaidFromReceipts(7);
    expect(await deleteInvoice(10)).toBe(true);
    expect(aggregateWrites()).toEqual([]);
    expect(rows.finClients[0]).toEqual(original);
    expect(rows.finAccounts[0].balance).toBe("1234");
    expect(rows.finTransactions[0]).toEqual(income());
  });

  it("keeps all historical payments when settling a new standard receipt", async () => {
    rows.invoices = [receipt(false)];
    rows.payments = [{ id: 40, invoiceId: 40, contractId: 70, amountEur: "9000" }];
    await markInvoicePaidAndSyncFinancial(10);
    expect(rows.payments).toHaveLength(2);
    expect(rows.payments[0].amountEur).toBe("9000");
    expect(writes.some(write => write.table === "payments" && write.operation === "delete")).toBe(false);
    expect(aggregateWrites()).toEqual([]);
  });

  it("preserves unresolved legacy summaries while settling evidence", async () => {
    rows.invoices = [receipt(true)];
    rows.finClients[0].basePaidAmountEur = "5000";
    rows.finTransactions[0].eurEquivalent = null;
    const result = await markInvoicePaidAndSyncFinancial(10);
    expect(result.incomeBalance?.status).toBe("valuation_required");
    expect(result.totalPaidEur).toBeNull();
    expect(result.remainingEur).toBeNull();
    expect(rows.finClients[0].paidAmountEur).toBe("9999.00");
    expect(aggregateWrites()).toEqual([]);
  });

  it("does not create a client or set a signing date during receipt settlement", async () => {
    rows.invoices = [receipt(false)];
    rows.finClients = [];
    expect((await markInvoicePaidAndSyncFinancial(10)).clientCreated).toBe(false);
    expect(rows.finClients).toEqual([]);
    expect(aggregateWrites()).toEqual([]);
  });

  it("preserves already-paid, unsigned-contract and race guards", async () => {
    rows.invoices = [receipt(false)];
    rows.invoices[0].status = "paid";
    await expect(markInvoicePaidAndSyncFinancial(10)).rejects.toThrow("INVOICE_ALREADY_PAID");
    rows.invoices[0].status = "unpaid";
    rows.contracts[0].status = "pending";
    await expect(markInvoicePaidAndSyncFinancial(10)).rejects.toThrow("INVOICE_CONTRACT_NOT_SIGNED");
    expect(writes).toEqual([]);
    rows.contracts[0].status = "signed";
    forcedAffectedRows = 0;
    await expect(markInvoicePaidAndSyncFinancial(10)).rejects.toThrow("INVOICE_ALREADY_PAID");
    expect(rows.invoices[0].status).toBe("unpaid");
    expect(rows.payments).toEqual([]);
    expect(aggregateWrites()).toEqual([]);
  });

  it("retired helpers perform no reads or writes, and payment evidence cannot alter totals", async () => {
    expect(await recalcClientPaidFromReceipts(70)).toEqual({ retired: true, balancesChanged: false });
    expect(await recalcLegacyClientPaidFromReceipts(7)).toEqual({ retired: true, balancesChanged: false });
    expect(writes).toEqual([]);
    await createPayment({ contractId: 70, invoiceId: 10, amountEur: "5000" });
    expect(aggregateWrites()).toEqual([]);
    expect(await getTotalPaidByContractId(70)).toBe(100);
  });
});

describe("income-derived client projections and mutation safeguards", () => {
  it("list/get project verified incomes without writing cached summaries", async () => {
    expect(await listFinClients()).toMatchObject([{ paidAmountEur: "100.00", paidAmountEgp: "6000.00", remainingAmountEur: "11900.00", incomeBalanceStatus: "verified", incomeBalanceIssueCodes: [] }]);
    expect(await getFinClientById(7)).toMatchObject({ paidAmountEur: "100.00", balanceSource: "income" });
    expect(await getFinClientByContractId(70)).toMatchObject({ paidAmountEur: "100.00" });
    expect(rows.finClients[0].paidAmountEur).toBe("9999.00");
    expect(writes).toEqual([]);
  });

  it("shows missing-EUR cached values only as unverified while projecting exact EGP", async () => {
    rows.finTransactions[0].eurEquivalent = null;
    expect(await getFinClientById(7)).toMatchObject({ paidAmountEur: "9999.00", remainingAmountEur: "2001.00", paidAmountEgp: "6000.00", incomeBalanceStatus: "valuation_required", incomeBalanceIssueCodes: ["CLIENT_INCOME_VALUATION_REQUIRED"], incomeBalanceVerified: false, balanceSource: "cached_unverified" });
    const totals = await getFinClientTotals();
    expect(totals).toMatchObject({ totalPaidEur: 0, totalRemainingEur: 0, totalPaidEgp: 6000, incomeBalanceReconciliationCount: 1, incomeBalanceStatus: "incomplete" });
    expect(writes).toEqual([]);
  });

  it("blocks manual aggregate credits and preserves unresolved values during metadata/net edits", async () => {
    await expect(createFinClient({ name: "Mock", paidAmountEur: "100" })).rejects.toThrow("CLIENT_INCOME_LEDGER_ONLY");
    await expect(updateFinClient(7, { paidAmountEur: "0" })).rejects.toThrow("CLIENT_INCOME_LEDGER_ONLY");
    await expect(updateFinClient(7, { basePaidAmountEur: "0" })).rejects.toThrow("CLIENT_INCOME_LEDGER_ONLY");
    expect(writes).toEqual([]);
    rows.finTransactions[0].eurEquivalent = null;
    await updateFinClient(7, { name: "Metadata edit", contractValueEur: "10000" });
    expect(rows.finClients[0]).toMatchObject({ name: "Metadata edit", contractValueEur: "10000", paidAmountEur: "9999.00", remainingAmountEur: "2001.00" });
    expect(writes[0].values).not.toHaveProperty("paidAmountEur");
  });

  it("net edits recompute verified income remaining without manual overrides", async () => {
    await updateFinClient(7, { contractValueEur: "10000" });
    expect(rows.finClients[0]).toMatchObject({ paidAmountEur: "100.00", paidAmountEgp: "6000.00", remainingAmountEur: "9900.00" });
  });
});

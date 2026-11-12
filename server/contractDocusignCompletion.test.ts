import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

// Importing the adapter must never load a real DB/env or an integration module.
const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn(() => { throw new Error("REAL_DATABASE_FORBIDDEN"); }) }));
vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./contractLeadService", () => { throw new Error("MANUAL_SERVICE_IMPORT_FORBIDDEN"); });
vi.mock("./finDb", () => { throw new Error("FIN_SERVICE_IMPORT_FORBIDDEN"); });
vi.mock("./contractDocusignProvider", () => { throw new Error("PROVIDER_IMPORT_FORBIDDEN"); });
vi.mock("./metaLeadsService", () => { throw new Error("META_IMPORT_FORBIDDEN"); });

import { createDocusignCompletionAdapter } from "./contractDocusignCompletion";
import { DocusignError } from "./contractDocusignConfig";

const NOW = Date.parse("2026-11-12T10:00:00.000Z");
const VERIFIED = NOW - 1000;
const SIGNED = "2026-11-12T09:30:00.000Z";
const ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT = "00000000-0000-4000-8000-000000000002";
const PROVIDER = "00000000-0000-4000-8000-000000000003";
type Row = Record<string, any>;
type Write = { table: string; kind: string; values: Row };
const dialect = new MySqlDialect();

function fixture() {
  const contract: Row = {
    id: 11, contractCode: "2611001", clientName: "Synthetic Client", invoicingName: "Synthetic Invoice",
    docUrl: "https://example.invalid/synthetic.docx", country: "spain", currency: "EUR",
    status: "pending", clientOrigin: "marketing", marketingLeadId: 41,
    familyMembers: 3, consultantName: "Synthetic Consultant", clientMobile: "+00000000000",
    originalContractValueEur: "10000.00", netContractValueEur: "9000.00", contractValue: "9000.00", discountValue: "1000.00",
  };
  const row: Row = {
    id: ID, contractId: 11, version: 1, status: "completed", environment: "production", accountId: ACCOUNT,
    providerEnvelopeId: PROVIDER, recipientId: "1", recipientVerified: true, hasSignatureTabs: true,
    errorCode: null, documentSourceUrl: contract.docUrl, documentHash: "a".repeat(64),
    createdByUserId: 7, createdByName: "Synthetic Ledger Actor", revokedAt: null,
    documentSourceSnapshot: {
      contractCode: contract.contractCode, clientName: contract.clientName, sourceUrl: contract.docUrl, country: contract.country,
      financialSnapshot: { originalValue: "10000.00", netValue: "9000.00", discount: "1000.00", currency: "EUR" },
      completionProfile: "verified-production-v1", completionVerifiedAt: VERIFIED, completionSignedAt: SIGNED,
    },
  };
  return { contract, row, lead: { id: 41, stage: "qualified", updatedAt: 1, lastContactAt: 1 } };
}

/** Executes real Drizzle SQL predicates against synthetic rows, and implements a
 * serialized transactional store with rollback. No real DB, env, provider, or timers. */
function store(input = fixture()) {
  const state: Record<string, Row[]> = {
    contracts: [input.contract], contractDocusignEnvelopes: [input.row], leads: [input.lead],
    lead_activities: [], finClients: [], finCommissions: [], payments: [{ id: 99, amountEur: "123.00" }],
    finTransactions: [{ id: 98, amount: "450.00" }],
  };
  const writes: Write[] = [], locks: string[] = [], attempts: Write[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let pending: Write[] = [];
  let beforeContractLock: (() => void) | undefined;
  let failTable: string | undefined;
  let zeroUpdateTable: string | undefined;
  const matches = (where: SQL | undefined, row: Row) => {
    if (!where) return true;
    const compiled = dialect.sqlToQuery(where);
    const columns = [...compiled.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(m => m[1]);
    if (columns.length !== compiled.params.length) throw new Error(`UNSUPPORTED_SYNTHETIC_PREDICATE ${compiled.sql}`);
    return columns.every((column, i) => row[column] === compiled.params[i]);
  };
  const tx: any = {
    select(selection?: Record<string, any>) {
      let table: string, where: SQL | undefined, limit = Infinity, order = false;
      const execute = () => {
        let rows = state[table].filter(row => matches(where, row));
        if (order) rows = [...rows].sort((a, b) => b.version - a.version);
        rows = rows.slice(0, limit);
        if (selection && Object.values(selection).some(v => v?.queryChunks)) return [{ total: state[table].length }];
        return rows.map(row => selection
          ? Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[column.name]]))
          : structuredClone(row));
      };
      const builder: any = {
        from(value: any) { table = getTableName(value); return builder; },
        where(value: SQL) { where = value; return builder; },
        limit(value: number) { limit = value; return builder; },
        orderBy() { order = true; return builder; },
        for(mode: string) {
          expect(mode).toBe("update");
          if (table === "contracts") beforeContractLock?.();
          locks.push(table);
          return Promise.resolve(execute());
        },
        then(resolve: (value: any) => void, reject: (error: any) => void) {
          return Promise.resolve().then(execute).then(resolve, reject);
        },
      };
      return builder;
    },
    update(tableValue: any) {
      const table = getTableName(tableValue);
      return { set(values: Row) { return { where(where: SQL) {
        const write = { table, kind: "update", values: structuredClone(values) };
        attempts.push(write);
        if (failTable === table) throw new Error("RAW_SQL_SECRET client@email.invalid DATABASE_PASSWORD");
        if (zeroUpdateTable === table) return Promise.resolve([{ affectedRows: 0 }]);
        const rows = state[table].filter(row => matches(where, row));
        rows.forEach(row => Object.assign(row, structuredClone(values)));
        pending.push(write);
        return Promise.resolve([{ affectedRows: rows.length }]);
      } }; } };
    },
    insert(tableValue: any) {
      const table = getTableName(tableValue);
      return { values(values: Row) {
        const write = { table, kind: "insert", values: structuredClone(values) };
        attempts.push(write);
        if (failTable === table) throw new Error("RAW_SQL_SECRET client@email.invalid DATABASE_PASSWORD");
        const id = Math.max(0, ...state[table].map(row => row.id)) + 1;
        state[table].push({ id, ...structuredClone(values) });
        pending.push(write);
        return Promise.resolve([{ insertId: id, affectedRows: 1 }]);
      } };
    },
  };
  const db: any = { transaction: vi.fn((callback: (value: any) => unknown) => {
    const run = chain.then(async () => {
      const snapshot = structuredClone(state);
      pending = [];
      try {
        const result = await callback(tx);
        writes.push(...pending);
        return result;
      } catch (error) {
        for (const table of Object.keys(state)) state[table] = snapshot[table];
        throw error;
      }
    });
    chain = run.catch(() => undefined);
    return run;
  }) };
  const database = vi.fn(async () => db);
  const binding = vi.fn(() => ({ environment: "production", accountId: ACCOUNT }));
  const complete = createDocusignCompletionAdapter({ database, binding, now: () => NOW });
  return {
    state, writes, attempts, locks, complete, database, binding, db,
    beforeLock: (fn: () => void) => { beforeContractLock = fn; },
    fail: (table: string) => { failTable = table; },
    zeroUpdate: (table: string) => { zeroUpdateTable = table; },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("verified production DocuSign completion", () => {
  it("atomically signs, converts the linked Lead with ledger attribution, and creates net-value finance rows", async () => {
    const s = store();
    const payments = structuredClone([s.state.payments, s.state.finTransactions]);
    await expect(s.complete(ID)).resolves.toEqual({ status: "signed" });
    expect(s.locks.slice(0, 2)).toEqual(["contracts", "contractDocusignEnvelopes"]);
    expect(s.state.contracts[0].status).toBe("signed");
    expect(s.state.leads[0]).toMatchObject({ stage: "client", updatedAt: NOW, lastContactAt: NOW });
    expect(s.state.lead_activities).toHaveLength(1);
    expect(s.state.lead_activities[0]).toMatchObject({ leadId: 41, userId: 7, activityType: "stage_changed", createdAt: NOW });
    expect(s.state.lead_activities[0].description).toContain("Synthetic Ledger Actor");
    expect(s.state.finClients[0]).toMatchObject({
      contractId: 11, name: "Synthetic Invoice", clientCode: "2611001", program: "Spain Nomad",
      contractValue: "9000.00", contractValueEur: "9000.00", remainingAmountEur: "9000.00",
      paidAmountEur: "0.00", paidAmountEgp: "0.00", basePaidAmountEur: "0.00", isLegacy: false,
      signingDate: new Date(SIGNED),
    });
    expect(s.state.finCommissions[0]).toMatchObject({ finClientId: s.state.finClients[0].id, contractValue: "9000.00", status: "Pending", signingDate: new Date(SIGNED) });
    expect(Object.keys(s.state.finCommissions[0]).some(key => /Amount|Payment|CommissionDate/.test(key))).toBe(false);
    expect(s.state.contractDocusignEnvelopes[0].documentSourceSnapshot).toMatchObject({ syncCompletedAt: NOW, financeReviewRequired: false });
    expect([s.state.payments, s.state.finTransactions]).toEqual(payments);
    expect(s.db.transaction).toHaveBeenCalledTimes(1);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("repeated and concurrent completion under the contract lock add no extra writes", async () => {
    const s = store();
    const results = await Promise.all(Array.from({ length: 8 }, () => s.complete(ID)));
    expect(results.filter(r => r.status === "signed")).toHaveLength(1);
    expect(results.filter(r => r.status === "already_signed")).toHaveLength(7);
    const committed = structuredClone(s.writes);
    await expect(s.complete(ID)).resolves.toEqual({ status: "already_signed" });
    expect(s.writes).toEqual(committed);
    expect(s.state.lead_activities).toHaveLength(1);
    expect(s.state.finClients).toHaveLength(1);
    expect(s.state.finCommissions).toHaveLength(1);
    expect(s.attempts.filter(w => ["payments", "finTransactions"].includes(w.table))).toHaveLength(0);
  });

  it("preserves existing unique Financial client and all commission/payment history byte-for-byte", async () => {
    const s = store();
    const client = { id: 67, contractId: 11, paidAmountEur: "4000.00", paidAmountEgp: "200000.00", basePaidAmountEur: "3000.00", remainingAmountEur: "5000.00", isLegacy: true, signingDate: new Date(0) };
    const commission = { id: 88, finClientId: 67, consultantFirstPayment: "999.00", status: "Started" };
    s.state.finClients.push(client); s.state.finCommissions.push(commission);
    const prior = structuredClone([s.state.finClients, s.state.finCommissions, s.state.payments, s.state.finTransactions]);
    await s.complete(ID);
    expect([s.state.finClients, s.state.finCommissions, s.state.payments, s.state.finTransactions]).toEqual(prior);
    expect(s.writes.filter(w => ["finClients", "finCommissions"].includes(w.table))).toHaveLength(0);
  });

  it("creates only a missing commission for the exact existing finClientId, not another client's commission", async () => {
    const s = store();
    s.state.finClients.push({ id: 67, contractId: 11, paidAmountEur: "4000.00" });
    s.state.finCommissions.push({ id: 88, finClientId: 999, clientName: "Synthetic Other" });
    await s.complete(ID);
    expect(s.state.finClients).toEqual([{ id: 67, contractId: 11, paidAmountEur: "4000.00" }]);
    expect(s.state.finCommissions).toHaveLength(2);
    expect(s.state.finCommissions[1]).toMatchObject({ finClientId: 67, seqNumber: 2 });
  });

  it("does not duplicate Lead history for a Lead already at client", async () => {
    const s = store(); s.state.leads[0].stage = "client";
    const prior = structuredClone(s.state.leads);
    await s.complete(ID);
    expect(s.state.leads).toEqual(prior);
    expect(s.state.lead_activities).toEqual([]);
  });

  it("signs referral contracts without any Lead writes", async () => {
    const s = store(); Object.assign(s.state.contracts[0], { clientOrigin: "referral", marketingLeadId: null });
    await s.complete(ID);
    expect(s.state.leads[0].stage).toBe("qualified");
    expect(s.state.lead_activities).toEqual([]);
  });

  it.each(["egypt", "dominica", "saint_kitts", "grenada"])("maps an EUR %s contract from country, never hardcoded Spain", async country => {
    const s = store(); s.state.contracts[0].country = country;
    s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.country = country;
    await expect(s.complete(ID)).resolves.toEqual({ status: "signed" });
    expect(s.state.finClients[0].program).not.toBe("Spain Nomad");
  });

  it.each(["USD", "GBP", "EGP"])("signs %s with Lead conversion, persists finance review, and never writes EUR finance", async currency => {
    const s = store(); s.state.contracts[0].currency = currency;
    s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.financialSnapshot.currency = currency;
    s.state.finClients.push({ id: 67, contractId: 11, paidAmountEur: "4000.00" });
    s.state.finCommissions.push({ id: 88, finClientId: 67, consultantFirstPayment: "999.00" });
    const prior = structuredClone([s.state.finClients, s.state.finCommissions]);
    await expect(s.complete(ID)).resolves.toEqual({ status: "signed", financeReviewRequired: true });
    expect(s.state.leads[0].stage).toBe("client");
    expect([s.state.finClients, s.state.finCommissions]).toEqual(prior);
    expect(s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.financeReviewRequired).toBe(true);
    await expect(s.complete(ID)).resolves.toEqual({ status: "already_signed", financeReviewRequired: true });
    expect(s.writes.filter(w => ["finClients", "finCommissions"].includes(w.table))).toEqual([]);
  });

  it("uses verified server time if provider signing timestamp is absent, never redirect time", async () => {
    const s = store(); delete s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionSignedAt;
    await s.complete(ID);
    expect(s.state.finClients[0].signingDate).toEqual(new Date(VERIFIED));
  });

  it("compares normalized financial snapshot and safely supports the legacy original-value fallback", async () => {
    const s = store(); s.state.contracts[0].originalContractValueEur = null;
    s.state.contracts[0].currency = " eur ";
    s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.financialSnapshot.netValue = "9000";
    await expect(s.complete(ID)).resolves.toEqual({ status: "signed" });
    expect(s.state.finClients[0].contractValueEur).toBe("9000.00");
  });

  it.each(["25000.00", "invalid", null, undefined, 25000])("rejects actual contractValue %s despite consistent explicit original/net values before any write", async contractValue => {
    const s = store();
    Object.assign(s.state.contracts[0], {
      originalContractValueEur: "15000.00", discountValue: "5000.00",
      netContractValueEur: "10000.00", contractValue,
    });
    Object.assign(s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.financialSnapshot, {
      originalValue: "15000.00", discount: "5000.00", netValue: "10000.00",
    });
    const before = structuredClone(s.state);
    await expect(s.complete(ID)).resolves.toEqual({ status: "review_required" });
    expect(s.attempts).toEqual([]);
    expect(s.writes).toEqual([]);
    expect(s.state).toEqual(before);
  });

  it("keeps exact net-value creation unchanged when actual contractValue matches explicit net", async () => {
    const s = store();
    Object.assign(s.state.contracts[0], {
      originalContractValueEur: "15000.00", discountValue: "5000.00",
      netContractValueEur: "10000.00", contractValue: "10000",
    });
    Object.assign(s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.financialSnapshot, {
      originalValue: "15000.00", discount: "5000.00", netValue: "10000.00",
    });
    await expect(s.complete(ID)).resolves.toEqual({ status: "signed" });
    expect(s.state.finClients[0]).toMatchObject({
      contractValue: "10000.00", contractValueEur: "10000.00", remainingAmountEur: "10000.00",
    });
    expect(s.state.finCommissions[0].contractValue).toBe("10000.00");
  });

  it("disables a nonproduction runtime before accessing the database", async () => {
    const s = store(); s.binding.mockReturnValue({ environment: "demo", accountId: ACCOUNT });
    await expect(s.complete(ID)).resolves.toEqual({ status: "disabled" });
    expect(s.database).not.toHaveBeenCalled();
  });

  it.each(["demo", "dummy"])("never completes a %s/dummy row", async scenario => {
    const s = store();
    if (scenario === "demo") s.state.contractDocusignEnvelopes[0].environment = "demo";
    else s.state.contracts[0].contractCode = "DS-DEMO-TEST";
    await expect(s.complete(ID)).resolves.toEqual({ status: "disabled" });
    expect(s.writes).toEqual([]);
  });

  const invalid: [string, (s: ReturnType<typeof store>) => void][] = [
    ["production account mismatch", s => { s.state.contractDocusignEnvelopes[0].accountId = PROVIDER; }],
    ["missing provider envelope", s => { s.state.contractDocusignEnvelopes[0].providerEnvelopeId = null; }],
    ["provider signed is not completed", s => { s.state.contractDocusignEnvelopes[0].status = "signed"; }],
    ["not completed", s => { s.state.contractDocusignEnvelopes[0].status = "delivered"; }],
    ["recipient not verified", s => { s.state.contractDocusignEnvelopes[0].recipientVerified = false; }],
    ["tabs not verified", s => { s.state.contractDocusignEnvelopes[0].hasSignatureTabs = false; }],
    ["wrong recipient id", s => { s.state.contractDocusignEnvelopes[0].recipientId = "2"; }],
    ["error code", s => { s.state.contractDocusignEnvelopes[0].errorCode = "UNVERIFIED"; }],
    ["legacy completed without profile", s => { delete s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionProfile; }],
    ["wrong profile", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionProfile = "legacy"; }],
    ["no verification timestamp", s => { delete s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionVerifiedAt; }],
    ["future verification timestamp", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionVerifiedAt = NOW + 1; }],
    ["malformed timestamp", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionVerifiedAt = "123"; }],
    ["changed contract code", s => { s.state.contracts[0].contractCode = "2611999"; }],
    ["changed contract name", s => { s.state.contracts[0].clientName = "Changed Synthetic Client"; }],
    ["changed document URL", s => { s.state.contracts[0].docUrl = "https://example.invalid/changed.docx"; }],
    ["changed country", s => { s.state.contracts[0].country = "egypt"; }],
    ["missing snapshot country", s => { delete s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.country; }],
    ["changed snapshot source URL", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.sourceUrl = "https://example.invalid/other.docx"; }],
    ["cancelled contract", s => { s.state.contracts[0].status = "cancelled"; }],
    ["marker without signed status", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.syncCompletedAt = NOW; }],
    ["missing financial snapshot", s => { delete s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.financialSnapshot; }],
    ["changed net value", s => { s.state.contracts[0].netContractValueEur = "8000.00"; }],
    ["changed original value", s => { s.state.contracts[0].originalContractValueEur = "11000.00"; }],
    ["changed discount", s => { s.state.contracts[0].discountValue = "2000.00"; }],
    ["changed currency", s => { s.state.contracts[0].currency = "USD"; }],
    ["signed date after verification", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionSignedAt = "2026-11-13T00:00:00Z"; }],
    ["invalid signed date", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.completionSignedAt = "client-redirect"; }],
    ["malformed metadata", s => { s.state.contractDocusignEnvelopes[0].documentSourceSnapshot = []; }],
    ["invalid actor", s => { s.state.contractDocusignEnvelopes[0].createdByUserId = 0; }],
  ];
  it.each(invalid)("fails closed with no writes: %s", async (_label, mutate) => {
    const s = store(); mutate(s);
    await expect(s.complete(ID)).resolves.toEqual({ status: "review_required" });
    expect(s.writes).toEqual([]); expect(s.attempts).toEqual([]);
  });

  it("does not alter manually signed contracts or backfill their finance/history/marker", async () => {
    const s = store(); s.state.contracts[0].status = "signed";
    await expect(s.complete(ID)).resolves.toEqual({ status: "already_signed" });
    expect(s.writes).toEqual([]); expect(s.state.finClients).toEqual([]);
    expect(s.state.contractDocusignEnvelopes[0].documentSourceSnapshot.syncCompletedAt).toBeUndefined();
  });

  it("reads latest version after contract locking, rejecting an old envelope even if the newer one is voided", async () => {
    const s = store();
    s.beforeLock(() => {
      if (s.state.contractDocusignEnvelopes.length === 1) s.state.contractDocusignEnvelopes.push({ ...structuredClone(s.state.contractDocusignEnvelopes[0]), id: PROVIDER, version: 2, status: "voided" });
    });
    await expect(s.complete(ID)).resolves.toEqual({ status: "review_required" });
    expect(s.writes).toEqual([]);
    expect(s.locks.slice(0, 3)).toEqual(["contracts", "contractDocusignEnvelopes", "contractDocusignEnvelopes"]);
  });

  it.each([null, 999])("missing linked Lead %s rolls back without financial effects", async leadId => {
    const s = store(); s.state.contracts[0].marketingLeadId = leadId;
    const before = structuredClone(s.state);
    await expect(s.complete(ID)).rejects.toMatchObject({ name: "DocusignError", safeCode: "MARKETING_LEAD_UNAVAILABLE" });
    expect(s.state).toEqual(before); expect(s.writes).toEqual([]);
  });

  it("a failed SQL linked-Lead guard rolls back the already-issued contract update", async () => {
    const s = store(); const before = structuredClone(s.state); s.zeroUpdate("leads");
    await expect(s.complete(ID)).rejects.toMatchObject({ safeCode: "MARKETING_LEAD_UNAVAILABLE" });
    expect(s.attempts.some(w => w.table === "contracts")).toBe(true);
    expect(s.state).toEqual(before); expect(s.writes).toEqual([]);
  });

  it.each(["finClients", "finCommissions", "contractDocusignEnvelopes"])("%s failure rolls back all effects and sanitizes DB secrets", async table => {
    const s = store(); const before = structuredClone(s.state); s.fail(table);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const error = await s.complete(ID).catch(error => error);
      expect(error).toBeInstanceOf(DocusignError);
      expect(error.safeCode).toBe("COMPLETION_SYNC_FAILED");
      expect(error.message).not.toContain("RAW_SQL_SECRET"); expect(error).not.toHaveProperty("cause");
      expect(s.state).toEqual(before); expect(s.writes).toEqual([]);
      expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
    } finally { log.mockRestore(); warn.mockRestore(); }
  });

  it("an invalid envelope id returns a sanitized review without database access", async () => {
    const s = store(); await expect(s.complete("PII@example.invalid")).resolves.toEqual({ status: "review_required" });
    expect(s.database).not.toHaveBeenCalled();
  });

  it.each(["clientName", "contractCode", "docUrl", "country", "currency", "netContractValueEur"])("revalidates %s from the newly locked contract, not an earlier identity read", async field => {
    const s = store();
    s.beforeLock(() => { s.state.contracts[0][field] = "changed-after-identity-read"; });
    await expect(s.complete(ID)).resolves.toEqual({ status: "review_required" });
    expect(s.attempts).toEqual([]);
  });

  it.each(["contracts", "contractDocusignEnvelopes"])("zero affected rows on %s rolls back all effects", async table => {
    const s = store(); const before = structuredClone(s.state); s.zeroUpdate(table);
    await expect(s.complete(ID)).rejects.toMatchObject({ safeCode: "COMPLETION_CONFLICT" });
    expect(s.state).toEqual(before); expect(s.writes).toEqual([]);
  });

  it("a rolled-back transient failure can be retried without duplicate history or ledger effects", async () => {
    const s = store(); s.fail("finCommissions");
    await expect(s.complete(ID)).rejects.toMatchObject({ safeCode: "COMPLETION_SYNC_FAILED" });
    s.fail("never-fail");
    await expect(s.complete(ID)).resolves.toEqual({ status: "signed" });
    await expect(s.complete(ID)).resolves.toEqual({ status: "already_signed" });
    expect(s.state.lead_activities).toHaveLength(1);
    expect(s.state.finClients).toHaveLength(1);
    expect(s.state.finCommissions).toHaveLength(1);
  });

  it("preserves the caller's document proof and unrelated JSON metadata when storing the atomic effect marker", async () => {
    const s = store(); const meta = s.state.contractDocusignEnvelopes[0].documentSourceSnapshot;
    meta.completionDocumentProof = { version: "text-outside-required-tabs-v1", pageCount: 1, pageSizes: [{ width: 600, height: 800 }], contentHash: "b".repeat(64), boxes: [{ page: 1, x: 10, y: 20, width: 72, height: 26 }] };
    meta.lastLinkRenewalRequestId = PROVIDER;
    const before = structuredClone(meta);
    await s.complete(ID);
    expect(s.state.contractDocusignEnvelopes[0].documentSourceSnapshot).toEqual({ ...before, syncCompletedAt: NOW, financeReviewRequired: false });
  });

  it("sanitizes failures acquiring the injected database and never logs them", async () => {
    const s = store(); s.database.mockRejectedValueOnce(new Error("RAW_SQL_SECRET"));
    await expect(s.complete(ID)).rejects.toMatchObject({ safeCode: "COMPLETION_SYNC_FAILED", message: "COMPLETION_SYNC_FAILED" });
    expect(s.writes).toEqual([]);
  });
});

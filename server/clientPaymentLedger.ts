import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, finClients, finTransactions } from "../drizzle/schema";

type DbTransaction = any;

export type ClientIncomeIssueCode =
  | "CLIENT_INCOME_VALUATION_REQUIRED"
  | "CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED";

export interface ClientIncomeLedgerClient {
  id: number;
  contractValueEur?: unknown;
  contractValue?: unknown;
  basePaidAmountEur?: unknown;
  paidAmountEur?: unknown;
  paidAmountEgp?: unknown;
  isLegacy?: boolean;
  /** Server-loaded provenance only; never inferred from presence of Income. */
  incomeHistoryReconciled?: boolean;
}

export interface ClientIncomeLedgerRow {
  id?: number;
  finClientId: number | null;
  type: string;
  amount: unknown;
  transactionCurrency: unknown;
  eurEquivalent: unknown;
}

export interface ClientIncomeLedgerIssue {
  code: ClientIncomeIssueCode;
  transactionId?: number;
  reason: "missing_or_invalid_eur" | "missing_or_invalid_amount_or_currency" | "unreconciled_legacy_income" | "invalid_base" | "invalid_net_contract";
}

export interface ClientIncomeLedgerAudit {
  clientId: number;
  incomeCount: number;
  status: "verified" | "valuation_required" | "legacy_reconciliation_required";
  /** Null means incomplete, never a zero-credit valuation fallback. */
  paidAmountEur: number | null;
  paidAmountEgp: number | null;
  remainingAmountEur: number | null;
  issues: ClientIncomeLedgerIssue[];
}

function nonNegativeMoney(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const cents = Math.round((parsed + Number.EPSILON) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Pure, read-only audit: only income explicitly linked to this client contributes.
 * Receipts, payments, account settings, dates and live rates are not inputs.
 * A stored EUR equivalent is mandatory even for EUR-native income. Legacy bases
 * are never credits; unreconciled historical clients are blocked from erasure.
 * Totals are cents-based and independent of row order or previous summaries.
 */
export function calculateClientIncomeLedger(
  client: ClientIncomeLedgerClient,
  rows: readonly ClientIncomeLedgerRow[],
): ClientIncomeLedgerAudit {
  const incomeRows = rows.filter(row => row.finClientId === client.id && row.type === "income");
  const issues: ClientIncomeLedgerIssue[] = [];
  let eurCents = 0;
  let egpCents = 0;
  let eurComplete = true;
  let egpComplete = true;

  for (const row of incomeRows) {
    const eur = nonNegativeMoney(row.eurEquivalent);
    const amount = nonNegativeMoney(row.amount);
    const currency = typeof row.transactionCurrency === "string" ? row.transactionCurrency.trim().toUpperCase() : "";
    if (eur === null) {
      eurComplete = false;
      issues.push({ code: "CLIENT_INCOME_VALUATION_REQUIRED", transactionId: row.id, reason: "missing_or_invalid_eur" });
    } else {
      eurCents += eur;
    }
    if (amount === null || !["EGP", "EUR", "USD"].includes(currency)) {
      egpComplete = false;
      issues.push({ code: "CLIENT_INCOME_VALUATION_REQUIRED", transactionId: row.id, reason: "missing_or_invalid_amount_or_currency" });
    } else if (currency === "EGP") {
      egpCents += amount;
    }
  }

  const baseCents = nonNegativeMoney(client.basePaidAmountEur);
  const netCents = nonNegativeMoney(client.contractValueEur);
  if (baseCents === null) {
    issues.push({ code: "CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED", reason: "invalid_base" });
  }
  if (netCents === null) {
    issues.push({ code: "CLIENT_INCOME_VALUATION_REQUIRED", reason: "invalid_net_contract" });
  }

  // Nonzero bases stay untouched evidence, not extra credits. Even some valid
  // new income cannot prove that the historical baseline has been reconciled.
  if ((baseCents !== null && baseCents > 0) || (
    client.isLegacy && client.incomeHistoryReconciled !== true
    && ((nonNegativeMoney(client.paidAmountEur) ?? 0) > 0 || (nonNegativeMoney(client.paidAmountEgp) ?? 0) > 0)
  )) {
    issues.push({ code: "CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED", reason: "unreconciled_legacy_income" });
  }

  const paidAmountEur = eurComplete ? eurCents / 100 : null;
  const paidAmountEgp = egpComplete ? egpCents / 100 : null;
  return {
    clientId: client.id,
    incomeCount: incomeRows.length,
    status: issues.some(issue => issue.code === "CLIENT_INCOME_VALUATION_REQUIRED")
      ? "valuation_required"
      : issues.length > 0 ? "legacy_reconciliation_required" : "verified",
    paidAmountEur,
    paidAmountEgp,
    remainingAmountEur: paidAmountEur === null || netCents === null ? null : Math.max(0, netCents - eurCents) / 100,
    issues,
  };
}

/** Sanitized error: no transaction values, client details, SQL or provider data. */
export function assertClientIncomeLedgerComplete(audit: ClientIncomeLedgerAudit): asserts audit is ClientIncomeLedgerAudit & {
  paidAmountEur: number;
  paidAmountEgp: number;
  remainingAmountEur: number;
} {
  if (audit.issues.some(issue => issue.code === "CLIENT_INCOME_VALUATION_REQUIRED")) {
    throw new Error("CLIENT_INCOME_VALUATION_REQUIRED");
  }
  if (audit.issues.some(issue => issue.code === "CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED")) {
    throw new Error("CLIENT_LEGACY_INCOME_RECONCILIATION_REQUIRED");
  }
}

const LEGACY_INCOME_HISTORY_VERIFIED = "CLIENT_INCOME_HISTORY_VERIFIED";

/** Existing audit metadata proves zero legacy history was explicitly verified.
 * This never contributes money and receipt reads never create a marker.
 */
export async function readClientIncomeHistoryMarkers(tx: DbTransaction, clients: readonly ClientIncomeLedgerClient[]): Promise<Set<number>> {
  const candidates = clients.filter(client => client.isLegacy && nonNegativeMoney(client.basePaidAmountEur) === 0);
  if (candidates.length === 0) return new Set();
  const rows = await tx.select({ resourceId: auditLogs.resourceId }).from(auditLogs).where(and(
    eq(auditLogs.action, LEGACY_INCOME_HISTORY_VERIFIED), eq(auditLogs.resource, "finClients"),
    inArray(auditLogs.resourceId, candidates.map(client => String(client.id))),
  ));
  return new Set(rows.map((row: { resourceId: string | null }) => Number(row.resourceId)));
}

/** Read-only companion, usable by settlement and administrative audits. */
export async function readClientIncomeLedger(tx: DbTransaction, client: ClientIncomeLedgerClient) {
  const incomeRows = await tx.select({
    id: finTransactions.id,
    finClientId: finTransactions.finClientId,
    type: finTransactions.type,
    amount: finTransactions.amount,
    transactionCurrency: finTransactions.transactionCurrency,
    eurEquivalent: finTransactions.eurEquivalent,
  }).from(finTransactions).where(and(
    eq(finTransactions.finClientId, client.id),
    eq(finTransactions.type, "income"),
  ));
  const reconciled = await readClientIncomeHistoryMarkers(tx, [client]);
  return calculateClientIncomeLedger({ ...client, incomeHistoryReconciled: reconciled.has(client.id) }, incomeRows);
}

/** Read-only lookup. Null means no client; unresolved totals are never silently posted. */
export async function getClientIncomeBalance(tx: DbTransaction, clientId: number) {
  const [client] = await tx.select().from(finClients).where(eq(finClients.id, clientId)).limit(1);
  return client ? readClientIncomeLedger(tx, client) : null;
}

/** Rebuild only derived summaries; validate every row before any summary write. */
export async function rebuildClientPaymentLedger(tx: DbTransaction, clientId: number) {
  const [client] = await tx.select().from(finClients).where(eq(finClients.id, clientId)).limit(1);
  if (!client) return null;
  const audit = await readClientIncomeLedger(tx, client);
  assertClientIncomeLedgerComplete(audit);
  const { paidAmountEur, paidAmountEgp, remainingAmountEur } = audit;
  if (client.isLegacy && nonNegativeMoney(client.basePaidAmountEur) === 0) {
    const markers = await readClientIncomeHistoryMarkers(tx, [client]);
    if (!markers.has(client.id)) await tx.insert(auditLogs).values({
      action: LEGACY_INCOME_HISTORY_VERIFIED, resource: "finClients", resourceId: String(client.id),
      details: JSON.stringify({ source: "linked Finance Income only", basePaidAmountEur: client.basePaidAmountEur,
        previousPaidAmountEur: client.paidAmountEur, previousPaidAmountEgp: client.paidAmountEgp,
        reason: "Verified zero historical base and no unmatched prior paid history before income-only rebuild" }),
      createdAt: Date.now(),
    });
  }
  await tx.update(finClients).set({
    paidAmountEur: paidAmountEur.toFixed(2),
    paidAmountEgp: paidAmountEgp.toFixed(2),
    remainingAmountEur: remainingAmountEur.toFixed(2),
  }).where(eq(finClients.id, clientId));
  return { paidAmountEur, paidAmountEgp, remainingAmountEur };
}

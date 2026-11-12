import { and, desc, eq, sql } from "drizzle-orm";
import {
  contracts, contractDocusignEnvelopes, finClients, finCommissions, leads,
  leadActivities, type Contract, type ContractDocusignEnvelope,
} from "../drizzle/schema";
import { getDb } from "./db";
import { DocusignError, UUID } from "./contractDocusignConfig";

export type DocusignCompletionResult = {
  status: "signed" | "already_signed" | "review_required" | "disabled";
  financeReviewRequired?: boolean;
};
type CompletionDependencies = {
  database: typeof getDb;
  binding: () => { environment: string | undefined; accountId: string | undefined };
  now: () => number;
};
type Metadata = Record<string, unknown>;
const PROFILE = "verified-production-v1";
// Match the contract-country catalog without importing document generation or any
// external integrations. Retain the existing Financial label for Spain.
const PROGRAMS: Readonly<Record<string, string>> = {
  spain: "Spain Nomad",
  egypt: "Egypt Citizenship",
  dominica: "Dominica Citizenship",
  saint_kitts: "Saint Kitts & Nevis Citizenship",
  grenada: "Grenada Citizenship",
};
const review = (): DocusignCompletionResult => ({ status: "review_required" });

function metadata(row: ContractDocusignEnvelope): Metadata | null {
  const value: unknown = row.documentSourceSnapshot;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Metadata : null;
}
function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    && Number.isFinite(new Date(value).getTime());
}
// Money compares in integer cents, never floating point subtraction or a new FX
// rate. The existing contract/Financial decimal columns have at most 10 whole digits.
function cents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
function financialState(contract: Contract, meta: Metadata) {
  const snapshot = meta.financialSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const saved = snapshot as Metadata;
  const net = cents(contract.netContractValueEur ?? contract.contractValue);
  const discount = cents(contract.discountValue ?? "0");
  if (net === null || discount === null) return null;
  const legacyValue = cents(contract.contractValue);
  if (legacyValue === null || legacyValue !== net) return null;
  const original = contract.originalContractValueEur == null
    ? legacyValue + discount : cents(contract.originalContractValueEur);
  const currency = contract.currency.trim().toUpperCase();
  if (original === null || original - discount !== net || !/^[A-Z]{3}$/.test(currency)
      || cents(saved.netValue) !== net || cents(saved.originalValue) !== original
      || cents(saved.discount) !== discount || typeof saved.currency !== "string"
      || saved.currency.trim().toUpperCase() !== currency) return null;
  return { net: (net / 100).toFixed(2), currency };
}
function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: unknown } | undefined)?.affectedRows ?? 0);
}

/**
 * Trusted internal boundary, NOT a client redirect/webhook entry point. The caller
 * must first verify authoritative provider COMPLETED status, the exact completed
 * recipient and mandatory tabs, current saved-source bytes, and signed PDF text
 * outside the fixed signing boxes, then persist this new profile + verification
 * timestamp and row.status=completed. No provider/document I/O occurs here.
 *
 * The factory injects only local dependencies so tests never inspect real settings,
 * connect to a database, or load provider/Meta/notification modules.
 */
export function createDocusignCompletionAdapter(deps: CompletionDependencies) {
  return async function finalize(envelopeId: string): Promise<DocusignCompletionResult> {
    try {
      const binding = deps.binding();
      if (binding.environment !== "production") return { status: "disabled" };
      if (!UUID.test(binding.accountId ?? "")) return review();
      if (!UUID.test(envelopeId)) return review();
      const db = await deps.database();
      if (!db) throw new DocusignError("DATABASE_UNAVAILABLE");

      return await db.transaction(async tx => {
        // This non-locking identity lookup is ONLY for resolving the contract. The
        // first acquired lock is always the contract, then this exact ledger row.
        const [identity] = await tx.select({ contractId: contractDocusignEnvelopes.contractId })
          .from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.id, envelopeId)).limit(1);
        if (!identity) return review();
        const [contract] = await tx.select().from(contracts)
          .where(eq(contracts.id, identity.contractId)).limit(1).for("update");
        const [row] = await tx.select().from(contractDocusignEnvelopes)
          .where(eq(contractDocusignEnvelopes.id, envelopeId)).limit(1).for("update");
        if (!contract || !row || row.contractId !== contract.id) return review();
        if (row.environment !== "production" || /^DS-DEMO(?:\b|[-_])/i.test(contract.contractCode)) {
          return { status: "disabled" };
        }
        if (row.accountId.toLowerCase() !== binding.accountId!.toLowerCase()
            || !UUID.test(row.providerEnvelopeId ?? "")) return review();
        const meta = metadata(row);
        if (!meta || meta.completionProfile !== PROFILE || !timestamp(meta.completionVerifiedAt)
            || row.status !== "completed" || row.errorCode !== null
            || row.recipientVerified !== true || row.hasSignatureTabs !== true
            || row.recipientId !== "1") return review();
        // A current locking read avoids an old consistent-read snapshot after a
        // concurrent prepare transaction commits while we wait for its contract lock.
        const [latest] = await tx.select({ id: contractDocusignEnvelopes.id, version: contractDocusignEnvelopes.version })
          .from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.contractId, contract.id))
          .orderBy(desc(contractDocusignEnvelopes.version)).limit(1).for("update");
        if (!latest || latest.id !== row.id || latest.version !== row.version) return review();
        if (!contract.docUrl || contract.docUrl !== row.documentSourceUrl
            || contract.docUrl !== meta.sourceUrl || contract.contractCode !== meta.contractCode
            || contract.clientName !== meta.clientName || contract.country !== meta.country) return review();

        // Never repair/reverse a manual status change or a previously synchronized
        // contract. The completion marker is an atomic effect guard, not a retry job.
        if (contract.status === "cancelled") return review();
        if (meta.syncCompletedAt !== undefined) {
          if (!timestamp(meta.syncCompletedAt) || contract.status !== "signed") return review();
          return { status: "already_signed", ...(meta.financeReviewRequired === true ? { financeReviewRequired: true } : {}) };
        }
        if (contract.status === "signed") return { status: "already_signed" };
        if (contract.status !== "pending") return review();
        const financial = financialState(contract, meta);
        if (!financial) return review();
        const financeReviewRequired = financial.currency !== "EUR" || !PROGRAMS[contract.country];
        const verifiedAt = meta.completionVerifiedAt;
        const signedAt = meta.completionSignedAt === undefined
          ? new Date(verifiedAt) : typeof meta.completionSignedAt === "string"
            && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(meta.completionSignedAt)
            ? new Date(meta.completionSignedAt) : new Date(NaN);
        if (!Number.isFinite(signedAt.getTime()) || signedAt.getTime() > verifiedAt) return review();
        const now = deps.now();
        if (!timestamp(now) || verifiedAt > now) return review();
        if (!Number.isSafeInteger(row.createdByUserId) || row.createdByUserId <= 0
            || typeof row.createdByName !== "string" || !row.createdByName.trim()) return review();

        // Missing/dangling marketing links fail before any write, and the SQL
        // affected-row guards below roll back the entire transaction on a race.
        let lead: { id: number; stage: string } | undefined;
        if (contract.clientOrigin === "marketing") {
          if (!contract.marketingLeadId) throw new DocusignError("MARKETING_LEAD_UNAVAILABLE");
          [lead] = await tx.select({ id: leads.id, stage: leads.stage }).from(leads)
            .where(eq(leads.id, contract.marketingLeadId)).limit(1).for("update");
          if (!lead) throw new DocusignError("MARKETING_LEAD_UNAVAILABLE");
        }
        const changed = await tx.update(contracts).set({ status: "signed" })
          .where(and(eq(contracts.id, contract.id), eq(contracts.status, "pending")));
        if (affected(changed) !== 1) throw new DocusignError("COMPLETION_CONFLICT");
        if (lead && lead.stage !== "client") {
          const converted = await tx.update(leads).set({ stage: "client", lastContactAt: now, updatedAt: now })
            .where(and(eq(leads.id, lead.id), eq(leads.stage, lead.stage as typeof leads.$inferSelect.stage)));
          if (affected(converted) !== 1) throw new DocusignError("MARKETING_LEAD_UNAVAILABLE");
          await tx.insert(leadActivities).values({
            leadId: lead.id, userId: row.createdByUserId, activityType: "stage_changed",
            description: `Stage changed from "${lead.stage}" to "client" when Contract ${contract.contractCode} was marked Signed by ${row.createdByName}`,
            createdAt: now,
          });
        }

        // No payments, receipts, ledger rebuilds, FX quotes, or commission amounts.
        // Existing Financial rows are read-only, including historical signing dates.
        if (!financeReviewRequired) {
          let [client] = await tx.select({ id: finClients.id }).from(finClients)
            .where(eq(finClients.contractId, contract.id)).limit(1).for("update");
          if (!client) {
            const [created] = await tx.insert(finClients).values({
              contractId: contract.id, name: contract.invoicingName ?? contract.clientName,
              clientCode: contract.contractCode.match(/^(\d+)/)?.[1],
              phone: contract.clientMobile ?? undefined, familyMembers: contract.familyMembers,
              consultant: contract.consultantName ?? undefined,
              program: PROGRAMS[contract.country], signingDate: signedAt,
              contractValue: financial.net, contractValueEur: financial.net,
              remainingAmountEur: financial.net, paidAmountEur: "0.00",
              paidAmountEgp: "0.00", basePaidAmountEur: "0.00", isLegacy: false,
            });
            if (!Number.isSafeInteger(created.insertId) || created.insertId <= 0) {
              throw new DocusignError("FINANCIAL_CLIENT_CREATE_FAILED");
            }
            client = { id: created.insertId };
          }
          const [commission] = await tx.select({ id: finCommissions.id }).from(finCommissions)
            .where(eq(finCommissions.finClientId, client.id)).limit(1).for("update");
          if (!commission) {
            // Keep original manual sequence semantics; this is display ordering,
            // never an identity key. Exact finClientId is the idempotency key here.
            const [count] = await tx.select({ total: sql<number>`COUNT(*)` }).from(finCommissions);
            await tx.insert(finCommissions).values({
              finClientId: client.id, clientName: contract.invoicingName ?? contract.clientName,
              consultant: contract.consultantName ?? null, contractValue: financial.net,
              seqNumber: Number(count?.total ?? 0) + 1, status: "Pending",
              signingDate: signedAt, leaderName: "Mahmoud Saber",
            });
          }
        }
        const completed = await tx.update(contractDocusignEnvelopes).set({
          documentSourceSnapshot: { ...row.documentSourceSnapshot, syncCompletedAt: now, financeReviewRequired },
          updatedAt: new Date(now),
        }).where(eq(contractDocusignEnvelopes.id, row.id));
        if (affected(completed) !== 1) throw new DocusignError("COMPLETION_CONFLICT");
        return { status: "signed", ...(financeReviewRequired ? { financeReviewRequired: true } : {}) };
      });
    } catch (error) {
      // Preserve only codes originating in this module; never expose DB errors,
      // causes, SQL, PII, or log raw failures. The transaction has already rolled back.
      const safeCodes = new Set(["DATABASE_UNAVAILABLE", "MARKETING_LEAD_UNAVAILABLE", "COMPLETION_CONFLICT", "FINANCIAL_CLIENT_CREATE_FAILED"]);
      if (error instanceof DocusignError && safeCodes.has(error.safeCode)) throw error;
      throw new DocusignError("COMPLETION_SYNC_FAILED");
    }
  };
}

export const finalizeVerifiedDocusignContract = createDocusignCompletionAdapter({
  database: getDb,
  binding: () => ({ environment: process.env.DOCUSIGN_ENVIRONMENT, accountId: process.env.DOCUSIGN_ACCOUNT_ID }),
  now: Date.now,
});

import { eq, desc } from "drizzle-orm";
import { contracts, contractDocusignEnvelopes, type ContractDocusignEnvelope } from "../drizzle/schema";
import { getDb, getContractById } from "./db";
import { DocusignError } from "./contractDocusignConfig";
export type EnvelopeRow = ContractDocusignEnvelope;
export type ContractSource = { id: number; contractCode: string; clientName: string; status: string; docUrl: string | null };
export interface LedgerSession {
  list(contractId: number): Promise<EnvelopeRow[]>;
  get(id: string): Promise<EnvelopeRow | null>;
  byRequest(requestId: string): Promise<EnvelopeRow | null>;
  insert(row: EnvelopeRow): Promise<void>;
  patch(id: string, patch: Partial<EnvelopeRow>): Promise<EnvelopeRow>;
}
export interface DocusignStore extends LedgerSession {
  contract(id: number): Promise<ContractSource | null>;
  withContractLock<T>(id: number, fn: (source: ContractSource, ledger: LedgerSession) => Promise<T>): Promise<T>;
  withEnvelopeLock<T>(id: string, fn: (row: EnvelopeRow, ledger: LedgerSession) => Promise<T>): Promise<T>;
}
function session(db: any): LedgerSession {
  const get = async (id: string) => (await db.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.id, id)).limit(1))[0] ?? null;
  return {
    get,
    list: id => db.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.contractId, id)).orderBy(desc(contractDocusignEnvelopes.version)),
    byRequest: async id => (await db.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.requestId, id)).limit(1))[0] ?? null,
    insert: async row => { await db.insert(contractDocusignEnvelopes).values(row); },
    patch: async (id, values) => { await db.update(contractDocusignEnvelopes).set(values).where(eq(contractDocusignEnvelopes.id, id)); const row = await get(id); if (!row) throw new DocusignError("ENVELOPE_UNAVAILABLE"); return row; },
  };
}
async function database() { const db = await getDb(); if (!db) throw new DocusignError("DATABASE_UNAVAILABLE"); return db; }
export const docusignStore: DocusignStore = {
  contract: async id => await getContractById(id) ?? null,
  get: async id => session(await database()).get(id),
  list: async id => session(await database()).list(id),
  byRequest: async id => session(await database()).byRequest(id),
  insert: async row => session(await database()).insert(row),
  patch: async (id, values) => session(await database()).patch(id, values),
  withContractLock: async (id, fn) => (await database()).transaction(async tx => {
    const [source] = await tx.select({ id: contracts.id, contractCode: contracts.contractCode, clientName: contracts.clientName, status: contracts.status, docUrl: contracts.docUrl }).from(contracts).where(eq(contracts.id, id)).limit(1).for("update");
    if (!source) throw new DocusignError("CONTRACT_UNAVAILABLE");
    return fn(source, session(tx));
  }),
  withEnvelopeLock: async (id, fn) => (await database()).transaction(async tx => {
    const [row] = await tx.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.id, id)).limit(1).for("update");
    if (!row) throw new DocusignError("ENVELOPE_UNAVAILABLE");
    return fn(row, session(tx));
  }),
};

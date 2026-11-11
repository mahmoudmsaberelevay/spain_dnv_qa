import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { SafeEnvelope, PrepareDocusignInput, ContractDocusignStatus } from "../shared/contractDocusign";
import { DocusignError, getDocusignConfig, type DocusignConfig } from "./contractDocusignConfig";
import { JwtDocusignProvider, type DocusignProvider, type DraftInput, type ProviderRecipient } from "./contractDocusignProvider";
import { fetchSavedDocument, type SavedDocument } from "./contractDocusignDocument";
import { docusignStore, type DocusignStore, type EnvelopeRow, type ContractSource } from "./contractDocusignStore";
import type { DocusignActor } from "./contractDocusignAccess";
export const POLL_INTERVAL_MS = 15 * 60 * 1000;
const terminal = new Set<ContractDocusignStatus>(["completed", "declined", "voided"]);
const digest = (name: string, email: string) => createHash("sha256").update(JSON.stringify([name, email])).digest("hex");
const time = (date: Date | null) => date?.getTime() ?? 0;
function pending(source: ContractSource | null): asserts source is ContractSource & { docUrl: string } { if (!source || source.status !== "pending" || !source.docUrl) throw new DocusignError("PENDING_SAVED_CONTRACT_REQUIRED"); }
function shareable(row: EnvelopeRow, now: number) {
  return ["sent", "delivered"].includes(row.status) && row.hasSignatureTabs && row.recipientVerified && !row.errorCode && !row.revokedAt && (!row.linkExpiresAt || time(row.linkExpiresAt) > now) && !!row.lastCheckedAt && now - time(row.lastCheckedAt) < POLL_INTERVAL_MS && time(row.lastCheckAttemptAt) <= time(row.lastCheckedAt);
}
export function safeEnvelope(row: EnvelopeRow, now = Date.now()): SafeEnvelope {
  return { id: row.id, version: row.version, contractId: row.contractId, envelopeId: row.providerEnvelopeId, status: row.status, recipientName: row.recipientName, email: row.recipientEmail, createdAt: row.createdAt, updatedAt: row.updatedAt, lastCheckedAt: row.lastCheckedAt, linkExpiresAt: row.linkExpiresAt, nextRefreshAt: terminal.has(row.status) || !row.providerEnvelopeId ? null : row.lastCheckAttemptAt ? new Date(time(row.lastCheckAttemptAt) + POLL_INTERVAL_MS) : null, canShare: shareable(row, now), hasSignatureTabs: row.hasSignatureTabs, errorCode: row.errorCode, documentHash: row.documentHash };
}
export function inspectSigner(row: EnvelopeRow, recipients: Record<string, unknown>) {
  const signers = recipients.signers as ProviderRecipient[];
  if (!Array.isArray(signers) || signers.length !== 1 || Object.keys(recipients).some(key => key !== "signers" && Array.isArray(recipients[key]) && (recipients[key] as unknown[]).length > 0)) return { verified: false, mandatory: false, completed: false };
  const signer = signers[0];
  const verified = signer.recipientId === row.recipientId && signer.clientUserId === row.clientUserId && signer.name === row.recipientName && signer.email?.toLowerCase() === row.recipientEmail && !["declined", "autoresponded"].includes(signer.status ?? "");
  const tabs = signer.tabs?.signHereTabs as any[] | undefined;
  const mandatory = verified && Array.isArray(tabs) && tabs.some(tab => tab.documentId === "1" && (tab.optional === undefined || tab.optional === false || tab.optional === "false") && !tab.tabGroupLabels?.length && !tab.conditionalParentLabel && !tab.conditionalParentValue && !tab.conditionalParentId && Number(tab.pageNumber) >= 1 && Number.isFinite(Number(tab.xPosition)) && Number.isFinite(Number(tab.yPosition)) && Number(tab.xPosition) >= 0 && Number(tab.yPosition) >= 0 && (tab.recipientId === undefined || tab.recipientId === row.recipientId));
  return { verified, mandatory, completed: signer.status === "completed" || signer.status === "signed" };
}
export class ContractDocusignService {
  constructor(private readonly store: DocusignStore, private readonly provider: DocusignProvider, private readonly config: DocusignConfig, private readonly document: (url: string) => Promise<SavedDocument> = fetchSavedDocument, private readonly now = Date.now) {}
  private date() { return new Date(Math.floor(this.now() / 1000) * 1000); }
  private async row(id: string) { const row = await this.store.get(id); if (!row) throw new DocusignError("ENVELOPE_UNAVAILABLE"); this.binding(row); return row; }
  private binding(row: EnvelopeRow) { if (row.environment !== this.config.environment || row.accountId !== this.config.accountId) throw new DocusignError("ACCOUNT_BINDING_MISMATCH"); }
  private async sourceMatches(row: EnvelopeRow) {
    const source = await this.store.contract(row.contractId); pending(source);
    if (source.docUrl !== row.documentSourceUrl || source.contractCode !== row.documentSourceSnapshot.contractCode || source.clientName !== row.documentSourceSnapshot.clientName) throw new DocusignError("CONTRACT_SOURCE_CHANGED");
    const document = await this.document(source.docUrl);
    if (document.hash !== row.documentHash) throw new DocusignError("CONTRACT_SOURCE_CHANGED");
    const after = await this.store.contract(row.contractId); pending(after);
    if (after.docUrl !== source.docUrl || after.contractCode !== source.contractCode || after.clientName !== source.clientName) throw new DocusignError("CONTRACT_SOURCE_CHANGED");
  }
  private recipient(row: EnvelopeRow): DraftInput { return { id: row.id, document: Buffer.alloc(0), documentName: row.documentName, recipientName: row.recipientName, recipientEmail: row.recipientEmail, clientUserId: row.clientUserId, recipientId: row.recipientId }; }
  async history(contractId: number) { if (!await this.store.contract(contractId)) throw new DocusignError("CONTRACT_UNAVAILABLE"); return (await this.store.list(contractId)).map(row => safeEnvelope(row, this.now())); }
  async prepare(input: PrepareDocusignInput, actor: DocusignActor) {
    const recipientName = input.recipientName.trim(); const recipientEmail = input.recipientEmail.trim().toLowerCase();
    const source = await this.store.contract(input.contractId); pending(source);
    const document = await this.document(source.docUrl);
    const reservation = await this.store.withContractLock(input.contractId, async (locked, ledger) => {
      pending(locked); if (locked.docUrl !== source.docUrl || locked.clientName !== source.clientName || locked.contractCode !== source.contractCode) throw new DocusignError("CONTRACT_SOURCE_CHANGED");
      const existing = await ledger.byRequest(input.requestId);
      if (existing) {
        this.binding(existing);
        if (existing.contractId !== input.contractId || existing.recipientDigest !== digest(recipientName, recipientEmail) || existing.documentHash !== document.hash) throw new DocusignError("IDEMPOTENCY_CONFLICT");
        return { row: existing, reserved: false };
      }
      const history = await ledger.list(input.contractId); const latest = history[0];
      if (latest && !terminal.has(latest.status) && !(latest.status === "error" && !latest.providerEnvelopeId)) throw new DocusignError(latest.status === "uncertain" || latest.status === "preparing" ? "MANUAL_RECONCILIATION_REQUIRED" : "ACTIVE_ENVELOPE_EXISTS");
      const id = randomUUID(); const date = this.date();
      const row: EnvelopeRow = { id, contractId: input.contractId, version: (latest?.version ?? 0) + 1, requestId: input.requestId, documentSourceUrl: locked.docUrl, documentHash: document.hash, documentSourceSnapshot: { contractCode: locked.contractCode, clientName: locked.clientName, sourceUrl: locked.docUrl }, documentName: document.name, documentExtension: "docx", recipientName, recipientEmail, recipientDigest: digest(recipientName, recipientEmail), clientUserId: `elevay-${id}`, recipientId: "1", providerEnvelopeId: null, environment: this.config.environment, accountId: this.config.accountId, status: "preparing", hasSignatureTabs: false, recipientVerified: false, errorCode: null, createdByUserId: actor.id, createdByName: (actor.name ?? "CRM user").slice(0,255), linkNonce: randomBytes(32).toString("hex"), createdAt: date, updatedAt: date, lastCheckedAt: null, lastCheckAttemptAt: null, linkExpiresAt: null, revokedAt: null };
      await ledger.insert(row); return { row, reserved: true };
    });
    if (!reservation.reserved) {
      if (reservation.row.status !== "draft" || !reservation.row.providerEnvelopeId) throw new DocusignError("MANUAL_RECONCILIATION_REQUIRED");
      return { envelope: safeEnvelope(reservation.row, this.now()), senderUrl: (await this.senderView(reservation.row.id)).url };
    }
    let row = reservation.row;
    try {
      // Reserve is already committed before any provider write. Never repeat this POST.
      const envelopeId = await this.provider.createDraft({ ...this.recipient(row), document: document.bytes });
      row = await this.store.patch(row.id, { providerEnvelopeId: envelopeId, status: "draft", updatedAt: this.date() });
    } catch (error) {
      const safe = error instanceof DocusignError ? error : new DocusignError("PREPARATION_UNCERTAIN", true);
      await this.store.patch(row.id, { status: safe.uncertain ? "uncertain" : "error", errorCode: safe.safeCode, updatedAt: this.date() });
      throw safe;
    }
    // A sender-view failure never discards/recreates the safely persisted draft.
    return { envelope: safeEnvelope(row, this.now()), senderUrl: (await this.senderView(row.id)).url };
  }
  async senderView(id: string) { const row = await this.row(id); if (row.status !== "draft" || !row.providerEnvelopeId) throw new DocusignError("DRAFT_REQUIRED"); await this.sourceMatches(row); return { url: await this.provider.createSenderView(row.providerEnvelopeId) }; }
  async refresh(id: string): Promise<SafeEnvelope> { return safeEnvelope(await this.refreshRow(id), this.now()); }
  private async refreshRow(id: string): Promise<EnvelopeRow> {
    const reservation = await this.store.withEnvelopeLock(id, async (row, ledger) => {
      this.binding(row);
      if (terminal.has(row.status) || !row.providerEnvelopeId || (row.lastCheckAttemptAt && this.now() < time(row.lastCheckAttemptAt) + POLL_INTERVAL_MS)) return { row, check: false };
      const updated = await ledger.patch(id, { lastCheckAttemptAt: this.date(), updatedAt: this.date() }); return { row: updated, check: true };
    });
    if (!reservation.check) return reservation.row;
    const row = reservation.row;
    try {
      const raw = await this.provider.getEnvelopeStatus(row.providerEnvelopeId!);
      const status: ContractDocusignStatus = raw === "created" ? "draft" : raw === "signed" ? "completed" : ["sent", "delivered", "completed", "declined", "voided"].includes(raw) ? raw as ContractDocusignStatus : "uncertain";
      let verified = false; let mandatory = false; let code: string | null = status === "uncertain" ? "UNSUPPORTED_PROVIDER_STATUS" : null;
      if (!terminal.has(status) && status !== "uncertain") {
        const result = inspectSigner(row, await this.provider.getRecipients(row.providerEnvelopeId!)); verified = result.verified; mandatory = result.mandatory;
        code = !verified ? "RECIPIENT_MISMATCH" : result.completed ? "RECIPIENT_ALREADY_COMPLETED" : !mandatory ? "MANDATORY_SIGNATURE_TABS_REQUIRED" : null;
      }
      return await this.store.patch(id, { status, recipientVerified: verified, hasSignatureTabs: mandatory, errorCode: code, lastCheckedAt: this.date(), updatedAt: this.date() });
    } catch (error) { return this.store.patch(id, { recipientVerified: false, hasSignatureTabs: false, errorCode: error instanceof DocusignError ? error.safeCode : "PROVIDER_CHECK_FAILED", updatedAt: this.date() }); }
  }
  private token(row: EnvelopeRow) { return createHmac("sha256", this.config.linkSecret).update(JSON.stringify(["elevay-sign-v1", row.id, row.linkNonce, time(row.linkExpiresAt), row.documentHash, row.recipientDigest])).digest("hex"); }
  async signingLink(id: string) {
    let row = await this.row(id); await this.sourceMatches(row); row = await this.refreshRow(id);
    if (!shareable(row, this.now())) throw new DocusignError(row.revokedAt ? "LINK_REVOKED" : row.errorCode ?? "SENT_VERIFIED_ENVELOPE_REQUIRED");
    row = await this.store.withEnvelopeLock(id, async (locked, ledger) => {
      if (!shareable(locked, this.now())) throw new DocusignError("SENT_VERIFIED_ENVELOPE_REQUIRED");
      return locked.linkExpiresAt ? locked : ledger.patch(id, { linkExpiresAt: new Date(this.date().getTime() + 30 * 24 * 60 * 60 * 1000), updatedAt: this.date() });
    });
    return { url: `${this.config.publicBaseUrl}/sign-contract/${id}#${this.token(row)}`, expiresAt: row.linkExpiresAt! };
  }
  async revokeLink(id: string) { await this.row(id); await this.store.withEnvelopeLock(id, async (_row, ledger) => ledger.patch(id, { revokedAt: this.date(), updatedAt: this.date() })); return { success: true as const }; }
  async startSigning(id: string, token: string) {
    let row = await this.row(id);
    if (!/^[0-9a-f]{64}$/i.test(token) || !row.linkExpiresAt || row.revokedAt || time(row.linkExpiresAt) <= this.now() || !timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(this.token(row), "hex")) || terminal.has(row.status)) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
    await this.sourceMatches(row); row = await this.refreshRow(id);
    if (!shareable(row, this.now()) || !row.providerEnvelopeId) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
    // Serialize with revocation and recheck immediately before short-lived provider POST.
    return this.store.withEnvelopeLock(id, async (locked) => {
      if (!shareable(locked, this.now()) || !locked.linkExpiresAt || !timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(this.token(locked), "hex"))) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
      return this.store.withContractLock(locked.contractId, async source => {
        pending(source);
        if (source.docUrl !== locked.documentSourceUrl || source.contractCode !== locked.documentSourceSnapshot.contractCode || source.clientName !== locked.documentSourceSnapshot.clientName) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
        const document = await this.document(source.docUrl);
        if (document.hash !== locked.documentHash) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
        return { url: await this.provider.createRecipientView(locked.providerEnvelopeId!, this.recipient(locked)) };
      });
    });
  }
}
let singleton: { binding: string; service: ContractDocusignService } | undefined;
export function getContractDocusignService() {
  const config = getDocusignConfig();
  // Include key material fingerprint without retaining an extra plaintext copy or exposing it.
  const binding = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  if (!singleton || singleton.binding !== binding) singleton = { binding, service: new ContractDocusignService(docusignStore, new JwtDocusignProvider(config), config) };
  return singleton.service;
}

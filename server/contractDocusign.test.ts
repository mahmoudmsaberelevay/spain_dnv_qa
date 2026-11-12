import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { randomUUID, createHash, generateKeyPairSync } from "node:crypto";
import PizZip from "pizzip";
import { COOKIE_NAME } from "../shared/const";
const mock = vi.hoisted(() => ({ service: null as any, store: null as any, access: "full", lookup: vi.fn() }));
vi.mock("./db", () => ({ getContractById: vi.fn(), getDb: async () => ({ select: () => ({ from: () => ({ where: () => ({ limit: mock.lookup }) }) }) }) }));
vi.mock("./permissionsRouter", () => ({ isOwner: () => false, getUserModuleAccess: async () => ({ contracting: mock.access }) }));
vi.mock("./contractDocusignStore", async importOriginal => ({ ...(await importOriginal<any>()), docusignStore: { contract: (id: number) => mock.store.contract(id), list: (id: number) => mock.store.list(id), withEnvelopeLock: (id: string, fn: any) => mock.store.withEnvelopeLock(id, fn) } }));
vi.mock("./contractDocusignService", async importOriginal => ({ ...(await importOriginal<any>()), getContractDocusignService: () => mock.service }));
import { ContractDocusignService, POLL_INTERVAL_MS } from "./contractDocusignService";
import { contractDocusignRouter } from "./contractDocusignRouter";
import { DocusignError, configReadiness, type DocusignConfig } from "./contractDocusignConfig";
import { type EnvelopeRow, type DocusignStore, type ContractSource } from "./contractDocusignStore";
import { type DocusignProvider } from "./contractDocusignProvider";
import { validateDocx } from "./contractDocusignDocument";
import type { TrpcContext } from "./_core/context";
class MemoryStore implements DocusignStore {
  rows = new Map<string, EnvelopeRow>();
  source: ContractSource = { id: 901, contractCode: "SYNTHETIC", clientName: "Synthetic Client", status: "pending", docUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/contracts/synthetic.docx" };
  private tails = new Map<string, Promise<unknown>>();
  private async lock<T>(key: string, fn: () => Promise<T>) { const tail = this.tails.get(key) ?? Promise.resolve(); const result = tail.catch(() => {}).then(fn); this.tails.set(key, result); return result; }
  async contract(id: number) { return id === this.source.id ? { ...this.source } : null; }
  async get(id: string) { return this.rows.get(id) ?? null; }
  async list(id: number) { return Array.from(this.rows.values()).filter(r => r.contractId === id).sort((a,b) => b.version - a.version); }
  async byRequest(id: string) { return Array.from(this.rows.values()).find(r => r.requestId === id) ?? null; }
  async insert(row: EnvelopeRow) { if (Array.from(this.rows.values()).some(r => r.requestId === row.requestId)) throw new Error("duplicate"); this.rows.set(row.id, row); }
  async patch(id: string, patch: Partial<EnvelopeRow>) { const row = { ...this.rows.get(id)!, ...patch }; this.rows.set(id, row); return row; }
  async withContractLock<T>(id: number, fn: (source: ContractSource, ledger: MemoryStore) => Promise<T>) { return this.lock(`c${id}`, () => fn({ ...this.source }, this)); }
  async withEnvelopeLock<T>(id: string, fn: (row: EnvelopeRow, ledger: MemoryStore) => Promise<T>) { return this.lock(id, () => fn(this.rows.get(id)!, this)); }
  async withSigningLock<T>(id: string, fn: (row: EnvelopeRow, source: ContractSource, ledger: MemoryStore) => Promise<T>) { return this.lock(`c${this.source.id}`,()=>this.lock(id,()=>fn(this.rows.get(id)!,{...this.source},this))); }
}
let store: MemoryStore; let service: ContractDocusignService; let provider: DocusignProvider; let now: number; let bytes: Buffer; let hash: string; let config: DocusignConfig;
const actor = { id: 41, name: "Synthetic Staff", email: "synthetic@example.test", openId: "synthetic-staff", role: "user" as const, canManage: true };
const input = () => ({ contractId: 901, requestId: randomUUID(), recipientName: "Synthetic Client", recipientEmail: "synthetic.client@example.test", confirmed: true as const });
async function caller(valid = true, forged = false, origin = "https://elevay.vip") {
  const token = valid ? await new SignJWT({ openId: "synthetic-staff", appId: "synthetic-app" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode("synthetic-session-secret-only")) : "forged.not.signed";
  return contractDocusignRouter.createCaller({ req: { headers: { cookie: `${COOKIE_NAME}=${token}`, origin }, ip: "192.0.2.41" } as any, res: { setHeader: vi.fn() } as any, user: forged ? { ...actor, role: "admin" } : null } as TrpcContext);
}
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "synthetic-session-secret-only"); vi.stubEnv("VITE_APP_ID", "synthetic-app");
  for (const key of ["DOCUSIGN_INTEGRATION_KEY","DOCUSIGN_USER_ID","DOCUSIGN_ACCOUNT_ID","DOCUSIGN_PRIVATE_KEY_BASE64","DOCUSIGN_RSA_PRIVATE_KEY","DOCUSIGN_LINK_SECRET","DOCUSIGN_ENVIRONMENT","DOCUSIGN_PUBLIC_BASE_URL"]) vi.stubEnv(key, "");
  mock.access = "full"; mock.lookup.mockResolvedValue([actor]);
  store = new MemoryStore(); now = Date.UTC(2026, 0, 1); const zip = new PizZip(); zip.file("[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'); zip.file("word/document.xml", '<w:document xmlns:w="urn:synthetic"><w:body>Original synthetic bytes</w:body></w:document>'); zip.file("_rels/.rels", "<Relationships/>"); bytes = zip.generate({ type: "nodebuffer" }); validateDocx(bytes); hash = createHash("sha256").update(bytes).digest("hex");
  config = { environment: "demo", integrationKey: randomUUID(), userId: randomUUID(), accountId: randomUUID(), privateKey: "unused-synthetic-provider", linkSecret: "synthetic-capability-secret-32-characters", publicBaseUrl: "https://elevay.vip" };
  provider = { createDraft: vi.fn(async () => randomUUID()), createSenderView: vi.fn(async () => "https://demo.docusign.net/Member/StartInSession.aspx?synthetic=1"), getEnvelopeStatus: vi.fn(async () => "sent"), getRecipients: vi.fn(async () => { const row = Array.from(store.rows.values())[0]; return { signers: [{ name: row.recipientName, email: row.recipientEmail, recipientId: row.recipientId, clientUserId: row.clientUserId, status: "sent", tabs: { signHereTabs: [{ documentId: "1", pageNumber: "2", xPosition: "20", yPosition: "100", optional: "false" }] } }] }; }), createRecipientView: vi.fn(async () => "https://demo.docusign.net/Signing/StartInSession.aspx?synthetic=1") };
  service = new ContractDocusignService(store, provider, config, async () => ({ bytes, hash, name: "synthetic.docx" }), () => now);
  mock.service = service; mock.store = store;
});
describe("DocuSign actual caller session/module authorization", () => {
  it("rejects anonymous or forged ctx.user admin identity", async () => { await expect((await caller(false, true)).history({ contractId: 901 })).rejects.toMatchObject({ code: "UNAUTHORIZED" }); expect(provider.createDraft).not.toHaveBeenCalled(); });
  it("viewer can read readiness/history, cannot manage any action", async () => { mock.access = "viewer"; const c = await caller(); expect((await c.readiness()).canManage).toBe(false); expect(await c.history({ contractId: 901 })).toEqual([]); for (const route of ["senderView", "refresh", "signingLink", "revokeLink"] as const) await expect(c[route]({ id: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(c.prepare(input())).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("none or malformed access cannot read despite forged admin context", async () => { for (const access of ["none", "unexpected"]) { mock.access = access; await expect((await caller(true, true)).readiness()).rejects.toMatchObject({ code: "FORBIDDEN" }); } });
  it("full prepares exact bytes; original contract and money workflow untouched", async () => { const original = structuredClone(store.source); const c = await caller(); const result = await c.prepare(input()); expect(result.envelope.status).toBe("draft"); expect(provider.createDraft).toHaveBeenCalledTimes(1); expect((provider.createDraft as any).mock.calls[0][0].document).toEqual(bytes); expect(store.source).toEqual(original); const publicRows = await c.history({ contractId: 901 }); expect(publicRows[0]).not.toHaveProperty("documentSourceUrl"); expect(publicRows[0]).not.toHaveProperty("clientUserId"); expect(publicRows[0]).not.toHaveProperty("linkNonce"); });
  it("readiness is settings-only and includes missing names, no credentials", async () => { const c = await caller(); const r = await c.readiness(); expect(r.configured).toBe(false); expect(r.missingSettings).toContain("DOCUSIGN_PRIVATE_KEY_BASE64"); expect(Object.keys(r).sort()).toEqual(["canManage","configured","environment","missingSettings"]); expect(provider.getEnvelopeStatus).not.toHaveBeenCalled(); });
  it("public endpoint does not trust ctx.user and rejects cross-origin", async () => { const c = await caller(false, true, "https://evil.example"); await expect(c.startSigning({ id: randomUUID(), token: "a".repeat(64) })).rejects.toMatchObject({ code: "FORBIDDEN" }); });
});
describe("DocuSign reservation/history and safe signing lifecycle", () => {
  it("duplicate concurrent prepare reserves once and never re-posts", async () => { const i = input(); const results = await Promise.allSettled([service.prepare(i, actor), service.prepare(i, actor)]); expect(results.filter(r => r.status === "fulfilled").length).toBeGreaterThan(0); expect(provider.createDraft).toHaveBeenCalledTimes(1); expect(store.rows.size).toBe(1); await service.prepare(i, actor); expect(provider.createDraft).toHaveBeenCalledTimes(1); await expect(service.prepare(input(), actor)).rejects.toMatchObject({ safeCode: "ACTIVE_ENVELOPE_EXISTS" }); });
  it("lost POST response blocks blind retry or new version forever until reconciliation", async () => { (provider.createDraft as any).mockRejectedValue(new DocusignError("PROVIDER_TIMEOUT_OR_NETWORK", true)); const i = input(); await expect(service.prepare(i, actor)).rejects.toMatchObject({ uncertain: true }); expect(Array.from(store.rows.values())[0].status).toBe("uncertain"); await expect(service.prepare(i, actor)).rejects.toMatchObject({ safeCode: "MANUAL_RECONCILIATION_REQUIRED" }); await expect(service.prepare(input(), actor)).rejects.toMatchObject({ safeCode: "MANUAL_RECONCILIATION_REQUIRED" }); expect(provider.createDraft).toHaveBeenCalledTimes(1); });
  it("definitive create error same request never retried; sender-view failure keeps draft", async () => { (provider.createDraft as any).mockRejectedValueOnce(new DocusignError("consent_required")); const i = input(); await expect(service.prepare(i, actor)).rejects.toBeInstanceOf(DocusignError); await expect(service.prepare(i, actor)).rejects.toBeInstanceOf(DocusignError); expect(provider.createDraft).toHaveBeenCalledTimes(1); (provider.createSenderView as any).mockRejectedValueOnce(new DocusignError("PROVIDER_TIMEOUT_OR_NETWORK")); await expect(service.prepare(input(), actor)).rejects.toBeInstanceOf(DocusignError); expect(Array.from(store.rows.values())[1].status).toBe("draft"); });
  it("refresh once immediately after draft, throttles concurrent GETs and terminals", async () => { const { envelope } = await service.prepare(input(), actor); await Promise.all([service.refresh(envelope.id),service.refresh(envelope.id)]); expect(provider.getEnvelopeStatus).toHaveBeenCalledTimes(1); const r = await service.refresh(envelope.id); expect(r.nextRefreshAt?.getTime()).toBe(now + POLL_INTERVAL_MS); now += POLL_INTERVAL_MS; (provider.getEnvelopeStatus as any).mockResolvedValue("completed"); expect((await service.refresh(envelope.id)).status).toBe("completed"); now += POLL_INTERVAL_MS; await service.refresh(envelope.id); expect(provider.getEnvelopeStatus).toHaveBeenCalledTimes(2); });
  it("cannot issue links without mandatory tabs or for wrong/extra signers", async () => { const { envelope } = await service.prepare(input(), actor); (provider.getRecipients as any).mockResolvedValue({ signers: [{ name: "Wrong", email: "wrong@example.test", recipientId: "1" }] }); await expect(service.signingLink(envelope.id)).rejects.toBeInstanceOf(DocusignError); now += POLL_INTERVAL_MS; const row = await store.get(envelope.id); (provider.getRecipients as any).mockResolvedValue({ signers: [{ ...row, name: row!.recipientName, email: row!.recipientEmail, tabs: { signHereTabs: [{ optional: "true", documentId: "1", pageNumber: "1", xPosition: "2", yPosition: "4" }] } }] }); await expect(service.signingLink(envelope.id)).rejects.toBeInstanceOf(DocusignError); });
  it("valid bearer starts exact recipient, tampered/expired/revoked/completed fail closed", async () => { const c = await caller(); const { envelope } = await c.prepare(input()); const link = await c.signingLink({ id: envelope.id }); expect(link.url).toMatch(/^https:\/\/elevay.vip\/sign-contract\/.+#/); const token = link.url.split("#")[1]; expect(await (await caller(false)).startSigning({ id: envelope.id, token })).toEqual({ url: "https://demo.docusign.net/Signing/StartInSession.aspx?synthetic=1" }); expect((provider.createRecipientView as any).mock.calls[0][1].clientUserId).toBe(`elevay-${envelope.id}`); await expect(service.startSigning(envelope.id, "0".repeat(64))).rejects.toBeInstanceOf(DocusignError); await service.revokeLink(envelope.id); await expect(service.startSigning(envelope.id, token)).rejects.toBeInstanceOf(DocusignError); expect(provider.createRecipientView).toHaveBeenCalledTimes(1); });
  it("expiry/completion/source URL or bytes change block sessions without status/finance mutation", async () => { const { envelope } = await service.prepare(input(), actor); const link = await service.signingLink(envelope.id); const token = link.url.split("#")[1]; store.source.docUrl += "?changed=1"; await expect(service.startSigning(envelope.id, token)).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" }); store.source.docUrl = store.source.docUrl.split("?")[0]; hash = "a".repeat(64); await expect(service.startSigning(envelope.id, token)).rejects.toBeInstanceOf(DocusignError); hash = envelope.documentHash; await store.patch(envelope.id, { status: "completed" }); await expect(service.startSigning(envelope.id, token)).rejects.toBeInstanceOf(DocusignError); await store.patch(envelope.id, { status: "sent" }); now += 31 * 24 * 60 * 60 * 1000; await expect(service.startSigning(envelope.id, token)).rejects.toBeInstanceOf(DocusignError); expect(store.source.status).toBe("pending"); expect(provider.createRecipientView).not.toHaveBeenCalled(); });
  it("allows new version after authoritative terminal without deleting history", async () => { const first = await service.prepare(input(), actor); await store.patch(first.envelope.id, { status: "voided" }); const second = await service.prepare(input(), actor); expect(second.envelope.version).toBe(2); expect(store.rows.size).toBe(2); });
});

describe("Additional fail-closed signing boundaries", () => {
  it("additional signing or carbon-copy recipients and conditional signatures cannot share", async () => {
    const { envelope } = await service.prepare(input(), actor);
    const originalRecipients = provider.getRecipients;
    const good = await originalRecipients(envelope.envelopeId!);
    const signer = (good.signers as any[])[0];
    for (const recipients of [
      { signers: [signer, { ...signer, recipientId: "2" }] },
      { signers: [signer], carbonCopies: [{ email: "unapproved@example.test" }] },
      { signers: [{ ...signer, tabs: { signHereTabs: [{ ...signer.tabs.signHereTabs[0], conditionalParentLabel: "conditional" }] } }] },
      { signers: [{ ...signer, status: "completed" }] },
    ]) {
      (provider.getRecipients as any).mockResolvedValue(recipients);
      await expect(service.signingLink(envelope.id)).rejects.toBeInstanceOf(DocusignError);
      now += POLL_INTERVAL_MS;
    }
    expect(provider.createRecipientView).not.toHaveBeenCalled();
  });
  it("failed refresh invalidates cached canShare, reserves interval, prevents duplicate provider GET", async () => {
    const { envelope } = await service.prepare(input(), actor);
    await service.signingLink(envelope.id); now += POLL_INTERVAL_MS;
    (provider.getEnvelopeStatus as any).mockRejectedValue(new DocusignError("PROVIDER_TIMEOUT_OR_NETWORK"));
    const result = await service.refresh(envelope.id);
    expect(result.canShare).toBe(false); expect(result.errorCode).toBe("PROVIDER_TIMEOUT_OR_NETWORK");
    await service.refresh(envelope.id); expect(provider.getEnvelopeStatus).toHaveBeenCalledTimes(2);
  });
  it("request UUID cannot be reused for changed recipient; nonpending/no-document prepare fails", async () => {
    const i = input(); await service.prepare(i,actor);
    await expect(service.prepare({ ...i, recipientEmail:"other@example.test" },actor)).rejects.toMatchObject({safeCode:"IDEMPOTENCY_CONFLICT"});
    store.source.status = "signed"; await expect(service.prepare(input(),actor)).rejects.toMatchObject({safeCode:"PENDING_SAVED_CONTRACT_REQUIRED"});
    store.source.status = "pending"; store.source.docUrl = null;
    await expect(service.prepare(input(),actor)).rejects.toMatchObject({safeCode:"PENDING_SAVED_CONTRACT_REQUIRED"}); expect(provider.createDraft).toHaveBeenCalledTimes(1);
  });
  it("local revoke is possible without provider credentials and does not contact provider", async () => {
    const c = await caller(); const { envelope } = await c.prepare(input());
    expect(await c.revokeLink({id:envelope.id})).toEqual({success:true});
    expect((await store.get(envelope.id))?.revokedAt).toBeInstanceOf(Date);
    expect(provider.getEnvelopeStatus).not.toHaveBeenCalled(); expect(store.source.status).toBe("pending");
  });
  it("unknown provider status or account binding changes fail closed", async () => {
    const { envelope } = await service.prepare(input(),actor);
    (provider.getEnvelopeStatus as any).mockResolvedValue("unexpected"); expect((await service.refresh(envelope.id)).status).toBe("uncertain");
    await expect(service.signingLink(envelope.id)).rejects.toBeInstanceOf(DocusignError);
    await store.patch(envelope.id,{accountId:randomUUID()});
    await expect(service.senderView(envelope.id)).rejects.toMatchObject({safeCode:"ACCOUNT_BINDING_MISMATCH"});
  });
});

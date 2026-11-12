import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";

// No database, real provider, settings, browser, or PDF parser is part of this
// service test. The actual bounded PDF proof module has its own tests.
const proof = vi.hoisted(() => ({ capture: vi.fn(), verify: vi.fn() }));
vi.mock("./contractDocusignStore", () => ({ docusignStore: {} }));
vi.mock("./contractDocusignCompletionProof", () => ({
  captureCompletionDocumentProof: proof.capture,
  verifyCompletionDocumentProof: proof.verify,
}));
vi.mock("./contractDocusignCompletion", () => ({
  finalizeVerifiedDocusignContract: () => { throw new Error("Real completion adapter must not run"); },
}));

import {
  ContractDocusignService,
  POLL_INTERVAL_MS,
  SIGNING_LINK_LIFETIME_MS,
  completionTabsFingerprint,
  financialSource,
} from "./contractDocusignService";
import { DocusignError, type DocusignConfig } from "./contractDocusignConfig";
import type { ContractSource, DocusignStore, EnvelopeRow, LedgerSession } from "./contractDocusignStore";
import type { DocusignProvider, ProviderRecipient } from "./contractDocusignProvider";
import type { CompletionDocumentProof } from "./contractDocusignCompletionProof";

class MemoryStore implements DocusignStore {
  rows = new Map<string, EnvelopeRow>();
  patches: { id: string; patch: Partial<EnvelopeRow> }[] = [];
  source: ContractSource = {
    id: 901,
    contractCode: "SYNTH-TEST",
    clientName: "Synthetic Client",
    country: "greece",
    status: "pending",
    docUrl: "https://storage.example.test/synthetic.docx",
    contractValue: "10000.00",
    originalContractValueEur: "15000.00",
    netContractValueEur: "10000.00",
    discountValue: "5000.00",
    currency: "EUR",
  };
  private tails = new Map<string, Promise<unknown>>();
  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(fn);
    this.tails.set(key, current);
    return current;
  }
  async contract(id: number) { return id === this.source.id ? structuredClone(this.source) : null; }
  async get(id: string) { const row = this.rows.get(id); return row ? structuredClone(row) : null; }
  async list(id: number) {
    return [...this.rows.values()].filter(row => row.contractId === id)
      .sort((a, b) => b.version - a.version).map(row => structuredClone(row));
  }
  async byRequest(id: string) {
    const row = [...this.rows.values()].find(row => row.requestId === id);
    return row ? structuredClone(row) : null;
  }
  async insert(row: EnvelopeRow) {
    if (await this.byRequest(row.requestId)) throw new Error("Duplicate synthetic reservation");
    this.rows.set(row.id, structuredClone(row));
  }
  async patch(id: string, patch: Partial<EnvelopeRow>) {
    const current = this.rows.get(id);
    if (!current) throw new DocusignError("ENVELOPE_UNAVAILABLE");
    const row = structuredClone({ ...current, ...patch });
    this.rows.set(id, row);
    this.patches.push({ id, patch: structuredClone(patch) });
    return structuredClone(row);
  }
  withContractLock<T>(id: number, fn: (source: ContractSource, ledger: LedgerSession) => Promise<T>) {
    return this.lock(`contract:${id}`, () => fn(structuredClone(this.source), this));
  }
  withEnvelopeLock<T>(id: string, fn: (row: EnvelopeRow, ledger: LedgerSession) => Promise<T>) {
    return this.lock(`envelope:${id}`, async () => fn((await this.get(id))!, this));
  }
  withSigningLock<T>(id: string, fn: (row: EnvelopeRow, source: ContractSource, ledger: LedgerSession) => Promise<T>) {
    // Match contract-before-envelope production lock ordering; all operations
    // on a given envelope use the same key, including simultaneous renewals.
    return this.lock(`contract:${this.source.id}`, () => this.lock(`envelope:${id}`,
      async () => fn((await this.get(id))!, structuredClone(this.source), this)));
  }
}

const actor = { id: 41, name: "Synthetic Staff", email: "staff@example.test", openId: "synthetic-staff", role: "user" as const, canManage: true };
const boundedProof: CompletionDocumentProof = {
  version: "text-outside-required-tabs-v1",
  pageCount: 1,
  pageSizes: [{ width: 595, height: 842 }],
  contentHash: "a".repeat(64),
  boxes: [{ page: 1, x: 20, y: 100, width: 100, height: 36 }],
};
const requiredTab = () => ({ documentId: "1", recipientId: "1", pageNumber: "1", xPosition: "20", yPosition: "100", tabLabel: "SYNTH_SIGNATURE", optional: "false", scaleValue: "0.7" });
const input = () => ({ contractId: 901, requestId: randomUUID(), recipientName: "Synthetic Client", recipientEmail: "synthetic.client@example.test", confirmed: true as const });
const tokenOf = (link: { url: string }) => link.url.split("#")[1];
let store: MemoryStore;
let service: ContractDocusignService;
let provider: DocusignProvider;
let config: DocusignConfig;
let now: number;
let envelopeStatus: string;
let recipientStatus: string;
let pdf: Buffer;
let savedBytes: Buffer;
let documentFactory: ReturnType<typeof vi.fn>;
let finalizer: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;

function makeService() {
  return new ContractDocusignService(store, provider, config, documentFactory as any, () => now, finalizer);
}
async function prepare() { return (await service.prepare(input(), actor)).envelope; }
async function sent() {
  const envelope = await prepare();
  await service.refresh(envelope.id);
  return envelope;
}
async function complete(id: string) {
  envelopeStatus = "completed";
  recipientStatus = "completed";
  pdf = Buffer.from("%PDF-1.4\nSYNTHETIC SIGNED DOCUMENT ONLY\n%%EOF");
  now += POLL_INTERVAL_MS;
  return service.refresh(id);
}
async function changeSnapshot(id: string, change: (snapshot: EnvelopeRow["documentSourceSnapshot"]) => void) {
  const row = (await store.get(id))!;
  const snapshot = structuredClone(row.documentSourceSnapshot);
  change(snapshot);
  await store.patch(id, { documentSourceSnapshot: snapshot });
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new MemoryStore();
  now = Date.UTC(2026, 0, 1);
  envelopeStatus = "sent";
  recipientStatus = "sent";
  pdf = Buffer.from("%PDF-1.4\nSYNTHETIC UNSIGNED DOCUMENT ONLY\n%%EOF");
  savedBytes = Buffer.from("SYNTHETIC SAVED DOCX BYTES; injected loader bypasses parsing");
  config = {
    environment: "production",
    integrationKey: randomUUID(), userId: randomUUID(), accountId: randomUUID(),
    privateKey: "unused fake key: must never be parsed",
    linkSecret: "synthetic-capability-secret-at-least-32-characters",
    publicBaseUrl: "https://elevay.vip",
  };
  documentFactory = vi.fn(async () => ({ bytes: savedBytes, hash: createHash("sha256").update(savedBytes).digest("hex"), name: "synthetic.docx" }));
  provider = {
    createDraft: vi.fn(async () => randomUUID()),
    createSenderView: vi.fn(async () => "https://provider.example.test/synthetic-sender"),
    getEnvelopeStatus: vi.fn(async () => envelopeStatus),
    getRecipients: vi.fn(async (providerId: string) => {
      const row = [...store.rows.values()].find(value => value.providerEnvelopeId === providerId)!;
      return { signers: [{ name: row.recipientName, email: row.recipientEmail, recipientId: row.recipientId, clientUserId: row.clientUserId, status: recipientStatus, tabs: { signHereTabs: [requiredTab()], initialHereTabs: [] } }] };
    }),
    createRecipientView: vi.fn(async () => "https://provider.example.test/synthetic-recipient"),
    getDocumentPdf: vi.fn(async () => Buffer.from(pdf)),
    assertOnlyDocumentOne: vi.fn(async () => undefined),
    assertSignedDocumentOne: vi.fn(async () => undefined),
    getCompletionDate: vi.fn(() => new Date(now - 1000)),
  };
  proof.capture.mockResolvedValue(structuredClone(boundedProof));
  proof.verify.mockResolvedValue(true);
  finalizer = vi.fn(async (id: string) => {
    const row = (await store.get(id))!;
    await store.patch(id, { documentSourceSnapshot: { ...row.documentSourceSnapshot, syncCompletedAt: now } });
    return { status: "signed" };
  });
  network = vi.fn(() => { throw new Error("Network is forbidden in this isolated suite"); });
  vi.stubGlobal("fetch", network);
  service = makeService();
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("Production financial pinning and pre-link completion baseline", () => {
  it("captures the original EUR 15000, discount 5000, net 10000 and production profile without changing the source", async () => {
    const original = structuredClone(store.source);
    const envelope = await prepare();
    const row = (await store.get(envelope.id))!;
    expect(financialSource(store.source)).toEqual({ originalValue: "15000.00", netValue: "10000.00", discount: "5000.00", currency: "EUR" });
    expect(row.documentSourceSnapshot.financialSnapshot).toEqual(financialSource(store.source));
    expect(row.documentSourceSnapshot.completionProfile).toBe("verified-production-v1");
    expect(row.documentSourceSnapshot.country).toBe("greece");
    expect(row.documentSourceSnapshot).not.toHaveProperty("completionDocumentProof");
    expect(envelope.autoSignEligible).toBe(true);
    expect(provider.createDraft).toHaveBeenCalledWith(expect.objectContaining({ document: savedBytes }));
    expect(store.source).toEqual(original);
    expect(finalizer).not.toHaveBeenCalled();
  });

  it.each(["sent", "delivered"])("captures and persists the bounded proof at first verified %s, before any signing link", async status => {
    envelopeStatus = status;
    const envelope = await sent();
    const row = (await store.get(envelope.id))!;
    const recipients = await provider.getRecipients(row.providerEnvelopeId!);
    expect(row.status).toBe(status);
    expect(row.linkExpiresAt).toBeNull();
    expect(row.documentSourceSnapshot.completionDocumentProof).toEqual(boundedProof);
    expect(row.documentSourceSnapshot.completionTabsHash).toBe(completionTabsFingerprint(recipients));
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(proof.capture).toHaveBeenCalledWith(pdf, { signHereTabs: [requiredTab()], initialHereTabs: [] });
    expect(provider.assertOnlyDocumentOne).toHaveBeenCalledTimes(1);
    expect(provider.assertOnlyDocumentOne).toHaveBeenCalledWith(row.providerEnvelopeId);
    await service.signingLink(envelope.id);
    now += POLL_INTERVAL_MS;
    await service.refresh(envelope.id);
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(finalizer).not.toHaveBeenCalled();
  });

  it("a failed baseline capture blocks sharing and never marks financial or signing completion", async () => {
    const envelope = await prepare();
    proof.capture.mockRejectedValueOnce(new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED"));
    const result = await service.refresh(envelope.id);
    expect(result).toMatchObject({ canShare: false, errorCode: "COMPLETION_DOCUMENT_UNVERIFIED", crmSigned: false });
    await expect(service.signingLink(envelope.id)).rejects.toMatchObject({ safeCode: "COMPLETION_DOCUMENT_UNVERIFIED" });
    expect((await store.get(envelope.id))!.documentSourceSnapshot.completionDocumentProof).toBeUndefined();
    expect(store.source.status).toBe("pending");
    expect(finalizer).not.toHaveBeenCalled();
  });

  it.each([
    ["net price", { contractValue: "11000.00", netContractValueEur: "11000.00" }],
    ["discount", { discountValue: "4000.00" }],
    ["original price", { originalContractValueEur: "16000.00" }],
    ["currency", { currency: "USD" }],
  ])("%s source drift blocks copying, renewal and use of an existing capability", async (_label, drift) => {
    const envelope = await sent();
    const link = await service.signingLink(envelope.id);
    Object.assign(store.source, drift);
    await expect(service.signingLink(envelope.id)).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" });
    await expect(service.regenerateSigningLink(envelope.id, randomUUID())).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" });
    await expect(service.startSigning(envelope.id, tokenOf(link))).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" });
    expect(provider.createRecipientView).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it("changing only the actual contract value blocks COPY, renewal, start and completed synchronization", async () => {
    const envelope = await sent();
    const link = await service.signingLink(envelope.id);
    const before = (await store.get(envelope.id))!;
    const originalSource = structuredClone(store.source);
    store.source.contractValue = "25000.00";
    expect(store.source).toEqual({ ...originalSource, contractValue: "25000.00" });
    expect(store.source).toMatchObject({ originalContractValueEur: "15000.00", discountValue: "5000.00", netContractValueEur: "10000.00" });
    expect(() => financialSource(store.source)).toThrowError(DocusignError);
    await expect(service.signingLink(envelope.id)).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" });
    await expect(service.regenerateSigningLink(envelope.id, randomUUID())).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" });
    await expect(service.startSigning(envelope.id, tokenOf(link))).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" });
    expect(await store.get(envelope.id)).toEqual(before);
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "CONTRACT_SOURCE_CHANGED" });
    const after = (await store.get(envelope.id))!;
    expect(after.linkNonce).toBe(before.linkNonce);
    expect(after.linkExpiresAt).toEqual(before.linkExpiresAt);
    expect(after.documentSourceSnapshot).toEqual(before.documentSourceSnapshot);
    expect(after.documentSourceSnapshot).not.toHaveProperty("syncCompletedAt");
    expect(after.documentSourceSnapshot).not.toHaveProperty("completionVerifiedAt");
    expect(after.documentSourceSnapshot).not.toHaveProperty("completionSignedAt");
    expect(provider.createRecipientView).not.toHaveBeenCalled();
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
    expect(store.source.status).toBe("pending");
  });

  it.each([
    ["actual differs from net", { contractValue: "25000.00" }],
    ["original minus discount differs from net", { discountValue: "4000.00" }],
  ])("rejects inconsistent financial source: %s", async (_label, drift) => {
    Object.assign(store.source, drift);
    expect(() => financialSource(store.source)).toThrowError(expect.objectContaining({ safeCode: "CONTRACT_SOURCE_CHANGED" }));
    await expect(prepare()).rejects.toMatchObject({ safeCode: "CONTRACT_SOURCE_CHANGED" });
    expect(store.rows.size).toBe(0);
    expect(provider.createDraft).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it.each(["sent", "delivered"])("discards an initial %s baseline if completion occurs during the PDF download", async activeStatus => {
    const envelope = await prepare();
    envelopeStatus = activeStatus;
    const before = (await store.get(envelope.id))!;
    vi.mocked(provider.getDocumentPdf!).mockImplementationOnce(async () => {
      envelopeStatus = "completed";
      recipientStatus = "completed";
      pdf = Buffer.from("%PDF-1.4\nSYNTHETIC DOCUMENT COMPLETED DURING DOWNLOAD\n%%EOF");
      return Buffer.from(pdf);
    });
    const result = await service.refresh(envelope.id);
    expect(result).toMatchObject({ canShare: false, canRegenerate: false, crmSigned: false, errorCode: "COMPLETION_BASELINE_UNVERIFIED" });
    const rejected = (await store.get(envelope.id))!;
    expect(rejected.lastCheckedAt).toEqual(before.lastCheckedAt);
    expect(rejected.documentSourceSnapshot).toEqual(before.documentSourceSnapshot);
    expect(rejected.documentSourceSnapshot).not.toHaveProperty("completionDocumentProof");
    expect(rejected.documentSourceSnapshot).not.toHaveProperty("completionTabsHash");
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(proof.capture).toHaveBeenCalledWith(pdf, { signHereTabs: [requiredTab()], initialHereTabs: [] });
    expect(provider.getEnvelopeStatus).toHaveBeenCalledTimes(2);
    expect(provider.getRecipients).toHaveBeenCalledTimes(2);
    await expect(service.signingLink(envelope.id)).rejects.toMatchObject({ safeCode: "COMPLETION_BASELINE_UNVERIFIED" });
    now += POLL_INTERVAL_MS;
    const completed = await service.refresh(envelope.id);
    expect(completed).toMatchObject({ canShare: false, crmSigned: false, errorCode: "COMPLETION_DOCUMENT_UNVERIFIED" });
    expect((await store.get(envelope.id))!.documentSourceSnapshot).toEqual(before.documentSourceSnapshot);
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(proof.verify).not.toHaveBeenCalled();
    expect(provider.assertSignedDocumentOne).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
    expect(store.source.status).toBe("pending");
  });

  it.each(["provider-status", "recipient-identity", "mandatory-tabs", "recipient-completed", "tabs-fingerprint"])("revalidates %s after downloading the first baseline PDF", async mismatch => {
    const envelope = await prepare();
    const before = (await store.get(envelope.id))!;
    const freshRecipients = await provider.getRecipients(before.providerEnvelopeId!);
    const signer = (freshRecipients.signers as ProviderRecipient[])[0];
    vi.mocked(provider.getDocumentPdf!).mockImplementationOnce(async () => {
      if (mismatch === "provider-status") envelopeStatus = "voided";
      else if (mismatch === "recipient-identity") signer.email = "different.synthetic@example.test";
      else if (mismatch === "mandatory-tabs") signer.tabs = { signHereTabs: [], initialHereTabs: [] };
      else if (mismatch === "recipient-completed") signer.status = "completed";
      else signer.tabs = { signHereTabs: [{ ...requiredTab(), xPosition: "40" }], initialHereTabs: [] };
      vi.mocked(provider.getRecipients).mockResolvedValue(freshRecipients);
      return Buffer.from(pdf);
    });
    expect(await service.refresh(envelope.id)).toMatchObject({ canShare: false, crmSigned: false, errorCode: "COMPLETION_BASELINE_UNVERIFIED" });
    const after = (await store.get(envelope.id))!;
    expect(after.documentSourceSnapshot).toEqual(before.documentSourceSnapshot);
    expect(after.lastCheckedAt).toEqual(before.lastCheckedAt);
    expect(after.recipientVerified).toBe(false);
    expect(after.hasSignatureTabs).toBe(false);
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });
});

describe("48-hour signing link generation, copying and explicit renewal", () => {
  it("generates exactly 48 hours and COPY preserves the token, nonce and original expiry", async () => {
    expect(SIGNING_LINK_LIFETIME_MS).toBe(48 * 60 * 60 * 1000);
    const envelope = await sent();
    const initial = await service.signingLink(envelope.id);
    const before = (await store.get(envelope.id))!;
    expect(initial.expiresAt.getTime()).toBe(now + SIGNING_LINK_LIFETIME_MS);
    now += POLL_INTERVAL_MS;
    expect(await service.signingLink(envelope.id)).toEqual(initial);
    const after = (await store.get(envelope.id))!;
    expect(after.linkNonce).toBe(before.linkNonce);
    expect(after.linkExpiresAt).toEqual(before.linkExpiresAt);
    expect(after.documentSourceSnapshot.lastLinkRenewalRequestId).toBeUndefined();
  });

  it("accepts just before expiry but blocks COPY and start exactly at the 48-hour boundary", async () => {
    const envelope = await sent();
    const initial = await service.signingLink(envelope.id);
    now = initial.expiresAt.getTime() - 1;
    expect(await service.startSigning(envelope.id, tokenOf(initial))).toEqual({ url: "https://provider.example.test/synthetic-recipient" });
    now = initial.expiresAt.getTime();
    await expect(service.startSigning(envelope.id, tokenOf(initial))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    await expect(service.signingLink(envelope.id)).rejects.toMatchObject({ safeCode: "LINK_EXPIRED" });
    expect((await store.get(envelope.id))!.linkExpiresAt).toEqual(initial.expiresAt);
    expect(provider.createRecipientView).toHaveBeenCalledTimes(1);
  });

  it("explicit renewal rotates the capability and extends time without another envelope or history row", async () => {
    const envelope = await sent();
    const initial = await service.signingLink(envelope.id);
    const before = (await store.get(envelope.id))!;
    now = initial.expiresAt.getTime();
    const requestId = randomUUID();
    const renewed = await service.regenerateSigningLink(envelope.id, requestId);
    const after = (await store.get(envelope.id))!;
    expect(renewed.expiresAt.getTime()).toBe(now + SIGNING_LINK_LIFETIME_MS);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(initial.expiresAt.getTime());
    expect(renewed.url).not.toBe(initial.url);
    expect(after.linkNonce).not.toBe(before.linkNonce);
    expect(after.documentSourceSnapshot.lastLinkRenewalRequestId).toBe(requestId);
    expect(after.providerEnvelopeId).toBe(before.providerEnvelopeId);
    expect(after.version).toBe(before.version);
    expect(await service.history(901)).toHaveLength(1);
    expect(provider.createDraft).toHaveBeenCalledTimes(1);
    expect(provider.createSenderView).toHaveBeenCalledTimes(1);
    await expect(service.startSigning(envelope.id, tokenOf(initial))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    await service.startSigning(envelope.id, tokenOf(renewed));
    expect(provider.createRecipientView).toHaveBeenCalledTimes(1);
  });

  it("exact renewal-request replay returns the same capability and never rotates or extends twice", async () => {
    const envelope = await sent();
    await service.signingLink(envelope.id);
    const requestId = randomUUID();
    const renewed = await service.regenerateSigningLink(envelope.id, requestId);
    const before = (await store.get(envelope.id))!;
    now += POLL_INTERVAL_MS;
    expect(await service.regenerateSigningLink(envelope.id, requestId)).toEqual(renewed);
    const after = (await store.get(envelope.id))!;
    expect(after.linkNonce).toBe(before.linkNonce);
    expect(after.linkExpiresAt).toEqual(before.linkExpiresAt);
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(1);
    expect(store.rows.size).toBe(1);
    expect(provider.createDraft).toHaveBeenCalledTimes(1);
  });

  it("A then B then revoke rejects replaying A without changing any persisted state", async () => {
    const envelope = await sent();
    const requestA = randomUUID();
    const requestB = randomUUID();
    const linkA = await service.regenerateSigningLink(envelope.id, requestA);
    const linkB = await service.regenerateSigningLink(envelope.id, requestB);
    await service.revokeLink(envelope.id);
    const before = (await store.get(envelope.id))!;
    const patchCount = store.patches.length;
    await expect(service.regenerateSigningLink(envelope.id, requestA)).rejects.toMatchObject({ safeCode: "LINK_RENEWAL_REPLAY_EXPIRED" });
    expect(await store.get(envelope.id)).toEqual(before);
    expect(store.patches).toHaveLength(patchCount);
    expect(before.revokedAt).toBeInstanceOf(Date);
    expect(before.documentSourceSnapshot.linkRenewalRequestIds).toEqual([requestA, requestB]);
    expect(before.documentSourceSnapshot.lastLinkRenewalRequestId).toBe(requestB);
    await expect(service.startSigning(envelope.id, tokenOf(linkA))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    await expect(service.startSigning(envelope.id, tokenOf(linkB))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(2);
    expect(provider.createRecipientView).not.toHaveBeenCalled();
    expect(provider.createDraft).toHaveBeenCalledTimes(1);
    expect(store.rows.size).toBe(1);
  });

  it("A then B then A rejects the older request and preserves B's active capability", async () => {
    const envelope = await sent();
    const requestA = randomUUID();
    const requestB = randomUUID();
    const linkA = await service.regenerateSigningLink(envelope.id, requestA);
    const linkB = await service.regenerateSigningLink(envelope.id, requestB);
    const before = (await store.get(envelope.id))!;
    const patchCount = store.patches.length;
    await expect(service.regenerateSigningLink(envelope.id, requestA)).rejects.toMatchObject({ safeCode: "LINK_RENEWAL_REPLAY_EXPIRED" });
    expect(await store.get(envelope.id)).toEqual(before);
    expect(store.patches).toHaveLength(patchCount);
    expect(before.documentSourceSnapshot.linkRenewalRequestIds).toEqual([requestA, requestB]);
    expect(before.documentSourceSnapshot.lastLinkRenewalRequestId).toBe(requestB);
    expect(await service.regenerateSigningLink(envelope.id, requestB)).toEqual(linkB);
    expect(await store.get(envelope.id)).toEqual(before);
    await expect(service.startSigning(envelope.id, tokenOf(linkA))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    await expect(service.startSigning(envelope.id, tokenOf(linkB))).resolves.toEqual({ url: "https://provider.example.test/synthetic-recipient" });
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(2);
    expect(provider.createRecipientView).toHaveBeenCalledTimes(1);
    expect(store.rows.size).toBe(1);
  });

  it.each([false,true])("UUID case changes cannot bypass consumed request replay or revocation (legacy uppercase=%s)",async legacyUpper=>{
    const envelope=await sent(),requestA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",requestB=randomUUID();
    const linkA=await service.regenerateSigningLink(envelope.id,requestA.toUpperCase());
    expect(await service.regenerateSigningLink(envelope.id,requestA)).toEqual(linkA);
    if(legacyUpper){const row=(await store.get(envelope.id))!;await store.patch(envelope.id,{documentSourceSnapshot:{...row.documentSourceSnapshot,lastLinkRenewalRequestId:requestA.toUpperCase(),linkRenewalRequestIds:[requestA.toUpperCase()]}});}
    await service.regenerateSigningLink(envelope.id,requestB);
    const active=structuredClone(await store.get(envelope.id));
    await expect(service.regenerateSigningLink(envelope.id,requestA.toUpperCase())).rejects.toMatchObject({safeCode:"LINK_RENEWAL_REPLAY_EXPIRED"});
    expect(await store.get(envelope.id)).toEqual(active);
    await service.revokeLink(envelope.id);const revoked=structuredClone(await store.get(envelope.id)),patches=store.patches.length;
    await expect(service.regenerateSigningLink(envelope.id,requestA.toUpperCase())).rejects.toMatchObject({safeCode:"LINK_RENEWAL_REPLAY_EXPIRED"});
    expect(await store.get(envelope.id)).toEqual(revoked);expect(store.patches).toHaveLength(patches);
    expect(store.patches.filter(value=>value.patch.linkNonce!==undefined)).toHaveLength(2);
  });

  it("serialized concurrent A/B/A renewals consume two UUIDs, reject old A and never perform a third rotation", async () => {
    const envelope = await sent();
    const initial = await service.signingLink(envelope.id);
    const requestA = randomUUID();
    const requestB = randomUUID();
    const results = await Promise.allSettled([
      service.regenerateSigningLink(envelope.id, requestA),
      service.regenerateSigningLink(envelope.id, requestB),
      service.regenerateSigningLink(envelope.id, requestA),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("fulfilled");
    expect(results[2]).toMatchObject({ status: "rejected", reason: { safeCode: "LINK_RENEWAL_REPLAY_EXPIRED" } });
    if (results[0].status !== "fulfilled" || results[1].status !== "fulfilled") throw new Error("Synthetic A/B renewals failed");
    const after = (await store.get(envelope.id))!;
    expect(after.documentSourceSnapshot.linkRenewalRequestIds).toEqual([requestA, requestB]);
    expect(after.documentSourceSnapshot.lastLinkRenewalRequestId).toBe(requestB);
    expect(await service.signingLink(envelope.id)).toEqual(results[1].value);
    expect(await service.regenerateSigningLink(envelope.id, requestB)).toEqual(results[1].value);
    await expect(service.startSigning(envelope.id, tokenOf(initial))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    await expect(service.startSigning(envelope.id, tokenOf(results[0].value))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    await expect(service.startSigning(envelope.id, tokenOf(results[1].value))).resolves.toEqual({ url: "https://provider.example.test/synthetic-recipient" });
    expect(await store.get(envelope.id)).toEqual(after);
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(2);
    expect(provider.createRecipientView).toHaveBeenCalledTimes(1);
    expect(provider.createDraft).toHaveBeenCalledTimes(1);
    expect(store.rows.size).toBe(1);
  });

  it("retains all 1024 consumed renewal UUIDs and fails closed without evicting old IDs at capacity", async () => {
    const envelope = await sent();
    const history = Array.from({ length: 1023 }, () => randomUUID());
    await changeSnapshot(envelope.id, snapshot => {
      snapshot.linkRenewalRequestIds = history;
      snapshot.lastLinkRenewalRequestId = history[history.length - 1];
    });
    const newest = randomUUID();
    const link = await service.regenerateSigningLink(envelope.id, newest);
    const before = (await store.get(envelope.id))!;
    const patchCount = store.patches.length;
    expect(before.documentSourceSnapshot.linkRenewalRequestIds).toEqual([...history, newest]);
    expect(before.documentSourceSnapshot.linkRenewalRequestIds).toHaveLength(1024);
    expect(await service.regenerateSigningLink(envelope.id, newest)).toEqual(link);
    await expect(service.regenerateSigningLink(envelope.id, history[0])).rejects.toMatchObject({ safeCode: "LINK_RENEWAL_REPLAY_EXPIRED" });
    await expect(service.regenerateSigningLink(envelope.id, randomUUID())).rejects.toMatchObject({ safeCode: "LINK_RENEWAL_HISTORY_REQUIRED" });
    expect(await store.get(envelope.id)).toEqual(before);
    expect(store.patches).toHaveLength(patchCount);
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(1);
  });

  it("serialized concurrent exact renewals issue one nonce under the shared envelope lock", async () => {
    const envelope = await sent();
    await service.signingLink(envelope.id);
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 4 }, () => service.regenerateSigningLink(envelope.id, requestId)));
    expect(new Set(results.map(value => value.url)).size).toBe(1);
    expect(new Set(results.map(value => value.expiresAt.getTime())).size).toBe(1);
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(1);
    expect(provider.createDraft).toHaveBeenCalledTimes(1);
    expect(store.rows.size).toBe(1);
  });

  it("local revoke never silently reactivates; only a fresh explicit request restores sharing", async () => {
    const envelope = await sent();
    const initial = await service.signingLink(envelope.id);
    await service.revokeLink(envelope.id);
    now += POLL_INTERVAL_MS;
    const refreshed = await service.refresh(envelope.id);
    expect(refreshed).toMatchObject({ canShare: false, canRegenerate: true, linkRevoked: true });
    await expect(service.signingLink(envelope.id)).rejects.toMatchObject({ safeCode: "LINK_REVOKED" });
    await expect(service.startSigning(envelope.id, tokenOf(initial))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    const renewed = await service.regenerateSigningLink(envelope.id, randomUUID());
    expect((await store.get(envelope.id))!.revokedAt).toBeNull();
    expect(renewed.url).not.toBe(initial.url);
    await expect(service.startSigning(envelope.id, tokenOf(initial))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    await service.startSigning(envelope.id, tokenOf(renewed));
    expect(provider.createRecipientView).toHaveBeenCalledTimes(1);
  });

  it("replaying a previously successful request after revocation cannot revive its revoked capability", async () => {
    const envelope = await sent();
    const requestId = randomUUID();
    const renewed = await service.regenerateSigningLink(envelope.id, requestId);
    const before = (await store.get(envelope.id))!;
    await service.revokeLink(envelope.id);
    await expect(service.regenerateSigningLink(envelope.id, requestId)).rejects.toMatchObject({ safeCode: "LINK_RENEWAL_REPLAY_EXPIRED" });
    const after = (await store.get(envelope.id))!;
    expect(after.revokedAt).toBeInstanceOf(Date);
    expect(after.linkNonce).toBe(before.linkNonce);
    expect(after.linkExpiresAt).toEqual(before.linkExpiresAt);
    await expect(service.startSigning(envelope.id, tokenOf(renewed))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(1);
  });

  it("replaying an expired renewal does not extend time; a new request is required", async () => {
    const envelope = await sent();
    const requestId = randomUUID();
    const renewed = await service.regenerateSigningLink(envelope.id, requestId);
    now = renewed.expiresAt.getTime();
    await expect(service.regenerateSigningLink(envelope.id, requestId)).rejects.toMatchObject({ safeCode: "LINK_RENEWAL_REPLAY_EXPIRED" });
    expect((await store.get(envelope.id))!.linkExpiresAt).toEqual(renewed.expiresAt);
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(1);
  });

  it("rejects invalid renewal identifiers before touching the provider", async () => {
    const envelope = await sent();
    vi.mocked(provider.getEnvelopeStatus).mockClear();
    for (const requestId of ["", "not-a-uuid", "0".repeat(64)]) {
      await expect(service.regenerateSigningLink(envelope.id, requestId)).rejects.toMatchObject({ safeCode: "INVALID_LINK_REQUEST" });
    }
    expect(provider.getEnvelopeStatus).not.toHaveBeenCalled();
    expect(store.patches.filter(value => value.patch.linkNonce !== undefined)).toHaveLength(0);
  });

  it("completed terminal envelopes reject copying, renewal and the old client token", async () => {
    const envelope = await sent();
    const link = await service.signingLink(envelope.id);
    expect((await complete(envelope.id)).status).toBe("completed");
    await expect(service.signingLink(envelope.id)).rejects.toBeInstanceOf(DocusignError);
    await expect(service.regenerateSigningLink(envelope.id, randomUUID())).rejects.toBeInstanceOf(DocusignError);
    await expect(service.startSigning(envelope.id, tokenOf(link))).rejects.toMatchObject({ safeCode: "SIGNING_LINK_UNAVAILABLE" });
    expect(provider.createRecipientView).not.toHaveBeenCalled();
    expect(provider.createDraft).toHaveBeenCalledTimes(1);
  });
});

describe("Verified production COMPLETED pipeline", () => {
  it("invokes only the injected adapter after completed recipient, mandatory tabs, pinned financial source and matching pre-SENT proof", async () => {
    const original = structuredClone(store.source);
    const envelope = await sent();
    const baseline = (await store.get(envelope.id))!.documentSourceSnapshot;
    finalizer.mockImplementationOnce(async (id: string) => {
      const row = (await store.get(id))!;
      expect(row.status).toBe("completed");
      expect(row.recipientVerified).toBe(true);
      expect(row.hasSignatureTabs).toBe(true);
      expect(row.documentSourceSnapshot.completionVerifiedAt).toBe(now);
      expect(row.documentSourceSnapshot.completionSignedAt).toBe(new Date(now - 1000).toISOString());
      expect(row.documentSourceSnapshot.financialSnapshot).toEqual(financialSource(store.source));
      expect(row.documentSourceSnapshot.completionDocumentProof).toEqual(baseline.completionDocumentProof);
      expect(proof.verify).toHaveBeenCalledTimes(1);
      expect(proof.verify).toHaveBeenCalledWith(pdf, boundedProof);
      await store.patch(id, { documentSourceSnapshot: { ...row.documentSourceSnapshot, syncCompletedAt: now } });
      return { status: "signed" };
    });
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ status: "completed", crmSigned: true, canShare: false, canRegenerate: false, errorCode: null });
    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(finalizer).toHaveBeenCalledWith(envelope.id);
    expect(provider.assertSignedDocumentOne).toHaveBeenCalledTimes(1);
    expect(provider.assertSignedDocumentOne).toHaveBeenCalledWith(envelope.envelopeId);
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(store.source).toEqual(original);
  });

  it("repeated or concurrent refresh of durably synced completion never duplicates the finalizer", async () => {
    const envelope = await sent();
    await complete(envelope.id);
    now += POLL_INTERVAL_MS;
    await Promise.all([service.refresh(envelope.id), service.refresh(envelope.id), service.refresh(envelope.id)]);
    await service.refresh(envelope.id);
    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(proof.verify).toHaveBeenCalledTimes(1);
    // Initial SENT capture now rechecks provider state after downloading the PDF.
    expect(provider.getEnvelopeStatus).toHaveBeenCalledTimes(3);
  });

  it.each(["created", "sent", "delivered", "signed"])("provider %s (including intermediate signed) never invokes the completion adapter", async status => {
    const envelope = await sent();
    envelopeStatus = status;
    recipientStatus = status === "signed" ? "signed" : "sent";
    now += POLL_INTERVAL_MS;
    const result = await service.refresh(envelope.id);
    expect(result.crmSigned).toBe(false);
    if (status === "signed") expect(result).toMatchObject({ status: "uncertain", errorCode: "UNSUPPORTED_PROVIDER_STATUS", canShare: false });
    expect(finalizer).not.toHaveBeenCalled();
    expect(proof.verify).not.toHaveBeenCalled();
    expect(store.source.status).toBe("pending");
  });

  it.each(["demo", "legacy", "synthetic-demo-code"])("%s envelopes never auto-finalize even when provider and recipient are completed", async kind => {
    if (kind === "demo") { config.environment = "demo"; service = makeService(); }
    if (kind === "legacy") {
      delete store.source.contractValue;
      delete store.source.originalContractValueEur;
      delete store.source.netContractValueEur;
      delete store.source.discountValue;
    }
    if (kind === "synthetic-demo-code") store.source.contractCode = "DS-DEMO-SYNTH-TEST";
    const envelope = await sent();
    expect((await store.get(envelope.id))!.documentSourceSnapshot.completionProfile).toBeUndefined();
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ status: "completed", crmSigned: false, autoSignEligible: false });
    expect(proof.capture).not.toHaveBeenCalled();
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
    expect(store.source.status).toBe("pending");
  });

  it("provider completion without a previously verified SENT baseline fails closed without creating one late", async () => {
    const envelope = await prepare();
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "COMPLETION_DOCUMENT_UNVERIFIED" });
    expect(proof.capture).not.toHaveBeenCalled();
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it.each(["proof", "tabs-hash"])("missing persisted %s prevents completion verification and finalization", async missing => {
    const envelope = await sent();
    await changeSnapshot(envelope.id, snapshot => {
      if (missing === "proof") delete snapshot.completionDocumentProof;
      else delete snapshot.completionTabsHash;
    });
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "COMPLETION_DOCUMENT_UNVERIFIED" });
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it.each(["name", "email", "recipientId", "clientUserId", "extra-signer", "carbon-copy", "not-completed"])("%s recipient mismatch prevents completion and adapter invocation", async mismatch => {
    const envelope = await sent();
    const row = (await store.get(envelope.id))!;
    const recipients = await provider.getRecipients(row.providerEnvelopeId!);
    const signer = (recipients.signers as ProviderRecipient[])[0];
    signer.status = "completed";
    if (["name", "email", "recipientId", "clientUserId"].includes(mismatch)) (signer as any)[mismatch] = "WRONG-SYNTHETIC-VALUE";
    else if (mismatch === "extra-signer") (recipients.signers as ProviderRecipient[]).push({ ...signer, recipientId: "2" });
    else if (mismatch === "carbon-copy") recipients.carbonCopies = [{ email: "unapproved@example.test" }];
    else signer.status = "sent";
    vi.mocked(provider.getRecipients).mockResolvedValue(recipients);
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "COMPLETION_RECIPIENT_UNVERIFIED" });
    expect(provider.assertSignedDocumentOne).not.toHaveBeenCalled();
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it.each(["missing", "optional", "conditional", "wrong-document"])("%s required tabs prevent completion finalization", async invalid => {
    const envelope = await sent();
    const row = (await store.get(envelope.id))!;
    const recipients = await provider.getRecipients(row.providerEnvelopeId!);
    const signer = (recipients.signers as ProviderRecipient[])[0];
    signer.status = "completed";
    const tab: Record<string, unknown> = requiredTab();
    if (invalid === "optional") tab.optional = "true";
    if (invalid === "conditional") tab.conditionalParentLabel = "unapproved-condition";
    if (invalid === "wrong-document") tab.documentId = "2";
    signer.tabs = { signHereTabs: invalid === "missing" ? [] : [tab], initialHereTabs: [] };
    vi.mocked(provider.getRecipients).mockResolvedValue(recipients);
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "COMPLETION_RECIPIENT_UNVERIFIED" });
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it("mandatory but moved completion tabs do not match the SENT fingerprint", async () => {
    const envelope = await sent();
    const row = (await store.get(envelope.id))!;
    const recipients = await provider.getRecipients(row.providerEnvelopeId!);
    const signer = (recipients.signers as ProviderRecipient[])[0];
    signer.status = "completed";
    signer.tabs = { signHereTabs: [{ ...requiredTab(), xPosition: "40" }], initialHereTabs: [] };
    vi.mocked(provider.getRecipients).mockResolvedValue(recipients);
    expect(completionTabsFingerprint(recipients)).not.toBe(row.documentSourceSnapshot.completionTabsHash);
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "COMPLETION_DOCUMENT_UNVERIFIED" });
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it("false document proof verification blocks finalization and never replaces the prior baseline", async () => {
    const envelope = await sent();
    proof.verify.mockResolvedValueOnce(false);
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "COMPLETION_DOCUMENT_CHANGED" });
    expect(proof.verify).toHaveBeenCalledTimes(1);
    expect(proof.verify).toHaveBeenCalledWith(pdf, boundedProof);
    expect((await store.get(envelope.id))!.documentSourceSnapshot.completionDocumentProof).toEqual(boundedProof);
    expect(proof.capture).toHaveBeenCalledTimes(1);
    expect(finalizer).not.toHaveBeenCalled();
  });

  it("extra or unverified signed documents stop before proof and completion adapter", async () => {
    const envelope = await sent();
    vi.mocked(provider.assertSignedDocumentOne!).mockRejectedValueOnce(new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED"));
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "COMPLETION_DOCUMENT_UNVERIFIED" });
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });

  it.each(["net", "discount", "saved-bytes"])("%s source drift before provider completion blocks the adapter safely", async drift => {
    const envelope = await sent();
    if (drift === "net") { store.source.contractValue = "12000.00"; store.source.netContractValueEur = "12000.00"; }
    else if (drift === "discount") store.source.discountValue = "3000.00";
    else savedBytes = Buffer.from("Changed synthetic source document bytes");
    const result = await complete(envelope.id);
    expect(result).toMatchObject({ crmSigned: false, canShare: false, errorCode: "CONTRACT_SOURCE_CHANGED" });
    expect(proof.verify).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
    expect(store.source.status).toBe("pending");
  });
});

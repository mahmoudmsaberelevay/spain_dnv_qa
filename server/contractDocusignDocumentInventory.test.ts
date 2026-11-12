import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { JwtDocusignProvider, type DocusignProvider } from "./contractDocusignProvider";
import { DocusignError, type DocusignConfig } from "./contractDocusignConfig";

// Only synthetic credentials and provider replies; every HTTP route is mocked.
const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config: DocusignConfig = { environment: "demo", integrationKey: randomUUID(), userId: randomUUID(), accountId: randomUUID(), privateKey: key, linkSecret: "SYNTHETIC_INVENTORY_LINK_SECRET", publicBaseUrl: "https://elevay.vip" };
const id = randomUUID();
const token = "SYNTHETIC_INVENTORY_ACCESS_TOKEN";
const apiBase = `https://demo.docusign.net/restapi/v2.1/accounts/${config.accountId}`;
const inventoryUrl = `${apiBase}/envelopes/${id}/documents`;
const limit = 2 * 1024 * 1024;
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const valid = { envelopeDocuments: [{ documentId: "1", type: "content" }] };
const userinfo = { sub: config.userId, accounts: [{ account_id: config.accountId, base_uri: "https://demo.docusign.net" }] };
const fetchers: ReturnType<typeof vi.fn>[] = [];
function transport(reply: (url: string, init: RequestInit) => Response | Promise<Response> = () => json(valid), info: unknown = userinfo) {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (path === "https://account-d.docusign.com/oauth/token") return json({ access_token: token, expires_in: 3600 });
    if (path === "https://account-d.docusign.com/oauth/userinfo") return json(info);
    if (path !== inventoryUrl || init?.method !== "GET") throw new Error("PRIVATE_PROVIDER_BODY unexpected synthetic route");
    return reply(path, init);
  });
  fetchers.push(fetcher);
  return { fetcher, provider: new JwtDocusignProvider(config, fetcher as typeof fetch) };
}
function assertPrivate(error: any) {
  expect(error).toBeInstanceOf(DocusignError);
  expect(error.message).toBe(error.safeCode);
  expect(error.uncertain).toBe(false);
  expect(error.cause).toBeUndefined();
  const serialized = JSON.stringify(error) + error.stack;
  for (const value of [token, key, config.linkSecret, "PRIVATE_PROVIDER_BODY", "PRIVATE_URL", apiBase]) expect(serialized).not.toContain(value);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // The sole allowed application route is the inventory GET: no tabs, PDF,
  // envelope creation/send, sender view or recipient session is ever requested.
  for (const fetcher of fetchers.splice(0)) {
    for (const [url, init] of fetcher.mock.calls) {
      if (String(url).startsWith("https://account-d.docusign.com/oauth/")) continue;
      expect(url).toBe(inventoryUrl);
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
      expect(init).not.toHaveProperty("body");
    }
  }
});

describe("Spain document inventory capability and exact authenticated route", () => {
  it("keeps the capability optional for legacy providers", () => {
    const legacy: DocusignProvider = {
      createDraft: async () => id, createSenderView: async () => "synthetic", getEnvelopeStatus: async () => "created",
      getRecipients: async () => ({ signers: [] }), createRecipientView: async () => "synthetic",
    };
    expect(legacy.assertOnlyDocumentOne).toBeUndefined();
  });
  it.each([
    ["absent type", { documentId: "1" }],
    ["content type", { documentId: "1", type: "content" }],
    ["normal metadata", { documentId: "1", type: "content", name: "PRIVATE_PROVIDER_BODY.docx", order: "1", pages: [{ pageId: "1" }], uri: "/PRIVATE_URL" }],
  ])("accepts exactly document 1 with %s and returns no provider body", async (_label, document) => {
    const { fetcher, provider } = transport(() => json({ envelopeId: id, envelopeDocuments: [document] }));
    await expect(provider.assertOnlyDocumentOne(id)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [url, init] = fetcher.mock.calls[2];
    expect(url).toBe(inventoryUrl);
    expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(init).not.toHaveProperty("body");
    expect(fetcher.mock.calls.slice(0, 2).map(call => call[0])).toEqual(["https://account-d.docusign.com/oauth/token", "https://account-d.docusign.com/oauth/userinfo"]);
  });
  it.each(["created", "sent"])("does not cache an inventory approval for an unsigned %s envelope", async status => {
    let calls = 0;
    const { fetcher, provider } = transport(() => json({ status, envelopeDocuments: ++calls === 1 ? valid.envelopeDocuments : [...valid.envelopeDocuments, { documentId: "2", type: "content" }] }));
    await expect(provider.assertOnlyDocumentOne(id)).resolves.toBeUndefined();
    await expect(provider.assertOnlyDocumentOne(id)).rejects.toMatchObject({ safeCode: "SPAIN_SIGNING_DOCUMENTS_MISMATCH", uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith("/oauth/token"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith("/oauth/userinfo"))).toHaveLength(1);
  });
  it.each(["", "not-a-uuid", `${id}/documents/2`, `${id}/../x`, `${id}?document=2`, `${id}#fragment`, ` ${id}`, `${id}\n`, "%2e%2e", "%31" + id.slice(1), "https://PRIVATE_URL/documents", null, 1, { toString: () => id }])("rejects invalid envelope ID %j before any fetch", async invalidId => {
    const { fetcher, provider } = transport();
    const error = await provider.assertOnlyDocumentOne(invalidId as string).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["https://evil.example", "https://demo.docusign.net/PRIVATE_URL", "https://demo.docusign.net?PRIVATE_URL=1", "https://demo.docusign.net.evil.example", "http://demo.docusign.net", "https://user:pass@demo.docusign.net", "https://demo.docusign.net:8443"])("rejects untrusted userinfo API root %s before inventory access", async base_uri => {
    const { fetcher, provider } = transport(undefined, { sub: config.userId, accounts: [{ account_id: config.accountId, base_uri }] });
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("INVALID_API_ORIGIN");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["wrong account", { sub: config.userId, accounts: [{ account_id: randomUUID(), base_uri: "https://demo.docusign.net" }] }],
    ["duplicate account", { sub: config.userId, accounts: [...userinfo.accounts, ...userinfo.accounts] }],
    ["wrong user", { ...userinfo, sub: randomUUID() }],
  ])("rejects %s before inventory access", async (_label, info) => {
    const { fetcher, provider } = transport(undefined, info);
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("ACCOUNT_BINDING_MISMATCH");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

const invalidInventories: [string, unknown][] = [
  ["second content document", { envelopeDocuments: [...valid.envelopeDocuments, { documentId: "2", type: "content" }] }],
  ["duplicate document 1", { envelopeDocuments: [...valid.envelopeDocuments, ...valid.envelopeDocuments] }],
  ["extra certificate", { envelopeDocuments: [...valid.envelopeDocuments, { documentId: "certificate", type: "summary" }] }],
  ["extra supplemental", { envelopeDocuments: [...valid.envelopeDocuments, { documentId: "2", type: "supplemental" }] }],
  ["certificate only", { envelopeDocuments: [{ documentId: "certificate", type: "summary" }] }],
  ["empty inventory", { envelopeDocuments: [] }],
  ["missing inventory", {}], ["null response", null], ["array response", []], ["string response", "PRIVATE_PROVIDER_BODY"], ["number response", 1],
  ["null inventory", { envelopeDocuments: null }], ["object inventory", { envelopeDocuments: { 0: { documentId: "1" }, length: 1 } }],
  ["string inventory", { envelopeDocuments: "PRIVATE_PROVIDER_BODY" }], ["number inventory", { envelopeDocuments: 1 }],
  ["null document", { envelopeDocuments: [null] }], ["array document", { envelopeDocuments: [[{ documentId: "1" }]] }],
  ["string document", { envelopeDocuments: ["1"] }], ["number document", { envelopeDocuments: [1] }], ["missing document ID", { envelopeDocuments: [{}] }],
  ...["2", "01", "combined", "certificate", "1/documents", "1\n", " 1", 1, null, false].map(documentId => [`wrong document ID ${JSON.stringify(documentId)}`, { envelopeDocuments: [{ documentId, type: "content" }] }] as [string, unknown]),
  ...["certificate", "summary", "supplemental", "Content", "content\n", "", null, 1, false, {}, []].map(type => [`wrong type ${JSON.stringify(type)}`, { envelopeDocuments: [{ documentId: "1", type }] }] as [string, unknown]),
];
describe("Spain unsigned document inventory fails closed", () => {
  it.each(invalidInventories)("rejects %s with only the sanitized mismatch code", async (_label, body) => {
    const { fetcher, provider } = transport(() => json(body));
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error).toMatchObject({ safeCode: "SPAIN_SIGNING_DOCUMENTS_MISMATCH", uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects a large but transport-bounded inventory without returning its entries", async () => {
    const documents = Array.from({ length: 50000 }, () => ({ documentId: "1" }));
    const body = { envelopeDocuments: documents, private: "PRIVATE_PROVIDER_BODY" };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(limit);
    const { provider } = transport(() => json(body));
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("SPAIN_SIGNING_DOCUMENTS_MISMATCH");
  });
  it("never logs raw inventory or transport errors", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    const mismatch = transport(() => json({ envelopeDocuments: [{ documentId: "PRIVATE_PROVIDER_BODY" }], private: token }));
    await mismatch.provider.assertOnlyDocumentOne(id).catch(assertPrivate);
    const network = transport(() => { throw new Error(`PRIVATE_URL PRIVATE_PROVIDER_BODY ${token}`); });
    await network.provider.assertOnlyDocumentOne(id).catch(assertPrivate);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("Spain inventory uses the existing bounded sanitized JSON transport", () => {
  it("accepts exactly 2MB of valid JSON", async () => {
    const body = { ...valid, padding: "" };
    body.padding = "x".repeat(limit - Buffer.byteLength(JSON.stringify(body)));
    const serialized = JSON.stringify(body);
    expect(Buffer.byteLength(serialized)).toBe(limit);
    const { provider } = transport(() => new Response(serialized, { headers: { "content-length": String(limit) } }));
    await expect(provider.assertOnlyDocumentOne(id)).resolves.toBeUndefined();
  });
  it("rejects an announced oversized response before reading its body", async () => {
    const read = vi.fn(() => { throw new Error("PRIVATE_PROVIDER_BODY"); });
    const { provider } = transport(() => ({ ok: true, status: 200, headers: new Headers({ "content-length": String(limit + 1) }), body: { getReader: read } }) as unknown as Response);
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["not-a-number", "-1", "Infinity", "1e8", "9007199254740993"])("rejects invalid content-length %s", async length => {
    const { provider } = transport(() => json(valid, 200, { "content-length": length }));
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("INVALID_PROVIDER_RESPONSE");
  });
  it.each([undefined, { "content-length": "8" }])("bounds streaming bytes with absent or dishonest length %j and cancels", async headers => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(limit + 1)); }, cancel: cancelled });
    const { fetcher, provider } = transport(() => new Response(body, { headers }));
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(["", "PRIVATE_PROVIDER_BODY", "{", "{\"envelopeDocuments\":", "<html>PRIVATE_PROVIDER_BODY</html>"])("sanitizes malformed JSON %j", async body => {
    const { provider } = transport(() => new Response(body));
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("INVALID_PROVIDER_RESPONSE");
  });
  it.each([302, 400, 401, 404, 429, 500, 503])("sanitizes HTTP %i errors without retry or a write uncertainty", async status => {
    const { fetcher, provider } = transport(() => json({ errorCode: "PRIVATE_PROVIDER_BODY", message: token }, status));
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error).toMatchObject({ safeCode: "PROVIDER_HTTP_ERROR", uncertain: false, httpStatus: status });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("retains allowlisted HTTP codes without exposing provider text", async () => {
    const { provider } = transport(() => json({ errorCode: "ENVELOPE_DOES_NOT_EXIST", message: "PRIVATE_PROVIDER_BODY" }, 404));
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error).toMatchObject({ safeCode: "ENVELOPE_DOES_NOT_EXIST", httpStatus: 404 });
  });
  it.each(["redirect PRIVATE_URL PRIVATE_PROVIDER_BODY", "network PRIVATE_PROVIDER_BODY"])("sanitizes fetch errors %s without retries", async message => {
    const { fetcher, provider } = transport(() => { throw new Error(message); });
    const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("PROVIDER_TIMEOUT_OR_NETWORK");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("bounds a fetcher ignoring abort at 15 seconds", async () => {
    vi.useFakeTimers();
    const { fetcher, provider } = transport(() => new Promise<Response>(() => {}));
    const result = provider.assertOnlyDocumentOne(id).catch(e => e);
    await vi.advanceTimersByTimeAsync(14999);
    let settled = false; void result.then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await result;
    assertPrivate(error);
    expect(error.safeCode).toBe("PROVIDER_TIMEOUT_OR_NETWORK");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1]!.signal!.aborted).toBe(true);
  });
  it("bounds a stalled body reader at 15 seconds and cancels it", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const { fetcher, provider } = transport(() => new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('{"envelopeDocuments":')); }, cancel: cancelled })));
    const result = provider.assertOnlyDocumentOne(id).catch(e => e);
    await vi.advanceTimersByTimeAsync(15000);
    const error = await result;
    assertPrivate(error);
    expect(error.safeCode).toBe("PROVIDER_TIMEOUT_OR_NETWORK");
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1]!.signal!.aborted).toBe(true);
  });
  it("sanitizes missing body and stream reader failures", async () => {
    for (const response of [new Response(null), new Response(new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE_PROVIDER_BODY PRIVATE_URL")); } }))]) {
      const { provider } = transport(() => response);
      const error = await provider.assertOnlyDocumentOne(id).catch(e => e);
      assertPrivate(error);
      expect(error.safeCode).toBe(response.body ? "PROVIDER_TIMEOUT_OR_NETWORK" : "INVALID_PROVIDER_RESPONSE");
    }
  });
});

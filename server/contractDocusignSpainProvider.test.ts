import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { JwtDocusignProvider, type DocusignProvider, type ProviderTab, type ProviderTabs } from "./contractDocusignProvider";
import { DocusignError, type DocusignConfig } from "./contractDocusignConfig";
import {buildSpainSigningPlan,SPAIN_SIGNATURE_MARKERS,SPAIN_INITIAL_MARKERS,type SigningPdfPage} from "./contractDocusignSpainSigning";

// All credentials, documents and HTTP responses here are synthetic and stay in memory.
const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config: DocusignConfig = { environment: "demo", integrationKey: randomUUID(), userId: randomUUID(), accountId: randomUUID(), privateKey: key, linkSecret: "SYNTHETIC_LINK_SECRET_DO_NOT_EXPOSE", publicBaseUrl: "https://elevay.vip" };
const id = randomUUID();
const token = "SYNTHETIC_ACCESS_TOKEN_DO_NOT_EXPOSE";
const apiBase = `https://demo.docusign.net/restapi/v2.1/accounts/${config.accountId}`;
const envelopePath = `${apiBase}/envelopes/${id}`;
const pdf = Buffer.from("%PDF-1.7\nSYNTHETIC DOCUMENT ONLY\n%%EOF");
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const tab = (kind: "SIGN" | "INITIAL", number: number): ProviderTab => ({ documentId: "1", recipientId: "1", pageNumber: String(number + 1), xPosition: "100", yPosition: "200", tabLabel: `ELEVAY_ES_${kind}_${number}`, optional: "false", scaleValue: "0.5", templateLocked: "true", templateRequired: "true" });
const plan = (initials = 9): ProviderTabs => ({ signHereTabs: Array.from({ length: 4 }, (_, n) => tab("SIGN", n)), initialHereTabs: Array.from({ length: initials }, (_, n) => tab("INITIAL", n)) });
function transport(extra: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (path === "https://account-d.docusign.com/oauth/token") return json({ access_token: token, expires_in: 3600 });
    if (path === "https://account-d.docusign.com/oauth/userinfo") return json({ sub: config.userId, accounts: [{ account_id: config.accountId, base_uri: "https://demo.docusign.net" }] });
    return extra(path, init!);
  });
  return { fetcher, provider: new JwtDocusignProvider(config, fetcher as typeof fetch) };
}
function tabTransport(reply: () => Response | Promise<Response> = () => json({ signHereTabs: [], initialHereTabs: [] }), status = "created") {
  return transport((url, init) => {
    if (url === envelopePath && init.method === "GET") return json({ status });
    if (url === `${envelopePath}/recipients/1/tabs` && init.method === "POST") return reply();
    throw new Error("unexpected synthetic route");
  });
}
function assertPrivate(error: any) {
  expect(error).toBeInstanceOf(DocusignError);
  expect(error.message).toBe(error.safeCode);
  expect(error.cause).toBeUndefined();
  const serialized = JSON.stringify(error) + error.stack;
  for (const privateValue of [token, key, config.linkSecret, "PRIVATE_PROVIDER_BODY", "PRIVATE_URL", "PRIVATE_KEY_FRAGMENT", apiBase]) expect(serialized).not.toContain(privateValue);
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Spain provider capability and route guards", () => {
  it("keeps legacy providers valid without the two optional methods", () => {
    const legacy: DocusignProvider = {
      createDraft: async () => id, createSenderView: async () => "synthetic", getEnvelopeStatus: async () => "created",
      getRecipients: async () => ({ signers: [] }), createRecipientView: async () => "synthetic",
    };
    expect(legacy.getDocumentPdf).toBeUndefined();
    expect(legacy.createRequiredTabs).toBeUndefined();
  });
  it.each(["", "not-a-uuid", "%31" + id.slice(1), `${id}/documents/2`, `${id}/../x`, `${id}?document=2`, `${id}#fragment`, ` ${id}`, `${id}\n`, `%2e%2e`, "https://PRIVATE_URL/documents/1", null, 1, { toString: () => id }])("rejects malformed envelope ID %j before any fetch", async badId => {
    const { fetcher, provider } = tabTransport();
    await expect(provider.getDocumentPdf(badId as string)).rejects.toBeInstanceOf(DocusignError);
    await expect(provider.createRequiredTabs(badId as string, "1", plan())).rejects.toBeInstanceOf(DocusignError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["", "2", "01", "1/tabs", "%31", "1?send=true", "1\n", 1, null])("rejects wrong recipient %j before authentication", async recipient => {
    const { fetcher, provider } = tabTransport();
    await expect(provider.createRequiredTabs(id, recipient as string, plan())).rejects.toMatchObject({ safeCode: "INVALID_PROVIDER_TABS", uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires the configured account and a trusted origin before PDF access", async () => {
    for (const base_uri of ["https://evil.example", "https://demo.docusign.net/PRIVATE_URL", "https://demo.docusign.net?PRIVATE_URL=1", "https://demo.docusign.net.evil.example", "http://demo.docusign.net"]) {
      const fetcher = vi.fn(async (url: any) => String(url).endsWith("/token") ? json({ access_token: token, expires_in: 3600 }) : json({ accounts: [{ account_id: config.accountId, base_uri }] }));
      const error = await new JwtDocusignProvider(config, fetcher as typeof fetch).getDocumentPdf(id).catch(e => e);
      assertPrivate(error);
      expect(error.safeCode).toBe("INVALID_API_ORIGIN");
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
    const fetcher = vi.fn(async (url: any) => String(url).endsWith("/token") ? json({ access_token: token, expires_in: 3600 }) : json({ accounts: [{ account_id: randomUUID(), base_uri: "https://demo.docusign.net" }] }));
    await expect(new JwtDocusignProvider(config, fetcher as typeof fetch).getDocumentPdf(id)).rejects.toMatchObject({ safeCode: "ACCOUNT_BINDING_MISMATCH" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("Spain bounded PDF retrieval", () => {
  it("gets exact document 1 after authentication, no JSON/request body, redirect or send", async () => {
    const { fetcher, provider } = transport(() => new Response(pdf));
    expect(await provider.getDocumentPdf(id)).toEqual(pdf);
    const [url, init] = fetcher.mock.calls[2];
    expect(url).toBe(`${envelopePath}/documents/1`);
    expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" } });
    expect(init).not.toHaveProperty("body");
    expect(init!.headers).not.toHaveProperty("Content-Type");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(fetcher.mock.calls.slice(0, 2).map(c => c[0])).toEqual(["https://account-d.docusign.com/oauth/token", "https://account-d.docusign.com/oauth/userinfo"]);
    await provider.getDocumentPdf(id);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.every(c => !String(c[0]).includes("/documents/combined") && !String(c[0]).includes("/views/") && c[1]!.method !== "PUT")).toBe(true);
  });
  it.each(["", "{\"access_token\":\"PRIVATE_PROVIDER_BODY\"}", "PRIVATE_PROVIDER_BODY", " %PDF-1.7", "%PDF", "<html>PRIVATE_PROVIDER_BODY</html>"])("rejects missing/non-PDF prefix %j without parsing or exposure", async bytes => {
    const { provider } = transport(() => new Response(bytes));
    const error = await provider.getDocumentPdf(id).catch(e => e);
    expect(error).toMatchObject({ safeCode: "PROVIDER_DOCUMENT_FETCH_FAILED", uncertain: false });
    assertPrivate(error);
  });
  it("accepts exactly 10MB and rejects an announced oversized body without consuming it", async () => {
    const limit = 10 * 1024 * 1024;
    const full = Buffer.alloc(limit); pdf.copy(full);
    const { provider } = transport(() => new Response(full, { headers: { "content-length": String(limit) } }));
    expect((await provider.getDocumentPdf(id)).length).toBe(limit);
    let started = false;
    const { provider: oversized } = transport(() => ({ ok: true, status: 200, headers: new Headers({ "content-length": String(limit + 1) }), body: { getReader: () => { started = true; throw new Error("PRIVATE_PROVIDER_BODY"); } } }) as unknown as Response);
    await expect(oversized.getDocumentPdf(id)).rejects.toMatchObject({ safeCode: "PROVIDER_DOCUMENT_FETCH_FAILED" });
    expect(started).toBe(false);
  });
  it.each(["not-a-number", "-1", "Infinity", "1e8", "9007199254740993"])("rejects invalid content-length %s", async length => {
    const { provider } = transport(() => new Response(pdf, { headers: { "content-length": length } }));
    await expect(provider.getDocumentPdf(id)).rejects.toMatchObject({ safeCode: "PROVIDER_DOCUMENT_FETCH_FAILED" });
  });
  it("bounds streaming bytes even with absent or dishonest content-length and cancels", async () => {
    for (const headers of [undefined, { "content-length": "8" }]) {
      const cancelled = vi.fn();
      const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(pdf); controller.enqueue(new Uint8Array(10 * 1024 * 1024)); }, cancel: cancelled });
      const { provider } = transport(() => new Response(body, { headers }));
      await expect(provider.getDocumentPdf(id)).rejects.toMatchObject({ safeCode: "PROVIDER_DOCUMENT_FETCH_FAILED", uncertain: false });
      expect(cancelled).toHaveBeenCalledTimes(1);
    }
  });
  it.each([302, 400, 401, 404, 429, 500, 503])("HTTP %i errors carry only safe status and do not read error bodies", async status => {
    const read = vi.fn(() => { throw new Error("PRIVATE_PROVIDER_BODY"); });
    const { provider } = transport(() => ({ ok: false, status, headers: new Headers(), body: { getReader: read } }) as unknown as Response);
    const error = await provider.getDocumentPdf(id).catch(e => e);
    expect(error).toMatchObject({ safeCode: "PROVIDER_DOCUMENT_FETCH_FAILED", httpStatus: status, uncertain: false });
    assertPrivate(error);
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["redirect PRIVATE_URL token PRIVATE_PROVIDER_BODY", "PRIVATE_KEY_FRAGMENT PRIVATE_PROVIDER_BODY"])("sanitizes network and redirect errors %s", async message => {
    const { fetcher, provider } = transport(() => { throw new Error(message); });
    const error = await provider.getDocumentPdf(id).catch(e => e);
    expect(error).toMatchObject({ safeCode: "PROVIDER_DOCUMENT_FETCH_FAILED", uncertain: false });
    assertPrivate(error);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("body deadline covers a stalled PDF reader independent of fetch signal support", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(pdf); }, cancel: cancelled });
    const { fetcher, provider } = transport(() => new Response(body));
    const result = provider.getDocumentPdf(id).catch(e => e);
    await vi.advanceTimersByTimeAsync(14999);
    let settled = false; void result.then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await result;
    expect(error).toMatchObject({ safeCode: "PROVIDER_DOCUMENT_FETCH_FAILED", uncertain: false });
    assertPrivate(error);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1]!.signal!.aborted).toBe(true);
  });
  it("header deadline covers a fetcher that never replies or observes abort", async () => {
    vi.useFakeTimers();
    const { fetcher, provider } = transport(() => new Promise<Response>(() => {}));
    const result = provider.getDocumentPdf(id).catch(e => e);
    await vi.advanceTimersByTimeAsync(15000);
    const error = await result;
    assertPrivate(error);
    expect(error.safeCode).toBe("PROVIDER_DOCUMENT_FETCH_FAILED");
    expect(fetcher.mock.calls[2][1]!.signal!.aborted).toBe(true);
  });
  it("sanitizes body reader failure and missing body", async () => {
    for (const response of [new Response(null), new Response(new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE_PROVIDER_BODY PRIVATE_URL")); } }))]) {
      const { provider } = transport(() => response);
      const error = await provider.getDocumentPdf(id).catch(e => e);
      assertPrivate(error);
      expect(error.safeCode).toBe("PROVIDER_DOCUMENT_FETCH_FAILED");
    }
  });
});

const invalidPlans: [string, (tabs: ProviderTabs) => unknown][] = [
  ["no plan", () => undefined], ["null plan", () => null], ["array plan", () => []],
  ["missing signatures", p => ({ initialHereTabs: p.initialHereTabs })], ["missing initials", p => ({ signHereTabs: p.signHereTabs })],
  ["nonarray signatures", p => ({ ...p, signHereTabs: {} })], ["nonarray initials", p => ({ ...p, initialHereTabs: {} })],
  ["3 signatures", p => ({ ...p, signHereTabs: p.signHereTabs.slice(0, 3) })], ["5 signatures", p => ({ ...p, signHereTabs: [...p.signHereTabs, tab("SIGN", 4)] })],
  ["8 initials", p => ({ ...p, initialHereTabs: p.initialHereTabs.slice(0, 8) })], ["101 initials", () => plan(101)],
  ["extra tab kind", p => ({ ...p, checkboxTabs: [] })], ["top-level send", p => ({ ...p, status: "sent" })],
  ["duplicate cross-kind label", p => { p.initialHereTabs[0].tabLabel = p.signHereTabs[0].tabLabel; return p; }],
  ["duplicate signature label", p => { p.signHereTabs[1].tabLabel = p.signHereTabs[0].tabLabel; return p; }],
  ["sparse array", p => { delete p.initialHereTabs[1]; return p; }],
  ["array extra property", p => { Object.assign(p.initialHereTabs, { conditional: "bad" }); return p; }],
  ["inherited plan", p => Object.create(p)],
  ["top-level getter", p => { Object.defineProperty(p, "signHereTabs", { get: () => { throw new Error("PRIVATE_PROVIDER_BODY"); } }); return p; }],
  ["symbol key", p => { Object.assign(p.signHereTabs[0], { [Symbol("PRIVATE_KEY_FRAGMENT")]: "bad" }); return p; }],
  ["nonenumerable key", p => { Object.defineProperty(p.signHereTabs[0], "hidden", { value: true }); return p; }],
  ["tab getter", p => { Object.defineProperty(p.signHereTabs[0], "tabLabel", { get: () => { throw new Error("PRIVATE_PROVIDER_BODY"); } }); return p; }],
  ["toJSON", p => { Object.assign(p, { toJSON: () => ({ status: "sent" }) }); return p; }],
];
const invalidFields: [string, unknown][] = [
  ["documentId", "2"], ["recipientId", "2"], ["documentId", 1], ["recipientId", 1],
  ...["0", "101", "-1", "1.5", "01", "1e1", "1\n", " 1", 1, undefined].map(value => ["pageNumber", value] as [string, unknown]),
  ...["-1", "2001", "1.5", "01", "1e2", "0\n", "NaN", 100, null].flatMap(value => [["xPosition", value], ["yPosition", value]] as [string, unknown][]),
  ...["", "OTHER_LABEL", "ELEVAY_ES_", "ELEVAY_ES_lower", "ELEVAY_ES_A\n", "ELEVAY_ES_A B", "ELEVAY_ES_A/", 1].map(value => ["tabLabel", value] as [string, unknown]),
  ["optional", "true"], ["optional", false], ["scaleValue", "1"], ["scaleValue", 0.7], ["scaleValue", undefined],
  ["templateLocked", "false"], ["templateLocked", true], ["templateLocked", undefined],
  ["templateRequired", "false"], ["templateRequired", true], ["templateRequired", undefined],
  ["conditionalParentLabel", "ELEVAY_ES_PARENT"], ["conditionalParentValue", "true"], ["tabGroupLabels", ["group"]],
  ["anchorString", "signature"], ["locked", "true"], ["status", "sent"], ["unknown", "PRIVATE_PROVIDER_BODY"],
];

describe("Spain mandatory tab creation", () => {
  it("accepts the actual complete signing-policy output at the final fixed signature scale",async()=>{
    const pages:SigningPdfPage[]=Array.from({length:19},(_,i)=>({page:i+1,width:612,height:792,items:[]}));
    Object.values(SPAIN_SIGNATURE_MARKERS).forEach((m,i)=>pages[[1,16,18,19][i]-1].items.push({text:m,x:230,y:350,width:25,height:1}));
    Object.values(SPAIN_INITIAL_MARKERS).forEach((m,i)=>pages[Math.floor(i/2)+2].items.push({text:m,x:230,y:150+i%2*70,width:25,height:1}));
    const actual=buildSpainSigningPlan(pages,"a".repeat(64)),{fetcher,provider}=tabTransport();
    await provider.createRequiredTabs(id,"1",actual.tabs);
    const posts=fetcher.mock.calls.filter(c=>c[0]===`${envelopePath}/recipients/1/tabs`);expect(posts).toHaveLength(1);expect(JSON.parse(posts[0][1]!.body as string)).toEqual(actual.tabs);expect(actual.tabs.signHereTabs.every(t=>t.scaleValue==="0.5")).toBe(true);
  });
  it("POSTs only required absolute tabs once after checking draft status, without sending", async () => {
    const tabs = plan();
    const { fetcher, provider } = tabTransport();
    await provider.createRequiredTabs(id, "1", tabs);
    const apiCalls = fetcher.mock.calls.slice(2);
    expect(apiCalls).toHaveLength(2);
    expect(apiCalls[0]).toEqual([envelopePath, expect.objectContaining({ method: "GET" })]);
    expect(apiCalls[1][0]).toBe(`${envelopePath}/recipients/1/tabs`);
    expect(apiCalls[1][1]).toMatchObject({ method: "POST", redirect: "error" });
    const sent = JSON.parse(apiCalls[1][1]!.body as string);
    expect(sent).toEqual(tabs);
    expect(Object.keys(sent).sort()).toEqual(["initialHereTabs", "signHereTabs"]);
    expect(JSON.stringify(sent)).not.toMatch(/anchor|conditional|group|"status"|sent|clientUserId|email|documentBase64/);
  });
  it("accepts boundary coordinates, pages and 100 initials", async () => {
    const tabs = plan(100);
    for (const item of [...tabs.signHereTabs, ...tabs.initialHereTabs]) { item.pageNumber = "100"; item.xPosition = "0"; item.yPosition = "2000"; }
    await expect(tabTransport().provider.createRequiredTabs(id, "1", tabs)).resolves.toBeUndefined();
  });
  it.each(invalidPlans)("rejects %s before any authentication or network", async (_name, mutate) => {
    const { fetcher, provider } = tabTransport();
    const error = await provider.createRequiredTabs(id, "1", mutate(plan()) as ProviderTabs).catch(e => e);
    assertPrivate(error);
    expect(error).toMatchObject({ safeCode: "INVALID_PROVIDER_TABS", uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(invalidFields)("rejects invalid signature field %s=%j before fetch", async (field, value) => {
    const { fetcher, provider } = tabTransport();
    const tabs = plan();
    Object.assign(tabs.signHereTabs[0], { [field]: value });
    const error = await provider.createRequiredTabs(id, "1", tabs).catch(e => e);
    assertPrivate(error);
    expect(error).toMatchObject({ safeCode: "INVALID_PROVIDER_TABS", uncertain: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["0.7", "1", 0.5, undefined])("rejects wrong initial scale %j before fetch", async value => {
    const { fetcher, provider } = tabTransport();
    const tabs = plan(); Object.assign(tabs.initialHereTabs[0], { scaleValue: value });
    await expect(provider.createRequiredTabs(id, "1", tabs)).rejects.toMatchObject({ safeCode: "INVALID_PROVIDER_TABS" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("snapshots tabs before authentication so in-flight mutation cannot bypass validation", async () => {
    const tabs = plan(); const before = structuredClone(tabs);
    const { fetcher, provider } = tabTransport();
    const pending = provider.createRequiredTabs(id, "1", tabs);
    tabs.signHereTabs[0].optional = "true"; tabs.initialHereTabs.length = 0;
    await pending;
    expect(JSON.parse(fetcher.mock.calls[3][1]!.body as string)).toEqual(before);
  });
  it.each(["sent", "completed", "delivered", "voided", "declined", "deleted", "Created", "created\n", ""]) ("never edits protected/non-draft status %j", async status => {
    const { fetcher, provider } = tabTransport(undefined, status);
    await expect(provider.createRequiredTabs(id, "1", plan())).rejects.toMatchObject({ safeCode: "ENVELOPE_NOT_IN_DRAFT_STATUS", uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.slice(2).every(c => c[1]!.method === "GET")).toBe(true);
  });
  it.each([null, {}, { status: 1 }, { status: null }])("fails closed on malformed status response %j", async data => {
    const { fetcher, provider } = transport(() => json(data));
    const error = await provider.createRequiredTabs(id, "1", plan()).catch(e => e);
    assertPrivate(error);
    expect(error.safeCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([null, {}, { signHereTabs: [] }, { initialHereTabs: [] }, { signHereTabs: {}, initialHereTabs: [] }, { signHereTabs: [], initialHereTabs: null }])("malformed tab reply %j is uncertain and never retried", async data => {
    const { fetcher, provider } = tabTransport(() => json(data));
    const error = await provider.createRequiredTabs(id, "1", plan()).catch(e => e);
    expect(error).toMatchObject({ safeCode: "INVALID_PROVIDER_RESPONSE", uncertain: true });
    assertPrivate(error);
    expect(fetcher.mock.calls.filter(c => String(c[0]).endsWith("/tabs"))).toHaveLength(1);
  });
  it("a lost POST reply is uncertain, sanitized and never retried", async () => {
    const { fetcher, provider } = tabTransport(() => { throw new Error(`PRIVATE_URL ${token} PRIVATE_PROVIDER_BODY PRIVATE_KEY_FRAGMENT`); });
    const error = await provider.createRequiredTabs(id, "1", plan()).catch(e => e);
    expect(error).toMatchObject({ safeCode: "PROVIDER_TIMEOUT_OR_NETWORK", uncertain: true });
    assertPrivate(error);
    expect(fetcher.mock.calls.filter(c => String(c[0]).endsWith("/tabs"))).toHaveLength(1);
  });
  it.each([400, 500, 503])("POST HTTP %i is sanitized and 5xx is uncertain, with no retry", async status => {
    const { fetcher, provider } = tabTransport(() => json({ errorCode: "PRIVATE_PROVIDER_BODY", message: token }, status));
    const error = await provider.createRequiredTabs(id, "1", plan()).catch(e => e);
    expect(error).toMatchObject({ safeCode: "PROVIDER_HTTP_ERROR", httpStatus: status, uncertain: status >= 500 });
    assertPrivate(error);
    expect(fetcher.mock.calls.filter(c => String(c[0]).endsWith("/tabs"))).toHaveLength(1);
  });
  it("retains the existing 2MB JSON bound on tab replies", async () => {
    for (const announced of [false, true]) {
      const cancelled = vi.fn();
      const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel: cancelled });
      const { fetcher, provider } = tabTransport(() => new Response(body, { headers: announced ? { "content-length": String(2 * 1024 * 1024 + 1) } : undefined }));
      await expect(provider.createRequiredTabs(id, "1", plan())).rejects.toMatchObject({ safeCode: "INVALID_PROVIDER_RESPONSE", uncertain: true });
      expect(fetcher.mock.calls.filter(c => String(c[0]).endsWith("/tabs"))).toHaveLength(1);
      if (!announced) expect(cancelled).toHaveBeenCalledTimes(1);
    }
  });
  it("stalled JSON POST body is uncertain and bounded by 15 seconds, no retry", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const { fetcher, provider } = tabTransport(() => new Response(new ReadableStream({ cancel: cancelled })));
    const result = provider.createRequiredTabs(id, "1", plan()).catch(e => e);
    await vi.advanceTimersByTimeAsync(15000);
    const error = await result;
    assertPrivate(error);
    expect(error).toMatchObject({ safeCode: "PROVIDER_TIMEOUT_OR_NETWORK", uncertain: true });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.filter(c => String(c[0]).endsWith("/tabs"))).toHaveLength(1);
  });
  it("never logs credentials, assertions, raw URLs, document bytes or provider bodies", async () => {
    const logs = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = logs.map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    const { provider } = tabTransport(() => { throw new Error("PRIVATE_PROVIDER_BODY PRIVATE_KEY_FRAGMENT"); });
    await provider.createRequiredTabs(id, "1", plan()).catch(assertPrivate);
    await provider.getDocumentPdf(id).catch(assertPrivate);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { ProviderTabs } from "./contractDocusignProvider";
import {
  buildCompletionDocumentProofFromPages as build,
  verifyCompletionDocumentProofFromPages as verifyPages,
  captureCompletionDocumentProof as capture,
  verifyCompletionDocumentProof as verify,
  isValidCompletionDocumentProof as valid,
  type CompletionDocumentProof, type CompletionPdfPage,
} from "./contractDocusignCompletionProof";

const CODE = "COMPLETION_DOCUMENT_UNVERIFIED";
function tabs(scale = "0.5"): ProviderTabs {
  return {
    signHereTabs: [{ documentId: "1", recipientId: "1", pageNumber: "1", xPosition: "100", yPosition: "600",
      tabLabel: "MANUAL_SIGNATURE", optional: "false", scaleValue: scale }],
    initialHereTabs: [{ documentId: "1", recipientId: "1", pageNumber: "2", xPosition: "8", yPosition: "200",
      tabLabel: "ARBITRARY_INITIAL_LABEL", optional: "false", scaleValue: scale }],
  };
}
function pages(count = 2): CompletionPdfPage[] {
  return Array.from({ length: count }, (_, i) => ({ page: i + 1, width: 612, height: 792,
    items: [{ text: `Clause ${i + 1}: amount 14,500.75; حقوق العميل`, x: 80, y: 100, width: 250, height: 12 }] }));
}
function baseline(): CompletionDocumentProof { return build(pages(), tabs()); }
function clone<T>(value: T): T { return structuredClone(value); }
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks();
});

describe("fixed required-tab completion text/geometry proof", () => {
  it("captures only a hash, page dimensions and standard boxes, not legal text or recipient details", () => {
    const proof = baseline();
    expect(proof.version).toBe("text-outside-required-tabs-v1");
    expect(proof.pageSizes).toEqual([{ width: 612, height: 792 }, { width: 612, height: 792 }]);
    expect(proof.boxes).toEqual([{ page: 1, x: 100, y: 600, width: 72, height: 26 }, { page: 2, x: 8, y: 200, width: 34, height: 28 }]);
    expect(valid(proof)).toBe(true); expect(proof.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(proof)).not.toMatch(/Clause|حقوق|MANUAL|email|name/);
    expect(verifyPages(pages(), proof)).toBe(true);
  });
  it("accepts generic labels, one-page contracts and bounded standard 0.7 sizes", () => {
    const fields = tabs("0.7"); fields.initialHereTabs = [];
    const proof = build(pages(1), fields);
    expect(proof.pageCount).toBe(1); expect(proof.boxes[0]).toMatchObject({ width: 100, height: 36 });
    expect(build(pages(), tabs("0.7")).boxes[1]).toMatchObject({ width: 48, height: 40 });
  });
  it("uses kind rather than labels and ignores provider-supplied dimensions", () => {
    const fields: any = tabs(); fields.signHereTabs[0].tabLabel = "looks_like_INITIAL";
    fields.initialHereTabs[0].tabLabel = "looks_like_SIGNATURE";
    fields.signHereTabs[0].width = "900"; fields.signHereTabs[0].height = "900";
    expect(build(pages(), fields).boxes).toEqual(baseline().boxes);
  });
  it("permits inserted signature/initial text and DocuSigned stamp text entirely within 8pt masks", () => {
    const signed = pages();
    signed[0].items.push({ text: "Signed Name", x: 105, y: 605, width: 60, height: 10 },
      { text: "DocuSigned by:", x: 92, y: 592, width: 80, height: 7 });
    signed[1].items.push({ text: "AB", x: 8, y: 210, width: 24, height: 10 });
    expect(verifyPages(signed, baseline())).toBe(true);
  });
  it.each(["text", "removed", "added", "moved", "resized", "partial", "stamp-outside", "page-added", "page-size"])("rejects %s outside fixed boxes", kind => {
    const signed = pages();
    if (kind === "text") signed[0].items[0].text = "Different payment rights";
    if (kind === "removed") signed[0].items = [];
    if (kind === "added") signed[0].items.push({ text: "New term", x: 80, y: 300, width: 80, height: 12 });
    if (kind === "moved") signed[0].items[0].x += 1;
    if (kind === "resized") signed[0].items[0].width += 1;
    if (kind === "partial") signed[0].items.push({ text: "Outside partially", x: 170, y: 605, width: 30, height: 10 });
    if (kind === "stamp-outside") signed[0].items.push({ text: "Stamp", x: 90, y: 591, width: 30, height: 8 });
    if (kind === "page-added") signed.push({ ...clone(signed[0]), page: 3 });
    if (kind === "page-size") signed[0].width += 1;
    expect(verifyPages(signed, baseline())).toBe(false);
  });
  it("baseline capture never hides legal text touching the tab or its stamp border", () => {
    for (const x of [100, 92, 178]) {
      const original = pages(); original[0].items.push({ text: "MUST PAY", x, y: 604, width: 20, height: 12 });
      expect(() => build(original, tabs())).toThrow(CODE);
    }
  });
  it("allows only exact tiny markers or dotted bottom-edge signature placeholders", () => {
    const original = pages(); original[0].items.push({ text: "ELEVAY_ES_SIGN_MAIN", x: 105, y: 615, width: 35, height: 1 },
      { text: "...............", x: 104, y: 614, width: 60, height: 12 });
    const proof = build(original, tabs()); expect(verifyPages(pages(), proof)).toBe(true);
    for (const [text, height, y] of [["ELEVAY_ES_SIGN_MAIN legal text", 1, 615], ["ELEVAY_ES_SIGN_MAIN", 12, 610],
      ["________________", 2, 624], ["...............", 2, 610], ["ELEVAY_ES_SIGN_UNKNOWN", 1, 615]] as const) {
      const p = pages(); p[0].items.push({ text, x: 105, y, width: 60, height });
      expect(() => build(p, tabs())).toThrow(CODE);
    }
  });
  it("preserves text outside boxes including legal-looking marker strings and punctuation", () => {
    const original = pages(); original[0].items.push({ text: "ELEVAY_ES_SIGN_MAIN", x: 200, y: 620, width: 40, height: 1 });
    const proof = build(original, tabs()); expect(verifyPages(pages(), proof)).toBe(false);
    const changed = clone(original); changed[0].items[0].text = changed[0].items[0].text.replace("14,500.75", "14,500,75");
    expect(verifyPages(changed, proof)).toBe(false);
  });
  it("hashes a tiny generated marker ending next to the signature instead of hiding its partial intersection", () => {
    const original = pages();
    original[0].items.push({ text: "ELEVAY_ES_SIGN_MAIN", x: 62, y: 625, width: 36, height: 1 });
    const proof = build(original, tabs()); expect(verifyPages(original, proof)).toBe(true);
    expect(verifyPages(pages(), proof)).toBe(false);
    const altered = clone(original); altered[0].items[1].text = "Different legal text";
    expect(verifyPages(altered, proof)).toBe(false);
  });
  it.each([
    { x: 208, y: 278, runX: 205.8, runY: 295.45, width: 87.77, height: 10, text: ".………:" },
    { x: 251, y: 592, runX: 248.8, runY: 608.2, width: 137.5, height: 11, text: "..…………" },
    { x: 286, y: 528, runX: 284.5, runY: 543.55, width: 195.481, height: 11, text: ":" + ".".repeat(54) + ":" },
  ])("retains the blank-template signature punctuation run at $x,$y entirely in the hash", geometry => {
    const original = pages(), fields = tabs();
    fields.signHereTabs[0].xPosition = String(geometry.x); fields.signHereTabs[0].yPosition = String(geometry.y);
    original[0].items.push({ text: geometry.text, x: geometry.runX, y: geometry.runY, width: geometry.width, height: geometry.height });
    const proof = build(original, fields); expect(verifyPages(original, proof)).toBe(true);
    expect(verifyPages(pages(), proof)).toBe(false);
    for (const change of ["text", "move", "resize"] as const) {
      const changed = clone(original), item = changed[0].items[1];
      if (change === "text") item.text = "Altered legal text";
      if (change === "move") item.x += 1;
      if (change === "resize") item.width += 1;
      expect(verifyPages(changed, proof)).toBe(false);
    }
    for (const text of ["LEGAL " + geometry.text, geometry.text + " 100 EUR", "___", ":::" ]) {
      const changed = clone(original); changed[0].items[1].text = text;
      expect(() => build(changed, fields)).toThrow(CODE);
    }
  });
  it("preserves every zero-advance Arabic glyph run and still requires positive-width legal text", () => {
    const original = pages(); original[0].items.push({ text: "ًال", x: 160, y: 250, width: 0, height: 10 });
    const proof = build(original, tabs()); expect(verifyPages(original, proof)).toBe(true);
    expect(verifyPages(pages(), proof)).toBe(false);
    const changed = clone(original); changed[0].items[1].text = "Different";
    expect(verifyPages(changed, proof)).toBe(false);
    changed[0].items[1].text = "ًال"; changed[0].items[1].x += 1;
    expect(verifyPages(changed, proof)).toBe(false);
    const onlyZero = pages(); for (const p of onlyZero) p.items[0].width = 0;
    expect(() => build(onlyZero, tabs())).toThrow(CODE);
    const inside = pages(); inside[0].items.push({ text: "LEGAL", x: 120, y: 605, width: 0, height: 10 });
    expect(() => build(inside, tabs())).toThrow(CODE);
    expect(verifyPages(inside, baseline())).toBe(false);
  });
  it("still rejects the real blank-template page-9 visible clause touching the initials stamp border", () => {
    const original = pages(), fields = tabs(); fields.initialHereTabs[0].yPosition = "404";
    original[1].items.push({ text: "Visible Arabic legal clause", x: 48.45, y: 435, width: 238.28, height: 10 });
    expect(() => build(original, fields)).toThrow(CODE);
  });
  it("canonicalizes run ordering, NFC text, and geometry to one thousandth of a point", () => {
    const original = pages(); original[0].items.push({ text: "caf\u00e9", x: 80, y: 200, width: 24, height: 12 });
    const proof = build(original, tabs());
    const reordered = clone(original); reordered[0].items.reverse(); reordered[0].items[0].text = "cafe\u0301";
    reordered[0].items[0].x += 0.0001;
    expect(verifyPages(reordered, proof)).toBe(true);
    reordered[0].items[0].x += 0.01; expect(verifyPages(reordered, proof)).toBe(false);
  });
  it("binds masks to the hash and never accepts boxes newly moved into the legal text", () => {
    const proof = baseline(), altered = clone(proof); altered.boxes[0].y = 300;
    expect(valid(altered)).toBe(true); expect(verifyPages(pages(), altered)).toBe(false);
    const fields = tabs(); fields.signHereTabs[0].yPosition = "300";
    expect(build(pages(), fields).contentHash).not.toBe(proof.contentHash);
  });
  it.each(["optional", "conditional", "grouped", "wrong-document", "wrong-recipient", "scale", "scale-missing", "anchor", "NaN", "page", "overlap", "border-overlap", "edge", "no-signature", "too-many"])("fails closed for %s tabs", kind => {
    const fields: any = tabs(), sign = fields.signHereTabs[0];
    if (kind === "optional") sign.optional = "true";
    if (kind === "conditional") sign.conditionalParentLabel = "conditional";
    if (kind === "grouped") sign.tabGroupLabels = ["group"];
    if (kind === "wrong-document") sign.documentId = "2";
    if (kind === "wrong-recipient") sign.recipientId = "2";
    if (kind === "scale") sign.scaleValue = "99";
    if (kind === "scale-missing") delete sign.scaleValue;
    if (kind === "anchor") { delete sign.xPosition; sign.anchorString = "SIGN"; }
    if (kind === "NaN") sign.xPosition = "NaN";
    if (kind === "page") sign.pageNumber = "3";
    if (kind === "overlap") fields.signHereTabs.push({ ...sign });
    if (kind === "border-overlap") fields.signHereTabs.push({ ...sign, xPosition: "173" });
    if (kind === "edge") sign.xPosition = "600";
    if (kind === "no-signature") fields.signHereTabs = [];
    if (kind === "too-many") fields.signHereTabs = Array.from({ length: 101 }, () => ({ ...sign }));
    expect(() => build(pages(), fields)).toThrow(CODE);
  });
  it.each(["blank", "NaN", "items", "pages", "size", "page-number", "off-page", "negative-size", "zero-size", "text-too-long"])("rejects unsupported %s extracted pages", kind => {
    const original = pages();
    if (kind === "blank") for (const p of original) p.items = [];
    if (kind === "NaN") original[0].items[0].x = NaN;
    if (kind === "items") original[0].items = Array.from({ length: 10001 }, () => original[0].items[0]);
    if (kind === "pages") original.push(...pages(60));
    if (kind === "size") original[0].height = 1201;
    if (kind === "page-number") original[0].page = 2;
    if (kind === "off-page") original[0].items[0].x = -1;
    if (kind === "negative-size") original[0].items[0].width = -1;
    if (kind === "zero-size") original[0].items[0].height = 0;
    if (kind === "text-too-long") original[0].items[0].text = "a".repeat(10001);
    expect(() => build(original, tabs())).toThrow(CODE);
  });
});

describe("strict persisted completion proof validation", () => {
  it.each([null, undefined, {}, [], "bad", 5, { version: "text-outside-required-tabs-v1" }])("rejects malformed baseline %j", value => {
    expect(valid(value)).toBe(false); expect(verifyPages(pages(), value)).toBe(false);
  });
  it.each(["version", "hash", "NaN", "count", "size", "boxes", "box-size", "box-page", "box-NaN", "overlap", "sparse", "extra", "symbol", "getter", "array-getter", "array-extra"])("rejects %s baseline without throwing or running accessors", kind => {
    const value: any = baseline(), spy = vi.fn(() => { throw new Error("PRIVATE_DOCUMENT_URL_KEY"); });
    if (kind === "version") value.version = "unknown";
    if (kind === "hash") value.contentHash = "g".repeat(64);
    if (kind === "NaN") value.pageCount = NaN;
    if (kind === "count") value.pageCount = 61;
    if (kind === "size") value.pageSizes[0].width = Infinity;
    if (kind === "boxes") value.boxes = [];
    if (kind === "box-size") value.boxes[0].width = 900;
    if (kind === "box-page") value.boxes[0].page = 3;
    if (kind === "box-NaN") value.boxes[0].x = NaN;
    if (kind === "overlap") value.boxes.push(clone(value.boxes[0]));
    if (kind === "sparse") delete value.boxes[0];
    if (kind === "extra") value.secret = "private";
    if (kind === "symbol") value[Symbol("private")] = "private";
    if (kind === "getter") Object.defineProperty(value, "contentHash", { enumerable: true, get: spy });
    if (kind === "array-getter") Object.defineProperty(value.boxes, "0", { enumerable: true, get: spy });
    if (kind === "array-extra") value.pageSizes.secret = "private";
    expect(valid(value)).toBe(false); expect(verifyPages(pages(), value)).toBe(false); expect(spy).not.toHaveBeenCalled();
  });
  it("accepts plain JSON and null-prototype records but rejects inherited metadata", () => {
    expect(valid(JSON.parse(JSON.stringify(baseline())))).toBe(true);
    const proof = baseline(); Object.setPrototypeOf(proof, null); expect(valid(proof)).toBe(true);
    Object.setPrototypeOf(proof, { injected: "private" }); expect(valid(proof)).toBe(false);
    expect(valid(new Proxy({}, { ownKeys() { throw new Error("PRIVATE"); } }))).toBe(false);
  });
});

// Mock the same public engine URL resolved in production. No PDF files,
// generated images, external requests, environment reads or signed documents.
const root = createRequire(import.meta.url), sub = createRequire(root.resolve("pdf-parse"));
const engineUrl = pathToFileURL(sub.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href;
const engineGetDocument = vi.fn();
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function engineFixture(options: { rotation?: number; count?: number; hang?: boolean; badItems?: boolean; crash?: boolean; importHang?: boolean } = {}) {
  vi.resetModules();
  const dependencyStarted = signal(), dependencyRelease = signal(), started = signal(), destroying = signal();
  vi.doMock("pdf-parse", async () => {
    dependencyStarted.resolve();
    if (options.importHang) await dependencyRelease.promise;
    return {};
  });
  const destroy = vi.fn(async () => { destroying.resolve(); });
  const doc = { numPages: options.count ?? 2, getPage: vi.fn(async (n: number) => ({
    getViewport: () => ({ width: 612, height: 792, rotation: options.rotation ?? 0,
      convertToViewportPoint: (x: number, y: number) => [x, 792 - y] }),
    getTextContent: async () => ({ items: options.badItems ? Array.from({ length: 10001 }, () => ({})) :
      [{ str: `Clause ${n}: amount 14,500.75; حقوق العميل`, width: 250, height: 12, transform: [12, 0, 0, 12, 80, 680] }] }),
    cleanup: vi.fn(),
  })) };
  const getDocument = engineGetDocument.mockReset().mockImplementation((_options: { data: Uint8Array }) => {
    started.resolve();
    return { destroy, promise: options.hang ? new Promise(() => {}) : options.crash ?
      Promise.reject(new Error("PRIVATE_DOCUMENT_TEXT_URL_KEY")) : Promise.resolve(doc) };
  });
  // Import the consumer to flush queued mock registration before any fake clock.
  // The engine binding stays identical even if a sibling cached this public URL.
  const api = await import("./contractDocusignCompletionProof");
  expect((await import(engineUrl)).getDocument).toBe(getDocument);
  return { api, destroy, getDocument, doc, started, destroying, dependencyStarted, dependencyRelease };
}
const pdf = Buffer.from("%PDF- synthetic engine input");
describe("bounded public-engine PDF parsing", () => {
  beforeAll(async () => {
    // doUnmock is queued, not synchronous; mixing it in afterEach with the next
    // doMock can resolve the same dependency out of order under worker load.
    vi.doMock(engineUrl, () => ({ getDocument: engineGetDocument }));
    await import("./contractDocusignCompletionProof");
  });
  afterAll(async () => {
    vi.doUnmock("pdf-parse"); vi.doUnmock(engineUrl);
    // Flush unmock registration without importing/starting the real PDF engine.
    await import("./contractDocusignCompletionProof");
    vi.resetModules();
  });
  it("parses actual public-engine page/text geometry, destroys task, and protects a baseline snapshot", async () => {
    const { api, destroy, getDocument } = await engineFixture();
    const proof = await api.captureCompletionDocumentProof(pdf, tabs());
    expect(proof).toEqual(baseline()); expect(destroy).toHaveBeenCalledTimes(1);
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false, verbosity: 0, stopAtErrors: true }));
    const promise = api.verifyCompletionDocumentProof(pdf, proof); proof.boxes[0].y = 300;
    expect(await promise).toBe(true); expect(destroy).toHaveBeenCalledTimes(2);
  });
  it("snapshots source bytes and provider geometry before asynchronous engine loading", async () => {
    const { api, getDocument } = await engineFixture();
    const input = Buffer.from(pdf), fields = tabs();
    const promise = api.captureCompletionDocumentProof(input, fields);
    input.fill(0); fields.signHereTabs[0].yPosition = "100";
    expect(await promise).toEqual(baseline());
    expect(Buffer.from(getDocument.mock.calls[0][0].data)).toEqual(pdf);
  });
  it.each([{ rotation: 90 }, { count: 0 }, { count: 61 }, { badItems: true }, { crash: true }])("rejects unsupported/corrupt parser results %j and destroys task", async options => {
    const { api, destroy } = await engineFixture(options);
    await expect(api.captureCompletionDocumentProof(pdf, tabs())).rejects.toMatchObject({ name: "DocusignError", message: CODE, safeCode: CODE });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(await api.verifyCompletionDocumentProof(pdf, baseline())).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(2);
  });
  it("times out after 15 seconds, destroys the loading task, and never exposes private parser failures", async () => {
    const { api, destroy, getDocument, started } = await engineFixture({ hang: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const failure = api.captureCompletionDocumentProof(pdf, tabs()).catch(error => error);
    await started.promise;
    expect(getDocument).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14999);
    expect(destroy).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await failure).toMatchObject({ name: "DocusignError", message: CODE, safeCode: CODE });
    expect(destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds hanging destruction to the same deadline", async () => {
    const { api, destroy, getDocument, destroying } = await engineFixture();
    destroy.mockImplementation(() => { destroying.resolve(); return new Promise(() => {}); });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const promise = api.captureCompletionDocumentProof(pdf, tabs());
    await destroying.promise;
    expect(getDocument).toHaveBeenCalledTimes(1); expect(destroy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14999); expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toEqual(baseline()); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not start a late loading task after the dependency import times out", async () => {
    const { api, getDocument, destroy, dependencyStarted, dependencyRelease } = await engineFixture({ importHang: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const failure = api.captureCompletionDocumentProof(pdf, tabs()).catch(e => e);
    await dependencyStarted.promise;
    await vi.advanceTimersByTimeAsync(14999);
    expect(getDocument).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await failure).toMatchObject({ name: "DocusignError", message: CODE, safeCode: CODE });
    dependencyRelease.resolve(); await import("pdf-parse");
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(getDocument).not.toHaveBeenCalled(); expect(destroy).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects oversized bytes, non-PDF data and malformed baselines before parsing", async () => {
    const { api, getDocument } = await engineFixture();
    for (const bytes of [Buffer.from("secret"), Buffer.alloc(10 * 1024 * 1024 + 1), undefined]) {
      await expect(api.captureCompletionDocumentProof(bytes as any, tabs())).rejects.toMatchObject({ message: CODE });
    }
    expect(await api.verifyCompletionDocumentProof(pdf, null)).toBe(false); expect(getDocument).not.toHaveBeenCalled();
  });
  it("does not print documents, URLs, keys, errors, or text", async () => {
    const { api } = await engineFixture({ crash: true });
    const log = vi.spyOn(console, "log"), warn = vi.spyOn(console, "warn"), error = vi.spyOn(console, "error");
    const failure = await api.captureCompletionDocumentProof(pdf, tabs()).catch(e => e);
    expect(failure).toBeInstanceOf(Error); expect(failure.name).toBe("DocusignError");
    expect(failure.message).toBe(CODE); expect(failure.cause).toBeUndefined();
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});

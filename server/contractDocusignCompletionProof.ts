import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DocusignError } from "./contractDocusignConfig";
import type { ProviderTabs } from "./contractDocusignProvider";

export type CompletionDocumentBox = { page: number; x: number; y: number; width: number; height: number };
export type CompletionDocumentProof = {
  version: "text-outside-required-tabs-v1";
  pageCount: number;
  pageSizes: { width: number; height: number }[];
  contentHash: string;
  boxes: CompletionDocumentBox[];
};
export type CompletionPdfItem = { text: string; x: number; y: number; width: number; height: number };
export type CompletionPdfPage = { page: number; width: number; height: number; items: CompletionPdfItem[] };

const VERSION = "text-outside-required-tabs-v1";
const MAX_PAGES = 60, MAX_BOXES = 100, MAX_ITEMS = 10000;
const MAX_BYTES = 10 * 1024 * 1024, MAX_TEXT = 4 * 1024 * 1024;
const TIMEOUT_MS = 15000, BORDER = 8;
// These are fixed policy sizes, NEVER provider-supplied width/height. 0.7 is
// the bounded standard size used by manually positioned non-Spain signatures.
const BOX_SIZES = [[72, 26], [34, 28], [100, 36], [48, 40]] as const;
const MARKERS = new Set([
  "ELEVAY_ES_SIGN_FIRST", "ELEVAY_ES_SIGN_MAIN", "ELEVAY_ES_SIGN_SERVICES", "ELEVAY_ES_SIGN_ACK",
  "ELEVAY_ES_INIT_6_1_B", "ELEVAY_ES_INIT_6_1_J", "ELEVAY_ES_INIT_7_5", "ELEVAY_ES_INIT_7_7",
  "ELEVAY_ES_INIT_8_5", "ELEVAY_ES_INIT_9", "ELEVAY_ES_INIT_10_2", "ELEVAY_ES_INIT_12_4", "ELEVAY_ES_INIT_12_1_J",
]);
const fail = (): never => { throw new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED"); };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const dimension = (n: unknown): n is number => finite(n) && n >= 400 && n <= 1200;
const round = (n: number) => Math.round(n * 1000) / 1000;

function dataObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === "string" && !!descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable;
  });
}
function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return dataObject(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function boundedArray(value: unknown, max: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max
    || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let n = 0; n < value.length; n++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(n));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) return false;
  }
  return true;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value === "string") {
    if (value.length > 4 || !/^(0|[1-9][0-9]*)$/.test(value)) fail();
    value = Number(value);
  }
  if (!finite(value) || !Number.isInteger(value) || value < min || value > max) fail();
  return value as number;
}
function compareBox(a: CompletionDocumentBox, b: CompletionDocumentBox): number {
  return a.page - b.page || a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height;
}
function mask(box: CompletionDocumentBox, size: { width: number; height: number }): CompletionDocumentBox {
  const x = Math.max(0, box.x - BORDER), y = Math.max(0, box.y - BORDER);
  return { page: box.page, x, y, width: Math.min(size.width, box.x + box.width + BORDER) - x,
    height: Math.min(size.height, box.y + box.height + BORDER) - y };
}
function intersects(a: CompletionPdfItem | CompletionDocumentBox, b: CompletionDocumentBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function contains(box: CompletionDocumentBox, item: CompletionPdfItem): boolean {
  return item.x >= box.x && item.y >= box.y && item.x + item.width <= box.x + box.width
    && item.y + item.height <= box.y + box.height;
}
function validBoxes(boxes: unknown, sizes: { width: number; height: number }[]): boxes is CompletionDocumentBox[] {
  if (!boundedArray(boxes, MAX_BOXES) || boxes.length < 1) return false;
  const masks: CompletionDocumentBox[] = [];
  for (let n = 0; n < boxes.length; n++) {
    const b = boxes[n];
    if (!exactObject(b, ["page", "x", "y", "width", "height"]) || !finite(b.page) || !Number.isInteger(b.page)
      || b.page < 1 || b.page > sizes.length || !finite(b.x) || !finite(b.y) || !Number.isInteger(b.x)
      || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || !finite(b.width) || !finite(b.height)
      || !BOX_SIZES.some(([w, h]) => w === b.width && h === b.height)) return false;
    const box = b as CompletionDocumentBox, size = sizes[box.page - 1];
    if (box.x + box.width > size.width || box.y + box.height > size.height
      || (n > 0 && compareBox(boxes[n - 1] as CompletionDocumentBox, box) >= 0)) return false;
    const padded = mask(box, size);
    if (masks.some(m => m.page === padded.page && intersects(m, padded))) return false;
    masks.push(padded);
  }
  return true;
}

/** Strict validation of persisted JSON, not authorization or a substitute for
 * independently verifying the envelope recipient and exact mandatory tabs. */
export function isValidCompletionDocumentProof(value: unknown): value is CompletionDocumentProof {
  try {
    if (!exactObject(value, ["version", "pageCount", "pageSizes", "contentHash", "boxes"])
      || value.version !== VERSION || !finite(value.pageCount) || !Number.isInteger(value.pageCount)
      || value.pageCount < 1 || value.pageCount > MAX_PAGES || typeof value.contentHash !== "string"
      || !/^[a-f0-9]{64}$/.test(value.contentHash) || !boundedArray(value.pageSizes, MAX_PAGES)
      || value.pageSizes.length !== value.pageCount) return false;
    const sizes: { width: number; height: number }[] = [];
    for (const size of value.pageSizes) {
      if (!exactObject(size, ["width", "height"]) || !dimension(size.width) || !dimension(size.height)) return false;
      sizes.push({ width: size.width, height: size.height });
    }
    return validBoxes(value.boxes, sizes);
  } catch { return false; }
}

/** Snapshot only required signature/initial geometry before any asynchronous work.
 * Other provider metadata is not a source of masking geometry. */
function boxesFromTabs(tabs: ProviderTabs): CompletionDocumentBox[] {
  if (!dataObject(tabs) || !boundedArray(tabs.signHereTabs, MAX_BOXES) || !boundedArray(tabs.initialHereTabs, MAX_BOXES)
    || tabs.signHereTabs.length < 1 || tabs.signHereTabs.length + tabs.initialHereTabs.length > MAX_BOXES) fail();
  const boxes: CompletionDocumentBox[] = [];
  for (const [group, signature] of [[tabs.signHereTabs, true], [tabs.initialHereTabs, false]] as const) {
    for (const raw of group as unknown as Record<string, unknown>[]) {
      if (!dataObject(raw) || raw.documentId !== "1" || (raw.recipientId !== undefined && raw.recipientId !== "1")
        || !(raw.optional === "false" || raw.optional === false)
        || ["conditionalParentLabel", "conditionalParentValue", "conditionalParentId"].some(k => raw[k] !== undefined && raw[k] !== "")
        || (raw.tabGroupLabels !== undefined && (!boundedArray(raw.tabGroupLabels, 0)))) fail();
      const value = raw.scaleValue;
      if (!(finite(value) || (typeof value === "string" && value.length <= 8 && /^0\.[57]0*$/.test(value)))) fail();
      const scale = Number(value);
      if (scale !== 0.5 && scale !== 0.7) fail();
      const [width, height] = BOX_SIZES[scale === 0.5 ? (signature ? 0 : 1) : (signature ? 2 : 3)];
      boxes.push({ page: integer(raw.pageNumber, 1, MAX_PAGES), x: integer(raw.xPosition, 0, 1200),
        y: integer(raw.yPosition, 0, 1200), width, height });
    }
  }
  return boxes.sort(compareBox);
}
function validatePages(pages: CompletionPdfPage[]): void {
  if (!boundedArray(pages, MAX_PAGES) || pages.length < 1) fail();
  let textSize = 0;
  for (let n = 0; n < pages.length; n++) {
    const p = pages[n];
    if (!exactObject(p, ["page", "width", "height", "items"]) || p.page !== n + 1
      || !dimension(p.width) || !dimension(p.height) || !boundedArray(p.items, MAX_ITEMS)) fail();
    for (const i of p.items) {
      if (!exactObject(i, ["text", "x", "y", "width", "height"]) || typeof i.text !== "string" || i.text.length > MAX_ITEMS
        || ![i.x, i.y, i.width, i.height].every(finite) || i.width < 0 || i.height < 0
        || i.x < 0 || i.y < 0 || i.x + i.width > p.width || i.y + i.height > p.height
        || (i.text.trim() && i.height <= 0)) fail();
      textSize += i.text.length;
      if (textSize > MAX_TEXT) fail();
    }
  }
}
function bottomEdgeSignaturePunctuation(item: CompletionPdfItem, box: CompletionDocumentBox): boolean {
  // Word can serialize dotted lines as ellipses with an edge colon. These
  // partially intersecting runs are retained WHOLE, never masked or normalized.
  return box.width >= 72 && item.height <= 14
    && Math.abs(item.y + item.height - (box.y + box.height)) <= 4
    && /^\s*:?[\s.\u2026]+:?\s*$/.test(item.text) && (item.text.match(/[.\u2026]/g)?.length ?? 0) >= 3;
}
function harmlessPlaceholder(item: CompletionPdfItem, box: CompletionDocumentBox): boolean {
  // Exact, tiny generated markers only; never arbitrary labels or marker prefixes.
  if (item.height <= 1.1 && MARKERS.has(item.text)) return true;
  // Only dotted signature lines at the field's bottom edge. Entire text items
  // must fit the padded box; a long line crossing legal text is never dropped.
  return box.width >= 72 && /^(?:\s*\.){3,}\s*$/.test(item.text) && item.height <= 14
    && Math.abs(item.y + item.height - (box.y + box.height)) <= 4;
}
function contentHash(pages: CompletionPdfPage[], boxes: CompletionDocumentBox[], capture: boolean): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify([VERSION, boxes]));
  let retainedText = false;
  for (const page of pages) {
    const pageBoxes = boxes.filter(b => b.page === page.page);
    const masks = pageBoxes.map(b => mask(b, page));
    const items: [string, number, number, number, number][] = [];
    for (const item of page.items) {
      if (!item.text) continue;
      const hit = masks.findIndex(b => intersects(item, b));
      if (hit >= 0) {
        // Baselines may never mask legal text, even a partial intersection.
        // Completed PDFs may only omit items ENTIRELY inside a fixed mask.
        if (item.width === 0) {
          // PDF.js emits zero-advance glyph runs in ordinary Arabic legal text.
          // Retain their text and geometry; never let a mask erase such a run.
          if (capture) fail();
        } else if (!contains(masks[hit], item)) {
          // Spain's exact tiny marker can end just LEFT of its signature tab
          // and straddle the 8pt stamp border. Keep that whole run in the hash;
          // neither removing it nor replacing it with legal text is permitted.
          if (!(item.height <= 1.1 && MARKERS.has(item.text))
            && !bottomEdgeSignaturePunctuation(item, pageBoxes[hit])) fail();
        } else {
          if (capture && !harmlessPlaceholder(item, pageBoxes[hit])) fail();
          continue;
        }
      }
      if (item.text.trim() && item.width > 0) retainedText = true;
      items.push([item.text.normalize("NFC"), round(item.x), round(item.y), round(item.width), round(item.height)]);
    }
    // PDF serialization can reorder independent text runs without moving them.
    items.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[3] - b[3] || a[4] - b[4] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    hash.update(JSON.stringify([page.page, round(page.width), round(page.height), items]));
  }
  // Scanned/image-only documents cannot establish this text proof.
  if (!retainedText) fail();
  return hash.digest("hex");
}
function proofFromPages(pages: CompletionPdfPage[], boxes: CompletionDocumentBox[], capture: boolean): CompletionDocumentProof {
  validatePages(pages);
  const pageSizes = pages.map(p => ({ width: round(p.width), height: round(p.height) }));
  if (!validBoxes(boxes, pageSizes)) fail();
  return { version: VERSION, pageCount: pages.length, pageSizes, boxes, contentHash: contentHash(pages, boxes, capture) };
}
/** Pure deterministic seam for synthetic-page tests; production capture parses
 * the bytes below. This is not proof of images, drawing operators or signatures. */
export function buildCompletionDocumentProofFromPages(pages: CompletionPdfPage[], tabs: ProviderTabs): CompletionDocumentProof {
  try { return proofFromPages(pages, boxesFromTabs(tabs), true); } catch { return fail(); }
}
/** Reuses ONLY the previously approved persisted boxes, never completion tabs. */
export function verifyCompletionDocumentProofFromPages(pages: CompletionPdfPage[], baseline: unknown): boolean {
  try {
    if (!isValidCompletionDocumentProof(baseline)) return false;
    const actual = proofFromPages(pages, baseline.boxes.map(b => ({ ...b })), false);
    return actual.contentHash === baseline.contentHash && actual.pageCount === baseline.pageCount
      && JSON.stringify(actual.pageSizes) === JSON.stringify(baseline.pageSizes);
  } catch { return false; }
}

async function readPdfPages(bytes: Buffer): Promise<CompletionPdfPage[]> {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") fail();
  // Snapshot input; callers cannot change the PDF while the parser is awaiting.
  const data = new Uint8Array(bytes);
  const deadline = Date.now() + TIMEOUT_MS;
  let task: any, cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => { if (cancelled || Date.now() >= deadline) fail(); };
  try {
    const work = (async () => {
      // Import the existing dependency for its public Node polyfills, then use
      // its pinned, public PDF.js engine. No filesystem, API or config reads.
      await import("pdf-parse"); check();
      const root = createRequire(import.meta.url), sub = createRequire(root.resolve("pdf-parse"));
      const engine: any = await import(pathToFileURL(sub.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href); check();
      task = engine.getDocument({ data, verbosity: 0, isEvalSupported: false, useSystemFonts: true,
        disableFontFace: true, stopAtErrors: true, maxImageSize: 0 });
      const doc = await task.promise; check();
      if (!Number.isInteger(doc.numPages) || doc.numPages < 1 || doc.numPages > MAX_PAGES) fail();
      const pages: CompletionPdfPage[] = [];
      let textSize = 0;
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n); check();
        const view = page.getViewport({ scale: 1 });
        if (view.rotation !== 0 || !dimension(view.width) || !dimension(view.height)) fail();
        const content = await page.getTextContent(); check();
        if (!boundedArray(content.items, MAX_ITEMS)) fail();
        const items: CompletionPdfItem[] = [];
        for (const raw of content.items as any[]) {
          if (typeof raw.str !== "string" || raw.str.length > MAX_ITEMS || !boundedArray(raw.transform, 6)
            || raw.transform.length !== 6 || !raw.transform.every(finite) || !finite(raw.width) || !finite(raw.height)
            || raw.width < 0 || raw.height < 0 || raw.transform[1] !== 0 || raw.transform[2] !== 0) fail();
          textSize += raw.str.length;
          if (textSize > MAX_TEXT) fail();
          const [x, y] = view.convertToViewportPoint(raw.transform[4], raw.transform[5]);
          items.push({ text: raw.str, x, y: y - raw.height, width: raw.width, height: raw.height });
        }
        pages.push({ page: n, width: view.width, height: view.height, items });
        page.cleanup?.();
      }
      validatePages(pages); check();
      return pages;
    })();
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { cancelled = true; reject(new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED")); }, TIMEOUT_MS);
    })]);
  } catch { return fail(); }
  finally {
    cancelled = true;
    if (timer) clearTimeout(timer);
    // Always initiate destruction, including failures/timeouts. Destruction
    // itself must not extend the deadline if a malformed engine task hangs.
    if (task) {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const destroyed = Promise.resolve(task.destroy()).catch(() => {});
        const remaining = deadline - Date.now();
        if (remaining > 0) await Promise.race([destroyed, new Promise<void>(resolve => {
          cleanupTimer = setTimeout(resolve, remaining);
        })]);
      } catch { /* Never expose parser errors or private document content. */ }
      finally { if (cleanupTimer) clearTimeout(cleanupTimer); }
    }
  }
}

/** Capture at the first independently verified SENT state, BEFORE any client
 * link. Never manufacture a baseline after completion. No event (including
 * signing_complete) is evidence of document integrity or signing status. */
export async function captureCompletionDocumentProof(bytes: Buffer, tabs: ProviderTabs): Promise<CompletionDocumentProof> {
  try {
    const boxes = boxesFromTabs(tabs);
    return proofFromPages(await readPdfPages(bytes), boxes, true);
  } catch { return fail(); }
}
export async function verifyCompletionDocumentProof(bytes: Buffer, baseline: unknown): Promise<boolean> {
  // Runtime validation and copy BEFORE awaiting: no mutable masks in flight.
  try {
    if (!isValidCompletionDocumentProof(baseline)) return false;
    const approved: CompletionDocumentProof = { version: baseline.version, pageCount: baseline.pageCount,
      pageSizes: baseline.pageSizes.map(s => ({ ...s })), contentHash: baseline.contentHash,
      boxes: baseline.boxes.map(b => ({ ...b })) };
    return verifyCompletionDocumentProofFromPages(await readPdfPages(bytes), approved);
  } catch { return false; }
}

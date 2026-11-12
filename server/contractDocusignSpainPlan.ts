import type { SpainSigningPlan } from "./contractDocusignSpainSigning";

const PROFILE = "spain-2026-11-12-v1";
const MAX_PAGES = 60;
const MAX_TABS = 100;
const PLAN_KEYS = [
  "profile", "pdfHash", "layoutHash", "pageCount", "pageSizes",
  "fullSignaturePages", "initialPages", "tabs",
] as const;
const TAB_KEYS = [
  "documentId", "recipientId", "pageNumber", "xPosition", "yPosition",
  "tabLabel", "optional", "scaleValue", "templateLocked", "templateRequired",
] as const;
// Deliberately duplicate the versioned policy's 13 semantic labels: a runtime
// import of Signing would create a cycle and load PDF/provider dependencies.
// Keep these in sync with SPAIN_*_MARKERS when changing the profile version.
const SIGN_LABELS = [
  "ELEVAY_ES_SIGN_FIRST", "ELEVAY_ES_SIGN_MAIN",
  "ELEVAY_ES_SIGN_SERVICES", "ELEVAY_ES_SIGN_ACK",
] as const;
const CLAUSE_LABELS = [
  "ELEVAY_ES_INIT_6_1_B", "ELEVAY_ES_INIT_6_1_J", "ELEVAY_ES_INIT_7_5",
  "ELEVAY_ES_INIT_7_7", "ELEVAY_ES_INIT_8_5", "ELEVAY_ES_INIT_9",
  "ELEVAY_ES_INIT_10_2", "ELEVAY_ES_INIT_12_4", "ELEVAY_ES_INIT_12_1_J",
] as const;

type Box = { page: number; x: number; y: number; width: number; height: number };

/** Only exact, own data properties are accepted, never getters or hidden keys. */
function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length) return false;
  return own.every(key => {
    if (typeof key !== "string" || !keys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable === true;
  });
}

/** Check length before traversing; reject holes, accessors, symbols and extras. */
function boundedArray(value: unknown, max: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isInteger(length) || length < 0 || length > max) return false;
  if (Reflect.ownKeys(value).length !== length + 1) return false;
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) return false;
  }
  return true;
}

function dimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 400 && value <= 1200;
}

function integerString(value: unknown, min: number, max: number): value is string {
  // The length limit precedes the regex/number conversion for hostile strings.
  return typeof value === "string" && value.length <= 4 && /^(0|[1-9][0-9]*)$/.test(value)
    && Number(value) >= min && Number(value) <= max;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && value.length === 64 && /^[a-fA-F0-9]{64}$/.test(value);
}

function exactPageList(value: unknown, expected: number[]): boolean {
  return boundedArray(value, MAX_PAGES) && value.length === expected.length
    && value.every((page, index) => page === expected[index]);
}

/**
 * Strict structural/coverage validation for this Spain profile only. Callers
 * choose when Spain metadata is required; this does not migrate legacy rows.
 * Hash syntax is checked here, not cryptographic correspondence to PDF bytes.
 * All loops are capped at 60 pages/100 tabs; no I/O or credential dependencies.
 */
export function isValidSpainSigningPlan(value: unknown): value is SpainSigningPlan {
  try {
    if (!exactObject(value, PLAN_KEYS) || value.profile !== PROFILE
      || !hash(value.pdfHash) || !hash(value.layoutHash)
      || typeof value.pageCount !== "number" || !Number.isInteger(value.pageCount)
      || value.pageCount < 4 || value.pageCount > MAX_PAGES) return false;
    const pageCount = value.pageCount;
    if (!boundedArray(value.pageSizes, MAX_PAGES) || value.pageSizes.length !== pageCount) return false;
    const pageSizes: { width: number; height: number }[] = [];
    for (const size of value.pageSizes) {
      if (!exactObject(size, ["width", "height"]) || !dimension(size.width) || !dimension(size.height)) return false;
      pageSizes.push({ width: size.width, height: size.height });
    }
    if (!exactObject(value.tabs, ["signHereTabs", "initialHereTabs"])) return false;
    const signs = value.tabs.signHereTabs;
    const initials = value.tabs.initialHereTabs;
    if (!boundedArray(signs, 4) || signs.length !== 4 || !boundedArray(initials, MAX_TABS)
      || signs.length + initials.length > MAX_TABS) return false;

    const labels = new Set<string>();
    const boxes: Box[] = [];
    const signPages = new Map<string, number>();
    const initialTabs = new Map<string, number>();
    const validateTab = (raw: unknown, signature: boolean): boolean => {
      if (!exactObject(raw, TAB_KEYS) || raw.documentId !== "1" || raw.recipientId !== "1"
        || raw.optional !== "false" || raw.templateLocked !== "true" || raw.templateRequired !== "true"
        || raw.scaleValue !== "0.5"
        || !integerString(raw.pageNumber, 1, pageCount)
        || !integerString(raw.xPosition, 0, 1200) || !integerString(raw.yPosition, 0, 1200)
        || typeof raw.tabLabel !== "string" || raw.tabLabel.length > 32 || labels.has(raw.tabLabel)) return false;
      const label = raw.tabLabel;
      if (signature && !SIGN_LABELS.includes(label as typeof SIGN_LABELS[number])) return false;
      const page = Number(raw.pageNumber), x = Number(raw.xPosition), y = Number(raw.yPosition);
      const width = signature ? 72 : 34, height = signature ? 26 : 28;
      const size = pageSizes[page - 1];
      if (x + width > size.width || y + height > size.height) return false;
      labels.add(label);
      boxes.push({ page, x, y, width, height });
      (signature ? signPages : initialTabs).set(label, page);
      return true;
    };
    for (const tab of signs) if (!validateTab(tab, true)) return false;
    for (const tab of initials) if (!validateTab(tab, false)) return false;

    const [first, main, services, ack] = SIGN_LABELS.map(label => signPages.get(label)!);
    if (first !== 1 || main <= 1 || services <= main || ack < services || ack !== pageCount) return false;
    const fullPages = Array.from(new Set([first, main, services, ack])).sort((a, b) => a - b);
    const otherPages = Array.from({ length: pageCount }, (_, index) => index + 1)
      .filter(page => !fullPages.includes(page));
    if (!exactPageList(value.fullSignaturePages, fullPages) || !exactPageList(value.initialPages, otherPages)
      || initials.length !== otherPages.length + CLAUSE_LABELS.length) return false;
    // Exact counts plus global label uniqueness leave no room for unknown labels.
    for (const page of otherPages) if (initialTabs.get(`ELEVAY_ES_PAGE_${page}`) !== page) return false;
    for (const label of CLAUSE_LABELS) if (!initialTabs.has(label)) return false;

    // Check both kinds together using their real geometry. Merely touching an
    // edge is allowed; any positive-area intersection is forbidden.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.page === b.page && a.x < b.x + b.width && b.x < a.x + a.width
          && a.y < b.y + b.height && b.y < a.y + a.height) return false;
      }
    }
    return true;
  } catch {
    // Malformed objects/proxies must fail closed, without throwing/logging.
    return false;
  }
}

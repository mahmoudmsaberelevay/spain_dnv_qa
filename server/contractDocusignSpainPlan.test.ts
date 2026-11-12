import { describe, expect, it, vi } from "vitest";
import {
  buildSpainSigningPlan, SPAIN_SIGNATURE_MARKERS, SPAIN_INITIAL_MARKERS,
  type SigningPdfPage,
} from "./contractDocusignSpainSigning";
import { isValidSpainSigningPlan } from "./contractDocusignSpainPlan";

const pdfHash = "a".repeat(64);
const layoutHash = "b".repeat(64);
function pages(count = 19): SigningPdfPage[] {
  const result: SigningPdfPage[] = Array.from({ length: count }, (_, index) => ({
    page: index + 1, width: 612, height: 792, items: [],
  }));
  const place = (page: number, text: string, y: number) => {
    result[page - 1].items.push({ text, x: 230, y, width: 25, height: 1 });
  };
  const signPages = [1, count === 4 ? 2 : count - 3, count - 1, count];
  Object.values(SPAIN_SIGNATURE_MARKERS).forEach((label, index) => place(signPages[index], label, 350));
  Object.values(SPAIN_INITIAL_MARKERS).forEach((label, index) => {
    place(2 + index % (count - 2), label, 100 + Math.floor(index / (count - 2)) * 70);
  });
  return result;
}
function plan(count = 19): any {
  const built = buildSpainSigningPlan(pages(count), pdfHash);
  // Transitional fixture only: the parent is adding layoutHash to the builder.
  // Preserve the builder's hash once present; the validator never supplies it.
  return { ...built, layoutHash: (built as typeof built & { layoutHash?: string }).layoutHash ?? layoutHash };
}

describe("strict Spain signing plan metadata", () => {
  it("accepts the complete 19-page builder plan with four signatures and 24 initials", () => {
    const value = plan();
    expect(value.fullSignaturePages).toEqual([1, 16, 18, 19]);
    expect(value.initialPages).toHaveLength(15);
    expect(value.tabs.signHereTabs).toHaveLength(4);
    expect(value.tabs.initialHereTabs).toHaveLength(24);
    expect(isValidSpainSigningPlan(value)).toBe(true);
    expect(isValidSpainSigningPlan(JSON.parse(JSON.stringify(value)))).toBe(true);
  });
  it.each([4, 22, 60])("accepts complete actual-page coverage at %i pages", count => {
    expect(isValidSpainSigningPlan(plan(count))).toBe(true);
  });
  it("allows services and acknowledgment on the last page with disjoint boxes", () => {
    const value = plan();
    value.tabs.signHereTabs[2].pageNumber = "19";
    value.tabs.signHereTabs[2].yPosition = "200";
    value.fullSignaturePages = [1, 16, 19];
    value.initialPages = value.initialPages.concat(18).sort((a: number, b: number) => a - b);
    value.tabs.initialHereTabs.push({
      ...value.tabs.initialHereTabs[0], pageNumber: "18", tabLabel: "ELEVAY_ES_PAGE_18",
    });
    expect(isValidSpainSigningPlan(value)).toBe(true);
  });
  it("accepts unordered tab arrays but requires semantically ordered page metadata", () => {
    const value = plan();
    value.tabs.signHereTabs.reverse();
    value.tabs.initialHereTabs.reverse();
    expect(isValidSpainSigningPlan(value)).toBe(true);
  });
  it("accepts exact plain records with null prototypes", () => {
    const value = plan();
    Object.setPrototypeOf(value, null);
    Object.setPrototypeOf(value.tabs, null);
    Object.setPrototypeOf(value.pageSizes[0], null);
    Object.setPrototypeOf(value.tabs.signHereTabs[0], null);
    expect(isValidSpainSigningPlan(value)).toBe(true);
  });
  it("rejects the malicious one-signature/no-initial persisted plan", () => {
    const value = plan();
    value.tabs.signHereTabs = [value.tabs.signHereTabs[0]];
    value.tabs.initialHereTabs = [];
    value.fullSignaturePages = [1];
    value.initialPages = [];
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });

  it.each(["profile", "pdfHash", "layoutHash", "pageCount", "pageSizes", "fullSignaturePages", "initialPages", "tabs"])("requires metadata key %s", key => {
    const value = plan();
    delete value[key];
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it.each(["pdfHash", "layoutHash"])("strictly validates %s", key => {
    for (const invalid of [undefined, null, 123, "", "a".repeat(63), "a".repeat(65), "g".repeat(64), "a".repeat(64) + "\n"]) {
      const value = plan();
      value[key] = invalid;
      expect(isValidSpainSigningPlan(value)).toBe(false);
    }
    const upper = plan();
    upper[key] = "F".repeat(64);
    expect(isValidSpainSigningPlan(upper)).toBe(true);
  });
  it.each([0, 3, 61, 19.1, "19", NaN, Infinity, null])("rejects invalid page count %s", count => {
    const value = plan();
    value.pageCount = count;
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it.each(["other-profile", undefined, null, 1])("rejects wrong profile %s without legacy fallback", profile => {
    const value = plan();
    value.profile = profile;
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it.each(["width", "height"])("rejects non-finite/out-of-range %s", key => {
    for (const invalid of [399, 1201, NaN, Infinity, -Infinity, "612", undefined, null]) {
      const value = plan();
      value.pageSizes[0][key] = invalid;
      expect(isValidSpainSigningPlan(value)).toBe(false);
    }
  });
  it("allows finite fractional page dimensions and exact inclusive bounds", () => {
    const value = plan();
    value.pageSizes[1] = { width: 400, height: 1200 };
    value.pageSizes[2] = { width: 612.25, height: 792.5 };
    expect(isValidSpainSigningPlan(value)).toBe(true);
  });
  it.each(["short", "long", "null", "unknown-size-key", "missing-dimension"])("rejects malformed page sizes: %s", kind => {
    const value = plan();
    if (kind === "short") value.pageSizes.pop();
    if (kind === "long") value.pageSizes.push({ width: 612, height: 792 });
    if (kind === "null") value.pageSizes[0] = null;
    if (kind === "unknown-size-key") value.pageSizes[0].rotation = 0;
    if (kind === "missing-dimension") delete value.pageSizes[0].height;
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });

  it.each(["documentId", "recipientId", "pageNumber", "xPosition", "yPosition", "tabLabel", "optional", "scaleValue", "templateLocked", "templateRequired"])("requires tab key %s for both tab kinds", key => {
    for (const group of ["signHereTabs", "initialHereTabs"]) {
      const value = plan();
      delete value.tabs[group][0][key];
      expect(isValidSpainSigningPlan(value)).toBe(false);
    }
  });
  it.each(["documentId", "recipientId", "optional", "templateLocked", "templateRequired", "scaleValue"])("rejects weakened tab policy %s", key => {
    for (const group of ["signHereTabs", "initialHereTabs"]) {
      for (const invalid of [undefined, true, false, "", "2", "false", "true", "0.9"]) {
        const value = plan();
        if (value.tabs[group][0][key] === invalid) continue;
        value.tabs[group][0][key] = invalid;
        expect(isValidSpainSigningPlan(value)).toBe(false);
      }
    }
  });
  it.each(["pageNumber", "xPosition", "yPosition"])("rejects NaN or noncanonical expected %s", key => {
    for (const invalid of [NaN, Infinity, "NaN", "Infinity", "-1", "1.5", "1e2", " 1", "1 ", "01", "+1", "1\n", 1, null, "9".repeat(10000)]) {
      for (const group of ["signHereTabs", "initialHereTabs"]) {
        const value = plan();
        value.tabs[group][0][key] = invalid;
        expect(isValidSpainSigningPlan(value)).toBe(false);
      }
    }
  });
  it.each(["signHereTabs", "initialHereTabs"])("rejects out-of-document pages in %s", group => {
    for (const page of ["0", "20"]) {
      const value = plan();
      value.tabs[group][0].pageNumber = page;
      expect(isValidSpainSigningPlan(value)).toBe(false);
    }
  });
  it.each(["signHereTabs", "initialHereTabs"])("checks the entire %s box against bounds", group => {
    const width = group === "signHereTabs" ? 72 : 34;
    const height = group === "signHereTabs" ? 26 : 28;
    const edge = plan();
    edge.tabs[group][0].xPosition = String(612 - width);
    edge.tabs[group][0].yPosition = String(792 - height);
    expect(isValidSpainSigningPlan(edge)).toBe(true);
    for (const [key, invalid] of [["xPosition", String(613 - width)], ["yPosition", String(793 - height)]]) {
      const value = plan();
      value.tabs[group][0][key] = invalid;
      expect(isValidSpainSigningPlan(value)).toBe(false);
    }
  });

  it.each(["first-not-one", "main-one", "services-before-main", "services-equal-main", "ack-before-services", "ack-not-last"])("rejects semantic signature order: %s", kind => {
    const value = plan();
    const signs = value.tabs.signHereTabs;
    if (kind === "first-not-one") signs[0].pageNumber = "2";
    if (kind === "main-one") signs[1].pageNumber = "1";
    if (kind === "services-before-main") signs[2].pageNumber = "15";
    if (kind === "services-equal-main") signs[2].pageNumber = "16";
    if (kind === "ack-before-services") signs[3].pageNumber = "17";
    if (kind === "ack-not-last") signs[3].pageNumber = "18";
    // Remove overlap as an alternative rejection reason.
    signs[1].xPosition = "400";
    signs[3].xPosition = "400";
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it.each(["wrong-initial-page", "missing-initial-page", "unsorted-initial-pages", "duplicate-initial-page", "signature-page-in-initials", "wrong-signature-pages", "duplicate-signature-page", "unsorted-signature-pages", "string-page"])("rejects wrong metadata coverage: %s", kind => {
    const value = plan();
    if (kind === "wrong-initial-page") value.initialPages[0] = 19;
    if (kind === "missing-initial-page") value.initialPages.pop();
    if (kind === "unsorted-initial-pages") value.initialPages.reverse();
    if (kind === "duplicate-initial-page") value.initialPages[1] = value.initialPages[0];
    if (kind === "signature-page-in-initials") value.initialPages.push(1);
    if (kind === "wrong-signature-pages") value.fullSignaturePages[1] = 15;
    if (kind === "duplicate-signature-page") value.fullSignaturePages.push(19);
    if (kind === "unsorted-signature-pages") value.fullSignaturePages.reverse();
    if (kind === "string-page") value.initialPages[0] = "2";
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it.each([...Object.values(SPAIN_SIGNATURE_MARKERS), ...Object.values(SPAIN_INITIAL_MARKERS), "ELEVAY_ES_PAGE_2"])("rejects a missing or duplicated semantic marker %s", label => {
    for (const kind of ["missing", "duplicate", "replace-with-unknown"]) {
      const value = plan();
      const group = label.startsWith("ELEVAY_ES_SIGN_") ? value.tabs.signHereTabs : value.tabs.initialHereTabs;
      const index = group.findIndex((tab: any) => tab.tabLabel === label);
      if (kind === "missing") group.splice(index, 1);
      if (kind === "duplicate") group.push({ ...group[index], yPosition: "500" });
      if (kind === "replace-with-unknown") group[index].tabLabel = "ELEVAY_ES_UNKNOWN";
      expect(isValidSpainSigningPlan(value)).toBe(false);
    }
  });
  it("rejects duplicate labels at unchanged counts, wrong page initials, and extra page initials", () => {
    const duplicate = plan();
    duplicate.tabs.initialHereTabs[1].tabLabel = duplicate.tabs.initialHereTabs[0].tabLabel;
    expect(isValidSpainSigningPlan(duplicate)).toBe(false);
    const wrongPage = plan();
    wrongPage.tabs.initialHereTabs[0].pageNumber = "11";
    expect(isValidSpainSigningPlan(wrongPage)).toBe(false);
    const extra = plan();
    extra.tabs.initialHereTabs.push({ ...extra.tabs.initialHereTabs[0], pageNumber: "1", tabLabel: "ELEVAY_ES_PAGE_1" });
    expect(isValidSpainSigningPlan(extra)).toBe(false);
  });

  it.each(["conditionalParentLabel", "conditionalParentValue", "conditionalParentId", "tabGroupLabels", "tabGroups", "anchorString", "unknown"])("rejects unrecognized tab key %s even when empty", key => {
    for (const group of ["signHereTabs", "initialHereTabs"]) {
      const value = plan();
      value.tabs[group][0][key] = key === "tabGroupLabels" ? [] : "";
      expect(isValidSpainSigningPlan(value)).toBe(false);
    }
  });
  it.each(["plan-extra", "plan-symbol", "tabs-extra", "tabs-missing", "array-extra", "array-symbol", "sparse", "huge-sparse", "too-many-tabs", "nonplain", "nonenumerable"])("rejects malformed metadata shape: %s", kind => {
    const value = plan();
    if (kind === "plan-extra") value.extra = undefined;
    if (kind === "plan-symbol") value[Symbol("extra")] = true;
    if (kind === "tabs-extra") value.tabs.textTabs = [];
    if (kind === "tabs-missing") delete value.tabs.initialHereTabs;
    if (kind === "array-extra") value.initialPages.extra = true;
    if (kind === "array-symbol") value.tabs.initialHereTabs[Symbol("extra")] = true;
    if (kind === "sparse") delete value.pageSizes[0];
    if (kind === "huge-sparse") value.pageSizes = new Array(1000000000);
    if (kind === "too-many-tabs") value.tabs.initialHereTabs = Array.from({ length: 101 }, () => value.tabs.initialHereTabs[0]);
    if (kind === "nonplain") Object.setPrototypeOf(value, { inherited: true });
    if (kind === "nonenumerable") Object.defineProperty(value, "pdfHash", { value: pdfHash, enumerable: false });
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it("rejects getters without invoking them, including array element getters", () => {
    for (const kind of ["plan", "tab", "array"]) {
      const value = plan();
      const getter = vi.fn(() => { throw new Error("must not execute"); });
      const target = kind === "plan" ? value : kind === "tab" ? value.tabs.signHereTabs[0] : value.pageSizes;
      const key = kind === "plan" ? "pdfHash" : kind === "tab" ? "xPosition" : "0";
      Object.defineProperty(target, key, { get: getter, enumerable: true });
      expect(isValidSpainSigningPlan(value)).toBe(false);
      expect(getter).not.toHaveBeenCalled();
    }
  });
  it.each([undefined, null, true, 1, "{}", [], new Date(), /plan/])("safely rejects non-plan input %s", input => {
    expect(isValidSpainSigningPlan(input)).toBe(false);
  });
  it("fails closed on revoked proxies without throwing", () => {
    const proxy = Proxy.revocable(plan(), {});
    proxy.revoke();
    expect(isValidSpainSigningPlan(proxy.proxy)).toBe(false);
  });

  it("rejects cross-kind signature/initial positive-area overlap", () => {
    const value = plan();
    const sign = value.tabs.signHereTabs[0];
    const clause = value.tabs.initialHereTabs.find((tab: any) => tab.tabLabel === "ELEVAY_ES_INIT_6_1_B");
    clause.pageNumber = sign.pageNumber;
    // Only one pixel of intersection: a coarse distance test would miss this.
    clause.xPosition = String(Number(sign.xPosition) + 71);
    clause.yPosition = String(Number(sign.yPosition) + 25);
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it.each(["signHereTabs", "initialHereTabs"])("rejects same-kind box overlap for %s", group => {
    const value = plan();
    if (group === "signHereTabs") {
      value.tabs.signHereTabs[2].pageNumber = "19";
      value.tabs.signHereTabs[2].yPosition = "200";
      value.fullSignaturePages = [1, 16, 19];
      value.initialPages = value.initialPages.concat(18).sort((a: number, b: number) => a - b);
      value.tabs.initialHereTabs.push({
        ...value.tabs.initialHereTabs[0], pageNumber: "18", tabLabel: "ELEVAY_ES_PAGE_18",
      });
    }
    expect(isValidSpainSigningPlan(value)).toBe(true);
    const candidates = group === "signHereTabs" ? value.tabs.signHereTabs.slice(2)
      : value.tabs.initialHereTabs.filter((tab: any) => tab.tabLabel.startsWith("ELEVAY_ES_INIT_"));
    const [a, b] = candidates;
    b.pageNumber = a.pageNumber;
    b.xPosition = a.xPosition;
    b.yPosition = a.yPosition;
    expect(isValidSpainSigningPlan(value)).toBe(false);
  });
  it.each(["horizontal", "vertical"])("allows cross-kind boxes touching only a %s edge", direction => {
    const value = plan();
    const sign = value.tabs.signHereTabs[0];
    const clause = value.tabs.initialHereTabs.find((tab: any) => tab.tabLabel === "ELEVAY_ES_INIT_6_1_B");
    clause.pageNumber = sign.pageNumber;
    clause.xPosition = String(Number(sign.xPosition) + (direction === "horizontal" ? 100 : 0));
    clause.yPosition = String(Number(sign.yPosition) + (direction === "vertical" ? 36 : 0));
    expect(isValidSpainSigningPlan(value)).toBe(true);
  });
});

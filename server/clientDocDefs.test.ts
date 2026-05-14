/**
 * Unit tests for clientDocDefs.ts:
 * - getDocChecklist with children age ranges
 * - getArabicDocName for per-child doc keys
 */
import { describe, it, expect } from "vitest";
import { getDocChecklist, getArabicDocName } from "../shared/clientDocDefs";

describe("getDocChecklist — children logic", () => {
  it("single applicant has no family or child docs", () => {
    const docs = getDocChecklist("freelancer", "single", []);
    expect(docs.every(d => d.category === "main")).toBe(true);
    expect(docs.some(d => d.docKey.startsWith("child_"))).toBe(false);
  });

  it("family with no children has base family docs but no child docs", () => {
    const docs = getDocChecklist("freelancer", "family", []);
    expect(docs.some(d => d.docKey === "family_passports")).toBe(true);
    expect(docs.some(d => d.docKey.startsWith("child_"))).toBe(false);
  });

  it("child aged 0-17 adds birth certificate only", () => {
    const docs = getDocChecklist("freelancer", "family", [{ ageRange: "0-17" }]);
    const childDocs = docs.filter(d => d.docKey.startsWith("child_1_"));
    expect(childDocs).toHaveLength(1);
    expect(childDocs[0].docKey).toBe("child_1_birth_certificate");
  });

  it("child aged 18-26 adds police certificate + education enrollment + single record", () => {
    const docs = getDocChecklist("freelancer", "family", [{ ageRange: "18-26" }]);
    const childDocs = docs.filter(d => d.docKey.startsWith("child_1_"));
    expect(childDocs).toHaveLength(3);
    const keys = childDocs.map(d => d.docKey);
    expect(keys).toContain("child_1_police_certificate");
    expect(keys).toContain("child_1_education_enrollment");
    expect(keys).toContain("child_1_single_record");
  });

  it("multiple children get separate numbered doc keys", () => {
    const docs = getDocChecklist("business_owner", "family", [
      { ageRange: "0-17" },
      { ageRange: "18-26" },
    ]);
    expect(docs.some(d => d.docKey === "child_1_birth_certificate")).toBe(true);
    expect(docs.some(d => d.docKey === "child_2_police_certificate")).toBe(true);
    expect(docs.some(d => d.docKey === "child_2_education_enrollment")).toBe(true);
    expect(docs.some(d => d.docKey === "child_2_single_record")).toBe(true);
  });

  it("birth certificate requires MOFA and Embassy attestation", () => {
    const docs = getDocChecklist("freelancer", "family", [{ ageRange: "0-17" }]);
    const birthDoc = docs.find(d => d.docKey === "child_1_birth_certificate");
    expect(birthDoc?.requiresMofa).toBe(true);
    expect(birthDoc?.requiresEmbassy).toBe(true);
  });

  it("business_owner and freelancer produce same child docs", () => {
    const freelancerDocs = getDocChecklist("freelancer", "family", [{ ageRange: "0-17" }]);
    const businessDocs = getDocChecklist("business_owner", "family", [{ ageRange: "0-17" }]);
    const fChildKeys = freelancerDocs.filter(d => d.docKey.startsWith("child_")).map(d => d.docKey);
    const bChildKeys = businessDocs.filter(d => d.docKey.startsWith("child_")).map(d => d.docKey);
    expect(fChildKeys).toEqual(bChildKeys);
  });
});

describe("getArabicDocName", () => {
  it("returns Arabic name for known static keys", () => {
    expect(getArabicDocName("passport_main", "Passport")).toBe("جواز سفر مقدم الطلب الرئيسي");
    expect(getArabicDocName("bank_statement", "Bank Statement")).toBe("كشف حساب بنكي");
  });

  it("returns Arabic name for child birth certificate key", () => {
    expect(getArabicDocName("child_1_birth_certificate", "Child 1 — Birth Certificate"))
      .toBe("الطفل 1 — شهادة الميلاد");
  });

  it("returns Arabic name for child police certificate key", () => {
    expect(getArabicDocName("child_2_police_certificate", "Child 2 — Police Certificate"))
      .toBe("الطفل 2 — شهادة حسن السيرة والسلوك");
  });

  it("returns Arabic name for child education enrollment key", () => {
    expect(getArabicDocName("child_3_education_enrollment", "Child 3 — Education Enrollment"))
      .toBe("الطفل 3 — قيد التعليم");
  });

  it("returns Arabic name for child single record key", () => {
    expect(getArabicDocName("child_1_single_record", "Child 1 — Single Record"))
      .toBe("الطفل 1 — وثيقة العزوبية");
  });

  it("falls back to English name for unknown keys", () => {
    expect(getArabicDocName("unknown_doc_xyz", "Unknown Document")).toBe("Unknown Document");
  });
});

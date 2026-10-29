import { describe, expect, it } from "vitest";
import { hasReadySummaryForProgram, parseReadySummaryIdentity, publicReadySummaryFromRecord } from "./publicProgramReadySummaries";

describe("public Ready Summary programme adapter", () => {
  it("keeps route variants distinct while normalizing country names", () => {
    expect(parseReadySummaryIdentity("Elevay Portugal D7 Summary - English", "Elevay_Portugal_D7_Summary.pdf", "Residency")).toEqual({
      country: "Portugal",
      nameEn: "Portugal D7",
      category: "residency",
    });
    expect(parseReadySummaryIdentity("Elevay St Kitts Nevis Summary - English", "Elevay_St_Kitts_Nevis_Summary.pdf", "Citizenship")).toMatchObject({
      country: "Saint Kitts & Nevis",
      category: "citizenship",
    });
  });

  it("ignores non-public Ready Summary categories", () => {
    expect(parseReadySummaryIdentity("Internal operating guide", "internal.pdf", "Other")).toBeNull();
  });

  it("returns complete extracted text and a stable public id without leaking storage keys", () => {
    const payload = publicReadySummaryFromRecord(
      { id: 30013, title: "Elevay Portugal D7 Summary - English", category: "Residency", originalFileName: "Elevay_Portugal_D7_Summary.pdf", createdAt: 1793264143867 },
      "Overview\n\nInvestment options\nD7 route",
      "https://files.example.test/ready-summary.pdf",
      { imageUrl: "https://files.example.test/portugal.jpg", sourceUrl: "https://elevay.com/portugal/", details: null },
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30013",
      slug: "ready-summary-30013",
      nameEn: "Portugal D7",
      country: "Portugal",
      readySummaryTextEn: "Overview\n\nInvestment options\nD7 route",
      readySummaryPdfUrl: "https://files.example.test/ready-summary.pdf",
    });
    expect(JSON.stringify(payload)).not.toContain("storageKey");
  });

  it("treats an active Ready Summary as coverage for the legacy country row", () => {
    expect(hasReadySummaryForProgram(
      { country: "Portugal", category: "residency" },
      [{ country: "Portugal", category: "residency" }],
    )).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { buildPublicProgramInformation, parseReadySummaryIdentity, publicReadySummaryFromRecord } from "./publicProgramReadySummaries";

const SAMPLE_D7_SUMMARY = `R E S I D E N C Y P R O G R A M M E
PORTUGAL
D7 RESIDENCE VISA
C O U N T R Y S U M M A R Y
www.elevay.com

-- 1 of 3 --

E X P A N D I N G Y O U R F R E E D O M
P R O G R A M M E O V E R V I E W
Portugal D7 Residence Visa
The D7 is a Portuguese residence route for people who can show a regular pension or income from property, intellectual property or financial assets.
11,040 EUR a year for one adult.
W H O C A N B E I N C L U D E D
Spouse and dependent children.
Sources: internal source list
ELEVAY | CITIZENSHIP + RESIDENCY PLANNING · PORTUGAL D7 VISA PAGE 2

-- 2 of 3 --

I N C O M E R E Q U I R E M E N T
Income to show for the D7
First adult (main applicant) EUR 11,040.
Couple EUR 16,560.
Couple plus one child EUR 19,872.
Sources: internal source list
`;

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

  it("projects only cleaned programme information, with source labels and PDF actions removed", () => {
    const information = buildPublicProgramInformation(SAMPLE_D7_SUMMARY);
    expect(information?.summaryEn).toContain("Portuguese residence route");
    expect(information?.details["Income Requirement"]).toContain("Couple plus one child EUR 19,872.");
    expect(information?.details["Family-size scope for figures"]).toContain("family composition stated beside that figure");
    expect(JSON.stringify(information)).not.toMatch(/sources:|elevay\.com|ready summary|\.pdf/i);
  });

  it("marks an absent stay rule as not stated rather than inventing one", () => {
    const information = buildPublicProgramInformation(`PROGRAMME OVERVIEW\nExample programme\nA factual description.\nSources: list`);
    expect(information?.details["Stay requirement"]).toBe("Not stated in the programme information.");
  });

  it("returns stable public programme fields without leaking summary, PDF, or storage metadata", () => {
    const payload = publicReadySummaryFromRecord(
      { id: 30013, title: "Elevay Portugal D7 Summary - English", category: "Residency", originalFileName: "Elevay_Portugal_D7_Summary.pdf", createdAt: 1793264143867 },
      SAMPLE_D7_SUMMARY,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30013",
      slug: "ready-summary-30013",
      nameEn: "Portugal D7",
      country: "Portugal",
      readySummaryTextEn: null,
      readySummaryPdfUrl: null,
      readySummaryTitle: null,
    });
    expect(payload?.details["Income Requirement"]).toContain("Couple EUR 16,560.");
    expect(JSON.stringify(payload)).not.toMatch(/storageKey|ready summary|\.pdf/i);
  });
});

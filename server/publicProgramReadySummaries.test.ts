import { describe, expect, it } from "vitest";
import { buildPublicProgramInformation, parseProgrammeContent, parseReadySummaryIdentity, publicReadySummaryFromRecord } from "./publicProgramReadySummaries";

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

  it("serves Antigua using all nine owner-provided bilingual sections without the previous structured facts", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30002,
        title: "Elevay Antigua Barbuda Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Antigua_Barbuda_Summary.pdf",
        createdAt: 1793263017260,
      },
      null,
    );
    expect(payload?.publicId).toBe("ready-summary-antigua-barbuda");
    expect(payload?.nameEn).toBe("Antigua & Barbuda");
    expect(payload?.nameAr).toBe("أنتيغوا وبربودا");
    expect(payload?.summaryEn).toBeNull();
    expect(payload?.summaryAr).toBeNull();
    expect(payload?.details).toEqual({});
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "1. Program Overview",
      "2. Who Can Be Included",
      "3. Investment Routes",
      "4. Contribution Options",
      "5. Government Processing Fees",
      "6. Due Diligence Fees",
      "7. Country at a Glance",
      "8. Passport Access",
      "9. About Elevay",
    ]);
    expect(payload?.programmeSections?.ar.map(section => section.heading)).toEqual([
      "1. نظرة عامة على البرنامج",
      "2. الأشخاص الذين يمكن إدراجهم في الطلب",
      "3. مسارات الاستثمار",
      "4. خيارات المساهمة المالية",
      "5. رسوم المعالجة الحكومية",
      "6. رسوم التدقيق والتحقق الأمني",
      "7. لمحة عن الدولة",
      "8. إمكانية السفر بجواز السفر",
      "9. عن إيليفاي",
    ]);
    const investmentTable = payload?.programmeSections?.en[2]?.blocks.find(block => block.type === "table");
    expect(investmentTable).toEqual({
      type: "table",
      headers: ["Route", "Minimum investment", "Holding period"],
      rows: [
        ["Option 1: National Development Fund (NDF)", "US$230,000 per application", "N/A"],
        ["Option 2: University of the West Indies (UWI) Fund", "US$260,000 (minimum of six persons per application)", "N/A"],
        ["Option 3: Approved real estate", "US$300,000", "5 years"],
        ["Option 4: Approved business investment", "US$1,500,000, or US$5,000,000 jointly (each investor at least US$400,000)", "Not stated by the CIU"],
      ],
    });
    const passportTable = payload?.programmeSections?.en[7]?.blocks.find(block => block.type === "table" && "cellLinks" in block);
    expect(passportTable?.type).toBe("table");
    expect(passportTable && "cellLinks" in passportTable ? passportTable.cellLinks?.[0]?.[1] : undefined)
      .toEqual([{ label: "https://www.passportindex.org/passport/antigua-and-barbuda/", url: "https://www.passportindex.org/passport/antigua-and-barbuda/" }]);
    const renderedContent = JSON.stringify(payload?.programmeSections);
    expect(renderedContent).toContain("Typical time to citizenship");
    expect(renderedContent).toContain("تتولى وحدة الجنسية عن طريق الاستثمار (CIU) إدارة البرنامج.");
    expect(renderedContent).toContain("Passport Index");
    expect(renderedContent).toContain("https://www.passportindex.org/passport/antigua-and-barbuda/");
    expect(renderedContent).toContain("https://www.henleyglobal.com/passport-index/ranking");
    expect(renderedContent).toContain("https://cip.gov.ag");
    expect(renderedContent).toContain("https://www.elevay.com");
    expect(renderedContent).not.toMatch(/3-6 months|150\+|US\$100,000|previous(?:ly)? added|ready summary PDF/i);
    expect(payload?.readySummaryPdfUrl).toBeNull();
  });

  it("renders authored Markdown tables and normalizes only formatting, not the cell text", () => {
    const content = parseProgrammeContent("## Section\n\n| Field | Value |\n|---|---|\n| Cost | **US$10,000** |\n\nA [programme link](https://example.test) is provided.");
    expect(content).toEqual([{
      heading: "Section",
      blocks: [
        { type: "table", headers: ["Field", "Value"], rows: [["Cost", "US$10,000"]] },
        { type: "paragraph", text: "A programme link is provided.", links: [{ label: "programme link", url: "https://example.test" }] },
      ],
    }]);
  });
});

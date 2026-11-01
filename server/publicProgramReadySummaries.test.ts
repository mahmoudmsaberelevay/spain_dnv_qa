import { describe, expect, it } from "vitest";
import { buildPublicProgramInformation, parseProgrammeContent, parseReadySummaryIdentity, publicProgramLocaleFromAcceptLanguage, publicReadySummaryFromRecord } from "./publicProgramReadySummaries";

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

  it("selects a supported programme language from the highest-priority Accept-Language entry", () => {
    expect(publicProgramLocaleFromAcceptLanguage("ar-EG,ar;q=0.9,en-US;q=0.8")).toBe("ar");
    expect(publicProgramLocaleFromAcceptLanguage("en-US,en;q=0.9,ar;q=0.8")).toBe("en");
    expect(publicProgramLocaleFromAcceptLanguage("fr-FR,ar;q=0.7")).toBe("ar");
    expect(publicProgramLocaleFromAcceptLanguage(undefined)).toBe("en");
    expect(publicProgramLocaleFromAcceptLanguage(["ar;q=0.6", "en-US;q=0.4"])).toBe("ar");
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

  it("serves Antigua using all nine owner-provided bilingual sections through both current and installed-app fields", () => {
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
    expect(payload?.summaryEn).toContain("Citizenship of Antigua & Barbuda can be obtained");
    expect(payload?.summaryAr).toContain("Citizenship of Antigua & Barbuda can be obtained");
    expect(Object.keys(payload?.details ?? {})).toHaveLength(9);
    expect(payload?.details["3. Investment Routes"]).toContain("US$1,500,000");
    expect(payload?.details["3. Investment Routes"]).toContain("US$230,000");
    expect(Object.keys(payload?.details ?? {}).some(heading => heading.includes(" / "))).toBe(false);
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
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

  it("serves the latest approved St. Kitts summary through both current and installed-app fields without dropping values or links", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30001,
        title: "Elevay St Kitts Nevis Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_St_Kitts_Nevis_Summary.pdf",
        createdAt: 1793262974291,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30001",
      nameEn: "Saint Kitts & Nevis",
      nameAr: "سانت كيتس ونيفيس",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Citizenship of St. Kitts & Nevis can be obtained through a non-refundable contribution");
    expect(payload?.summaryAr).toContain("Citizenship of St. Kitts & Nevis can be obtained through a non-refundable contribution");
    expect(Object.keys(payload?.details ?? {})).toHaveLength(9);
    expect(payload?.details["3. Investment routes"]).toContain("US$250,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$10,000");
    expect(Object.keys(payload?.details ?? {}).some(heading => heading.includes(" / "))).toBe(false);
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "1. Program Overview",
      "2. Who Can be Included",
      "3. Investment routes",
      "4. Contribution options",
      "5. Government Processing fees",
      "6. Due diligence fees",
      "7. Country At glance",
      "8. Passport access",
      "9. About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    const investmentTable = payload?.programmeSections?.en[2]?.blocks.find(block => block.type === "table");
    expect(investmentTable).toEqual({
      type: "table",
      headers: ["Route", "Minimum investment", "Holding period"],
      rows: [
        ["Option 1: Sustainable Island State Contribution", "US$250,000 (main applicant, or family of up to four)", "N/A"],
        ["Option 2: Public Benefit Option", "US$250,000 (main applicant, or family of up to four)", "N/A"],
        ["Option 3: Developer real estate (approved development)", "US$325,000", "7 years"],
        ["Option 4: Private real estate", "US$325,000 (condominium or share) / US$600,000 (single-family home)", "7 years"],
      ],
    });
    const passportTable = payload?.programmeSections?.en[7]?.blocks.find(block => block.type === "table" && "cellLinks" in block);
    expect(passportTable?.type).toBe("table");
    expect(passportTable && "cellLinks" in passportTable ? passportTable.cellLinks?.[0]?.[1] : undefined)
      .toEqual([{ label: "https://www.passportindex.org/passport/saint-kitts-and-nevis/", url: "https://www.passportindex.org/passport/saint-kitts-and-nevis/" }]);
    const renderedContent = JSON.stringify(payload?.programmeSections);
    expect(renderedContent).toContain("A clean criminal record and full due diligence are required of every adult applicant.");
    expect(renderedContent).toContain("US$10,000");
    expect(renderedContent).toContain("148");
    expect(renderedContent).toContain("يمكن الحصول على جنسية سانت كيتس ونيفيس");
    expect(renderedContent).toContain("https://www.henleyglobal.com/passport-index/ranking");
  });

  it("serves the latest approved Dominica summary through all nine source-only sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30005,
        title: "Elevay Dominica Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Dominica_Summary.pdf",
        createdAt: 1793263299037,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30005",
      slug: "ready-summary-30005",
      nameEn: "Dominica",
      nameAr: "دومينيكا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Citizenship of Dominica can be obtained through a contribution to the Economic Diversification Fund");
    expect(payload?.summaryAr).toContain("Citizenship of Dominica can be obtained through a contribution to the Economic Diversification Fund");
    expect(Object.keys(payload?.details ?? {})).toHaveLength(9);
    expect(payload?.details["3. Investment routes"]).toContain("US$250,000 (main applicant plus up to three dependants)");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$100,000");
    expect(payload?.details["6. Due diligence fees"]).toContain("US$7,500");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 135");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "1. Program Overview",
      "2. Who Can be Included",
      "3. Investment routes",
      "4. Contribution options",
      "5. Government Processing fees",
      "6. Due diligence fees",
      "7. Country At glance",
      "8. Passport access",
      "9. About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    const investmentTable = payload?.programmeSections?.en[2]?.blocks.find(block => block.type === "table");
    expect(investmentTable).toEqual({
      type: "table",
      headers: ["Route", "Minimum investment", "Holding period"],
      rows: [
        ["Economic Diversification Fund (EDF)", "US$200,000 (single) or US$250,000 (main applicant plus up to three dependants)", "N/A"],
        ["Approved real estate", "US$200,000, plus government fees from US$75,000", "3 or 5 years"],
      ],
    });
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/dominica/");
  });

  it("returns Arabic-only Dominica legacy details when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30005,
        title: "Elevay Dominica Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Dominica_Summary.pdf",
        createdAt: 1793263299037,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يمكن الحصول على مواطنة دومينيكا");
    expect(payload?.summaryAr).toContain("يمكن الحصول على مواطنة دومينيكا");
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("US$250,000");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(Object.keys(payload?.details ?? {}).some(heading => heading.includes(" / "))).toBe(false);
    expect(JSON.stringify(payload?.details)).not.toContain("Economic Diversification Fund");
  });

  it("returns Arabic-only legacy detail headings and text when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30001,
        title: "Elevay St Kitts Nevis Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_St_Kitts_Nevis_Summary.pdf",
        createdAt: 1793262974291,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يمكن الحصول على جنسية سانت كيتس ونيفيس");
    expect(payload?.summaryAr).toContain("يمكن الحصول على جنسية سانت كيتس ونيفيس");
    expect(payload?.summaryEn).not.toContain("Citizenship of St. Kitts");
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("US$250,000");
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("مساهمة الدولة الجزرية المستدامة");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(Object.keys(payload?.details ?? {}).some(heading => heading.includes(" / "))).toBe(false);
    expect(JSON.stringify(payload?.details)).not.toContain("Sustainable Island State Contribution");
    expect(payload?.programmeSections?.en).toHaveLength(9);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("also returns Arabic-only Antigua legacy detail headings when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30002,
        title: "Elevay Antigua Barbuda Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Antigua_Barbuda_Summary.pdf",
        createdAt: 1793263017260,
      },
      null,
      "ar",
    );
    expect(payload?.details["3. مسارات الاستثمار"]).toBeTruthy();
    expect(payload?.details["3. Investment Routes"]).toBeUndefined();
    expect(Object.keys(payload?.details ?? {}).some(heading => heading.includes(" / "))).toBe(false);
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

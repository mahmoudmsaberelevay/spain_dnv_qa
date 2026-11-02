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

  it("returns stable public D7 fields without leaking summary, PDF, or storage metadata", () => {
    const payload = publicReadySummaryFromRecord(
      { id: 30013, title: "Elevay Portugal D7 Summary - English", category: "Residency", originalFileName: "Elevay_Portugal_D7_Summary.pdf", createdAt: 1793264143867 },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30013",
      slug: "ready-summary-30013",
      nameEn: "Portugal D7 Residence Visa",
      country: "Portugal",
      readySummaryTextEn: null,
      readySummaryPdfUrl: null,
      readySummaryTitle: null,
    });
    expect(payload?.details["Program Overview"]).toContain("No fixed D7 amount is published");
    expect(payload?.details["Investment routes"]).toBe("Not required");
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

  it("serves the active Grenada summary through nine source-only bilingual sections and existing-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30003,
        title: "Elevay Grenada Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Grenada_Summary.pdf",
        createdAt: 1793263059957,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30003",
      slug: "ready-summary-30003",
      nameEn: "Grenada",
      nameAr: "غرينادا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Citizenship of Grenada can be obtained through a contribution");
    expect(payload?.summaryAr).toContain("Citizenship of Grenada can be obtained through a contribution");
    expect(Object.keys(payload?.details ?? {})).toHaveLength(9);
    expect(payload?.details["3. Investment routes"]).toContain("US$235,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$1,500 per person");
    expect(payload?.details["6. Due diligence fees"]).toContain("US$5,000 per person");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 139");
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
        ["Option 1: National Transformation Fund (NTF)", "US$235,000 (main applicant plus up to three dependants)", "N/A"],
        ["Option 2: Approved real estate (single owner)", "US$350,000, plus a US$50,000 government contribution", "5 years"],
        ["Option 3: Approved real estate (shared tourism accommodation unit)", "US$270,000 per share, plus a US$50,000 government contribution", "5 years"],
      ],
    });
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/grenada/");
  });

  it("returns Arabic-only Grenada legacy details when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30003,
        title: "Elevay Grenada Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Grenada_Summary.pdf",
        createdAt: 1793263059957,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يمكن الحصول على جنسية غرينادا");
    expect(payload?.summaryAr).toContain("يمكن الحصول على جنسية غرينادا");
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("235,000");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(Object.keys(payload?.details ?? {})).toHaveLength(9);
    expect(JSON.stringify(payload?.details)).not.toContain("National Transformation Fund");
  });

  it("serves the latest Egypt Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30006,
        title: "Elevay Egypt Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Egypt_Summary.pdf",
        createdAt: 1793263680359,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30006",
      slug: "ready-summary-30006",
      nameEn: "Egypt",
      nameAr: "مصر",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Egyptian citizenship can be granted by the Prime Minister");
    expect(Object.keys(payload?.details ?? {})).toHaveLength(9);
    expect(payload?.details["3. Investment routes"]).toContain("US$300,000");
    expect(payload?.details["3. Investment routes"]).toContain("US$500,000");
    expect(payload?.details["4. Contribution options"]).toContain("US$100,000 donation");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$10,000");
    expect(payload?.details["6. Due diligence fees"]).toBe("Not required");
    expect(payload?.details["7. Country At glance"]).toContain("118,365,995");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 61");
    expect(payload?.details["9. About Elevay"]).toContain("T +20 128 498 1717");
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
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/egypt/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("118,365,995");
  });

  it("returns Arabic-only Egypt legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30006,
        title: "Elevay Egypt Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Egypt_Summary.pdf",
        createdAt: 1793263680359,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يمكن لرئيس مجلس الوزراء منح الجنسية المصرية");
    expect(payload?.summaryAr).toContain("يمكن لرئيس مجلس الوزراء منح الجنسية المصرية");
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("US$500,000");
    expect(payload?.details["5. رسوم المعالجة الحكومية"]).toContain("US$10,000");
    expect(payload?.details["6. رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(Object.keys(payload?.details ?? {})).toHaveLength(9);
    expect(JSON.stringify(payload?.details)).not.toContain("Property purchase");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Türkiye Ready Summary through nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30010,
        title: "Elevay Turkiye Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Turkiye_Summary.pdf",
        createdAt: 1793264003167,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30010",
      slug: "ready-summary-30010",
      nameEn: "Türkiye",
      nameAr: "تركيا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("A qualifying investment in Türkiye allows an investor to apply for Turkish citizenship.");
    expect(Object.keys(payload?.details ?? {})).toEqual([
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
    expect(payload?.details["3. Investment routes"]).toContain("US$400,000");
    expect(payload?.details["3. Investment routes"]).toContain("US$500,000");
    expect(payload?.details["3. Investment routes"]).toContain("NVIGM");
    expect(payload?.details["4. Contribution options"]).toBe("Not required");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$1,000 per person");
    expect(payload?.details["6. Due diligence fees"]).toBe("Not required");
    expect(payload?.details["7. Country At glance"]).toContain("85,878,556");
    expect(payload?.details["7. Country At glance"]).toContain("US$18,599");
    expect(payload?.details["8. Passport access"]).toContain("Visa-free destinations | 71");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 121");
    expect(payload?.details["9. About Elevay"]).toContain("T +20 128 498 1717");
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
    expect(payload?.programmeSections?.ar.map(section => section.heading)).toHaveLength(9);
    const routes = payload?.programmeSections?.en[2]?.blocks.find(block => block.type === "table");
    expect(routes?.type === "table" ? routes.rows : []).toHaveLength(5);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/turkey/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("The President decides on the application. Approval is not guaranteed.");
  });

  it("returns Arabic-only Türkiye legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30010,
        title: "Elevay Turkiye Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Turkiye_Summary.pdf",
        createdAt: 1793264003167,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يتيح الاستثمار المؤهل في تركيا");
    expect(payload?.summaryAr).toContain("يتيح الاستثمار المؤهل في تركيا");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "1. نظرة عامة على البرنامج",
      "2. الأشخاص الذين يمكن إدراجهم في الطلب",
      "3. مسارات الاستثمار",
      "4. خيارات المساهمة",
      "5. رسوم المعالجة الحكومية",
      "6. رسوم العناية الواجبة",
      "7. لمحة عن الدولة",
      "8. إمكانية السفر بجواز السفر",
      "9. عن إيليفاي",
    ]);
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("500,000 دولار أمريكي");
    expect(payload?.details["4. خيارات المساهمة"]).toBe("غير مطلوب");
    expect(payload?.details["6. رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["8. إمكانية السفر بجواز السفر"]).toContain("الإجمالي بما في ذلك تصريح السفر الإلكتروني | 121");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("Fixed capital investment");
    expect(JSON.stringify(payload?.details)).not.toContain("Bank deposit");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Naoero/Nauru Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30008,
        title: "Elevay Naoero Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Naoero_Summary.pdf",
        createdAt: 1793263909404,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30008",
      slug: "ready-summary-30008",
      nameEn: "Nauru",
      nameAr: "ناورو",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("The Naoero Economic and Climate Resilience Citizenship Program (ECRCP)");
    expect(Object.keys(payload?.details ?? {})).toEqual([
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
    expect(payload?.details["2. Who Can be Included"]).toContain("Siblings of the main applicant or of the spouse");
    expect(payload?.details["3. Investment routes"]).toContain("One route is offered");
    expect(payload?.details["4. Contribution options"]).toContain("US$90,000 until 31 December 2026");
    expect(payload?.details["4. Contribution options"]).toContain("US$115,000 from 1 January 2027");
    expect(payload?.details["4. Contribution options"]).toContain("US$15,000 each");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$5,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$2,000 each eligible dependant");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$500 per passport");
    expect(payload?.details["6. Due diligence fees"]).toContain("US$6,000");
    expect(payload?.details["6. Due diligence fees"]).toContain("US$3,000 each dependant aged 16 and above");
    expect(payload?.details["6. Due diligence fees"]).toContain("US$2,200");
    expect(payload?.details["7. Country At glance"]).toContain("12,025");
    expect(payload?.details["7. Country At glance"]).toContain("US$14,640");
    expect(payload?.details["8. Passport access"]).toContain("Visa-free destinations | 42");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 87");
    expect(payload?.details["9. About Elevay"]).toContain("T +94 77 246 8516");
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
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/nauru/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.ecrcp.gov.nr");
  });

  it("returns Arabic-only Nauru legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30008,
        title: "Elevay Naoero Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Naoero_Summary.pdf",
        createdAt: 1793263909404,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يمنح برنامج ناورو للمواطنة");
    expect(payload?.summaryAr).toContain("يمنح برنامج ناورو للمواطنة");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "1. نظرة عامة على البرنامج",
      "2. الأشخاص الذين يمكن إدراجهم في الطلب",
      "3. مسارات الاستثمار",
      "4. خيارات المساهمة",
      "5. رسوم المعالجة الحكومية",
      "6. رسوم العناية الواجبة",
      "7. لمحة عن الدولة",
      "8. إمكانية السفر بجواز السفر",
      "9. عن إيليفاي",
    ]);
    expect(payload?.details["4. خيارات المساهمة"]).toContain("115,000 دولار أمريكي");
    expect(payload?.details["5. رسوم المعالجة الحكومية"]).toContain("5,000 دولار أمريكي");
    expect(payload?.details["6. رسوم العناية الواجبة"]).toContain("2,200 دولار أمريكي");
    expect(payload?.details["8. إمكانية السفر بجواز السفر"]).toContain("الإجمالي بما في ذلك تصريح السفر الإلكتروني | 87");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("One route is offered");
    expect(JSON.stringify(payload?.details)).not.toContain("Application fee");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Saint Lucia Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30004,
        title: "Elevay Saint Lucia Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Saint_Lucia_Summary.pdf",
        createdAt: 1793263210068,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30004",
      slug: "ready-summary-30004",
      nameEn: "Saint Lucia",
      nameAr: "سانت لوسيا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Citizenship of Saint Lucia can be obtained");
    expect(Object.keys(payload?.details ?? {})).toEqual([
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
    expect(payload?.details["2. Who Can be Included"]).toContain("Children aged 21 or under");
    expect(payload?.details["2. Who Can be Included"]).toContain("Unmarried siblings under 18");
    expect(payload?.details["3. Investment routes"]).toContain("National Economic Fund (NEF)");
    expect(payload?.details["3. Investment routes"]).toContain("US$240,000");
    expect(payload?.details["3. Investment routes"]).toContain("US$50,000");
    expect(payload?.details["3. Investment routes"]).toContain("US$3,500,000");
    expect(payload?.details["4. Contribution options"]).toContain("US$10,000 each");
    expect(payload?.details["4. Contribution options"]).toContain("US$35,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$2,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$300 per person");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$45,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$30,000");
    expect(payload?.details["6. Due diligence fees"]).toContain("US$8,000");
    expect(payload?.details["6. Due diligence fees"]).toContain("US$5,000");
    expect(payload?.details["7. Country At glance"]).toContain("180,149");
    expect(payload?.details["7. Country At glance"]).toContain("US$14,746");
    expect(payload?.details["7. Country At glance"]).toContain("EC$2.70");
    expect(payload?.details["8. Passport access"]).toContain("Visa-free destinations | 91");
    expect(payload?.details["8. Passport access"]).toContain("Visa-on-arrival destinations | 41");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 137");
    expect(payload?.details["9. About Elevay"]).toContain("T +20 128 498 1717");
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
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/saint-lucia/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.cipsaintlucia.com");
  });

  it("returns Arabic-only Saint Lucia legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30004,
        title: "Elevay Saint Lucia Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Saint_Lucia_Summary.pdf",
        createdAt: 1793263210068,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يمكن الحصول على جنسية سانت لوسيا");
    expect(payload?.summaryAr).toContain("يمكن الحصول على جنسية سانت لوسيا");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "1. نظرة عامة على البرنامج",
      "2. الأشخاص الذين يمكن إدراجهم في الطلب",
      "3. مسارات الاستثمار",
      "4. خيارات المساهمة",
      "5. رسوم المعالجة الحكومية",
      "6. رسوم العناية الواجبة",
      "7. لمحة عن الدولة",
      "8. إمكانية السفر بجواز السفر",
      "9. عن إيليفاي",
    ]);
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("240,000 دولار أمريكي");
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("3,500,000 دولار أمريكي");
    expect(payload?.details["4. خيارات المساهمة"]).toContain("35,000 دولار أمريكي");
    expect(payload?.details["5. رسوم المعالجة الحكومية"]).toContain("50,000 دولار أمريكي");
    expect(payload?.details["6. رسوم العناية الواجبة"]).toContain("8,000 دولار أمريكي");
    expect(payload?.details["8. إمكانية السفر بجواز السفر"]).toContain("الإجمالي بما في ذلك تصريح السفر الإلكتروني | 137");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("National Economic Fund");
    expect(JSON.stringify(payload?.details)).not.toContain("Visa-free destinations");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active São Tomé Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30009,
        title: "Elevay Sao Tome Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Sao_Tome_Summary.pdf",
        createdAt: 1793263937372,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30009",
      slug: "ready-summary-30009",
      nameEn: "São Tomé and Príncipe",
      nameAr: "ساو تومي وبرينسيب",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("São Tomé and Príncipe grants citizenship");
    expect(Object.keys(payload?.details ?? {})).toEqual([
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
    expect(payload?.details["2. Who Can be Included"]).toContain("Parents and grandparents: aged 55 and above");
    expect(payload?.details["3. Investment routes"]).toContain("One route is offered");
    expect(payload?.details["3. Investment routes"]).toContain("Nationality Law No. 07/2022");
    expect(payload?.details["4. Contribution options"]).toContain("Single applicant | US$90,000");
    expect(payload?.details["4. Contribution options"]).toContain("Family of 2 to 4 | US$95,000");
    expect(payload?.details["4. Contribution options"]).toContain("Each additional dependant | US$5,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$5,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$750");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$10,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("US$500");
    expect(payload?.details["6. Due diligence fees"]).toBe("Not required");
    expect(payload?.details["7. Country At glance"]).toContain("240,254");
    expect(payload?.details["7. Country At glance"]).toContain("US$4,084");
    expect(payload?.details["8. Passport access"]).toContain("Visa-free destinations | 27");
    expect(payload?.details["8. Passport access"]).toContain("Visa-on-arrival destinations | 39");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 70");
    expect(payload?.details["9. About Elevay"]).toContain("T +94 77 246 8516");
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
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/sao-tome-and-principe/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://cip.gov.st/");
  });

  it("returns Arabic-only São Tomé legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30009,
        title: "Elevay Sao Tome Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Sao_Tome_Summary.pdf",
        createdAt: 1793263937372,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("تمنح ساو تومي وبرينسيب الجنسية");
    expect(payload?.summaryAr).toContain("تمنح ساو تومي وبرينسيب الجنسية");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "1. نظرة عامة على البرنامج",
      "2. الأشخاص الذين يمكن إدراجهم في الطلب",
      "3. مسارات الاستثمار",
      "4. خيارات المساهمة",
      "5. رسوم المعالجة الحكومية",
      "6. رسوم العناية الواجبة",
      "7. لمحة عن الدولة",
      "8. إمكانية السفر بجواز السفر",
      "9. عن إيليفاي",
    ]);
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("90,000 دولار أمريكي");
    expect(payload?.details["4. خيارات المساهمة"]).toContain("95,000 دولار أمريكي");
    expect(payload?.details["5. رسوم المعالجة الحكومية"]).toContain("750 دولارًا أمريكيًا");
    expect(payload?.details["6. رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["8. إمكانية السفر بجواز السفر"]).toContain("الإجمالي بما في ذلك تصريح السفر الإلكتروني | 70");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("National Transformation Fund");
    expect(JSON.stringify(payload?.details)).not.toContain("Visa-free destinations");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Vanuatu Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30007,
        title: "Elevay Vanuatu Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Vanuatu_Summary.pdf",
        createdAt: 1793263793503,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30007",
      slug: "ready-summary-30007",
      nameEn: "Vanuatu",
      nameAr: "فانواتو",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Vanuatu grants honorary citizenship");
    expect(Object.keys(payload?.details ?? {})).toEqual([
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
    expect(payload?.details["2. Who Can be Included"]).toContain("Dependent children up to the age of 25");
    expect(payload?.details["2. Who Can be Included"]).toContain("aged 50 or older");
    expect(payload?.details["3. Investment routes"]).toContain("Development Support Program");
    expect(payload?.details["4. Contribution options"]).toContain("Single applicant | US$130,000");
    expect(payload?.details["4. Contribution options"]).toContain("Married couple and two children | US$180,000");
    expect(payload?.details["4. Contribution options"]).toContain("Each additional applicant | US$10,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("Passport delivery | US$5,000");
    expect(payload?.details["5. Government Processing fees"]).toContain("Provided upon request");
    expect(payload?.details["6. Due diligence fees"]).toContain("Due diligence fee (FIU) | US$5,000");
    expect(payload?.details["7. Country At glance"]).toContain("335,169");
    expect(payload?.details["7. Country At glance"]).toContain("US$4,039");
    expect(payload?.details["7. Country At glance"]).toContain("VAT | 15%");
    expect(payload?.details["8. Passport access"]).toContain("Visa-free destinations | 46");
    expect(payload?.details["8. Passport access"]).toContain("Visa-on-arrival destinations | 42");
    expect(payload?.details["8. Passport access"]).toContain("Total including eTA | 93");
    expect(payload?.details["9. About Elevay"]).toContain("T +20 128 498 1717");
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
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.passportindex.org/passport/vanuatu/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://vancitizenship.gov.vu");
  });

  it("returns Arabic-only Vanuatu legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30007,
        title: "Elevay Vanuatu Summary - English",
        category: "Citizenship",
        originalFileName: "Elevay_Vanuatu_Summary.pdf",
        createdAt: 1793263793503,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("تمنح فانواتو الجنسية الفخرية");
    expect(payload?.summaryAr).toContain("تمنح فانواتو الجنسية الفخرية");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "1. نظرة عامة على البرنامج",
      "2. الأشخاص الذين يمكن إدراجهم في الطلب",
      "3. مسارات الاستثمار",
      "4. خيارات المساهمة",
      "5. رسوم المعالجة الحكومية",
      "6. رسوم العناية الواجبة",
      "7. لمحة عن الدولة",
      "8. إمكانية السفر بجواز السفر",
      "9. عن إيليفاي",
    ]);
    expect(payload?.details["3. مسارات الاستثمار"]).toContain("برنامج دعم التنمية");
    expect(payload?.details["4. خيارات المساهمة"]).toContain("130,000 دولار أمريكي");
    expect(payload?.details["5. رسوم المعالجة الحكومية"]).toContain("5,000 دولار أمريكي");
    expect(payload?.details["6. رسوم العناية الواجبة"]).toContain("وحدة الاستخبارات المالية FIU");
    expect(payload?.details["8. إمكانية السفر بجواز السفر"]).toContain("الإجمالي بما في ذلك تصريح السفر الإلكتروني | 93");
    expect(payload?.details["3. Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("Development Support Program");
    expect(JSON.stringify(payload?.details)).not.toContain("Visa-free destinations");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Canada Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30025,
        title: "Elevay Canada Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Canada_Summary.pdf",
        createdAt: 1793264685191,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30025",
      slug: "ready-summary-30025",
      nameEn: "Canada",
      nameAr: "كندا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Five Canadian provinces run entrepreneur streams");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("Five Canadian provinces");
    expect(payload?.details["Program Overview"]).toContain("Mandatory");
    expect(payload?.details["Who Can be Included"]).toContain("common-law partner");
    expect(payload?.details["Who Can be Included"]).toContain("dependent children");
    expect(payload?.details["Investment routes"]).toContain("British Columbia Entrepreneur Immigration — Base Stream");
    expect(payload?.details["Investment routes"]).toContain("CAD 200,000");
    expect(payload?.details["Investment routes"]).toContain("Alberta Rural Entrepreneur Stream");
    expect(payload?.details["Investment routes"]).toContain("Nova Scotia Entrepreneur Stream");
    expect(payload?.details["Investment routes"]).toContain("New Brunswick Business Immigration");
    expect(payload?.details["Investment routes"]).toContain("Newfoundland and Labrador International Entrepreneur");
    expect(payload?.details["Program Overview"]).toContain("About 13 months");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("All fees shall be presented on proposal stage.");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("41,651,653");
    expect(payload?.details["Country At glance"]).toContain("US$55,698");
    expect(payload?.details["Passport access"]).toBe("Not required");
    expect(payload?.details["About Elevay"]).toContain("2,500+");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.gnb.ca/en/topic/family-home-community/immigration/provincial-nominee-program/business-immigration-stream.html");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.elevay.com");
  });

  it("returns Arabic-only Canada legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30025,
        title: "Elevay Canada Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Canada_Summary.pdf",
        createdAt: 1793264685191,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("تدير خمس مقاطعات كندية مسارات لرواد الأعمال");
    expect(payload?.summaryAr).toContain("تدير خمس مقاطعات كندية مسارات لرواد الأعمال");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.details["مسارات الاستثمار"]).toContain("بريتيش كولومبيا");
    expect(payload?.details["مسارات الاستثمار"]).toContain("200,000 دولار كندي");
    expect(payload?.details["خيارات المساهمة"]).toBe("غير مطلوب");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("غير مطلوب");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("41,651,653");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("British Columbia Entrepreneur Immigration");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Greece Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30011,
        title: "Elevay Greece Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Greece_Summary.pdf",
        createdAt: 1793264069280,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30011",
      slug: "ready-summary-30011",
      nameEn: "Greece",
      nameAr: "اليونان",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("A qualifying investment in Greece can lead to a Greek residence permit");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("5–6 months");
    expect(payload?.details["Program Overview"]).toContain("EUR 100,000 per tax year");
    expect(payload?.details["Program Overview"]).toContain("not individual tax advice");
    expect(payload?.details["Who Can be Included"]).toContain("EUR 100 per person");
    expect(payload?.details["Investment routes"]).toContain("EUR 800,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 400,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 250,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 500,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 350,000");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 2,016");
    expect(payload?.details["Government Processing fees"]).toContain("About 3.09%");
    expect(payload?.details["Government Processing fees"]).toContain("15%");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("10,413,962");
    expect(payload?.details["Country At glance"]).toContain("US$26,948");
    expect(payload?.details["Passport access"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toContain("Iceland");
    expect(payload?.details["Passport access"]).toContain("Elevay does not guarantee the accuracy");
    expect(payload?.details["About Elevay"]).toContain("28+");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://stegasi.gov.gr/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.elevay.com");
  });

  it("returns Arabic-only Greece legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30011,
        title: "Elevay Greece Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Greece_Summary.pdf",
        createdAt: 1793264069280,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("يمكن أن يؤدي الاستثمار المؤهل في اليونان");
    expect(payload?.summaryAr).toContain("يمكن أن يؤدي الاستثمار المؤهل في اليونان");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.details["مسارات الاستثمار"]).toContain("800,000 يورو");
    expect(payload?.details["مسارات الاستثمار"]).toContain("350,000 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("2,016 يورو");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("29 دولة");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("Greek-market listed shares");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Hungary Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30016,
        title: "Elevay Hungary Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Hungary_Summary.pdf",
        createdAt: 1793264235803,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30016",
      slug: "ready-summary-30016",
      nameEn: "Hungary",
      nameAr: "المجر",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("The Hungary Guest Investor Residence Permit is a residence permit under Act XC of 2023");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("Programme status: OPEN");
    expect(payload?.details["Program Overview"]).toContain("EUR 250,000");
    expect(payload?.details["Program Overview"]).toContain("EUR 1,000,000");
    expect(payload?.details["Program Overview"]).toContain("21 days");
    expect(payload?.details["Program Overview"]).toContain("does not give Hungarian or European Union citizenship");
    expect(payload?.details["Program Overview"]).toContain("The Act sets no minimum stay requirement");
    expect(payload?.details["Who Can be Included"]).toContain("joint minor children, including adopted and foster children");
    expect(payload?.details["Who Can be Included"]).toContain("Adult children and parents are not listed in the Act");
    expect(payload?.details["Investment routes"]).toContain("at least 40% of its net assets");
    expect(payload?.details["Investment routes"]).toContain("securities sub-account that is blocked for 5 years");
    expect(payload?.details["Investment routes"]).toContain("does not require a further investment");
    expect(payload?.details["Contribution options"]).toContain("At least EUR 1,000,000");
    expect(payload?.details["Government Processing fees"]).toContain("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("All fees shall be presented on proposal stage");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("9,539,502");
    expect(payload?.details["Country At glance"]).toContain("EUR 29,400");
    expect(payload?.details["Country At glance"]).toContain("21 December 2007");
    expect(payload?.details["Passport access"]).toBe("Not required");
    expect(payload?.details["About Elevay"]).toContain("28+");
    expect(payload?.details["About Elevay"]).toContain("not legal, tax or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://njt.jog.gov.hu/jogszabaly/2023-90-00-00");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://oif.gov.hu/factsheets/residence-permit-for-guest-investor");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.elevay.com");
  });

  it("returns Arabic-only Hungary legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30016,
        title: "Elevay Hungary Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Hungary_Summary.pdf",
        createdAt: 1793264235803,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("تصريح الإقامة للمستثمر الضيف في المجر هو تصريح إقامة");
    expect(payload?.summaryAr).toContain("تصريح الإقامة للمستثمر الضيف في المجر هو تصريح إقامة");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.details["مسارات الاستثمار"]).toContain("250,000 يورو");
    expect(payload?.details["مسارات الاستثمار"]).toContain("1,000,000 يورو");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("الأبناء القاصرون المشتركون للزوجين");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("تُعرض جميع الرسوم في مرحلة تقديم العرض");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("9,539,502");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("real estate fund");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
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

  it("serves the latest active Latvia Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30024,
        title: "Elevay Latvia Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Latvia_Summary.pdf",
        createdAt: 1793264617015,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30024",
      slug: "ready-summary-30024",
      nameEn: "Latvia",
      nameAr: "لاتفيا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("Latvia offers a temporary residence permit to foreign investors");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("Programme status: OPEN");
    expect(payload?.details["Program Overview"]).toContain("in force since 15 September 2026");
    expect(payload?.details["Program Overview"]).toContain("Nothing in this summary guarantees that an application will be approved or renewed");
    expect(payload?.details["Who Can be Included"]).toContain("The investor’s spouse");
    expect(payload?.details["Who Can be Included"]).toContain("Persons under the investor’s curatorship");
    expect(payload?.details["Investment routes"]).toContain("EUR 50,000 in share capital");
    expect(payload?.details["Investment routes"]).toContain("EUR 100,000 in share capital");
    expect(payload?.details["Investment routes"]).toContain("Up to 10 foreigners per company on this tier");
    expect(payload?.details["Investment routes"]).toContain("EUR 40,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 100,000 taxes a year");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 10,000");
    expect(payload?.details["Government Processing fees"]).toContain("not an Elevay fee");
    expect(payload?.details["Government Processing fees"]).toContain("All fees shall be presented on proposal stage");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("64,594 km2");
    expect(payload?.details["Country At glance"]).toContain("1,845,096");
    expect(payload?.details["Country At glance"]).toContain("EUR 29,500");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toBe("Not required");
    expect(payload?.details["About Elevay"]).toContain("28+");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(payload?.details["About Elevay"]).toContain("not legal, tax or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://likumi.lv/ta/id/370622-imigracijas-likums");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.pmlp.gov.lv/en/article/new-immigration-law-takes-effect-key-changes-and-regulations");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.elevay.com");
  });

  it("returns Arabic-only Latvia legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30024,
        title: "Elevay Latvia Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Latvia_Summary.pdf",
        createdAt: 1793264617015,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("تمنح لاتفيا تصريح إقامة مؤقتًا للمستثمرين الأجانب");
    expect(payload?.summaryAr).toContain("تمنح لاتفيا تصريح إقامة مؤقتًا للمستثمرين الأجانب");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.details["مسارات الاستثمار"]).toContain("50,000 يورو");
    expect(payload?.details["مسارات الاستثمار"]).toContain("100,000 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("10,000 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("ليست رسمًا تتقاضاه إيليفاي");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("1,845,096");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("share capital");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Malta MPRP Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30019,
        title: "Elevay Malta MPRP Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Malta_MPRP_Summary.pdf",
        createdAt: 1793264333179,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30019",
      slug: "ready-summary-30019",
      nameEn: "Malta",
      nameAr: "مالطا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("The Malta Permanent Residence Programme (MPRP) is a Maltese residence programme");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("non-European Economic Area (EEA) and non-Swiss nationals");
    expect(payload?.details["Program Overview"]).toContain("90 days in any 180-day period");
    expect(payload?.details["Program Overview"]).toContain("6 to 9 months");
    expect(payload?.details["Program Overview"]).toContain("does not give citizenship by itself");
    expect(payload?.details["Program Overview"]).toContain("The MPRP regulations set no minimum number of days a year in Malta");
    expect(payload?.details["Program Overview"]).toContain("at least 4 years in the 6 years before that");
    expect(payload?.details["Who Can be Included"]).toContain("Children aged 18 to 28 who are unmarried");
    expect(payload?.details["Who Can be Included"]).toContain("up to four generations");
    expect(payload?.details["Who Can be Included"]).toContain("Stable and regular resources");
    expect(payload?.details["Investment routes"]).toContain("EUR 14,000 a year");
    expect(payload?.details["Investment routes"]).toContain("EUR 375,000");
    expect(payload?.details["Investment routes"]).toContain("at least EUR 500,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 150,000");
    expect(payload?.details["Investment routes"]).toContain("at least EUR 650,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 75,000");
    expect(payload?.details["Investment routes"]).toContain("The capital must be kept for 5 years");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 60,000");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 37,000");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 7,500 each");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 2,000");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 500 per person");
    expect(payload?.details["Government Processing fees"]).toContain("No total is shown");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("574,250");
    expect(payload?.details["Country At glance"]).toContain("EUR 40,540");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toBe("Visa-free travel across the Schengen Area for 90 days in any 180-day period.");
    expect(payload?.details["About Elevay"]).toContain("2,500+");
    expect(payload?.details["About Elevay"]).toContain("T +971 4 282 7221");
    expect(payload?.details["About Elevay"]).toContain("not legal, tax or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://residencymalta.gov.mt/wp-content/uploads/2026/08/MPRP-Brochure-English.pdf");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://legislation.mt/eli/cap/188/eng");
  });

  it("returns Arabic-only Malta MPRP legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30019,
        title: "Elevay Malta MPRP Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Malta_MPRP_Summary.pdf",
        createdAt: 1793264333179,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("برنامج مالطا للإقامة الدائمة");
    expect(payload?.summaryAr).toContain("برنامج مالطا للإقامة الدائمة");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.details["مسارات الاستثمار"]).toContain("14,000 يورو سنويًا");
    expect(payload?.details["مسارات الاستثمار"]).toContain("375,000 يورو");
    expect(payload?.details["مسارات الاستثمار"]).toContain("500,000 يورو على الأقل");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("60,000 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("37,000 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("7,500 يورو لكل معال");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("2,000 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("500 يورو لكل شخص");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("السفر دون تأشيرة في أنحاء منطقة شنغن لمدة 90 يومًا خلال أي فترة من 180 يومًا");
    expect(payload?.details["لمحة عن الدولة"]).toContain("574,250");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("investment in share capital");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Malta Nomad Ready Summary through all nine English sections and installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30018,
        title: "Elevay Malta Nomad Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Malta_Nomad_Summary.pdf",
        createdAt: 1793264290176,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30018",
      slug: "ready-summary-30018",
      nameEn: "Malta Nomad Residence Permit",
      nameAr: "تصريح الإقامة الرقمية الرحّالة في مالطا",
      readySummaryPdfUrl: null,
    });
    expect(payload?.summaryEn).toContain("The Malta Nomad Residence Permit is for people who can work remotely");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("initial permit is valid for 1 year");
    expect(payload?.details["Program Overview"]).toContain("renewed 3 times");
    expect(payload?.details["Program Overview"]).toContain("maximum total stay of 4 years");
    expect(payload?.details["Program Overview"]).toContain("30 working days from receipt of payment");
    expect(payload?.details["Program Overview"]).toContain("at least 5 months in Malta over the previous 12 months");
    expect(payload?.details["Program Overview"]).toContain("does not lead to long-term residence or citizenship");
    expect(payload?.details["Who Can be Included"]).toContain("Unmarried adult children who are mainly dependent");
    expect(payload?.details["Who Can be Included"]).toContain("EUR 42,000 a year");
    expect(payload?.details["Who Can be Included"]).toContain("minimum cover of EUR 100,000");
    expect(payload?.details["Who Can be Included"]).toContain("Russian Federation and Belarus are currently not eligible");
    expect(payload?.details["Investment routes"]).toBe("Not required");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 300 per person");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 100 per person");
    expect(payload?.details["Government Processing fees"]).toContain("3 to 4 weeks after arrival and biometrics");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("574,250");
    expect(payload?.details["Country At glance"]).toContain("EUR 40,540");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toBe("Not required");
    expect(payload?.details["About Elevay"]).toContain("28+ years of experience, since 1998");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(payload?.details["About Elevay"]).toContain("not legal, tax or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://nomad.residencymalta.gov.mt/nomad-eligibility/");
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://nomad.residencymalta.gov.mt/new-faqs/");
  });

  it("returns Arabic-only Malta Nomad legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30018,
        title: "Elevay Malta Nomad Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Malta_Nomad_Summary.pdf",
        createdAt: 1793264290176,
      },
      null,
      "ar",
    );
    expect(payload?.summaryEn).toContain("تصريح الإقامة الرقمية الرحّالة في مالطا");
    expect(payload?.summaryAr).toContain("تصريح الإقامة الرقمية الرحّالة في مالطا");
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("4 سنوات");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("42,000 يورو سنويًا");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("100,000 يورو");
    expect(payload?.details["مسارات الاستثمار"]).toBe("غير مطلوب");
    expect(payload?.details["خيارات المساهمة"]).toBe("غير مطلوب");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("300 يورو لكل شخص");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("100 يورو لكل شخص");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("574,250");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("work for an employer abroad");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Malta Tax Residence Ready Summary as nine English-only installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30017,
        title: "Elevay Malta Tax Residence Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Malta_Tax_Residence_Summary.pdf",
        createdAt: 1793264263705,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30017",
      slug: "ready-summary-30017",
      nameEn: "Malta Tax Residence Programmes",
      nameAr: "برامج الإقامة الضريبية في مالطا",
    });
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("15% rate and the yearly minimum");
    expect(payload?.details["Program Overview"]).toContain("EUR 15,000");
    expect(payload?.details["Program Overview"]).toContain("EUR 7,500");
    expect(payload?.details["Program Overview"]).toContain("EUR 500 a year for each dependant and special carer");
    expect(payload?.details["Program Overview"]).toContain("Income that is not taxed at 15% under these rules is taxed separately at 35%");
    expect(payload?.details["Program Overview"]).toContain("EUR 200,000");
    expect(payload?.details["Program Overview"]).toContain("EUR 35,000 for global resident and EU, EEA and Swiss resident status");
    expect(payload?.details["Who Can be Included"]).toContain("nationals of countries outside the EU, EEA and Switzerland");
    expect(payload?.details["Who Can be Included"]).toContain("pension is at least 75% of their income");
    expect(payload?.details["Who Can be Included"]).toContain("At least 90 days a year");
    expect(payload?.details["Who Can be Included"]).toContain("No more than 183 days in any other country");
    expect(payload?.details["Investment routes"]).toContain("EUR 275,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 8,750");
    expect(payload?.details["Investment routes"]).toContain("EUR 700,000");
    expect(payload?.details["Investment routes"]).toContain("EUR 14,000 a year");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 6,000");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 5,500");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 8,500, non-refundable");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("574,250");
    expect(payload?.details["Passport access"]).toBe("Not required");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://legislation.mt/eli/ln/2026/195/eng");
  });

  it("returns only Arabic Malta Tax Residence fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30017,
        title: "Elevay Malta Tax Residence Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Malta_Tax_Residence_Summary.pdf",
        createdAt: 1793264263705,
      },
      null,
      "ar",
    );
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.summaryEn).toContain("توجد في مالطا برامج للإقامة الضريبية");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("15%");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("15,000 يورو");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("75%");
    expect(payload?.details["مسارات الاستثمار"]).toContain("275,000 يورو");
    expect(payload?.details["مسارات الاستثمار"]).toContain("700,000 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("8,500 يورو");
    expect(payload?.details["خيارات المساهمة"]).toBe("غير مطلوب");
    expect(payload?.details["Due diligence fees"]).toBeUndefined();
    expect(payload?.details["Passport access"]).toBeUndefined();
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Spain Digital Nomad Ready Summary with all nine English fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30026,
        title: "Elevay Spain Digital Nomad Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Spain_Digital_Nomad_Summary.pdf",
        createdAt: 1793264708112,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30026",
      slug: "ready-summary-30026",
      nameEn: "Spain Digital Nomad Visa",
      nameAr: "تأشيرة إسبانيا للرحّالة الرقميين",
    });
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("Up to 20 days");
    expect(payload?.details["Program Overview"]).toContain("up to a maximum of 3 years");
    expect(payload?.details["Program Overview"]).toContain("deemed granted by administrative silence");
    expect(payload?.details["Who Can be Included"]).toContain("EUR 34,188 a year (gross)");
    expect(payload?.details["Who Can be Included"]).toContain("EUR 12,820.50 a year (gross)");
    expect(payload?.details["Who Can be Included"]).toContain("EUR 4,273.50 a year each (gross)");
    expect(payload?.details["Investment routes"]).toBe("Not required");
    expect(payload?.details["Contribution options"]).toContain("EUR 88.56 a month");
    expect(payload?.details["Contribution options"]).toContain("previous 2 years");
    expect(payload?.details["Government Processing fees"]).toContain("All fees shall be presented on proposal stage");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("49,077,984");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toBe("Not required");
    expect(payload?.details["About Elevay"]).toContain("T +971 4 282 7221");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("https://www.boe.es/buscar/act.php?id=BOE-A-2026-3815");
  });

  it("returns only Arabic Spain Digital Nomad fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30026,
        title: "Elevay Spain Digital Nomad Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Spain_Digital_Nomad_Summary.pdf",
        createdAt: 1793264708112,
      },
      null,
      "ar",
    );
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.summaryAr).toContain("تأشيرة إسبانيا للرحّالة الرقميين");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("20 يومًا");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("34,188 يورو سنويًا");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("12,820.50 يورو سنويًا");
    expect(payload?.details["مسارات الاستثمار"]).toBe("غير مطلوب");
    expect(payload?.details["خيارات المساهمة"]).toContain("88.56 يورو شهريًا");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("تُعرض جميع الرسوم عند مرحلة تقديم العرض");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("49,077,984");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Spain Entrepreneur Ready Summary as nine English-only installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30022,
        title: "Elevay Spain Entrepreneur Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Spain_Entrepreneur_Summary.pdf",
        createdAt: 1793264446924,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30022",
      slug: "ready-summary-30022",
      nameEn: "Spain Entrepreneur Residence",
      nameAr: "إقامة رواد الأعمال في إسبانيا",
    });
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("Spain’s entrepreneur residence authorisation");
    expect(payload?.details["Program Overview"]).toContain("A favourable report on the project is mandatory");
    expect(payload?.details["Program Overview"]).toContain("10 working days");
    expect(payload?.details["Program Overview"]).toContain("A maximum of 20 days from filing");
    expect(payload?.details["Program Overview"]).toContain("The UGE sets no minimum investment");
    expect(payload?.details["Program Overview"]).toContain("The amount of economic resources to show is confirmed at proposal stage");
    expect(payload?.details["Program Overview"]).toContain("Do not start work before you are correctly registered");
    expect(payload?.details["Who Can be Included"]).toContain("1 year of continuous cohabitation");
    expect(payload?.details["Who Can be Included"]).toContain("Aged 18 to under 26");
    expect(payload?.details["Who Can be Included"]).toContain("Dependent ascendants");
    expect(payload?.details["Who Can be Included"]).toContain("same fee model applies to holder and dependants");
    expect(payload?.details["Investment routes"]).toContain("no minimum investment");
    expect(payload?.details["Investment routes"]).toContain("favourable ENISA report");
    expect(payload?.details["Contribution options"]).toContain("Contribution amounts and tax rates are not set by the immigration authority");
    expect(payload?.details["Government Processing fees"]).toContain("All fees shall be presented on proposal stage");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("505,983 km2");
    expect(payload?.details["Country At glance"]).toContain("49,077,984");
    expect(payload?.details["Country At glance"]).toContain("EUR 34,500 (2023)");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toBe("Not required");
    expect(payload?.details["About Elevay"]).toContain("28+ years of experience, since 1998");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(payload?.details["About Elevay"]).toContain("not legal, tax or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("returns only Arabic Spain Entrepreneur legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30022,
        title: "Elevay Spain Entrepreneur Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Spain_Entrepreneur_Summary.pdf",
        createdAt: 1793264446924,
      },
      null,
      "ar",
    );
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.summaryAr).toContain("تصريح الإقامة الإسباني لرواد الأعمال");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("تقرير إيجابي بشأن المشروع");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("10 أيام عمل");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("20 يومًا كحد أقصى");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("لا تحدد وحدة UGE حدًا أدنى للاستثمار");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("سنة واحدة على الأقل");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("18 إلى أقل من 26 عامًا");
    expect(payload?.details["مسارات الاستثمار"]).toContain("تقرير إيجابي من ENISA");
    expect(payload?.details["خيارات المساهمة"]).toContain("لا تحدد سلطة الهجرة مبالغ المساهمات");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("يجب تقديم جميع الرسوم في مرحلة تقديم العرض");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("505,983 كم2");
    expect(payload?.details["لمحة عن الدولة"]).toContain("49,077,984");
    expect(payload?.details["لمحة عن الدولة"]).toContain("29 دولة");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toBe("غير مطلوب");
    expect(payload?.details["Program Overview"]).toBeUndefined();
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Portugal D2 Ready Summary as nine English-only installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30015,
        title: "Elevay Portugal D2 Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Portugal_D2_Summary.pdf",
        createdAt: 1793264201880,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30015",
      slug: "ready-summary-30015",
      nameEn: "Portugal D2 Residence Visa",
      nameAr: "تأشيرة الإقامة البرتغالية D2",
    });
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.details["Program Overview"]).toContain("work for themselves or run a business in Portugal");
    expect(payload?.details["Program Overview"]).toContain("3 to 6 months");
    expect(payload?.details["Program Overview"]).toContain("6 months in a row / 8 months in total");
    expect(payload?.details["Program Overview"]).toContain("EUR 6,440");
    expect(payload?.details["Program Overview"]).toContain("16 of the 24 months");
    expect(payload?.details["Who Can be Included"]).toContain("Dependent first-degree parents");
    expect(payload?.details["Who Can be Included"]).toContain("Minor siblings under guardianship");
    expect(payload?.details["Investment routes"]).toContain("Independent professional");
    expect(payload?.details["Investment routes"]).toContain("Immigrant entrepreneur");
    expect(payload?.details["Investment routes"]).toContain("Startup Visa");
    expect(payload?.details["Investment routes"]).toContain("EUR 11,592");
    expect(payload?.details["Investment routes"]).toContain("Portuguese law sets no minimum investment amount");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 110");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 114.30");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 351.10");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("10,804,871");
    expect(payload?.details["Country At glance"]).toContain("US$32,082");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toContain("10 years of legal residence, or 7 years");
    expect(payload?.details["Passport access"]).toContain("Citizenship is never guaranteed or automatic");
    expect(payload?.details["About Elevay"]).toContain("28+ years of experience, since 1998");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(payload?.details["About Elevay"]).toContain("not legal or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
    expect(JSON.stringify(payload?.programmeSections)).toContain("diariodarepublica.pt");
  });

  it("returns only Arabic Portugal D2 legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30015,
        title: "Elevay Portugal D2 Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Portugal_D2_Summary.pdf",
        createdAt: 1793264201880,
      },
      null,
      "ar",
    );
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.summaryAr).toContain("تأشيرة D2 هي تأشيرة إقامة برتغالية");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("3 إلى 6 أشهر");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("6 أشهر متتالية أو 8 أشهر إجمالًا");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("الإخوة القاصرون الخاضعون للوصاية");
    expect(payload?.details["مسارات الاستثمار"]).toContain("المهني المستقل");
    expect(payload?.details["مسارات الاستثمار"]).toContain("رائد الأعمال المهاجر");
    expect(payload?.details["مسارات الاستثمار"]).toContain("تأشيرة الشركات الناشئة");
    expect(payload?.details["مسارات الاستثمار"]).toContain("11,592 يورو");
    expect(payload?.details["خيارات المساهمة"]).toBe("غير مطلوب");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("110 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("114.30 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("351.10 يورو");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("10,804,871");
    expect(payload?.details["لمحة عن الدولة"]).toContain("29 دولة");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("10 سنوات");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("7 سنوات");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("Independent professional");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Portugal D7 Ready Summary as nine English-only installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30013,
        title: "Elevay Portugal D7 Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Portugal_D7_Summary.pdf",
        createdAt: 1793264143867,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30013",
      slug: "ready-summary-30013",
      nameEn: "Portugal D7 Residence Visa",
      nameAr: "تأشيرة الإقامة البرتغالية D7",
    });
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.summaryEn).toContain("The D7 is a Portuguese residence visa");
    expect(payload?.details["Program Overview"]).toContain("EUR 11,040");
    expect(payload?.details["Program Overview"]).toContain("EUR 5,520");
    expect(payload?.details["Program Overview"]).toContain("EUR 3,312");
    expect(payload?.details["Program Overview"]).toContain("EUR 16,560");
    expect(payload?.details["Program Overview"]).toContain("EUR 19,872");
    expect(payload?.details["Program Overview"]).toContain("6 consecutive months, or 8 months in total");
    expect(payload?.details["Program Overview"]).toContain("Travel insurance");
    expect(payload?.details["Who Can be Included"]).toContain("Dependent first-degree parents");
    expect(payload?.details["Who Can be Included"]).toContain("Minor siblings under guardianship");
    expect(payload?.details["Investment routes"]).toBe("Not required");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 110");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 114.30");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 351.10");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("10,804,871");
    expect(payload?.details["Country At glance"]).toContain("US$32,082");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toContain("10 years of legal residence, or 7 years");
    expect(payload?.details["Passport access"]).toContain("Citizenship is never guaranteed or automatic");
    expect(payload?.details["About Elevay"]).toContain("28+ years of experience, since 1998");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(payload?.details["About Elevay"]).toContain("not legal or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("returns only Arabic Portugal D7 legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30013,
        title: "Elevay Portugal D7 Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Portugal_D7_Summary.pdf",
        createdAt: 1793264143867,
      },
      null,
      "ar",
    );
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.summaryAr).toContain("تأشيرة D7 هي تأشيرة إقامة برتغالية");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("11,040 يورو");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("5,520 يورو");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("3,312 يورو");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("16,560 يورو");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("19,872 يورو");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("الوالدان من الدرجة الأولى المعالان");
    expect(payload?.details["مسارات الاستثمار"]).toBe("غير مطلوب");
    expect(payload?.details["خيارات المساهمة"]).toBe("غير مطلوب");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("110 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("114.30 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("351.10 يورو");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("10,804,871");
    expect(payload?.details["لمحة عن الدولة"]).toContain("29 دولة");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("10 سنوات");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("7 سنوات");
    expect(payload?.details["Investment routes"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("No fixed D7 amount is published");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("serves the latest active Portugal D8 Ready Summary as nine English-only installed-app fields", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30014,
        title: "Elevay Portugal D8 Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Portugal_D8_Summary.pdf",
        createdAt: 1793264175392,
      },
      null,
    );
    expect(payload).toMatchObject({
      publicId: "ready-summary-30014",
      slug: "ready-summary-30014",
      nameEn: "Portugal D8 Digital Nomad Visa",
      nameAr: "تأشيرة البرتغال D8 للرحالة الرقميين",
    });
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.summaryEn).toContain("The D8 is a Portuguese residence visa for remote work");
    expect(payload?.details["Program Overview"]).toContain("EUR 3,680");
    expect(payload?.details["Program Overview"]).toContain("EUR 44,160");
    expect(payload?.details["Program Overview"]).toContain("average over the last 3 months");
    expect(payload?.details["Program Overview"]).toContain("A work contract");
    expect(payload?.details["Program Overview"]).toContain("a services contract");
    expect(payload?.details["Program Overview"]).toContain("A document attesting fiscal residence");
    expect(payload?.details["Program Overview"]).toContain("sworn declaration");
    expect(payload?.details["Who Can be Included"]).toContain("Spouse");
    expect(payload?.details["Who Can be Included"]).toContain("Minor siblings under guardianship");
    expect(payload?.details["Investment routes"]).toBe("Not required");
    expect(payload?.details["Contribution options"]).toBe("Not required");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 110");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 114.30");
    expect(payload?.details["Government Processing fees"]).toContain("EUR 351.10");
    expect(payload?.details["Due diligence fees"]).toBe("Not required");
    expect(payload?.details["Country At glance"]).toContain("10,804,871");
    expect(payload?.details["Country At glance"]).toContain("US$32,082");
    expect(payload?.details["Country At glance"]).toContain("29 countries");
    expect(payload?.details["Passport access"]).toContain("10 years of legal residence, or 7 years");
    expect(payload?.details["Passport access"]).toContain("Citizenship is never guaranteed or automatic");
    expect(payload?.details["About Elevay"]).toContain("28+ years of experience, since 1998");
    expect(payload?.details["About Elevay"]).toContain("T +20 128 498 1717");
    expect(payload?.details["About Elevay"]).toContain("not legal or immigration advice");
    expect(JSON.stringify(payload?.details)).not.toMatch(/[\u0600-\u06ff]/);
    expect(payload?.programmeSections?.en.map(section => section.heading)).toEqual([
      "Program Overview",
      "Who Can be Included",
      "Investment routes",
      "Contribution options",
      "Government Processing fees",
      "Due diligence fees",
      "Country At glance",
      "Passport access",
      "About Elevay",
    ]);
    expect(payload?.programmeSections?.ar).toHaveLength(9);
  });

  it("returns only Arabic Portugal D8 legacy fields when the phone language is Arabic", () => {
    const payload = publicReadySummaryFromRecord(
      {
        id: 30014,
        title: "Elevay Portugal D8 Summary - English",
        category: "Residency",
        originalFileName: "Elevay_Portugal_D8_Summary.pdf",
        createdAt: 1793264175392,
      },
      null,
      "ar",
    );
    expect(Object.keys(payload?.details ?? {})).toEqual([
      "نظرة عامة على البرنامج",
      "الأشخاص الذين يمكن إدراجهم",
      "مسارات الاستثمار",
      "خيارات المساهمة",
      "رسوم المعالجة الحكومية",
      "رسوم العناية الواجبة",
      "لمحة عن الدولة",
      "إمكانية السفر بجواز السفر",
      "عن إيليفاي",
    ]);
    expect(payload?.summaryAr).toContain("تأشيرة D8 هي تأشيرة إقامة برتغالية للعمل عن بُعد");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("3,680 يورو شهريًا");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("44,160 يورو سنويًا");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("الأشهر الثلاثة الماضية");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("عقد عمل");
    expect(payload?.details["نظرة عامة على البرنامج"]).toContain("عقد خدمات");
    expect(payload?.details["الأشخاص الذين يمكن إدراجهم"]).toContain("الوالدان من الدرجة الأولى المعالان");
    expect(payload?.details["مسارات الاستثمار"]).toBe("غير مطلوب");
    expect(payload?.details["خيارات المساهمة"]).toBe("غير مطلوب");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("110 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("114.30 يورو");
    expect(payload?.details["رسوم المعالجة الحكومية"]).toContain("351.10 يورو");
    expect(payload?.details["رسوم العناية الواجبة"]).toBe("غير مطلوب");
    expect(payload?.details["لمحة عن الدولة"]).toContain("10,804,871");
    expect(payload?.details["لمحة عن الدولة"]).toContain("29 دولة");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("10 سنوات");
    expect(payload?.details["إمكانية السفر بجواز السفر"]).toContain("7 سنوات");
    expect(payload?.details["Program Overview"]).toBeUndefined();
    expect(JSON.stringify(payload?.details)).not.toContain("Digital Nomad Visa");
    expect(payload?.programmeSections?.ar).toHaveLength(9);
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

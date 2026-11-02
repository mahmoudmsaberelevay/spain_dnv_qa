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

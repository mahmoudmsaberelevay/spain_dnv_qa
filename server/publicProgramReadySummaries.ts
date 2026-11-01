import type { MarketingReadySummary } from "../drizzle/schema";
import { assetText } from "./commandCenter/knowledge";

export type PublicProgramCategory = "residency" | "citizenship";

export type ReadySummaryIdentity = {
  country: string;
  nameEn: string;
  category: PublicProgramCategory;
};

export type PublicReadySummary = ReadySummaryIdentity & {
  publicId: string;
  slug: string;
  nameAr: string | null;
  summaryEn: string | null;
  summaryAr: string | null;
  readySummaryTitle: null;
  readySummaryTextEn: null;
  readySummaryTextAr: null;
  readySummaryPdfUrl: null;
  readySummaryUpdatedAt: null;
  imageUrl: null;
  sourceUrl: string;
  details: Record<string, string> | StructuredPublicProgramDetails;
};

type StructuredPublicProgramDetails = {
  version: 1;
  sourceLabel: string;
  programName: BilingualText;
  country: BilingualText;
  processingTime: BilingualText;
  residencyRequirement: BilingualText;
  investmentOptions: Array<{ title: BilingualText; amount: string; notes: BilingualText }>;
  benefits: BilingualList;
  eligibility: BilingualList;
  family: BilingualList;
  process: BilingualList;
  feeNotes: BilingualList;
  disclaimer: BilingualText;
};

const COUNTRY_ALIASES: Array<[string, string]> = [
  ["antigua and barbuda", "Antigua & Barbuda"],
  ["antigua barbuda", "Antigua & Barbuda"],
  ["saint kitts and nevis", "Saint Kitts & Nevis"],
  ["st kitts nevis", "Saint Kitts & Nevis"],
  ["st kitts and nevis", "Saint Kitts & Nevis"],
  ["saint lucia", "Saint Lucia"],
  ["st lucia", "Saint Lucia"],
  ["sao tome and principe", "São Tomé and Príncipe"],
  ["sao tome", "São Tomé and Príncipe"],
  ["naoero", "Nauru"],
  ["turkiye", "Turkey"],
  ["turkey", "Turkey"],
  ["uae", "United Arab Emirates"],
  ["united arab emirates", "United Arab Emirates"],
  ["united states", "United States"],
  ["australia", "Australia"],
  ["canada", "Canada"],
  ["dominica", "Dominica"],
  ["egypt", "Egypt"],
  ["grenada", "Grenada"],
  ["greece", "Greece"],
  ["hungary", "Hungary"],
  ["latvia", "Latvia"],
  ["malta", "Malta"],
  ["portugal", "Portugal"],
  ["spain", "Spain"],
  ["vanuatu", "Vanuatu"],
];

const ARABIC_COUNTRY_NAMES: Record<string, string> = {
  "Antigua & Barbuda": "أنتيغوا وبربودا",
  Australia: "أستراليا",
  Canada: "كندا",
  Dominica: "دومينيكا",
  Egypt: "مصر",
  Grenada: "غرينادا",
  Greece: "اليونان",
  Hungary: "المجر",
  Latvia: "لاتفيا",
  Malta: "مالطا",
  Nauru: "ناورو",
  Portugal: "البرتغال",
  "Saint Kitts & Nevis": "سانت كيتس ونيفيس",
  "Saint Lucia": "سانت لوسيا",
  "São Tomé and Príncipe": "ساو تومي وبرينسيب",
  Spain: "إسبانيا",
  Turkey: "تركيا",
  "United Arab Emirates": "الإمارات العربية المتحدة",
  "United States": "الولايات المتحدة",
  Vanuatu: "فانواتو",
};

const SPACED_HEADING_LABELS: Record<string, string> = {
  PROGRAMMEOVERVIEW: "Programme Overview",
  PROGRAMOVERVIEW: "Programme Overview",
  WHOCANBEINCLUDED: "Who Can Be Included",
  GOODTOKNOW: "Good To Know",
  INCOMEREQUIREMENT: "Income Requirement",
  WHATMUSTBEPROVED: "What Must Be Proved",
  VISASTAGE: "Visa Stage",
  RESIDENCEPERMITSTAGEAIMA: "Residence Permit Stage (AIMA)",
  STAYANDRENEWAL: "Stay And Renewal",
  MINIMUMSTAYPLEASEREADTHISCAREFULLY: "Minimum Stay",
  VISAANDPERMIT: "Visa And Permit",
  FEESDOCUMENTSANDTHEROADAHEAD: "Fees, Documents And The Road Ahead",
  GOVERNMENTFEES: "Government Fees",
  APOSTILLEORATTESTATIONWHATISTHEDIFFERENCE: "Apostille Or Attestation",
  ABOUTTHECOUNTRY: "About The Country",
  SCHENGENAREA: "Schengen Area",
  INVESTMENTOPTIONS: "Investment Options",
  ELIGIBILITY: "Eligibility",
  APPLICATIONPROCESS: "Application Process",
  FAMILYMEMBERS: "Family Members",
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleWithoutBrandAndSuffix(value: string) {
  return value
    .replace(/^elevay\s+/i, "")
    .replace(/\s+summary(?:\s+-\s+english)?\s*$/i, "")
    .trim();
}

export function readySummaryCategoryToProgramCategory(category: string): PublicProgramCategory | null {
  if (category === "Residency") return "residency";
  if (category === "Citizenship") return "citizenship";
  return null;
}

export function parseReadySummaryIdentity(title: string, fileName: string, category: string): ReadySummaryIdentity | null {
  const programCategory = readySummaryCategoryToProgramCategory(category);
  if (!programCategory) return null;

  const raw = titleWithoutBrandAndSuffix(title || fileName.replace(/\.pdf$/i, "").replaceAll("_", " "));
  const haystack = normalized(`${raw} ${fileName}`);
  const match = [...COUNTRY_ALIASES]
    .sort((left, right) => right[0].length - left[0].length)
    .find(([alias]) => haystack.includes(alias));
  const country = match?.[1] ?? raw;
  const nameEn = raw || country;
  return { country, nameEn, category: programCategory };
}

function cleanDisplayLine(value: string) {
  const trimmed = value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  const compactUpper = trimmed.replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
  return SPACED_HEADING_LABELS[compactUpper] ?? trimmed;
}

function isMetadataLine(value: string) {
  return !value
    || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(value)
    || /^www\.elevay\.(?:com|vip)$/i.test(value)
    || /^elevay\s*\|/i.test(value)
    || /^page\s*\d+$/i.test(value)
    || /^expanding your freedom$/i.test(value)
    || /^(?:residency|citizenship) programme$/i.test(value)
    || /^country summary$/i.test(value);
}

function isHeading(value: string) {
  if (Object.values(SPACED_HEADING_LABELS).includes(value)) return true;
  if (value.length < 4 || value.length > 100 || /[.!?]$/.test(value)) return false;
  const letters = value.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  const uppercase = letters.replace(/[^A-Z]/g, "").length;
  return uppercase / letters.length >= 0.8;
}

function headingLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase())
    .replace(/\bD([278])\b/g, "D$1")
    .replace(/\bAima\b/g, "AIMA")
    .replace(/\bMofa\b/g, "MOFA");
}

function sentenceExcerpt(value: string, maximum = 700) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maximum) return compact;
  const candidate = compact.slice(0, maximum);
  const lastBoundary = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("; "), candidate.lastIndexOf(": "));
  return `${(lastBoundary > Math.floor(maximum * 0.55) ? candidate.slice(0, lastBoundary + 1) : candidate).trim()}…`;
}

/**
 * Converts a Ready Summary PDF extraction into the established mobile fields.
 * No fact is invented: an absent stay rule is explicitly marked as not stated,
 * while an explicit “no requirement” statement is kept as written.
 */
export function buildPublicProgramInformation(extractedText: string): { summaryEn: string; details: Record<string, string> } | null {
  const pages = extractedText.split(/(?=--\s*\d+\s+of\s+\d+\s*--)/i);
  const sections = new Map<string, string[]>();
  let currentHeading = "Programme Information";

  for (const page of pages) {
    const rawLines = page.split(/\n+/).map(cleanDisplayLine);
    const sourceStart = rawLines.findIndex(line => /^sources?\s*:/i.test(line));
    const lines = (sourceStart >= 0 ? rawLines.slice(0, sourceStart) : rawLines).filter(line => !isMetadataLine(line));
    for (const line of lines) {
      if (isHeading(line)) {
        const label = headingLabel(line);
        if (!isMetadataLine(label)) currentHeading = label;
        continue;
      }
      const content = sections.get(currentHeading) || [];
      content.push(line);
      sections.set(currentHeading, content);
    }
  }

  const details: Record<string, string> = Object.fromEntries(
    Array.from(sections.entries())
      .map(([label, lines]) => [label, lines.join(" ").replace(/\s+/g, " ").trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
  const entries = Object.entries(details) as Array<[string, string]>;
  if (!entries.length) return null;

  const overview = entries.find(([label]) => /programme overview|program overview/i.test(label))?.[1] || entries[0][1];
  const allText = entries.map(([, value]) => value).join(" ");
  const hasStayInformation = /\b(?:stay|absence|physical presence|residen[ct]e requirement|minimum days|minimum stay|visit requirement)\b/i.test(allText);
  if (!hasStayInformation) {
    details["Stay requirement"] = "Not stated in the programme information.";
  }
  details["Family-size scope for figures"] = "Each investment, contribution, income or fee figure applies only to the applicant or family composition stated beside that figure. If no family size is stated, the programme information does not specify one.";

  return { summaryEn: sentenceExcerpt(overview), details };
}

type BilingualText = { en: string; ar: string };
type BilingualList = { en: string[]; ar: string[] };

const ANTIGUA_ENGLISH_SOURCE = "knowledge/summaries/antigua-barbuda.md";
const ANTIGUA_ARABIC_SOURCE = "knowledge/summaries/antigua-barbuda.ar.md";

function stripMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\\\*/g, "*")
    .trim();
}

function markdownSection(markdown: string, position: number) {
  const headings = Array.from(markdown.matchAll(/^##\s+.+$/gm));
  const start = headings[position];
  if (!start || start.index === undefined) return "";
  const contentStart = start.index + start[0].length;
  const contentEnd = headings[position + 1]?.index ?? markdown.length;
  return markdown.slice(contentStart, contentEnd).trim();
}

function programmeLines(markdown: string, position: number) {
  return markdownSection(markdown, position)
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && line !== "---")
    .filter(line => !/^\|?\s*:?-{3,}/.test(line))
    .filter(line => !/^(?:sources?|source document|المصادر|وثيقة المصدر)\s*:/i.test(line))
    .map(line => {
      if (line.startsWith("|") && line.endsWith("|")) {
        return line.slice(1, -1).split("|").map(cell => stripMarkdown(cell)).filter(Boolean).join(" — ");
      }
      return stripMarkdown(line);
    })
    .filter(Boolean);
}

function fromBoth(en: string[], ar: string[]): BilingualList {
  return { en, ar };
}

function firstMatching(lines: string[], expression: RegExp, fallback: string) {
  return lines.find(line => expression.test(line)) || fallback;
}

/**
 * Antigua is an explicit owner-supplied replacement. Its English and Arabic
 * content is read directly from the approved files so no old OCR/PDF text,
 * scraped data, inferred requirement, source attribution, or PDF action can
 * appear in the programme payload.
 */
function userApprovedAntiguaProgramme(identity: ReadySummaryIdentity): PublicReadySummary | null {
  const english = assetText(ANTIGUA_ENGLISH_SOURCE);
  const arabic = assetText(ANTIGUA_ARABIC_SOURCE);
  if (!english || !arabic) return null;

  const overviewEn = programmeLines(english, 0);
  const overviewAr = programmeLines(arabic, 0);
  const eligibilityEn = programmeLines(english, 1);
  const eligibilityAr = programmeLines(arabic, 1);
  const investmentEn = programmeLines(english, 2);
  const investmentAr = programmeLines(arabic, 2);
  const contributionEn = programmeLines(english, 3);
  const contributionAr = programmeLines(arabic, 3);
  const processingFeesEn = programmeLines(english, 4);
  const processingFeesAr = programmeLines(arabic, 4);
  const diligenceFeesEn = programmeLines(english, 5);
  const diligenceFeesAr = programmeLines(arabic, 5);
  const countryEn = programmeLines(english, 6);
  const countryAr = programmeLines(arabic, 6);
  const passportEn = programmeLines(english, 7);
  const passportAr = programmeLines(arabic, 7);
  const aboutElevayEn = programmeLines(english, 8);
  const aboutElevayAr = programmeLines(arabic, 8);

  const overviewTitleEn = overviewEn.find(line => line === "Antigua & Barbuda Citizenship by Investment") || identity.nameEn;
  const overviewTitleAr = overviewAr.find(line => /جنسية .*عن طريق الاستثمار/.test(line)) || "جنسية أنتيغوا وبربودا عن طريق الاستثمار";
  const overviewBodyEn = overviewEn.find(line => line.startsWith("Citizenship of Antigua & Barbuda can be obtained")) || overviewEn[0] || "";
  const overviewBodyAr = overviewAr.find(line => line.startsWith("يمكن الحصول على جنسية")) || overviewAr[0] || "";

  const investmentRowsEn = investmentEn
    .filter(line => /^Option [1-4]:/.test(line))
    .filter((line, index, rows) => rows.findIndex(candidate => candidate.match(/^Option [1-4]:/)?.[0] === line.match(/^Option [1-4]:/)?.[0]) === index);
  const investmentRowsAr = investmentAr
    .filter(line => /^الخيار [1-4]:/.test(line))
    .filter((line, index, rows) => rows.findIndex(candidate => candidate.match(/^الخيار [1-4]:/)?.[0] === line.match(/^الخيار [1-4]:/)?.[0]) === index);
  const investmentOptions = investmentRowsEn.map((line, index) => {
    const [title = line, amount = "", holding = ""] = line.split(" — ");
    const [titleAr = title, amountAr = amount, holdingAr = holding] = (investmentRowsAr[index] || line).split(" — ");
    return {
      title: { en: title, ar: titleAr },
      amount: amount || amountAr,
      notes: { en: holding, ar: holdingAr },
    };
  });

  const familyEn = eligibilityEn.filter(line => /^(?:The spouse|Children aged|A parent|An unmarried sibling)/.test(line));
  const familyAr = eligibilityAr.filter(line => /^(?:زوج|الأبناء|والد|شقيق)/.test(line));
  const finalDisclaimerEn = english.split("\n").map(stripMarkdown).find((line: string) => line.startsWith("Elevay warrants that all information")) || "";
  const finalDisclaimerAr = arabic.split("\n").map(stripMarkdown).find((line: string) => line.startsWith("تضمن Elevay أن جميع المعلومات")) || "";
  const passportNoticeEn = passportEn.slice(passportEn.findIndex(line => line === "Important notice")).filter(Boolean);
  const passportNoticeAr = passportAr.slice(passportAr.findIndex(line => line === "إشعار مهم")).filter(Boolean);

  return {
    ...identity,
    nameEn: overviewTitleEn,
    nameAr: overviewTitleAr,
    publicId: "ready-summary-antigua-barbuda",
    slug: "antigua-barbuda-citizenship-by-investment",
    summaryEn: overviewBodyEn,
    summaryAr: overviewBodyAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: {
      version: 1,
      sourceLabel: "",
      programName: { en: overviewTitleEn, ar: overviewTitleAr },
      country: { en: identity.country, ar: "أنتيغوا وبربودا" },
      processingTime: {
        en: firstMatching(overviewEn, /Typical time to citizenship/, "Not stated in the programme information."),
        ar: firstMatching(overviewAr, /المدة المعتادة للحصول على الجنسية/, "غير مذكور في معلومات البرنامج."),
      },
      residencyRequirement: {
        en: firstMatching(overviewEn, /Minimum stay required/, "Not stated in the programme information."),
        ar: firstMatching(overviewAr, /الحد الأدنى للإقامة المطلوبة/, "غير مذكور في معلومات البرنامج."),
      },
      investmentOptions,
      benefits: fromBoth(
        [...overviewEn.filter(line => ![overviewTitleEn, overviewBodyEn].includes(line)), ...countryEn, ...passportEn],
        [...overviewAr.filter(line => ![overviewTitleAr, overviewBodyAr].includes(line)), ...countryAr, ...passportAr],
      ),
      eligibility: fromBoth(eligibilityEn, eligibilityAr),
      family: fromBoth(familyEn, familyAr),
      process: fromBoth([...investmentEn.filter(line => !investmentRowsEn.includes(line)), ...contributionEn, ...aboutElevayEn], [...investmentAr.filter(line => !investmentRowsAr.includes(line)), ...contributionAr, ...aboutElevayAr]),
      feeNotes: fromBoth([...processingFeesEn, ...diligenceFeesEn], [...processingFeesAr, ...diligenceFeesAr]),
      disclaimer: {
        en: [...passportNoticeEn, finalDisclaimerEn].filter(Boolean).join(" "),
        ar: [...passportNoticeAr, finalDisclaimerAr].filter(Boolean).join(" "),
      },
    },
  };
}

export function publicReadySummaryFromRecord(
  summary: Pick<MarketingReadySummary, "id" | "title" | "category" | "originalFileName" | "createdAt">,
  extractedText: string | null,
): PublicReadySummary | null {
  const identity = parseReadySummaryIdentity(summary.title, summary.originalFileName, summary.category);
  if (!identity) return null;
  if (identity.country === "Antigua & Barbuda") return userApprovedAntiguaProgramme(identity);
  if (!extractedText) return null;
  const information = buildPublicProgramInformation(extractedText);
  if (!information) return null;
  return {
    ...identity,
    publicId: `ready-summary-${summary.id}`,
    slug: `ready-summary-${summary.id}`,
    nameAr: ARABIC_COUNTRY_NAMES[identity.country] ?? null,
    summaryEn: information.summaryEn,
    summaryAr: null,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: information.details,
  };
}

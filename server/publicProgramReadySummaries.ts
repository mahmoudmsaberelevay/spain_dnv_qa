import type { MarketingReadySummary } from "../drizzle/schema";
import { assetText } from "./commandCenter/knowledge";

export type PublicProgramCategory = "residency" | "citizenship";
export type PublicProgramLocale = "en" | "ar";

/**
 * Existing mobile builds do not send their in-app language on public programme
 * requests. Use the platform/browser Accept-Language preference as a safe
 * approximation, preferring the highest-q supported language and English by
 * default.
 */
export function publicProgramLocaleFromAcceptLanguage(header: string | string[] | undefined): PublicProgramLocale {
  const value = Array.isArray(header) ? header.join(",") : header ?? "";
  const supported = value.split(",").map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(";");
    const qualityParameter = parameters.find(parameter => /^\s*q\s*=/i.test(parameter));
    const quality = qualityParameter ? Number(qualityParameter.split("=")[1]) : 1;
    const language = tag?.trim().toLowerCase().split(/[-_]/)[0];
    return { language, quality: Number.isFinite(quality) ? quality : 0, index };
  }).filter(item => (item.language === "ar" || item.language === "en") && item.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);
  return supported[0]?.language === "ar" ? "ar" : "en";
}

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
  imageUrl: string | null;
  sourceUrl: string;
  details: Record<string, string>;
  programmeSections?: BilingualProgrammeContent;
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

export type ProgrammeContentBlock =
  | { type: "paragraph" | "subheading" | "emphasis"; text: string; links?: Array<{ label: string; url: string }> }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][]; cellLinks?: Array<Array<Array<{ label: string; url: string }>>> };
export type ProgrammeContentSection = { heading: string; blocks: ProgrammeContentBlock[] };
export type BilingualProgrammeContent = { en: ProgrammeContentSection[]; ar: ProgrammeContentSection[] };

const ANTIGUA_ENGLISH_SOURCE = "knowledge/summaries/antigua-barbuda.md";
const ANTIGUA_ARABIC_SOURCE = "knowledge/summaries/antigua-barbuda.ar.md";
const ANTIGUA_COUNTRY_COVER_IMAGE_URL = "https://elevay.vip/manus-storage/antigua-barbuda-cover-mobile_d217274b.jpg";
const ST_KITTS_ENGLISH_SOURCE = "knowledge/summaries/st-kitts-nevis.md";
const ST_KITTS_ARABIC_SOURCE = "knowledge/summaries/st-kitts-nevis.ar.md";
const DOMINICA_ENGLISH_SOURCE = "knowledge/summaries/dominica.md";
const DOMINICA_ARABIC_SOURCE = "knowledge/summaries/dominica.ar.md";
const GRENADA_ENGLISH_SOURCE = "knowledge/summaries/grenada.md";
const GRENADA_ARABIC_SOURCE = "knowledge/summaries/grenada.ar.md";
const EGYPT_ENGLISH_SOURCE = "knowledge/summaries/egypt.md";
const EGYPT_ARABIC_SOURCE = "knowledge/summaries/egypt.ar.md";
const TURKIYE_ENGLISH_SOURCE = "knowledge/summaries/turkiye.md";
const TURKIYE_ARABIC_SOURCE = "knowledge/summaries/turkiye.ar.md";
const NAURU_ENGLISH_SOURCE = "knowledge/summaries/naoero-nauru.md";
const NAURU_ARABIC_SOURCE = "knowledge/summaries/naoero-nauru.ar.md";
const SAINT_LUCIA_ENGLISH_SOURCE = "knowledge/summaries/saint-lucia.md";
const SAINT_LUCIA_ARABIC_SOURCE = "knowledge/summaries/saint-lucia.ar.md";
const SAO_TOME_ENGLISH_SOURCE = "knowledge/summaries/sao-tome-principe.md";
const SAO_TOME_ARABIC_SOURCE = "knowledge/summaries/sao-tome-principe.ar.md";
const VANUATU_ENGLISH_SOURCE = "knowledge/summaries/vanuatu.md";
const VANUATU_ARABIC_SOURCE = "knowledge/summaries/vanuatu.ar.md";
const CANADA_ENGLISH_SOURCE = "knowledge/summaries/canada-provincial-entrepreneur.md";
const CANADA_ARABIC_SOURCE = "knowledge/summaries/canada-provincial-entrepreneur.ar.md";
const GREECE_ENGLISH_SOURCE = "knowledge/summaries/greece-golden.md";
const GREECE_ARABIC_SOURCE = "knowledge/summaries/greece-golden.ar.md";
const HUNGARY_ENGLISH_SOURCE = "knowledge/summaries/hungary-guest-investor.md";
const HUNGARY_ARABIC_SOURCE = "knowledge/summaries/hungary-guest-investor.ar.md";
const LATVIA_ENGLISH_SOURCE = "knowledge/summaries/latvia-investor.md";
const LATVIA_ARABIC_SOURCE = "knowledge/summaries/latvia-investor.ar.md";
const MALTA_MPRP_ENGLISH_SOURCE = "knowledge/summaries/malta-mprp.md";
const MALTA_MPRP_ARABIC_SOURCE = "knowledge/summaries/malta-mprp.ar.md";
const MALTA_NOMAD_ENGLISH_SOURCE = "knowledge/summaries/malta-nomad.md";
const MALTA_NOMAD_ARABIC_SOURCE = "knowledge/summaries/malta-nomad.ar.md";
const MALTA_TAX_RESIDENCE_ENGLISH_SOURCE = "knowledge/summaries/malta-tax-residence.md";
const MALTA_TAX_RESIDENCE_ARABIC_SOURCE = "knowledge/summaries/malta-tax-residence.ar.md";
const SPAIN_DNV_ENGLISH_SOURCE = "knowledge/summaries/spain-digital-nomad.md";
const SPAIN_DNV_ARABIC_SOURCE = "knowledge/summaries/spain-digital-nomad.ar.md";
const SPAIN_ENTREPRENEUR_ENGLISH_SOURCE = "knowledge/summaries/spain-entrepreneur.md";
const SPAIN_ENTREPRENEUR_ARABIC_SOURCE = "knowledge/summaries/spain-entrepreneur.ar.md";
const SPAIN_HIGHLY_QUALIFIED_ENGLISH_SOURCE = "knowledge/summaries/spain-highly-qualified.md";
const SPAIN_HIGHLY_QUALIFIED_ARABIC_SOURCE = "knowledge/summaries/spain-highly-qualified.ar.md";
const SPAIN_NON_LUCRATIVE_ENGLISH_SOURCE = "knowledge/summaries/spain-non-lucrative.md";
const SPAIN_NON_LUCRATIVE_ARABIC_SOURCE = "knowledge/summaries/spain-non-lucrative.ar.md";
const PORTUGAL_D2_ENGLISH_SOURCE = "knowledge/summaries/portugal-d2.md";
const PORTUGAL_D2_ARABIC_SOURCE = "knowledge/summaries/portugal-d2.ar.md";
const PORTUGAL_D7_ENGLISH_SOURCE = "knowledge/summaries/portugal-d7.md";
const PORTUGAL_D7_ARABIC_SOURCE = "knowledge/summaries/portugal-d7.ar.md";
const PORTUGAL_D8_ENGLISH_SOURCE = "knowledge/summaries/portugal-d8.md";
const PORTUGAL_D8_ARABIC_SOURCE = "knowledge/summaries/portugal-d8.ar.md";

function displayMarkdownText(value: string) {
  return value
    .replace(/\\\*/g, "*")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();
}

function markdownLinks(value: string) {
  return Array.from(value.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g), match => ({
    label: displayMarkdownText(match[1]),
    url: match[2],
  }));
}

function legacyBlockText(block: ProgrammeContentBlock): string {
  if (block.type === "list") return block.items.map(item => `• ${item}`).join("\n");
  if (block.type === "table") {
    const rows = [block.headers, ...block.rows];
    return rows.map((row, rowIndex) => row.map((cell, cellIndex) => {
      const links = rowIndex > 0 ? block.cellLinks?.[rowIndex - 1]?.[cellIndex] : undefined;
      return links?.length ? `${cell} (${links.map(link => link.url).join("; ")})` : cell;
    }).join(" | ")).join("\n");
  }
  if (!("text" in block)) return "";
  const links = block.links?.map(link => link.url) ?? [];
  return links.length ? `${block.text} (${links.join("; ")})` : block.text;
}

/**
 * The installed app understands summaryEn/summaryAr and details, not the new
 * programmeSections field. Keep the summary translations separate and return
 * details in only the language selected from the phone's request header.
 */
function legacyLocalizedFields(programmeSections: BilingualProgrammeContent, locale: PublicProgramLocale) {
  const overviewText = (section: ProgrammeContentSection | undefined) => {
    const paragraphs = section?.blocks.filter((block): block is Extract<ProgrammeContentBlock, { text: string }> => block.type === "paragraph") ?? [];
    const substantive = paragraphs.filter(block => !/^(?:programme details checked against|sources?:|passport index, accessed|تم التحقق من تفاصيل البرنامج|المصادر:)/i.test(block.text.trim()));
    return substantive.find(block => block.text.length >= 100)?.text
      || substantive[0]?.text
      || section?.blocks.map(legacyBlockText).filter(Boolean).join("\n")
      || "";
  };
  const selectedSections = locale === "ar" ? programmeSections.ar : programmeSections.en;
  const localizedOverview = overviewText(selectedSections[0]);
  const details = Object.fromEntries(selectedSections.map(section => [
    section.heading,
    section.blocks.map(legacyBlockText).filter(Boolean).join("\n\n"),
  ]));
  return {
    summaryEn: localizedOverview,
    summaryAr: localizedOverview,
    details,
  };
}

function rawTableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
}

function parseTableRow(line: string) {
  return rawTableCells(line).map(cell => displayMarkdownText(cell));
}

/** Parse authored Markdown into display blocks without summarizing or rewriting its words. */
export function parseProgrammeContent(markdown: string): ProgrammeContentSection[] {
  const sections: ProgrammeContentSection[] = [];
  let section: ProgrammeContentSection | null = null;
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!section || !paragraph.length) return;
    const sourceText = paragraph.join(" ").replace(/\s{2,}/g, " ");
    const links = markdownLinks(sourceText);
    section.blocks.push({ type: "paragraph", text: displayMarkdownText(sourceText), ...(links.length ? { links } : {}) });
    paragraph = [];
  };
  const flushList = () => {
    if (!section || !list.length) return;
    section.blocks.push({ type: "list", items: list.map(displayMarkdownText) });
    list = [];
  };
  const flushText = () => { flushParagraph(); flushList(); };

  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line === "---") { flushText(); continue; }
    if (line.startsWith("## ")) {
      flushText();
      section = { heading: displayMarkdownText(line.slice(3)), blocks: [] };
      sections.push(section);
      continue;
    }
    if (!section) continue;
    if (line.startsWith("### ") || line.startsWith("#### ")) {
      flushText();
      const sourceText = line.replace(/^#{3,4}\s+/, "");
      const links = markdownLinks(sourceText);
      section.blocks.push({ type: "subheading", text: displayMarkdownText(sourceText), ...(links.length ? { links } : {}) });
      continue;
    }
    if (line.startsWith("|")) {
      flushText();
      const tableLines: string[] = [line];
      while (index + 1 < lines.length && lines[index + 1].trim().startsWith("|")) tableLines.push(lines[++index].trim());
      const dataLines = tableLines.filter(row => !/^\|?\s*:?-{3,}/.test(row));
      const rows = dataLines.map(parseTableRow);
      const cellLinks = dataLines.slice(1).map(row => rawTableCells(row).map(markdownLinks));
      if (rows.length) {
        const hasCellLinks = cellLinks.some(row => row.some(links => links.length > 0));
        section.blocks.push({ type: "table", headers: rows[0], rows: rows.slice(1), ...(hasCellLinks ? { cellLinks } : {}) });
      }
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flushList();
    if (/^\*\*.+\*\*$/.test(line)) {
      flushParagraph();
      const links = markdownLinks(line);
      section.blocks.push({ type: "emphasis", text: displayMarkdownText(line), ...(links.length ? { links } : {}) });
      continue;
    }
    paragraph.push(line);
  }
  flushText();
  return sections.filter(item => item.heading.length > 0);
}

function userApprovedAntiguaProgramme(identity: ReadySummaryIdentity, locale: PublicProgramLocale): PublicReadySummary | null {
  const english = assetText(ANTIGUA_ENGLISH_SOURCE);
  const arabic = assetText(ANTIGUA_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const sourceSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (sourceSections.en.length !== 9 || sourceSections.ar.length !== 9) return null;
  const moveCountryFacts = (sections: ProgrammeContentSection[]) => {
    const countryIndex = sections.findIndex(section => /country at a glance|لمحة عن الدولة/i.test(section.heading));
    const overviewIndex = sections.findIndex(section => /program overview|نظرة عامة على البرنامج/i.test(section.heading));
    if (countryIndex < 0 || overviewIndex < 0) return null;
    const countrySection = sections[countryIndex];
    const countrySummary = countrySection.blocks.map(legacyBlockText).filter(Boolean).join("\n\n");
    const combined = sections
      .filter((_, index) => index !== countryIndex)
      .map(section => section.heading === sections[overviewIndex].heading
        ? { ...section, blocks: [...section.blocks, ...countrySection.blocks] }
        : section);
    const renumbered = combined.map((section, index) => ({
      ...section,
      heading: section.heading.replace(/^\d+(?=\.)/, String(index + 1)),
    }));
    return { sections: renumbered, countrySummary };
  };
  const englishFacts = moveCountryFacts(sourceSections.en);
  const arabicFacts = moveCountryFacts(sourceSections.ar);
  if (!englishFacts || !arabicFacts) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: englishFacts.sections,
    ar: arabicFacts.sections,
  };
  const countrySummary = locale === "ar" ? arabicFacts.countrySummary : englishFacts.countrySummary;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: identity.country,
    nameAr: "أنتيغوا وبربودا",
    publicId: "ready-summary-antigua-barbuda",
    slug: "antigua-barbuda-citizenship-by-investment",
    summaryEn: countrySummary,
    summaryAr: countrySummary,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: ANTIGUA_COUNTRY_COVER_IMAGE_URL,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Presents the latest approved St. Kitts & Nevis Ready Summary using the
 * authored bilingual section contract. This deliberately bypasses PDF
 * heuristics so the client app receives every requested heading, detail,
 * table value and source link without rewording its approved content.
 */
function latestApprovedStKittsProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(ST_KITTS_ENGLISH_SOURCE);
  const arabic = assetText(ST_KITTS_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: identity.country,
    nameAr: "سانت كيتس ونيفيس",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Presents the selected latest approved Dominica Ready Summary under the
 * requested nine headings. The legacy fields keep already-installed apps full
 * without exposing mixed-language content or requiring a native rebuild.
 */
function latestApprovedDominicaProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(DOMINICA_ENGLISH_SOURCE);
  const arabic = assetText(DOMINICA_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Dominica",
    nameAr: "دومينيكا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Presents the active Grenada Ready Summary under the same nine bilingual
 * sections as the other Caribbean programmes. The legacy fields keep the
 * existing iOS and Android builds populated without a native rebuild.
 */
function latestApprovedGrenadaProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(GRENADA_ENGLISH_SOURCE);
  const arabic = assetText(GRENADA_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Grenada",
    nameAr: "غرينادا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Egypt Ready Summary through the existing mobile
 * programme fields, with one language selected from the phone request header.
 */
function latestApprovedEgyptProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(EGYPT_ENGLISH_SOURCE);
  const arabic = assetText(EGYPT_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Egypt",
    nameAr: "مصر",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Türkiye Ready Summary through the installed app's
 * legacy fields, selecting one language from the phone's system-language header.
 */
function latestApprovedTurkiyeProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(TURKIYE_ENGLISH_SOURCE);
  const arabic = assetText(TURKIYE_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Türkiye",
    nameAr: "تركيا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Naoero/Nauru Ready Summary through the installed
 * app's legacy fields, with only the phone-system-language-selected content.
 */
function latestApprovedNauruProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(NAURU_ENGLISH_SOURCE);
  const arabic = assetText(NAURU_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Nauru",
    nameAr: "ناورو",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Saint Lucia Ready Summary through the installed
 * app's legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedSaintLuciaProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(SAINT_LUCIA_ENGLISH_SOURCE);
  const arabic = assetText(SAINT_LUCIA_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Saint Lucia",
    nameAr: "سانت لوسيا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active São Tomé and Príncipe Ready Summary through the
 * installed app's legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedSaoTomeProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(SAO_TOME_ENGLISH_SOURCE);
  const arabic = assetText(SAO_TOME_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "São Tomé and Príncipe",
    nameAr: "ساو تومي وبرينسيب",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Vanuatu Ready Summary through the installed app's
 * legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedVanuatuProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(VANUATU_ENGLISH_SOURCE);
  const arabic = assetText(VANUATU_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Vanuatu",
    nameAr: "فانواتو",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Canada Ready Summary through the installed app's
 * legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedCanadaProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(CANADA_ENGLISH_SOURCE);
  const arabic = assetText(CANADA_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Canada",
    nameAr: "كندا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Greece Ready Summary through the installed app's
 * legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedGreeceProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(GREECE_ENGLISH_SOURCE);
  const arabic = assetText(GREECE_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Greece",
    nameAr: "اليونان",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Hungary Ready Summary through the installed app's
 * legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedHungaryProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(HUNGARY_ENGLISH_SOURCE);
  const arabic = assetText(HUNGARY_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Hungary",
    nameAr: "المجر",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Latvia Ready Summary through the installed app's
 * legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedLatviaProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(LATVIA_ENGLISH_SOURCE);
  const arabic = assetText(LATVIA_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Latvia",
    nameAr: "لاتفيا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Malta MPRP Ready Summary through the installed
 * app's legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedMaltaMprpProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(MALTA_MPRP_ENGLISH_SOURCE);
  const arabic = assetText(MALTA_MPRP_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Malta",
    nameAr: "مالطا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Malta Nomad Ready Summary through the installed
 * app's legacy fields, selecting only the phone-system-language content.
 */
function latestApprovedMaltaNomadProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(MALTA_NOMAD_ENGLISH_SOURCE);
  const arabic = assetText(MALTA_NOMAD_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);

  return {
    ...identity,
    nameEn: "Malta Nomad Residence Permit",
    nameAr: "تصريح الإقامة الرقمية الرحّالة في مالطا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Malta tax-residence Ready Summary through the
 * installed app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedMaltaTaxResidenceProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(MALTA_TAX_RESIDENCE_ENGLISH_SOURCE);
  const arabic = assetText(MALTA_TAX_RESIDENCE_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Malta Tax Residence Programmes",
    nameAr: "برامج الإقامة الضريبية في مالطا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Spain Digital Nomad Ready Summary through the
 * installed app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedSpainDigitalNomadProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(SPAIN_DNV_ENGLISH_SOURCE);
  const arabic = assetText(SPAIN_DNV_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Spain Digital Nomad Visa",
    nameAr: "تأشيرة إسبانيا للرحّالة الرقميين",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Spain Entrepreneur Ready Summary through the
 * installed app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedSpainEntrepreneurProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(SPAIN_ENTREPRENEUR_ENGLISH_SOURCE);
  const arabic = assetText(SPAIN_ENTREPRENEUR_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Spain Entrepreneur Residence",
    nameAr: "إقامة رواد الأعمال في إسبانيا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Spain Highly Qualified Ready Summary through the
 * installed app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedSpainHighlyQualifiedProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(SPAIN_HIGHLY_QUALIFIED_ENGLISH_SOURCE);
  const arabic = assetText(SPAIN_HIGHLY_QUALIFIED_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Spain Highly Qualified Professionals",
    nameAr: "المهنيون ذوو التأهيل العالي في إسبانيا",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Spain Non-Lucrative Ready Summary through the
 * installed app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedSpainNonLucrativeProgramme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(SPAIN_NON_LUCRATIVE_ENGLISH_SOURCE);
  const arabic = assetText(SPAIN_NON_LUCRATIVE_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Spain Non-Lucrative Residence",
    nameAr: "إقامة إسبانيا غير الربحية",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Portugal D2 Ready Summary through the installed
 * app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedPortugalD2Programme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(PORTUGAL_D2_ENGLISH_SOURCE);
  const arabic = assetText(PORTUGAL_D2_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Portugal D2 Residence Visa",
    nameAr: "تأشيرة الإقامة البرتغالية D2",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Portugal D7 Ready Summary through the installed
 * app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedPortugalD7Programme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(PORTUGAL_D7_ENGLISH_SOURCE);
  const arabic = assetText(PORTUGAL_D7_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Portugal D7 Residence Visa",
    nameAr: "تأشيرة الإقامة البرتغالية D7",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

/**
 * Serves the latest active Portugal D8 Ready Summary through the installed
 * app's legacy fields, selecting only the phone-system language.
 */
function latestApprovedPortugalD8Programme(
  identity: ReadySummaryIdentity,
  summaryId: number,
  locale: PublicProgramLocale,
): PublicReadySummary | null {
  const english = assetText(PORTUGAL_D8_ENGLISH_SOURCE);
  const arabic = assetText(PORTUGAL_D8_ARABIC_SOURCE);
  if (!english || !arabic) return null;
  const programmeSections: BilingualProgrammeContent = {
    en: parseProgrammeContent(english),
    ar: parseProgrammeContent(arabic),
  };
  if (programmeSections.en.length !== 9 || programmeSections.ar.length !== 9) return null;
  const legacy = legacyLocalizedFields(programmeSections, locale);
  return {
    ...identity,
    nameEn: "Portugal D8 Digital Nomad Visa",
    nameAr: "تأشيرة البرتغال D8 للرحالة الرقميين",
    publicId: `ready-summary-${summaryId}`,
    slug: `ready-summary-${summaryId}`,
    summaryEn: legacy.summaryEn,
    summaryAr: legacy.summaryAr,
    readySummaryTitle: null,
    readySummaryTextEn: null,
    readySummaryTextAr: null,
    readySummaryPdfUrl: null,
    readySummaryUpdatedAt: null,
    imageUrl: null,
    sourceUrl: "https://elevay.vip",
    details: legacy.details,
    programmeSections,
  };
}

export function publicReadySummaryFromRecord(
  summary: Pick<MarketingReadySummary, "id" | "title" | "category" | "originalFileName" | "createdAt">,
  extractedText: string | null,
  locale: PublicProgramLocale = "en",
): PublicReadySummary | null {
  const identity = parseReadySummaryIdentity(summary.title, summary.originalFileName, summary.category);
  if (!identity) return null;
  if (identity.country === "Antigua & Barbuda") return userApprovedAntiguaProgramme(identity, locale);
  if (identity.country === "Saint Kitts & Nevis") return latestApprovedStKittsProgramme(identity, summary.id, locale);
  if (identity.country === "Dominica") return latestApprovedDominicaProgramme(identity, summary.id, locale);
  if (identity.country === "Grenada") return latestApprovedGrenadaProgramme(identity, summary.id, locale);
  if (identity.country === "Egypt") return latestApprovedEgyptProgramme(identity, summary.id, locale);
  if (identity.country === "Turkey") return latestApprovedTurkiyeProgramme(identity, summary.id, locale);
  if (identity.country === "Nauru") return latestApprovedNauruProgramme(identity, summary.id, locale);
  if (identity.country === "Saint Lucia") return latestApprovedSaintLuciaProgramme(identity, summary.id, locale);
  if (identity.country === "São Tomé and Príncipe") return latestApprovedSaoTomeProgramme(identity, summary.id, locale);
  if (identity.country === "Vanuatu") return latestApprovedVanuatuProgramme(identity, summary.id, locale);
  if (identity.country === "Canada") return latestApprovedCanadaProgramme(identity, summary.id, locale);
  if (identity.country === "Greece") return latestApprovedGreeceProgramme(identity, summary.id, locale);
  if (identity.country === "Hungary") return latestApprovedHungaryProgramme(identity, summary.id, locale);
  if (identity.country === "Latvia") return latestApprovedLatviaProgramme(identity, summary.id, locale);
  if (identity.country === "Malta" && /tax[\s-]*residence/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedMaltaTaxResidenceProgramme(identity, summary.id, locale);
  }
  if (identity.country === "Malta" && /nomad/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedMaltaNomadProgramme(identity, summary.id, locale);
  }
  if (identity.country === "Malta" && /mprp|permanent residence/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedMaltaMprpProgramme(identity, summary.id, locale);
  }
  if (identity.country === "Spain" && /digital[\s_-]*nomad|\bdnv\b|telework/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedSpainDigitalNomadProgramme(identity, summary.id, locale);
  }
  if (identity.country === "Spain" && /non[\s_-]*lucrative/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedSpainNonLucrativeProgramme(identity, summary.id, locale);
  }
  if (identity.country === "Spain" && /highly[\s_-]*qualified/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedSpainHighlyQualifiedProgramme(identity, summary.id, locale);
  }
  if (identity.country === "Spain" && /entrepreneur/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedSpainEntrepreneurProgramme(identity, summary.id, locale);
  }
  if (identity.country === "Portugal" && /\bd2\b/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedPortugalD2Programme(identity, summary.id, locale);
  }
  if (identity.country === "Portugal" && /\bd7\b/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedPortugalD7Programme(identity, summary.id, locale);
  }
  if (identity.country === "Portugal" && /\bd8\b/i.test(`${summary.title} ${summary.originalFileName}`)) {
    return latestApprovedPortugalD8Programme(identity, summary.id, locale);
  }
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

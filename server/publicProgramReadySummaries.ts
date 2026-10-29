import type { MarketingReadySummary, PublicProgram } from "../drizzle/schema";

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
  readySummaryTitle: string;
  readySummaryTextEn: string | null;
  readySummaryTextAr: string | null;
  readySummaryPdfUrl: string | null;
  readySummaryUpdatedAt: number;
  imageUrl: string | null;
  sourceUrl: string;
  details: unknown;
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

export function publicReadySummaryFromRecord(
  summary: Pick<MarketingReadySummary, "id" | "title" | "category" | "originalFileName" | "createdAt">,
  extractedText: string | null,
  pdfUrl: string | null,
  fallbackProgram?: Pick<PublicProgram, "imageUrl" | "sourceUrl" | "details">,
): PublicReadySummary | null {
  const identity = parseReadySummaryIdentity(summary.title, summary.originalFileName, summary.category);
  if (!identity) return null;
  const text = extractedText?.trim() || null;
  const excerpt = text ? text.replace(/\s+/g, " ").slice(0, 700).trim() : null;
  return {
    ...identity,
    publicId: `ready-summary-${summary.id}`,
    slug: `ready-summary-${summary.id}`,
    nameAr: ARABIC_COUNTRY_NAMES[identity.country] ?? null,
    summaryEn: excerpt,
    summaryAr: excerpt,
    readySummaryTitle: summary.title,
    readySummaryTextEn: text,
    readySummaryTextAr: text,
    readySummaryPdfUrl: pdfUrl,
    readySummaryUpdatedAt: summary.createdAt,
    imageUrl: fallbackProgram?.imageUrl ?? null,
    sourceUrl: pdfUrl || fallbackProgram?.sourceUrl || "https://elevay.vip",
    details: fallbackProgram?.details ?? null,
  };
}

export function hasReadySummaryForProgram(program: Pick<PublicProgram, "country" | "category">, summaries: ReadonlyArray<Pick<PublicReadySummary, "country" | "category">>) {
  const country = normalized(program.country);
  return summaries.some(summary => summary.category === program.category && normalized(summary.country) === country);
}

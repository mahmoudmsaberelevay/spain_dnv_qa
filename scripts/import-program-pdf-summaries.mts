import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { publicPrograms } from "../drizzle/schema";
import { getDb } from "../server/db";

type BilingualText = { en: string; ar: string };
type ExtractedProgram = {
  source_label: string;
  program_name_en: string;
  program_name_ar: string;
  country_en: string;
  country_ar: string;
  category: "residency" | "citizenship";
  overview_en: string;
  overview_ar: string;
  investment_options: Array<{
    title_en: string;
    title_ar: string;
    amount: string;
    notes_en: string;
    notes_ar: string;
  }>;
  processing_time_en: string;
  processing_time_ar: string;
  residency_requirement_en: string;
  residency_requirement_ar: string;
  benefits_en: string[];
  benefits_ar: string[];
  eligibility_en: string[];
  eligibility_ar: string[];
  family_en: string[];
  family_ar: string[];
  process_en: string[];
  process_ar: string[];
  fees_notes_en: string[];
  fees_notes_ar: string[];
  disclaimer_en: string;
  disclaimer_ar: string;
  source_coverage_note: string;
};

type Batch = { items: ExtractedProgram[] };

const slugBySourceLabel: Record<string, string | null> = {
  "Malta 2": null,
  Turkey: "citizenship-turkey",
  "Antigua and Barbuda": "citizenship-antigua-barbuda",
  Malta: "citizenship-malta-citizenship",
  "Saint Lucia": "citizenship-st-lucia",
  Dominica: "citizenship-dominica",
  Vanuatu: "citizenship-vanuatu",
  "Saint Kitts and Nevis": "citizenship-st-kitts-nevis",
  Grenada: "citizenship-grenada",
  Egypt: "citizenship-egypt",
  Australia: "residency-australia",
  "United States": "residency-united-states-green-card",
  "United Arab Emirates": "residency-united-arab-emirates",
  "Malta 3": "residency-malta",
  Spain: "residency-spain-2",
  Hungary: "residency-hungary",
  Portugal: "residency-portugal",
  Latvia: "residency-latvia",
  Greece: "residency-greece-2",
  Canada: "residency-canada-suv",
};

function readBatch(path: string): ExtractedProgram[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Batch;
  if (!Array.isArray(parsed.items)) throw new Error(`Invalid extraction batch: ${path}`);
  return parsed.items;
}

function bilingual(en: string, ar: string): BilingualText {
  return { en: en.trim(), ar: ar.trim() };
}

function toDetails(item: ExtractedProgram) {
  return {
    version: 1 as const,
    sourceLabel: item.source_label,
    programName: bilingual(item.program_name_en, item.program_name_ar),
    country: bilingual(item.country_en, item.country_ar),
    processingTime: bilingual(item.processing_time_en, item.processing_time_ar),
    residencyRequirement: bilingual(item.residency_requirement_en, item.residency_requirement_ar),
    investmentOptions: item.investment_options.map(option => ({
      title: bilingual(option.title_en, option.title_ar),
      amount: option.amount.trim(),
      notes: bilingual(option.notes_en, option.notes_ar),
    })),
    benefits: { en: item.benefits_en, ar: item.benefits_ar },
    eligibility: { en: item.eligibility_en, ar: item.eligibility_ar },
    family: { en: item.family_en, ar: item.family_ar },
    process: { en: item.process_en, ar: item.process_ar },
    feeNotes: { en: item.fees_notes_en, ar: item.fees_notes_ar },
    disclaimer: bilingual(item.disclaimer_en, item.disclaimer_ar),
    sourceCoverageNote: item.source_coverage_note,
  };
}

const apply = process.argv.includes("--apply");
const allItems = [
  ...readBatch("docs/program-content/batch-1.json"),
  ...readBatch("docs/program-content/batch-2.json"),
];
const labels = new Set(allItems.map(item => item.source_label));
const unknown = [...labels].filter(label => !(label in slugBySourceLabel));
if (unknown.length) throw new Error(`Unmapped source labels: ${unknown.join(", ")}`);

const importable = allItems.filter(item => slugBySourceLabel[item.source_label]);
if (importable.length !== 19) throw new Error(`Expected 19 usable summaries, received ${importable.length}`);

const db = await getDb();
if (!db) throw new Error("Database unavailable");

const results: Array<{ sourceLabel: string; slug: string; action: "validated" | "updated" }> = [];
for (const item of importable) {
  const slug = slugBySourceLabel[item.source_label];
  if (!slug) continue;
  const [row] = await db.select().from(publicPrograms).where(eq(publicPrograms.slug, slug)).limit(1);
  if (!row) throw new Error(`Program row not found for ${item.source_label}: ${slug}`);
  if (row.category !== item.category) {
    throw new Error(`Category mismatch for ${item.source_label}: database=${row.category}, PDF=${item.category}`);
  }
  if (apply) {
    await db
      .update(publicPrograms)
      .set({
        summaryEn: item.overview_en.trim(),
        summaryAr: item.overview_ar.trim(),
        details: toDetails(item),
        isOverridden: true,
        isActive: true,
      })
      .where(eq(publicPrograms.id, row.id));
  }
  results.push({ sourceLabel: item.source_label, slug, action: apply ? "updated" : "validated" });
}

console.log(JSON.stringify({ apply, imported: results.length, skipped: ["Malta 2 (blank source PDF)"], results }, null, 2));
process.exit(0);

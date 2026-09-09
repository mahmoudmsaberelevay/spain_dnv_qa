import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { MARKETING_COMPARISON_PROGRAMS, getMarketingComparisonProgram, type MarketingComparisonCategory } from "../shared/marketingComparisonPrograms";

export const PROGRAM_COMPARISON_KEYS = [
  "spain_dnv",
  "portugal_d7",
  "portugal_d8",
  "portugal_d2",
  "greece_golden_visa",
  "malta_mprp",
  "uk_expansion_worker",
  "canada_skilled_migration",
  "dominica",
  "grenada",
  "egypt",
  "st_kitts",
  "st_lucia",
  "antigua",
  "vanuatu",
  "nauru",
  "sao_tome",
  "turkey",
] as const;

export type ProgramComparisonKey = (typeof PROGRAM_COMPARISON_KEYS)[number];
export type ProgramComparisonLocale = "en" | "ar";

export const PROGRAM_COMPARISON_OPTIONS: Array<{
  key: ProgramComparisonKey;
  labelEn: string;
  labelAr: string;
  flag: string;
  category: MarketingComparisonCategory;
}> = MARKETING_COMPARISON_PROGRAMS.map(program => ({
  key: program.key as ProgramComparisonKey,
  labelEn: program.label,
  labelAr: ({
    spain_dnv: "إقامة إسبانيا للعمل عن بُعد",
    portugal_d7: "إقامة البرتغال D7",
    portugal_d8: "إقامة البرتغال للعمل عن بُعد D8",
    portugal_d2: "إقامة رواد الأعمال في البرتغال D2",
    greece_golden_visa: "الإقامة الذهبية في اليونان",
    malta_mprp: "الإقامة الدائمة في مالطا",
    uk_expansion_worker: "عامل توسع الأعمال في المملكة المتحدة",
    canada_skilled_migration: "الهجرة الماهرة إلى كندا",
    dominica: "دومينيكا",
    grenada: "غرينادا",
    egypt: "مصر",
    st_kitts: "سانت كيتس ونيفيس",
    st_lucia: "سانت لوسيا",
    antigua: "أنتيغوا وبربودا",
    vanuatu: "فانواتو",
    nauru: "ناورو",
    sao_tome: "ساو تومي وبرينسيب",
    turkey: "تركيا",
  } as Record<ProgramComparisonKey, string>)[program.key as ProgramComparisonKey],
  flag: program.flag,
  category: program.category,
}));

export const PROGRAM_COMPARISON_CRITERIA = [
  { key: "governmentCost", labelEn: "Government Cost", labelAr: "التكلفة الحكومية" },
  { key: "processingTime", labelEn: "Processing Time", labelAr: "مدة المعالجة" },
  { key: "familyIncluded", labelEn: "Family Included", labelAr: "أفراد العائلة المشمولون" },
  { key: "investmentType", labelEn: "Investment Type", labelAr: "نوع الاستثمار" },
  { key: "qualification", labelEn: "Qualification", labelAr: "متطلبات التأهل" },
  { key: "routeToCitizenship", labelEn: "Route to Citizenship", labelAr: "مسار الحصول على الجنسية" },
  { key: "routeToPR", labelEn: "Route to Permanent Residency", labelAr: "مسار الإقامة الدائمة" },
  { key: "renewal", labelEn: "Ways to Renew", labelAr: "طريقة التجديد" },
] as const;

type Fees = {
  governmentFeePerApplicant?: number;
  governmentFeePerFamily?: number;
  governmentFeeNote?: string;
  dueDiligenceFeeMain?: number;
};

type Investment = {
  name: string;
  type: string;
  costSingle: number;
  costFamily4?: number;
  holdPeriodYears?: number;
};

type ProgramEntry = {
  country: string;
  processingTime: string;
  visaFreeCountries: string;
  residencyRequirement: string;
  familyIncluded: string;
  dualCitizenship: boolean;
  investmentOptions?: Investment[];
  investmentSummary?: string;
  applicationFees?: Fees;
  governmentCost?: string;
  qualificationSummary?: string;
  routeToCitizenship: string;
  routeToPermanentResidency: string;
  renewalMethod: string;
  specialFeatures: string[];
  officialSourceUrl?: string;
};

const CATALOG: Record<ProgramComparisonKey, ProgramEntry> = {
  spain_dnv: { country: "Spain Digital Nomad Residency", processingTime: "Decision time varies by filing authority; verify the current service standard before filing", visaFreeCountries: "Schengen travel subject to residence-card and 90/180-day travel rules", residencyRequirement: "Designed for residence in Spain while working remotely", familyIncluded: "Eligible accompanying family members may apply under the applicable international teleworker rules; verify dependency evidence before filing", dualCitizenship: false, investmentSummary: "No capital investment; qualifying remote employment or professional activity and sufficient financial means are required", governmentCost: "Government and residence-card fees vary by filing route and location; verify before filing", qualificationSummary: "Non-EU remote employee or professional working primarily for companies outside Spain; professional work for Spanish clients is limited, and education or at least 3 years of professional experience plus an established remote relationship is required", routeToCitizenship: "No direct citizenship grant; ordinary Spanish nationality rules and residence conditions apply", routeToPermanentResidency: "May contribute to qualifying legal residence under ordinary Spanish immigration rules; continuity and physical-presence conditions apply", renewalMethod: "Visa validity is up to 1 year and an eligible in-country residence authorization can be issued for up to 3 years; renewal or extension requires continued compliance", specialFeatures: ["Remote-work residence pathway", "Official in-country authorization can be issued for up to 3 years"], officialSourceUrl: "https://prie.comercio.gob.es/en-us/paginas/teletrabajadores-caracter-internacional.aspx" },
  portugal_d7: { country: "Portugal D7 Residency", processingTime: "Decision times vary by consulate and AIMA; verify the current service standard before filing", visaFreeCountries: "Schengen travel subject to residence-card and 90/180-day travel rules", residencyRequirement: "A residence pathway intended for people living from stable own or passive income", familyIncluded: "An accompanying family-member residence visa is available, subject to eligibility and supporting evidence", dualCitizenship: false, investmentSummary: "No prescribed capital investment; stable passive or own-income evidence, accommodation, insurance, and subsistence documentation apply", governmentCost: "Government, consular, and residence-permit fees vary; verify before filing", qualificationSummary: "Applicant must qualify for Portugal's residence visa for retirement or people living from passive income and satisfy the current documentation requirements", routeToCitizenship: "No direct citizenship grant; standard Portuguese nationality eligibility and legal-residence conditions apply", routeToPermanentResidency: "May lead to permanent residence under standard Portuguese legal-residence rules and conditions", renewalMethod: "The residence visa is valid for 4 months and requires a residence-permit application to AIMA; later renewal requires continued eligibility", specialFeatures: ["Passive-income residence pathway", "Family-accompaniment route available"], officialSourceUrl: "https://vistos.mne.gov.pt/en/national-visas/general-information/type-of-visa" },
  portugal_d8: { country: "Portugal D8 Digital Nomad Residency", processingTime: "Decision times vary by consulate and AIMA; verify the current service standard before filing", visaFreeCountries: "Schengen travel subject to residence-card and 90/180-day travel rules", residencyRequirement: "A residence pathway for professional activity performed remotely", familyIncluded: "An accompanying family-member residence visa is available, subject to eligibility and supporting evidence", dualCitizenship: false, investmentSummary: "No prescribed capital investment; qualifying remote activity, current income evidence, accommodation, insurance, and subsistence documentation apply", governmentCost: "Government, consular, and residence-permit fees vary; verify before filing", qualificationSummary: "Applicant must perform qualifying professional activity remotely and meet the current Portuguese digital-nomad residence documentation and income rules", routeToCitizenship: "No direct citizenship grant; standard Portuguese nationality eligibility and legal-residence conditions apply", routeToPermanentResidency: "May lead to permanent residence under standard Portuguese legal-residence rules and conditions", renewalMethod: "The residence visa is valid for 4 months and requires a residence-permit application to AIMA; later renewal requires continued eligibility", specialFeatures: ["Remote-work residence pathway", "Family-accompaniment route available"], officialSourceUrl: "https://vistos.mne.gov.pt/en/national-visas/general-information/type-of-visa" },
  portugal_d2: { country: "Portugal D2 Entrepreneur Residency", processingTime: "Decision times vary by consulate and AIMA; verify the current service standard before filing", visaFreeCountries: "Schengen travel subject to residence-card and 90/180-day travel rules", residencyRequirement: "A residence pathway for independent professional activity or entrepreneurs", familyIncluded: "An accompanying family-member residence visa is available, subject to eligibility and supporting evidence", dualCitizenship: false, investmentSummary: "No single universal investment threshold is stated on the official visa-type page; a credible independent-activity or entrepreneurial basis and sufficient resources must be documented", governmentCost: "Government, consular, and residence-permit fees vary; verify before filing", qualificationSummary: "Applicant must qualify for Portugal's residence visa for independent work or entrepreneurs and satisfy the current business, professional, accommodation, insurance, and subsistence documentation requirements", routeToCitizenship: "No direct citizenship grant; standard Portuguese nationality eligibility and legal-residence conditions apply", routeToPermanentResidency: "May lead to permanent residence under standard Portuguese legal-residence rules and conditions", renewalMethod: "The residence visa is valid for 4 months and requires a residence-permit application to AIMA; later renewal requires continued eligibility", specialFeatures: ["Entrepreneur and independent-work pathway", "Family-accompaniment route available"], officialSourceUrl: "https://vistos.mne.gov.pt/en/national-visas/general-information/type-of-visa" },
  greece_golden_visa: { country: "Greece Golden Visa", processingTime: "Processing time varies by investment route, documentation, and authority", visaFreeCountries: "Schengen travel subject to residence-card and 90/180-day travel rules", residencyRequirement: "Investor permanent residence permit; ongoing qualifying investment or lease conditions apply", familyIncluded: "Eligible family members may be included under the investor-residence rules; verify relationship and dependency conditions", dualCitizenship: false, investmentSummary: "Qualifying real-estate or other statutory investor route; current thresholds depend on the route, property use, and location", governmentCost: "Investment threshold varies; official permit, electronic-fee, insurance, and residence-card costs also apply", qualificationSummary: "Third-country investor must complete a qualifying statutory investment and provide the required ownership, payment, insurance, and identity evidence", routeToCitizenship: "No direct citizenship grant; ordinary naturalisation has separate residence and eligibility requirements", routeToPermanentResidency: "The official route is an investor permanent residence permit", renewalMethod: "Renewable while the qualifying investment or lease remains in force and other renewal conditions are met", specialFeatures: ["Investor permanent residence", "Multiple qualifying investment structures under current law"], officialSourceUrl: "https://migration.gov.gr/en/golden-visa/" },
  malta_mprp: { country: "Malta Permanent Residence Programme", processingTime: "Structured due-diligence process; decision time varies by application complexity and verification", visaFreeCountries: "Schengen travel for up to 90 days in any 180-day period", residencyRequirement: "Permanent residence in Malta, subject to maintaining programme obligations", familyIncluded: "The official programme allows eligible family members and can include up to four generations in one application", dualCitizenship: false, investmentSummary: "Qualifying property, government contribution, NGO donation, administrative fee, capital-asset test, insurance, and residence-card requirements", governmentCost: "€60,000 administration fee, €37,000 government contribution, €7,500 per adult dependant excluding spouse, €2,000 NGO donation, plus qualifying property and card fees", qualificationSummary: "Non-EU, non-EEA, non-Swiss applicant using a Licensed Agent, with qualifying capital assets, stable resources, clean record, insurance, property, contribution, donation, and due-diligence compliance", routeToCitizenship: "MPRP is legally distinct from citizenship and grants no direct citizenship", routeToPermanentResidency: "Grants permanent residence in Malta", renewalMethod: "Qualifying property must be retained for at least 5 years, followed by continued maintenance of residential property in Malta; residence cards are renewed as required", specialFeatures: ["Permanent residence", "Up to four generations may be included"], officialSourceUrl: "https://residencymalta.gov.mt/legal-framework-mprp-2/" },
  uk_expansion_worker: { country: "UK Expansion Worker", processingTime: "Usually 3 weeks for applications outside the UK and 8 weeks inside the UK after identity and documents are completed", visaFreeCountries: "No general Schengen or visa-free benefit is granted by this UK work route", residencyRequirement: "Temporary sponsored work route for establishing a UK branch of an overseas business", familyIncluded: "Eligible partner and children may apply as dependants", dualCitizenship: false, investmentSummary: "No fixed personal investment; employer sponsorship, eligible occupation, qualifying overseas employment, salary, and maintenance requirements apply", governmentCost: "Application fee, healthcare surcharge for each year, and maintenance funds apply; verify current amounts before filing", qualificationSummary: "Senior manager or specialist employee of an overseas business that has not started trading in the UK, with a valid sponsor certificate, qualifying employment, occupation, and salary", routeToCitizenship: "No direct citizenship route and time on this route does not itself provide settlement", routeToPermanentResidency: "The official route does not permit an application for permanent settlement", renewalMethod: "Initial permission is generally up to 12 months and may be extended by 12 months, with a maximum of 2 years on this route", specialFeatures: ["Business expansion work route", "Eligible dependants may accompany"], officialSourceUrl: "https://www.gov.uk/uk-expansion-worker-visa" },
  canada_skilled_migration: { country: "Canada Express Entry Skilled Migration", processingTime: "Varies by programme and application", visaFreeCountries: "Canadian travel-document benefits arise only after later citizenship; permanent residence itself is not a passport", residencyRequirement: "Successful invited applicants apply directly for Canadian permanent residence", familyIncluded: "Spouse and dependent children may be included, subject to eligibility and fees", dualCitizenship: false, investmentSummary: "No investment purchase; eligibility and ranking depend on the applicable skilled-worker programme, language, education, work history, points, documents, and any required settlement funds", governmentCost: "CAD 1,590 principal applicant, CAD 1,590 spouse, and CAD 270 per dependent child on the official 2026 Express Entry page", qualificationSummary: "Candidate qualifies under a managed skilled-worker programme, creates an Express Entry profile, enters the pool, and must receive an invitation before applying for permanent residence", routeToCitizenship: "Permanent residents may later qualify under Canada's separate citizenship residence and eligibility rules; there is no direct citizenship grant", routeToPermanentResidency: "Express Entry manages applications for permanent residence", renewalMethod: "Permanent resident status is maintained under Canadian residence obligations; PR cards are renewed separately", specialFeatures: ["Points-based selection", "Direct permanent-residence application after invitation"], officialSourceUrl: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html" },
  dominica: { country: "Dominica", processingTime: "3-6 months", visaFreeCountries: "140+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "EDF Donation", type: "donation", costSingle: 100000, costFamily4: 175000 }, { name: "Real Estate", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1000, dueDiligenceFeeMain: 7500 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years; no investment renewal required", specialFeatures: ["One of the most affordable CBI programs globally"] },
  grenada: { country: "Grenada", processingTime: "3-6 months", visaFreeCountries: "144+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "NTF Donation", type: "donation", costSingle: 150000, costFamily4: 200000 }, { name: "Real Estate", type: "real_estate", costSingle: 220000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1500, dueDiligenceFeeMain: 5000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["E-2 Treaty with USA", "Access to China visa-free"] },
  egypt: { country: "Egypt", processingTime: "6-9 months", visaFreeCountries: "66+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children of any age", dualCitizenship: true, investmentOptions: [{ name: "Central Bank Deposit", type: "donation", costSingle: 250000 }, { name: "Real Estate", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 10000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["Multiple investment pathways", "Strategic location bridging Africa, Middle East, Europe"] },
  st_kitts: { country: "Saint Kitts & Nevis", processingTime: "45-60 days (Accelerated)", visaFreeCountries: "157+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, grandparents", dualCitizenship: true, investmentOptions: [{ name: "SISC Donation", type: "donation", costSingle: 250000, costFamily4: 300000 }, { name: "Real Estate", type: "real_estate", costSingle: 400000, holdPeriodYears: 7 }], applicationFees: { governmentFeePerApplicant: 7500, dueDiligenceFeeMain: 10000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["Oldest CBI program in the world (since 1984)", "Fastest processing globally"] },
  st_lucia: { country: "Saint Lucia", processingTime: "3-6 months", visaFreeCountries: "145+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "NEF Donation", type: "donation", costSingle: 100000, costFamily4: 165000 }, { name: "Real Estate", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 2000, dueDiligenceFeeMain: 7500 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["One of the most affordable Caribbean CBI programs"] },
  antigua: { country: "Antigua & Barbuda", processingTime: "3-6 months", visaFreeCountries: "150+", residencyRequirement: "Must spend 5 days in Antigua within first 5 years", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "NDF Donation", type: "donation", costSingle: 100000, costFamily4: 100000 }, { name: "Real Estate", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerFamily: 30000, dueDiligenceFeeMain: 7500 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["UWI Fund option includes 1 year of tuition"] },
  vanuatu: { country: "Vanuatu", processingTime: "30-60 days", visaFreeCountries: "130+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children under 18", dualCitizenship: true, investmentOptions: [{ name: "DSP Donation", type: "donation", costSingle: 130000, costFamily4: 200000 }], applicationFees: { governmentFeePerApplicant: 5000, dueDiligenceFeeMain: 5000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["One of the fastest CBI programs globally", "No income tax, capital gains tax, or inheritance tax"] },
  nauru: { country: "Nauru", processingTime: "3-6 months", visaFreeCountries: "88+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children", dualCitizenship: true, investmentOptions: [{ name: "Government Fund Contribution", type: "donation", costSingle: 105000 }], applicationFees: { governmentFeeNote: "Included in contribution", dueDiligenceFeeMain: 5000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["No income tax in Nauru", "Emerging CBI program with low entry cost"] },
  sao_tome: { country: "Sao Tome & Principe", processingTime: "3-6 months", visaFreeCountries: "70+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children", dualCitizenship: true, investmentOptions: [{ name: "Government Fund Contribution", type: "donation", costSingle: 50000 }], applicationFees: { governmentFeeNote: "Included in contribution", dueDiligenceFeeMain: 3000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["Most affordable CBI program globally", "Favourable tax environment"] },
  turkey: { country: "Turkey", processingTime: "3-6 months", visaFreeCountries: "110+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children under 18", dualCitizenship: true, investmentOptions: [{ name: "Real Estate", type: "real_estate", costSingle: 400000, holdPeriodYears: 3 }], applicationFees: { governmentFeePerApplicant: 535 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["Access to Japan, Singapore, South Korea visa-free", "No Turkish taxes unless residing in Turkey"] },
};

const programResultSchema = z.object({
  programKey: z.enum(PROGRAM_COMPARISON_KEYS),
  governmentCost: z.string().min(1).max(1200),
  processingTime: z.string().min(1).max(1200),
  familyIncluded: z.string().min(1).max(1200),
  investmentType: z.string().min(1).max(1200),
  qualification: z.string().min(1).max(1200),
  routeToCitizenship: z.string().min(1).max(1200),
  routeToPR: z.string().min(1).max(1200),
  renewal: z.string().min(1).max(1200),
});

const aiResultSchema = z.object({
  programs: z.array(programResultSchema).min(2).max(6),
  summary: z.string().min(1).max(10000),
});

export type ProgramComparisonResult = {
  programs: ProgramComparisonKey[];
  comparison: Record<string, Record<string, string>>;
  summary: string;
  generatedAt: string;
  locale: ProgramComparisonLocale;
  model: "gpt-5-mini";
  disclaimer: string;
};

export function validateProgramComparisonKeys(input: unknown): ProgramComparisonKey[] {
  const parsed = z.array(z.enum(PROGRAM_COMPARISON_KEYS)).min(2).max(6).parse(input);
  if (new Set(parsed).size !== parsed.length) throw new Error("duplicate_programs");
  return parsed;
}

function describeProgram(key: ProgramComparisonKey, program: ProgramEntry) {
  const metadata = getMarketingComparisonProgram(key);
  const governmentFee = program.governmentCost ?? (program.applicationFees?.governmentFeePerApplicant
    ? `$${program.applicationFees.governmentFeePerApplicant.toLocaleString()}/applicant`
    : program.applicationFees?.governmentFeePerFamily
      ? `$${program.applicationFees.governmentFeePerFamily.toLocaleString()}/family`
      : program.applicationFees?.governmentFeeNote || "Verify before filing");
  const dueDiligenceFee = program.applicationFees?.dueDiligenceFeeMain
    ? `$${program.applicationFees.dueDiligenceFeeMain.toLocaleString()} main applicant`
    : "N/A";
  const investmentOptions = (program.investmentOptions ?? []).map(option => {
    let text = `${option.name} ($${option.costSingle.toLocaleString()} single`;
    if (option.costFamily4) text += `, $${option.costFamily4.toLocaleString()} family of 4`;
    if (option.holdPeriodYears) text += `, hold ${option.holdPeriodYears} years`;
    return `${text})`;
  }).join("; ");
  const investments = program.investmentSummary ?? (investmentOptions || "Verify current qualifying route before filing");
  return [
    `--- ${program.country} ---`,
    `Program Category: ${metadata?.category ?? "unknown"}`,
    `Processing Time: ${program.processingTime}`,
    `Visa-Free Countries: ${program.visaFreeCountries}`,
    `Residency Requirement: ${program.residencyRequirement}`,
    `Family Included: ${program.familyIncluded}`,
    `Dual Citizenship: ${program.dualCitizenship ? "Yes" : "No"}`,
    `Investment Options: ${investments}`,
    `Government Fee: ${governmentFee}`,
    `Due Diligence Fee: ${dueDiligenceFee}`,
    `Qualification: ${program.qualificationSummary ?? program.specialFeatures.join(", ")}`,
    `Route to Citizenship: ${program.routeToCitizenship}`,
    `Route to PR: ${program.routeToPermanentResidency}`,
    `Renewal: ${program.renewalMethod}`,
    `Special Features: ${program.specialFeatures.join(", ")}`,
    `Official Source: ${program.officialSourceUrl ?? "Existing ELEVAY comparison reference data"}`,
  ].join("\n");
}

export async function comparePrograms(input: { programKeys: unknown; locale?: unknown }): Promise<ProgramComparisonResult> {
  const programKeys = validateProgramComparisonKeys(input.programKeys);
  const locale: ProgramComparisonLocale = input.locale === "ar" ? "ar" : "en";
  const requestedLanguage = locale === "ar" ? "Arabic" : "English";
  const programData = programKeys.map(key => describeProgram(key, CATALOG[key])).join("\n\n");
  const criteriaProperties = Object.fromEntries(PROGRAM_COMPARISON_CRITERIA.map(item => [item.key, { type: "string" }]));

  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert ELEVAY citizenship and residency-by-investment advisor. Compare only the supplied facts. Write in ${requestedLanguage}. Be objective, do not guarantee approval, do not provide tax or legal advice, and clearly note that fees and requirements must be verified before applying.`,
      },
      {
        role: "user",
        content: `Compare the selected programs across the eight required criteria. Return one object per requested program and a professional 3-4 paragraph ELEVAY analysis explaining key differences and suitable client profiles. Use these exact program keys and no others: ${programKeys.join(", ")}.\n\nProgram data:\n${programData}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "elevay_program_comparison",
        strict: true,
        schema: {
          type: "object",
          properties: {
            programs: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: {
                type: "object",
                properties: { programKey: { type: "string", enum: programKeys }, ...criteriaProperties },
                required: ["programKey", ...PROGRAM_COMPARISON_CRITERIA.map(item => item.key)],
                additionalProperties: false,
              },
            },
            summary: { type: "string" },
          },
          required: ["programs", "summary"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("comparison_response_empty");
  const parsed = aiResultSchema.parse(JSON.parse(content));
  const returnedKeys = parsed.programs.map(item => item.programKey);
  if (returnedKeys.length !== programKeys.length || new Set(returnedKeys).size !== returnedKeys.length || programKeys.some(key => !returnedKeys.includes(key))) {
    throw new Error("comparison_response_program_mismatch");
  }

  const comparison = Object.fromEntries(parsed.programs.map(program => {
    const { programKey, ...criteria } = program;
    return [programKey, criteria];
  }));
  return {
    programs: programKeys,
    comparison,
    summary: parsed.summary,
    generatedAt: new Date().toISOString(),
    locale,
    model: "gpt-5-mini",
    disclaimer: locale === "ar"
      ? "هذه المقارنة لأغراض معلوماتية فقط. تتغير الرسوم والمتطلبات، ويجب التحقق منها قبل التقديم. لا تضمن إليفاي الموافقة ولا تقدم هذه النتيجة استشارة قانونية أو ضريبية."
      : "This comparison is for information only. Fees and requirements change and must be verified before applying. ELEVAY does not guarantee approval, and this result is not legal or tax advice.",
  };
}

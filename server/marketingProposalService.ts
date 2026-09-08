import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";

export type ProposalFees = {
  governmentFeePerApplicant?: number;
  governmentFeePerFamily?: number;
  governmentFeeNote?: string;
  dueDiligenceFeeMain?: number;
  dueDiligenceFeeDependents?: number;
  processingFeePerApplicant?: number;
};

export type ProposalInvestment = {
  name: string;
  type: "donation" | "real_estate";
  costSingle: number;
  costCouple?: number;
  costFamily4?: number;
  costFamily5plus?: number;
  holdPeriodYears?: number;
};

export type ProposalEntry = {
  country: string;
  processingTime: string;
  visaFreeCountries: string;
  residencyRequirement: string;
  familyIncluded: string;
  investmentOptions: ProposalInvestment[];
  applicationFees: ProposalFees;
  specialFeatures: string[];
};

export const PROPOSAL_PROGRAMS: Record<string, ProposalEntry> = {
  dominica: { country: "Dominica", processingTime: "3-6 months", visaFreeCountries: "140+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "Economic Diversification Fund (EDF)", type: "donation", costSingle: 100000, costFamily4: 175000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1000, dueDiligenceFeeMain: 7500, dueDiligenceFeeDependents: 4000, processingFeePerApplicant: 2000 }, specialFeatures: ["One of the most affordable CBI programs globally", "140+ visa-free countries"] },
  grenada: { country: "Grenada", processingTime: "3-6 months", visaFreeCountries: "144+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "National Transformation Fund (NTF)", type: "donation", costSingle: 150000, costFamily4: 200000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 220000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1500, dueDiligenceFeeMain: 5000, dueDiligenceFeeDependents: 2500, processingFeePerApplicant: 1500 }, specialFeatures: ["E-2 Treaty with USA", "Access to China visa-free"] },
  egypt: { country: "Egypt", processingTime: "6-9 months", visaFreeCountries: "66+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children of any age", investmentOptions: [{ name: "Central Bank of Egypt Deposit", type: "donation", costSingle: 250000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 10000 }, specialFeatures: ["Multiple investment pathways", "Strategic location bridging Africa, Middle East, Europe"] },
  st_kitts: { country: "Saint Kitts & Nevis", processingTime: "45-60 days (Accelerated)", visaFreeCountries: "157+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, grandparents", investmentOptions: [{ name: "Sustainable Island State Contribution (SISC)", type: "donation", costSingle: 250000, costFamily4: 300000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 400000, holdPeriodYears: 7 }], applicationFees: { governmentFeePerApplicant: 7500, dueDiligenceFeeMain: 10000, dueDiligenceFeeDependents: 7500, processingFeePerApplicant: 4000 }, specialFeatures: ["Oldest CBI program in the world (since 1984)", "157+ visa-free countries"] },
  st_lucia: { country: "Saint Lucia", processingTime: "3-6 months", visaFreeCountries: "145+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "National Economic Fund (NEF)", type: "donation", costSingle: 100000, costFamily4: 165000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 2000, dueDiligenceFeeMain: 7500, dueDiligenceFeeDependents: 5000, processingFeePerApplicant: 2000 }, specialFeatures: ["One of the most affordable Caribbean CBI programs"] },
  antigua: { country: "Antigua & Barbuda", processingTime: "3-6 months", visaFreeCountries: "150+", residencyRequirement: "Must spend 5 days in Antigua within first 5 years", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "National Development Fund (NDF)", type: "donation", costSingle: 100000, costFamily4: 100000, costFamily5plus: 125000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerFamily: 30000, dueDiligenceFeeMain: 7500, dueDiligenceFeeDependents: 2000, processingFeePerApplicant: 1500 }, specialFeatures: ["UWI Fund option includes 1 year of tuition"] },
  sao_tome: { country: "Sao Tome & Principe", processingTime: "3-6 months", visaFreeCountries: "70+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children", investmentOptions: [{ name: "Government Fund Contribution", type: "donation", costSingle: 50000 }], applicationFees: { governmentFeeNote: "Included in contribution", dueDiligenceFeeMain: 3000, processingFeePerApplicant: 1500 }, specialFeatures: ["Most affordable CBI program globally", "Favourable tax environment"] },
};

const narrativeSchema = z.object({
  programSummary: z.string().min(1),
  recommendation: z.string().min(1),
});

type ProposalInput = {
  programKey: string;
  investmentType: "donation" | "real_estate";
  familyMembers: number;
};

type LlmInvoker = (params: InvokeParams) => Promise<InvokeResult>;

function extractResponseText(result: InvokeResult): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function fallbackNarrative(program: ProposalEntry, option: ProposalInvestment, familyMembers: number, totalCost: number) {
  const familyLabel = familyMembers === 1 ? "the main applicant" : `a family of ${familyMembers}`;
  return {
    programSummary: `${program.country}'s citizenship-by-investment programme offers ${option.name.toLowerCase()} as the selected route for ${familyLabel}. The current reference estimate is USD ${totalCost.toLocaleString("en-US")}, with an indicative processing time of ${program.processingTime}. ${program.residencyRequirement}.`,
    recommendation: `ELEVAY recommends confirming eligibility, dependent definitions, source-of-funds evidence, and the latest government fee schedule before proceeding. The client should also review the selected route's holding obligations, application risks, and complete professional fee quotation with an ELEVAY consultant before making any commitment.`,
  };
}

export async function generateProgramProposal(input: ProposalInput, llm: LlmInvoker = invokeLLM) {
  const program = PROPOSAL_PROGRAMS[input.programKey];
  if (!program) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown program" });

  const option = program.investmentOptions.find((entry) => entry.type === input.investmentType);
  if (!option) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${input.investmentType} not available for ${program.country}` });
  }

  const familyMembers = input.familyMembers;
  let investmentCost = option.costSingle;
  if (familyMembers >= 5 && option.costFamily5plus) investmentCost = option.costFamily5plus;
  else if (familyMembers >= 3 && option.costFamily4) investmentCost = option.costFamily4;
  else if (familyMembers === 2 && option.costCouple) investmentCost = option.costCouple;

  const fees = program.applicationFees;
  const dependents = Math.max(0, familyMembers - 1);
  const governmentFee = fees.governmentFeePerApplicant
    ? fees.governmentFeePerApplicant * familyMembers
    : fees.governmentFeePerFamily || 0;
  const dueDiligenceFee = (fees.dueDiligenceFeeMain || 0) + (fees.dueDiligenceFeeDependents || 0) * dependents;
  const processingFee = (fees.processingFeePerApplicant || 0) * familyMembers;
  const totalCost = investmentCost + governmentFee + dueDiligenceFee + processingFee;

  const notes: string[] = [];
  if (option.holdPeriodYears) notes.push(`The property must be held for a minimum of ${option.holdPeriodYears} years.`);
  if (program.residencyRequirement !== "No residency requirement") notes.push(`Residency requirement: ${program.residencyRequirement}`);
  notes.push("Legal fees and ELEVAY service fees are not included in this estimate. Please contact your consultant for a full quote.");

  const proposalPrompt =
    `Write a professional programme proposal for a client interested in ${program.country} Citizenship by Investment.\n\n` +
    `Details:\n- Investment Type: ${input.investmentType === "donation" ? "Donation/Contribution" : "Real Estate"}` +
    `\n- Investment Amount: $${investmentCost.toLocaleString()}` +
    `\n- Total Estimated Cost: $${totalCost.toLocaleString()} for ${familyMembers} family member${familyMembers > 1 ? "s" : ""}` +
    `\n- Processing Time: ${program.processingTime}` +
    `\n- Visa-Free Countries: ${program.visaFreeCountries}` +
    `\n- Family Included: ${program.familyIncluded}` +
    `\n- Special Features: ${program.specialFeatures.join(", ")}`;

  let narrative = fallbackNarrative(program, option, familyMembers, totalCost);
  let generationMode: "ai" | "standard" = "standard";

  try {
    const response = await llm({
      model: "gemini-3-flash-preview",
      maxTokens: 2048,
      messages: [
        { role: "system", content: "You are an expert citizenship and residency by investment advisor at ELEVAY. Write professional, factual proposals for high-net-worth clients. Do not guarantee approval. Output only the requested JSON." },
        { role: "user", content: proposalPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "elevay_program_proposal",
          strict: true,
          schema: {
            type: "object",
            properties: {
              programSummary: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["programSummary", "recommendation"],
            additionalProperties: false,
          },
        },
      },
    });
    narrative = narrativeSchema.parse(JSON.parse(extractResponseText(response)));
    generationMode = "ai";
  } catch {
    console.warn("[MarketingProposal] AI narrative unavailable; returned the deterministic programme proposal.");
  }

  return {
    country: program.country,
    investmentType: input.investmentType,
    familyMembers,
    breakdown: { investmentCost, governmentFee, dueDiligenceFee, processingFee, otherFees: 0, totalCost, notes },
    ...narrative,
    generationMode,
    generatedAt: new Date().toISOString(),
  };
}

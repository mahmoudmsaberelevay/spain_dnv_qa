import { z } from "zod";
import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";
import { calculateProgramProposal, type ProgramProposalInput } from "./marketingProposalCalculator";

const narrativeSchema = z.object({
  programSummary: z.string().min(1),
  recommendation: z.string().min(1),
});

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

function money(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fallbackNarrative(calculation: ReturnType<typeof calculateProgramProposal>) {
  const totalStatement = calculation.quoteStatus === "not_calculable"
    ? "The supplied source does not contain enough monetary information to calculate a complete total for this route."
    : `The total of all source-supported, one-time calculable amounts is ${money(calculation.currency, calculation.totalKnownCost)}.`;
  const exclusions = calculation.unresolvedCosts.length > 0
    ? ` Costs requiring confirmation are excluded and listed separately: ${calculation.unresolvedCosts.join(" ")}`
    : "";
  return {
    programSummary: `${calculation.programName} has been configured for the ${calculation.routeLabel} route and ${calculation.familyMembers} applicant${calculation.familyMembers === 1 ? "" : "s"}. ${totalStatement}${exclusions}`,
    recommendation: "ELEVAY recommends confirming eligibility, source-of-funds evidence, dependant definitions, and the current government fee schedule before the client makes any commitment. This proposal separates calculable source amounts from recurring, optional, ambiguous, and request-only costs and never guarantees approval.",
  };
}

export async function generateProgramProposal(input: ProgramProposalInput, llm: LlmInvoker = invokeLLM) {
  const calculation = calculateProgramProposal(input);
  const lineItems = calculation.lineItems.map((line) => ({
    label: line.label,
    amount: line.amount == null ? "Confirmation required" : money(calculation.currency, line.amount),
    formula: line.formula,
    includedInTotal: line.includedInTotal,
  }));
  const proposalPrompt = [
    `Write a professional ${calculation.programType.toLowerCase()} programme proposal for ${calculation.programName}.`,
    `Selected route: ${calculation.routeLabel}.`,
    `Applicants: ${calculation.familyMembers}.`,
    `Quote status: ${calculation.quoteStatus}.`,
    `Known one-time total: ${money(calculation.currency, calculation.totalKnownCost)}.`,
    `Selected criteria: ${JSON.stringify(calculation.criteriaSnapshot)}.`,
    `Itemized source-supported amounts: ${JSON.stringify(lineItems)}.`,
    `Assumptions: ${calculation.assumptions.join(" ") || "None"}.`,
    `Unresolved or excluded costs: ${calculation.unresolvedCosts.join(" ") || "None"}.`,
    "Do not invent fees, processing times, travel access, tax outcomes, legal requirements, or approval guarantees. Clearly distinguish a partial or non-calculable quotation from a complete quotation.",
  ].join("\n");

  let narrative = fallbackNarrative(calculation);
  let generationMode: "ai" | "standard" = "standard";
  try {
    const response = await llm({
      model: "gemini-3-flash-preview",
      maxTokens: 2048,
      messages: [
        { role: "system", content: "You are an expert citizenship and residency by investment advisor at ELEVAY. Use only the deterministic inputs supplied by the application, explain exclusions, never guarantee approval, and output only the requested JSON." },
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

  return { ...calculation, ...narrative, generationMode, generatedAt: new Date().toISOString() };
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chairDecisionSchema,
  formatSpecialistOpinion,
  readJsonPayload,
  specialistOpinionSchema,
} from "./aiCouncilProviders";

const validSpecialistOpinion = {
  executiveSummary: "The proposed initiative has a clear strategic purpose.",
  recommendation: "Proceed only after validating the commercial assumptions.",
  keyFindings: ["The target audience is defined."],
  risks: ["Cost inputs remain incomplete."],
  actions: ["Validate the launch budget before approval."],
  sources: [{ title: "Official source", url: "https://example.com/source" }],
};

describe("Administrative AI Council structured outputs", () => {
  it("normalizes a fenced JSON provider response and validates the specialist opinion", () => {
    const parsed = readJsonPayload(`\`\`\`json\n${JSON.stringify(validSpecialistOpinion)}\n\`\`\``);
    const opinion = specialistOpinionSchema.parse(parsed);

    expect(opinion.recommendation).toContain("Proceed");
    expect(formatSpecialistOpinion(opinion)).toContain("Key findings");
    expect(formatSpecialistOpinion(opinion)).not.toContain("https://example.com/source");
  });

  it("rejects malformed specialist output before it can be persisted", () => {
    expect(() => specialistOpinionSchema.parse({ ...validSpecialistOpinion, sources: [{ title: "Missing URL" }] })).toThrow();
    expect(() => specialistOpinionSchema.parse({ ...validSpecialistOpinion, executiveSummary: "" })).toThrow();
  });

  it("uses Anthropic JSON-schema output rather than relying on a raw JSON prompt", () => {
    const source = readFileSync(resolve(import.meta.dirname, "aiCouncilProviders.ts"), "utf8");
    expect(source).toContain('model: "claude-sonnet-4-6"');
    expect(source).toContain("output_config");
    expect(source).toContain('type: "json_schema"');
    expect(source).toContain("anthropicResponseShape");
  });

  it("accepts only governed Chairperson decisions with a bounded confidence score", () => {
    const result = chairDecisionSchema.parse({
      decision: "proceed_with_conditions",
      confidence: 72,
      summary: "Proceed subject to the listed conditions.",
      rationale: "The specialist opinions align on the opportunity but identify unresolved budget risk.",
      conditions: ["Approve a verified budget."],
      nextSteps: ["Assign an accountable implementation owner."],
      unresolvedConflicts: "Demand evidence remains incomplete.",
    });

    expect(result.decision).toBe("proceed_with_conditions");
    expect(() => chairDecisionSchema.parse({ ...result, confidence: 101 })).toThrow();
  });
});

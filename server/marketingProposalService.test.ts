import { describe, expect, it } from "vitest";
import { MARKETING_PROPOSAL_PROGRAMS, defaultProposalCriteria } from "../shared/marketingProposalCatalog";
import { calculateProgramProposal } from "./marketingProposalCalculator";
import { generateProgramProposal } from "./marketingProposalService";

const calc = (programKey: string, routeKey: string, criteria: Record<string, string | number | boolean> = {}) =>
  calculateProgramProposal({ programKey, routeKey, criteria });

describe("source-based Marketing Proposal catalogue", () => {
  it("contains exactly the 12 supplied programmes with route and source metadata", () => {
    expect(MARKETING_PROPOSAL_PROGRAMS).toHaveLength(12);
    expect(new Set(MARKETING_PROPOSAL_PROGRAMS.map((program) => program.key)).size).toBe(12);
    for (const program of MARKETING_PROPOSAL_PROGRAMS) {
      expect(program.routes.length).toBeGreaterThan(0);
      expect(program.sourceLabel).toMatch(/\.(pdf|webp)$/i);
      expect(["USD", "EUR"]).toContain(program.currency);
    }
  });
});

describe("deterministic Marketing Proposal scenarios", () => {
  it("calculates every configured route without returning non-finite amounts", () => {
    for (const program of MARKETING_PROPOSAL_PROGRAMS) {
      for (const route of program.routes) {
        const result = calc(program.key, route.key, defaultProposalCriteria(program));
        expect(result.lineItems.length, `${program.key}/${route.key}`).toBeGreaterThan(0);
        expect(Number.isFinite(result.totalKnownCost), `${program.key}/${route.key}`).toBe(true);
        expect(result.lineItems.every((line) => line.amount == null || Number.isFinite(line.amount)), `${program.key}/${route.key}`).toBe(true);
        expect(result.sourceLabel).toBe(program.sourceLabel);
      }
    }
  });

  it("calculates Antigua single and family tiers with age-based fees", () => {
    expect(calc("antigua", "ndf").totalKnownCost).toBe(250300);
    const family = calc("antigua", "ndf", { spouse: true, children0To11: 1, children12To17: 1, adultDependents: 1, parents55Plus: 0 });
    expect(family.familyMembers).toBe(5);
    expect(family.totalKnownCost).toBe(297500);
  });

  it("calculates Dominica standard and Iranian schedules without inventing the 4% share base", () => {
    expect(calc("dominica", "contribution", { applicantProfile: "standard" }).totalKnownCost).toBe(210310);
    const family = calc("dominica", "real_estate", { applicantProfile: "iranian", spouse: true, children0To11: 1, children16To17: 1, propertyValue: 200000 });
    expect(family.familyMembers).toBe(4);
    expect(family.lineItems.find((line) => line.key === "share_registration")?.includedInTotal).toBe(false);
    expect(family.quoteStatus).toBe("partial");
    expect(family.totalKnownCost).toBe(356990);
  });

  it("requires complete age allocation for members beyond Dominica package pricing", () => {
    expect(() => calc("dominica", "contribution", { applicantProfile: "standard", spouse: true, children0To11: 2, adultDependents: 1 })).toThrow(/Allocate all 1 family member/);
  });

  it("keeps Egypt investment separate from unspecified fees", () => {
    const result = calc("egypt", "real_estate_5_year", { propertyValue5: 250000 });
    expect(result.totalKnownCost).toBe(250000);
    expect(result.quoteStatus).toBe("partial");
  });

  it("calculates Hungary property transfer tax and excludes annual rental tax", () => {
    const result = calc("hungary", "real_estate", { propertyValue: 600000, annualRentalIncome: 30000 });
    expect(result.totalKnownCost).toBe(624000);
    expect(result.lineItems.find((line) => line.key === "rental_income_tax")).toMatchObject({ amount: 4500, includedInTotal: false });
  });

  it("calculates Latvia real-estate tax and per-person permits", () => {
    const result = calc("latvia", "real_estate", { spouse: true, children: 1, propertyValue: 300000 });
    expect(result.familyMembers).toBe(3);
    expect(result.totalKnownCost).toBe(315105);
    expect(result.lineItems.find((line) => line.key === "maintenance_funds")?.includedInTotal).toBe(false);
  });

  it("calculates Malta fixed charges and one contribution per dependant", () => {
    const result = calc("malta", "property_purchase", { spouse: true, children: 2, parents: 1, propertyValue: 400000 });
    expect(result.familyMembers).toBe(5);
    expect(result.totalKnownCost).toBe(529000);
  });

  it("calculates Nauru family, sibling, due-diligence, and passport fees", () => {
    const result = calc("nauru", "treasury_fund", { familyMembers: 5, siblings: 1, dependents16Plus: 2, passportCount: 5 });
    expect(result.totalKnownCost).toBe(182500);
  });

  it("calculates São Tomé family and per-person document fees", () => {
    const result = calc("sao_tome", "national_development_fund", { familyMembers: 5, adultApplicants: 2, passportCount: 5 });
    expect(result.totalKnownCost).toBe(123750);
  });

  it("calculates St. Kitts package extras and real-estate percentage fees", () => {
    const donation = calc("st_kitts", "sisc", { spouse: true, dependentsUnder16: 2, adultDependents: 1, additionalBeyond4Adults: 1 });
    expect(donation.totalKnownCost).toBe(329000);
    const property = calc("st_kitts", "private_real_estate", { propertyValue: 400000 });
    expect(property.lineItems.find((line) => line.key === "closing")?.amount).toBe(6000);
  });

  it("calculates St. Lucia family extras while separating ambiguous schedules", () => {
    const result = calc("st_lucia", "national_economic_fund", { spouse: true, dependentsUnder16: 2, dependents18To21: 1, additionalBeyond3Adults: 1 });
    expect(result.totalKnownCost).toBe(285500);
  });

  it("calculates Türkiye transfer tax and marks job creation not calculable", () => {
    const property = calc("turkey", "real_estate", { propertyValue: 400000, transferTaxRate: 4, includeAnnualPropertyCosts: true });
    expect(property.totalKnownCost).toBe(416000);
    expect(property.lineItems.filter((line) => line.category === "Recurring").every((line) => !line.includedInTotal)).toBe(true);
    const jobs = calc("turkey", "job_creation");
    expect(jobs.quoteStatus).toBe("not_calculable");
    expect(jobs.totalKnownCost).toBe(0);
  });

  it("calculates Vanuatu family tiers and additional dependants", () => {
    const result = calc("vanuatu", "development_support", { spouse: true, childrenUnder18: 2, adultDependents: 1 });
    expect(result.familyMembers).toBe(5);
    expect(result.totalKnownCost).toBe(200000);
  });

  it("rejects routes that do not belong to the selected programme", () => {
    expect(() => calc("vanuatu", "real_estate")).toThrow(/not available/);
  });
});

describe("Marketing Proposal narrative", () => {
  it("returns the deterministic proposal when AI narrative generation is unavailable", async () => {
    const result = await generateProgramProposal(
      { programKey: "vanuatu", routeKey: "development_support", criteria: { spouse: true } },
      async () => { throw new Error("offline"); },
    );
    expect(result.generationMode).toBe("standard");
    expect(result.programSummary).toContain("Vanuatu");
    expect(result.recommendation).toContain("never guarantees approval");
  });

  it("returns structured AI narrative without allowing it to change deterministic totals", async () => {
    const result = await generateProgramProposal(
      { programKey: "vanuatu", routeKey: "development_support", criteria: {} },
      async () => ({
        id: "proposal-test",
        created: 0,
        model: "gemini-3-flash-preview",
        choices: [{
          index: 0,
          message: { role: "assistant" as const, content: JSON.stringify({ programSummary: "Verified programme summary.", recommendation: "Verify all fees before commitment." }) },
          finish_reason: "stop",
        }],
      }),
    );
    expect(result.generationMode).toBe("ai");
    expect(result.totalKnownCost).toBe(140000);
    expect(result.lineItems.map((line) => line.label)).toContain("Due-diligence fee");
  });
});

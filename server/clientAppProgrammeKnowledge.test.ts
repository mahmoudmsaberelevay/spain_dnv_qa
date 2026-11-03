import { describe, expect, it } from "vitest";
import {
  aiGuideInputSchema,
  aiGuideResponseNotes,
  buildLaylaProgrammeContext,
  getAiGuideRecommendations,
  loadAiProgrammeKnowledge,
  retrieveAiProgrammeKnowledge,
} from "./clientAppProgrammeKnowledge";

describe("ELEVAY AI programme knowledge", () => {
  it("loads the 26 user-supplied programmes with the expected category coverage and full source blocks", () => {
    const { programmes, sourceFiles, sourceSnapshot } = loadAiProgrammeKnowledge();
    expect(programmes).toHaveLength(26);
    expect(programmes.filter(program => program.category === "residency")).toHaveLength(16);
    expect(programmes.filter(program => program.category === "citizenship")).toHaveLength(10);
    expect(new Set(programmes.map(program => program.programId)).size).toBe(26);
    expect(sourceFiles).toEqual(expect.arrayContaining([
      "ELEVAY_Residency_Programmes_Rewritten_EN.docx",
      "ELEVAY_Citizenship_Programs_Content_EN.docx",
    ]));
    expect(sourceSnapshot).toBe("2026-11-03");
    for (const program of programmes) {
      expect(program.content).toContain("Program Overview");
      expect(program.content).toContain("About Elevay");
      expect(program.cardSummary.length).toBeGreaterThan(20);
      expect(program.slug.length).toBeGreaterThan(4);
    }
  });

  it("retrieves only the precisely named programme rather than mixing Malta routes", () => {
    const result = retrieveAiProgrammeKnowledge("Explain the Malta Nomad Residence Permit and its renewal conditions.");
    expect(result.isExplicitProgrammeQuery).toBe(true);
    expect(result.selected.map(program => program.programId)).toEqual(["ready-summary-30018"]);
    const context = buildLaylaProgrammeContext("Explain the Malta Nomad Residence Permit and its renewal conditions.");
    expect(context).toContain("### Malta Nomad Residence Permit");
    expect(context).not.toContain("### Malta Permanent Residence Programme");
    expect(context).toContain("renewal");
  });

  it("retrieves both named Portugal D7 and D8 sources without substituting the Golden Visa", () => {
    const result = retrieveAiProgrammeKnowledge("Compare Portugal D7 and D8 residence requirements and family rules.");
    expect(result.selected.map(program => program.programId)).toEqual(["ready-summary-30013", "ready-summary-30014"]);
    const context = buildLaylaProgrammeContext("Compare Portugal D7 and D8 residence requirements and family rules.");
    expect(context).toContain("### Portugal D7 Residence Visa");
    expect(context).toContain("### Portugal D8 Digital Nomad Visa");
    expect(context).not.toContain("### Portugal Golden Visa");
  });

  it("uses the supplied detailed source, including family rules, fee sections, and explicit missing-information text", () => {
    const context = buildLaylaProgrammeContext("What are the Government Processing Fees and family requirements for Spain Digital Nomad Visa?");
    expect(context).toContain("### Spain Digital Nomad Visa");
    expect(context).toContain("Government Processing Fees");
    expect(context).toContain("Who Can Be Included");
    expect(context).not.toContain("### Spain Entrepreneur Residence");
    expect(context).toContain("if a detail is absent or unclear, say it is not specified");
  });

  it("returns exactly three different-country recommendations and varies ranking with the six Guide answers", () => {
    const passportFirst = getAiGuideRecommendations({
      goal: "travel",
      timeline: "flexible",
      budget: "over_500k",
      family: "couple",
      residency_req: "no",
      passport_priority: "passport_first",
    });
    const relocation = getAiGuideRecommendations({
      goal: "relocate",
      timeline: "medium",
      budget: "20k_150k",
      family: "family",
      residency_req: "yes_fulltime",
      passport_priority: "residency_ok",
    });
    expect(passportFirst).toHaveLength(3);
    expect(new Set(passportFirst.map(program => program.country.en)).size).toBe(3);
    expect(passportFirst.every(program => program.category === "citizenship")).toBe(true);
    expect(relocation).toHaveLength(3);
    expect(relocation.every(program => program.category === "residency")).toBe(true);
    expect(passportFirst.map(program => program.programId)).not.toEqual(relocation.map(program => program.programId));
    expect(passportFirst[0].reasons[0].ar).toContain("جواز سفر ثانٍ");
    expect(relocation[0].reasons[0].en).toContain("residence pathway");
    expect(relocation.every(program => program.processingTime.en.includes("not guaranteed"))).toBe(true);
  });

  it("retains Antigua's live public route slug rather than assuming it matches the Ready Summary ID", () => {
    const antigua = loadAiProgrammeKnowledge().programmes.find(program => program.programId === "ready-summary-antigua-barbuda");
    expect(antigua?.slug).toBe("antigua-barbuda-citizenship-by-investment");
  });

  it("validates the Guide request shape and returns localized non-guarantee notices", () => {
    const valid = {
      locale: "en",
      answers: {
        goal: "relocate",
        timeline: "medium",
        budget: "under_20k",
        family: "solo",
        residency_req: "yes_fulltime",
        passport_priority: "residency_ok",
      },
    };
    expect(aiGuideInputSchema.safeParse(valid).success).toBe(true);
    expect(aiGuideInputSchema.safeParse({ ...valid, answers: { ...valid.answers, unexpected: "value" } }).success).toBe(false);
    expect(aiGuideResponseNotes("en").join(" ")).toContain("not an approval probability");
    expect(aiGuideResponseNotes("ar").join(" ")).toContain("ليست احتمالًا للقبول");
  });
});

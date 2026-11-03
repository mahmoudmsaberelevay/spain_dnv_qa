import { describe, expect, it } from "vitest";
import {
  aiGuideInputSchema,
  aiGuideResponseNotes,
  buildLaylaConversationProgrammeContext,
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

  it("does not mistake generic fee keywords or substrings for an explicitly named programme", () => {
    const generic = retrieveAiProgrammeKnowledge("How much are application government processing fees, due diligence and family rules?");
    expect(generic.isExplicitProgrammeQuery).toBe(false);
    expect(generic.selected).toEqual([]);
    expect(buildLaylaProgrammeContext("what are the fees?")).toContain("No specific programme has been identified");
    expect(buildLaylaProgrammeContext("what are the fees?")).not.toContain("### Dominica");
    expect(retrieveAiProgrammeKnowledge("a Canadian company").selected.map(p => p.programId)).not.toContain("ready-summary-30006");
    expect(retrieveAiProgrammeKnowledge("إسبانيا").selected.every(p => p.country === "Spain")).toBe(true);
  });

  it("switches to the latest explicit route and ignores earlier assistant suggestions", () => {
    const history = [
      { role: "user", content: "Tell me about Spain Digital Nomad Visa" },
      { role: "assistant", content: "Consider Malta MPRP as well." },
    ];
    const switched = buildLaylaConversationProgrammeContext("Now explain Portugal D7", history);
    expect(switched).toContain("### Portugal D7 Residence Visa");
    expect(switched).not.toContain("### Spain Digital Nomad Visa");
    expect(switched).not.toContain("### Malta Permanent Residence Programme");
    const followup = buildLaylaConversationProgrammeContext("What are the application fees?", history);
    expect(followup).toContain("### Spain Digital Nomad Visa");
    expect(followup).not.toContain("### Malta Permanent Residence Programme");
  });

  it("does not rank citizenship routes as business routes from ELEVAY's common company-formation footer", () => {
    const results = getAiGuideRecommendations({ goal: "business", timeline: "flexible", budget: "over_500k", family: "solo", residency_req: "yes_fulltime", passport_priority: "open" });
    expect(results.every(p => p.category === "residency")).toBe(true);
    expect(results.every(p => /entrepreneur|business|nomad|highly qualified|D2/i.test(p.name.en))).toBe(true);
    expect(results.map(p => p.programId)).not.toContain("ready-summary-30005");
  });

  it.each([
    ["ما هي الإقامة الذهبية في الإمارات؟", "ready-summary-30023"],
    ["الاقامة الذهبية في الامارات", "ready-summary-30023"],
    ["ما هي الإقامة الذهبية في البرتغال؟", "ready-summary-30012"],
    ["ما هي شروط عدم الإقامة في دومينيكا؟", "ready-summary-30005"],
    ["ما شروط إقامة مالطا الضريبية؟", "ready-summary-30017"],
    ["ما هي إقامة الرحالة الرقميين في مالطا؟", "ready-summary-30018"],
    ["ما شروط الإقامة الدائمة في مالطا؟", "ready-summary-30019"],
  ])("retrieves the Arabic named route in %s", (query, id) => {
    const result = retrieveAiProgrammeKnowledge(query);
    expect(result.isExplicitProgrammeQuery).toBe(true);
    expect(result.selected.map(p => p.programId)).toEqual([id]);
  });

  it("recognizes country-only Arabic questions without choosing an unrelated country", () => {
    const result = retrieveAiProgrammeKnowledge("ما شروط الإقامة في البرتغال؟");
    expect(result.isExplicitProgrammeQuery).toBe(true);
    expect(result.selected).toHaveLength(4);
    expect(result.selected.every(p => p.country === "Portugal")).toBe(true);
  });

  it("matches Hungary's no minimum stay while preserving remaining permit conditions", () => {
    const results = getAiGuideRecommendations({ goal: "relocate", timeline: "flexible", budget: "over_500k", family: "solo", residency_req: "no", passport_priority: "residency_ok" });
    expect(results[0].programId).toBe("ready-summary-30016");
    expect(results[0].reasons.some(r => r.en.includes("no minimum stay requirement") && r.en.includes("other permit conditions"))).toBe(true);
    const citizenship = getAiGuideRecommendations({ goal: "travel", timeline: "flexible", budget: "over_500k", family: "solo", residency_req: "no", passport_priority: "passport_first" });
    expect(citizenship[0].reasons.some(r => r.en.includes("no residence requirement"))).toBe(true);
    expect(citizenship.map(p => p.programId)).not.toContain("ready-summary-antigua-barbuda");
  });
});

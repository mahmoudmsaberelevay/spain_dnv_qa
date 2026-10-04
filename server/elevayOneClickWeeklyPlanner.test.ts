import { describe, expect, it, vi } from "vitest";
import {
  planOneClickSundayToSaturdayWeek,
  prepareOneClickWeeklyPlanningSnapshot,
  type OneClickWeeklyPlannerSavedContext,
} from "./elevayOneClickWeeklyPlanner";

const periodStart = "2026-10-11"; // Sunday

function savedContext(overrides: Partial<OneClickWeeklyPlannerSavedContext> = {}): OneClickWeeklyPlannerSavedContext {
  return {
    settings: {
      weeklyGoal: "زيادة الوعي ببرامج الإقامة",
      programPriorities: ["portugal"],
      creativeDirection: "محتوى واضح وهادئ",
      updatedSourcesNote: "مراجع داخلية مؤكدة من المالك",
    },
    brandBook: { version: "1", title: "ELEVAY Brand Book", rules: { voice: "refined" } },
    designAssets: [
      { id: 1, assetType: "design_instruction", title: "Social design system", instructions: { palette: "navy" } },
      { id: 2, assetType: "logo", title: "Official ELEVAY logo", instructions: { use: "approved" } },
    ],
    internalReferences: [{
      id: 11,
      referenceKey: "portugal-owner-reference",
      programKeys: ["portugal"],
      title: "Portugal owner programme reference",
      sourceClassification: "owner_provided_internal",
      analysis: { executive_summary: "مرجع داخلي للاستخدام في المراجعة" },
    }],
    ownerConfirmedInternalClaims: [{
      id: 101,
      internalReferenceId: 11,
      programKey: "portugal",
      claimType: "programme_overview",
      claimText: "المرجع الداخلي يشرح خطوات المراجعة الأولية.",
      sourceSection: "Overview",
      riskLevel: "medium",
    }],
    ...overrides,
  };
}

function item(itemType: "reel" | "static_post", index: number, titlePrefix = "خطة"): Record<string, unknown> {
  const isReel = itemType === "reel";
  return {
    itemType,
    title: `${titlePrefix} محتوى ${index + 1}`,
    programKey: "portugal",
    objective: "تقديم فكرة واضحة تساعد الجمهور على فهم بداية المراجعة.",
    creativeDirection: "أسلوب هادئ يركز على وضوح الخطوات والمراجعة البشرية.",
    scriptCopy: isReel
      ? "لو بتفكر في Portugal، ELEVAY تساعدك تفهم نقطة البداية قبل أي قرار."
      : "فهم البداية بيساعدك ترتب أسئلتك قبل المراجعة.",
    caption: "خد وقتك في فهم الخطوات واسأل عن التفاصيل المناسبة لحالتك.",
    cta: "اسأل عن الخطوة المناسبة لحالتك.",
    hashtags: ["#إقامة", "#استشارة"],
    onScreenEnglishText: isReel ? "NONE" : "START WITH CLARITY",
    visualBrief: "تصميم راقٍ بألوان العلامة مع عناصر سفر مجردة دون بيانات شخصية.",
    plannedDay: ["Sunday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Monday"][index],
    plannedTime: ["20:00", "19:00", "20:00", "20:00", "19:00", "18:00", "20:00"][index],
    approvedClaimIds: [],
    ownerConfirmedInternalClaimIds: [101],
    assetFileNames: [],
    adRecommendation: "للمراجعة فقط ولا يشمل أي إنفاق أو نشر.",
  };
}

function candidatePlan(titlePrefix = "خطة") {
  return {
    weeklyTitle: "خطة أسبوع ELEVAY للمراجعة",
    executiveSummary: "خطة داخلية من سبع أفكار للمراجعة البشرية قبل أي إنتاج أو نشر.",
    researchResults: [{
      title: "المرجع الداخلي",
      summary: "مرجع برنامج محفوظ ومؤكد من المالك للمراجعة فقط.",
      sourceUrl: "internal://portugal-owner-reference",
      relevance: "يدعم ترتيب الأفكار الداخلية للبرنامج.",
    }],
    adAuditRecommendations: ["لا توجد توصية إنفاق؛ المحتوى للمراجعة فقط."],
    crmMetaComparisonNotes: ["لا توجد بيانات عملاء أو Leads في هذا المخطط."],
    items: [
      item("reel", 0, titlePrefix),
      item("static_post", 1, titlePrefix),
      item("static_post", 2, titlePrefix),
      item("reel", 3, titlePrefix),
      item("static_post", 4, titlePrefix),
      item("reel", 5, titlePrefix),
      item("static_post", 6, titlePrefix),
    ],
    risksAndEvidenceGaps: ["أي خبر خارجي يحتاج تحققاً مستقلاً قبل استخدامه."],
  };
}

const challenge = {
  executiveSummary: "المسودة تحتاج مراجعة مالك قبل أي خطوة لاحقة.",
  recommendation: "اعرض المسودة للمراجعة البشرية فقط.",
  keyFindings: ["كل العناصر مرتبطة بمراجع داخلية."],
  risks: ["لا تستخدم أي خبر خارجي دون تحقق."],
  actions: ["راجع النصوص والادعاءات قبل اعتماد أي أصل."],
  sources: [{ title: "Untrusted provider URL is intentionally discarded", url: "https://example.invalid" }],
};

describe("elevay one-click weekly planner", () => {
  it("produces exactly 3 reels and 4 static posts through injected strategist/challenger providers", async () => {
    const openAiStrategist = vi.fn().mockResolvedValue(candidatePlan());
    const claudeChallenger = vi.fn().mockResolvedValue(challenge);

    const result = await planOneClickSundayToSaturdayWeek(
      { periodStart },
      { readSavedContext: async () => savedContext(), openAiStrategist, claudeChallenger },
    );

    expect(result.state).toBe("review_ready");
    if (result.state !== "review_ready") throw new Error("Expected review-ready draft");
    expect(openAiStrategist).toHaveBeenCalledOnce();
    expect(claudeChallenger).toHaveBeenCalledOnce();
    expect(result.draft.reviewState).toBe("requires_owner_review");
    expect(result.draft.plan.items).toHaveLength(7);
    expect(result.draft.plan.items.filter(entry => entry.itemType === "reel")).toHaveLength(3);
    expect(result.draft.plan.items.filter(entry => entry.itemType === "static_post")).toHaveLength(4);
    expect(result.draft.plan.items.every(entry => entry.plannedDay && entry.plannedTime)).toBe(true);
    expect(result.draft.plan.items.filter(entry => entry.itemType === "reel").every(entry => entry.onScreenEnglishText === "NONE")).toBe(true);
    expect(result.draft.plan.items.filter(entry => entry.itemType === "static_post").every(entry => entry.onScreenEnglishText === "START WITH CLARITY")).toBe(true);
    expect(result.draft.sourceEvidence.items.every(entry => entry.internalCitationIds.includes(101))).toBe(true);
  });

  it("removes unsafe saved fields and blocks before either provider dispatches", async () => {
    const unsafe = savedContext({
      internalReferences: [{
        id: 11,
        referenceKey: "unsafe-reference",
        programKeys: ["portugal"],
        title: "Contact client@example.com for programme notes",
        sourceClassification: "owner_provided_internal",
        analysis: { executive_summary: "Call +20 100 123 4567" },
      }],
      ownerConfirmedInternalClaims: [{
        id: 101,
        internalReferenceId: 11,
        programKey: "portugal",
        claimType: "overview",
        claimText: "Use passport number for review",
        sourceSection: "Overview",
        riskLevel: "medium",
      }],
    });
    const snapshot = prepareOneClickWeeklyPlanningSnapshot(unsafe, { periodStart });
    expect(JSON.stringify(snapshot)).not.toContain("client@example.com");
    expect(JSON.stringify(snapshot)).not.toContain("+20 100 123 4567");
    expect(JSON.stringify(snapshot)).not.toContain("passport number");

    const openAiStrategist = vi.fn();
    const claudeChallenger = vi.fn();
    const result = await planOneClickSundayToSaturdayWeek(
      { periodStart },
      { readSavedContext: async () => unsafe, openAiStrategist, claudeChallenger },
    );

    expect(result.state).toBe("blocked");
    expect(openAiStrategist).not.toHaveBeenCalled();
    expect(claudeChallenger).not.toHaveBeenCalled();
  });

  it("does not fabricate a news citation and clearly blocks a news-led draft item", async () => {
    const openAiStrategist = vi.fn().mockResolvedValue(candidatePlan("Latest update"));
    const claudeChallenger = vi.fn().mockResolvedValue(challenge);

    const result = await planOneClickSundayToSaturdayWeek(
      { periodStart },
      { readSavedContext: async () => savedContext(), openAiStrategist, claudeChallenger },
    );

    expect(result.state).toBe("review_ready");
    if (result.state !== "review_ready") throw new Error("Expected review-ready draft");
    expect(result.draft.sourceEvidence.status).toBe("blocked_pending_verified_citation");
    expect(result.draft.sourceEvidence.items.every(entry => entry.status === "blocked_needs_verified_external_citation")).toBe(true);
    expect(result.draft.sourceEvidence.items.every(entry => entry.verifiedExternalCitation === null)).toBe(true);
    expect(JSON.stringify(result.draft)).not.toContain("example.invalid");
    expect(result.draft.plan.researchResults.every(entry => entry.sourceUrl.startsWith("internal://"))).toBe(true);
  });
});

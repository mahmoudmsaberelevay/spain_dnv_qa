import { describe, expect, it } from "vitest";
import { prepareEgyptianReelNarration } from "../shared/elevayVideoNarration";
import { validateElevay20SecondReelNarration } from "../shared/elevayReelNarrationPolicy";

describe("video and reel voice-over preflight", () => {
  it("rewrites the saved MSA reel into Egyptian Arabic and English programme/company names", () => {
    const script = prepareEgyptianReelNarration("هل تعمل عن بُعد وتفكر في اسبانيا؟ قبل اختيار أي مسار إقامة، ابدأ من الصورة الكاملة. في إيليفاي نبدأ بفهم وضعك، ثم نراجع التفاصيل من دون وعود مسبقة.");
    expect(script).toContain("بتشتغل عن بُعد وبتفكر في Spain");
    expect(script).toContain("Elevay بنبدأ");
    expect(script).not.toMatch(/اسبانيا|إسبانيا|إيليفاي|هل تعمل|من دون/);
  });
  it("strips escaped scene labels, delivery directions and the silent white-logo outro", () => {
    const spoken = prepareEgyptianReelNarration("Scene 1: Hook - لو شغلك أونلاين بنبص على Spain.\\nScene 2: مع Elevay بنرتب التفاصيل.\\nOutro: Brand signature on white background.");
    expect(spoken).toBe("لو شغلك أونلاين بنبص على Spain. مع Elevay بنرتب التفاصيل.");
  });
  it("rejects unrecognized English, contact links, or formal non-Egyptian scripts before TTS", () => {
    expect(() => prepareEgyptianReelNarration("بنراجع تفاصيل residency في Spain")).toThrow("Egyptian Arabic");
    expect(() => prepareEgyptianReelNarration("بنراجع التفاصيل من خلال https://example.org")).toThrow("contact");
    expect(() => prepareEgyptianReelNarration("سوف نقدم لكم المعلومات الصحيحة")).toThrow("natural Egyptian Arabic");
  });
  it("checks a single 5-second scene line without demanding a marker word, but still refuses formal Arabic", () => {
    const line = "حياة جديدة في Portugal أقرب بكتير مما تتخيل لما الخطة تبقى واضحة.";
    expect(() => prepareEgyptianReelNarration("حياة جديدة في Portugal أقرب مما تتخيل لما الخطة واضحة.")).toThrow("Egyptian Arabic");
    expect(prepareEgyptianReelNarration(line, { requireEgyptianMarker: false })).toContain("Portugal");
    expect(() => prepareEgyptianReelNarration("سوف نقدم لكم المعلومات الصحيحة", { requireEgyptianMarker: false })).toThrow("natural Egyptian Arabic");
    expect(prepareEgyptianReelNarration("الطريق اللي بتدور عليه أوضح دلوقتي")).toContain("اللي");
    expect(prepareEgyptianReelNarration("ناس كتير محتاجة خطة واضحة")).toContain("كتير");
  });
  it("requires one 20-second continuous narration with a truthful hook and direct consultation CTA", () => {
    const scenes = [
      { spoken_text_ar: "لو قرار عيلتك مؤجل، خلينا نبص على Portugal بهدوء ونرتب أول خطوة." },
      { spoken_text_ar: "بنراجع اختياراتك علشان تعرف أنهي خطوة مناسبة ليك ولعيلتك من غير ضغط." },
      { spoken_text_ar: "مع Elevay بنرتب التفاصيل بوضوح ونشرح الصورة كاملة علشان قرارك يبقى أهدى." },
      { spoken_text_ar: "تواصل مع Elevay دلوقتي واحجز استشارتك وخد خطوتك الجاية برؤية أوضح." },
    ];
    expect(validateElevay20SecondReelNarration(scenes)).toBeNull();
  });
  it("rejects narration without a direct CTA or with bullet-style lines", () => {
    const scenes = [
      { spoken_text_ar: "لو قرار عيلتك مؤجل، خلينا نبص على Portugal بهدوء ونرتب أول خطوة." },
      { spoken_text_ar: "بنراجع اختياراتك علشان تعرف أنهي خطوة مناسبة ليك ولعيلتك من غير ضغط." },
      { spoken_text_ar: "مع Elevay بنرتب التفاصيل بوضوح ونشرح الصورة كاملة علشان قرارك يبقى أهدى." },
      { spoken_text_ar: "- بنرتب خطتك علشان تبدأ خطوتك الجاية بوضوح." },
    ];
    expect(validateElevay20SecondReelNarration(scenes)).toMatch(/numbered point or bullet/);
  });
});

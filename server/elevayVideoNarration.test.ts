import { describe, expect, it } from "vitest";
import { prepareEgyptianReelNarration } from "../shared/elevayVideoNarration";

describe("video and reel voice-over preflight", () => {
  it("rewrites the saved MSA reel into Egyptian Arabic and English programme/company names", () => {
    const script = prepareEgyptianReelNarration("هل تعمل عن بُعد وتفكر في اسبانيا؟ قبل اختيار أي مسار إقامة، ابدأ من الصورة الكاملة. في إيليفاي نبدأ بفهم وضعك، ثم نراجع التفاصيل من دون وعود مسبقة.");
    expect(script).toContain("بتشتغل عن بُعد وبتفكر في Spain");
    expect(script).toContain("ELEVAY بنبدأ");
    expect(script).not.toMatch(/اسبانيا|إسبانيا|إيليفاي|هل تعمل|من دون/);
  });
  it("strips escaped scene labels, delivery directions and the silent white-logo outro", () => {
    const spoken = prepareEgyptianReelNarration("Scene 1: Hook - لو شغلك أونلاين بنبص على Spain.\\nScene 2: مع ELEVAY بنرتب التفاصيل.\\nOutro: Brand signature on white background.");
    expect(spoken).toBe("لو شغلك أونلاين بنبص على Spain. مع ELEVAY بنرتب التفاصيل.");
  });
  it("rejects unrecognized English, contact links, or formal non-Egyptian scripts before TTS", () => {
    expect(() => prepareEgyptianReelNarration("بنراجع تفاصيل residency في Spain")).toThrow("Egyptian Arabic");
    expect(() => prepareEgyptianReelNarration("بنراجع التفاصيل من خلال https://example.org")).toThrow("contact");
    expect(() => prepareEgyptianReelNarration("سوف نقدم لكم المعلومات الصحيحة")).toThrow("natural Egyptian Arabic");
  });
});

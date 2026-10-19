import { describe, it, expect } from "vitest";
import { DEFAULT_ELEVAY_VOICEOVER_PROMPT, buildElevayVoiceoverPrompt, cleanElevayVoiceoverTemplate, checkElevayVoiceover, splitElevayVoiceover, normalizeElevayVoiceover, elevayVoiceoverWords } from "./elevayVoiceoverTemplate";

const GOOD = "بتفكر تبدأ حياة جديدة مع عيلتك في Spain؟ خلينا نقولك إزاي. إحنا في Elevay بنراجع وضعك خطوة بخطوة، وبنرتب معاك كل الأوراق علشان تكون مطمن وانت بتاخد قرارك. فريقنا معاك من أول سؤال لحد ما توصل، وبنوضح لك كل التفاصيل بهدوء. احجز استشارتك مع Elevay دلوقتي، وخلينا نبدأ نخطط لمستقبلك سوا.";

describe("ELEVAY Voice-Over Prompt", () => {
  it("is the owner's exact text with the idea filled in", () => {
    expect(DEFAULT_ELEVAY_VOICEOVER_PROMPT.startsWith("i need a strong text for voice over to be strongly spoken at arabic egyptian language\n\n1- Use the Egyptian Arabic Language")).toBe(true);
    expect(buildElevayVoiceoverPrompt(null, "Malta PR for families")).toBe(DEFAULT_ELEVAY_VOICEOVER_PROMPT.replace("{{idea}}", "Malta PR for families"));
    expect(buildElevayVoiceoverPrompt("custom prompt text here", "X")).toBe("custom prompt text here\n\nIdea: X");
    expect(cleanElevayVoiceoverTemplate("my edited prompt for the voice")).toMatch(/Idea: \{\{idea\}\}$/);
    expect(() => cleanElevayVoiceoverTemplate("short")).toThrow();
  });
  it("approves good Egyptian Arabic and rejects MSA, Arabic country/company names, wrong length, visa and guarantees", () => {
    expect(checkElevayVoiceover(GOOD)).toEqual([]);
    const bad = checkElevayVoiceover("هل تفكر في الانتقال إلى إسبانيا؟ نحن في إيليفاي نضمن لك التأشيرة.");
    expect(bad.join(" ")).toMatch(/Modern Standard Arabic/);
    expect(bad.join(" ")).toMatch(/country name/);
    expect(bad.join(" ")).toMatch(/Elevay/);
    expect(bad.join(" ")).toMatch(/45–55/);
    expect(bad.join(" ")).toMatch(/تأشيرة/);
    expect(bad.join(" ")).toMatch(/guarantee/);
  });
  it("cleans labels and quotes and writes the company as Elevay", () => {
    expect(normalizeElevayVoiceover('"النص: ELEVAY معاك"')).toBe("Elevay معاك");
  });
  it("splits into 4 near-equal takes that keep every word in order", () => {
    const parts = splitElevayVoiceover(GOOD, 4);
    expect(parts).toHaveLength(4);
    expect(parts.join(" ")).toBe(GOOD);
    const counts = parts.map(elevayVoiceoverWords);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
  });
});

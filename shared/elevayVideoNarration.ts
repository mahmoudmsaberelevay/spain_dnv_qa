import { validateElevayArabicVoiceOverScript } from "./marketingCreativeLanguagePolicy";

const countryNames: Array<[RegExp, string]> = [
  [/(?:إسبانيا|اسبانيا)/g, "Spain"], [/(?:مالطا)/g, "Malta"],
  [/(?:البرتغال)/g, "Portugal"], [/(?:اليونان)/g, "Greece"],
  [/(?:كندا)/g, "Canada"], [/(?:غرينادا|جرينادا)/g, "Grenada"],
  [/(?:دومينيكا)/g, "Dominica"], [/(?:سانت لوسيا)/g, "Saint Lucia"],
  [/(?:سانت كيتس ونيفيس)/g, "Saint Kitts and Nevis"],
  [/(?:أنتيغوا وبربودا)/g, "Antigua and Barbuda"],
  [/(?:المملكة المتحدة|بريطانيا)/g, "United Kingdom"],
];
const egyptianPhrases: Array<[RegExp, string]> = [
  [/هل تعمل عن بُ?عد وتفكر/g, "بتشتغل عن بُعد وبتفكر"],
  [/هل تفكر/g, "بتفكر"], [/هل تريد/g, "عايز"],
  [/قبل اختيار/g, "قبل ما تختار"], [/قبل اتخاذ/g, "قبل ما تاخد"],
  [/ابدأ من/g, "خلينا نبدأ من"], [/نبدأ بفهم/g, "بنبدأ بفهم"],
  [/نراجع مدى/g, "بنراجع مدى"], [/نراجع التفاصيل/g, "بنراجع التفاصيل"],
  [/نتحدث عن/g, "بنتكلم عن"], [/تحتاج إلى/g, "محتاج"],
  [/يمكنك أن/g, "تقدر"], [/يمكن أن/g, "ممكن"],
  [/يساعدك على/g, "بيساعدك"], [/معك/g, "معاك"],
  [/مناسب لك/g, "مناسب ليك"], [/ملائمة لك/g, "مناسبة ليك"],
  [/بالنسبة لك/g, "بالنسبة ليك"], [/من دون/g, "من غير"],
  [/لكي /g, "علشان "], [/حتى تتمكن من/g, "علشان تقدر"],
  [/ثم نراجع/g, "وبعدها بنراجع"], [/اتخذ قرارك/g, "خد قرارك"],
  [/لأسرتك/g, "لعيلتك"], [/أسرتك/g, "عيلتك"],
];

/** Strictly preparation-only: never sends text or logs script/credentials. */
export function prepareEgyptianReelNarration(value: string): string {
  let text = value.replace(/^\[thoughtful\]\s*/i, "").replace(/\\n/g, "\n").trim();
  // Planning models sometimes include shot directions in scriptCopy. Those
  // directions belong in the visual brief, never in the spoken ElevenLabs text.
  text = text.split(/\n+/).map(line => line.trim())
    .filter(line => !/^Outro\s*:/i.test(line))
    .map(line => line.replace(/^Scene\s*\d+\s*:\s*(?:[A-Za-z/ ]+\s*[-–—]\s*)?/i, ""))
    .join(" ").trim();
  if (/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) {
    throw new Error("Narration must not contain a contact link or address.");
  }
  for (const [pattern, replacement] of countryNames) text = text.replace(pattern, replacement);
  text = text.replace(/(?:إيليفاي|إليفاي|اليفاي)/g, "ELEVAY");
  for (const [pattern, replacement] of egyptianPhrases) text = text.replace(pattern, replacement);
  const error = validateElevayArabicVoiceOverScript(text);
  if (error) throw new Error(error);
  // Do not silently send unconverted formal scripts to ElevenLabs. The owner
  // can edit unusual phrasing rather than synthesizing the wrong dialect.
  if (/(?:^|[\s،.!؟])(?:هل|سوف|إنه|إنها|يمكنك|يمكن أن|من دون)(?=[\s،.!؟]|$)/.test(text)
    || !/(?:بنبدأ|بنراجع|بنتكلم|بتفكر|بتشتغل|بتخطط|بنبص|بنرتب|بنوضح|بنقولك|بيبدأ|إيه|اسأل|معاك|ليك|علشان|عشان|خلينا|من غير|محتاج|تقدر|خد قرارك)/.test(text)) {
    throw new Error("Narration must be natural Egyptian Arabic before ElevenLabs; edit the script or request a revised plan.");
  }
  return text;
}

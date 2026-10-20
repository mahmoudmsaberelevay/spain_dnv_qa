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
/**
 * `requireEgyptianMarker: false` is for checking ONE 5-second scene line: a 10–14-word line can be natural
 * Egyptian Arabic without containing any of the marker words, so the positive marker test runs on the
 * full joined voice-over instead. Formal (MSA) and non-Egyptian words are still rejected in every line.
 */
export function prepareEgyptianReelNarration(value: string, { requireEgyptianMarker = true }: { requireEgyptianMarker?: boolean } = {}): string {
  let text = value.replace(/^(?:\s*\[[a-z][a-z _-]{0,48}\])+\s*/i, "").replace(/\\n/g, "\n").trim();
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
  text = text.replace(/(?:إيليفاي|إليفاي|اليفاي)/g, "Elevay");
  for (const [pattern, replacement] of egyptianPhrases) text = text.replace(pattern, replacement);
  const error = validateElevayArabicVoiceOverScript(text);
  if (error) throw new Error(error);
  // Do not silently send unconverted formal scripts to ElevenLabs. The owner
  // can edit unusual phrasing rather than synthesizing the wrong dialect.
  // Formal (Modern Standard) and non-Egyptian words make ElevenLabs read the take in a formal accent, so any of
  // them stops the script and OpenAI rewrites it in Egyptian colloquial Arabic.
  const formalWord = /(?:^|[\s،.!؟,?])(هل|سوف|إنه|إنها|يمكنك|يمكن أن|من دون|الذي|التي|الذين|اللذين|هذا|هذه|هؤلاء|ذلك|تلك|لماذا|ماذا|كيف|أين|متى|لدينا|لديك|لديكم|ليس|ليست|لسنا|نحن|أنت|أنتم|لن|لم|حيث|كي|لكي|الآن|أيضا|أيضاً|فقط|يجب|عليك أن|نستطيع|تستطيع|يستطيع|عندما|هناك|تريد|نريد|نود|سنساعدك|ستجد|ستعيش|ستبدأ|لنبدأ|لنساعدك|لنكمل|نقوم|تقوم|يقوم|نسعى|نوفر|يوفر|توفر|بدك|بدي|شو|هلق|هيك|وايد|شلون|زين|أبغى|ابغى)(?=[\s،.!؟,?]|$)/;
  const formal = text.match(formalWord);
  if (formal) {
    throw new Error(`Narration must be natural Egyptian Arabic before ElevenLabs: "${formal[1]}" is formal or non-Egyptian Arabic; rewrite it the way Egyptians speak (e.g. ده/دي، اللي، ليه، إزاي، دلوقتي، كمان، بس، لازم، لما، فيه، عايز، إحنا).`);
  }
  if (requireEgyptianMarker) {
    // A full voice-over must sound clearly Egyptian, not just avoid formal words: at least 3 different Egyptian markers (fewer for a short line).
    const strong = /(?:^|[\s،.!؟,?])و?(مش|اللي|علشان|عشان|دلوقتي|إزاي|ازاي|ليه|فين|إمتى|امتى|كده|كدا|أوي|اوي|بجد|يلا|عايز|عايزة|عايزين|إحنا|احنا|إنت|انت|إيه|خلينا|من غير|بقى|معاك|معاكم|ده|دي|دول|كمان|بس|لازم|لما|فيه|عندنا|عندك|ب[نتي][\u0621-\u064A]{3,}|ه[نتي][\u0621-\u064A]{3,})(?=[\s،.!؟,?]|$)/g;
    const found = new Set<string>();
    const padded = ` ${text} `;
    let marker: RegExpExecArray | null;
    while ((marker = strong.exec(padded)) !== null) found.add(marker[1]);
    const words = text.split(/\s+/).filter(Boolean).length;
    if (found.size < (words >= 30 ? 3 : words >= 15 ? 2 : 1)) {
      throw new Error("Narration must be natural Egyptian Arabic before ElevenLabs: it does not sound clearly Egyptian. Use everyday Egyptian colloquial words (e.g. اللي، علشان، محتاج، دلوقتي، مش، إزاي، خلينا، بنساعدك، هتقدر).");
    }
  }
  return text;
}

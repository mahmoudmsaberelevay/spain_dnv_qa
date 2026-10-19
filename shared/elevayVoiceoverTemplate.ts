/**
 * ELEVAY Voice-Over Prompt — the owner's locked template for every reel voice-over text written by OpenAI
 * (new reels, "recreate from scratch", voice change requests). Editable only by the owner in Settings.
 * The template is sent to OpenAI exactly as saved, with {{idea}} replaced by the reel's idea/objective.
 */
export const ELEVAY_VOICEOVER_PROMPT_NAME = "ELEVAY Voice-Over Prompt";

export const DEFAULT_ELEVAY_VOICEOVER_PROMPT = `i need a strong text for voice over to be strongly spoken at arabic egyptian language

1- Use the Egyptian Arabic Language, pronunciation and writing. If you need to add a country name, write it in English only. If you need to write our company name, write it like this: Elevay
2- The voice over text should cover 20 seconds of voice over
3- The voice over should be generated in Egyptian Arabic language with no official (Modern Standard) Arabic
4- Keep your tone of voice friendly with professional

Idea: {{idea}}`;

/** 20 seconds of voice-over: four 5-second takes, about 45–55 Egyptian Arabic words. */
export const ELEVAY_VOICEOVER_TIMING = Object.freeze({ targetSeconds: 20, sceneSeconds: 5, scenes: 4, minWords: 45, maxWords: 55 });

export function buildElevayVoiceoverPrompt(template: string | null | undefined, idea: string) {
  const t = String(template || "").trim() || DEFAULT_ELEVAY_VOICEOVER_PROMPT;
  const cleanIdea = String(idea || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return t.includes("{{idea}}") ? t.replace(/\{\{idea\}\}/g, cleanIdea) : `${t}\n\nIdea: ${cleanIdea}`;
}

/** Owner edits: keep it a real prompt and keep the idea slot. */
export function cleanElevayVoiceoverTemplate(value: unknown) {
  const t = String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
  if (t.length < 20) throw new Error("The voice-over prompt is too short.");
  return t.includes("{{idea}}") ? t : `${t}\n\nIdea: {{idea}}`;
}

const ARABIC_COUNTRY = /(?:إسبانيا|اسبانيا|أسبانيا|البرتغال|اليونان|مالطا|كندا|بريطانيا|المملكة المتحدة|إنجلترا|انجلترا|غرينادا|جرينادا|دومينيكا|سانت لوسيا|سانت كيتس|أنتيغوا|انتيغوا|فانواتو|إيطاليا|ايطاليا|فرنسا|ألمانيا|المانيا|مصر|الإمارات|الامارات|السعودية|أمريكا|امريكا|الولايات المتحدة)/;
const ARABIC_COMPANY = /(?:إيليفاي|ايليفاي|إليفاي|اليفاي|إيليڤاي|ايليڤاي)/;
const MSA_MARKERS = /(?:^|[\s،.!؟])(?:هل|سوف|لماذا|ماذا|إنه|إنها|يمكنك|يمكن أن|لكي|لدينا|لديك|ليس|ليست|الذي|التي|الذين|هذا|هذه|ذلك|تلك|نحن|أنت|حيث|كي|لن|لم)(?=[\s،.!؟]|$)/;
const LEVANTINE_GULF = /(?:^|[\s،.!؟])(?:بدك|بدي|شو|كتير|هلق|هيك|وايد|شلون|زين|ابغى|أبغى|يبه)(?=[\s،.!؟]|$)/;
const EGYPTIAN_MARKERS = /(?:بنبدأ|بنراجع|بنتكلم|بتفكر|بتحلم|بتشتغل|بتخطط|بنرتب|بنوضح|إيه|ايه|معاك|ليك|علشان|عشان|خلينا|من غير|محتاج|تقدر|دلوقتي|بقى|عايز|عايزة|إحنا|احنا|مش|عيلتك|هنا|هتقدر|هنساعدك|بنساعدك|يلا|كده|أوي|اوي|بجد)/;
const FORBIDDEN = /(?:تأشيرة|تاشيرة|فيزا|\bvisa\b)/i;
const GUARANTEE = /(?:نضمن|بنضمن|هنضمن|مضمون|مضمونة|ضمان|ضامن|100\s?%|١٠٠\s?٪|أكيد هتاخد|موافقة مؤكدة|قبول مؤكد)/;
const LEGAL_TAX = /(?:نصيحة قانونية|استشارة قانونية|نصيحة ضريبية|استشارة ضريبية|هتوفر ضرايب|هتوفر ضرائب|معفي من الضرايب|إعفاء ضريبي)/;

export function elevayVoiceoverWords(text: string) {
  return String(text || "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).length;
}

/** Cleans OpenAI's reply into plain spoken text (no labels, quotes or markdown); "ELEVAY" casing becomes "Elevay". */
export function normalizeElevayVoiceover(raw: string) {
  return String(raw || "")
    .replace(/```[a-z]*|```/gi, " ")
    .replace(/[*_#>"“”«»]/g, " ")
    .replace(/^\s*(?:voice[- ]?over|النص|نص الفويس أوفر|الفويس أوفر)\s*[:：-]\s*/gim, "")
    .replace(/\bELEVAY\b/gi, "Elevay")
    .replace(/\s+/g, " ")
    .trim();
}

/** The automatic checks the owner asked for. Returns the problems found (empty = approved). */
export function checkElevayVoiceover(text: string): string[] {
  const t = String(text || "");
  const problems: string[] = [];
  if (!/[؀-ۿ]/.test(t)) problems.push("The text is not in Arabic.");
  if (MSA_MARKERS.test(t)) problems.push("It contains Modern Standard Arabic words; it must be Egyptian Arabic only.");
  if (LEVANTINE_GULF.test(t)) problems.push("It contains non-Egyptian dialect words.");
  if (!EGYPTIAN_MARKERS.test(t)) problems.push("It does not read as Egyptian Arabic.");
  if (ARABIC_COUNTRY.test(t)) problems.push("A country name is written in Arabic; country names must be in English.");
  if (ARABIC_COMPANY.test(t)) problems.push('The company name is written in Arabic; it must be written "Elevay".');
  const latin = t.replace(/\bElevay\b/g, " ").replace(/\b(?:Spain|Portugal|Greece|Malta|Canada|United Kingdom|UK|Grenada|Dominica|Saint Lucia|St\.? Lucia|Saint Kitts and Nevis|St\.? Kitts and Nevis|Antigua and Barbuda|Vanuatu|Europe|Schengen|Italy|France|Germany|Egypt|UAE|Saudi Arabia|USA)\b/g, " ");
  if (/[A-Za-z]/.test(latin)) problems.push('Only country names and "Elevay" may be in English letters.');
  const words = elevayVoiceoverWords(t);
  if (words < ELEVAY_VOICEOVER_TIMING.minWords || words > ELEVAY_VOICEOVER_TIMING.maxWords) problems.push(`It has ${words} words; about 20 seconds needs ${ELEVAY_VOICEOVER_TIMING.minWords}–${ELEVAY_VOICEOVER_TIMING.maxWords} Egyptian Arabic words.`);
  if (FORBIDDEN.test(t)) problems.push('It uses "تأشيرة"/visa; use إقامة (residency) instead.');
  if (GUARANTEE.test(t)) problems.push("It promises or guarantees an outcome.");
  if (LEGAL_TAX.test(t)) problems.push("It gives legal or tax advice.");
  return problems;
}

/** Splits the approved text into 4 parts of about equal length (≈5 s each), preferring sentence/pause breaks. */
export function splitElevayVoiceover(text: string, parts = 4): string[] {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < parts * 3) throw new Error("The voice-over is too short to split into four scenes.");
  const breaks: number[] = [];
  let start = 0;
  for (let p = 1; p < parts; p++) {
    const ideal = start + Math.round((words.length - start) / (parts - p + 1)); // even share of what is left
    let best = ideal, bestScore = Infinity;
    for (let k = Math.max(start + 3, ideal - 1); k <= Math.min(words.length - (parts - p) * 3, ideal + 1); k++) {
      // Takes must stay close in length (each fills one 5-second scene); prefer a pause only within ±1 word.
      const pause = /[.،,!؟?؛…]$/.test(words[k - 1]) ? 0 : 1.1;
      const score = Math.abs(k - ideal) + pause;
      if (score < bestScore) { bestScore = score; best = k; }
    }
    breaks.push(best);
    start = best;
  }
  const out: string[] = [];
  let from = 0;
  for (const b of [...breaks, words.length]) { out.push(words.slice(from, b).join(" ")); from = b; }
  return out;
}

export const ELEVAY_CREATIVE_LANGUAGE_POLICY = {
  version: "elevay-egyptian-arabic-voice-country-company-exceptions-v3",
  marketingCopy: "Campaign, post, reel and voice-over copy must be Arabic. Captions may be bilingual Arabic and English, but must include Arabic.",
  onScreenVisualText: "Any text rendered inside a static design, carousel, reel or ad visual must be English only.",
  voiceOver: "Voice-over scripts must be written in Egyptian Arabic. Only approved country names and ELEVAY as the company name may appear in English.",
} as const;

export const ELEVAY_APPROVED_ENGLISH_COUNTRY_NAMES = [
  "Antigua and Barbuda",
  "Saint Kitts and Nevis",
  "St. Kitts and Nevis",
  "United Kingdom",
  "Saint Lucia",
  "St. Lucia",
  "Dominica",
  "Grenada",
  "Portugal",
  "Greece",
  "Malta",
  "Canada",
  "Spain",
  "Antigua",
  "Barbuda",
  "Caribbean",
  "UK",
] as const;

export const ELEVAY_APPROVED_ENGLISH_COMPANY_NAMES = ["ELEVAY"] as const;

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const LATIN_LETTERS = /[A-Za-z]/;
const CREATIVE_ITEM_TYPES = new Set(["static_post", "carousel", "reel", "image", "graphic", "ad_setup", "lead_ad"]);
const VISUAL_TEXT_ITEM_TYPES = new Set(["static_post", "carousel", "reel", "image", "graphic", "lead_ad"]);

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeNonSpokenTags(value: string) {
  return value.replace(/\[[a-z][a-z _-]{0,48}\]/gi, " ");
}

function removeUrls(value: string) {
  return value.replace(/https?:\/\/\S+/gi, " ");
}

function removeApprovedVoiceOverEnglishNames(value: string) {
  let result = value;
  for (const name of [...ELEVAY_APPROVED_ENGLISH_COUNTRY_NAMES, ...ELEVAY_APPROVED_ENGLISH_COMPANY_NAMES].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(escapeForRegex(name), "gi"), " ");
  }
  return result;
}

export function hasArabicScript(value: string): boolean {
  return ARABIC_SCRIPT.test(value);
}

export function hasLatinLetters(value: string): boolean {
  return LATIN_LETTERS.test(value);
}

export function isCreativeItemType(value: string): boolean {
  return CREATIVE_ITEM_TYPES.has(value);
}

export function isVisualTextCreativeItemType(value: string): boolean {
  return VISUAL_TEXT_ITEM_TYPES.has(value);
}

/** Marketing copy may contain a URL, but all campaign copy and hashtags remain Arabic. */
export function validateArabicOnlyMarketingText(value: string, label: string): string | null {
  const readable = removeUrls(value).trim();
  if (!hasArabicScript(readable)) {
    return `${label} must contain Arabic marketing text.`;
  }
  if (hasLatinLetters(readable)) {
    return `${label} must be Arabic only. English belongs only in the on-screen visual-text field.`;
  }
  return null;
}

/** Captions may add English after the Arabic message, but Arabic remains required. */
export function validateBilingualElevayCaption(value: string, label = "Caption"): string | null {
  const readable = removeUrls(value).trim();
  if (!hasArabicScript(readable)) return `${label} must include Arabic marketing text; English may be added as a bilingual caption.`;
  return null;
}

/** Use NONE when a creative deliberately has no text rendered inside its visual. */
export function validateEnglishOnlyOnScreenText(value: string, label = "On-screen visual text"): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return `${label} is required. Enter the exact English visual text, or write NONE when the visual has no text.`;
  }
  if (normalized.toUpperCase() === "NONE") return null;
  if (hasArabicScript(normalized)) {
    return `${label} must be English only; Arabic is not allowed inside the visual.`;
  }
  if (!hasLatinLetters(normalized)) {
    return `${label} must contain English text, or use NONE when no text will appear in the visual.`;
  }
  return null;
}

/**
 * ElevenLabs narration is Egyptian Arabic by default. Country and company names are
 * deliberately written in English so the provider can pronounce them consistently;
 * no other English words are allowed in the spoken script.
 */
export function validateElevayArabicVoiceOverScript(value: string): string | null {
  const spokenText = removeNonSpokenTags(value).trim();
  if (!hasArabicScript(spokenText)) {
    return "Voice-over scripts must contain Arabic text.";
  }
  const withoutApprovedNames = removeApprovedVoiceOverEnglishNames(spokenText);
  if (hasLatinLetters(withoutApprovedNames)) {
    return `Voice-over scripts must be Egyptian Arabic. Only these country names and company names may be written in English: ${[...ELEVAY_APPROVED_ENGLISH_COUNTRY_NAMES, ...ELEVAY_APPROVED_ENGLISH_COMPANY_NAMES].join(", ")}.`;
  }
  return null;
}

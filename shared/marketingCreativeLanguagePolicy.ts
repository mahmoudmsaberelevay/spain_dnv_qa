export const ELEVAY_CREATIVE_LANGUAGE_POLICY = {
  version: "elevay-arabic-content-english-visual-v1",
  marketingCopy: "Campaign, post, reel, caption and voice-over copy must be Arabic.",
  onScreenVisualText: "Any text rendered inside a static design, carousel, reel or ad visual must be English only.",
  voiceOver: "Voice-over scripts are Arabic; only approved country names may appear in English.",
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

function removeApprovedCountryNames(value: string) {
  let result = value;
  for (const country of [...ELEVAY_APPROVED_ENGLISH_COUNTRY_NAMES].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(escapeForRegex(country), "gi"), " ");
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
 * ElevenLabs speaks Arabic by default. Country names are deliberately written in English
 * so the provider can pronounce those names consistently; no other English words are allowed.
 */
export function validateElevayArabicVoiceOverScript(value: string): string | null {
  const spokenText = removeNonSpokenTags(value).trim();
  if (!hasArabicScript(spokenText)) {
    return "Voice-over scripts must contain Arabic text.";
  }
  const withoutCountryNames = removeApprovedCountryNames(spokenText);
  if (hasLatinLetters(withoutCountryNames)) {
    return `Voice-over scripts must be Arabic. Only these country names may be written in English: ${ELEVAY_APPROVED_ENGLISH_COUNTRY_NAMES.join(", ")}.`;
  }
  return null;
}

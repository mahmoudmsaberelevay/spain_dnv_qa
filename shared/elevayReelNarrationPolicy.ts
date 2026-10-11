export const ELEVAY_REEL_NARRATION_STANDARD = Object.freeze({
  sceneCount: 4,
  targetSeconds: 18,
  targetSceneSeconds: 4.5,
  minWordsPerScene: 8,
  maxWordsPerScene: 10,
  minTotalWords: 32,
  maxTotalWords: 40,
  hookScene: 1,
  ctaScene: 4,
} as const);

function clean(value: unknown) {
  return String(value || "")
    .replace(/\[[a-z][a-z _-]{0,48}\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function elevayNarrationWordCount(value: unknown) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

/**
 * Validates the spoken plan before any keyframe, clip, or voice take is created.
 * It deliberately checks format and communication structure—not legal eligibility claims.
 */
export function validateElevay18SecondReelNarration(scenes: Array<{ spoken_text_ar?: unknown }> | unknown): string | null {
  if (!Array.isArray(scenes) || scenes.length !== ELEVAY_REEL_NARRATION_STANDARD.sceneCount) {
    return "An ELEVAY reel needs exactly four narration scenes for the 18-second voice-over.";
  }

  const lines = scenes.map((scene) => clean((scene as { spoken_text_ar?: unknown })?.spoken_text_ar));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) return `Scene ${index + 1} narration is missing.`;
    if (/^(?:[-•]|\d+[.)])\s*/.test(line)) {
      return `Scene ${index + 1} narration must be continuous spoken text, never a numbered point or bullet.`;
    }
    const words = elevayNarrationWordCount(line);
    if (words < ELEVAY_REEL_NARRATION_STANDARD.minWordsPerScene || words > ELEVAY_REEL_NARRATION_STANDARD.maxWordsPerScene) {
      return `Scene ${index + 1} must contain ${ELEVAY_REEL_NARRATION_STANDARD.minWordsPerScene}–${ELEVAY_REEL_NARRATION_STANDARD.maxWordsPerScene} spoken words to fit its 4.5-second share of the 18-second voice-over.`;
    }
  }

  const totalWords = lines.reduce((total, line) => total + elevayNarrationWordCount(line), 0);
  if (totalWords < ELEVAY_REEL_NARRATION_STANDARD.minTotalWords || totalWords > ELEVAY_REEL_NARRATION_STANDARD.maxTotalWords) {
    return `The full reel narration must contain ${ELEVAY_REEL_NARRATION_STANDARD.minTotalWords}–${ELEVAY_REEL_NARRATION_STANDARD.maxTotalWords} words for the 18-second target; it has ${totalWords}.`;
  }

  // A dramatic hook must create truthful emotional tension or aspiration; it must not rely on urgency,
  // guarantees, or unsupported claims. The model is instructed to create this through the storyboard prompt.
  if (!/(?:تخيل|لو|قرار|حلم|حيرة|مستقبل|خطة|ليه|مش لازم|قبل ما)/.test(lines[0])) {
    return "Scene 1 needs a high-impact, truthful dramatic hook about the viewer's decision, ambition, or uncertainty.";
  }

  // The direct CTA remains spoken only; captions and the video visual follow their own language and no-contact rules.
  if (!/(?:احجز\s+(?:استشارتك|استشارة)|تواصل\s+مع|كلّمنا|كلمنا|ابعتلنا|ابدأ\s+استشارتك|تعالى\s+نتكلم)/.test(lines[3])) {
    return "Scene 4 must end with a direct consultation call to action, such as احجز استشارتك مع ELEVAY or تواصل مع ELEVAY.";
  }

  return null;
}

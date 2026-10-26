export const ELEVAY_REEL_NARRATION_STANDARD = Object.freeze({
  sceneCount: 4,
  targetSeconds: 20,
  targetSceneSeconds: 5,
  minWordsPerScene: 10,
  maxWordsPerScene: 14,
  minTotalWords: 45,
  maxTotalWords: 55,
  // Writers aim for 45–55 words (10–14 per scene). Since the renderer adapts to any voice length (owner rule:
  // proceed whatever the length), a few words over or under must not stop a reel: these are the accepted limits.
  acceptMinWordsPerScene: 8,
  acceptMaxWordsPerScene: 16,
  acceptMinTotalWords: 40,
  acceptMaxTotalWords: 62,
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
export function validateElevay20SecondReelNarration(scenes: Array<{ spoken_text_ar?: unknown }> | unknown): string | null {
  if (!Array.isArray(scenes) || scenes.length !== ELEVAY_REEL_NARRATION_STANDARD.sceneCount) {
    return "An ELEVAY reel needs exactly four narration scenes for the 20-second voice-over.";
  }

  const lines = scenes.map((scene) => clean((scene as { spoken_text_ar?: unknown })?.spoken_text_ar));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) return `Scene ${index + 1} narration is missing.`;
    if (/^(?:[-•]|\d+[.)])\s*/.test(line)) {
      return `Scene ${index + 1} narration must be continuous spoken text, never a numbered point or bullet.`;
    }
    const words = elevayNarrationWordCount(line);
    if (words < ELEVAY_REEL_NARRATION_STANDARD.acceptMinWordsPerScene || words > ELEVAY_REEL_NARRATION_STANDARD.acceptMaxWordsPerScene) {
      return `Scene ${index + 1} must contain ${ELEVAY_REEL_NARRATION_STANDARD.minWordsPerScene}–${ELEVAY_REEL_NARRATION_STANDARD.maxWordsPerScene} spoken words (${ELEVAY_REEL_NARRATION_STANDARD.acceptMinWordsPerScene}–${ELEVAY_REEL_NARRATION_STANDARD.acceptMaxWordsPerScene} accepted); it has ${words}, too far to fit its 5-second share of the 20-second voice-over.`;
    }
  }

  const totalWords = lines.reduce((total, line) => total + elevayNarrationWordCount(line), 0);
  if (totalWords < ELEVAY_REEL_NARRATION_STANDARD.acceptMinTotalWords || totalWords > ELEVAY_REEL_NARRATION_STANDARD.acceptMaxTotalWords) {
    return `The full reel narration must contain ${ELEVAY_REEL_NARRATION_STANDARD.minTotalWords}–${ELEVAY_REEL_NARRATION_STANDARD.maxTotalWords} words for the 20-second target (${ELEVAY_REEL_NARRATION_STANDARD.acceptMinTotalWords}–${ELEVAY_REEL_NARRATION_STANDARD.acceptMaxTotalWords} accepted); it has ${totalWords}.`;
  }

  if (!/(?:تخيل|لو|قرار|حلم|حيرة|مستقبل|خطة|ليه|مش لازم|قبل ما)/.test(lines[0])) {
    return "Scene 1 needs a high-impact, truthful dramatic hook about the viewer's decision, ambition, or uncertainty.";
  }

  if (!/(?:احجز\s+(?:استشارتك|استشارة)|تواصل\s+مع|كلّمنا|كلمنا|ابعتلنا|ابدأ\s+استشارتك|تعالى\s+نتكلم)/.test(lines[3])) {
    return "Scene 4 must end with a direct consultation call to action, such as احجز استشارتك مع Elevay or تواصل مع Elevay.";
  }

  return null;
}

/** Compatibility export: the system-wide contract is now 20 seconds. */
export const validateElevay18SecondReelNarration = validateElevay20SecondReelNarration;

/**
 * When the whole narration already fits 20 seconds (45–55 words) but one scene's share is outside 10–14 words,
 * re-divide the same words into four near-equal takes instead of failing the reel. Breaks prefer sentence or
 * comma pauses. The text itself is unchanged, only where each 5-second take starts. Returns true if it changed.
 */
export function rebalanceElevay20SecondNarration(scenes: Array<{ spoken_text_ar?: unknown }>): boolean {
  const S = ELEVAY_REEL_NARRATION_STANDARD;
  if (!Array.isArray(scenes) || scenes.length !== S.sceneCount) return false;
  const lines = scenes.map((s) => clean(s?.spoken_text_ar));
  if (lines.some((l) => !l)) return false;
  const counts = lines.map(elevayNarrationWordCount);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < S.acceptMinTotalWords || total > S.acceptMaxTotalWords) return false;
  if (counts.every((c) => c >= S.acceptMinWordsPerScene && c <= S.acceptMaxWordsPerScene)) return false;
  const lo = total >= S.sceneCount * S.minWordsPerScene && total <= S.sceneCount * S.maxWordsPerScene ? S.minWordsPerScene : S.acceptMinWordsPerScene;
  const hi = total >= S.sceneCount * S.minWordsPerScene && total <= S.sceneCount * S.maxWordsPerScene ? S.maxWordsPerScene : S.acceptMaxWordsPerScene;
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  const breaks: number[] = [];
  let start = 0;
  for (let p = 1; p < S.sceneCount; p++) {
    const left = S.sceneCount - p; // takes still to fill after this one
    const ideal = start + Math.round((words.length - start) / (left + 1));
    let best = ideal, bestScore = Infinity;
    for (let k = ideal - 2; k <= ideal + 2; k++) {
      const size = k - start, rest = words.length - k;
      if (size < lo || size > hi) continue;
      if (rest < left * lo || rest > left * hi) continue;
      const score = Math.abs(k - ideal) + (/[.،,!؟?؛…]$/.test(words[k - 1]) ? 0 : 1.5);
      if (score < bestScore) { bestScore = score; best = k; }
    }
    breaks.push(best);
    start = best;
  }
  let from = 0;
  [...breaks, words.length].forEach((b, i) => { (scenes[i] as any).spoken_text_ar = words.slice(from, b).join(" "); from = b; });
  return true;
}

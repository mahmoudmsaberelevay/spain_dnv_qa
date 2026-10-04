/*
 * Read-only price preflight for a possible ELEVAY reel model. This module has no
 * generation, upload, cancellation or release path. A quote is NOT a budget
 * reservation or authorization to create a paid clip.
 */
export const HIGGSFIELD_API_BASE = "https://api.higgsfield.ai";
export const HIGGSFIELD_CANDIDATE_MODEL = "kling-video/v2.5-turbo/standard/image-to-video";
export const ELEVAY_CLIPS_PER_REEL = 4;
export const ELEVAY_CLIP_SECONDS = 5;
export const ELEVAY_ITEM_CAP_USD = 1.5;

type ClipBrief = { keyframeUrl: string; motionPrompt: string };

function assertClipBrief(clip: ClipBrief) {
  const url = new URL(clip.keyframeUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.searchParams.has("key")) {
    throw new Error("A clip needs a public HTTPS OpenAI keyframe URL without credentials.");
  }
  if (!clip.motionPrompt.trim() || clip.motionPrompt.length > 2_500) {
    throw new Error("Each clip needs a bounded non-empty motion prompt.");
  }
}

export async function quoteHiggsfieldReelClips(
  clips: readonly ClipBrief[],
  apiKey: string | undefined = process.env.HF_API_KEY,
  request: typeof fetch = fetch,
) {
  if (clips.length !== ELEVAY_CLIPS_PER_REEL) throw new Error("An ELEVAY reel needs exactly four five-second source clips.");
  for (const clip of clips) assertClipBrief(clip);
  if (!apiKey?.trim()) throw new Error("The complete server-side HF_API_KEY is unavailable.");

  let totalCents = 0;
  for (const clip of clips) {
    // No POST to a generation endpoint. Never trim, split, log or return the key.
    const response = await request(`${HIGGSFIELD_API_BASE}/estimate/${HIGGSFIELD_CANDIDATE_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: clip.motionPrompt,
        image_url: clip.keyframeUrl,
        duration: ELEVAY_CLIP_SECONDS,
        negative_prompt: "speech, dialogue, text, captions, logos, contact details, malformed anatomy or wardrobe",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Higgsfield non-generative estimate returned HTTP ${response.status}. No clip was submitted.`);
    const data = await response.json() as { usd?: unknown };
    const usd = typeof data.usd === "string" || typeof data.usd === "number" ? Number(data.usd) : NaN;
    if (!Number.isFinite(usd) || usd <= 0 || usd > ELEVAY_ITEM_CAP_USD) {
      throw new Error("Higgsfield returned an unusable or over-limit clip quote. No clip was submitted.");
    }
    totalCents += Math.ceil(usd * 100);
    if (totalCents > ELEVAY_ITEM_CAP_USD * 100) throw new Error("Four Higgsfield clips alone exceed the USD 1.50 item cap. No clip was submitted.");
  }
  return {
    model: HIGGSFIELD_CANDIDATE_MODEL,
    clips: ELEVAY_CLIPS_PER_REEL,
    secondsEach: ELEVAY_CLIP_SECONDS,
    estimatedClipUsd: totalCents / 100,
    remainingForKeyframesVoiceAndAssemblyUsd: (ELEVAY_ITEM_CAP_USD * 100 - totalCents) / 100,
    generationEnabled: false as const,
  };
}

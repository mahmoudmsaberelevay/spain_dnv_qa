import crypto from "node:crypto";
import { ELEVAY_HIGGSFIELD_PRO_MODEL } from "./higgsfieldProClipQuote";
import { ELEVAY_OPENAI_VISUAL_MODEL } from "./elevayOpenAiVisuals";
import { ELEVAY_ARABIC_VOICE_DEFAULTS } from "./elevenLabsTts";

/** Illustrative only: one real 864x1536 medium portrait consumed USD 0.0091 (2026-10-04). */
export const OBSERVED_OPENAI_PORTRAIT_USD = 0.0091;
/** ElevenLabs published eleven_v3 API price as of 2026-10-04. The workspace's effective cost may differ. */
export const ELEVEN_V3_PUBLIC_USD_PER_THOUSAND_CHARS = 0.08;

function money(value: number) { return Math.ceil(value * 10_000) / 10_000; }

/** A quote is a decision aid, never a hidden cap or a provider charge. */
export function itemizedElevayReelCostReview(input: {
  itemId: number;
  snapshotHash: string;
  clips: Array<{ clip: number; estimatedUsd: number }>;
  narrationScript: string;
  imageModel?: string;
}) {
  if (!Number.isSafeInteger(input.itemId) || input.itemId <= 0 || !/^[a-f0-9]{64}$/.test(input.snapshotHash)) throw new Error("A persisted weekly item and immutable snapshot are required for cost review.");
  if (input.imageModel && input.imageModel !== ELEVAY_OPENAI_VISUAL_MODEL) throw new Error("An unverified image model cannot use this estimate.");
  if (input.clips.length !== 4 || input.clips.some((clip, i) => clip.clip !== i + 1 || !Number.isFinite(clip.estimatedUsd) || clip.estimatedUsd <= 0)) throw new Error("Exactly four valid account-specific video quotes are required.");
  const script = input.narrationScript.trim();
  if (!script || script.length > 1000) throw new Error("A bounded approved Egyptian-Arabic voice script is required for the narration estimate.");
  const imageCost = money(OBSERVED_OPENAI_PORTRAIT_USD * 4);
  const videoCost = money(input.clips.reduce((sum, clip) => sum + clip.estimatedUsd, 0));
  const voiceCost = money(script.length / 1000 * ELEVEN_V3_PUBLIC_USD_PER_THOUSAND_CHARS);
  const breakdown = [
    { provider: "openai", model: ELEVAY_OPENAI_VISUAL_MODEL, count: 4, estimatedUsd: imageCost, basis: "indicative pilot usage, 864x1536 medium; exact metered tokens may change" },
    { provider: "higgsfield", model: ELEVAY_HIGGSFIELD_PRO_MODEL, count: 4, estimatedUsd: videoCost, basis: "four separate account-specific five-second estimate responses; requote real keyframe inputs before paid clip dispatch" },
    { provider: "elevenlabs", model: ELEVAY_ARABIC_VOICE_DEFAULTS.modelId, count: script.length, estimatedUsd: voiceCost, basis: "published API USD 0.08/1000 characters; actual workspace metering may differ" },
    { provider: "manus_assembly", model: "local_ffmpeg_exact_logo", count: 1, estimatedUsd: 0, basis: "no additional external generation fee; storage/compute are not included" },
  ];
  const quote = { itemId: input.itemId, itemSnapshotHash: input.snapshotHash, priceKind: "indicative_itemized_estimate_not_invoice" as const, fixedCostCap: false as const, breakdown, estimatedSubtotalUsd: money(imageCost + videoCost + voiceCost), caveats: ["OpenAI and ElevenLabs amounts may differ from actual metering.", "One quote covers one attempt per provider step; retries and changed inputs require fresh owner review.", "No publishing, Meta action, or release is included."] };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(quote)).digest("hex");
  return { ...quote, quoteFingerprint: fingerprint };
}

/** One square OpenAI design, exact official logo applied locally only after generation. */
export function itemizedElevayStaticCostReview(input: { itemId: number; snapshotHash: string }) {
  if (!Number.isSafeInteger(input.itemId) || input.itemId <= 0 || !/^[a-f0-9]{64}$/.test(input.snapshotHash)) throw new Error("A persisted static item and immutable snapshot are required for cost review.");
  const quote = {
    itemId: input.itemId,
    itemSnapshotHash: input.snapshotHash,
    priceKind: "indicative_itemized_estimate_not_invoice" as const,
    fixedCostCap: false as const,
    breakdown: [
      { provider: "openai", model: ELEVAY_OPENAI_VISUAL_MODEL, count: 1, estimatedUsd: OBSERVED_OPENAI_PORTRAIT_USD, basis: "illustrative pilot portrait result; square/text usage may differ" },
      { provider: "manus_assembly", model: "local_exact_logo_overlay", count: 1, estimatedUsd: 0, basis: "logo pixels from verified official source; storage/compute not included" },
    ],
    estimatedSubtotalUsd: OBSERVED_OPENAI_PORTRAIT_USD,
    caveats: ["Direct OpenAI image tokens are measured after creation; changed creative/quality requires a new estimate.", "This quote does not authorize any publication, Meta action or ad spend."],
  };
  return { ...quote, quoteFingerprint: crypto.createHash("sha256").update(JSON.stringify(quote)).digest("hex") };
}

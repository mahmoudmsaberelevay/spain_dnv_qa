import { buildHiggsfieldClipRequest, type HiggsfieldClipIntent } from "./higgsfieldClipRequestContract";
import { HIGGSFIELD_API_BASE } from "./higgsfieldClipPreflight";

export const ELEVAY_HIGGSFIELD_PRO_MODEL = "kling-video/v2.5-turbo/pro/image-to-video";

/** Read-only price enquiry. No video task is submitted or charged by this helper. */
export async function quoteElevayHiggsfieldProClips(
  intents: readonly HiggsfieldClipIntent[],
  dependencies: { apiKey?: string; request?: typeof fetch } = {},
) {
  if (intents.length !== 4) throw new Error("An ELEVAY reel requires exactly four keyframe-to-video clips.");
  const apiKey = dependencies.apiKey ?? process.env.HF_API_KEY;
  if (!apiKey?.trim()) throw new Error("Complete server-side HF_API_KEY is unavailable.");
  const request = dependencies.request ?? fetch;
  const quotes: Array<{ clip: number; estimatedUsd: number }> = [];
  for (let index = 0; index < intents.length; index++) {
    const safe = buildHiggsfieldClipRequest(intents[index]);
    const response = await request(`${HIGGSFIELD_API_BASE}/estimate/${ELEVAY_HIGGSFIELD_PRO_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(safe.body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Higgsfield Pro estimate returned HTTP ${response.status}; no paid request was submitted.`);
    const payload = await response.json() as { usd?: unknown };
    const amount = typeof payload.usd === "string" || typeof payload.usd === "number" ? Number(payload.usd) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Higgsfield returned an unusable quote; no clip was submitted.");
    quotes.push({ clip: index + 1, estimatedUsd: Math.ceil(amount * 1000) / 1000 });
  }
  return {
    provider: "higgsfield" as const,
    model: ELEVAY_HIGGSFIELD_PRO_MODEL,
    clips: quotes,
    estimatedTotalUsd: Math.ceil(quotes.reduce((sum, item) => sum + item.estimatedUsd, 0) * 1000) / 1000,
    quoteOnly: true as const,
    estimatedAt: Date.now(),
    excludes: ["OpenAI visuals", "ELEVAY approved voice", "quality retries", "assembly"],
  };
}

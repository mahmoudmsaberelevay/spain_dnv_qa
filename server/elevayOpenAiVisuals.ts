import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";

const API_URL = "https://api.openai.com/v1/images/generations";
const EDITS_URL = "https://api.openai.com/v1/images/edits";
/** Reference images may only come from ELEVAY storage (our own earlier keyframes), never arbitrary URLs. */
const REFERENCE_HOST_RE = /^https:\/\/(?:[a-z0-9-]+\.cloudfront\.net|[a-z0-9.-]*elevay\.(?:vip|com))\//i;
export const ELEVAY_OPENAI_VISUAL_MODEL = "gpt-image-2.5-sunburst";
export const ELEVAY_OPENAI_VISUAL_QUALITY = "high";
export const ELEVAY_REEL_KEYFRAME_SIZE = "864x1536";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function checkPng(data: Buffer, expectedWidth: number, expectedHeight: number) {
  if (data.length < 33 || data.length > MAX_IMAGE_BYTES || !data.subarray(0, 8).equals(PNG_MAGIC) || data.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("OpenAI keyframe was not a bounded valid PNG.");
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) throw new Error("OpenAI keyframe was not native 9:16 portrait at the requested size.");
  return { width, height };
}

/** Server-only primitive. Calling it incurs an OpenAI image charge; not connected to any UI dispatch. */
export async function createElevayOpenAiKeyframe(input: { prompt: string; purpose: "reel_keyframe" | "static_post"; size?: string; referenceUrls?: string[] }, dependencies: {
  request?: typeof fetch;
  save?: typeof storagePut;
  apiKey?: string;
} = {}) {
  const apiKey = dependencies.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) throw new Error("Server-only OpenAI credentials are missing.");
  const prompt = input.prompt.trim();
  if (prompt.length < 80 || prompt.length > 4_000) throw new Error("A bounded, detailed ELEVAY visual brief is required.");
  if (/(?:https?:\/\/|@[a-z0-9.-]+\.|\+\d{7,}|\b(?:passport\s*number|client\s*name|lead\s*id)\b)/i.test(prompt)) {
    throw new Error("Visual prompts must not contain links, contact details or client/Lead identifiers.");
  }
  const size = input.size ?? (input.purpose === "reel_keyframe" ? ELEVAY_REEL_KEYFRAME_SIZE : "1024x1024");
  if (input.purpose === "reel_keyframe" && size !== ELEVAY_REEL_KEYFRAME_SIZE) throw new Error("A reel keyframe must be native 9:16 portrait.");
  if (input.purpose === "static_post" && size !== "1024x1024") throw new Error("The approved static design must be square.");
  const request = dependencies.request ?? fetch;
  const refs = (input.referenceUrls || []).filter((u) => REFERENCE_HOST_RE.test(String(u))).slice(0, 2);
  if ((input.referenceUrls || []).length && !refs.length) throw new Error("Reference keyframe is not stored in ELEVAY storage; generate from the cast sheet instead.");
  let response: Response;
  if (refs.length) {
    // Owner rule (26 Oct 2026): later keyframes of a reel are made FROM an earlier keyframe so the same people keep
    // the same faces and outfits. The reference is our own stored PNG, sent to the image edits endpoint.
    const form = new FormData();
    form.append("model", ELEVAY_OPENAI_VISUAL_MODEL);
    form.append("prompt", prompt);
    form.append("n", "1");
    form.append("size", size);
    form.append("quality", ELEVAY_OPENAI_VISUAL_QUALITY);
    form.append("input_fidelity", "high");
    for (const [k, url] of refs.entries()) {
      const got = await request(url, { signal: AbortSignal.timeout(60_000) });
      if (!got.ok) throw new Error(`Reference keyframe could not be downloaded (HTTP ${got.status}).`);
      const buf = Buffer.from(await got.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES || !buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error("Reference keyframe is not a bounded PNG.");
      form.append("image[]", new Blob([buf], { type: "image/png" }), `reference-${k + 1}.png`);
    }
    response = await request(EDITS_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(300_000) });
  } else {
    response = await request(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: ELEVAY_OPENAI_VISUAL_MODEL, prompt, n: 1, size, quality: ELEVAY_OPENAI_VISUAL_QUALITY, output_format: "png" }),
      signal: AbortSignal.timeout(300_000),
    });
  }
  if (!response.ok) throw new Error(`OpenAI image request returned HTTP ${response.status}; no provider error body is exposed.`);
  const result = await response.json() as { data?: Array<{ b64_json?: unknown }>; usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown } };
  const image64 = result.data?.[0]?.b64_json;
  if (typeof image64 !== "string" || image64.length > MAX_IMAGE_BYTES * 1.5) throw new Error("OpenAI returned no bounded image payload.");
  const bytes = Buffer.from(image64, "base64");
  const [width, height] = size.split("x").map(Number);
  checkPng(bytes, width, height);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const key = `marketing/openai/${input.purpose}/${nanoid(16)}-${sha256.slice(0, 12)}.png`;
  const stored = await (dependencies.save ?? storagePut)(key, bytes, "image/png");
  const inputTokens = Number(result.usage?.input_tokens ?? NaN);
  const outputTokens = Number(result.usage?.output_tokens ?? NaN);
  // Direct Image API, prompt-only input: official text-input $5/M and image-output $30/M (2026-10-04).
  const measuredCostUsd = Number.isFinite(inputTokens) && Number.isFinite(outputTokens) ? Math.ceil((inputTokens * 5 + outputTokens * 30) / 1_000_000 * 10000) / 10000 : null;
  return { provider: "openai" as const, model: ELEVAY_OPENAI_VISUAL_MODEL, url: stored.url, storageKey: stored.key, sha256, width, height, inputTokens: Number.isFinite(inputTokens) ? inputTokens : null, outputTokens: Number.isFinite(outputTokens) ? outputTokens : null, measuredCostUsd };
}

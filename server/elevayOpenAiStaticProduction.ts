import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyOfficialElevayLogoToStatic } from "./elevayBrandMedia";
import { createElevayOpenAiKeyframe } from "./elevayOpenAiVisuals";
import { FFMPEG_BIN, requireMediaRenderer } from "./mediaExecutables";
import { storagePut } from "./storage";
import { ELEVAY_APPROVED_STATIC_FONT_FAMILY, requireElevayApprovedStaticTypography } from "./elevayStaticTypography";

/**
 * This is deliberately a server-only, review-only production primitive. It does
 * not read or update the database, dispatch from the UI, publish, schedule, or
 * handle contact/Lead data. A durable idempotency/review owner must call it.
 */
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 12 * 1024 * 1024;
const STATIC_SIZE = 1024;
const MIN_PROMPT_CHARS = 80;
const MAX_PROMPT_CHARS = 4_000;
const MIN_TEXT_CHARS = 2;
const MAX_TEXT_CHARS = 180;

export type ReadyWeeklyStaticItem = Readonly<{
  /** Saved weekly item identifier; used only in the content-addressed final key. */
  id: number | string;
  itemType: "static_post";
  /** The caller must have moved the saved item into this server-side state. */
  status: "ready_to_generate";
  /** The only intended visible copy. Arabic and non-English scripts are refused. */
  onDesignEnglishText: string;
  /** Detailed scene prompt supplied from the reviewed weekly item, never a contact record. */
  detailedPrompt: string;
}>;

export type OpenAiStaticKeyframe = Readonly<{
  provider: "openai";
  model: string;
  url: string;
  storageKey: string;
  sha256: string;
  width: number;
  height: number;
  inputTokens: number | null;
  outputTokens: number | null;
  measuredCostUsd: number | null;
}>;

export type ApprovedStaticTypography = Awaited<ReturnType<typeof requireElevayApprovedStaticTypography>>;

export type ElevayStaticFfmpeg = {
  /** Render only the review text treatment; logo compositing remains a separate official helper. */
  overlayEnglishText(input: Readonly<{
    source: Buffer;
    text: string;
    typography: ApprovedStaticTypography;
    width: 1024;
    height: 1024;
    contrastGradient: "dark_navy_bottom";
  }>): Promise<Buffer>;
};

export type ImmutableStaticStore = (key: string, bytes: Buffer, mimeType: "image/png") => Promise<{ key: string; url: string }>;

export type ElevayOpenAiStaticProductionDependencies = Readonly<{
  /** Explicit allow-list; never infer trust from an OpenAI response URL. */
  trustedFirstPartyStorageOrigins: readonly string[];
  createKeyframe?: (input: { prompt: string; purpose: "static_post"; size?: string }) => Promise<OpenAiStaticKeyframe>;
  download?: typeof fetch;
  typography?: () => Promise<ApprovedStaticTypography>;
  ffmpeg?: ElevayStaticFfmpeg;
  applyOfficialLogo?: (source: Buffer) => Promise<{ bytes: Buffer; logoSha256: string }>;
  storeImmutable?: ImmutableStaticStore;
}>;

export type ElevayStaticProductionResult = Readonly<{
  reviewOnly: true;
  publicationAuthorized: false;
  itemId: number | string;
  final: Readonly<{ storageKey: string; url: string; sha256: string; mimeType: "image/png"; width: 1024; height: 1024 }>;
  provenance: Readonly<{
    provider: "openai";
    model: string;
    keyframe: Readonly<{ storageKey: string; sha256: string; width: 1024; height: 1024 }>;
    promptSha256: string;
    onDesignEnglishTextSha256: string;
    typography: Readonly<{ family: typeof ELEVAY_APPROVED_STATIC_FONT_FAMILY; approvedFallback: true; faceSha256: readonly string[] }>;
    officialLogoSha256: string;
  }>;
  /** Metered usage-derived amount returned by the existing OpenAI keyframe primitive; never a budget estimate. */
  actualOpenAiCostUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}>;

function sha256(bytes: Buffer | string) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function assertPng1024(bytes: Buffer, label: string) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_MAGIC) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`${label} must be a bounded PNG.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== STATIC_SIZE || height !== STATIC_SIZE) throw new Error(`${label} must be exactly 1024x1024 PNG.`);
  return { width: 1024 as const, height: 1024 as const };
}

function hasArabicOrNonEnglishScript(value: string) {
  // ASCII plus standard English typography is deliberately conservative: this
  // rejects Arabic, Arabic-Indic digits, emoji, and any other non-English script.
  return /[^\x09\x0A\x0D\x20-\x7E]/.test(value);
}

function containsSensitiveOrContactData(value: string) {
  return /(?:https?:\/\/|www\.|@[a-z0-9.-]+\.[a-z]{2,}|\+?\d[\d()\s.-]{6,}\d|\b(?:client\s*(?:name|id|email|phone)?|lead\s*(?:id|name|email|phone)?|passport\s*(?:number|no\.?|id)?|email|phone|whatsapp)\b)/i.test(value);
}

function containsProhibitedClaim(value: string) {
  return /\b(?:guarantee(?:d|s)?|guaranteed\s+approval|approval\s+guaranteed|100%\s*(?:approval|success)|certain\s+approval|instant\s+(?:approval|residency)|act\s+now|limited\s+spots?)\b/i.test(value);
}

function assertSafeEnglishPhrase(text: string) {
  const normalized = text.trim();
  if (normalized.length < MIN_TEXT_CHARS || normalized.length > MAX_TEXT_CHARS) throw new Error("On-design English text must be a bounded 2–180 character phrase.");
  if (normalized.split(/\r?\n/).length > 3) throw new Error("On-design English text may contain at most three lines.");
  if (hasArabicOrNonEnglishScript(normalized)) throw new Error("On-design text must be English-only; Arabic or other scripts are not allowed in static production.");
  if (!/[A-Za-z]/.test(normalized)) throw new Error("On-design text must contain an English phrase.");
  if (containsSensitiveOrContactData(normalized)) throw new Error("On-design text must not contain contact, client, or Lead data.");
  if (containsProhibitedClaim(normalized)) throw new Error("On-design text must not include guarantees, approval claims, or urgency.");
  return normalized;
}

function assertSafeDetailedPrompt(prompt: string) {
  const normalized = prompt.trim();
  if (normalized.length < MIN_PROMPT_CHARS || normalized.length > MAX_PROMPT_CHARS) throw new Error("A bounded 80–4000 character detailed static prompt is required.");
  if (hasArabicOrNonEnglishScript(normalized)) throw new Error("Detailed static prompts must be English-only and must not include Arabic text.");
  if (containsSensitiveOrContactData(normalized)) throw new Error("Detailed static prompts must not contain links, contact, client, or Lead data.");
  if (containsProhibitedClaim(normalized)) throw new Error("Detailed static prompts must not include guarantees, approval claims, or urgency.");
  return normalized;
}

function assertReadySavedStaticItem(item: ReadyWeeklyStaticItem) {
  if (!item || (typeof item.id !== "string" && typeof item.id !== "number") || String(item.id).trim().length === 0) throw new Error("A saved weekly static item identifier is required.");
  if (item.itemType !== "static_post") throw new Error("This production stage accepts static_post items only; reels are refused.");
  if (item.status !== "ready_to_generate") throw new Error("Saved weekly static item is not ready_to_generate.");
  return { text: assertSafeEnglishPhrase(item.onDesignEnglishText), prompt: assertSafeDetailedPrompt(item.detailedPrompt) };
}

function safeKeySegment(value: string | number) {
  const normalized = String(value).trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized || normalized.length > 120) throw new Error("Saved weekly static item identifier cannot form a safe managed-storage key.");
  return normalized;
}

function normalizeTrustedOrigins(origins: readonly string[]) {
  if (!Array.isArray(origins) || origins.length === 0) throw new Error("A non-empty trusted first-party storage-origin allow-list is required.");
  return new Set(origins.map(origin => {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error("Trusted first-party storage origins must be valid HTTPS origins."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("Trusted first-party storage origins must be bare HTTPS origins.");
    }
    return parsed.origin;
  }));
}

function assertTrustedFirstPartyStorageUrl(url: string, trustedOrigins: Set<string>) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("OpenAI keyframe did not return an absolute HTTPS storage URL."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !trustedOrigins.has(parsed.origin)) {
    throw new Error("Refusing keyframe from an untrusted CDN or non-first-party storage origin.");
  }
  return parsed;
}

function assertApprovedTypography(typography: ApprovedStaticTypography): ApprovedStaticTypography {
  if (typography?.family !== ELEVAY_APPROVED_STATIC_FONT_FAMILY || typography.approvedFallback !== true || !Array.isArray(typography.faces)) {
    throw new Error("Owner-approved Plus Jakarta Sans fallback is required for static production.");
  }
  const regular = typography.faces.find(face => face.weight === "regular");
  const bold = typography.faces.find(face => face.weight === "bold");
  if (!regular?.path || !bold?.path || !isSha256(regular.sha256) || !isSha256(bold.sha256)) {
    throw new Error("Owner-approved static typography faces are incomplete or unverified.");
  }
  return typography;
}

function staticKeyframePrompt(prompt: string) {
  const safeguard = "Generate only a premium, editorial 1024x1024 background image. Do not render any visible text, Arabic, letters, numbers, ELEVAY logo, logo-like mark, contact detail, passport, flag, approval seal, or guarantee. The production stage adds approved English typography and the exact official logo afterwards.";
  const combined = `${prompt}\n\n${safeguard}`;
  if (combined.length > MAX_PROMPT_CHARS) throw new Error("Detailed static prompt leaves no room for mandatory brand-safety production instructions.");
  return combined;
}

function runProcess(binary: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Static text composition timed out.")); }, 45_000);
    child.stderr.on("data", data => { stderr = `${stderr}${data.toString()}`.slice(-900); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`Static text composition failed (${code}): ${stderr.slice(-260)}`));
    });
  });
}

function ffmpegFilterPath(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** Default production renderer. Tests inject ElevayStaticFfmpeg and never execute it. */
const productionFfmpeg: ElevayStaticFfmpeg = {
  async overlayEnglishText(input) {
    await requireMediaRenderer();
    const boldFace = input.typography.faces.find(face => face.weight === "bold");
    if (!boldFace) throw new Error("Owner-approved bold Plus Jakarta Sans font is unavailable.");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "elevay-static-text-"));
    try {
      const sourcePath = path.join(dir, "keyframe.png");
      const textPath = path.join(dir, "english-copy.txt");
      const outputPath = path.join(dir, "text-treated.png");
      await Promise.all([
        fs.writeFile(sourcePath, input.source, { mode: 0o600 }),
        fs.writeFile(textPath, input.text, { mode: 0o600 }),
      ]);
      const gradient = "color=c=0x3D4750:s=1024x1024,format=rgba,geq=r='61':g='71':b='80':a='if(gte(Y,440),min(225,(Y-440)*0.39),0)'[shade]";
      const filter = [
        `[0:v]scale=1024:1024:flags=lanczos[base]`,
        gradient,
        `[base][shade]overlay=0:0:format=auto[contrast]`,
        `[contrast]drawtext=fontfile='${ffmpegFilterPath(boldFace.path)}':textfile='${ffmpegFilterPath(textPath)}':fontcolor=white:fontsize=64:line_spacing=14:x=72:y=h-th-80:fix_bounds=1[out]`,
      ].join(";");
      await runProcess(FFMPEG_BIN, ["-y", "-hide_banner", "-loglevel", "error", "-i", sourcePath, "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", "-c:v", "png", outputPath]);
      const output = await fs.readFile(outputPath);
      assertPng1024(output, "Text-treated static image");
      return output;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
};

/**
 * Produces one immutable review asset. It deliberately has no UI, DB, release,
 * contact, or publication integration; callers must provide durable idempotency
 * and owner approval outside this primitive.
 */
export async function produceElevayOpenAiStaticForOwnerReview(
  item: ReadyWeeklyStaticItem,
  dependencies: ElevayOpenAiStaticProductionDependencies,
): Promise<ElevayStaticProductionResult> {
  // All no-cost validation (including first-party origin configuration) happens
  // before typography validation and before the chargeable OpenAI operation.
  const prepared = assertReadySavedStaticItem(item);
  const trustedOrigins = normalizeTrustedOrigins(dependencies.trustedFirstPartyStorageOrigins);
  const typography = assertApprovedTypography(await (dependencies.typography ?? requireElevayApprovedStaticTypography)());

  const keyframe = await (dependencies.createKeyframe ?? createElevayOpenAiKeyframe)({
    purpose: "static_post",
    size: "1024x1024",
    prompt: staticKeyframePrompt(prepared.prompt),
  });
  if (keyframe.provider !== "openai" || !keyframe.model || !keyframe.storageKey || !isSha256(keyframe.sha256) || keyframe.width !== STATIC_SIZE || keyframe.height !== STATIC_SIZE) {
    throw new Error("OpenAI static keyframe provenance or fixed dimensions are invalid.");
  }

  assertTrustedFirstPartyStorageUrl(keyframe.url, trustedOrigins);
  const response = await (dependencies.download ?? fetch)(keyframe.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) {
    throw new Error("Trusted first-party keyframe download was not an available PNG.");
  }
  const keyframeBytes = Buffer.from(await response.arrayBuffer());
  assertPng1024(keyframeBytes, "Downloaded OpenAI keyframe");
  if (sha256(keyframeBytes) !== keyframe.sha256.toLowerCase()) throw new Error("Downloaded OpenAI keyframe SHA-256 does not match provider provenance.");

  const textTreated = await (dependencies.ffmpeg ?? productionFfmpeg).overlayEnglishText({
    source: keyframeBytes,
    text: prepared.text,
    typography,
    width: STATIC_SIZE,
    height: STATIC_SIZE,
    contrastGradient: "dark_navy_bottom",
  });
  assertPng1024(textTreated, "Text-treated static image");

  // The sole logo path is the existing exact-active-logo compositor. The source
  // prompt explicitly prohibits a generated mark, and this function never takes
  // a logo image, SVG, or synthetic-logo option from a caller.
  const branded = await (dependencies.applyOfficialLogo ?? applyOfficialElevayLogoToStatic)(textTreated);
  if (!isSha256(branded?.logoSha256)) throw new Error("The exact active official ELEVAY logo fingerprint is required.");
  assertPng1024(branded.bytes, "Final ELEVAY static image");

  const finalSha256 = sha256(branded.bytes);
  const finalKey = `marketing/static-production/${safeKeySegment(item.id)}/${finalSha256}.png`;
  const stored = await (dependencies.storeImmutable ?? storagePut)(finalKey, branded.bytes, "image/png");
  if (!stored?.key || !stored.url || stored.key !== finalKey) throw new Error("Managed storage did not preserve the immutable content-addressed static asset key.");

  return {
    reviewOnly: true,
    publicationAuthorized: false,
    itemId: item.id,
    final: { storageKey: stored.key, url: stored.url, sha256: finalSha256, mimeType: "image/png", width: STATIC_SIZE, height: STATIC_SIZE },
    provenance: {
      provider: "openai",
      model: keyframe.model,
      keyframe: { storageKey: keyframe.storageKey, sha256: keyframe.sha256.toLowerCase(), width: STATIC_SIZE, height: STATIC_SIZE },
      promptSha256: sha256(prepared.prompt),
      onDesignEnglishTextSha256: sha256(prepared.text),
      typography: { family: ELEVAY_APPROVED_STATIC_FONT_FAMILY, approvedFallback: true, faceSha256: typography.faces.map(face => face.sha256) },
      officialLogoSha256: branded.logoSha256.toLowerCase(),
    },
    actualOpenAiCostUsd: keyframe.measuredCostUsd,
    inputTokens: keyframe.inputTokens,
    outputTokens: keyframe.outputTokens,
  };
}

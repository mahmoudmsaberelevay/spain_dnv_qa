import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { lookup } from "node:dns/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { verifiedLogoBytes } from "./elevayBrandMedia";

const MAX_VIDEO_BYTES = 350 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_DURATION_SECONDS = 180;
const VERTICAL_RATIO = 16 / 9;

export type ReelMediaProbe = {
  durationMs: number;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
};

type ApprovedAsset = { url: string; sha256: string; mimeType: string };
export type ReviewOnlyReelCompositionInput = {
  weeklyItemId: number;
  sourceVideo: ApprovedAsset;
  narration: ApprovedAsset;
};
export type ReviewOnlyReelCompositionOutput = {
  outputStorageKey: string;
  outputUrl: string;
  outputSha256: string;
  outputBytes: number;
  sourceProbe: ReelMediaProbe;
  narrationProbe: ReelMediaProbe;
  outputProbe: ReelMediaProbe;
  inputManifest: Record<string, unknown>;
};

function isPrivateIp(address: string) {
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

async function assertSafeHttpsUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Composition inputs must be valid HTTPS asset URLs."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Composition inputs must use credential-free HTTPS asset URLs.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(entry => isPrivateIp(entry.address))) throw new Error("Composition input host is not permitted.");
  return url;
}

function run(command: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out.`)); }, timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export async function probeReelMedia(filePath: string): Promise<ReelMediaProbe> {
  const output = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", filePath], 30_000);
  const parsed = JSON.parse(output) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }> };
  const durationSeconds = Number(parsed.format?.duration ?? 0);
  const video = parsed.streams?.find(stream => stream.codec_type === "video");
  const audio = parsed.streams?.find(stream => stream.codec_type === "audio");
  return {
    durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : 0,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}

function validateSourceVideo(probe: ReelMediaProbe) {
  if (!probe.videoCodec || !probe.width || !probe.height || probe.durationMs < 500 || probe.durationMs > MAX_DURATION_SECONDS * 1000) throw new Error("The approved source must be a playable video shorter than three minutes.");
  const ratio = probe.height / probe.width;
  if (Math.abs(ratio - VERTICAL_RATIO) > 0.035) throw new Error("The approved source reel must be vertical 9:16 before narration composition.");
}

function validateNarration(probe: ReelMediaProbe) {
  if (!probe.audioCodec || probe.durationMs < 200 || probe.durationMs > MAX_DURATION_SECONDS * 1000) throw new Error("The approved Arabic narration must be playable and shorter than three minutes.");
}

async function downloadApprovedAsset(asset: ApprovedAsset, destination: string, maxBytes: number, expectedPrefix: string) {
  const url = await assertSafeHttpsUrl(asset.url);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error("Unable to download an approved composition asset.");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith(expectedPrefix)) throw new Error("Approved asset content type does not match its required media type.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > maxBytes) throw new Error("Approved composition asset exceeds the safe size limit.");
    chunks.push(next.value);
  }
  const body = Buffer.concat(chunks);
  const actualHash = crypto.createHash("sha256").update(body).digest("hex");
  if (actualHash !== asset.sha256.toLowerCase()) throw new Error("Approved composition asset fingerprint does not match the reviewed asset.");
  await fs.writeFile(destination, body, { mode: 0o600 });
  return { bytes, contentType };
}

/**
 * Retrieves a public final-preview asset through the same SSRF and size controls
 * used by the compositor, then calculates its server-side SHA-256 fingerprint.
 * The fingerprint is a background integrity control; callers must never ask a
 * marketing user to calculate or enter it manually.
 */
export async function fingerprintMarketingAsset(previewUrl: string, allowedMimePrefixes: string[] = ["image/", "video/"]) {
  const url = await assertSafeHttpsUrl(previewUrl);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error("The final preview could not be downloaded for automatic verification.");
  const mimeType = response.headers.get("content-type")?.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!allowedMimePrefixes.some(prefix => mimeType.startsWith(prefix))) throw new Error("The selected asset type is not permitted for this review step.");
  const reader = response.body.getReader();
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > MAX_VIDEO_BYTES) throw new Error("The final preview exceeds the safe 350 MB limit.");
    hash.update(next.value);
  }
  if (bytes === 0) throw new Error("The final preview is empty.");
  return { sha256: hash.digest("hex"), mimeType, bytes };
}

export async function fingerprintMarketingPreview(previewUrl: string) {
  return fingerprintMarketingAsset(previewUrl, ["image/", "video/"]);
}

async function composeLocal(sourcePath: string, narrationPath: string, outputPath: string, logoPath?: string): Promise<{ sourceProbe: ReelMediaProbe; narrationProbe: ReelMediaProbe; outputProbe: ReelMediaProbe }> {
  const sourceProbe = await probeReelMedia(sourcePath);
  const narrationProbe = await probeReelMedia(narrationPath);
  validateSourceVideo(sourceProbe);
  validateNarration(narrationProbe);
  const sourceNarrativeSeconds = Math.max(1, sourceProbe.durationMs / 1000 - (logoPath ? 3 : 0));
  const narrativeSeconds = logoPath ? Math.max(sourceNarrativeSeconds, narrationProbe.durationMs / 1000) : Math.max(sourceProbe.durationMs, narrationProbe.durationMs) / 1000;
  if (logoPath && narrativeSeconds / sourceNarrativeSeconds > 1.8) throw new Error("The Egyptian narration exceeds the reel's available scene time. Shorten the script or regenerate longer footage before review.");
  const outputDurationMs = Math.round((narrativeSeconds + (logoPath ? 3 : 0)) * 1000);
  const outputSeconds = (outputDurationMs / 1000).toFixed(3);
  const outroExtensionSeconds = Math.max(0, (narrationProbe.durationMs - sourceProbe.durationMs) / 1000).toFixed(3);
  const videoFilter = Number(outroExtensionSeconds) > 0
    ? `[0:v]tpad=stop_mode=clone:stop_duration=${outroExtensionSeconds}[v]`
    : `[0:v]null[v]`;
  const hasBedAudio = Boolean(sourceProbe.audioCodec);
  const args = logoPath
    ? ["-y", "-i", sourcePath, "-i", narrationPath, "-loop", "1", "-framerate", "30", "-i", logoPath,
      "-filter_complex", `[0:v]trim=duration=${sourceNarrativeSeconds.toFixed(3)},setpts=(PTS-STARTPTS)*${(narrativeSeconds / sourceNarrativeSeconds).toFixed(6)},scale=1080:1920:flags=lanczos,setsar=1,fps=30[vmain];color=c=white:s=1080x1920:r=30:d=3[white];[2:v]scale=350:-1:flags=lanczos[logo];[white][logo]overlay=(W-w)/2:(H-h)/2:shortest=1,trim=duration=3,setpts=PTS-STARTPTS[outro];[vmain][outro]concat=n=2:v=1:a=0[v];${hasBedAudio ? `[0:a]volume=0.18,apad=pad_dur=${outputSeconds}[bed];[1:a]apad=pad_dur=${narrativeSeconds.toFixed(3)}[narration];[bed][narration]amix=inputs=2:duration=longest:normalize=0,atrim=duration=${outputSeconds}[a]` : `[1:a]apad=pad_dur=${outputSeconds},atrim=duration=${outputSeconds}[a]`}`,
      "-map", "[v]", "-map", "[a]", "-t", outputSeconds, "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath]
    : hasBedAudio
    ? ["-y", "-i", sourcePath, "-i", narrationPath, "-filter_complex", `${videoFilter};[0:a]volume=0.18,apad=pad_dur=${outputSeconds}[bed];[1:a]apad=pad_dur=${outputSeconds}[narration];[bed][narration]amix=inputs=2:duration=longest:normalize=0[a]`, "-map", "[v]", "-map", "[a]", "-t", outputSeconds, "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath]
    : ["-y", "-i", sourcePath, "-i", narrationPath, "-filter_complex", `${videoFilter};[1:a]apad=pad_dur=${outputSeconds}[a]`, "-map", "[v]", "-map", "[a]", "-t", outputSeconds, "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath];
  await run("ffmpeg", args, 180_000);
  const outputProbe = await probeReelMedia(outputPath);
  if (!outputProbe.videoCodec || !outputProbe.audioCodec || !outputProbe.width || !outputProbe.height || Math.abs(outputProbe.durationMs - outputDurationMs) > 1_250 || (logoPath && (outputProbe.width !== 1080 || outputProbe.height !== 1920))) {
    throw new Error("The composed output did not pass audio/video stream and duration verification.");
  }
  return { sourceProbe, narrationProbe, outputProbe };
}

/**
 * Downloads only already-approved, SHA-256-pinned assets, muxes Arabic narration
 * into the reviewed vertical source, validates the resulting MP4, and stores it
 * for a new final-preview review. It never generates a clip, publishes content,
 * schedules a post, or contacts any Meta endpoint.
 */
export async function composeApprovedReelForReview(input: ReviewOnlyReelCompositionInput): Promise<ReviewOnlyReelCompositionOutput> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "elevay-reel-compose-"));
  try {
    const sourcePath = path.join(tempDir, "approved-source.mp4");
    const narrationPath = path.join(tempDir, "approved-narration.mp3");
    const logoPath = path.join(tempDir, "official-elevay-logo.png");
    const outputPath = path.join(tempDir, "review-composition.mp4");
    await downloadApprovedAsset(input.sourceVideo, sourcePath, MAX_VIDEO_BYTES, "video/");
    await downloadApprovedAsset(input.narration, narrationPath, MAX_AUDIO_BYTES, "audio/");
    const officialLogo = await verifiedLogoBytes();
    await fs.writeFile(logoPath, officialLogo.bytes, { mode: 0o600 });
    const probes = await composeLocal(sourcePath, narrationPath, outputPath, logoPath);
    const output = await fs.readFile(outputPath);
    if (!output.length) throw new Error("The composed output is empty.");
    const outputSha256 = crypto.createHash("sha256").update(output).digest("hex");
    const outputStorageKey = `marketing/reel-compositions/review/${nanoid(14)}-approved-narration.mp4`;
    const stored = await storagePut(outputStorageKey, output, "video/mp4");
    return {
      outputStorageKey: stored.key,
      outputUrl: stored.url,
      outputSha256,
      outputBytes: output.length,
      ...probes,
      inputManifest: {
        weeklyItemId: input.weeklyItemId,
        sourceVideo: { sha256: input.sourceVideo.sha256, mimeType: input.sourceVideo.mimeType },
        narration: { sha256: input.narration.sha256, mimeType: input.narration.mimeType },
        composition: "ffmpeg_review_only_egyptian_narration_exact_official_logo_outro",
        exactOfficialLogoSha256: officialLogo.sha256,
        externalActions: false,
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export const __reelCompositorForTests = { composeLocal, validateSourceVideo, validateNarration, isPrivateIp };

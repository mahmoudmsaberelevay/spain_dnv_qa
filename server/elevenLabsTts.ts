import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";
import { validateElevayArabicVoiceOverScript } from "../shared/marketingCreativeLanguagePolicy";

const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_TIMEOUT_MS = 60_000;

export const ELEVAY_ARABIC_VOICE_DEFAULTS = {
  voiceId: "nc8XQG8lRYRZDnjvKW0H",
  modelId: "eleven_v3",
  languageCode: "ar",
  outputFormat: "mp3_44100_128",
  stability: 0.5,
} as const;

/**
 * Raised only when the connected ElevenLabs workspace cannot access the
 * owner-approved ELEVAY voice. This must never silently fall back to a
 * different voice: brand consistency is more important than a substitute.
 */
export class ElevenLabsVoiceUnavailableError extends Error {
  constructor() {
    super("The approved ELEVAY voice is unavailable to the connected ElevenLabs workspace.");
    this.name = "ElevenLabsVoiceUnavailableError";
  }
}

export function prepareThoughtfulArabicScript(text: string): string {
  const normalized = text.trim();
  return /^\[thoughtful\]/i.test(normalized) ? normalized : `[thoughtful] ${normalized}`;
}

export function isValidMp3Buffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  // MPEG audio frame sync: 11 one-bits then an allowed MPEG layer/version byte.
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function parseElevenLabsErrorCode(details: string): string | null {
  try {
    const payload = JSON.parse(details) as { detail?: { code?: unknown } };
    return typeof payload.detail?.code === "string" ? payload.detail.code : null;
  } catch {
    return null;
  }
}

function getUserSafeErrorMessage(status: number, providerCode: string | null): string {
  if (status === 404 && providerCode === "voice_not_found") {
    return "The approved ELEVAY voice is not available to the current ElevenLabs workspace. An administrator must reconnect an API key from the workspace that owns or is authorized for this voice.";
  }
  if (status === 401 || status === 403) {
    return "The voice service could not be authorized. Please contact an administrator.";
  }
  if (status === 429) {
    return "The voice service is currently busy. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "The voice service is temporarily unavailable. Please try again shortly.";
  }
  return "The voice-over could not be generated. Please review the text and try again.";
}

export async function generateElevayArabicVoiceOver(text: string) {
  if (!ENV.elevenLabsApiKey) {
    throw new Error("ELEVENLABS_NOT_CONFIGURED");
  }

  const languageProblem = validateElevayArabicVoiceOverScript(text);
  if (languageProblem) {
    const error = new Error(languageProblem);
    error.name = "ElevenLabsLanguagePolicyError";
    throw error;
  }

  const script = prepareThoughtfulArabicScript(text);
  const endpoint = `${ELEVENLABS_TTS_ENDPOINT}/${ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId}?output_format=${ELEVAY_ARABIC_VOICE_DEFAULTS.outputFormat}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": ENV.elevenLabsApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        model_id: ELEVAY_ARABIC_VOICE_DEFAULTS.modelId,
        language_code: ELEVAY_ARABIC_VOICE_DEFAULTS.languageCode,
        voice_settings: {
          stability: ELEVAY_ARABIC_VOICE_DEFAULTS.stability,
        },
      }),
      signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[ElevenLabs] Speech generation request failed", { isTimeout });
    throw new Error(isTimeout ? "ELEVENLABS_TIMEOUT" : "ELEVENLABS_UNAVAILABLE");
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const providerCode = parseElevenLabsErrorCode(details);
    console.error("[ElevenLabs] Speech generation failed", { status: response.status, providerCode });
    if (response.status === 404 && providerCode === "voice_not_found") {
      throw new ElevenLabsVoiceUnavailableError();
    }
    const error = new Error(getUserSafeErrorMessage(response.status, providerCode));
    error.name = "ElevenLabsError";
    throw error;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (audioBuffer.length === 0 || !contentType.startsWith("audio/") || !isValidMp3Buffer(audioBuffer)) {
    console.error("[ElevenLabs] Rejected invalid audio response", {
      contentType: contentType || null,
      bytes: audioBuffer.length,
    });
    throw new Error("ELEVENLABS_INVALID_AUDIO");
  }

  const fileName = `elevay-arabic-voiceover-${Date.now()}.mp3`;
  const fileKey = `marketing/voice-overs/${nanoid(12)}-${fileName}`;
  const { url } = await storagePut(fileKey, audioBuffer, "audio/mpeg");
  const sha256 = crypto.createHash("sha256").update(audioBuffer).digest("hex");

  return {
    url,
    fileName,
    script,
    model: ELEVAY_ARABIC_VOICE_DEFAULTS.modelId,
    outputFormat: ELEVAY_ARABIC_VOICE_DEFAULTS.outputFormat,
    bytes: audioBuffer.length,
    sha256,
  };
}

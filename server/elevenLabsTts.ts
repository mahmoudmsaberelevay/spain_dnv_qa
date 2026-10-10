import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";
import { validateElevayArabicVoiceOverScript } from "../shared/marketingCreativeLanguagePolicy";
import { prepareEgyptianReelNarration } from "../shared/elevayVideoNarration";
import { ELEVAY_LOCKED_VOICE_POLICY, requireElevayVoiceId } from "../shared/elevayVoicePolicy";
import { notifyOwner } from "./_core/notification";

const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-dialogue";
const ELEVENLABS_TIMEOUT_MS = 60_000;

export const ELEVAY_ARABIC_VOICE_DEFAULTS = ELEVAY_LOCKED_VOICE_POLICY;

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

/** All CRM TTS paths use the same Egyptian preflight; never fall back to generic Arabic. */
export function prepareElevayEgyptianSpeechScript(text: string): string {
  try {
    return prepareThoughtfulArabicScript(prepareEgyptianReelNarration(text));
  } catch (caught) {
    const error = new Error(caught instanceof Error ? caught.message : "Narration must be natural Egyptian Arabic.");
    error.name = "ElevenLabsLanguagePolicyError";
    throw error;
  }
}

export function isValidMp3Buffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  // MPEG audio frame sync: 11 one-bits then an allowed MPEG layer/version byte.
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

export function parseElevenLabsErrorCode(details: string): string | null {
  try {
    const payload = JSON.parse(details) as { detail?: { code?: unknown; status?: unknown } };
    const code = payload.detail?.status ?? payload.detail?.code;
    return typeof code === "string" && /^[a-z0-9_]{1,80}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function getUserSafeErrorMessage(status: number, providerCode: string | null): string {
  if (providerCode === "voice_not_found") {
    return "The approved ELEVAY voice is not available to the current ElevenLabs workspace. An administrator must reconnect an API key from the workspace that owns or is authorized for this voice.";
  }
  if (providerCode === "quota_exceeded") return "ElevenLabs rejected the request because its quota is exhausted. Voice generation is stopped; no replacement voice will be used.";
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

  let voiceId: typeof ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId;
  try { voiceId = requireElevayVoiceId(process.env.ELEVAY_VOICE_ID); }
  catch (error) {
    await notifyOwner({title:"ELEVAY voice configuration blocked",content:"ELEVAY_VOICE_ID is missing or differs from the approved voice. No speech was generated and no fallback was used."}).catch(()=>false);
    throw error;
  }
  const script = prepareElevayEgyptianSpeechScript(text);
  if (script.length > ELEVAY_ARABIC_VOICE_DEFAULTS.maxScriptCharacters) {
    const error = new Error("Keep each Egyptian Arabic speech request within 1,900 characters. Split longer narration into separate takes.");
    error.name = "ElevenLabsLanguagePolicyError";
    throw error;
  }
  const endpoint = `${ELEVENLABS_TTS_ENDPOINT}?output_format=${ELEVAY_ARABIC_VOICE_DEFAULTS.outputFormat}`;

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
        inputs: [{ text: script, voice_id: voiceId }],
        model_id: ELEVAY_ARABIC_VOICE_DEFAULTS.modelId,
        language_code: ELEVAY_ARABIC_VOICE_DEFAULTS.languageCode,
        settings: {
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
    await notifyOwner({title:"ELEVAY voice generation stopped",content:`ElevenLabs rejected the approved voice request (HTTP ${response.status}, ${providerCode || "provider_error"}). No alternate voice/model/language was used.`}).catch(()=>false);
    if (providerCode === "voice_not_found") {
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
    voiceId: ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId,
    languageCode: ELEVAY_ARABIC_VOICE_DEFAULTS.languageCode,
    dialect: ELEVAY_ARABIC_VOICE_DEFAULTS.dialect,
    requestId: response.headers.get("request-id") || response.headers.get("x-request-id") || null,
    outputFormat: ELEVAY_ARABIC_VOICE_DEFAULTS.outputFormat,
    bytes: audioBuffer.length,
    sha256,
  };
}

/** Video/reel-only entry point: prepare spoken Egyptian Arabic before TTS.
 * Never send unconverted MSA or Arabic spellings of country/company names. */
export async function generateElevayVideoVoiceOver(text: string) {
  return generateElevayArabicVoiceOver(text);
}

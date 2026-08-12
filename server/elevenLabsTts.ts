import { nanoid } from "nanoid";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";

const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";

export const ELEVAY_ARABIC_VOICE_DEFAULTS = {
  voiceId: "9JAj5x86tg9L2DFnuxOw",
  modelId: "eleven_v3",
  languageCode: "ar",
  outputFormat: "mp3_44100_128",
  stability: 0.5,
} as const;

export function prepareThoughtfulArabicScript(text: string): string {
  const normalized = text.trim();
  return /^\[thoughtful\]/i.test(normalized) ? normalized : `[thoughtful] ${normalized}`;
}

function getUserSafeErrorMessage(status: number): string {
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

  const script = prepareThoughtfulArabicScript(text);
  const endpoint = `${ELEVENLABS_TTS_ENDPOINT}/${ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId}?output_format=${ELEVAY_ARABIC_VOICE_DEFAULTS.outputFormat}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": ENV.elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: script,
        model_id: ELEVAY_ARABIC_VOICE_DEFAULTS.modelId,
        language_code: ELEVAY_ARABIC_VOICE_DEFAULTS.languageCode,
        voice_settings: {
          stability: ELEVAY_ARABIC_VOICE_DEFAULTS.stability,
        },
      }),
    });
  } catch (error) {
    console.error("[ElevenLabs] Network request failed", error);
    throw new Error("ELEVENLABS_UNAVAILABLE");
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("[ElevenLabs] Speech generation failed", { status: response.status, details });
    const error = new Error(getUserSafeErrorMessage(response.status));
    error.name = "ElevenLabsError";
    throw error;
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (audioBuffer.length === 0) {
    throw new Error("ELEVENLABS_EMPTY_AUDIO");
  }

  const fileName = `elevay-arabic-voiceover-${Date.now()}.mp3`;
  const fileKey = `marketing/voice-overs/${nanoid(12)}-${fileName}`;
  const { url } = await storagePut(fileKey, audioBuffer, "audio/mpeg");

  return {
    url,
    fileName,
    script,
    model: ELEVAY_ARABIC_VOICE_DEFAULTS.modelId,
    outputFormat: ELEVAY_ARABIC_VOICE_DEFAULTS.outputFormat,
  };
}

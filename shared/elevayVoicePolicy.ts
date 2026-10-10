/** Owner-governed identity: changes require an explicit owner code/config update. */
export const ELEVAY_LOCKED_VOICE_POLICY = Object.freeze({
  voiceId: 'nc8XQG8lRYRZDnjvKW0H',
  modelId: 'eleven_v4',
  languageCode: 'ar',
  dialect: 'Egyptian Arabic',
  outputFormat: 'mp3_44100_128',
  stability: 0.5,
  maxScriptCharacters: 1900,
} as const);

export function requireElevayVoiceId(configured: string | undefined) {
  if (configured !== ELEVAY_LOCKED_VOICE_POLICY.voiceId) {
    const error = new Error('ELEVAY_VOICE_ID is missing or differs from the owner-approved voice. Speech is stopped; no alternate voice will be used.');
    error.name = 'ElevenLabsVoiceConfigurationError';
    throw error;
  }
  return ELEVAY_LOCKED_VOICE_POLICY.voiceId;
}

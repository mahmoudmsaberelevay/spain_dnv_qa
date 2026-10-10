# ELEVAY locked voice policy

Owner-approved 10 October 2026:

- Server-side managed `ELEVAY_VOICE_ID` must equal `nc8XQG8lRYRZDnjvKW0H`. Missing/mismatched values stop speech. No other voice ID, model or language may be substituted by an agent, step or retry.
- `shared/elevayVoicePolicy.ts` is the immutable code policy used by the generator and UI.
- Model: `eleven_v4`, selected after checking official documentation and the connected workspace's live model list. Use the documented `POST /v1/text-to-dialogue` endpoint with one input/voice per request, `language_code: "ar"`, `settings.stability: 0.50`, output `mp3_44100_128`.
- Egyptian accent is driven by the approved cloned voice and a natural Egyptian Arabic script. No invented `dialect` API parameter is sent. Country and company names are written in English.
- Claude writes all spoken scene scripts in Egyptian Arabic, not Modern Standard Arabic. Instagram/Facebook `caption_ar` is Modern Standard Arabic, independently of speech. Four scenes produce four separate takes.
- Keep each speech request within 1,900 characters including tags; long tasks must be split. This respects the dialogue endpoint's recommended 2,000-character total limit.
- Existing verified takes are reused regardless of older approved model version; a model upgrade alone must not regenerate paid takes.
- Store voice ID, model, language, dialect, request ID and SHA-256 beside every take. Unknown or mismatched provenance blocks automatic composition, rather than assuming identity or regenerating blindly.
- Provider voice-not-found, quota and permission errors stop the step and notify the owner. Failed voice calls are not automatically switched or re-attempted.
- All web production rendering remains external-queue only; no local website FFmpeg fallback.

## Sources consulted

- https://elevenlabs.io/docs/overview/models — Eleven v4 is highest quality and supports Arabic.
- https://elevenlabs.io/docs/eleven-api/choosing-the-right-model — v4 recommended for professional video narration.
- https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert.md — language_code ISO 639-1, model_id, single-input voice_id, stability settings and request-size rules.
- https://elevenlabs.io/docs/api-reference/history/get-all — voice metadata and saved speech history.
- https://elevenlabs.io/docs/api-reference/history/get-audio — original audio for exact hash matching.

Live checks: approved voice GET returned 200; v4/ar listed in live models; a real v4/ar MP3 sample succeeded. Shared Manus project instructions still require owner-session update because collaboration configuration writes are blocked. That does not change the application code/managed ELEVAY_VOICE_ID policy.

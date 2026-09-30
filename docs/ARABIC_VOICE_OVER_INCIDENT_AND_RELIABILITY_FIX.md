# ELEVAY Arabic Voice-over — Incident Diagnosis and Reliability Fix

**Date:** 30 September 2026  
**Status:** Resolved with an owner-approved replacement voice; application safeguards remain active.

## Executive finding

The incident is **not a video-export or audio-sync failure**. The current ELEVAY voice-over request fails before any MP3 is created:

1. The configured ElevenLabs key reaches the ElevenLabs text-to-speech service.
2. ElevenLabs rejects the configured ELEVAY voice ID with `404 voice_not_found`.
3. Therefore, no audio file exists for the video process to use or synchronize.

The configured key also lacks the optional `voices_read` permission, so the application cannot list the workspace’s available voices for diagnosis. This does not expose a credential and does not by itself cause the 404; the central issue is that the approved voice is not available to the ElevenLabs workspace associated with the configured key.

## Why the screen showed `Unexpected token '<'`

That message is a browser JSON-parsing symptom, not a speech-quality result. It happens when a client request receives HTML instead of the expected tRPC JSON envelope—commonly after an expired/stale session or an outdated page state.

The deployed API route itself was checked without a session and correctly returned JSON `401` rather than HTML. The repair now converts an HTML/JSON mismatch into an actionable instruction to refresh the page and, if necessary, sign out and sign in again.

## What was repaired

The server-side voice path now:

- retains the required ELEVAY defaults: voice ID `9JAj5x86tg9L2DFnuxOw`, Eleven v3, Arabic override, `0.50` stability, `[thoughtful]` delivery, and `mp3_44100_128`;
- applies a 60-second provider timeout so a stalled vendor call cannot hang indefinitely;
- identifies ElevenLabs `voice_not_found` explicitly and returns a protected **precondition** error instead of a generic generation failure;
- never silently substitutes another voice, preserving ELEVAY brand consistency;
- requires an audio content type and validates MP3 file headers before saving anything to storage;
- presents detailed, safe generation and playback errors in the Voice-over screen; and
- includes regression coverage for inaccessible-voice handling, MP3 validation, timeout protection, client HTML-response handling, and playback diagnostics.

## Verification completed

| Check | Result |
|---|---|
| Direct safe TTS smoke test | Reproduced `404 voice_not_found`; no invalid audio was stored |
| ElevenLabs voice-list diagnostic | Key is authenticated but lacks `voices_read` permission |
| Focused voice, language, provider, and UI tests | **14 / 14 passed** |
| CRM production build | **Passed** |
| TypeScript check | **0 diagnostics** |
| Diff hygiene | **Passed** |

## Resolution applied on 30 September 2026

The owner supplied replacement voice ID `nc8XQG8lRYRZDnjvKW0H` and upgraded the ElevenLabs workspace. A live Arabic Eleven v3 request with the secured key returned HTTP 200, an `audio/*` response, a valid MP3 header, and 48,527 bytes. This voice is now ELEVAY’s configured default.

The former voice ID `9JAj5x86tg9L2DFnuxOw` remains documented here only as the historical failing configuration; it is no longer the default.

## Recovery procedure if generation fails again

In the **ElevenLabs workspace that owns or has been granted access to the approved ELEVAY voice**:

1. Open **ElevenLabs → Developers → API Keys**.
2. Create a replacement server-side key with **Text to Speech** access. Add **Voices Read** so the health check can identify accessible voices in the future.
3. Confirm that the configured ELEVAY voice appears in that workspace. If it is a Professional Voice Clone or shared voice, use the workspace that owns it or explicitly add/share the voice to the workspace first.
4. Provide the replacement key only through the CRM’s secure secret-entry prompt—never in chat, a CRM record, source code, or a document.
5. Run one short Arabic test in **Marketing → Arabic Voice-over**. The system will then save and play only a verified MP3.

## Video synchronization boundary

The current CRM media workflow prepares visual keyframes/video prompts and Arabic narration scripts, but it does **not** yet have a final video compositor that accepts an MP3 and muxes it into a rendered reel. Therefore no system can truthfully claim automatic voice/video synchronization yet.

After the voice access correction, the next video-production release should add a bounded final-render step that:

1. accepts an approved source video plus its verified ELEVAY MP3;
2. reads the actual audio duration and video duration;
3. adjusts/extends the approved timeline or rejects a mismatch for review—never clips speech silently;
4. mixes narration with background music using safe loudness headroom;
5. exports a verified 9:16 MP4 with the narration audio stream present; and
6. presents the final render for the existing visual, language, wardrobe, and audio QA before approval.

No replacement voice, video rendering, publication, campaign change, Meta action, or spend was triggered by this repair.

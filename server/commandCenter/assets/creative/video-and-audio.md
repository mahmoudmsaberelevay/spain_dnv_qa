> Earlier Design Instructions: retain complementary guidance. Where it conflicts with the master Brand Identity, apply the precedence and reconciliation rules in ../SKILL.md.

## 4. Video Outro Instructions

The ELEVAY outro must be clean, minimal, exact, and consistent across reels and branded videos.

### Standard outro

1. Use a **pure white background `#FFFFFF`**.
2. Place the **exact official ELEVAY logo centered horizontally and vertically**.
3. Keep the logo completely static for **3 seconds**.
4. Do not add animation, particles, lens flare, glow, camera movement, or sound effects that compete with the logo.
5. If the video is a 25-second reel with a 5-second outro, use:
   - `0:00–0:03`: logo static on white
   - `0:03–0:05`: smooth fade from white/logo to black
6. Preserve the bird, wordmark, proportions, colors, and `EXPANDING YOUR FREEDOM` tagline.
7. Do not generate the logo with an AI model; composite the approved official source asset.
8. Keep the logo sharp, centered, and comfortably separated from all edges.
9. Music should resolve gently and fade with the outro. Narration should finish before the outro whenever possible.

### Narrative video rules

- Standard reel format: **vertical 9:16**.
- Standard export: **1080×1920**, high-quality MP4, normally 30fps.
- Narrative scenes should contain no on-screen text unless explicitly requested.
- Use the official outro as the clear brand signature instead of adding logos throughout every shot.
- Cross-dissolves and transitions must feel smooth, restrained, and cinematic.
- No flashy transitions, bounce effects, parallax effects, or cheap template animations.

---

## 5. Voice-Over Text and Audio Instructions

### Default voice-over language

The default ELEVAY voice-over is **Egyptian Arabic** when Arabic narration is requested. English voice-over may be used when Mahmoud explicitly requests English narration for that video.

Captions and on-design text follow a separate rule:

- Arabic captions: **Modern Standard Arabic** unless a campaign specifically requires another Arabic register.
- Voice-over: **Egyptian Arabic** by default.
- English captions: professional international English when requested.

### Default Arabic speech-generation settings

When generating Arabic speech with the default workflow, use:

| Setting | Default |
|---|---|
| Voice ID | `9JAj5x86tg9L2DFnuxOw` |
| Model | `eleven_v3` |
| Language override | `ar` |
| Stability | `0.50` |
| Delivery | Thoughtful, warm, premium, reassuring |
| Default tag | `[thoughtful]` when appropriate |
| Output | MP3 |
| Sample rate | 44.1 kHz |
| Bitrate | 128 kbps |
| Output profile | `mp3_44100_128` |

Do not expose or store API credentials in creative files, prompts, handoffs, or project documents.

### Voice-over tone

The voice should sound:

- Warm and composed
- Professional and knowledgeable
- Reassuring but not exaggerated
- Human and conversational
- Premium and confident
- Ethical, transparent, and advisory
- Calm enough for the viewer to understand every word

Avoid:

- Aggressive sales delivery
- Shouting or urgency
- Radio-commercial overacting
- False certainty
- Guaranteed outcomes
- Legal or financial claims presented as promises
- Excessive dramatic pauses
- Overly casual slang that weakens the premium tone

### Voice-over text structure

Use short, scene-based narration. Each scene should communicate one clear idea.

Recommended structure for a 20–25 second reel:

| Scene | Function | Guidance |
|---|---|---|
| Scene 1 | Hook or opening idea | Establish the viewer’s need or aspiration. |
| Scene 2 | Explanation | Clarify the relevant benefit or advisory step. |
| Scene 3 | Trust/proof | Emphasize expertise, transparency, planning, or family value. |
| Scene 4 | Outcome | Present a realistic lifestyle or planning result without guaranteeing it. |
| Outro | Brand close | No narration over the logo whenever possible. |

### Length and timing

- Write narration in scene-sized spans, not one oversized paragraph.
- Keep each scene’s script short enough to leave breathing room.
- For a 5-second scene, use approximately **8–13 Arabic words** at a natural pace, adjusting for pronunciation and pauses.
- For a 20-second total narration, prioritize clarity over information density.
- Do not force the narrator to speak too quickly to fit extra claims.
- Add a short natural pause between ideas when the edit allows it.

### Egyptian Arabic writing style

Use natural Egyptian phrasing while remaining professional. Prefer direct, understandable language such as:

- `كل خطوة بتبدأ بفهم واضح لاحتياجاتك.`
- `بنشرحلك الخيارات بمنتهى الوضوح.`
- `وبنراجع التفاصيل بعناية قبل ما تاخد قرارك.`
- `مع ELEVAY، بتخطط لمستقبلك بثقة ووعي.`

Avoid:

- Literal machine translation
- Dense legal terminology
- Unsupported promises such as “مضمون 100%” or “قبول أكيد”
- Claims that imply guaranteed approval, guaranteed visa issuance, or guaranteed investment returns
- Long lists of programs in one sentence

### TTS prompt format

Separate delivery instructions from the spoken script with a colon.

**Correct structure:**

`Speak in Egyptian Arabic with a warm, thoughtful, premium advisory tone at a natural, calm pace: [thoughtful] كل خطوة بتبدأ بفهم واضح لاحتياجاتك.`

The text before the colon is the director instruction and is not spoken. The text after the colon is the spoken content.

- Write style instructions in English for reliable model control.
- Write spoken content in the exact language to be delivered.
- Use punctuation to create natural breathing points.
- Use local tags only when needed, such as `[short pause]` or `[medium pause]`.
- Do not place emotional adjectives such as `[excited]`, `[curious]`, or `[confident]` inside the spoken text; describe the emotion before the colon instead.

### Music and narration mix

- Narration must remain clearly audible over the music.
- Reduce background music under narration by approximately **25–30%** when needed.
- Keep narration volume consistent from scene to scene.
- Preserve relevant natural ambience when it improves realism, but never let it compete with the voice.
- Fade music gently under the logo outro.

---

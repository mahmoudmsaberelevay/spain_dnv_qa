# ELEVAY Marketing Guidelines — Full Extracted Notes
Source: `/home/ubuntu/upload/ELEVAY_Marketing_Guidelines.pdf` (10 pages)

## Brand Identity
- Company: ELEVAY — Citizenship & Residency by Investment
- Tagline: **Expanding Your Freedom**
- Established: 1998

## Color System
### Primary Palette (90% of design)
- Baby Blue Light `#B3CFD4`, Soft Sage `#CCDBD5`, Off White Cream `#E5E8D6`
- Medium Sky Blue `#A0C3CA`, Muted Sage `#BFD2CA`, Warm Linen `#DEE2CB`
- Deep Teal Blue `#809CA1`, Olive Sage `#A6B5A3`, Warm Khaki `#CCCFA5`

### Secondary Palette (7% max)
- Cool Slate `#707A83`, Muted Steel `#7C939F`, Soft Dusty Blue `#88AEBC`
- Deep Slate `#4D5964`, Dark Steel Blue `#566B7B`, Deep Teal `#5E7E93`
- Dark Charcoal `#3D4750`, Navy Slate `#445563`, Ocean Dark `#4B6475`

### Accent Palette (3% max — warm corals and roses ONLY)
- Muted Coral `#C77171`, Soft Blush `#CC8689`, Light Petal `#D19CA3`
- Bold Terracotta `#BB4F4E`, Warm Coral `#BF5D5F`, Muted Rose `#C46A6F`
- Dark Terracotta `#963F3E`, Deep Crimson `#9D4A4C`, Deep Rose `#A45659`

### FORBIDDEN Colors — NEVER USE
- ALL gold tones: `#C9A84C`, `#E7D186`, `#EBDA9D`, `#B8A76B`, `#EACA75`, `#EDC164`, `#EED38E`, `#EFCD7F`
- Burnt gold / orange: `#C4985D`, `#CF8A4F`
- Dark navy: `#1A3A5C` — STRICTLY FORBIDDEN
- Any color not in the approved palettes above

## Typography
- Apex Sans Book ST — body copy, subtitles, captions
- Apex Sans Medium Italic ST — taglines, pull quotes, emphasis
- Apex Sans Medium ST — sub-headings
- Apex Sans Medium C — main headlines, large display text

## Text Color Rules
- `#3A4E58` (ELEVAY Brand Dark) — all text on light backgrounds
- `#FFFFFF` (White) — text on dark backgrounds only
- NO other text colors allowed

## Language Rules
- ALL text inside any design, reel, or static post: **English only**
- Arabic text inside visuals: STRICTLY FORBIDDEN
- Arabic is ONLY allowed in captions and descriptions outside the visual content

## Logo Rules
- Use only the official ELEVAY origami bird logo (transparent PNG)
- Placement: bottom-right corner of all designs
- Size: ~11% of design width
- NEVER generate, draw, or imitate any bird, origami bird, dove, or flying shape inside any design
- Do not alter logo colors, proportions, or style
- In reels: logo appears ONLY in the ELEVAYEXTRO.mov outro — no separate logo overlay mid-reel

## Layout Rules
### FORBIDDEN Layouts
- Traditional rectangular banners
- Plain bottom bars with brand name text
- Separate text boxes with solid background fills that look like labels

### APPROVED Creative Layouts
- Diagonal cuts and slash compositions
- Organic S-curve or wave dividers
- Floating frosted-glass circles
- Full-bleed photography with text floating over it
- Asymmetric editorial compositions
- Overlapping layered elements
- Geometric cutouts
- Magazine-style open white-space layouts
- Text must feel **integrated** into the design, not placed in a separate box or banner

## Photography Style
- Ultra-realistic, cinematic quality
- Warm soft natural lighting
- Lifestyle-driven: balconies, architecture, landscapes, people in natural settings
- Subtle brand color grade overlay at 10–20% opacity

## Illustration Style
- Minimal, flat, geometric silhouettes for landmarks and icons
- Silhouettes in Olive Sage `#A6B5A3` or Soft Sage `#CCDBD5`
- NO photorealistic illustrations — keep them abstract and elegant

## Video / Reel Style
- Cinematic 9:16 vertical for Instagram Reels and Stories
- 16:9 horizontal for YouTube and Facebook
- Smooth, premium motion — no fast cuts or flashy transitions
- Orchestral or cinematic instrumental music only
- Voice-over: deep, calm, cinematic English narration

## Reel & Video Guidelines
- Maximum 5–6 clips per reel, each 5–8 seconds
- Always end with ELEVAYEXTRO.mov outro
- Text overlays in reels: English only, `#3A4E58` or white `#FFFFFF` only
- No Arabic text overlays, no gold text or accents
- Logo appears only in ELEVAYEXTRO.mov outro

## Static Post Dimensions
- Square Post: 1080 × 1080 px (Instagram Feed)
- Portrait Post: 1080 × 1350 px 4:5 (Instagram Feed)
- Story / Reel Cover: 1080 × 1920 px 9:16 (Instagram Stories & Reels)

## Content Hierarchy (Static Posts)
1. Hero visual (photo or illustration) — dominant
2. Program label — small all-caps, wide tracking
3. Main headline — large, bold, punchy
4. Supporting subtitle — smaller, lighter weight
5. Logo — bottom right, subtle

## Caption & Copy Guidelines
- Captions may be Arabic, English, or bilingual
- Inside the visual: English only
- Caption tone: professional, aspirational, luxury — never salesy or pushy
- Caption structure: Hook → Body (2–3 short paragraphs) → CTA → 10–15 hashtags (English + Arabic)
- Tone of voice: premium/aspirational, confident but not arrogant, educational, global/cosmopolitan
- NEVER use urgency tactics or pressure language

## Brand Summary Card (from PDF page 10)
| Element | Specification |
|---|---|
| Company | ELEVAY — Citizenship & Residency by Investment |
| Tagline | Expanding Your Freedom |
| Est. | 1998 |
| Primary palette | Baby blues, sages, creams, warm linens |
| Secondary palette | Dark slates, steel blues, charcoals |
| Accent palette | Muted corals and roses (3% max) |
| Forbidden | All gold, dark navy #1A3A5C, Arabic in visuals |
| Text colors | #3A4E58 (dark) or #FFFFFF (white) only |
| Fonts | Apex Sans family only |
| Logo | Origami bird — bottom right — transparent PNG |
| Language in visuals | English only |
| Layout style | Creative, editorial, no rectangular banners |
| Video format | 9:16 for Reels, 16:9 for YouTube/Facebook |
| Music style | Cinematic orchestral instrumental |

## What Needs to Change in the Code
### In marketingTemplates.ts — all staticImagePrompt strings:
OLD (forbidden): navy blue (#1A3A5C), gold, #5BA3B8, #A1C6CF, Arabic text overlay
NEW (required): baby blue (#B3CFD4), sage (#CCDBD5), cream (#E5E8D6), deep teal (#809CA1), text color #3A4E58 or white, English text only, no gold, no dark navy

### In marketingRouter.ts line 458 (staticPrompt):
OLD: "navy blue (#1A3A5C) and baby blue (#5BA3B8) color scheme"
NEW: "baby blue (#B3CFD4) and sage (#CCDBD5) color scheme, text color #3A4E58 or white only, no gold, no dark navy"

### In marketingRouter.ts lines 705-709 (LLM strategy plan prompt):
OLD: "Arabic text overlay", "navy background #1A3A5C", "gold accent #C9A84C", "#A1C6CF (PANTONE 551 U)"
NEW: "English text only inside visuals", "baby blue (#B3CFD4) and sage (#CCDBD5) background", "no gold", "no dark navy", "text color #3A4E58 or white only"

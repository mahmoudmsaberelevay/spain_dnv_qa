/**
 * ELEVAY Marketing Content Templates (v2 — Editorial Luxury)
 * Rule-based engine — zero LLM calls required.
 * Each program has detailed 400+ word prompts following the 7-section structure.
 * Concept bank rotates weekly. Per-program materials and atmospheres are enforced.
 */

export interface PostTemplate {
  topic: string;
  caption: string; // Arabic
  hashtags: string[];
  staticImagePrompt: string; // 4:5 (1080×1350) — detailed editorial luxury prompt
  reelScenes: Array<{ keyframePrompt: string; videoPrompt: string }>; // exactly 4 scenes
  voiceOverScript: string; // Arabic
  backgroundMusicSuggestion: string;
}

export interface ProgramTemplates {
  programName: string;
  country: string;
  posts: PostTemplate[];
}

// ─── SHARED PROMPT BLOCKS ─────────────────────────────────────────────────────

const ANTI_PATTERNS = `ABSOLUTELY AVOID:
- Instagram template look — no preset layouts or cookie-cutter designs
- Canva style — no drag-and-drop aesthetic or clip-art elements
- Split screens or photo collage — scenes must be integrated, not tiled
- Grid layout — no boxes, cards, or compartmentalized sections
- Infographic style — no charts, diagrams, numbered lists with icons
- Floating icons or clipart — no generic vector icons floating in space
- Passports, flags, airplanes, or maps — permanently banned
- People, faces, or human figures — brand rule
- Corporate stock photography — no handshakes, skylines, or generic business imagery
- Heavy gradients — no dramatic color transitions or aurora effects
- Glossy 3D effects — no chrome, glass reflections, or CGI-rendered objects
- Busy layouts — no more than 3 visual focal points
- Overdesigned typography — no decorative fonts, outlines, shadows, or text effects
- Dark navy backgrounds — retired from brand identity
- Gold border frames — retired from brand identity
- Neon glows or light streaks — no sci-fi or tech aesthetics
- Real estate listing style — no property photos with price tags
- Travel brochure imagery — no "wish you were here" postcard compositions`;

const BRANDING_BLOCK = `BRANDING:
Place only the official ELEVAY origami bird logo in the bottom-right corner.
Size: Small — approximately 5% of canvas width. Minimal. Elegant.
Color: Deep Teal (#809CA1) or Charcoal (#2C2C2C) — whichever provides subtle contrast.
Below the bird: "ELEVAY" wordmark in refined sans-serif, same color as bird.
Below wordmark: "EXPANDING YOUR FREEDOM" tagline in Baby Blue (#B3CFD4), very small, letter-spaced.
No oversized branding. No glowing effects. No halos around the logo.`;

const STYLE_REFERENCES = `STYLE REFERENCES:
Apple advertising campaigns (product-as-hero, minimal text, premium materials)
COS fashion campaigns (architectural, minimal, textural)
Aman Resorts brand imagery (quiet luxury, natural materials, contemplative)
Bentley Motors advertising (precision, materials, craftsmanship)
Monocle Magazine editorial layouts (typography, white space, editorial confidence)
Architectural Digest photography (interiors, materials, lighting)
Foster + Partners architectural presentations (clean, precise, aspirational)
Dezeen editorial photography (architectural, well-lit, gallery-quality)
Kinfolk Magazine aesthetic (warm, natural, unhurried)`;

function buildPrompt(concept: string, scenes: string, materials: string, typography: string, palette: string): string {
  return `PROJECT:
Create a premium luxury Instagram static post (1080×1350, 4:5 aspect ratio) for ELEVAY, a high-end Residency & Citizenship by Investment consultancy established in 1998 with 28 years of experience.

This should NOT look like a social media template, Canva design, travel brochure, infographic, collage, or real estate advertisement. The final result should resemble an award-winning luxury advertising campaign created by Pentagram, Landor, Apple Design, or Monocle Magazine.

CREATIVE CONCEPT:
${concept}

SCENE DESCRIPTIONS:
${scenes}

MATERIALS & ENVIRONMENT:
${materials}

TYPOGRAPHY & COMPOSITION:
${typography}

COLOR PALETTE:
${palette}

${BRANDING_BLOCK}

${STYLE_REFERENCES}

${ANTI_PATTERNS}

FINAL GOAL:
The image should make viewers stop scrolling because it feels like a piece of contemporary architectural art rather than an advertisement. Someone should think they are looking at a luxury editorial cover or an international design award-winning campaign before realizing it is promoting a residency or citizenship program through ELEVAY.`;
}

// ─── SPAIN DNV ────────────────────────────────────────────────────────────────

const SPAIN_DNV: ProgramTemplates = {
  programName: "Spain DNV",
  country: "Spain",
  posts: [
    {
      topic: "Spain DNV: بوابة أوروبا الرقمية",
      caption: "🇪🇸 إسبانيا تفتح أبوابها للعمل الحر والرقمي!\n\nتخيّل صباحك في برشلونة — شمس البحر الأبيض المتوسط تدفئ شرفة شقتك بينما تعمل لأي شركة في العالم.\n\n✅ إقامة قانونية في إسبانيا\n✅ الوصول إلى 26 دولة شنغن\n✅ مناخ معتدل 300 يوم مشمس\n✅ جنسية أوروبية بعد 10 سنوات\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية الآن من الرابط في البايو 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #إقامة_إسبانيا #الرحّال_الرقمي",
      hashtags: ["#SpainDNV", "#إسبانيا", "#الرحّال_الرقمي", "#إقامة_أوروبا", "#ELEVAY", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `The artwork should feel like a museum-quality architectural installation rather than a marketing graphic. Design a sculptural architectural object carved from warm Spanish terracotta clay and whitewashed plaster. Instead of using photo frames, create one continuous architectural sculpture that naturally contains four different scenes representing life in Spain through the Digital Nomad Visa. These scenes should blend seamlessly into the architecture — not appear as separate images. The composition should feel impossible yet believable.`,
        `The sculpture should reveal four different experiences through beautifully integrated openings:

1. Mediterranean Lifestyle: A sun-drenched Spanish courtyard with a central fountain, terracotta pots with olive trees, and Moorish geometric tile patterns on the floor. Warm afternoon light creates long shadows through arched doorways.

2. Digital Freedom: A modern co-working space with floor-to-ceiling windows overlooking Barcelona's skyline, with the Mediterranean Sea visible in the distance. Minimalist Scandinavian furniture meets traditional Spanish architectural shell — exposed stone walls, wooden beams.

3. Cultural Heritage: The interior of a grand Spanish cathedral or palace with Moorish arches, intricate geometric patterns carved in stone, and golden afternoon light streaming through high windows. Represents 2000 years of civilization.

4. Coastal Living: Crystal-clear Mediterranean turquoise water meeting golden limestone cliffs, with a luxury terrace visible above — representing the quality of life and natural beauty of coastal Spain.

These scenes should blend seamlessly into the terracotta architecture — not appear as separate images or a collage. The composition should feel impossible yet believable.`,
        `Primary material: Warm Spanish terracotta clay with visible hand-crafted texture, combined with whitewashed plaster walls showing subtle imperfections. Hand-forged iron details at the edges. Reclaimed olive wood accents.
Surface qualities: Organic curves. Soft geometry. Architectural niches. Minimal detailing. Luxury materiality. The openings should flow naturally into each other. Nothing should feel boxed or grid-like. Include subtle olive branches emerging naturally from the architecture and one elegant floating staircase integrated into the form.

Background: Minimal textured plaster wall in warm white (#F8F5F0). Clean. Uncluttered. Gallery-like.
Lighting: Soft Mediterranean late-afternoon light entering from the upper left at approximately 30 degrees. The light should create beautiful architectural shadows that add depth and dimension. Warm golden color temperature (3200K). Subtle ambient fill from the right to prevent harsh darkness.
Atmosphere: Museum-gallery environment. Calm. Quiet. Sophisticated. The air feels warm and dry — jasmine and orange blossom suggested through botanical elements.`,
        `Leave generous negative space on the left side — approximately 30% of the canvas should be clean breathing room. All text positioned on the left side, vertically centered within the negative space.

Headline: "Spain Digital Nomad Visa"
Set in a large luxury serif typeface (similar to Didot or Playfair Display). Weight: Bold. Size: Dominant — this is the largest text element. Color: Charcoal (#2C2C2C).

Subtitle: "Your Gateway to Europe"
Set in a refined sans-serif (similar to Helvetica Neue Light). Size: Medium. Color: Deep Teal (#809CA1). Letter-spacing: Wide (+2%).

Body copy:
"26 Schengen countries access"
"Work remotely for any company worldwide"
"European citizenship pathway in 10 years"
Set in elegant light-weight sans-serif. Size: Small. Color: Warm grey (#5A5A5A). Line-height: Generous (1.6x).

Typography style: Resembles Monocle Magazine or Architectural Digest. Large luxury serif headlines. Elegant spacing. Minimal. Premium editorial feel.`,
        `Background: Warm white (#F8F5F0) — soft cream undertone
Architecture: Warm terracotta (#C4775B) combined with whitewashed plaster
Accent colors: Baby Blue (#B3CFD4), Sage (#CCDBD5), Deep Teal (#809CA1)
Scene colors: Natural Mediterranean palette — desaturated, film-grade color grading (Kodak Portra 400 feel)
Overall tone: Warm, muted, sophisticated. Analog film photography color science.`
      ),
      reelScenes: [
        { keyframePrompt: "Sweeping aerial drone shot of Barcelona coastline at golden hour, Mediterranean Sea sparkling with warm light, Sagrada Familia visible in the distance, atmospheric haze creating depth layers, cinematic 9:16 vertical, Kodak Portra 400 color science, no text, no people", videoPrompt: "Slow aerial pan over Barcelona coastline at sunrise, Mediterranean blue sea, golden hour light, cinematic film quality" },
        { keyframePrompt: "Extreme close-up of traditional Spanish ceramic azulejo tile being touched by warm afternoon sunlight, shallow depth of field, visible texture and hand-painted imperfections, warm terracotta wall in soft background bokeh, 9:16 vertical, tactile and sensory", videoPrompt: "Macro detail of Spanish ceramic tile with warm afternoon light slowly moving across the surface, revealing texture" },
        { keyframePrompt: "Medium shot of a sun-drenched Spanish courtyard with central stone fountain, olive trees in terracotta pots, Moorish arches creating geometric shadows on the floor, golden afternoon light, no people, 9:16 vertical, contemplative atmosphere", videoPrompt: "Gentle push-in through a Spanish courtyard with fountain, afternoon shadows moving slowly across Moorish tiles" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from soft warm light particles against a cream white background (#F8F5F0), minimal, elegant, the bird rendered in Deep Teal (#809CA1), soft golden light from upper left, museum-gallery atmosphere, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird materializing from warm light particles, minimal cream background, elegant and contemplative" },
      ],
      voiceOverScript: "إسبانيا... حيث يلتقي الجمال بالفرصة. إقامة الرحّال الرقمي تمنحك حق الإقامة في قلب أوروبا مع حرية العمل لأي شركة حول العالم. ELEVAY يرافقك في كل خطوة.",
      backgroundMusicSuggestion: "Cinematic Spanish acoustic guitar, warm and contemplative, Ennio Morricone meets modern ambient",
    },
    {
      topic: "Spain DNV: الحياة في إسبانيا",
      caption: "☀️ تخيّل صباحك في برشلونة أو مدريد...\n\nإسبانيا تحتل المرتبة الأولى عالمياً في جودة الحياة للمغتربين.\n\n🏖️ 300 يوم مشمس في السنة\n🍷 مطبخ عالمي وثقافة غنية\n🏥 رعاية صحية متقدمة\n🎓 تعليم دولي للأبناء\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية الآن 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #إسبانيا_للعيش #جودة_الحياة",
      hashtags: ["#SpainLife", "#إسبانيا_للعيش", "#جودة_الحياة", "#ELEVAY", "#الإقامة_الأوروبية", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `Design a monumental architectural portal carved from warm Spanish limestone. Through the portal opening, a breathtaking Spanish Mediterranean landscape is visible in photorealistic detail with atmospheric depth — golden hills, olive groves, and distant blue sea. The portal frame contains subtle carved Moorish geometric patterns referencing Spain's cultural heritage. The composition creates a sense of invitation — stepping through into a new life of Mediterranean sunshine and European quality.`,
        `Through the portal opening, the viewer sees a layered Spanish landscape:

1. Foreground: A luxury terrace with hand-forged iron railing, terracotta floor tiles, and a single olive tree in a ceramic pot — representing the immediate lifestyle quality.

2. Middle ground: A picturesque Spanish village with whitewashed buildings, terracotta rooftops, and a church bell tower — representing community and culture.

3. Background: Rolling golden hills with olive groves stretching to a distant blue Mediterranean coastline — representing the vast beauty and freedom of Spain.

The landscape should feel like a window into paradise — atmospheric, warm, and deeply inviting.`,
        `Primary material: Warm Spanish limestone with visible fossil patterns and natural veining. The portal has clean architectural lines with subtle Moorish arch geometry at the top. Edges are slightly weathered — suggesting centuries of history.
Surface qualities: Smooth hand-cut stone with occasional chisel marks. Warm to the touch. The stone glows golden in the light.

Background: Minimal textured plaster wall in warm white (#F8F5F0) surrounding the portal.
Lighting: Late afternoon golden hour light (3000K) entering from the upper left. The portal casts a beautiful shadow on the background wall. The landscape through the portal is bathed in warm Mediterranean light.
Atmosphere: Calm. Warm. Inviting. The viewer should feel the warmth of the Spanish sun on their skin.`,
        `Leave generous negative space on the right side — approximately 30% of the canvas.

Headline: "Life in Spain"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "Quality Beyond Compare"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"300 days of sunshine annually"
"World-class healthcare & education"
"Rich culture meets modern comfort"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Architecture: Spanish limestone golden (#D4B896)
Accent: Baby Blue (#B3CFD4), Sage (#CCDBD5), Deep Teal (#809CA1)
Landscape: Natural warm Mediterranean tones — golden, olive green, azure blue`
      ),
      reelScenes: [
        { keyframePrompt: "Aerial drone shot of a sunny Spanish plaza with orange trees, cafe terraces with white umbrellas, Mediterranean architecture, warm midday light, no people, 9:16 vertical, cinematic film quality, Kodak Portra color", videoPrompt: "Peaceful Spanish plaza at midday, orange trees casting dappled shadows, warm Mediterranean light" },
        { keyframePrompt: "Close-up of fresh Spanish produce at a market — colorful tomatoes, olives, citrus fruits — on a rustic wooden surface, warm natural light from the side, shallow depth of field, 9:16 vertical, tactile food photography", videoPrompt: "Vibrant Spanish market with colorful fresh produce, warm morning light revealing textures" },
        { keyframePrompt: "Modern luxury apartment interior with floor-to-ceiling windows showing Mediterranean sea view, minimalist furniture, warm natural light flooding in, white walls with subtle texture, 9:16 vertical, architectural photography", videoPrompt: "Luxury apartment interior with panoramic Mediterranean sea view from balcony, warm light" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from soft warm light particles against cream background (#F8F5F0), Deep Teal (#809CA1) bird, minimal elegant, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird from warm light, minimal cream background" },
      ],
      voiceOverScript: "الحياة في إسبانيا ليست مجرد إقامة... إنها تجربة لا تُنسى. من شواطئ البحر الأبيض المتوسط إلى المدن العريقة. ELEVAY يجعل حلمك حقيقة.",
      backgroundMusicSuggestion: "Warm Mediterranean acoustic, lifestyle vibe, gentle guitar",
    },
  ],
};

// ─── GREECE GOLDEN VISA ───────────────────────────────────────────────────────

const GREECE_GOLDEN_VISA: ProgramTemplates = {
  programName: "Greece Golden Visa",
  country: "Greece",
  posts: [
    {
      topic: "Greece Golden Visa: الذهب الأوروبي",
      caption: "🏛️ اليونان تمنحك الإقامة الذهبية الأوروبية!\n\n💰 استثمار يبدأ من 250,000 يورو\n🌍 إقامة لك ولعائلتك بالكامل\n✈️ حرية التنقل في 26 دولة شنغن\n🏠 ملكية عقارية حقيقية\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية الآن 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #اليونان #التأشيرة_الذهبية",
      hashtags: ["#GreeceGoldenVisa", "#اليونان", "#التأشيرة_الذهبية", "#ELEVAY", "#إقامة_أوروبا", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `The artwork should feel like a museum-quality architectural installation. Design a sculptural architectural object carved from pure white Pentelic marble (the marble of the Parthenon). Instead of using photo frames, create one continuous architectural sculpture that naturally contains four different scenes representing life in Greece through the Golden Visa program. These scenes should blend seamlessly into the white marble architecture — not appear as separate images. The sculpture evokes Cycladic minimalism — pure white forms against deep blue.`,
        `The marble sculpture should reveal four different experiences through beautifully integrated openings:

1. Cycladic Architecture: Iconic white-washed buildings with blue domes of Santorini, narrow cobblestone paths, and bougainvillea cascading over white walls. Brilliant Aegean light creating sharp shadows.

2. Aegean Coastline: Crystal-clear turquoise water in a limestone cove, white cliffs, a small wooden fishing boat in traditional blue. The water is so clear you can see the sandy bottom.

3. Ancient Heritage: A single ancient marble column in golden afternoon light, with the Aegean Sea visible behind it — representing 3000 years of civilization and the foundation of European culture.

4. Modern Investment: A contemporary luxury villa with an infinity pool that visually merges with the Aegean Sea horizon — representing the tangible real estate investment.`,
        `Primary material: Pure white Pentelic marble with subtle grey veining — the same marble used to build the Parthenon. Smooth, cool, luminous.
Surface qualities: Smooth polished surfaces transitioning to raw-cut edges. Cycladic minimalism — pure geometric forms. Clean lines. Nothing ornate. Include subtle carved olive leaf details at the base.

Background: Minimal textured plaster wall in warm white (#F8F5F0).
Lighting: Brilliant Aegean midday light — intense but not harsh. Entering from the upper left. Crystal-clear air with infinite visibility. The white marble glows luminously. Sharp, defined shadows.
Atmosphere: Bright. Pure. Timeless. The air feels crystal-clear and warm.`,
        `Leave generous negative space on the left side — approximately 30% of the canvas.

Headline: "Greece Golden Visa"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "Your €250,000 Gateway to Europe"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"26 Schengen countries access"
"Full family inclusion"
"Real property ownership"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Architecture: Pure white Pentelic marble with grey veining
Accent colors: Baby Blue (#B3CFD4), Sage (#CCDBD5), Deep Teal (#809CA1)
Scene colors: Aegean blue, Cycladic white, olive green, golden limestone
Overall tone: Bright, pure, Mediterranean. Kodak Portra color science.`
      ),
      reelScenes: [
        { keyframePrompt: "Aerial drone shot of Santorini caldera at golden hour, white buildings cascading down volcanic cliffs, deep blue Aegean Sea, warm golden light, atmospheric depth, 9:16 vertical, cinematic, no people", videoPrompt: "Magical Santorini sunset with iconic blue domes and white architecture, golden hour" },
        { keyframePrompt: "Extreme close-up of ancient Greek marble column detail — fluting, patina of centuries, warm golden afternoon light raking across the surface, shallow DOF, 9:16 vertical, tactile", videoPrompt: "Macro detail of ancient marble column with golden afternoon light revealing centuries of texture" },
        { keyframePrompt: "Crystal-clear turquoise water in a Greek limestone cove, white cliffs, small traditional blue boat, the water so clear the sandy bottom is visible, overhead angle, 9:16 vertical", videoPrompt: "Stunning Greek cove with crystal turquoise water, white limestone cliffs, aerial perspective" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from soft light particles against warm white background (#F8F5F0), bird in Deep Teal (#809CA1), minimal elegant museum atmosphere, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird from light particles, minimal white background" },
      ],
      voiceOverScript: "اليونان... أرض الحضارة والجمال. الإقامة الذهبية تمنحك إقامة أوروبية وملكية عقارية حقيقية باستثمار يبدأ من 250 ألف يورو. ELEVAY يفتح لك هذا الباب الذهبي.",
      backgroundMusicSuggestion: "Epic Mediterranean orchestral, majestic and timeless, strings-led",
    },
  ],
};

// ─── MALTA PR ─────────────────────────────────────────────────────────────────

const MALTA_PR: ProgramTemplates = {
  programName: "Malta PR",
  country: "Malta",
  posts: [
    {
      topic: "Malta PR: الإقامة الدائمة في قلب المتوسط",
      caption: "🇲🇹 مالطا — جوهرة البحر الأبيض المتوسط!\n\n🌍 إقامة دائمة في دولة أوروبية\n✈️ حرية التنقل في منطقة شنغن\n💼 بيئة أعمال متطورة\n🗣️ اللغة الإنجليزية لغة رسمية\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #مالطا #الإقامة_الدائمة",
      hashtags: ["#MaltaPR", "#مالطا", "#الإقامة_الدائمة", "#ELEVAY", "#أوروبا", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `The artwork should feel like a museum-quality architectural installation. Design a sculptural architectural object carved from elegant honey-colored Globigerina limestone — Malta's iconic building stone. Instead of using photo frames, create one continuous architectural sculpture that naturally contains four different scenes representing life in Malta. These scenes should blend seamlessly into the honey-colored architecture. Include traditional Maltese baroque carved details and one elegant gallarija (traditional Maltese wooden balcony) integrated into the sculpture.`,
        `The sculpture should reveal four different experiences through beautifully integrated openings:

1. Historic Valletta: Elegant honey-colored limestone streets with traditional Maltese balconies (gallariji) in green and red. Baroque church facades. Warm afternoon light filtering through narrow streets making the stone glow golden.

2. Mediterranean Market: A vibrant local market with fresh Mediterranean produce — colorful vegetables, fresh fish, flowers — under stone arches. Authentic local atmosphere with warm, inviting colors.

3. Coastal Paradise: Crystal-clear turquoise Mediterranean water meeting dramatic limestone cliffs. A natural swimming pool carved into the rock. Calm, inviting, luxurious relaxation.

4. Modern Business Hub: A sophisticated contemporary office with floor-to-ceiling glass overlooking the Maltese coastline and Grand Harbour. Represents Malta's thriving financial services sector.`,
        `Primary material: Premium honey-colored Globigerina limestone with visible natural texture and warm golden tone. Baroque carved details at edges — scrolls, shells, organic forms.
Surface qualities: Warm, textured, hand-cut stone. Include one traditional Maltese gallarija (enclosed wooden balcony) in deep green paint integrated into the sculpture. Brass door knockers as subtle details.

Background: Minimal textured plaster wall in warm white (#F8F5F0).
Lighting: Warm Valletta afternoon light entering from the upper left. The honey-colored stone glows golden (3000K color temperature). Beautiful architectural shadows.
Atmosphere: Warm. Intimate. Fortified. Compact. A sense of island security meeting cosmopolitan European life.`,
        `Leave generous negative space on the left side — approximately 30% of the canvas.

Headline: "Malta Permanent Residency"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "Your European Island Home"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"Permanent EU residency"
"English-speaking nation"
"Thriving business environment"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Architecture: Honey-colored Globigerina limestone (#D4A96A)
Accent colors: Baby Blue (#B3CFD4), Sage (#CCDBD5), Deep Teal (#809CA1)
Scene colors: Golden honey stone, Mediterranean turquoise, baroque green and red`
      ),
      reelScenes: [
        { keyframePrompt: "Aerial drone shot of Valletta Grand Harbour at golden hour, ancient fortifications glowing honey-gold, deep blue Mediterranean, historic ships, atmospheric depth, 9:16 vertical, cinematic, no people", videoPrompt: "Majestic Valletta Grand Harbour at sunrise, ancient fortifications, golden light on limestone" },
        { keyframePrompt: "Extreme close-up of traditional Maltese brass door knocker on honey-colored limestone door frame, warm afternoon light, shallow DOF, visible stone texture and patina, 9:16 vertical, tactile", videoPrompt: "Macro detail of Maltese brass door knocker with warm light revealing centuries of use" },
        { keyframePrompt: "Crystal-clear turquoise water in a Maltese limestone cove (Blue Lagoon style), dramatic cliff walls in honey-colored stone, calm water reflecting sky, overhead angle, 9:16 vertical", videoPrompt: "Stunning Malta Blue Lagoon, crystal turquoise water between honey limestone cliffs" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from soft warm golden light particles against cream background (#F8F5F0), bird in Deep Teal (#809CA1), minimal elegant, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird from warm golden light, minimal cream background" },
      ],
      voiceOverScript: "مالطا... جوهرة أوروبا الصغيرة. الإقامة الدائمة المالطية تمنحك حرية التنقل في أوروبا وحياة لا مثيل لها. ELEVAY يرافقك في هذه الرحلة.",
      backgroundMusicSuggestion: "Mediterranean cinematic, sophisticated and elegant, orchestral warmth",
    },
  ],
};

// ─── PORTUGAL D7 ──────────────────────────────────────────────────────────────

const PORTUGAL_D7: ProgramTemplates = {
  programName: "Portugal D7",
  country: "Portugal",
  posts: [
    {
      topic: "Portugal D7: الإقامة السلبية في البرتغال",
      caption: "🇵🇹 البرتغال تستقبلك بذراعين مفتوحتين!\n\n💰 دخل ثابت شهري = إقامة أوروبية\n🌍 أرخص دول أوروبا الغربية\n☀️ 300 يوم مشمس في السنة\n🏖️ شواطئ المحيط الأطلسي\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #البرتغال #إقامة_أوروبية",
      hashtags: ["#PortugalD7", "#البرتغال", "#الإقامة_السلبية", "#ELEVAY", "#أوروبا", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `Design a monumental architectural portal made from Portuguese limestone and traditional azulejo tiles used architecturally (not decoratively). Through the portal opening, the Lisbon landscape is visible — the seven hills, terracotta rooftops, and the Tagus River meeting the Atlantic. The portal frame incorporates azulejo tile patterns as structural elements — blue and white geometric patterns that are part of the architecture itself. The composition creates a sense of discovery.`,
        `Through the portal, a layered Portuguese landscape:

1. Foreground: A traditional Portuguese cobblestone (calçada) path leading through the portal — representing the journey to residency.

2. Middle: Lisbon's colorful hillside with pastel buildings, traditional tram tracks, and terracotta rooftops — representing the charming lifestyle.

3. Background: The wide Tagus River meeting the Atlantic Ocean, with soft morning mist — representing Portugal's position as Europe's Atlantic gateway.

4. Portal Frame Detail: Traditional blue and white azulejo tiles integrated into the limestone structure — not as decoration but as architectural material.`,
        `Primary material: Portuguese limestone from Sintra region — warm cream with subtle pink undertones. Combined with traditional azulejo tiles (blue and white) used as structural elements within the stone.
Surface qualities: Smooth limestone with occasional weathering. The azulejo tiles have a slight glaze catching the light. Cork oak bark texture at the base. Aged brass hardware details.

Background: Minimal textured plaster in warm white (#F8F5F0).
Lighting: Soft Atlantic morning light — slightly cooler than Mediterranean (4500K). Gentle, diffused, with slight mist creating atmospheric depth.
Atmosphere: Fresh. Gentle. Melancholic beauty. The air feels slightly salty from the Atlantic.`,
        `Leave generous negative space on the right side.

Headline: "Portugal D7 Residency"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "Europe's Atlantic Gateway"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"Passive income qualifies you"
"300 days of sunshine"
"Lowest cost in Western Europe"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Architecture: Portuguese limestone cream with azulejo blue (#2F6B8E)
Accent colors: Baby Blue (#B3CFD4), Sage (#CCDBD5), Deep Teal (#809CA1)
Scene colors: Pastel Lisbon tones, Atlantic blue-grey, terracotta`
      ),
      reelScenes: [
        { keyframePrompt: "Aerial drone shot of Lisbon's seven hills at golden hour, terracotta rooftops, the Tagus River in background, atmospheric morning mist, 9:16 vertical, cinematic, no people", videoPrompt: "Iconic Lisbon panorama at golden hour, terracotta rooftops cascading down hills to the Tagus" },
        { keyframePrompt: "Close-up of traditional Portuguese azulejo tile wall — blue and white geometric patterns, warm afternoon light creating shadows in the relief, shallow DOF, 9:16 vertical, tactile", videoPrompt: "Macro detail of Portuguese azulejo tiles with warm light revealing hand-painted patterns" },
        { keyframePrompt: "Dramatic Algarve coastline — golden limestone cliffs meeting turquoise Atlantic water, natural arch formation, warm afternoon light, 9:16 vertical, cinematic", videoPrompt: "Stunning Algarve coastline with dramatic golden cliffs and turquoise Atlantic sea" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from soft Atlantic morning light against cream background (#F8F5F0), bird in Deep Teal (#809CA1), minimal elegant, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird from soft Atlantic light, minimal cream background" },
      ],
      voiceOverScript: "البرتغال... حيث الجمال يلتقي بالفرصة. إقامة D7 تمنحك الإقامة الأوروبية بدخلك الثابت. ELEVAY يفتح لك هذا الباب.",
      backgroundMusicSuggestion: "Portuguese Fado-inspired cinematic, nostalgic and beautiful, acoustic guitar",
    },
  ],
};

// ─── DOMINICA ─────────────────────────────────────────────────────────────────

const DOMINICA: ProgramTemplates = {
  programName: "Dominica",
  country: "Dominica",
  posts: [
    {
      topic: "Dominica: جواز سفر عالمي بأقل تكلفة",
      caption: "🌴 دومينيكا — أذكى استثمار في جواز سفر ثانٍ!\n\n💰 استثمار يبدأ من 100,000 دولار فقط\n🌍 دخول بدون تأشيرة لأكثر من 140 دولة\n👨‍👩‍👧 يشمل العائلة بأكملها\n⚡ معالجة سريعة 3-6 أشهر\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #دومينيكا #جنسية_كاريبية",
      hashtags: ["#DominicaCitizenship", "#دومينيكا", "#جواز_سفر_ثاني", "#ELEVAY", "#الجنسية_الكاريبية", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `Design a sculptural object carved from natural coral stone and tropical hardwood (mahogany). The sculpture reveals Caribbean paradise through organic openings — turquoise water, lush rainforest, dramatic volcanic landscape. The form is organic and flowing — like a wave frozen in stone. Sea glass and polished coconut shell details are integrated naturally. The composition feels like a natural history museum exhibit of paradise.`,
        `The coral-stone sculpture reveals:

1. Caribbean Waters: Crystal-clear turquoise water with white sand visible beneath, gentle waves, tropical fish suggested through color.

2. Rainforest Canopy: Lush emerald green tropical rainforest with dramatic waterfall — representing Dominica's "Nature Isle" identity.

3. Volcanic Landscape: Dramatic volcanic peaks meeting Caribbean coastline — raw natural power and beauty.

4. Freedom Horizon: Open ocean stretching to infinity — representing 140+ visa-free countries and unlimited freedom.`,
        `Primary material: Natural coral stone (warm cream-pink) combined with polished mahogany tropical hardwood. Sea glass pieces (turquoise, green) embedded naturally. Bleached driftwood accents.
Surface qualities: Organic flowing forms. Wave-like geometry. Natural textures.

Background: Minimal textured plaster wall in warm white (#F8F5F0).
Lighting: Golden Caribbean sunset light from the left (2800K). Warm, rich, enveloping. The coral stone glows pink-gold.
Atmosphere: Warm. Free. Tropical luxury. Trade winds suggested through subtle movement in botanical elements.`,
        `Leave generous negative space on the left side.

Headline: "Dominica Citizenship"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "$100,000 — 140+ Countries"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"Family inclusion"
"3-6 months processing"
"No residency requirement"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Materials: Coral stone pink-cream, mahogany brown, sea glass turquoise
Accents: Turquoise (#3BB5A0), Coral (#E8886F), Baby Blue (#B3CFD4)`
      ),
      reelScenes: [
        { keyframePrompt: "Aerial drone shot of Dominica's lush green volcanic mountains meeting turquoise Caribbean Sea, dramatic coastline, golden hour light, atmospheric mist in valleys, 9:16 vertical, cinematic", videoPrompt: "Dramatic Dominica coastline with volcanic mountains meeting Caribbean Sea, aerial" },
        { keyframePrompt: "Close-up of tropical rainforest waterfall detail — water cascading over volcanic rock covered in emerald moss, rainbow in mist, shallow DOF, 9:16 vertical, tactile", videoPrompt: "Lush Dominica rainforest waterfall, emerald green, cascading water, paradise" },
        { keyframePrompt: "Crystal-clear Caribbean water over white sand, gentle waves, turquoise gradient from shallow to deep, overhead angle, 9:16 vertical, abstract and beautiful", videoPrompt: "Perfect Caribbean water, crystal clear, turquoise gradient, gentle waves on white sand" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from warm tropical light particles against cream background (#F8F5F0), bird in Deep Teal (#809CA1), minimal, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird from warm tropical light, cream background" },
      ],
      voiceOverScript: "دومينيكا... جزيرة الطبيعة الخلابة وجواز السفر القوي. استثمار واحد يمنح عائلتك حرية السفر لأكثر من 140 دولة. ELEVAY يحقق هذا الحلم.",
      backgroundMusicSuggestion: "Tropical Caribbean ambient, sophisticated and free, steel drums meets cinematic",
    },
  ],
};

// ─── UK EXPANSION WORKER ──────────────────────────────────────────────────────

const UK_EXPANSION: ProgramTemplates = {
  programName: "UK Expansion Worker",
  country: "UK",
  posts: [
    {
      topic: "UK Expansion Worker: توسيع أعمالك في بريطانيا",
      caption: "🇬🇧 المملكة المتحدة — العاصمة المالية للعالم!\n\n💼 إقامة عمل في بريطانيا\n🌍 سوق عالمي ضخم\n🎓 أفضل جامعات العالم لأبنائك\n🏥 رعاية صحية NHS\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #بريطانيا #إقامة_عمل",
      hashtags: ["#UKExpansion", "#بريطانيا", "#لندن", "#ELEVAY", "#إقامة_عمل", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `Design a sculptural architectural object carved from Portland stone (London's building material) combined with dark racing green painted iron and polished brass details. The sculpture reveals London's business world through elegant openings — modern glass towers, Georgian architecture, English gardens. The form combines Georgian precision with modern ambition. A sense of global business prestige.`,
        `The sculpture reveals:

1. The City: Modern glass towers of London's financial district reflecting clouds and historic church spires — representing global business access.

2. Georgian Heritage: Elegant Georgian townhouse facade with Portland stone columns, brass door furniture, and racing green door — representing British prestige and heritage.

3. English Garden: A manicured English garden with hedges, autumn leaves, and morning mist — representing quality of life and education.

4. Thames View: The River Thames at dawn with Tower Bridge silhouetted — representing London's position as a global gateway.`,
        `Primary material: Portland stone (cool grey-cream) with dark green painted iron details and polished brass accents. English oak at the base.
Surface qualities: Precise Georgian geometry. Clean lines. Polished surfaces. The brass catches light beautifully.

Background: Minimal textured plaster in warm white (#F8F5F0).
Lighting: Crisp London morning light — soft grey with occasional golden breakthrough (5500K). Energetic and purposeful.
Atmosphere: Prestigious. Ambitious. Global. The world's financial capital at your doorstep.`,
        `Leave generous negative space on the right side.

Headline: "UK Expansion Worker"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "London Awaits Your Business"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"Global financial hub"
"World-class education"
"NHS healthcare access"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Materials: Portland stone grey (#B8B2A8), racing green (#2D5A3F), polished brass
Accents: Baby Blue (#B3CFD4), Deep Teal (#809CA1)`
      ),
      reelScenes: [
        { keyframePrompt: "Aerial shot of London skyline — The City glass towers reflecting historic churches, Thames River, golden morning light breaking through clouds, 9:16 vertical, cinematic", videoPrompt: "London skyline at dawn, modern glass towers and historic spires, Thames River, golden breakthrough light" },
        { keyframePrompt: "Close-up of Georgian townhouse door detail — polished brass knocker on dark green painted door, Portland stone surround, morning light, shallow DOF, 9:16 vertical", videoPrompt: "Georgian London door detail, polished brass on racing green, Portland stone, morning light" },
        { keyframePrompt: "English garden in autumn — manicured hedges, golden leaves, morning mist, a bench, peaceful and prestigious, 9:16 vertical, contemplative", videoPrompt: "English garden in autumn, golden leaves, morning mist, peaceful prestige" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from soft London morning light against cream background (#F8F5F0), Deep Teal (#809CA1), minimal, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird, soft grey-gold London light, cream background" },
      ],
      voiceOverScript: "المملكة المتحدة... حيث الطموح يلتقي بالفرصة. إقامة العمل البريطانية تفتح أمامك أكبر سوق مالي في العالم. ELEVAY يرشدك.",
      backgroundMusicSuggestion: "British cinematic, sophisticated strings, confident and prestigious",
    },
  ],
};

// ─── CANADA SKILLED MIGRATION ─────────────────────────────────────────────────

const CANADA_SKILLED: ProgramTemplates = {
  programName: "Canada Skilled Migration",
  country: "Canada",
  posts: [
    {
      topic: "Canada Skilled Migration: بداية جديدة في كندا",
      caption: "🇨🇦 كندا — حيث الطبيعة البكر تلتقي بالفرص اللامحدودة!\n\n🏔️ طبيعة خلابة ومدن عالمية\n💼 سوق عمل قوي ومتنوع\n🎓 تعليم مجاني للأبناء\n🏥 رعاية صحية شاملة\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #كندا #الهجرة_الماهرة",
      hashtags: ["#CanadaImmigration", "#كندا", "#الهجرة_الماهرة", "#ELEVAY", "#بداية_جديدة", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `Design a geological cross-section sculpture carved from Canadian materials — western red cedar wood, granite, and natural slate. The cross-section reveals Canada's offerings at different layers: pristine nature at the surface (mountains, forests, lakes), thriving cities in the middle (Vancouver, Toronto skylines), and opportunity/career growth at the foundation (represented by precious minerals and crystals emerging from rock). The composition reads like a luxury editorial — not an infographic.`,
        `The cross-section reveals layers:

1. Surface Layer: Pristine Canadian wilderness — snow-capped Rocky Mountains, crystal-clear lake reflecting peaks, dense evergreen forests. Untouched natural beauty.

2. Middle Layer: Modern Canadian city skyline (Vancouver with mountains behind) — glass towers, parks, multicultural vibrancy. World-class urban living.

3. Foundation Layer: Raw granite with quartz crystals and precious minerals emerging — representing career opportunity, economic growth, and the solid foundation Canada offers.

4. Connecting Element: A single western red cedar tree growing through all layers — roots in opportunity, trunk through the city, canopy in nature. Representing growth and connection.`,
        `Primary material: Western red cedar (warm reddish-brown), Canadian granite (grey with quartz sparkles), natural slate (dark grey-blue). Raw concrete accents.
Surface qualities: Natural grain visible in cedar. Sparkle of quartz in granite. Layered slate textures.

Background: Minimal textured plaster wall in warm white (#F8F5F0).
Lighting: Northern forest light — clean, pure, slightly cool (5500K). Crystal-clear. The cedar wood glows warm in contrast.
Atmosphere: Fresh. Pure. Limitless. Pristine nature meeting world-class opportunity.`,
        `Leave generous negative space on the left side.

Headline: "Canada Skilled Migration"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "Where Nature Meets Opportunity"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"World's most welcoming country"
"Free education & healthcare"
"Pristine nature, world-class cities"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Materials: Cedar warm (#8B5E3C), granite grey, forest green (#3A6B4F)
Accents: Baby Blue (#B3CFD4), Deep Teal (#809CA1)`
      ),
      reelScenes: [
        { keyframePrompt: "Aerial drone shot of Rocky Mountains reflected in crystal-clear lake, autumn colors (gold, red, green), morning mist, 9:16 vertical, cinematic, no people", videoPrompt: "Sweeping Rocky Mountain panorama reflected in crystal lake, autumn colors, morning mist" },
        { keyframePrompt: "Close-up of western red cedar bark texture with morning dew drops, soft forest light filtering through, shallow DOF, 9:16 vertical, tactile nature photography", videoPrompt: "Macro detail of cedar bark with morning dew, soft forest light, pristine nature" },
        { keyframePrompt: "Vancouver skyline against snow-capped mountains, glass towers reflecting clouds, Stanley Park green in foreground, clear day, 9:16 vertical", videoPrompt: "Vancouver skyline with mountain backdrop, modern glass meets pristine nature" },
        { keyframePrompt: "ELEVAY origami bird logo emerging from cool northern light against cream background (#F8F5F0), Deep Teal (#809CA1), minimal, 9:16 vertical", videoPrompt: "Slow reveal of ELEVAY origami bird, cool northern light, cream background" },
      ],
      voiceOverScript: "كندا... حيث الطبيعة البكر تلتقي بالفرص اللامحدودة. الهجرة الماهرة تفتح أمامك أبواب واحدة من أفضل دول العالم. ELEVAY يرشدك في هذه الرحلة.",
      backgroundMusicSuggestion: "Northern cinematic ambient, vast and hopeful, piano and strings",
    },
  ],
};

// ─── ELEVAY BRAND ─────────────────────────────────────────────────────────────

const ELEVAY_BRAND: ProgramTemplates = {
  programName: "ELEVAY",
  country: "Global",
  posts: [
    {
      topic: "ELEVAY: خبرة 28 عاماً في خدمتك",
      caption: "🌍 ELEVAY — شريكك الموثوق منذ 1998\n\n✅ 9 برامج إقامة وجنسية\n✅ آلاف العائلات الناجحة\n✅ خبراء متخصصون في كل برنامج\n✅ استشارة مجانية شاملة\n\nاحجز استشارتك المجانية اليوم 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #خبرة_28_عاماً",
      hashtags: ["#ELEVAY", "#إيليفاي", "#ExpandingYourFreedom", "#خبرة_28_عاماً", "#إقامة_أوروبية", "#جنسية_كاريبية"],
      staticImagePrompt: buildPrompt(
        `Design a light installation artwork — an abstract architectural space where ELEVAY's legacy and global reach are revealed through carefully directed beams of warm light. Light passes through a perforated brass screen (the pattern subtly suggests the ELEVAY origami bird) to create beautiful patterns on a warm white wall. The patterns suggest global connections — not literally maps, but abstract geometric forms that evoke worldwide reach. A single olive branch casts a natural shadow, representing growth over 28 years.`,
        `The light installation reveals:

1. Brass Screen: A large perforated brass panel with geometric cutouts that subtly form the ELEVAY origami bird shape when viewed from the correct angle. The perforations create beautiful light patterns.

2. Light Patterns: Warm golden light passing through the brass screen creates geometric shadow patterns on the white wall behind — suggesting global connections and pathways.

3. Olive Branch: A single real olive branch in a minimal ceramic vase, casting a natural organic shadow that contrasts with the geometric light patterns — representing 28 years of organic growth.

4. Gallery Space: The overall setting is a minimal white gallery with natural stone floor — representing ELEVAY's position as a premium, established institution.`,
        `Primary material: Perforated brass screen (warm, patinated), warm white plaster walls, natural stone floor.
Surface qualities: The brass has a beautiful patina — aged but cared for. The plaster walls are perfectly smooth. The stone floor has subtle natural veining.

Background: Minimal gallery space in warm white (#F8F5F0).
Lighting: Warm directional light (3000K) passing through the brass screen creating beautiful geometric shadow patterns. Gallery atmosphere. Single spotlight effect.
Atmosphere: Contemplative. Established. Trustworthy. 28 years of quiet confidence.`,
        `Leave generous negative space in the upper portion.

Headline: "Expanding Your Freedom"
Large luxury serif. Color: Charcoal (#2C2C2C).

Subtitle: "Since 1998 — 28 Years of Trust"
Refined sans-serif. Color: Deep Teal (#809CA1).

Body copy:
"9 residency & citizenship programs"
"Thousands of successful families"
"Your trusted global mobility partner"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background: Warm white (#F8F5F0)
Materials: Patinated brass, warm plaster, natural stone
Accents: Baby Blue (#B3CFD4), Sage (#CCDBD5), Deep Teal (#809CA1)`
      ),
      reelScenes: [
        { keyframePrompt: "Abstract architectural space with warm light beams passing through perforated brass screen, creating geometric shadow patterns on white wall, gallery atmosphere, 9:16 vertical", videoPrompt: "Warm light slowly moving through perforated brass screen, creating evolving shadow patterns" },
        { keyframePrompt: "Close-up of patinated brass surface with geometric perforations, warm light catching edges, shallow DOF, 9:16 vertical, tactile and premium", videoPrompt: "Macro detail of brass screen perforations with warm light, premium material quality" },
        { keyframePrompt: "Wide shot of minimal gallery space with single olive tree in ceramic pot, warm light from above, white walls, natural stone floor, 9:16 vertical, contemplative", videoPrompt: "Minimal gallery with olive tree, warm overhead light, contemplative atmosphere" },
        { keyframePrompt: "ELEVAY origami bird logo in Deep Teal (#809CA1) against warm cream background (#F8F5F0), soft warm light from upper left, minimal and elegant, 9:16 vertical", videoPrompt: "ELEVAY origami bird reveal, warm light, cream background, 28 years of trust" },
      ],
      voiceOverScript: "ELEVAY... أكثر من 28 عاماً من الخبرة في مساعدة العائلات على تحقيق حلم الحرية العالمية. شريكك الموثوق في رحلة الإقامة والجنسية.",
      backgroundMusicSuggestion: "Elegant cinematic, warm and trustworthy, piano and soft strings",
    },
  ],
};

// ─── PROGRAM MAP ─────────────────────────────────────────────────────────────
export const PROGRAM_TEMPLATES: Record<string, ProgramTemplates> = {
  "Spain DNV": SPAIN_DNV,
  "Greece Golden Visa": GREECE_GOLDEN_VISA,
  "Malta PR": MALTA_PR,
  "Portugal D7": PORTUGAL_D7,
  "Dominica": DOMINICA,
  "UK Expansion Worker": UK_EXPANSION,
  "Canada Skilled Migration": CANADA_SKILLED,
  "ELEVAY": ELEVAY_BRAND,
};

// ─── PLAN GENERATOR (rule-based, zero LLM) ──────────────────────────────────
export function generatePlanRuleBased(startDate: string) {
  const start = new Date(startDate);
  const WEEK_PROGRAMS: string[] = [
    "Spain DNV", "Malta PR", "Greece Golden Visa", "Spain DNV",
    "Portugal D7", "Malta PR", "Spain DNV", "Greece Golden Visa",
    "Dominica", "Spain DNV", "UK Expansion Worker", "Canada Skilled Migration",
  ];

  const months: Array<{
    monthLabel: string;
    weeks: Array<{
      weekNumber: number;
      startDate: string;
      endDate: string;
      focus: string;
      posts: Array<{ day: string; type: string; topic: string }>;
    }>;
  }> = [];

  let currentMonth = -1;
  for (let w = 0; w < 12; w++) {
    const ws = new Date(start);
    ws.setDate(ws.getDate() + w * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);

    const monthIdx = ws.getMonth();
    if (monthIdx !== currentMonth) {
      months.push({ monthLabel: ws.toLocaleString("en", { month: "long", year: "numeric" }), weeks: [] });
      currentMonth = monthIdx;
    }

    const program = WEEK_PROGRAMS[w % WEEK_PROGRAMS.length];
    const tpl = PROGRAM_TEMPLATES[program] || ELEVAY_BRAND;
    const post = tpl.posts[w % tpl.posts.length];

    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
    const posts = [
      { day: DAYS[0], type: "Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[1], type: "Static Design", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[2], type: "Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[3], type: "Static Design", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[4], type: "Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
    ];

    months[months.length - 1].weeks.push({
      weekNumber: w + 1,
      startDate: ws.toISOString().slice(0, 10),
      endDate: we.toISOString().slice(0, 10),
      focus: program,
      posts,
    });
  }

  return {
    planTitle: "ELEVAY 12-Week Marketing Strategy Plan (v2 Editorial Luxury)",
    overview: {
      totalWeeks: 12,
      postsPerWeek: 5,
      contentMix: [
        { name: "الإقامة الأوروبية (إسبانيا، البرتغال، اليونان، مالطا)", percentage: "60%", description: "برامج الإقامة الأوروبية مع التركيز على إسبانيا" },
        { name: "الجنسية الكاريبية", percentage: "15%", description: "عرض برامج الجنسية الكاريبية" },
        { name: "بريطانيا وكندا", percentage: "15%", description: "برامج الهجرة الماهرة والتوسع التجاري" },
        { name: "العلامة التجارية", percentage: "10%", description: "تعزيز مكانة ELEVAY" },
      ],
      targetAudience: "الأفراد ذوو الثروات العالية في منطقة الشرق الأوسط وشمال أفريقيا",
      tone: "احترافي، موثوق، ملهم — بأسلوب تحريري فاخر",
      visualStyle: "Editorial Luxury v2 — warm whites, natural materials, architectural concepts, museum-gallery atmosphere",
    },
    months,
  };
}

// ─── WEEK MEDIA GENERATOR ─────────────────────────────────────────────────────
export function generateWeekMediaPrompts(posts: Array<{ day: string; type: string; topic: string }>): {
  staticPrompts: Array<{ day: string; topic: string; imagePrompt: string; caption: string; hashtags: string[] }>;
  reelKeyframes: Array<{ day: string; topic: string; scenes: Array<{ sceneNumber: number; duration: string; keyframePrompt: string; videoPrompt: string }>; voiceOverScript: string; backgroundMusicSuggestion: string; caption: string; hashtags: string[] }>;
} {
  const staticPrompts: Array<{ day: string; topic: string; imagePrompt: string; caption: string; hashtags: string[] }> = [];
  const reelKeyframes: Array<{ day: string; topic: string; scenes: Array<{ sceneNumber: number; duration: string; keyframePrompt: string; videoPrompt: string }>; voiceOverScript: string; backgroundMusicSuggestion: string; caption: string; hashtags: string[] }> = [];

  for (const post of posts) {
    let matchedTpl: PostTemplate | null = null;

    for (const [, progData] of Object.entries(PROGRAM_TEMPLATES)) {
      for (const tpl of progData.posts) {
        if (tpl.topic === post.topic || post.topic.includes(progData.country) || post.topic.includes(progData.programName)) {
          matchedTpl = tpl;
          break;
        }
      }
      if (matchedTpl) break;
    }

    if (!matchedTpl) {
      matchedTpl = ELEVAY_BRAND.posts[0];
    }

    if (post.type === "Static Design" || post.type === "Static Design + Reel") {
      staticPrompts.push({
        day: post.day,
        topic: post.topic,
        imagePrompt: matchedTpl.staticImagePrompt,
        caption: matchedTpl.caption,
        hashtags: matchedTpl.hashtags,
      });
    }
    
    if (post.type === "Reel" || post.type === "Static Design + Reel") {
      reelKeyframes.push({
        day: post.day,
        topic: post.topic,
        scenes: matchedTpl.reelScenes.map((scene, idx) => ({
          sceneNumber: idx + 1,
          duration: "5s",
          keyframePrompt: scene.keyframePrompt,
          videoPrompt: scene.videoPrompt,
        })),
        voiceOverScript: matchedTpl.voiceOverScript,
        backgroundMusicSuggestion: matchedTpl.backgroundMusicSuggestion,
        caption: matchedTpl.caption,
        hashtags: matchedTpl.hashtags,
      });
    }
  }

  return { staticPrompts, reelKeyframes };
}

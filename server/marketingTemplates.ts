/**
 * ELEVAY Marketing Content Templates (v3 — Clean Marketing Design)
 * Rule-based engine — zero LLM calls required.
 * Each program has detailed 400+ word prompts following the 7-section structure.
 * Concept bank rotates weekly. Per-program materials and atmospheres are enforced.
 */

export interface PostTemplate {
  topic: string;
  caption: string; // Arabic
  hashtags: string[];
  staticImagePrompt: string; // 4:5 (1080×1350) — detailed editorial luxury prompt
  reelScenes: Array<{ keyframePrompt: string; videoPrompt: string }>; // exactly 5 scenes (hook, sensory, lifestyle, climax, brand close)
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
- Sculptural objects, portals, or museum installations — we need clear marketing, not abstract art
- Instagram template look — no preset layouts or cookie-cutter designs
- Canva style — no drag-and-drop aesthetic or clip-art elements
- Split screens or photo collage — no tiled grids
- Infographic style — no charts, diagrams, numbered lists with icons
- Floating icons or clipart — no generic vector icons floating in space
- Passports, flags, airplanes, or maps — permanently banned
- People, faces, or human figures — brand rule
- Corporate stock photography — no handshakes or generic business imagery
- Heavy gradients or glossy 3D effects
- Busy layouts — no more than 3 visual focal points
- Overdesigned typography — no decorative fonts, outlines, shadows, or text effects
- Dark navy backgrounds — retired from brand identity
- Gold border frames — retired from brand identity
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
Apple advertising campaigns (clean, bold message, premium feel)
Monocle Magazine editorial layouts (typography, white space, editorial confidence)
Aman Resorts brand imagery (quiet luxury, aspirational lifestyle)
Luxury real-estate marketing by Sotheby's International (elegant, destination-focused)
Airline business-class campaigns (Emirates, Etihad — aspirational, destination beauty)
Financial Times "How to Spend It" supplement (editorial luxury, clear messaging)
Luxury watch brand campaigns (Patek Philippe — heritage, legacy, clear value proposition)`;

function buildPrompt(concept: string, scenes: string, materials: string, typography: string, palette: string): string {
  return `PROJECT:
Create a premium luxury Instagram static post (1080×1350, 4:5 aspect ratio) for ELEVAY, a high-end Residency & Citizenship by Investment consultancy established in 1998 with 28 years of experience.

The design must clearly communicate the program benefits and deliver a strong marketing message. It should look like a premium advertising campaign — clean, elegant, and immediately understandable. The viewer should instantly know what program is being promoted and why it’s desirable.

CREATIVE CONCEPT:
${concept}

VISUAL COMPOSITION:
${scenes}

ENVIRONMENT & MOOD:
${materials}

TYPOGRAPHY & LAYOUT:
${typography}

COLOR PALETTE:
${palette}

${BRANDING_BLOCK}

${STYLE_REFERENCES}

${ANTI_PATTERNS}

FINAL GOAL:
The image should make viewers stop scrolling because it clearly communicates an aspirational lifestyle and a specific program benefit. The design should be elegant and premium but the MESSAGE must be crystal clear — what country, what program, what benefit, and why ELEVAY. Think luxury advertising that sells, not abstract art that confuses.`;
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
        `A clean, elegant marketing post that immediately communicates the Spain Digital Nomad Visa program. The design features a stunning full-bleed photograph of a sun-drenched Mediterranean Spanish scene (whitewashed village, terracotta rooftops, turquoise sea in the distance) occupying the right 60% of the canvas. The left 40% is a clean warm-white panel with bold typography delivering the program message. The layout is split cleanly — text on the left, beautiful destination imagery on the right. The feeling is: "This could be your life."`,
        `The right side features ONE hero photograph (not a collage):
A breathtaking view from a luxury terrace overlooking a Spanish coastal village — whitewashed buildings with terracotta roofs cascading down a hillside toward the Mediterranean Sea. Bougainvillea in vibrant magenta drapes over the terrace railing. The sea is deep azure blue. The sky is clear with warm golden afternoon light. The image is shot with a wide-angle lens showing the full panoramic beauty. No people. The image alone should make someone want to live in Spain.

The left panel is clean and minimal — warm white background with clear text hierarchy delivering the program benefits.`,
        `The photograph should feel like a premium travel editorial shot — warm golden afternoon light (golden hour), natural colors slightly enhanced for richness. The image should look real and aspirational, not stock photography.

Background of text panel: Warm white (#F8F5F0) with subtle linen texture.
Lighting: Natural warm Mediterranean afternoon light in the photograph.
Atmosphere: Warm, inviting, aspirational. The viewer should feel the Mediterranean breeze.`,
        `Left panel (40% of canvas) — text vertically centered:

Headline: "Spain Digital Nomad Visa"
Large luxury serif (Didot or Playfair Display). Bold. Color: Charcoal (#2C2C2C). This is the dominant text.

Subtitle: "Your Gateway to Europe"
Refined sans-serif (Helvetica Neue Light). Color: Deep Teal (#809CA1). Letter-spacing: Wide.

Key benefits (3 lines):
• "26 Schengen countries access"
• "Work remotely for any company worldwide"
• "European citizenship pathway in 10 years"
Elegant light sans-serif. Color: Warm grey (#5A5A5A). Clear and readable.`,
        `Text panel: Warm white (#F8F5F0)
Photograph: Natural warm Mediterranean colors — terracotta, azure blue, white, bougainvillea magenta
Accent: Deep Teal (#809CA1) for subtitle
Overall: Warm, sunny, premium, clear message`
      ),
      reelScenes: [
        { keyframePrompt: "Sweeping aerial drone shot of Barcelona coastline at golden hour — camera starts behind a stone balustrade with bougainvillea in soft foreground bokeh, then the Mediterranean Sea fills the frame sparkling with warm amber light, Sagrada Familia silhouette visible through atmospheric haze in the distance creating beautiful depth layers, warm color temperature 5500K, cinematic 9:16 vertical, Kodak Portra 400 color science, shallow depth transitioning to deep focus, no text, no people. The shot evokes the feeling of standing on your own terrace overlooking your new life.", videoPrompt: "Slow cinematic aerial dolly forward over Barcelona coastline at golden hour — camera glides past a stone balustrade with bougainvillea, revealing the sparkling Mediterranean Sea below, Sagrada Familia in atmospheric distance, warm amber light, film grain, Kodak Portra color grading, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of Spanish extra virgin olive oil being slowly drizzled onto a warm terracotta plate — the golden-green liquid catches warm directional sidelight from a nearby window, creating luminous highlights and deep amber shadows. Shallow DOF f/1.4, the background shows a soft bokeh of a rustic Spanish kitchen with copper pans and dried herbs. The oil pools and reflects the warm Mediterranean light. Every droplet is visible. This shot makes you taste and smell Spain.", videoPrompt: "Ultra slow-motion macro of golden olive oil drizzling onto warm terracotta, catching sidelight from a Spanish kitchen window, shallow DOF, warm amber tones, sensory and tactile, gentle camera drift, 120fps slow motion, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide establishing shot of a luxury modern Spanish villa terrace at golden hour — infinity pool in foreground reflecting the sunset sky, beyond it a panoramic view of rolling Andalusian hills with olive groves stretching to the horizon. A single olive tree frames the left side. Wrought iron and glass railing catches golden light. The architecture blends modern minimalism with traditional Spanish limestone. This is the life that awaits — serene, luxurious, Mediterranean. No people, 9:16 vertical, warm contemplative atmosphere.", videoPrompt: "Slow tracking shot along a luxury villa terrace — camera moves past an infinity pool reflecting sunset colors, revealing panoramic Andalusian hills with olive groves, golden hour light, architectural beauty, lifestyle aspiration, cinematic depth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Dramatic aerial pullback from the Alhambra palace in Granada at blue hour — the ancient Moorish fortress glows with warm amber uplighting against a deep blue twilight sky, the Sierra Nevada mountains snow-capped in the background, the city of Granada twinkling below. Camera slowly pulls back and up revealing the full majesty of the scene. This is the 'wow' moment — 800 years of history meeting modern European life. The most breathtaking shot of the reel. 9:16 vertical, cinematic epic scale.", videoPrompt: "Dramatic aerial pullback from the illuminated Alhambra palace at blue hour — warm amber fortress against deep blue sky, Sierra Nevada mountains behind, Granada city lights below, epic scale reveal, cinematic drone movement, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of warm golden light against a cream background (#F8F5F0). The bird in Deep Teal (#809CA1) appears to float in a museum-gallery space with soft directional lighting from above-left. The transition feels like the Alhambra's warm light dissolves into golden particles that reform into the elegant bird. Minimal, premium, contemplative. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving golden light particles against warm cream background, museum-gallery atmosphere, soft overhead lighting, bird gently rotates revealing facets, minimal elegant, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "إسبانيا... حيث يلتقي الجمال بالفرصة. إقامة الرحّال الرقمي تمنحك حق الإقامة في قلب أوروبا مع حرية العمل لأي شركة حول العالم. ELEVAY يرافقك في كل خطوة.",
      backgroundMusicSuggestion: "Cinematic Spanish acoustic guitar, warm and contemplative, Ennio Morricone meets modern ambient",
    },
    {
      topic: "Spain DNV: الحياة في إسبانيا",
      caption: "☀️ تخيّل صباحك في برشلونة أو مدريد...\n\nإسبانيا تحتل المرتبة الأولى عالمياً في جودة الحياة للمغتربين.\n\n🏖️ 300 يوم مشمس في السنة\n🍷 مطبخ عالمي وثقافة غنية\n🏥 رعاية صحية متقدمة\n🎓 تعليم دولي للأبناء\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية الآن 👇\n\n#إيليفاي #Elevay #ExpandingYourFreedom #إسبانيا_للعيش #جودة_الحياة",
      hashtags: ["#SpainLife", "#إسبانيا_للعيش", "#جودة_الحياة", "#ELEVAY", "#الإقامة_الأوروبية", "#ExpandingYourFreedom"],
      staticImagePrompt: buildPrompt(
        `A clean, elegant marketing post focused on the quality of life in Spain. The design features a stunning aerial photograph of a Spanish coastal town at golden hour — showing the Mediterranean lifestyle from above: terracotta rooftops, narrow winding streets, a harbor with boats, and the deep blue sea. The image occupies the top 65% of the canvas. The bottom 35% is a clean warm-white panel with bold headline and key benefits. The layout is vertical — destination beauty on top, clear message below.`,
        `The top section features ONE stunning aerial photograph:
A bird's-eye view of a charming Spanish Mediterranean coastal town at golden hour — terracotta rooftops glowing warm in the sunset, narrow cobblestone streets, a small harbor with traditional fishing boats and luxury yachts, the Mediterranean Sea stretching to the horizon in deep azure blue. Lush green trees and bougainvillea visible in courtyards. The photograph captures the essence of Mediterranean living — beauty, warmth, community, and the sea. No people visible.

The bottom panel is clean and minimal — warm white with clear text hierarchy.`,
        `The photograph should feel like a premium drone shot from a luxury travel magazine — golden hour light casting long warm shadows across the rooftops. Rich natural colors.

Background of text panel: Warm white (#F8F5F0).
Lighting: Natural golden hour in the photograph.
Atmosphere: Warm, aspirational, inviting. This is everyday life in Spain.`,
        `Bottom panel (35% of canvas) — text centered:

Headline: "Life in Spain"
Large luxury serif (Didot). Bold. Color: Charcoal (#2C2C2C).

Subtitle: "Quality Beyond Compare"
Refined sans-serif. Color: Deep Teal (#809CA1).

Key benefits:
• "300 days of sunshine annually"
• "World-class healthcare & education"
• "Rich culture meets modern comfort"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Text panel: Warm white (#F8F5F0)
Photograph: Warm golden terracotta, azure blue sea, green foliage
Accent: Deep Teal (#809CA1) for subtitle
Overall: Warm, Mediterranean, clear lifestyle message`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic slow dolly forward through a sun-dappled Spanish plaza lined with orange trees — camera moves at knee-height past wrought iron benches and mosaic tile floors, warm midday light filtering through canopy creating dancing shadow patterns on honey-colored stone, Mediterranean architecture with ornate balconies visible in the background through the trees, warm color temperature 5800K, atmospheric heat shimmer, 9:16 vertical, Kodak Portra 400, no people. The shot invites you to walk into this daily life.", videoPrompt: "Low-angle slow dolly forward through a Spanish plaza with orange trees, dappled sunlight creating moving shadow patterns on mosaic floors, Mediterranean architecture in background, warm midday light, cinematic film grain, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme close-up of ripe Spanish blood oranges being sliced on a marble surface — the knife reveals the deep crimson interior, juice beading on the white marble, warm morning sidelight from a kitchen window creating a golden rim on each droplet. Shallow DOF f/1.2, background shows soft bokeh of a bright Spanish kitchen with white tiles and copper accents. The colors are extraordinary — deep red against white marble against warm golden light. Tactile, sensory, appetizing.", videoPrompt: "Ultra macro slow-motion of blood orange being sliced on white marble, revealing deep crimson flesh, juice beading in warm morning sidelight, shallow DOF, sensory food photography, gentle camera drift, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium shot of a modern luxury penthouse living room in Barcelona — floor-to-ceiling windows frame a panoramic view of the Mediterranean Sea and city rooftops. Minimalist Scandinavian-Spanish furniture in warm wood and white linen. A single architectural plant casts elegant shadows. Warm afternoon light floods the space creating long golden rectangles on the polished concrete floor. This is your home — modern, bright, Mediterranean. No people, 9:16 vertical, architectural interior photography.", videoPrompt: "Slow pan across a luxury Barcelona penthouse interior, floor-to-ceiling windows revealing Mediterranean panorama, warm afternoon light flooding polished floors, minimalist furniture, architectural elegance, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Breathtaking aerial shot of the Costa Brava coastline at sunrise — dramatic rocky cliffs covered in Mediterranean pine forests plunging into crystal turquoise water, hidden coves with pristine beaches, morning mist rising from the warm sea. Camera slowly orbits revealing the full scale of the untouched coastline stretching into the distance. The most stunning natural beauty of Spain captured in one frame. 9:16 vertical, epic cinematic scale, Fuji Velvia color saturation.", videoPrompt: "Aerial orbit over Costa Brava coastline at sunrise — dramatic pine-covered cliffs meeting turquoise Mediterranean, hidden coves, morning mist, epic scale, cinematic drone movement, saturated colors, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of Mediterranean turquoise and golden light against cream background (#F8F5F0). The bird in Deep Teal (#809CA1) floats in museum-gallery space with soft directional lighting. The transition feels like the ocean and sunlight dissolve into particles that reform into the elegant bird. Minimal, premium. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving turquoise and golden light particles against warm cream background, museum-gallery atmosphere, bird gently rotates, minimal elegant, 9:16 vertical, 3 seconds" },
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
        `A clean, elegant marketing post that immediately communicates the Greece Golden Visa program. The design features a stunning photograph of Santorini's iconic blue-domed churches against the deep blue Aegean Sea, occupying the left 60% of the canvas. The right 40% is a clean warm-white panel with bold typography and program benefits. The layout communicates: invest in Greece, live in paradise.`,
        `The left side features ONE iconic hero photograph:
The famous Santorini view — white-washed Cycladic buildings cascading down the volcanic cliff, iconic blue-domed churches in the foreground, the deep blue Aegean Sea and caldera stretching to the horizon. Brilliant midday Mediterranean light creates sharp white-and-blue contrast. Pink bougainvillea cascades over a white wall in the foreground. The sky is perfectly clear azure. No people. The image instantly says "Greece" and "luxury."

The right panel is clean and minimal — warm white with clear text hierarchy.`,
        `The photograph should feel like a premium travel editorial — brilliant Aegean light, crystal-clear air, vivid blues and whites. Natural colors enhanced for richness.

Background of text panel: Warm white (#F8F5F0).
Lighting: Brilliant midday Aegean light in the photograph.
Atmosphere: Bright, pure, aspirational. Mediterranean paradise.`,
        `Right panel (40% of canvas) — text vertically centered:

Headline: "Greece Golden Visa"
Large luxury serif (Didot). Bold. Color: Charcoal (#2C2C2C).

Subtitle: "Your €250,000 Gateway to Europe"
Refined sans-serif. Color: Deep Teal (#809CA1). Letter-spacing: Wide.

Key benefits:
• "26 Schengen countries access"
• "Full family inclusion"
• "Real property ownership"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Text panel: Warm white (#F8F5F0)
Photograph: Aegean blue, Cycladic white, bougainvillea pink
Accent: Deep Teal (#809CA1) for subtitle
Overall: Bright, Mediterranean, clear investment message`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic aerial drone shot slowly rising over the Santorini caldera at golden hour — camera begins at sea level looking up at the white Cycladic buildings cascading down volcanic cliffs, then rises to reveal the full crescent of the caldera with deep blue Aegean Sea stretching to the horizon. Warm amber light paints every white surface gold. Atmospheric haze creates beautiful depth layers. The scale is breathtaking. 9:16 vertical, Kodak Portra 400, no people, no text.", videoPrompt: "Cinematic drone rising from sea level up the Santorini caldera cliff face — white buildings glowing in golden hour light, revealing the full crescent and deep blue Aegean, atmospheric depth, epic scale, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of ancient Greek Pentelic marble — camera focuses on the fluting of a Doric column where 2500 years of patina has created a golden-warm surface. Warm afternoon light rakes across at a low angle, revealing every grain and imperfection. Shallow DOF f/1.4, background shows soft bokeh of blue sky and distant white architecture. A tiny wildflower grows from a crack in the marble — life persisting through millennia. Tactile, historical, reverent.", videoPrompt: "Ultra macro of ancient Greek marble column fluting with 2500 years of patina, warm afternoon light raking across surface revealing texture, shallow DOF, tiny wildflower in crack, gentle camera drift, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide shot of a luxury modern villa terrace on Mykonos — infinity pool with underwater mosaic reflecting the Aegean sky, beyond it a panoramic view of whitewashed town and deep blue sea. Traditional stone walls meet contemporary glass architecture. A single ancient olive tree provides dappled shade. The golden afternoon light creates long shadows across the white stone terrace. This is Greek island living at its most refined. No people, 9:16 vertical, architectural lifestyle.", videoPrompt: "Slow tracking shot along a Mykonos luxury villa terrace — infinity pool reflecting sky, panoramic Aegean view, whitewashed town in distance, golden afternoon light, contemporary meets traditional architecture, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Breathtaking aerial shot of Meteora monasteries at sunrise — ancient monasteries perched impossibly atop towering sandstone pillars, morning mist swirling through the valleys below, warm golden light hitting the eastern faces of the rocks while the western sides remain in cool blue shadow. Camera slowly orbits one monastery revealing the full scale of the geological wonder. The most dramatic landscape in Greece. 9:16 vertical, epic cinematic scale, Fuji Velvia saturation.", videoPrompt: "Aerial orbit around Meteora monastery at sunrise — ancient building atop impossible sandstone pillar, morning mist in valleys, golden light on rock faces, epic geological scale, cinematic drone movement, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of Aegean blue and golden light against cream background (#F8F5F0). The bird in Deep Teal (#809CA1) floats in museum-gallery space. The transition feels like Santorini's white and blue dissolve into particles that reform into the elegant bird. Minimal, premium, timeless. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving Aegean blue and golden particles against warm cream background, museum-gallery atmosphere, bird gently rotates, minimal elegant, 9:16 vertical, 3 seconds" },
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
        `A clean, elegant marketing post that communicates Malta Permanent Residency. The design features a stunning photograph of Valletta's Grand Harbour — the iconic honey-gold fortified city reflecting in calm blue water — as a full-bleed background. A semi-transparent warm-white overlay panel on the right side (40%) carries the text. The layout is: full destination beauty behind, text panel overlaid on the right.`,
        `ONE stunning hero photograph as full background:
Valletta Grand Harbour at golden hour — the ancient honey-colored limestone fortifications and baroque church domes glowing warm in the setting sun, reflected in the calm deep blue harbour water. Traditional colorful luzzu boats in the foreground. The fortified city rises dramatically from the water. The image captures Malta's unique blend of ancient grandeur and Mediterranean beauty. No people. The photograph fills the entire canvas.

A semi-transparent warm-white panel (opacity 90%) overlays the right 40% of the image for text readability.`,
        `The photograph should feel like a premium architectural/travel editorial shot — golden hour light making the limestone glow warm amber. Rich, saturated colors.

Overlay panel: Warm white (#F8F5F0) at 90% opacity with subtle blur.
Lighting: Golden hour in the photograph.
Atmosphere: Warm, historic, secure, prestigious.`,
        `Right overlay panel (40% of canvas) — text vertically centered:

Headline: "Malta Permanent Residency"
Large luxury serif (Didot). Bold. Color: Charcoal (#2C2C2C).

Subtitle: "Your European Island Home"
Refined sans-serif. Color: Deep Teal (#809CA1).

Key benefits:
• "Permanent EU residency"
• "English-speaking nation"
• "Thriving business environment"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Background photograph: Honey-gold limestone, deep blue harbour, warm amber sunset
Overlay panel: Warm white (#F8F5F0) at 90% opacity
Accent: Deep Teal (#809CA1) for subtitle
Overall: Warm, prestigious, Mediterranean island charm`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic aerial drone shot gliding over Valletta Grand Harbour at golden hour — camera sweeps low over the deep blue water then rises to reveal the ancient honey-gold fortifications of Fort St. Elmo, bastions glowing in warm amber light, historic sailing vessels anchored below. The scale of the 450-year-old fortress city is revealed gradually. Atmospheric depth with soft haze over the distant Mediterranean. 9:16 vertical, Kodak Portra 400, no people.", videoPrompt: "Aerial drone sweeping low over Valletta Grand Harbour water then rising to reveal ancient honey-gold fortifications at golden hour, historic vessels below, epic scale reveal, warm amber light, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of a traditional Maltese brass lion-head door knocker on a centuries-old honey-colored limestone door frame — the brass has developed a rich verdigris patina in the crevices while the high points are polished gold from centuries of hands. Warm afternoon sidelight rakes across at 45 degrees revealing every detail of the carved mane. Shallow DOF f/1.4, background shows soft bokeh of a narrow Maltese street with colored wooden balconies. Tactile, historical, intimate.", videoPrompt: "Ultra macro of Maltese brass lion door knocker with verdigris patina, warm afternoon sidelight revealing carved details, shallow DOF, soft bokeh of colorful balconies behind, gentle camera drift, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide shot of a luxury rooftop terrace in Valletta — contemporary furniture in warm teak and white linen, a plunge pool reflecting the evening sky, panoramic 360-degree view of Valletta's honey-colored domes and bell towers. The Three Cities visible across the harbour. Warm golden hour light creates long shadows across the limestone terrace. Mediterranean herbs in terracotta pots frame the edges. This is Maltese luxury living. No people, 9:16 vertical, architectural lifestyle.", videoPrompt: "Slow pan across a Valletta luxury rooftop terrace with plunge pool, panoramic view of honey-colored domes and harbour, golden hour light, Mediterranean herbs framing, architectural elegance, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Breathtaking aerial shot of the Blue Lagoon at Comino — crystal-clear turquoise water so transparent the white sandy bottom is visible 10 meters below, dramatic honey-colored limestone cliff walls creating a natural amphitheatre, the color gradient from shallow aquamarine to deep sapphire is extraordinary. Camera slowly descends from high altitude revealing the full lagoon. The most stunning natural water in the Mediterranean. 9:16 vertical, epic scale, Fuji Velvia saturation.", videoPrompt: "Aerial descent over Malta's Blue Lagoon — crystal turquoise water revealing white sand bottom, honey limestone cliffs forming natural amphitheatre, extraordinary color gradient, epic scale reveal, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of honey-gold and Mediterranean blue light against cream background (#F8F5F0). The bird in Deep Teal (#809CA1) floats in museum-gallery space. The transition feels like Malta's golden limestone and blue water dissolve into particles that reform into the elegant bird. Minimal, premium, sophisticated. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving honey-gold and blue particles against warm cream background, museum-gallery atmosphere, bird gently rotates, minimal elegant, 9:16 vertical, 3 seconds" },
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
        `A clean, elegant marketing post for Portugal D7 Residency. The design features a stunning photograph of Lisbon's iconic hillside — pastel-colored buildings, terracotta rooftops, and the Tagus River — occupying the top 60% of the canvas. The bottom 40% is a clean panel with a subtle azulejo-inspired geometric border accent at the top edge, carrying bold typography and program benefits. The layout is vertical: destination beauty on top, clear message below.`,
        `The top section features ONE stunning hero photograph:
Lisbon's iconic Alfama district at golden hour — pastel-colored buildings in pink, yellow, and cream cascading down the hillside, terracotta rooftops catching the warm light, the wide Tagus River visible in the background with the 25 de Abril Bridge. A traditional yellow tram track winds through the narrow streets. The light is warm and gentle — soft Atlantic golden hour. No people. The image captures Lisbon's romantic charm and affordable European elegance.

The bottom panel has a thin decorative line in azulejo blue at the top edge, then clean warm-white space with text.`,
        `The photograph should feel like a premium editorial travel shot — soft Atlantic golden hour light, pastel colors, romantic atmosphere.

Background of text panel: Warm white (#F8F5F0).
Decorative accent: A thin geometric line in azulejo blue (#2F6B8E) separating photo from text.
Lighting: Soft golden hour in the photograph.
Atmosphere: Gentle, romantic, affordable luxury. Portugal's quiet charm.`,
        `Bottom panel (40% of canvas) — text centered:

Headline: "Portugal D7 Residency"
Large luxury serif (Didot). Bold. Color: Charcoal (#2C2C2C).

Subtitle: "Europe's Atlantic Gateway"
Refined sans-serif. Color: Deep Teal (#809CA1).

Key benefits:
• "Passive income qualifies you"
• "300 days of sunshine"
• "Lowest cost in Western Europe"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Text panel: Warm white (#F8F5F0)
Photograph: Pastel Lisbon tones, terracotta, Atlantic blue
Accent: Azulejo blue (#2F6B8E) thin border, Deep Teal (#809CA1) for subtitle
Overall: Gentle, romantic, affordable European dream`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic aerial drone shot gliding over Lisbon's seven hills at golden hour — camera starts low over the Tagus River then rises to reveal the cascading terracotta rooftops, pastel-colored buildings, and iconic yellow tram tracks winding through narrow streets. Morning mist creates atmospheric depth layers between the hills. The 25 de Abril Bridge is visible in the distance. Warm amber light paints every surface. 9:16 vertical, Kodak Portra 400, no people.", videoPrompt: "Aerial drone rising from Tagus River to reveal Lisbon's seven hills at golden hour — cascading terracotta rooftops, pastel buildings, morning mist between hills, warm amber light, cinematic depth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of a traditional Portuguese azulejo tile wall — the camera focuses on where four tiles meet, revealing the extraordinary hand-painted blue and white geometric patterns. Centuries of glaze have created a subtle craquelure texture. Warm afternoon sidelight rakes across at a low angle, creating tiny shadows in every brush stroke and relief. Shallow DOF f/1.4, background shows soft bokeh of a Lisbon alley with a distant yellow tram. Tactile, artisanal, historical.", videoPrompt: "Ultra macro of Portuguese azulejo tile junction — hand-painted blue patterns with craquelure texture, warm afternoon sidelight revealing brushstrokes, shallow DOF, soft bokeh of Lisbon alley behind, gentle camera drift, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide shot of a luxury apartment interior in a renovated Pombaline building in Lisbon's Chiado district — original 18th-century ceiling frescoes and ornate moldings above, contemporary minimalist furniture below. Floor-to-ceiling windows open to a Juliet balcony overlooking a tree-lined square. Warm afternoon light streams in creating golden rectangles on herringbone parquet floors. The perfect blend of Portuguese heritage and modern luxury. No people, 9:16 vertical.", videoPrompt: "Slow pan across a luxury Lisbon apartment — 18th-century frescoed ceiling above contemporary furniture, Juliet balcony with tree-lined square view, warm afternoon light on herringbone floors, heritage meets modern luxury, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Breathtaking aerial shot of the Algarve's Benagil Sea Cave at golden hour — camera descends through the circular skylight opening in the cliff ceiling, revealing the cathedral-like interior with golden limestone walls, turquoise Atlantic water lapping at the sandy beach inside. Shafts of golden light pour through the oculus creating a divine atmosphere. The most extraordinary natural wonder of Portugal. 9:16 vertical, epic scale, Fuji Velvia saturation.", videoPrompt: "Aerial descent through Benagil Cave skylight — revealing cathedral-like golden limestone interior, turquoise water, sandy beach, golden light shafts through oculus, divine atmosphere, epic natural wonder, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of Atlantic blue and golden Portuguese light against cream background (#F8F5F0). The bird in Deep Teal (#809CA1) floats in museum-gallery space. The transition feels like the Algarve's golden cliffs and blue water dissolve into particles that reform into the elegant bird. Minimal, premium, nostalgic. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving Atlantic blue and golden particles against warm cream background, museum-gallery atmosphere, bird gently rotates, minimal elegant, 9:16 vertical, 3 seconds" },
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
        `A clean, bold marketing post for Dominica Citizenship by Investment. The design uses a split layout: the left 55% features a breathtaking aerial photograph of a Caribbean turquoise cove with white sand beach surrounded by lush tropical rainforest. The right 45% is a deep navy-teal gradient panel (#1A3A5C to #2D5A6B) with white and gold text. The contrast between paradise imagery and the dark professional text panel creates a premium, actionable feel.`,
        `The left side features ONE stunning aerial photograph:
A hidden Caribbean cove seen from above — crystal-clear turquoise water so transparent the white sandy bottom is visible, a crescent of pristine white sand beach, surrounded by dense emerald-green tropical rainforest. The color gradient from shallow aquamarine to deep sapphire blue is extraordinary. No people, no boats, no buildings — pure untouched paradise. The photograph instantly communicates "Caribbean dream."

The right panel is a smooth gradient from deep navy (#1A3A5C) to teal (#2D5A6B) — professional and premium.`,
        `The photograph should feel like a luxury travel magazine aerial shot — vivid turquoise water, pristine white sand, lush green. Saturated tropical colors.

Right panel: Deep navy-to-teal gradient, smooth and professional.
Lighting: Bright midday Caribbean sun in the photograph.
Atmosphere: Paradise meets opportunity. Freedom. Tropical luxury.`,
        `Right panel (45% of canvas) — text vertically centered, white on dark:

Headline: "Dominica Citizenship"
Large luxury serif (Didot). Bold. Color: White (#FFFFFF).

Subtitle: "$100,000 — 140+ Countries"
Refined sans-serif. Color: Gold (#D4AF37). Letter-spacing: Wide.

Key benefits:
• "Family inclusion"
• "3-6 months processing"
• "No residency requirement"
Elegant light sans-serif. Color: Light grey (#E0E0E0).`,
        `Left: Turquoise water, white sand, emerald rainforest
Right panel: Navy-teal gradient (#1A3A5C to #2D5A6B)
Text: White + Gold (#D4AF37) accent
Overall: Paradise meets premium investment opportunity`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic aerial drone shot sweeping over Dominica's volcanic coastline at golden hour — camera starts over the turquoise Caribbean Sea then rises to reveal dramatic emerald-green volcanic peaks shrouded in tropical mist, waterfalls visible cascading down cliff faces into the ocean, the contrast between deep green mountains and turquoise water is extraordinary. Warm golden light catches the spray of waves crashing against volcanic rock. 9:16 vertical, Kodak Portra 400, no people.", videoPrompt: "Aerial drone sweeping from Caribbean Sea up to reveal Dominica's volcanic peaks in mist at golden hour — waterfalls cascading to ocean, emerald green meets turquoise, dramatic scale, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of tropical water droplets on a giant emerald heliconia leaf in Dominica's rainforest — each droplet acts as a tiny lens reflecting the canopy above. Warm filtered sunlight creates golden rim-lighting on every droplet. The leaf's parallel veins create natural leading lines. Shallow DOF f/1.2, background shows soft bokeh of cascading waterfall through dense tropical foliage. The colors are saturated and alive — emerald, gold, and crystal clear. Tactile, lush, paradise.", videoPrompt: "Ultra macro of water droplets on emerald heliconia leaf in tropical rainforest — each droplet reflecting canopy, warm filtered sunlight creating golden rim-light, waterfall bokeh behind, lush paradise, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide shot of a luxury beachfront villa with open-air living room on a private Caribbean beach — contemporary tropical architecture with mahogany beams and white linen curtains billowing in the sea breeze. Infinity pool merges visually with the turquoise Caribbean Sea beyond. Tropical landscaping with mature coconut palms frames the scene. Late afternoon golden light creates warm shadows. This is Caribbean luxury living. No people, 9:16 vertical, architectural lifestyle.", videoPrompt: "Slow tracking shot through a luxury Caribbean beachfront villa — open-air living room, white curtains billowing in breeze, infinity pool merging with turquoise sea, coconut palms, golden afternoon light, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Breathtaking aerial shot of a hidden Caribbean cove at sunset — crystal-clear turquoise water so transparent the coral reef patterns are visible below, pristine white sand crescent beach surrounded by lush tropical forest, dramatic volcanic cliffs framing both sides. The sunset paints the sky in coral, gold, and violet. A single traditional wooden fishing boat rests on the sand. The most perfect tropical paradise captured in one frame. 9:16 vertical, epic scale, Fuji Velvia saturation.", videoPrompt: "Aerial orbit over hidden Caribbean cove at sunset — crystal water revealing coral reef, white sand crescent beach, tropical forest, volcanic cliffs, coral-gold-violet sky, single wooden boat, paradise, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of Caribbean turquoise and sunset coral light against cream background (#F8F5F0). The bird in Deep Teal (#809CA1) floats in museum-gallery space. The transition feels like the tropical ocean and sunset dissolve into particles that reform into the elegant bird. Minimal, premium, free. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving turquoise and coral particles against warm cream background, museum-gallery atmosphere, bird gently rotates, minimal elegant, 9:16 vertical, 3 seconds" },
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
        `A clean, prestigious marketing post for UK Expansion Worker visa. The design features a dramatic photograph of London's skyline at dawn — The Shard and modern glass towers rising through morning mist with Tower Bridge in the foreground — as a full-bleed background. A semi-transparent dark panel (racing green to charcoal gradient) on the lower 40% carries white text. The layout communicates: global business prestige, London awaits.`,
        `ONE stunning hero photograph as full background:
London's financial district at dawn — The Shard, the Gherkin, and Canary Wharf glass towers rising through soft morning mist, catching the first golden light. Tower Bridge is visible in the mid-ground, the Thames River winding silver below. The sky transitions from deep blue at the top to warm amber at the horizon. The image captures London's unique blend of historic grandeur and modern financial power. No people. The photograph fills the entire canvas.

A semi-transparent gradient overlay (racing green #2D5A3F to charcoal #2C2C2C, 85% opacity) covers the lower 40% for text readability.`,
        `The photograph should feel like a premium business editorial — crisp morning light, atmospheric mist creating depth, glass towers catching golden reflections.

Overlay: Racing green to charcoal gradient at 85% opacity on lower 40%.
Lighting: Dawn golden hour in the photograph.
Atmosphere: Prestigious, ambitious, global. The world's financial capital.`,
        `Lower overlay panel (40% of canvas) — text left-aligned with padding:

Headline: "UK Expansion Worker"
Large luxury serif (Didot). Bold. Color: White (#FFFFFF).

Subtitle: "London Awaits Your Business"
Refined sans-serif. Color: Gold (#D4AF37). Letter-spacing: Wide.

Key benefits:
• "Global financial hub"
• "World-class education"
• "NHS healthcare access"
Elegant light sans-serif. Color: Light grey (#E0E0E0).`,
        `Background photograph: London skyline, glass towers, golden dawn, silver Thames
Overlay: Racing green (#2D5A3F) to charcoal (#2C2C2C) gradient
Text: White + Gold (#D4AF37) accent
Overall: Prestigious, powerful, global business opportunity`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic aerial drone shot of London's financial district at dawn — camera rises through morning mist to reveal The Shard, Gherkin, and Canary Wharf glass towers catching the first golden light while the Thames River winds silver below. Historic St. Paul's Cathedral dome sits proudly among the modern giants. The contrast between centuries of architecture is breathtaking. Atmospheric morning haze creates depth layers. 9:16 vertical, Kodak Portra 400, no people.", videoPrompt: "Aerial drone rising through London morning mist to reveal financial district glass towers catching first golden light, Thames below, St. Paul's dome among modern giants, atmospheric depth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of a polished brass lion-head door knocker on a racing green Georgian townhouse door in Mayfair — the brass has been polished to a mirror finish reflecting the Portland stone facade opposite. Warm morning sidelight creates rich golden highlights and deep shadows in the lion's mane. Shallow DOF f/1.4, background shows soft bokeh of a prestigious London square with mature plane trees. The craftsmanship speaks of centuries of British excellence. Tactile, prestigious, refined.", videoPrompt: "Ultra macro of polished brass lion knocker on racing green Georgian door — mirror-finish reflecting Portland stone, warm morning sidelight in lion's mane, shallow DOF, London square bokeh, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide shot of a luxury penthouse office in The Shard — floor-to-ceiling glass walls revealing a 360-degree panorama of London stretching to the horizon. Minimalist British design with walnut desk, green leather Chesterfield, and brass desk lamp. Morning light floods the space. Tower Bridge visible directly below. This is where global business decisions are made. No people, 9:16 vertical, architectural power.", videoPrompt: "Slow pan across a luxury Shard penthouse office — 360-degree London panorama through glass walls, walnut desk, green Chesterfield, Tower Bridge below, morning light flooding space, power and prestige, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Breathtaking aerial shot of the English countryside at autumn golden hour — rolling hills in amber and gold, ancient stone walls dividing fields into geometric patterns, a grand country estate with manicured gardens visible in the valley, morning mist lingering in the hollows. The quintessential English landscape stretching endlessly. Camera slowly orbits revealing the full pastoral majesty. 9:16 vertical, epic scale, warm Kodak Portra tones.", videoPrompt: "Aerial orbit over English countryside at autumn golden hour — rolling amber hills, stone walls creating patterns, grand estate in valley, morning mist in hollows, epic pastoral scale, warm tones, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of London grey-gold and British racing green light against cream background (#F8F5F0). The bird in Deep Teal (#809CA1) floats in museum-gallery space. The transition feels like London's morning light dissolves into particles that reform into the elegant bird. Minimal, premium, confident. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving grey-gold and racing green particles against warm cream background, museum-gallery atmosphere, bird gently rotates, minimal elegant, 9:16 vertical, 3 seconds" },
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
        `A clean, inspiring marketing post for Canada Skilled Migration. The design features a breathtaking photograph of Moraine Lake with turquoise water reflecting snow-capped Rocky Mountains, occupying the right 60% of the canvas. The left 40% is a clean white panel with a subtle red maple leaf watermark and bold typography. The layout communicates: pristine nature, limitless opportunity, new beginning.`,
        `The right side features ONE stunning hero photograph:
Moraine Lake at sunrise — the iconic turquoise-blue glacial water perfectly reflecting the Valley of the Ten Peaks (snow-capped Rocky Mountains) behind. Dense evergreen forest (dark green spruce) lines the shore. The sky is crystal-clear with warm sunrise tones. Autumn golden larch trees add a splash of gold among the evergreens. No people. The image captures Canada's breathtaking natural beauty and sense of limitless space.

The left panel is clean white with a very subtle, large maple leaf watermark in light grey (#F0F0F0) as a background element.`,
        `The photograph should feel like a National Geographic landscape editorial — crystal-clear northern light, vivid turquoise water, pristine wilderness.

Left panel: Clean white (#FFFFFF) with subtle maple leaf watermark.
Lighting: Sunrise golden hour in the photograph.
Atmosphere: Fresh, pure, limitless. A new beginning in the world's most welcoming country.`,
        `Left panel (40% of canvas) — text vertically centered:

Headline: "Canada Skilled Migration"
Large luxury serif (Didot). Bold. Color: Charcoal (#2C2C2C).

Subtitle: "Where Nature Meets Opportunity"
Refined sans-serif. Color: Canadian Red (#D52B1E). Letter-spacing: Wide.

Key benefits:
• "World's most welcoming country"
• "Free education & healthcare"
• "Pristine nature, world-class cities"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).`,
        `Left panel: White with subtle grey maple leaf watermark
Photograph: Turquoise glacial water, snow-capped peaks, evergreen forest, golden larch
Accent: Canadian Red (#D52B1E) for subtitle
Overall: Fresh, pure, inspiring. New beginning in nature's paradise`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic aerial drone shot over the Canadian Rockies at sunrise — camera glides above a mirror-still turquoise lake (Moraine Lake) reflecting snow-capped peaks perfectly. Autumn larch trees in brilliant gold line the shore. Morning mist rises from the water surface catching the first warm light. The scale of the mountains is humbling. 9:16 vertical, Kodak Portra 400, no people.", videoPrompt: "Aerial glide over mirror-still turquoise Moraine Lake at sunrise — snow-capped Rockies reflected perfectly, golden larch trees, morning mist catching first light, epic natural scale, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of morning frost crystals on a red maple leaf — each crystal is a perfect geometric structure catching the first golden sunlight, creating tiny prismatic rainbows. The maple leaf's deep crimson color shows through the ice. Shallow DOF f/1.2, background shows soft bokeh of a misty Canadian forest in full autumn color. The detail is extraordinary — nature's precision engineering. Tactile, pristine, magical.", videoPrompt: "Ultra macro of frost crystals on red maple leaf catching first sunlight — prismatic rainbows in each crystal, crimson leaf beneath, misty autumn forest bokeh behind, magical natural detail, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide shot of a luxury modern home in Vancouver — floor-to-ceiling glass walls frame a panoramic view of snow-capped North Shore Mountains. Open-plan living with warm cedar accents, contemporary Canadian design. Stanley Park's ancient forest visible in the middle ground. Morning light floods the space. The perfect blend of urban sophistication and pristine nature. No people, 9:16 vertical, architectural lifestyle.", videoPrompt: "Slow pan across luxury Vancouver home interior — glass walls framing snow-capped mountains, cedar accents, Stanley Park forest in middle ground, morning light flooding space, nature meets urban sophistication, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Breathtaking aerial shot of Niagara Falls at golden hour — the massive horseshoe of thundering water creates a permanent rainbow in the mist, the sheer power and scale is awe-inspiring. Camera slowly pulls back to reveal the full width of the falls with the city skyline behind. The most powerful waterfall in North America captured at its most beautiful moment. 9:16 vertical, epic scale, Fuji Velvia saturation.", videoPrompt: "Aerial pullback from Niagara Falls at golden hour — thundering horseshoe of water, permanent rainbow in mist, epic scale reveal showing full width, city skyline behind, awesome natural power, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo materializing from dissolving particles of northern blue and autumn gold light against cream background (#F8F5F0). The bird in Deep Teal (#809CA1) floats in museum-gallery space. The transition feels like Canada's mountain light dissolves into particles that reform into the elegant bird. Minimal, premium, hopeful. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from dissolving northern blue and autumn gold particles against warm cream background, museum-gallery atmosphere, bird gently rotates, minimal elegant, 9:16 vertical, 3 seconds" },
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
        `A clean, premium brand post for ELEVAY — Citizenship & Residency Consultation. The design is a centered, symmetrical composition on a warm white background. The ELEVAY origami bird logo sits prominently at the top center in Deep Teal. Below it, bold typography communicates the brand's 28-year legacy. At the bottom, a horizontal strip showing 6 small iconic destination thumbnails (Spain, Greece, Malta, Portugal, UK, Canada) in a row — representing global reach. The overall feel is: established, trusted, premium.`,
        `The layout is vertically centered and symmetrical:

Top: The ELEVAY origami bird logo in Deep Teal (#809CA1), large and prominent, centered.

Middle: Bold headline and subtitle text (see text section).

Bottom: A horizontal strip of 6 small circular thumbnail images in a row, each showing an iconic landmark:
• Sagrada Familia (Spain)
• Santorini blue domes (Greece)
• Valletta harbour (Malta)
• Lisbon tram (Portugal)
• Big Ben (UK)
• Rocky Mountains (Canada)
Each thumbnail is a small circle with a thin gold border, arranged evenly across the width.`,
        `Background: Clean warm white (#F8F5F0) — no texture, no gradients, pure and premium.
The thumbnails should be tiny but recognizable — each a miniature of the destination's most iconic view.
Lighting: Even, studio-quality lighting. No dramatic shadows.
Atmosphere: Established. Trustworthy. Premium. 28 years of quiet confidence and proven results.`,
        `Centered layout:

Logo: ELEVAY origami bird in Deep Teal (#809CA1) — large, top center.

Headline: "Expanding Your Freedom"
Large luxury serif (Didot). Bold. Color: Charcoal (#2C2C2C).

Subtitle: "Since 1998 — 28 Years of Trust"
Refined sans-serif. Color: Deep Teal (#809CA1). Letter-spacing: Wide.

Key offerings:
"9 residency & citizenship programs"
"Thousands of successful families"
"Your trusted global mobility partner"
Elegant light sans-serif. Color: Warm grey (#5A5A5A).

Destination thumbnails row at the bottom with thin gold (#D4AF37) circular borders.`,
        `Background: Warm white (#F8F5F0)
Logo: Deep Teal (#809CA1)
Text: Charcoal (#2C2C2C) + Deep Teal + Warm grey
Thumbnail borders: Gold (#D4AF37)
Overall: Premium, established, globally trusted brand`
      ),
      reelScenes: [
        { keyframePrompt: "Cinematic slow-motion shot of a world map made of warm golden light particles floating in a dark museum-gallery space — the continents glow softly, connected by flowing lines of light representing global mobility paths. The camera slowly pushes in as the map rotates gently. The feeling is of infinite possibility and global freedom. Warm amber and teal light. 9:16 vertical, premium, aspirational.", videoPrompt: "Slow-motion world map made of golden light particles floating in dark gallery space — continents glowing, connected by flowing light paths, gentle rotation, infinite possibility, warm amber and teal, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Extreme macro close-up of a premium embossed business card being placed on a marble surface — the ELEVAY origami bird logo is blind-embossed into heavy cotton paper, catching warm directional sidelight that reveals the depth of the impression. The paper texture is visible at this magnification. Shallow DOF f/1.4, background shows soft bokeh of a luxury office. Tactile, premium, trustworthy.", videoPrompt: "Ultra macro of embossed ELEVAY business card being placed on marble — blind-embossed bird logo catching warm sidelight, heavy cotton paper texture visible, luxury office bokeh, premium craftsmanship, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Medium-wide shot of a luxury consultation room — warm walnut table with a single open portfolio showing passport pages with visa stamps from multiple countries. Warm afternoon light from floor-to-ceiling windows. The room exudes trust and expertise — leather chairs, brass accents, a globe on a side table. Fresh flowers in a ceramic vase. No people, 9:16 vertical, professional luxury.", videoPrompt: "Slow pan across luxury consultation room — walnut table with open passport portfolio, warm afternoon light through windows, leather chairs, brass accents, globe, professional trust and expertise, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Cinematic montage-style composition showing 6 iconic landmarks from ELEVAY's programs arranged in a golden spiral — Sagrada Familia, Santorini domes, Valletta harbour, Lisbon tram, Big Ben, and Canadian Rockies — each rendered as a warm golden silhouette against a deep navy background. The spiral converges on the ELEVAY bird at the center. 28 years of global expertise in one frame. 9:16 vertical, elegant, comprehensive.", videoPrompt: "Golden silhouettes of 6 iconic landmarks (Sagrada Familia, Santorini, Valletta, Lisbon, Big Ben, Rockies) arranged in golden spiral converging on ELEVAY bird, deep navy background, elegant comprehensive, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "ELEVAY origami bird logo in Deep Teal (#809CA1) materializing from converging golden light streams against warm cream background (#F8F5F0). The bird appears to be crafted from folded light itself. Soft warm directional lighting from upper left creates a subtle shadow. Museum-gallery atmosphere. The most refined and elegant brand close. 9:16 vertical.", videoPrompt: "ELEVAY origami bird in Deep Teal materializing from converging golden light streams against cream background, crafted from folded light, museum-gallery atmosphere, most refined brand close, 9:16 vertical, 3 seconds" },
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
      { day: DAYS[0], type: "Static Design + Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[1], type: "Static Design + Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[2], type: "Static Design + Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[3], type: "Static Design + Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
      { day: DAYS[4], type: "Static Design + Reel", topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}` },
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
      postsPerWeek: 10, // 5 static posts + 5 reels per week
      contentMix: [
        { name: "الإقامة الأوروبية (إسبانيا، البرتغال، اليونان، مالطا)", percentage: "60%", description: "برامج الإقامة الأوروبية مع التركيز على إسبانيا" },
        { name: "الجنسية الكاريبية", percentage: "15%", description: "عرض برامج الجنسية الكاريبية" },
        { name: "بريطانيا وكندا", percentage: "15%", description: "برامج الهجرة الماهرة والتوسع التجاري" },
        { name: "العلامة التجارية", percentage: "10%", description: "تعزيز مكانة ELEVAY" },
      ],
      targetAudience: "الأفراد ذوو الثروات العالية في منطقة الشرق الأوسط وشمال أفريقيا",
      tone: "احترافي، موثوق، ملهم — بأسلوب تحريري فاخر",
      visualStyle: "Clean Marketing Design v3 — bold photography, split layouts, clear typography, premium color palettes, direct program messaging",
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

/**
 * ELEVAY Marketing Content Templates
 * Brand System: Premium Global Mobility Advisory
 * Colors: Off-White #FFEBDA, Cream #FFE7D1, Baby Blue #5BA3B8, Light Teal #B3CFD4, Dark Navy #3D4750 (≤5%), Bright Gold #FFBF5D (≤5%)
 * Typography: Apex Sans Medium (headings), Apex Sans Book (body), sentence case only
 * Messaging Pillars: Family Security, Global Mobility, Long-term Planning, Premium Service, Ethical Advisory
 */

export interface PostTemplate {
  topic: string;
  caption: string; // Arabic MSA
  hashtags: string[];
  staticImagePrompt: string; // 1080×1350 or 1080×1080 detailed prompt
  reelScenes: Array<{ keyframePrompt: string; videoPrompt: string }>; // exactly 5 scenes
  voiceOverScript: string; // Arabic
  backgroundMusicSuggestion: string;
}

export interface ProgramTemplates {
  programName: string;
  country: string;
  posts: PostTemplate[];
}

// ─── BRAND CONSTANTS ─────────────────────────────────────────────────────────
const COLORS = {
  offWhite: "#FFEBDA",
  cream: "#FFE7D1",
  babyBlue: "#5BA3B8",
  lightTeal: "#B3CFD4",
  darkNavy: "#3D4750",
  brightGold: "#FFBF5D",
  pureWhite: "#FFFFFF",
};

const BRAND_BLOCK = `ELEVAY BRAND SYSTEM (non-negotiable):
- Colors: Off-White ${COLORS.offWhite} and Cream ${COLORS.cream} dominate 90% of design area. Baby Blue ${COLORS.babyBlue} for accents, icons, highlights. Light Teal ${COLORS.lightTeal} for borders/dividers. Dark Navy ${COLORS.darkNavy} capped at ≤5% (small headline text only). Bright Gold ${COLORS.brightGold} capped at ≤5% (single CTA element only). Pure White for text on dark elements.
- Typography: Apex Sans Medium for headings, Apex Sans Book for body. Sentence case only — never all-caps or title case. Generous whitespace.
- Shapes: 8–12px radius on cards/buttons, 16px on large panels, pill on badges. Editorial asymmetric layouts. Never sharp corners, never colored left-border accents.
- Logo: ELEVAY origami-bird mark in Baby Blue + Dark Navy, bottom-right corner, small, untouched — never recolored or stretched. 10px clear space minimum.
- Tagline: "Expanding your freedom" in Light Teal, sentence case, near logo.
- Photography: warm natural-light editorial — premium settings (elegant homes, Mediterranean architecture, European skylines). Subjects appear Arab/Middle Eastern in modern elegant clothing. Never stock-photo clichés, staged handshakes, passport imagery, or flag imagery.
- Shadows: soft warm-tinted (rgba 61,71,80), never harsh black. CTA gets subtle amber glow.`;

const ANTI_PATTERNS = `ABSOLUTELY AVOID:
- Sculptural objects, portals, or museum installations
- All-caps text or title case — sentence case only
- Dark Navy or Bright Gold as large fills/backgrounds/bands (≤5% each)
- Passport photos, flag imagery, visa stamps, travel documents
- Stock-photo clichés (handshakes, globe icons, airplane silhouettes)
- Split screens, photo collages, or tiled grids
- Canva-style templates or drag-and-drop aesthetic
- Sharp corners, colored left-border accents, basic geometric shapes as design elements
- On-screen text overlays in reels
- The word "Visa" — always use "Residency"
- Words: "Guaranteed," "Easy," "Instant," "Shortcut," "Broker"
- Phone numbers, URLs, QR codes inside the design`;

function buildStaticPrompt(
  headline: string,
  supportingCopy: string,
  visualComposition: string,
  colorBreakdown: string,
  format: "1080x1080" | "1080x1350" = "1080x1350"
): string {
  return `${BRAND_BLOCK}

FORMAT: ${format === "1080x1350" ? "1080×1350 (4:5 vertical reach format)" : "1080×1080 (square feed format)"}

HEADLINE (on-design, English, sentence case): "${headline}"
SUPPORTING COPY (on-design, English, 1 line): "${supportingCopy}"

VISUAL COMPOSITION:
${visualComposition}

COLOR USAGE BREAKDOWN:
${colorBreakdown}

LOGO PLACEMENT: ELEVAY origami-bird mark, bottom-right corner, Baby Blue + Dark Navy, small with 10px clear space.
CTA: Single Bright Gold element (button/tag shape) — "Book your consultation" or similar. ≤5% of design area.

${ANTI_PATTERNS}

FINAL GOAL: A premium, editorial marketing design that clearly communicates the program benefit. The design should look like a high-end advisory firm's social media post — clean, warm, trustworthy, and aspirational. Every element serves the message.`;
}

// ─── PROGRAM TEMPLATES ─────────────────────────────────────────────────────────

const SPAIN_DNV: ProgramTemplates = {
  programName: "Spain Digital Nomad Residency",
  country: "Spain",
  posts: [
    {
      topic: "Spain DNV: Work remotely from Europe's sunniest country",
      caption: "🌍 إسبانيا تفتح أبوابها للمحترفين الرقميين...\n\nإقامة الرحّال الرقمي تمنحك حق العيش والعمل في قلب أوروبا مع الحفاظ على عملك الحالي.\n\n✅ إقامة قانونية لك ولعائلتك\n✅ حرية التنقل في منطقة شنغن\n✅ نظام صحي وتعليمي عالمي\n\nخبرة 28 عاماً في خدمتك.\nاحجز استشارتك المجانية الآن 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#SpainDNV", "#DigitalNomad", "#إقامة_أوروبا", "#ExpandingYourFreedom", "#الرحال_الرقمي"],
      staticImagePrompt: buildStaticPrompt(
        "Work from anywhere, live in Spain",
        "Digital nomad residency for you and your family",
        `A warm editorial photograph occupying 60% of the canvas (left side, asymmetric crop): A professional Arab man in his 30s working on a laptop at a sunlit terrace café in a Spanish coastal town — Mediterranean blue sea visible in the background, terracotta buildings, bougainvillea climbing a wall. He wears a linen shirt, looks relaxed and focused. Natural golden-hour light. The right 40% of the canvas is a clean Off-White panel with the headline, supporting copy, and CTA arranged with generous whitespace. The layout is editorial and asymmetric — the photo bleeds to the edge on the left while text breathes on the right.`,
        `Background/surface: Off-White #FFEBDA (90% of right panel area)
Photo area: warm natural tones (60% of canvas)
Accent elements: Baby Blue #5BA3B8 — thin line separator, icon accents (5%)
Headline text: Dark Navy #3D4750 — small heading only (≤5%)
CTA button: Bright Gold #FFBF5D — single pill-shaped button (≤5%)
Border/divider: Light Teal #B3CFD4 — subtle line between photo and text`,
        "1080x1350"
      ),
      reelScenes: [
        { keyframePrompt: "Hook shot: Close-up of hands opening a sleek laptop on a marble café table — the background slowly reveals a stunning Spanish plaza with a fountain, warm morning light streaming through arched colonnades. The subject is a professional Arab man in smart-casual linen. Camera starts tight on the laptop screen (showing code/design work) then slowly pulls back to reveal the beautiful Spanish setting. 9:16 vertical, warm golden tones, cinematic shallow depth of field.", videoPrompt: "Close-up of hands on laptop at marble café table, camera slowly pulls back revealing Spanish plaza with fountain and arched colonnades, warm morning golden light, professional Arab man in linen shirt, shallow depth of field, cinematic, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: Wide establishing shot of a charming Spanish street — the subject walks confidently through a sun-dappled lane lined with orange trees and traditional tiled facades. He carries a leather messenger bag, passing local shops and a small bookstore. The architecture is distinctly Andalusian — white walls, wrought iron balconies, colorful ceramic tiles. Camera tracks smoothly alongside him at walking pace. Warm, lived-in, aspirational. 9:16 vertical.", videoPrompt: "Tracking shot of professional Arab man walking through sun-dappled Spanish street with orange trees, Andalusian white walls, wrought iron balconies, ceramic tiles, leather messenger bag, confident stride, warm natural light, cinematic tracking, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: Interior of a bright, modern co-working space with floor-to-ceiling windows overlooking a Spanish cityscape. The subject sits at a clean desk, video-calling colleagues on a large monitor. Other professionals work nearby. The space has warm wood, green plants, and natural light flooding in. The city below shows terracotta rooftops and church spires. This represents the professional infrastructure available. 9:16 vertical, bright and airy.", videoPrompt: "Interior of modern co-working space with floor-to-ceiling windows, Spanish cityscape below with terracotta rooftops, Arab professional on video call, bright natural light, warm wood and plants, other professionals working, airy atmosphere, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: Golden hour on a Mediterranean beach — the subject walks with his wife and two young children along the shoreline. The children run ahead laughing, the couple holds hands. Behind them, a Spanish coastal town glows in sunset light — white buildings cascading down a hillside to the sea. This is the family life that the residency enables — security, beauty, togetherness. Warm, emotional, aspirational. 9:16 vertical.", videoPrompt: "Golden hour Mediterranean beach, Arab family walking along shoreline — father, mother, two children running ahead laughing, Spanish coastal town glowing in sunset behind them, white buildings on hillside, warm emotional atmosphere, family togetherness, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation, no decoration. The bird mark in Baby Blue #5BA3B8 and Dark Navy #3D4750. Below it in Light Teal: 'Expanding your freedom' in Apex Sans Book, sentence case. 9:16 vertical, 3 seconds hold.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy colors, tagline 'Expanding your freedom' in Light Teal below, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "إسبانيا... حيث يلتقي العمل بالحياة. إقامة الرحّال الرقمي تمنحك حق الإقامة في قلب أوروبا مع حرية العمل لأي شركة حول العالم. ELEVAY يرافقك في كل خطوة.",
      backgroundMusicSuggestion: "Warm acoustic guitar with subtle Mediterranean influence, cinematic and contemplative, moderate tempo",
    },
    {
      topic: "Spain DNV: Your family deserves a European lifestyle",
      caption: "👨‍👩‍👧‍👦 عائلتك تستحق الأفضل...\n\nإسبانيا توفر لأبنائك تعليماً دولياً ورعاية صحية متقدمة في بيئة آمنة ومستقرة.\n\n🏫 مدارس دولية بمعايير عالمية\n🏥 نظام صحي من الأفضل في أوروبا\n☀️ 300 يوم مشمس سنوياً\n🛡️ من أكثر الدول أماناً في العالم\n\nاستثمر في مستقبل عائلتك اليوم.\nتواصل معنا 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#FamilyFirst", "#SpainLife", "#أمان_العائلة", "#ExpandingYourFreedom", "#تعليم_دولي"],
      staticImagePrompt: buildStaticPrompt(
        "Your family deserves a European future",
        "Education, healthcare, and safety in one destination",
        `A warm editorial photograph occupying the top 65% of the canvas: An Arab family (father, mother, daughter ~8, son ~5) walking through a beautiful European park in autumn — golden leaves on the ground, elegant stone pathways, a historic Spanish building visible in the background. The family is well-dressed in modern casual clothing, laughing together naturally. Warm afternoon light creates a golden glow. The bottom 35% is a clean Cream panel with headline, supporting copy, key benefit icons, and CTA. Layout is clean and editorial — photo on top with soft rounded bottom edge, text below with generous spacing.`,
        `Background/surface: Cream #FFE7D1 (bottom panel, 35%)
Photo area: warm natural autumn tones (top 65%)
Icon accents: Baby Blue #5BA3B8 — small benefit icons (education, health, safety)
Headline text: Dark Navy #3D4750 — sentence case heading (≤5%)
CTA button: Bright Gold #FFBF5D — pill button bottom-center (≤5%)
Subtle border: Light Teal #B3CFD4 — thin line above CTA`,
        "1080x1350"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: Close-up of a child's hand reaching for her father's hand — camera follows their clasped hands as they walk, then tilts up to reveal a beautiful Spanish school entrance with children in the courtyard. Warm morning light, the father is Arab in a smart blazer, the daughter wears a school uniform. The school building is elegant Mediterranean architecture with arched windows. 9:16 vertical, warm emotional tones.", videoPrompt: "Close-up of child's hand reaching for father's hand, camera tilts up revealing Spanish school entrance, Mediterranean architecture, warm morning light, Arab father in blazer, daughter in school uniform, emotional warmth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: Interior of a bright, modern classroom — diverse children including the daughter are engaged in a science experiment with a friendly teacher. Large windows show a Spanish garden outside. The classroom is well-equipped, colorful, and nurturing. Natural light floods in. This represents the quality of international education available. 9:16 vertical, bright and hopeful.", videoPrompt: "Bright modern classroom interior, diverse children doing science experiment, Arab girl engaged and smiling, friendly teacher, large windows showing Spanish garden, natural light, well-equipped space, hopeful atmosphere, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: A modern Spanish pediatric clinic — clean, bright, welcoming. An Arab mother sits with her young son who is being examined by a friendly doctor. The clinic has warm wood accents, plants, and children's artwork on walls. Through the window, a Spanish street with trees is visible. This represents accessible, high-quality healthcare. 9:16 vertical, reassuring and warm.", videoPrompt: "Modern Spanish pediatric clinic, bright and welcoming, Arab mother with young son being examined by friendly doctor, warm wood accents, plants, children's artwork, Spanish street visible through window, reassuring atmosphere, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: Weekend scene — the whole family cycling together along a Spanish coastal promenade at sunset. Palm trees line the path, the Mediterranean sparkles golden. The children ride ahead confidently, parents follow smiling. Other families enjoy the evening. This is everyday life — safe, beautiful, together. The ultimate emotional payoff. 9:16 vertical, golden warm tones.", videoPrompt: "Arab family cycling along Spanish coastal promenade at sunset, palm trees, Mediterranean sparkling golden, children riding ahead confidently, parents smiling behind, other families enjoying evening, safe beautiful everyday life, golden warm tones, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue #5BA3B8 and Dark Navy #3D4750. Tagline 'Expanding your freedom' in Light Teal below. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline below in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "عائلتك تستحق مستقبلاً أفضل. إسبانيا توفر تعليماً عالمياً ورعاية صحية متقدمة وأماناً لا مثيل له. مع ELEVAY، نبني معاً مستقبل أبنائك.",
      backgroundMusicSuggestion: "Gentle piano with warm strings, emotional and hopeful, family-oriented mood",
    },
  ],
};

const GREECE_GV: ProgramTemplates = {
  programName: "Greece Golden Visa",
  country: "Greece",
  posts: [
    {
      topic: "Greece Golden Visa: Invest in Mediterranean real estate",
      caption: "🏛️ اليونان... بوابتك إلى أوروبا عبر الاستثمار العقاري.\n\nالتأشيرة الذهبية اليونانية تمنحك إقامة دائمة مقابل استثمار عقاري يبدأ من 250,000 يورو.\n\n🏠 عائد إيجاري مرتفع\n🌊 جودة حياة استثنائية\n🇪🇺 حرية التنقل في شنغن\n👨‍👩‍👧 تشمل العائلة بالكامل\n\nاستثمر بذكاء مع ELEVAY.\nاحجز استشارتك الآن 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#GreeceGoldenVisa", "#إقامة_اليونان", "#استثمار_عقاري", "#ExpandingYourFreedom"],
      staticImagePrompt: buildStaticPrompt(
        "Invest in Greece, live across Europe",
        "Golden visa residency through premium real estate",
        `Editorial split layout — left 55% features a stunning photograph of a luxury Greek villa with an infinity pool overlooking the Aegean Sea at golden hour. White Cycladic architecture, deep blue water, bougainvillea cascading over a stone wall. The right 45% is a clean Off-White panel with the headline stacked vertically, a small investment highlight ("From €250,000"), and the CTA. The layout is asymmetric — the photo has a soft curved edge where it meets the text panel. Premium, aspirational, investment-focused.`,
        `Background/surface: Off-White #FFEBDA (right panel, 45%)
Photo area: Mediterranean blues and whites (left 55%)
Accent: Baby Blue #5BA3B8 — investment figure highlight, subtle icon
Headline: Dark Navy #3D4750 — sentence case (≤5%)
CTA: Bright Gold #FFBF5D — pill button (≤5%)
Divider: Light Teal #B3CFD4 — curved separator between photo and text`,
        "1080x1350"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: Drone shot descending toward a luxury Greek villa perched on a cliff — white Cycladic architecture with a stunning infinity pool, the deep blue Aegean Sea stretching to the horizon. Camera descends smoothly from above, revealing the scale and beauty of the property. Golden hour light, warm Mediterranean colors. This is the investment opportunity. 9:16 vertical, cinematic aerial.", videoPrompt: "Drone descending toward luxury Greek cliff villa, white Cycladic architecture, infinity pool, deep blue Aegean Sea, golden hour light, cinematic aerial reveal, Mediterranean warmth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: Interior of the villa — open-plan living space with floor-to-ceiling glass doors opening to a terrace with sea views. An Arab couple in elegant casual clothing examines the space appreciatively, touching the marble countertop, looking out at the view. The interior is minimalist luxury — white walls, warm wood, designer furniture. Natural light floods in. 9:16 vertical, aspirational.", videoPrompt: "Interior luxury Greek villa, open-plan with sea-view terrace through glass doors, Arab couple examining space appreciatively, marble countertop, minimalist luxury decor, warm wood and white walls, natural light, aspirational atmosphere, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: The couple walking through a charming Greek village — whitewashed buildings with blue doors, narrow cobblestone streets, a small taverna with outdoor seating. Local life happening around them — an elderly man tending flowers, a cat sleeping in the sun. The couple looks relaxed and at home. This represents the lifestyle that comes with the investment. 9:16 vertical, warm and authentic.", videoPrompt: "Arab couple walking through charming Greek village, whitewashed buildings with blue doors, cobblestone streets, small taverna, local life, elderly man with flowers, relaxed authentic atmosphere, warm natural light, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: Sunset on the villa terrace — the couple sits together on a designer outdoor sofa, overlooking the Aegean. Two wine glasses on the table, the sun setting in spectacular orange and pink. Their children play safely in the garden below. This is the life they've built — security, beauty, family, freedom. The most emotional shot. 9:16 vertical, golden warm.", videoPrompt: "Sunset on Greek villa terrace, Arab couple on outdoor sofa overlooking Aegean, wine glasses, spectacular orange-pink sunset, children playing in garden below, security and freedom, emotional golden warmth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue and Dark Navy. Tagline 'Expanding your freedom' in Light Teal. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "اليونان... حيث يلتقي الاستثمار الذكي بالحياة الجميلة. التأشيرة الذهبية تمنحك إقامة أوروبية دائمة مع عائد استثماري مميز. ELEVAY يفتح لك الباب.",
      backgroundMusicSuggestion: "Ambient Mediterranean strings with subtle bouzouki influence, warm and sophisticated, moderate tempo",
    },
  ],
};

const MALTA_PR: ProgramTemplates = {
  programName: "Malta Permanent Residency",
  country: "Malta",
  posts: [
    {
      topic: "Malta PR: European permanent residency in the Mediterranean",
      caption: "🇲🇹 مالطا... جزيرة الفرص في قلب المتوسط.\n\nبرنامج الإقامة الدائمة في مالطا يمنحك وعائلتك حق الإقامة في دولة أوروبية مستقرة.\n\n🏝️ مناخ معتدل طوال العام\n🏦 بيئة أعمال متطورة\n🗣️ اللغة الإنجليزية رسمية\n👨‍👩‍👧‍👦 تشمل العائلة بالكامل\n\nمع ELEVAY، طريقك واضح.\nتواصل معنا اليوم 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#MaltaPR", "#إقامة_مالطا", "#أوروبا", "#ExpandingYourFreedom"],
      staticImagePrompt: buildStaticPrompt(
        "Permanent residency on a Mediterranean island",
        "Malta offers stability, English language, and EU access",
        `Full-bleed editorial photograph as background (slightly dimmed with warm Off-White overlay on the right third): Valletta harbor at golden hour — honey-colored limestone buildings, traditional Maltese balconies in green and red, the Grand Harbour with boats, warm Mediterranean light. The right third of the canvas has a semi-transparent Off-White overlay panel with the headline, key benefits as small text lines, and CTA. The design feels like a premium travel magazine editorial — the city is the hero, the message is clear and minimal on the overlay.`,
        `Background photo: warm honey/limestone tones of Valletta (60% visible)
Overlay panel: Off-White #FFEBDA at 90% opacity (right third)
Accent: Baby Blue #5BA3B8 — benefit bullet markers
Headline: Dark Navy #3D4750 — sentence case on overlay (≤5%)
CTA: Bright Gold #FFBF5D — pill button on overlay (≤5%)
Border: Light Teal #B3CFD4 — subtle panel edge`,
        "1080x1080"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: Aerial shot of Valletta from the sea — the camera approaches the fortified city walls from the water, revealing the honey-colored limestone buildings stacked dramatically on the peninsula. Morning light catches the traditional Maltese balconies. The Grand Harbour is alive with boats. Camera moves forward smoothly as if arriving by yacht. 9:16 vertical, cinematic approach.", videoPrompt: "Aerial approach to Valletta from sea, fortified limestone walls, honey-colored buildings on peninsula, morning light on Maltese balconies, Grand Harbour with boats, smooth forward movement as if from yacht, cinematic, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: Street-level in Valletta — an Arab businessman in a tailored suit walks through a historic limestone corridor, emerging into a sunlit piazza with a baroque church. He checks his phone, confident and purposeful. The architecture is stunning — carved stone, ornate balconies, warm light. This represents the business environment. 9:16 vertical, professional and warm.", videoPrompt: "Arab businessman in tailored suit walking through Valletta limestone corridor, emerging into sunlit piazza with baroque church, checking phone confidently, carved stone architecture, ornate balconies, warm professional atmosphere, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: Modern office interior in Malta — glass and steel with views of the Mediterranean. The businessman in a meeting with diverse colleagues around a sleek table. Laptops open, productive atmosphere. Through the window, the blue sea and a distant island are visible. English signage on the wall. This represents Malta's business-friendly, English-speaking environment. 9:16 vertical, bright and professional.", videoPrompt: "Modern Malta office interior, glass walls with Mediterranean sea views, Arab businessman in meeting with diverse colleagues, sleek table with laptops, productive atmosphere, distant island through window, English signage, professional, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: Weekend scene — the businessman now in casual clothes with his family on a traditional Maltese fishing boat (luzzu) painted in bright colors. His wife and children laugh as they cruise along the coast, passing Blue Grotto caves with impossibly blue water. The family is together, relaxed, enjoying their Mediterranean life. Warm golden afternoon light. 9:16 vertical, joyful.", videoPrompt: "Arab family on colorful traditional Maltese luzzu boat, cruising along coast past Blue Grotto caves, impossibly blue water, father in casual clothes with wife and laughing children, warm golden afternoon light, joyful Mediterranean family life, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue and Dark Navy. Tagline 'Expanding your freedom' in Light Teal. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "مالطا... جزيرة الاستقرار والفرص. إقامة دائمة في قلب أوروبا بلغة إنجليزية وبيئة أعمال عالمية. ELEVAY يرسم لك الطريق.",
      backgroundMusicSuggestion: "Sophisticated jazz-influenced ambient, warm brass undertones, Mediterranean elegance, moderate tempo",
    },
  ],
};

const PORTUGAL_D7: ProgramTemplates = {
  programName: "Portugal D7 Residency",
  country: "Portugal",
  posts: [
    {
      topic: "Portugal D7: Passive income residency in Western Europe",
      caption: "🇵🇹 البرتغال... وجهة المستثمرين الأذكياء.\n\nتأشيرة D7 تمنحك إقامة في البرتغال بناءً على دخلك السلبي — بدون استثمار عقاري إلزامي.\n\n💰 لا حاجة لاستثمار كبير\n🌍 طريق للجنسية الأوروبية\n🏖️ جودة حياة استثنائية\n👨‍👩‍👧 تشمل العائلة\n\nمع ELEVAY، نختار لك المسار الأنسب.\nاحجز استشارتك 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#PortugalD7", "#إقامة_البرتغال", "#الدخل_السلبي", "#ExpandingYourFreedom"],
      staticImagePrompt: buildStaticPrompt(
        "Live in Portugal through passive income",
        "No large investment required — residency through existing income",
        `Clean editorial layout — the canvas is divided asymmetrically: a large photograph (70% of canvas, positioned top-left with a soft diagonal crop) shows a stunning view of Lisbon's Alfama district at golden hour — colorful tiled buildings cascading down a hill, a traditional yellow tram, the Tagus River glittering in the distance. The bottom-right corner (30%) is a clean Cream panel with the headline, a subtle income icon in Baby Blue, and the CTA. The diagonal crop creates visual interest and movement.`,
        `Background/surface: Cream #FFE7D1 (bottom-right panel)
Photo area: warm Lisbon tones — terracotta, yellow, blue tiles (70%)
Accent: Baby Blue #5BA3B8 — income/passive icon, subtle underline
Headline: Dark Navy #3D4750 — sentence case (≤5%)
CTA: Bright Gold #FFBF5D — pill button (≤5%)
Diagonal edge: Light Teal #B3CFD4 — soft separator line`,
        "1080x1350"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: A traditional yellow Lisbon tram rounds a corner on a narrow cobblestone street — camera is positioned low, looking up as the iconic tram passes by revealing a stunning view of colorful tiled buildings and the Tagus River beyond. Morning light, warm golden tones. The shot is cinematic and immediately recognizable as Lisbon. 9:16 vertical, dynamic perspective.", videoPrompt: "Low-angle shot of yellow Lisbon tram rounding corner on cobblestone street, revealing colorful tiled buildings and Tagus River, morning golden light, cinematic dynamic perspective, iconic Lisbon, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: An Arab couple in their 40s walking through a Lisbon miradouro (viewpoint) — they lean on the railing together, looking out over the city's terracotta rooftops stretching to the river. She points at something in the distance, he smiles. They're dressed elegantly casual. Other visitors enjoy the view nearby. The scene feels like they're discovering their future home. 9:16 vertical, warm and intimate.", videoPrompt: "Arab couple at Lisbon miradouro viewpoint, leaning on railing overlooking terracotta rooftops and river, she points, he smiles, elegantly casual, other visitors nearby, discovering future home feeling, warm intimate, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: Interior of a charming Portuguese apartment — high ceilings with ornate moldings, large windows with shutters open to a Lisbon street view. The couple sits at a breakfast table with Portuguese pastéis de nata and coffee. Laptop open showing financial charts (representing passive income). The apartment is beautifully renovated — traditional tiles meet modern furniture. 9:16 vertical, lifestyle aspiration.", videoPrompt: "Charming Portuguese apartment interior, high ceilings with ornate moldings, large windows open to Lisbon street, Arab couple at breakfast with pastéis de nata, laptop showing financial charts, traditional tiles meet modern furniture, lifestyle aspiration, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: Sunset at a Portuguese beach — the couple walks barefoot along the golden sand of the Algarve coast. Dramatic cliff formations frame the scene, the Atlantic Ocean glows orange and pink. They hold hands, completely at peace. In the distance, their children build a sandcastle. This is the life that passive income residency enables. 9:16 vertical, breathtaking.", videoPrompt: "Sunset at Algarve beach, Arab couple walking barefoot on golden sand, dramatic cliff formations, Atlantic glowing orange-pink, holding hands at peace, children building sandcastle in distance, breathtaking emotional payoff, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue and Dark Navy. Tagline 'Expanding your freedom' in Light Teal. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "البرتغال... إقامة أوروبية من خلال دخلك الحالي. لا حاجة لاستثمار كبير — فقط دخل سلبي مستقر. ELEVAY يفتح لك أبواب أوروبا.",
      backgroundMusicSuggestion: "Gentle fado-inspired acoustic guitar, warm and melancholic beauty, sophisticated, slow tempo",
    },
  ],
};

const DOMINICA: ProgramTemplates = {
  programName: "Dominica Citizenship by Investment",
  country: "Dominica",
  posts: [
    {
      topic: "Dominica CBI: Second citizenship in 3-4 months",
      caption: "🌴 جنسية ثانية في أقل من 4 أشهر...\n\nبرنامج جنسية دومينيكا يمنحك جواز سفر قوي مع حرية التنقل لأكثر من 140 دولة.\n\n⏱️ معالجة سريعة (3-4 أشهر)\n🌍 سفر بدون تأشيرة لـ 140+ دولة\n💼 لا شرط إقامة\n👨‍👩‍👧‍👦 تشمل العائلة بالكامل\n\nخطة B لعائلتك تبدأ اليوم.\nتواصل مع ELEVAY 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#DominicaCBI", "#جنسية_ثانية", "#الكاريبي", "#ExpandingYourFreedom", "#PlanB"],
      staticImagePrompt: buildStaticPrompt(
        "A second citizenship for your family's security",
        "Dominica citizenship in 3-4 months — visa-free to 140+ countries",
        `Clean editorial design with a top photograph (55% of canvas): An aerial view of Dominica's lush tropical coastline — emerald green mountains meeting turquoise Caribbean waters, a pristine beach, tropical vegetation. The photograph is vibrant but not oversaturated — natural editorial quality. The bottom 45% is a clean Off-White panel with the headline centered, key stats arranged in a clean row (timeline, countries, family), and CTA. The layout emphasizes speed and security — clean, decisive, premium.`,
        `Background/surface: Off-White #FFEBDA (bottom panel, 45%)
Photo area: natural Caribbean greens and blues (top 55%)
Stats accent: Baby Blue #5BA3B8 — number highlights and icons
Headline: Dark Navy #3D4750 — sentence case (≤5%)
CTA: Bright Gold #FFBF5D — pill button (≤5%)
Divider: Light Teal #B3CFD4 — thin line between photo and text`,
        "1080x1080"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: Dramatic aerial shot sweeping over Dominica's coastline — lush emerald mountains plunging into crystal-clear turquoise Caribbean waters. A waterfall cascades down a cliff into the sea. The camera moves forward dynamically, revealing the island's untouched natural beauty. Morning light, vivid natural colors. This is the 'Nature Isle of the Caribbean.' 9:16 vertical, breathtaking aerial.", videoPrompt: "Dramatic aerial sweep over Dominica coastline, emerald mountains meeting turquoise Caribbean waters, waterfall cascading into sea, dynamic forward camera movement, untouched natural beauty, morning light, vivid colors, breathtaking, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: An Arab businessman in a modern office — he signs documents at an elegant desk, then stands and looks out a floor-to-ceiling window at a city skyline. The scene represents the simplicity of the application process — professional, decisive, efficient. Clean modern interior, warm natural light. He looks confident and purposeful. 9:16 vertical, professional.", videoPrompt: "Arab businessman signing documents at elegant desk in modern office, stands and looks out floor-to-ceiling window at city skyline, professional decisive efficient, clean modern interior, warm natural light, confident purposeful, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: Airport departure scene — the businessman walks confidently through an international terminal, passport in hand. Departure boards show destinations: London, Paris, Dubai, Singapore. He moves through priority lanes effortlessly. The scene represents global mobility and freedom of movement. Modern architecture, bright and airy. 9:16 vertical, dynamic.", videoPrompt: "Arab businessman walking confidently through international airport terminal, passport in hand, departure boards showing London Paris Dubai Singapore, priority lanes, global mobility freedom, modern bright architecture, dynamic movement, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: The businessman arrives home — his family (wife and two children) greets him at the door of their elegant home. Group embrace, genuine joy. The home is warm and luxurious — modern Middle Eastern-influenced decor. Through the window, a garden is visible. This represents the security he's built for his family — a Plan B, peace of mind, freedom. 9:16 vertical, emotional warmth.", videoPrompt: "Arab businessman arriving home, family greeting at door of elegant home, group embrace genuine joy, warm luxurious interior with Middle Eastern decor, garden through window, family security Plan B, emotional warmth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue and Dark Navy. Tagline 'Expanding your freedom' in Light Teal. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "جنسية ثانية لعائلتك... خطة أمان في عالم متغير. دومينيكا تمنحك جواز سفر قوي في أقل من أربعة أشهر. ELEVAY يحمي مستقبلك.",
      backgroundMusicSuggestion: "Cinematic orchestral with subtle Caribbean warmth, confident and decisive, building momentum",
    },
  ],
};

const UK_EXPANSION: ProgramTemplates = {
  programName: "UK Expansion Worker",
  country: "United Kingdom",
  posts: [
    {
      topic: "UK Expansion Worker: Expand your business to Britain",
      caption: "🇬🇧 بريطانيا... سوق بمليارات الفرص.\n\nبرنامج عامل التوسع يمنحك إقامة في المملكة المتحدة لتوسيع أعمالك في السوق البريطاني.\n\n🏢 وصول لأكبر سوق في أوروبا\n📈 بيئة أعمال عالمية\n🎓 تعليم بريطاني لأبنائك\n💼 لا حاجة لاستثمار مالي كبير\n\nوسّع أعمالك مع ELEVAY.\nاحجز استشارتك 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#UKExpansion", "#بريطانيا", "#توسع_الأعمال", "#ExpandingYourFreedom"],
      staticImagePrompt: buildStaticPrompt(
        "Expand your business to the United Kingdom",
        "UK residency through business expansion — no large investment needed",
        `Editorial asymmetric layout — a large photograph (left 60%, full height) shows the London skyline at blue hour from across the Thames — The Shard, Tower Bridge, and the City's modern towers illuminated warmly against a deep blue sky. The photograph is premium and dramatic. The right 40% is a clean Cream panel with the headline, a subtle business growth icon in Baby Blue, key benefit text, and CTA. The composition is bold and aspirational — London as the ultimate business destination.`,
        `Background/surface: Cream #FFE7D1 (right panel, 40%)
Photo area: London blue-hour tones — deep blue, warm amber lights (60%)
Icon accent: Baby Blue #5BA3B8 — business growth icon, subtle elements
Headline: Dark Navy #3D4750 — sentence case (≤5%)
CTA: Bright Gold #FFBF5D — pill button (≤5%)
Border: Light Teal #B3CFD4 — vertical separator`,
        "1080x1350"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: Cinematic shot of London at dawn — camera moves through the empty City of London financial district, past glass towers reflecting the pink-orange sunrise. The streets are clean and quiet, ready for business. Camera moves smoothly at street level, looking up at the impressive architecture. The Gherkin and other iconic buildings frame the shot. 9:16 vertical, dramatic dawn.", videoPrompt: "Cinematic street-level shot through London financial district at dawn, glass towers reflecting pink-orange sunrise, empty clean streets, looking up at impressive architecture, Gherkin and iconic buildings, smooth camera movement, dramatic dawn, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: An Arab entrepreneur in a sharp suit exits a black cab in front of a prestigious London office building. He looks up at the building confidently — this is his new UK office. The building has a brass nameplate and elegant entrance. Red double-decker buses pass in the background. The scene represents arrival and establishment in the UK market. 9:16 vertical, professional confidence.", videoPrompt: "Arab entrepreneur in sharp suit exiting black cab in front of prestigious London office building, looking up confidently, brass nameplate elegant entrance, red double-decker buses in background, arrival and establishment, professional confidence, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: Modern London boardroom — the entrepreneur presents to a diverse team of British professionals. Large screen shows growth charts. Floor-to-ceiling windows reveal the Thames and London Eye. The atmosphere is collaborative and successful. Everyone is engaged and positive. This represents the business opportunity and professional network. 9:16 vertical, success.", videoPrompt: "Modern London boardroom, Arab entrepreneur presenting to diverse British professionals, growth charts on screen, Thames and London Eye through windows, collaborative successful atmosphere, engaged positive team, business opportunity, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: Weekend in London — the entrepreneur walks with his family through Hyde Park in autumn. Golden leaves, his children feed ducks at the Serpentine. His wife photographs the scene on her phone, smiling. In the background, Kensington Palace is visible. This is the life balance — world-class business and world-class family life in one city. 9:16 vertical, golden autumn warmth.", videoPrompt: "Arab family in Hyde Park autumn, golden leaves, children feeding ducks at Serpentine, wife photographing smiling, Kensington Palace in background, entrepreneur relaxed with family, life balance, world-class city, golden autumn warmth, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue and Dark Navy. Tagline 'Expanding your freedom' in Light Teal. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "بريطانيا... سوق بلا حدود. برنامج عامل التوسع يفتح لك أبواب المملكة المتحدة لتنمية أعمالك. ELEVAY شريكك في النجاح.",
      backgroundMusicSuggestion: "Sophisticated modern orchestral, confident and forward-moving, British elegance, building energy",
    },
  ],
};

const CANADA_SM: ProgramTemplates = {
  programName: "Canada Skilled Migration",
  country: "Canada",
  posts: [
    {
      topic: "Canada Skilled Migration: Build your future in North America",
      caption: "🍁 كندا... أرض الفرص والتنوع.\n\nبرنامج الهجرة الماهرة يمنحك إقامة دائمة في كندا بناءً على مؤهلاتك وخبراتك المهنية.\n\n🎓 اعتراف بالمؤهلات الدولية\n💼 سوق عمل متنوع ومتقدم\n🏥 رعاية صحية شاملة\n🌍 من أفضل دول العالم للعيش\n\nمع ELEVAY، نرسم لك خارطة الطريق.\nتواصل معنا 👇\n\n*تخضع الموافقة للجهات الحكومية المختصة",
      hashtags: ["#ELEVAY", "#CanadaImmigration", "#كندا", "#الهجرة_الماهرة", "#ExpandingYourFreedom"],
      staticImagePrompt: buildStaticPrompt(
        "Build your career in one of the world's best countries",
        "Canada skilled migration — residency through your qualifications",
        `Clean editorial design — top 60% features a stunning photograph of the Toronto skyline reflected in Lake Ontario at golden hour, with the CN Tower prominent. The image is warm and aspirational — modern city, natural beauty, opportunity. The bottom 40% is an Off-White panel with the headline, a row of small benefit icons (graduation cap, briefcase, heart, globe) in Baby Blue, and the CTA. The layout is clean and optimistic — Canada as the land of professional opportunity.`,
        `Background/surface: Off-White #FFEBDA (bottom panel, 40%)
Photo area: warm Toronto skyline tones — blue water, golden light (60%)
Icons: Baby Blue #5BA3B8 — small benefit icons in a row
Headline: Dark Navy #3D4750 — sentence case (≤5%)
CTA: Bright Gold #FFBF5D — pill button (≤5%)
Separator: Light Teal #B3CFD4 — thin line between photo and text`,
        "1080x1350"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: Aerial shot of Toronto at sunrise — the CN Tower catches the first golden light, the city stretches out below with Lake Ontario shimmering. Camera slowly orbits the tower, revealing the scale of the city — modern, diverse, full of opportunity. The skyline is a mix of glass towers and green spaces. 9:16 vertical, majestic sunrise.", videoPrompt: "Aerial shot of Toronto at sunrise, CN Tower catching golden light, city stretching below, Lake Ontario shimmering, slow orbit revealing scale, modern diverse city, glass towers and green spaces, majestic sunrise, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: An Arab professional woman in a modern tech office — she leads a standup meeting with a diverse team. The office is bright, open-plan, with exposed brick and plants. Everyone is engaged and collaborative. Through the windows, a Canadian street with autumn trees is visible. This represents the inclusive, meritocratic work culture. 9:16 vertical, bright and inclusive.", videoPrompt: "Arab professional woman leading standup meeting in modern tech office, diverse engaged team, bright open-plan with exposed brick and plants, Canadian autumn street through windows, inclusive meritocratic culture, bright and collaborative, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: The woman at a graduation ceremony — she receives a Canadian professional certification, shaking hands with a dean. Her family watches proudly from the audience. The venue is a grand Canadian university hall with wood paneling and stained glass. This represents recognition of skills and professional advancement. 9:16 vertical, achievement.", videoPrompt: "Arab woman at graduation ceremony receiving Canadian professional certification, shaking hands with dean, family watching proudly, grand university hall with wood paneling and stained glass, recognition and achievement, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: Winter scene — the woman and her family ice skating on a frozen lake in a Canadian park. Snow-covered pine trees surround them, the sky is clear blue. Her children skate ahead laughing, her husband holds her hand. They're bundled in warm coats, breath visible in the cold air. Pure joy and belonging. This is home now. 9:16 vertical, magical winter.", videoPrompt: "Arab family ice skating on frozen Canadian lake, snow-covered pine trees, clear blue sky, children skating ahead laughing, couple holding hands, warm coats, breath in cold air, pure joy and belonging, magical winter scene, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue and Dark Navy. Tagline 'Expanding your freedom' in Light Teal. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "كندا... حيث تُقدَّر مهاراتك وتُبنى أحلامك. الهجرة الماهرة تفتح لك أبواب أفضل دول العالم للعيش والعمل. ELEVAY يرافقك في الرحلة.",
      backgroundMusicSuggestion: "Uplifting modern orchestral with piano, hopeful and forward-looking, building warmth, moderate tempo",
    },
  ],
};

const ELEVAY_BRAND: ProgramTemplates = {
  programName: "ELEVAY Brand",
  country: "Global",
  posts: [
    {
      topic: "ELEVAY: 28 years of expanding freedom",
      caption: "🌍 28 عاماً من التميز في خدمة عملائنا...\n\nمنذ 1998، ساعدنا آلاف العائلات في بناء مستقبل أفضل عبر برامج الإقامة والجنسية حول العالم.\n\n✨ خبرة 28 عاماً\n🌐 برامج في أكثر من 15 دولة\n👨‍👩‍👧‍👦 آلاف العائلات السعيدة\n🏆 نسبة نجاح استثنائية\n\nELEVAY... نوسّع حريتك.\nتواصل معنا اليوم 👇",
      hashtags: ["#ELEVAY", "#ExpandingYourFreedom", "#28Years", "#GlobalMobility", "#إيليفاي"],
      staticImagePrompt: buildStaticPrompt(
        "28 years of expanding your freedom",
        "Trusted by thousands of families worldwide since 1998",
        `Elegant brand-focused design — the canvas is predominantly Off-White with a subtle warm gradient to Cream at the bottom. Center-stage is a premium editorial photograph (contained in a soft rounded rectangle, 50% of canvas): A diverse group of successful Arab professionals and families in an elegant modern lobby — marble floors, warm lighting, green plants. They represent ELEVAY's client base — confident, successful, global. The headline sits above the photo in Dark Navy, the tagline below in Light Teal. Key stats (28 years, 15+ countries, thousands of families) are arranged in a clean row below using Baby Blue accents. The overall feel is institutional, trustworthy, premium.`,
        `Background: Off-White #FFEBDA gradient to Cream #FFE7D1 (90%)
Photo container: soft rounded rectangle with Light Teal #B3CFD4 border
Stats accents: Baby Blue #5BA3B8 — numbers and icons
Headline: Dark Navy #3D4750 — sentence case above photo (≤5%)
Tagline: Light Teal #B3CFD4 — "Expanding your freedom"
CTA: Bright Gold #FFBF5D — pill button at bottom (≤5%)`,
        "1080x1080"
      ),
      reelScenes: [
        { keyframePrompt: "Hook: Cinematic montage opening — quick cuts of iconic destinations: Spanish terrace at sunset, Greek island from above, London skyline, Canadian mountains, Caribbean turquoise water. Each shot lasts 1 second, connected by smooth warm transitions. The montage establishes ELEVAY's global reach. All shots are premium, editorial quality, warm color grading. 9:16 vertical, dynamic montage.", videoPrompt: "Quick cinematic montage of iconic destinations — Spanish terrace sunset, Greek island aerial, London skyline, Canadian mountains, Caribbean turquoise water, 1-second cuts with smooth warm transitions, premium editorial quality, global reach, dynamic, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Continuation: A warm, elegant ELEVAY office — modern Middle Eastern-influenced design with warm wood, marble, and Baby Blue accents. A senior consultant (Arab man, 50s, distinguished) welcomes a young family into his office with a warm handshake. The office has world maps, framed certificates, and family photos of successful clients. Professional, trustworthy, established. 9:16 vertical, warm professional.", videoPrompt: "Elegant ELEVAY office, modern Middle Eastern design, warm wood and marble, Baby Blue accents, senior Arab consultant welcoming young family with warm handshake, world maps and certificates on walls, professional trustworthy established, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Benefit visual: Split-moment montage — three quick scenes showing different ELEVAY success stories: (1) A family receiving keys to their new European home, (2) A businessman boarding a private jet with his new passport, (3) Children in school uniforms running into an international school. Each scene is warm, joyful, and represents a different benefit. 9:16 vertical, success stories.", videoPrompt: "Split-moment montage of ELEVAY success stories — family receiving European home keys, businessman boarding private jet with passport, children running into international school, each warm and joyful, different benefits represented, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Emotional payoff: The senior consultant stands at his office window at sunset, looking out at a city skyline. On his desk, a framed photo shows him 28 years younger at the company's founding. The camera slowly pushes in on his satisfied expression — decades of helping families find freedom. Warm golden sunset light fills the room. Legacy, trust, purpose. 9:16 vertical, reflective.", videoPrompt: "Senior consultant at office window at sunset, city skyline view, framed photo of younger self at company founding on desk, camera slowly pushing in on satisfied expression, warm golden sunset light, legacy trust purpose, reflective emotional, 9:16 vertical, 5 seconds" },
        { keyframePrompt: "Logo outro: ELEVAY origami-bird logo centered on pure white background. Static, clean, no animation. Baby Blue and Dark Navy. Tagline 'Expanding your freedom' in Light Teal. 9:16 vertical, 3 seconds.", videoPrompt: "Static ELEVAY origami-bird logo centered on pure white background, Baby Blue and Dark Navy, tagline in Light Teal, clean minimal, no animation, 9:16 vertical, 3 seconds" },
      ],
      voiceOverScript: "ELEVAY... منذ 1998 نوسّع حريتك. 28 عاماً من الخبرة في خدمة آلاف العائلات حول العالم. نحن لا نبيع تأشيرات — نبني مستقبلاً.",
      backgroundMusicSuggestion: "Elegant orchestral with warm piano, institutional and prestigious, building to emotional crescendo, sophisticated",
    },
  ],
};

// ─── EXPORTED TEMPLATES MAP ─────────────────────────────────────────────────────
export const PROGRAM_TEMPLATES: Record<string, ProgramTemplates> = {
  "Spain DNV": SPAIN_DNV,
  "Greece Golden Visa": GREECE_GV,
  "Malta PR": MALTA_PR,
  "Portugal D7": PORTUGAL_D7,
  "Dominica": DOMINICA,
  "UK Expansion Worker": UK_EXPANSION,
  "Canada Skilled Migration": CANADA_SM,
  "ELEVAY Brand": ELEVAY_BRAND,
};

// ─── MESSAGING PILLARS ─────────────────────────────────────────────────────────
const MESSAGING_PILLARS = ["Family Security", "Global Mobility", "Long-term Planning", "Premium Service", "Ethical Advisory"];

// ─── PLAN GENERATION ─────────────────────────────────────────────────────────
export function generatePlanRuleBased(opts: { startDate: Date | string; programs?: string[]; contentRatio?: string; pillarFocus?: string }) {
  const start = typeof opts.startDate === "string" ? new Date(opts.startDate) : opts.startDate;
  const programs = opts.programs || ["Spain DNV", "Dominica", "Greece Golden Visa", "Malta PR", "Portugal D7", "UK Expansion Worker", "Canada Skilled Migration"];

  const WEEK_PROGRAMS = programs.length >= 7
    ? programs
    : [...programs, ...programs, ...programs].slice(0, 12);

  const months: Array<{
    monthLabel: string;
    weeks: Array<{
      weekNumber: number;
      startDate: string;
      endDate: string;
      focus: string;
      messagingPillar: string;
      posts: Array<{ day: string; type: string; topic: string; pillar: string; caption: string; hashtags: string[] }>;
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
    const pillar = MESSAGING_PILLARS[w % MESSAGING_PILLARS.length];
    const tpl = PROGRAM_TEMPLATES[program] || ELEVAY_BRAND;
    const post = tpl.posts[w % tpl.posts.length];
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

    const posts = DAYS.map((day, idx) => ({
      day,
      type: "Static Design + Reel",
      topic: `${program}: ${post.topic.split(":")[1]?.trim() || post.topic}`,
      pillar: MESSAGING_PILLARS[(w * 5 + idx) % MESSAGING_PILLARS.length],
      caption: post.caption,
      hashtags: post.hashtags,
    }));

    months[months.length - 1].weeks.push({
      weekNumber: w + 1,
      startDate: ws.toISOString().split("T")[0],
      endDate: we.toISOString().split("T")[0],
      focus: `${program} — ${pillar}`,
      messagingPillar: pillar,
      posts,
    });
  }

  return {
    planTitle: `ELEVAY 12-Week Content Plan`,
    generatedAt: new Date().toISOString(),
    totalWeeks: 12,
    postsPerWeek: 10,
    breakdown: "5 Static Designs + 5 Reels per week (one of each per day, Sun–Thu)",
    brandSystem: "ELEVAY Premium Global Mobility Advisory",
    colorPalette: COLORS,
    months,
  };
}

// ─── MEDIA PROMPT GENERATION ─────────────────────────────────────────────────────
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

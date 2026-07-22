/**
 * ELEVAY Marketing Content Templates
 * Rule-based engine — zero LLM calls required.
 * Each program has multiple topic/caption/prompt sets that rotate across weeks.
 */

export interface PostTemplate {
  topic: string;
  caption: string; // Arabic
  hashtags: string[];
  staticImagePrompt: string; // 1:1 square
  reelScenes: Array<{ keyframePrompt: string; videoPrompt: string }>; // exactly 5
  voiceOverScript: string; // Arabic
  backgroundMusicSuggestion: string;
}

export interface ProgramTemplates {
  programName: string;
  country: string;
  posts: PostTemplate[];
}

// ─── HASHTAG LIBRARY ──────────────────────────────────────────────────────────
export const HASHTAG_LIBRARY = {
  brand: ["#ELEVAY", "#ELEVAYGlobal", "#ELEVAYConsultancy", "#CitizenshipByInvestment", "#ResidencyByInvestment"],
  residency: ["#Residency", "#EUResidency", "#DigitalNomad", "#GlobalResidency", "#ResidencyVisa"],
  citizenship: ["#SecondPassport", "#Citizenship", "#CaribbeanCitizenship", "#GlobalCitizen", "#PassportFreedom"],
  arabic: ["#الإقامة_الأوروبية", "#الجنسية_عن_طريق_الاستثمار", "#إيليفاي", "#الهجرة_الاستثمارية", "#جواز_سفر_ثاني"],
};

// ─── PROGRAM TEMPLATES ────────────────────────────────────────────────────────

const SPAIN_DNV: ProgramTemplates = {
  programName: "Spain DNV",
  country: "Spain",
  posts: [
    {
      topic: "Spain DNV: بوابة أوروبا الرقمية",
      caption: "🇪🇸 إسبانيا تفتح أبوابها للعمل الحر والرقمي!\n\nتأشيرة الرحّال الرقمي الإسبانية تمنحك الإقامة القانونية في قلب أوروبا، مع حرية العمل لأي شركة حول العالم.\n\n✅ إقامة قانونية في إسبانيا\n✅ الوصول إلى منطقة شنغن\n✅ مناخ معتدل وجودة حياة استثنائية\n\nتواصل مع ELEVAY اليوم واحجز استشارتك المجانية 🌍",
      hashtags: ["#SpainDNV", "#إسبانيا", "#الرحّال_الرقمي", "#إقامة_أوروبا", "#ELEVAY", "#جواز_سفر_أوروبي"],
      staticImagePrompt: "Elegant 1:1 square social media post for Spain Digital Nomad Visa. Full-bleed Barcelona skyline at golden hour with Sagrada Familia. Floating editorial text 'Spain Digital Nomad Visa' in bold white (#FFFFFF) typography integrated into the image with no banner or box. Baby blue (#B3CFD4) and sage (#CCDBD5) color grade overlay at 15% opacity. No people. Ultra premium cinematic quality. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Aerial drone shot of Barcelona coastline at sunrise, Mediterranean Sea, golden light, cinematic 9:16 vertical", videoPrompt: "Slow aerial pan over Barcelona coastline at sunrise, Mediterranean blue sea, golden hour light" },
        { keyframePrompt: "Narrow cobblestone street in Gothic Quarter Barcelona, warm afternoon light, 9:16 vertical cinematic", videoPrompt: "Walking through Barcelona Gothic Quarter, warm sunlight filtering through narrow streets" },
        { keyframePrompt: "Sagrada Familia exterior at dusk, dramatic sky, 9:16 vertical portrait, no people", videoPrompt: "Dramatic reveal of Sagrada Familia at dusk, purple and orange sky" },
        { keyframePrompt: "Spanish countryside vineyard at sunset, rolling hills, 9:16 vertical cinematic", videoPrompt: "Sweeping drone shot over Spanish vineyard at sunset, golden fields" },
        { keyframePrompt: "Modern Barcelona marina with luxury yachts, blue sky, 9:16 vertical", videoPrompt: "Barcelona marina with luxury yachts, clear blue sky, Mediterranean lifestyle" },
      ],
      voiceOverScript: "إسبانيا... حيث يلتقي الجمال بالفرصة. تأشيرة الرحّال الرقمي تمنحك حق الإقامة في أجمل بلد أوروبي. ELEVAY يرافقك في كل خطوة.",
      backgroundMusicSuggestion: "Uplifting Spanish acoustic guitar, modern cinematic",
    },
    {
      topic: "Spain DNV: الحياة في إسبانيا — جودة لا مثيل لها",
      caption: "☀️ تخيّل صباحك في برشلونة أو مدريد...\n\nإسبانيا تحتل المرتبة الأولى عالمياً في جودة الحياة للمغتربين.\n\n🏖️ شواطئ البحر الأبيض المتوسط\n🍷 مطبخ عالمي وثقافة غنية\n🏥 رعاية صحية متقدمة\n🎓 تعليم دولي للأبناء\n\nمع ELEVAY، الإقامة الإسبانية أصبحت في متناول يدك 🌟",
      hashtags: ["#SpainLife", "#إسبانيا_للعيش", "#جودة_الحياة", "#ELEVAY", "#الإقامة_الأوروبية", "#برشلونة"],
      staticImagePrompt: "1:1 square lifestyle post for Spain residency. Sunny Spanish plaza with orange trees, cafe terrace, Mediterranean architecture. Asymmetric editorial layout with floating text 'Spain Digital Nomad Visa' in white (#FFFFFF) over the image, no solid background box. Soft sage (#CCDBD5) and cream (#E5E8D6) color grade. Premium quality, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Sunny Spanish plaza with orange trees and cafe terrace, 9:16 vertical, no people, cinematic", videoPrompt: "Peaceful Spanish plaza at midday, orange trees, cafe chairs, Mediterranean light" },
        { keyframePrompt: "Spanish market with fresh produce, colorful vegetables and fruits, 9:16 vertical", videoPrompt: "Vibrant Spanish market with colorful fresh produce, warm morning light" },
        { keyframePrompt: "Modern Spanish apartment interior with sea view balcony, 9:16 vertical", videoPrompt: "Luxury apartment interior with panoramic Mediterranean sea view from balcony" },
        { keyframePrompt: "Spanish high-speed train station, modern architecture, 9:16 vertical", videoPrompt: "Modern Spanish AVE high-speed train station, sleek architecture, efficient transport" },
        { keyframePrompt: "Sunset over Alhambra palace Granada, dramatic colors, 9:16 vertical", videoPrompt: "Magical sunset over Alhambra palace in Granada, warm golden and purple tones" },
      ],
      voiceOverScript: "الحياة في إسبانيا ليست مجرد إقامة... إنها تجربة لا تُنسى. من شواطئ البحر الأبيض المتوسط إلى المدن العريقة. ELEVAY يجعل حلمك حقيقة.",
      backgroundMusicSuggestion: "Warm Mediterranean acoustic, lifestyle vibe",
    },
    {
      topic: "Spain DNV: الاستثمار والعائد في إسبانيا",
      caption: "💼 إسبانيا = استثمار ذكي + إقامة أوروبية\n\nسوق العقارات الإسباني من أكثر الأسواق نمواً في أوروبا.\n\n📈 عائد إيجاري يصل إلى 7% سنوياً\n🏡 أسعار معقولة مقارنة بباقي أوروبا\n🌍 إقامة دائمة بعد 5 سنوات\n🇪🇺 جنسية أوروبية بعد 10 سنوات\n\nاستثمر بذكاء مع ELEVAY 🎯",
      hashtags: ["#SpainInvestment", "#العقارات_الإسبانية", "#استثمار_أوروبا", "#ELEVAY", "#إقامة_إسبانيا", "#عائد_الاستثمار"],
      staticImagePrompt: "1:1 square investment-themed post for Spain. Modern luxury real estate in Madrid, glass towers and historic buildings blend. Magazine-style open layout with floating text 'Spain Digital Nomad Visa' in white (#FFFFFF), no banner or box. Deep teal (#809CA1) and baby blue (#B3CFD4) color grade. Professional, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Madrid skyline with modern skyscrapers and historic buildings, 9:16 vertical, cinematic", videoPrompt: "Aerial view of Madrid skyline mixing modern towers with historic architecture" },
        { keyframePrompt: "Luxury Spanish villa with pool overlooking Mediterranean, 9:16 vertical", videoPrompt: "Stunning luxury villa with infinity pool overlooking Mediterranean sea, sunset" },
        { keyframePrompt: "Modern office district in Madrid, glass buildings, 9:16 vertical", videoPrompt: "Modern business district in Madrid, glass and steel architecture, prosperity" },
        { keyframePrompt: "Spanish coastal town with white buildings, blue sea, 9:16 vertical", videoPrompt: "Picturesque Spanish coastal town, white buildings, crystal blue Mediterranean" },
        { keyframePrompt: "European Union flag waving against blue sky, 9:16 vertical", videoPrompt: "EU flag waving in breeze against clear blue sky, symbol of European freedom" },
      ],
      voiceOverScript: "إسبانيا... بوابتك إلى الاستثمار الأوروبي الذكي. عقارات بأسعار تنافسية وعوائد مجزية. مع ELEVAY، استثمارك في أيدٍ أمينة.",
      backgroundMusicSuggestion: "Professional corporate cinematic, confident tone",
    },
  ],
};

const GREECE_GOLDEN_VISA: ProgramTemplates = {
  programName: "Greece Golden Visa",
  country: "Greece",
  posts: [
    {
      topic: "Greece Golden Visa: الذهب الأوروبي",
      caption: "🏛️ اليونان تمنحك الإقامة الذهبية الأوروبية!\n\nبرنامج التأشيرة الذهبية اليونانية — الأفضل في أوروبا:\n\n💰 استثمار يبدأ من 250,000 يورو فقط\n🌍 إقامة لك ولعائلتك\n✈️ حرية التنقل في 26 دولة شنغن\n🏠 ملكية عقارية حقيقية\n\nاليونان... حيث التاريخ يلتقي بالمستقبل 🌟",
      hashtags: ["#GreeceGoldenVisa", "#اليونان", "#التأشيرة_الذهبية", "#ELEVAY", "#إقامة_أوروبا", "#استثمار_عقاري"],
      staticImagePrompt: "1:1 square post for Greece Golden Visa. Santorini white and blue architecture at sunset, iconic domes. Diagonal cut composition with floating text 'Greece Golden Visa' in white (#FFFFFF), no banner or box. Baby blue (#B3CFD4) and soft sage (#CCDBD5) color grade overlay. Luxury, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Santorini iconic white and blue domed churches at sunset, 9:16 vertical, cinematic", videoPrompt: "Magical Santorini sunset with iconic blue domes and white architecture, golden hour" },
        { keyframePrompt: "Aerial view of Greek islands turquoise water, 9:16 vertical", videoPrompt: "Stunning aerial drone shot of Greek islands with crystal turquoise water" },
        { keyframePrompt: "Athens Acropolis at night with dramatic lighting, 9:16 vertical", videoPrompt: "Majestic Athens Acropolis illuminated at night against dark sky" },
        { keyframePrompt: "Greek luxury villa with private pool overlooking Aegean Sea, 9:16 vertical", videoPrompt: "Exclusive Greek villa with infinity pool, Aegean Sea panorama, ultimate luxury" },
        { keyframePrompt: "Mykonos windmills at golden hour, 9:16 vertical", videoPrompt: "Iconic Mykonos windmills at golden hour, warm Mediterranean light" },
      ],
      voiceOverScript: "اليونان... أرض الحضارة والجمال. التأشيرة الذهبية تمنحك إقامة أوروبية وملكية عقارية حقيقية. ELEVAY يفتح لك هذا الباب الذهبي.",
      backgroundMusicSuggestion: "Epic Mediterranean orchestral, majestic tone",
    },
    {
      topic: "Greece Golden Visa: عائلتك تستحق الأفضل",
      caption: "👨‍👩‍👧‍👦 منح عائلتك الأمان الأوروبي — مع اليونان\n\nالتأشيرة الذهبية اليونانية تشمل:\n\n✅ الزوج/الزوجة\n✅ الأبناء حتى 21 سنة\n✅ والدي الزوجين\n🎓 تعليم أوروبي للأبناء\n🏥 رعاية صحية متميزة\n\nاستثمار واحد يحمي عائلتك بأكملها 💙",
      hashtags: ["#GreeceFamily", "#عائلة_أوروبا", "#اليونان_الذهبية", "#ELEVAY", "#أمان_العائلة", "#إقامة_أوروبية"],
      staticImagePrompt: "1:1 square family-themed post for Greece. Peaceful Greek island village with colorful flowers, blue sea background. Full-bleed editorial layout with floating text 'Greece Golden Visa' in white (#FFFFFF) integrated into image, no solid box. Warm linen (#DEE2CB) and sage (#CCDBD5) color grade. Warm, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Colorful Greek village with bougainvillea flowers, cobblestone path, 9:16 vertical", videoPrompt: "Charming Greek village with vibrant bougainvillea, peaceful cobblestone streets" },
        { keyframePrompt: "Greek beach with crystal clear water and white sand, 9:16 vertical", videoPrompt: "Pristine Greek beach, crystal clear turquoise water, white sand, paradise" },
        { keyframePrompt: "Modern Greek school or university building, 9:16 vertical", videoPrompt: "Modern European school building in Greece, quality education symbol" },
        { keyframePrompt: "Greek taverna by the sea at sunset, tables and chairs, 9:16 vertical", videoPrompt: "Romantic Greek taverna by the sea at sunset, warm Mediterranean atmosphere" },
        { keyframePrompt: "Thessaloniki waterfront promenade at dusk, 9:16 vertical", videoPrompt: "Thessaloniki waterfront promenade at dusk, city lights reflecting on water" },
      ],
      voiceOverScript: "عائلتك تستحق الأفضل. التأشيرة الذهبية اليونانية تمنح أفراد عائلتك جميعاً الإقامة الأوروبية. ELEVAY يجعل هذا الحلم حقيقة.",
      backgroundMusicSuggestion: "Warm family cinematic, hopeful strings",
    },
  ],
};

const MALTA_PR: ProgramTemplates = {
  programName: "Malta PR",
  country: "Malta",
  posts: [
    {
      topic: "Malta PR: الإقامة الدائمة في قلب البحر الأبيض المتوسط",
      caption: "🇲🇹 مالطا — جوهرة البحر الأبيض المتوسط!\n\nبرنامج الإقامة الدائمة المالطي يمنحك:\n\n🌍 إقامة دائمة في دولة أوروبية\n✈️ حرية التنقل في منطقة شنغن\n💼 بيئة أعمال متطورة\n🏖️ جودة حياة استثنائية\n🗣️ اللغة الإنجليزية لغة رسمية\n\nمالطا... بوابتك الأوروبية الأصغر والأكثر تميزاً 🌟",
      hashtags: ["#MaltaPR", "#مالطا", "#الإقامة_الدائمة", "#ELEVAY", "#أوروبا", "#شنغن"],
      staticImagePrompt: "1:1 square post for Malta Permanent Residency. Valletta harbor with historic fortifications and colorful boats at golden hour. Organic wave divider composition with floating text 'Malta Permanent Residency' in bold white (#FFFFFF), no banner or box. Deep teal (#809CA1) and baby blue (#B3CFD4) color grade. No people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Valletta Grand Harbour with historic fortifications at sunrise, 9:16 vertical, cinematic", videoPrompt: "Majestic Valletta Grand Harbour at sunrise, ancient fortifications, golden light" },
        { keyframePrompt: "Malta Blue Lagoon crystal clear turquoise water, 9:16 vertical", videoPrompt: "Stunning Malta Blue Lagoon, crystal turquoise water, Mediterranean paradise" },
        { keyframePrompt: "Mdina ancient walled city at dusk, Malta, 9:16 vertical", videoPrompt: "Ancient walled city of Mdina at dusk, dramatic sky, historic atmosphere" },
        { keyframePrompt: "Modern Malta financial district, glass buildings, 9:16 vertical", videoPrompt: "Modern Malta financial district, contemporary architecture, business hub" },
        { keyframePrompt: "Malta coastline aerial view, cliffs and sea, 9:16 vertical", videoPrompt: "Aerial drone view of Malta dramatic coastline, limestone cliffs, azure sea" },
      ],
      voiceOverScript: "مالطا... جوهرة أوروبا الصغيرة. الإقامة الدائمة المالطية تمنحك حرية التنقل في أوروبا وحياة لا مثيل لها. ELEVAY يرافقك في هذه الرحلة.",
      backgroundMusicSuggestion: "Mediterranean cinematic, sophisticated and elegant",
    },
  ],
};

const PORTUGAL_D7: ProgramTemplates = {
  programName: "Portugal D7",
  country: "Portugal",
  posts: [
    {
      topic: "Portugal D7: الإقامة السلبية في البرتغال",
      caption: "🇵🇹 البرتغال تستقبلك بذراعين مفتوحتين!\n\nتأشيرة D7 البرتغالية مثالية لأصحاب الدخل السلبي:\n\n💰 دخل ثابت شهري = إقامة أوروبية\n🌍 أرخص دول أوروبا الغربية\n☀️ 300 يوم مشمس في السنة\n🏖️ شواطئ المحيط الأطلسي\n🎓 تعليم دولي عالي الجودة\n\nالبرتغال... حيث تبدأ حياتك الأوروبية الجديدة 🌊",
      hashtags: ["#PortugalD7", "#البرتغال", "#الإقامة_السلبية", "#ELEVAY", "#أوروبا", "#دخل_سلبي"],
      staticImagePrompt: "1:1 square post for Portugal D7 Visa. Lisbon colorful tram on historic streets, pastel buildings, golden light. Asymmetric editorial layout with floating text 'Portugal D7 Residency' in white (#FFFFFF) over the image, no solid background box. Soft sage (#CCDBD5) and cream (#E5E8D6) color grade. Vibrant, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Lisbon iconic yellow tram on historic street, colorful buildings, 9:16 vertical, cinematic", videoPrompt: "Iconic Lisbon yellow tram on historic cobblestone street, colorful facades" },
        { keyframePrompt: "Algarve dramatic cliffs and golden beach, 9:16 vertical", videoPrompt: "Stunning Algarve coastline with dramatic golden cliffs and turquoise sea" },
        { keyframePrompt: "Porto Douro River valley with wine terraces, 9:16 vertical", videoPrompt: "Aerial view of Porto Douro River valley, terraced vineyards, sunset" },
        { keyframePrompt: "Sintra fairy tale palace in green hills, 9:16 vertical", videoPrompt: "Magical Sintra Palace in misty green hills, fairy tale atmosphere" },
        { keyframePrompt: "Lisbon viewpoint Miradouro at sunset, city panorama, 9:16 vertical", videoPrompt: "Lisbon panoramic viewpoint at sunset, terracotta rooftops, golden light" },
      ],
      voiceOverScript: "البرتغال... حيث الجمال يلتقي بالفرصة. تأشيرة D7 تمنحك الإقامة الأوروبية بدخلك الثابت. ELEVAY يفتح لك هذا الباب.",
      backgroundMusicSuggestion: "Portuguese Fado-inspired cinematic, nostalgic and beautiful",
    },
  ],
};

const PORTUGAL_D8: ProgramTemplates = {
  programName: "Portugal D8",
  country: "Portugal",
  posts: [
    {
      topic: "Portugal D8: تأشيرة الرحّال الرقمي",
      caption: "💻 اعمل من البرتغال... واعش حياة أحلامك!\n\nتأشيرة D8 البرتغالية للعمل عن بُعد:\n\n🌐 اعمل لأي شركة عالمية من البرتغال\n☀️ مناخ رائع طوال العام\n💰 تكلفة معيشة منخفضة\n🌍 بوابة أوروبا الأطلسية\n⚡ إنترنت سريع وبنية تحتية متطورة\n\nالمستقبل الرقمي يبدأ من البرتغال مع ELEVAY 🚀",
      hashtags: ["#PortugalD8", "#البرتغال_الرقمية", "#عمل_عن_بعد", "#ELEVAY", "#رحّال_رقمي", "#أوروبا"],
      staticImagePrompt: "1:1 square post for Portugal D8 Digital Nomad Visa. Modern co-working space in Lisbon with ocean view, minimalist design. Geometric cutout layout with floating text 'Portugal Digital Nomad Visa' in white (#FFFFFF), no banner or box. Baby blue (#B3CFD4) and muted sage (#BFD2CA) color grade. Tech-forward, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Modern Lisbon co-working space interior, minimalist, ocean view, 9:16 vertical", videoPrompt: "Stylish Lisbon co-working space with ocean view, modern minimalist design" },
        { keyframePrompt: "Cascais coastal town near Lisbon, colorful boats, 9:16 vertical", videoPrompt: "Charming Cascais coastal town, colorful fishing boats, Atlantic Ocean" },
        { keyframePrompt: "Lisbon modern tech hub building exterior, 9:16 vertical", videoPrompt: "Modern tech hub building in Lisbon, innovation and entrepreneurship" },
        { keyframePrompt: "Estoril coastline with Atlantic waves, 9:16 vertical", videoPrompt: "Dramatic Atlantic coastline at Estoril, powerful waves, natural beauty" },
        { keyframePrompt: "Lisbon sunset from rooftop, city lights beginning, 9:16 vertical", videoPrompt: "Lisbon rooftop at sunset, city transitioning from day to evening, magical light" },
      ],
      voiceOverScript: "البرتغال تدعوك للعيش والعمل في أجمل بيئة أوروبية. تأشيرة D8 للرحّال الرقمي — طريقك للحرية الحقيقية. ELEVAY معك في كل خطوة.",
      backgroundMusicSuggestion: "Modern upbeat electronic with Portuguese touch",
    },
  ],
};

const DOMINICA: ProgramTemplates = {
  programName: "Dominica",
  country: "Dominica",
  posts: [
    {
      topic: "Dominica: جواز سفر عالمي بأقل تكلفة",
      caption: "🌴 دومينيكا — أذكى استثمار في جواز سفر ثانٍ!\n\nجنسية دومينيكا بالاستثمار:\n\n💰 استثمار يبدأ من 100,000 دولار فقط\n🌍 دخول بدون تأشيرة لأكثر من 140 دولة\n✈️ المملكة المتحدة وشنغن وكندا\n👨‍👩‍👧 يشمل العائلة بأكملها\n⚡ معالجة سريعة 3-6 أشهر\n\nجواز سفر دومينيكا = حرية حقيقية مع ELEVAY 🌟",
      hashtags: ["#DominicaCitizenship", "#دومينيكا", "#جواز_سفر_ثاني", "#ELEVAY", "#الجنسية_الكاريبية", "#حرية_السفر"],
      staticImagePrompt: "1:1 square post for Dominica Citizenship by Investment. Lush tropical rainforest with waterfall, Caribbean paradise. Full-bleed photography with floating text 'Dominica Citizenship' in bold white (#FFFFFF) integrated into image, no solid box. Olive sage (#A6B5A3) and soft sage (#CCDBD5) color grade overlay. Tropical luxury, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Dominica tropical rainforest with dramatic waterfall, 9:16 vertical, cinematic", videoPrompt: "Lush Dominica rainforest with cascading waterfall, emerald green, paradise" },
        { keyframePrompt: "Dominica Caribbean coastline with volcanic mountains, 9:16 vertical", videoPrompt: "Dramatic Dominica coastline with volcanic mountains meeting Caribbean Sea" },
        { keyframePrompt: "Dominica Boiling Lake volcanic landscape, 9:16 vertical", videoPrompt: "Unique Dominica volcanic landscape, Boiling Lake, natural wonder" },
        { keyframePrompt: "Caribbean sunset over Dominica, orange and purple sky, 9:16 vertical", videoPrompt: "Breathtaking Caribbean sunset over Dominica, dramatic orange and purple sky" },
        { keyframePrompt: "Dominica coral reef underwater, colorful fish, 9:16 vertical", videoPrompt: "Vibrant Dominica coral reef, colorful tropical fish, crystal clear water" },
      ],
      voiceOverScript: "دومينيكا... جزيرة الطبيعة الخلابة وجواز السفر القوي. استثمار واحد يمنح عائلتك حرية السفر لأكثر من 140 دولة. ELEVAY يحقق هذا الحلم.",
      backgroundMusicSuggestion: "Tropical Caribbean rhythms, adventurous and free",
    },
    {
      topic: "Dominica: الاستثمار في الجنة الكاريبية",
      caption: "🏝️ استثمر في دومينيكا واحصل على الجنسية!\n\nخيارات الاستثمار:\n\n🏨 صندوق الحكومة: 100,000 دولار\n🏡 عقارات معتمدة: 200,000 دولار\n\n✅ جواز سفر قوي لأكثر من 140 دولة\n✅ لا ضريبة على الدخل الخارجي\n✅ لا اشتراط الإقامة\n✅ جنسية مدى الحياة للأبناء\n\nالاستثمار الأذكى مع ELEVAY 💎",
      hashtags: ["#DominicaInvestment", "#استثمار_كاريبي", "#دومينيكا", "#ELEVAY", "#جنسية_بالاستثمار", "#ضريبة_صفر"],
      staticImagePrompt: "1:1 square investment post for Dominica. Luxury Caribbean resort with infinity pool overlooking turquoise sea. Overlapping layered editorial layout with floating text 'Dominica Citizenship' in white (#FFFFFF), no banner or box. Deep teal (#809CA1) and baby blue (#B3CFD4) color grade. Ultra luxury, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Luxury Caribbean resort infinity pool overlooking turquoise sea, 9:16 vertical", videoPrompt: "Exclusive Caribbean resort with infinity pool, turquoise sea panorama, ultimate luxury" },
        { keyframePrompt: "Dominica lush green mountains aerial view, 9:16 vertical", videoPrompt: "Aerial drone over Dominica lush green volcanic mountains, untouched nature" },
        { keyframePrompt: "Caribbean beach with palm trees and crystal water, 9:16 vertical", videoPrompt: "Perfect Caribbean beach, swaying palm trees, crystal clear turquoise water" },
        { keyframePrompt: "Dominica village with colorful colonial buildings, 9:16 vertical", videoPrompt: "Charming Dominica village with colorful colonial architecture, Caribbean culture" },
        { keyframePrompt: "Caribbean night sky with stars over the sea, 9:16 vertical", videoPrompt: "Stunning Caribbean night sky with milky way over calm dark sea" },
      ],
      voiceOverScript: "استثمار واحد في دومينيكا يفتح أمامك وأمام عائلتك أبواب العالم. لا ضرائب، لا اشتراط إقامة، وجواز سفر مدى الحياة. مع ELEVAY، المستقبل أكثر إشراقاً.",
      backgroundMusicSuggestion: "Sophisticated Caribbean jazz, premium lifestyle",
    },
  ],
};

const GRENADA: ProgramTemplates = {
  programName: "Grenada",
  country: "Grenada",
  posts: [
    {
      topic: "Grenada: جواز سفر قوي وفرص استثنائية",
      caption: "🌺 غرينادا — جزيرة التوابل وجواز السفر القوي!\n\nجنسية غرينادا بالاستثمار:\n\n🇺🇸 الدخول لأمريكا بتأشيرة E-2\n🌍 دخول بدون تأشيرة لأكثر من 140 دولة\n🇬🇧 المملكة المتحدة وكندا\n💰 استثمار يبدأ من 150,000 دولار\n⚡ معالجة 4-6 أشهر\n\nغرينادا... الجزيرة التي تفتح أبواب العالم مع ELEVAY 🌟",
      hashtags: ["#GrenadaCitizenship", "#غرينادا", "#E2Visa", "#ELEVAY", "#جواز_سفر_ثاني", "#أمريكا"],
      staticImagePrompt: "1:1 square post for Grenada Citizenship. Grenada Grand Anse Beach with turquoise water and white sand. Diagonal slash composition with floating text 'Grenada Citizenship' in white (#FFFFFF) over image, no solid box. Baby blue (#B3CFD4) and warm linen (#DEE2CB) color grade. Caribbean paradise, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Grenada Grand Anse Beach turquoise water white sand, 9:16 vertical, cinematic", videoPrompt: "Pristine Grenada Grand Anse Beach, turquoise Caribbean water, white sand" },
        { keyframePrompt: "Grenada spice plantation with nutmeg and cinnamon, 9:16 vertical", videoPrompt: "Lush Grenada spice plantation, nutmeg trees, tropical abundance" },
        { keyframePrompt: "St. George's harbor Grenada with colorful buildings, 9:16 vertical", videoPrompt: "Picturesque St. George's harbor, colorful Caribbean buildings, horseshoe bay" },
        { keyframePrompt: "Grenada underwater sculpture park, 9:16 vertical", videoPrompt: "Unique Grenada underwater sculpture park, art beneath Caribbean Sea" },
        { keyframePrompt: "Caribbean sunset from Grenada hilltop, 9:16 vertical", videoPrompt: "Spectacular Caribbean sunset from Grenada hilltop, panoramic island view" },
      ],
      voiceOverScript: "غرينادا... الجزيرة التي تمنحك أكثر من مجرد جواز سفر. مع إمكانية الوصول إلى أمريكا بتأشيرة E-2، غرينادا هي استثمارك الأذكى. ELEVAY يرشدك.",
      backgroundMusicSuggestion: "Upbeat Caribbean steel drums, optimistic and powerful",
    },
  ],
};

const SAINT_KITTS: ProgramTemplates = {
  programName: "Saint Kitts & Nevis",
  country: "Saint Kitts",
  posts: [
    {
      topic: "Saint Kitts & Nevis: أقدم برنامج جنسية بالاستثمار",
      caption: "👑 سانت كيتس ونيفيس — الرائد العالمي في الجنسية بالاستثمار!\n\nمنذ عام 1984، يقدم هذا البرنامج الأفضل:\n\n🌍 دخول بدون تأشيرة لأكثر من 157 دولة\n✈️ المملكة المتحدة وشنغن وهونغ كونغ\n💰 استثمار يبدأ من 150,000 دولار\n🏆 الأكثر موثوقية في العالم\n⚡ معالجة 45-60 يوم (Fast Track)\n\nالثقة والموثوقية مع ELEVAY 🌟",
      hashtags: ["#SaintKittsCitizenship", "#سانت_كيتس", "#جنسية_كاريبية", "#ELEVAY", "#جواز_سفر_قوي", "#157_دولة"],
      staticImagePrompt: "1:1 square post for Saint Kitts Citizenship. Brimstone Hill Fortress with Caribbean sea view, lush green island. Magazine-style open white-space layout with floating text 'Saint Kitts & Nevis Citizenship' in white (#FFFFFF), no banner or box. Olive sage (#A6B5A3) and soft sage (#CCDBD5) color grade. Historic and tropical, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Brimstone Hill Fortress Saint Kitts with Caribbean panorama, 9:16 vertical", videoPrompt: "Historic Brimstone Hill Fortress with stunning Caribbean Sea panorama" },
        { keyframePrompt: "Saint Kitts rainforest with Mount Liamuiga volcano, 9:16 vertical", videoPrompt: "Lush Saint Kitts rainforest with dramatic Mount Liamuiga volcano" },
        { keyframePrompt: "Nevis Peak volcano reflected in Caribbean sea, 9:16 vertical", videoPrompt: "Perfect Nevis Peak volcano reflection in calm Caribbean waters" },
        { keyframePrompt: "Saint Kitts luxury resort on beach, 9:16 vertical", videoPrompt: "Exclusive Saint Kitts luxury beach resort, Caribbean paradise" },
        { keyframePrompt: "Caribbean sailing boat near Saint Kitts coast, 9:16 vertical", videoPrompt: "Elegant sailing yacht near Saint Kitts coastline, freedom and luxury" },
      ],
      voiceOverScript: "سانت كيتس ونيفيس... أول وأعرق برنامج جنسية بالاستثمار في العالم. موثوقية لا مثيل لها منذ 1984. ELEVAY يقدم لك هذه الفرصة الاستثنائية.",
      backgroundMusicSuggestion: "Regal Caribbean orchestral, prestigious and timeless",
    },
  ],
};

const CANADA: ProgramTemplates = {
  programName: "Canada Skilled Migration",
  country: "Canada",
  posts: [
    {
      topic: "Canada Skilled Migration: الهجرة الماهرة إلى كندا",
      caption: "🍁 كندا تنتظرك!\n\nبرنامج الهجرة الماهرة الكندي:\n\n🌍 إقامة دائمة في أفضل دولة للعيش\n💼 فرص عمل لا محدودة\n🎓 تعليم عالمي مجاني للأبناء\n🏥 رعاية صحية شاملة مجانية\n🌲 جودة حياة استثنائية\n\nكندا... حيث يبدأ مستقبل أفضل مع ELEVAY 🌟",
      hashtags: ["#CanadaMigration", "#كندا", "#الهجرة_الماهرة", "#ELEVAY", "#إقامة_كندا", "#مستقبل_أفضل"],
      staticImagePrompt: "1:1 square post for Canada Skilled Migration. Canadian Rocky Mountains with turquoise lake, dramatic peaks. Full-bleed editorial layout with floating text 'Canada Skilled Migration' in white (#FFFFFF) integrated into image, no solid box. Deep teal (#809CA1) and muted sage (#BFD2CA) color grade. Majestic nature, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Canadian Rocky Mountains with turquoise Moraine Lake, 9:16 vertical, cinematic", videoPrompt: "Majestic Canadian Rockies with stunning turquoise Moraine Lake, pristine nature" },
        { keyframePrompt: "Toronto skyline at night with CN Tower, 9:16 vertical", videoPrompt: "Impressive Toronto skyline at night, CN Tower illuminated, modern city" },
        { keyframePrompt: "Vancouver harbor with mountains backdrop, 9:16 vertical", videoPrompt: "Beautiful Vancouver harbor with snow-capped mountains, perfect city-nature blend" },
        { keyframePrompt: "Canadian autumn forest with red and orange leaves, 9:16 vertical", videoPrompt: "Spectacular Canadian autumn forest, fiery red and orange foliage" },
        { keyframePrompt: "Niagara Falls dramatic aerial view, 9:16 vertical", videoPrompt: "Powerful Niagara Falls aerial view, massive water flow, natural wonder" },
      ],
      voiceOverScript: "كندا... البلد الذي يرحب بالطموح. الهجرة الماهرة تفتح لك أبواب حياة جديدة في أرض الفرص. ELEVAY يرافقك في هذه الرحلة.",
      backgroundMusicSuggestion: "Inspiring orchestral, hopeful and grand",
    },
  ],
};

const ELEVAY_BRAND: ProgramTemplates = {
  programName: "ELEVAY Brand",
  country: "Global",
  posts: [
    {
      topic: "ELEVAY: خبرة 25 عاماً في خدمتك",
      caption: "🏆 ELEVAY — شريكك الموثوق منذ 1998\n\nلماذا تختار ELEVAY؟\n\n✅ أكثر من 25 عاماً من الخبرة\n✅ فريق من أفضل المستشارين الدوليين\n✅ أكثر من 1000 عميل ناجح\n✅ حلول مخصصة لكل عميل\n✅ دعم كامل من البداية للنهاية\n\nثق بالخبراء — ثق بـ ELEVAY 🌟",
      hashtags: ["#ELEVAY", "#خبرة_25_عام", "#استشارة_مجانية", "#الجنسية_والإقامة", "#موثوقية", "#نجاح_عملائنا"],
      staticImagePrompt: "1:1 square brand post. World map with highlighted countries, baby blue (#B3CFD4) and cream (#E5E8D6) background, geometric minimal silhouette in olive sage (#A6B5A3) in corner. Text 'Since 1998' in white (#FFFFFF) and text color #3A4E58. Luxury corporate editorial layout, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "World map with glowing connection lines between countries, dark background, 9:16 vertical", videoPrompt: "Animated world map with glowing connection lines, global mobility visualization" },
        { keyframePrompt: "Premium office interior with global flags, 9:16 vertical", videoPrompt: "Sophisticated premium office with international flags, professional excellence" },
        { keyframePrompt: "Luxury passport and travel documents on dark marble, 9:16 vertical", videoPrompt: "Premium passports and travel documents on dark marble surface, elegance" },
        { keyframePrompt: "Business handshake silhouette against city skyline, 9:16 vertical", videoPrompt: "Professional business agreement silhouette against international city skyline" },
        { keyframePrompt: "ELEVAY brand visual with origami bird and global map, 9:16 vertical", videoPrompt: "geometric origami bird icon in baby blue (#5BA3B8), global reach, premium brand" },
      ],
      voiceOverScript: "ELEVAY... خبرة تمتد لأكثر من 25 عاماً في مجال الجنسية والإقامة بالاستثمار. أكثر من ألف عميل وثقوا بنا وحققوا أحلامهم. نحن هنا لنحقق حلمك أيضاً.",
      backgroundMusicSuggestion: "Premium corporate brand anthem, confident and inspiring",
    },
    {
      topic: "ELEVAY: التنقل العالمي — حقك الذي تستحقه",
      caption: "✈️ العالم أكبر من حدود جواز سفر واحد!\n\nمع ELEVAY، احصل على:\n\n🌍 حرية السفر بدون قيود\n💼 فرص استثمارية عالمية\n🏠 إقامة في أفضل دول العالم\n👨‍👩‍👧 مستقبل آمن لعائلتك\n🔐 حماية ثروتك وأصولك\n\nالتنقل العالمي ليس رفاهية... إنه ضرورة 🌟",
      hashtags: ["#GlobalMobility", "#التنقل_العالمي", "#ELEVAY", "#حرية_السفر", "#جواز_سفر_ثاني", "#مستقبل_عائلتك"],
      staticImagePrompt: "1:1 square post for global mobility theme. Airplane wing view above clouds at sunset, freedom and travel. Asymmetric editorial layout with floating text 'Global Mobility' in white (#FFFFFF) over the image, no banner or box. Sky blue (#A0C3CA) and soft sage (#CCDBD5) color grade. Aspirational, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Airplane wing above clouds at sunset, freedom concept, 9:16 vertical", videoPrompt: "Airplane wing above golden clouds at sunset, freedom and possibility" },
        { keyframePrompt: "International airport terminal with multiple flags, 9:16 vertical", videoPrompt: "Modern international airport terminal, flags of many nations, global connectivity" },
        { keyframePrompt: "World map with passport stamps overlay, 9:16 vertical", videoPrompt: "World map with colorful passport stamps, travel history, global citizen" },
        { keyframePrompt: "Luxury private jet interior, 9:16 vertical", videoPrompt: "Elegant private jet interior, premium lifestyle, ultimate freedom" },
        { keyframePrompt: "Multiple passports from different countries fanned out, 9:16 vertical", videoPrompt: "Multiple passports from different countries, second citizenship concept" },
      ],
      voiceOverScript: "التنقل العالمي حق لك ولعائلتك. مع ELEVAY، نفتح لك أبواب العالم من خلال برامج الجنسية والإقامة الأفضل عالمياً. ابدأ رحلتك اليوم.",
      backgroundMusicSuggestion: "Epic cinematic travel music, inspirational and grand",
    },
  ],
};

const PORTUGAL_D2: ProgramTemplates = {
  programName: "Portugal D2",
  country: "Portugal",
  posts: [
    {
      topic: "Portugal D2: تأشيرة رواد الأعمال في البرتغال",
      caption: "🚀 ابنِ مشروعك في أوروبا من البرتغال!\n\nتأشيرة D2 البرتغالية لرواد الأعمال:\n\n💡 أسس شركتك في قلب أوروبا\n🌍 الوصول إلى السوق الأوروبي\n💰 حوافز ضريبية استثنائية\n🤝 بيئة أعمال داعمة ومتطورة\n🌊 جودة حياة لا مثيل لها\n\nريادة الأعمال الأوروبية تبدأ هنا مع ELEVAY 🎯",
      hashtags: ["#PortugalD2", "#ريادة_الأعمال", "#البرتغال", "#ELEVAY", "#أوروبا_للأعمال", "#مشروع_أوروبي"],
      staticImagePrompt: "1:1 square post for Portugal D2 Entrepreneur Visa. Lisbon startup hub modern interior, innovative workspace. Geometric cutout editorial layout with floating text 'Portugal D2 Entrepreneur Visa' in white (#FFFFFF), no banner or box. Baby blue (#B3CFD4) and warm khaki (#CCCFA5) color grade. Innovation theme, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "Lisbon modern startup hub interior, innovation workspace, 9:16 vertical", videoPrompt: "Dynamic Lisbon startup hub, modern innovation space, entrepreneurship" },
        { keyframePrompt: "Porto historic city center with modern business district, 9:16 vertical", videoPrompt: "Porto blending historic charm with modern business district, opportunity" },
        { keyframePrompt: "Portugal tech conference center modern architecture, 9:16 vertical", videoPrompt: "Modern Portugal tech conference center, Web Summit venue, innovation hub" },
        { keyframePrompt: "Lisbon Expo area modern buildings and river, 9:16 vertical", videoPrompt: "Lisbon Expo area with modern architecture and Tagus River, future vision" },
        { keyframePrompt: "Portuguese sunset over modern city skyline, 9:16 vertical", videoPrompt: "Beautiful sunset over modern Portuguese city skyline, success and achievement" },
      ],
      voiceOverScript: "البرتغال تستقبل رواد الأعمال بأذرع مفتوحة. تأشيرة D2 تمنحك فرصة بناء مشروعك في قلب أوروبا. ELEVAY يرافقك في كل خطوة نحو النجاح.",
      backgroundMusicSuggestion: "Energetic entrepreneurial music, motivational",
    },
  ],
};

const UK_EXPANSION: ProgramTemplates = {
  programName: "UK Expansion Worker",
  country: "UK",
  posts: [
    {
      topic: "UK Expansion Worker: توسّع أعمالك إلى المملكة المتحدة",
      caption: "🇬🇧 المملكة المتحدة تفتح أبوابها لأعمالك!\n\nتأشيرة العامل التوسعي البريطانية:\n\n🏢 أسس فرعاً لشركتك في لندن\n💼 العمل القانوني في المملكة المتحدة\n🌍 الوصول إلى السوق البريطاني\n📈 توسيع نطاق أعمالك دولياً\n🎓 فرص تعليمية وثقافية استثنائية\n\nلندن تنتظرك مع ELEVAY 🌟",
      hashtags: ["#UKExpansion", "#المملكة_المتحدة", "#لندن", "#ELEVAY", "#أعمال_بريطانية", "#توسع_دولي"],
      staticImagePrompt: "1:1 square post for UK Expansion Worker Visa. London skyline with Tower Bridge and Shard at dusk. Full-bleed photography with floating text 'UK Expansion Worker Visa' in white (#FFFFFF) integrated into image, no solid box. Cool slate (#707A83) and muted steel (#7C939F) color grade. Iconic London, no people. No gold, no dark navy, no Arabic text.",
      reelScenes: [
        { keyframePrompt: "London Tower Bridge at dusk with city lights, 9:16 vertical, cinematic", videoPrompt: "Iconic London Tower Bridge at dusk, city lights reflecting on Thames" },
        { keyframePrompt: "Canary Wharf financial district London, glass towers, 9:16 vertical", videoPrompt: "London Canary Wharf financial district, impressive glass towers, business power" },
        { keyframePrompt: "London Eye and Parliament at sunset, 9:16 vertical", videoPrompt: "London Eye and Houses of Parliament at sunset, iconic British landmarks" },
        { keyframePrompt: "The City of London modern skyscrapers, 9:16 vertical", videoPrompt: "The City of London with Gherkin and modern skyscrapers, financial capital" },
        { keyframePrompt: "London Heathrow Airport modern terminal, 9:16 vertical", videoPrompt: "Modern London Heathrow Airport terminal, global connectivity hub" },
      ],
      voiceOverScript: "لندن... عاصمة الأعمال العالمية. تأشيرة العامل التوسعي تمنحك فرصة توسيع أعمالك في أكبر اقتصاد أوروبي. ELEVAY يجعل هذا الحلم حقيقة.",
      backgroundMusicSuggestion: "British orchestral, prestigious and powerful",
    },
  ],
};

// ─── MASTER PROGRAM MAP ───────────────────────────────────────────────────────
export const PROGRAM_TEMPLATES: Record<string, ProgramTemplates> = {
  "Spain DNV": SPAIN_DNV,
  "Greece Golden Visa": GREECE_GOLDEN_VISA,
  "Malta PR": MALTA_PR,
  "Portugal D7": PORTUGAL_D7,
  "Portugal D8": PORTUGAL_D8,
  "Portugal D2": PORTUGAL_D2,
  "Dominica": DOMINICA,
  "Grenada": GRENADA,
  "Saint Kitts & Nevis": SAINT_KITTS,
  "Canada Skilled Migration": CANADA,
  "UK Expansion Worker": UK_EXPANSION,
  "ELEVAY Brand": ELEVAY_BRAND,
  // Fallback for other Caribbean programs
  "Saint Lucia": DOMINICA,
  "Antigua & Barbuda": DOMINICA,
  "Vanuatu": DOMINICA,
  "Nauru": DOMINICA,
  "Sao Tome": DOMINICA,
  "Egypt": DOMINICA,
  "Turkey": DOMINICA,
};

// ─── MONTH THEMES ─────────────────────────────────────────────────────────────
export const MONTH_THEMES = [
  { theme: "إطلاق العنان للفرص الأوروبية والكاريبية", objective: "زيادة الوعي بالبرامج الأوروبية والكاريبية وتسليط الضوء على المزايا الأساسية لكل منها" },
  { theme: "تعزيز الثقة والتركيز على المزايا", objective: "كشريك موثوق به، وتعميق فهم الجمهور للمزايا الفريدة لكل برنامج ELEVAY بناء الثقة" },
  { theme: "التحرك نحو المستقبل: اتخاذ القرار", objective: "ELEVAY تشجيع الجمهور على اتخاذ الخطوات التالية والبدء في عملية التقديم مع الدعم الشامل من" },
];

export const WEEK_FOCUSES = [
  "الوعي والتعريف بالبرامج",
  "المزايا والفوائد الاستثمارية",
  "قصص النجاح وشهادات العملاء",
  "المقارنة والاختيار الأمثل",
];

// ─── PLAN GENERATOR ───────────────────────────────────────────────────────────
export function generatePlanRuleBased(params: {
  startDate: Date;
  programs: string[];
  contentRatio: string;
  pillarFocus: string;
}): object {
  const { startDate, programs, contentRatio, pillarFocus } = params;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 3);

  // Build program rotation list — ensure variety
  const programPool = programs.length >= 5 ? programs : [...programs, ...programs, ...programs].slice(0, 15);

  const months = [];
  let programIndex = 0;
  let weekCounter = 1;

  for (let m = 0; m < 3; m++) {
    const monthStart = new Date(startDate);
    monthStart.setMonth(monthStart.getMonth() + m);
    const monthName = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const monthTheme = MONTH_THEMES[m];

    const weeks = [];
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date(monthStart);
      weekStart.setDate(weekStart.getDate() + w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekLabel = `Week ${weekCounter}: ${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
      const weekFocus = WEEK_FOCUSES[w % WEEK_FOCUSES.length];

      const posts = [];
      for (const day of DAYS) {
        // Pick a program for this day
        const prog = programPool[programIndex % programPool.length];
        programIndex++;

        const templates = PROGRAM_TEMPLATES[prog] || PROGRAM_TEMPLATES["Dominica"];
        const postIdx = (programIndex + w) % templates.posts.length;
        const tpl = templates.posts[postIdx];

        // Static Design post
        posts.push({
          day,
          type: "Static Design",
          topic: tpl.topic,
          caption: tpl.caption,
          hashtags: tpl.hashtags,
        });

        // Reel post
        posts.push({
          day,
          type: "Reel",
          topic: tpl.topic,
          caption: tpl.caption,
          hashtags: tpl.hashtags,
        });
      }

      weeks.push({
        weekNumber: weekCounter,
        weekLabel,
        focus: weekFocus,
        posts,
      });
      weekCounter++;
    }

    months.push({
      monthNumber: m + 1,
      monthName,
      theme: monthTheme.theme,
      objective: monthTheme.objective,
      weeks,
    });
  }

  return {
    planTitle: `ELEVAY خطة التسويق الرقمي الشاملة لـ ${startDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} - ${endDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`,
    dateRange: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    },
    strategy: {
      overview: `خطة تسويق رقمي شاملة لـ ELEVAY تغطي 3 أشهر مع تركيز على: ${contentRatio}. الركائز الأساسية: ${pillarFocus}.`,
      contentPillars: [
        { name: "الإقامة الأوروبية", percentage: "40%", description: "تسليط الضوء على برامج الإقامة الأوروبية ومزاياها" },
        { name: "الجنسية الكاريبية", percentage: "40%", description: "عرض برامج الجنسية الكاريبية وفرص الاستثمار" },
        { name: "العلامة التجارية والثقة", percentage: "20%", description: "تعزيز مكانة ELEVAY كشريك موثوق" },
      ],
      targetAudience: "الأفراد ذوو الثروات العالية في منطقة الشرق الأوسط وشمال أفريقيا",
      tone: "احترافي، موثوق، ملهم",
    },
    months,
    hashtagLibrary: HASHTAG_LIBRARY,
    engagementStrategy: {
      bestPostingTimes: "الأحد-الخميس: 8-10 صباحاً و7-9 مساءً (توقيت القاهرة)",
      communityManagement: "الرد على التعليقات خلال ساعتين، التفاعل مع المحتوى ذي الصلة",
      paidAmplification: "تعزيز أفضل المنشورات أداءً بميزانية أسبوعية مخصصة",
    },
    kpis: [
      { metric: "الوصول الأسبوعي", target: "50,000+ مشاهدة" },
      { metric: "معدل التفاعل", target: "3-5%" },
      { metric: "العملاء المحتملون الشهريون", target: "50+ عميل" },
    ],
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
    // Find the matching program template by topic
    let matchedTpl: PostTemplate | null = null;
    let matchedProgram = "";

    for (const [progName, progData] of Object.entries(PROGRAM_TEMPLATES)) {
      for (const tpl of progData.posts) {
        if (tpl.topic === post.topic || post.topic.includes(progData.country) || post.topic.includes(progName)) {
          matchedTpl = tpl;
          matchedProgram = progName;
          break;
        }
      }
      if (matchedTpl) break;
    }

    // Fallback to ELEVAY Brand if no match
    if (!matchedTpl) {
      matchedTpl = ELEVAY_BRAND.posts[0];
      matchedProgram = "ELEVAY Brand";
    }

    if (post.type === "Static Design") {
      staticPrompts.push({
        day: post.day,
        topic: post.topic,
        imagePrompt: matchedTpl.staticImagePrompt,
        caption: matchedTpl.caption,
        hashtags: matchedTpl.hashtags,
      });
    } else if (post.type === "Reel") {
      reelKeyframes.push({
        day: post.day,
        topic: post.topic,
        scenes: matchedTpl.reelScenes.map((scene, idx) => ({
          sceneNumber: idx + 1,
          duration: "3s",
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

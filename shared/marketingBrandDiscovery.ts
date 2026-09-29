export const BRAND_DISCOVERY_SECTIONS = [
  { key: "brand_direction", label: "Brand direction", start: 1, end: 5 },
  { key: "audience_and_trust", label: "Audience and trust", start: 6, end: 10 },
  { key: "personality_and_voice", label: "Personality and voice", start: 11, end: 16 },
  { key: "visual_identity", label: "Visual identity", start: 17, end: 24 },
  { key: "content_reels_ads", label: "Content, reels and advertising", start: 25, end: 30 },
  { key: "practical_rules", label: "Practical rules", start: 31, end: 35 },
] as const;

export type BrandDiscoverySectionKey = (typeof BRAND_DISCOVERY_SECTIONS)[number]["key"];

export type BrandDiscoveryQuestion = {
  number: number;
  key: string;
  section: BrandDiscoverySectionKey;
  sectionLabel: string;
  prompt: string;
  recommendation: string;
};

const sectionFor = (number: number) => {
  const section = BRAND_DISCOVERY_SECTIONS.find(item => number >= item.start && number <= item.end);
  if (!section) throw new Error(`Unknown Brand Discovery question ${number}`);
  return section;
};

const prompts = [
  "In one sentence, what should Elevay be known for?",
  "What makes a client choose Elevay over another immigration firm?",
  "What are your three most important business goals for the next 12 months: awareness, qualified leads, consultations, signed contracts, referrals, or something else?",
  "Which services and destinations should receive the most marketing attention? Rank your top five.",
  "Do you want one identity across every service, or distinct visual styles for citizenship, residency, digital nomad visas, and settlement services?",
  "Who is your ideal client? Include country, age range, family situation, approximate budget, and reason for moving or investing.",
  "Are there different audiences we should speak to separately, such as business owners, remote workers, and families?",
  "What are the main doubts clients have before contacting you?",
  "What proof can we show publicly: client testimonials, approvals, case studies, team credentials, office photos, partner information, or process milestones?",
  "What claims should we never make? For example, guarantees of approval or fixed processing times.",
  "Choose three to five words for Elevay's personality: for example, premium, reassuring, precise, ambitious, warm, discreet, modern.",
  "Should the brand feel more like a legal advisory firm, a luxury concierge, or an approachable expert? You can give percentages.",
  "What should clients feel after seeing an Elevay ad?",
  "Which languages do you need? For Arabic, should we use Egyptian conversational Arabic, formal Arabic, or a mix? Should English be British or international?",
  "Should we address people formally or personally? Share any phrases you love or dislike.",
  "Who should appear or speak for the brand: you, consultants, clients, an AI voice, or a mix? When should your AI voice be used?",
  "Please provide the current logo files, fonts, color codes, website, brochures, presentations, and social media accounts.",
  "Which existing Elevay designs feel right, and which should be replaced? Tell me why.",
  "Do you want to preserve the current logo and colors, refine them, or consider a full rebrand?",
  "Name three brands whose visual quality you admire. What specifically do you like about each?",
  "Which visual styles should we avoid?",
  "What imagery should represent Elevay: real team and clients, architecture, lifestyle, destination photography, maps, illustrations, or a combination?",
  "Are there rules for showing flags, passports, government symbols, or approval documents?",
  "Should your personal identity as Country Manager be prominent, or should Elevay lead every design?",
  "Which content should we produce regularly: educational explainers, news, client stories, destination comparisons, FAQs, objection handling, or direct offers?",
  "Which platforms matter most: Instagram, Facebook, TikTok, LinkedIn, YouTube, and WhatsApp?",
  "For reels, do you prefer talking head, voice-over with footage, motion graphics, interviews, or a mix?",
  "What is the preferred reel length and pace? Should subtitles always appear in Arabic, English, or both?",
  "What should the usual call to action be: WhatsApp, booking a consultation, a lead form, or visiting elevay.vip?",
  "Which topics, promises, images, or sales tactics feel too aggressive for your brand?",
  "Who gives final approval for designs, scripts, and legal or immigration claims?",
  "What information must appear on every ad: logo, website, phone number, disclaimer, office location, or license details?",
  "Do you have consent to use existing client photos, testimonials, and case results?",
  "What file formats and sizes does your team need for social posts, stories, reels, print, presentations, and the app?",
  "What should be fixed permanently in the brand system, and where do you want room to experiment?",
] as const;

const recommendations = [
  "Position Elevay as a premium, evidence-led global mobility advisory firm that provides clear, ethical pathways to residency and citizenship.",
  "Lead with 28 years of trusted advisory experience, clear process ownership, verified programme knowledge, and discreet client support—without claiming guaranteed outcomes.",
  "Use a balanced 12-month scorecard: qualified consultations, signed-and-paid clients, referral growth, measured awareness, and trust indicators rather than vanity reach alone.",
  "Start with Spain Digital Nomad Residency and Malta MPRP, while keeping existing Elevay programmes available only when their facts are approved in the knowledge library.",
  "Use one Elevay master identity with programme-specific messaging and imagery, not separate competing brand identities.",
  "Begin with Egyptian professionals, remote workers, business owners, and family decision-makers who value legal clarity, mobility, and a realistic budget assessment.",
  "Create separate message tracks for remote professionals, business owners/investors, and family relocation decision-makers while retaining one premium Elevay voice.",
  "Address eligibility, realistic budgets, family inclusion, documentation, timelines, and whether the process is genuinely suitable for the client.",
  "Use only consented testimonials, verified process milestones, licensed team/office material, public credentials, and approved partner information.",
  "Never guarantee approval, appointment availability, government processing times, tax outcomes, return on investment, or a fixed immigration result.",
  "Start with: premium, clear, reassuring, precise, warm, and discreet.",
  "Use a 60% expert advisory, 25% luxury concierge, and 15% approachable guide balance; test this only after approval.",
  "Clients should feel informed, respected, confident to ask questions, and able to make a considered next step—not pressured.",
  "Use Egyptian Arabic for social and conversational material, clear Modern Standard Arabic for formal explanations, and international English where needed.",
  "Use respectful personal language, short clear explanations, and avoid fear, pressure, or exaggerated urgency.",
  "Use the approved Elevay Arabic AI voice for polished voice-over reels after script approval; use real staff/clients only with documented consent.",
  "Preserve the official Elevay logo and supplied brand assets. Attach the existing logo, approved summaries, brochures, and verified public channels for audit.",
  "Retain the clean premium white-space direction; replace any cluttered, unclear, overly decorative, or unsubstantiated designs.",
  "Preserve the current official logo and colours. Any rebrand must be a separate evidence-led proposal and cannot be changed automatically.",
  "Choose visual references for spacing, editorial photography, typography, and restraint—not for copying layouts, logos, or claims.",
  "Avoid generic travel-agency imagery, fake government documents, passport imagery, loud discount-led graphics, and cluttered text treatments.",
  "Use premium destination architecture, refined lifestyle details, approved team imagery, and editorial visual storytelling. Never use passport images.",
  "Avoid fake seals, fabricated approval letters, misleading flags, or official symbols that imply government endorsement.",
  "Let Elevay lead every design; use the Country Manager selectively as a credible spokesperson where an approved content brief calls for it.",
  "Prioritise educational explainers, FAQs, objection handling, destination comparisons, verified news, and consented proof before direct offers.",
  "Begin with Instagram and Facebook, with WhatsApp as a response channel. Add other platforms only where the owner confirms a business case.",
  "Use a controlled mix of approved Arabic voice-over footage and selected talking-head or interview formats; every item remains subject to QA and approval.",
  "Use concise, premium pacing. Reels are 9:16 and must follow the approved video rules; subtitle policy is decided in the approved Brand Book.",
  "Use a truthful CTA such as a consultation request or eligibility assessment; link the message to the landing page and consultant script.",
  "Avoid fake scarcity, sensational comparisons, fear-based selling, unverified legal claims, and contact details inside creative unless explicitly approved.",
  "Use Mahmoud Saber as the final brand, legal-claim, advertising, and publication approver until a delegated approval policy is explicitly approved.",
  "Require the official logo and any legal disclaimer or approved contact component only where the platform and approved Brand Book specify it.",
  "Use a documented consent register. If consent is missing or unclear, do not use a client photo, testimonial, or outcome.",
  "Support the approved platform formats: 1:1, 4:5, and 9:16. File-size, print, and presentation requirements belong in the approved Brand Book.",
  "Fix truthfulness, premium visual standards, brand colours, logo integrity, and prohibited claims permanently. Permit bounded creative experimentation within approved templates.",
] as const;

export const BRAND_DISCOVERY_QUESTIONS: readonly BrandDiscoveryQuestion[] = prompts.map((prompt, index) => {
  const number = index + 1;
  const section = sectionFor(number);
  return {
    number,
    key: `brand_${String(number).padStart(2, "0")}`,
    section: section.key,
    sectionLabel: section.label,
    prompt,
    recommendation: recommendations[index],
  };
});

export const BRAND_DISCOVERY_TOTAL_QUESTIONS = BRAND_DISCOVERY_QUESTIONS.length;

export function getBrandDiscoveryQuestion(number: number): BrandDiscoveryQuestion {
  const question = BRAND_DISCOVERY_QUESTIONS.find(item => item.number === number);
  if (!question) throw new Error(`Invalid Brand Discovery question number: ${number}`);
  return question;
}

export function calculateNextBrandDiscoveryQuestion(answeredQuestionNumbers: readonly number[]): number | null {
  const answered = new Set(answeredQuestionNumbers);
  return BRAND_DISCOVERY_QUESTIONS.find(question => !answered.has(question.number))?.number ?? null;
}

export function isBrandDiscoveryComplete(answeredQuestionNumbers: readonly number[]): boolean {
  return calculateNextBrandDiscoveryQuestion(answeredQuestionNumbers) === null;
}

export function buildBrandBookProposal(input: {
  sessionId: number;
  sessionVersion: number;
  answers: Array<{ questionNumber: number; answerText: string; decisionStatus: string }>;
}) {
  const answerByNumber = new Map(input.answers.map(answer => [answer.questionNumber, answer]));
  const answer = (number: number) => answerByNumber.get(number)?.answerText ?? "Not answered";
  const gaps = input.answers
    .filter(item => item.decisionStatus === "unknown")
    .map(item => ({ questionNumber: item.questionNumber, question: getBrandDiscoveryQuestion(item.questionNumber).prompt, owner: "Mahmoud Saber", status: "needs_owner_decision" }));

  return {
    schemaVersion: 1,
    sourceSessionId: input.sessionId,
    interviewVersion: input.sessionVersion,
    status: "proposed",
    positioning: answer(1),
    differentiators: answer(2),
    twelveMonthGoals: answer(3),
    priorityProgrammes: answer(4),
    brandArchitecture: answer(5),
    primaryAudience: answer(6),
    audienceSegments: answer(7),
    trustConcerns: answer(8),
    proofLibraryPolicy: answer(9),
    prohibitedClaims: answer(10),
    personality: answer(11),
    toneBalance: answer(12),
    desiredClientFeeling: answer(13),
    languagePolicy: answer(14),
    addressStyle: answer(15),
    spokespersonPolicy: answer(16),
    visualAssets: answer(17),
    currentDesignAssessment: answer(18),
    identityChangePolicy: answer(19),
    visualReferences: answer(20),
    prohibitedVisualStyles: answer(21),
    imageryPolicy: answer(22),
    governmentSymbolPolicy: answer(23),
    countryManagerPresence: answer(24),
    contentMix: answer(25),
    platformPriorities: answer(26),
    reelFormat: answer(27),
    reelLengthAndSubtitles: answer(28),
    callToAction: answer(29),
    prohibitedTactics: answer(30),
    approvalPolicy: answer(31),
    mandatoryAdInformation: answer(32),
    consentPolicy: answer(33),
    formatRequirements: answer(34),
    fixedVsExperimentalRules: answer(35),
    designTokens: {
      logoPolicy: "Use the official ELEVAY logo unchanged. Do not stretch, crop, rotate, recolour, or redesign it.",
      palette: { teal: "#5BA3B8", navy: "#1A3A5C", white: "#FFFFFF" },
      premiumRules: ["luxury-editorial", "clean whitespace", "monochrome icons", "high-quality realistic photography"],
      socialRules: ["Arabic captions by default", "no guarantees", "no passport imagery", "9:16 reels", "no text embedded in video", "clean white logo outro"],
    },
    evidenceReferences: input.answers.map(answerItem => ({ questionNumber: answerItem.questionNumber, decisionStatus: answerItem.decisionStatus })),
    missingDecisions: gaps,
    approvals: { required: ["owner_brand_book_approval"], complete: false },
  };
}

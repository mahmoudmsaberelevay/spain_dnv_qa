// @ts-nocheck
/*
 * ELEVAY approved sources for the AI Studio.
 *
 *   assets/knowledge/*.md   owner-approved program sources (Spain DNV, Malta PR, and the Antigua & Barbuda, Dominica,
 *                           Egypt, Nauru and São Tomé and Príncipe citizenship/residence training guides, 26 Oct 2026)
 *   assets/creative/*.md    ELEVAY creative direction (brand identity, design, video/audio, delivery checklist)
 *   assets/elevay-logo.png  official ELEVAY logo (composited, never AI-drawn)
 *   assets/ApexSansBook.ttf official ELEVAY font for on-design English text
 *
 * In the built server these files are copied to dist/command-center-assets by
 * scripts/copy-server-assets.mjs.
 */
import fs from "fs";
import { fileURLToPath } from "url";

const DIRS = ["./assets/", "./command-center-assets/"];
export function assetPath(name: string) {
  for (const d of DIRS) {
    try {
      const p = fileURLToPath(new URL(d + name, import.meta.url));
      if (fs.existsSync(p)) return p;
    } catch { /* try next */ }
  }
  throw new Error(`ELEVAY asset ${name} is not packaged on this server.`);
}
const cache = new Map();
export function assetText(name: string) {
  if (!cache.has(name)) { try { cache.set(name, fs.readFileSync(assetPath(name), "utf8")); } catch { cache.set(name, ""); } }
  return cache.get(name);
}

// ------------------------------------------------------------------ programs
/**
 * Fact sheets distilled from the owner-approved Q&A (30 Sep 2026). Where they differ from the
 * older program list in the brand identity file, these approved sources win.
 */
export const PROGRAMS = [
  {
    key: "spain_dnv",
    name: "Spain Digital Nomad Residence",
    match: /spain|españa|إسبانيا|اسبانيا|digital\s*nomad|ديجيتال|نوماد|\bdnv\b/i,
    file: "knowledge/spain-digital-nomad.md",
    facts: `SPAIN DIGITAL NOMAD RESIDENCE — approved ELEVAY source
- Residence in Spain for people whose work can be done remotely and is not tied to one place: remote employees, freelancers, and company owners holding more than 50% of a company that is at least one year old.
- Minimum income: €35,000 a year for the applicant (about €2,917 a month; owner-confirmed — replaces the older €2,334/month figure); add €13,500 for a spouse and €5,000 per child (e.g. €48,500 couple, €53,500 with one child, €58,500 with two children).
- Children up to 26 can join if they are still studying, unmarried and have no business in their name.
- Stated benefits: almost all the rights of Spanish citizens except voting and standing for election — free education for children, opening companies and bank accounts, travel within the Schengen Area.
- Apply from Egypt through the embassy (one-year residence) or, preferred, from inside Spain during the first visit (three-year residence); renewals every two years after that.
- No minimum stay in Spain; social-security payments and the declared income must be maintained for renewal.
- Social security about €87 per month in the first year (may continue into the second), about €300 per month from the third year.
- After approval: social-security registration, fingerprint appointment, bank account; residence card about three weeks after fingerprints (estimate).
- Main documents: passport, criminal-record certificate, commercial registration (company owners), last 3 months of bank statements, marriage certificate, children's birth certificates, university enrolment and single-status certificates for children over 18.
- Do NOT state tax figures or health-insurance claims in public content; invite a consultation instead. Never promise timelines or approval.`,
  },
  {
    key: "malta_pr",
    name: "Malta Permanent Residence",
    match: /malta|مالطا|\bmprp\b/i,
    file: "knowledge/malta-permanent-residence.md",
    facts: `MALTA PERMANENT RESIDENCE — approved ELEVAY source
- Permanent residence status (not citizenship) for the applicant and family: live in Malta without a fixed time limit; travel within the Schengen Area up to 90 days in any 180-day period.
- No automatic right to work; a work permit can be applied for later.
- Main cost: a government donation covering all family members, plus other government fees. The euro amount is awaiting owner confirmation: do NOT state any figure for Malta (and never a US-dollar figure); invite a consultation instead.
- Family: spouse, unmarried children up to 26, and parents or parents-in-law for additional fees.
- No requirement to live in Malta to keep the residence, and no visit needed before applying.
- Process: collect the main applicant's information → gather, authenticate and translate family documents → submit for government approval → after approval pay the donation → permanent residence issued.
- Government approval about six to eight months (estimate only — never present it as a promise).
- Do NOT state citizenship timelines or residence-for-citizenship rules in public content (not verified); citizenship may only be described as a separate process subject to official requirements.`,
  },
  {
    key: "antigua_cbi",
    name: "Antigua & Barbuda Citizenship by Investment",
    match: /antigua|barbuda|أنتيغوا|انتيغوا|أنتيجوا|انتيجوا|باربودا/i,
    file: "knowledge/antigua-barbuda-cbi.md",
    facts: `ANTIGUA & BARBUDA CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay country summary, Aug 2026; training guide 26 Oct 2026)
- Citizenship and a second passport for the applicant and eligible family through an economic contribution; programme in law since 2014 (Citizenship by Investment Act). Dual citizenship allowed.
- Routes (amounts in US dollars, plus processing, due-diligence, passport and other fees): National Development Fund contribution from $230,000 for a family of up to 4 ($245,000 for 5 or more), non-refundable; approved real estate from $300,000, held at least 5 years after citizenship; higher-education route $260,000 for families of 6 or more (includes one year of tuition for one family member); approved business from $1.5 million (or joint projects of at least $5 million).
- Family: spouse; children of the applicant or spouse (dependent, up to about 30); dependent parents/grandparents aged 55+; unmarried siblings under 18; family members can be added later.
- Light presence: about 5 days in Antigua & Barbuda within 5 years; no language requirement.
- Indicative processing about 4–6 months (estimate, never a promise; due diligence can take longer).
- Travel access claimed: over 150 destinations including the UK, the Schengen area and Hong Kong (brochure claim — never list stay rules or promise entry).
- Do NOT state in public content: tax claims, CARICOM work/residence rights, interview rules, the business joint-investment details, or any figure not listed above.
- Public-content rules for every citizenship programme: say "جنسية ثانية" / "جواز سفر ثانٍ" in text only — never show passports in images; never write تأشيرة or فيزا (describe travel as "دخول ميسّر" / "حرية سفر لأكثر من … وجهة"); every price is a starting contribution or investment "تبدأ من" plus government and due-diligence fees; always "subject to due diligence and government approval"; no approval, timeline, tax, resale or return guarantees; no legal or tax advice.`,
  },
  {
    key: "dominica_cbi",
    name: "Dominica Citizenship by Investment",
    match: /\bdominica\b|دومينيكا|دومنيكا/i,
    file: "knowledge/dominica-cbi.md",
    facts: `DOMINICA CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Commonwealth of Dominica — not the Dominican Republic; Elevay country summary, Aug 2026)
- Citizenship and a second passport through investment; programme running since 1993. Dual citizenship allowed; no residency requirement; no language requirement.
- Routes (US dollars, plus government, due-diligence, interview and other fees): Economic Diversification Fund contribution from $200,000 for a single applicant ($250,000 for a main applicant, spouse and two children), non-refundable; or authorised real estate from $200,000 (plus a separate government fee), held at least 3 years and then resellable to another programme applicant.
- Family: spouse; children under 18; children 18–30 in higher education and supported by the applicant; dependent parents/grandparents above 65.
- Interviews apply to applicants aged 16+.
- Timeline: the summary gives conflicting estimates (6–9 and 9–12 months) — do NOT state a timeline; invite a consultation.
- Travel access claimed: around 140 destinations including EU countries (brochure claim — never promise entry).
- Do NOT state in public content: tax claims, CARICOM work rights, eligibility for restricted nationalities, two/three-person contribution amounts, or any figure not listed above.
- Public-content rules for every citizenship programme: say "جنسية ثانية" / "جواز سفر ثانٍ" in text only — never show passports in images; never write تأشيرة or فيزا (describe travel as "دخول ميسّر" / "حرية سفر لأكثر من … وجهة"); every price is a starting contribution or investment "تبدأ من" plus government and due-diligence fees; always "subject to due diligence and government approval"; no approval, timeline, tax, resale or return guarantees; no legal or tax advice.`,
  },
  {
    key: "egypt_cbi",
    name: "Egypt Citizenship & Residence by Investment",
    match: /egypt(?:ian)?\s+(?:citizenship|residence|residency|passport|golden|cbi|rbi)|(?:citizenship|residence|residency)\s+(?:in|of|by investment in)\s+egypt|الجنسية المصرية|الجواز المصري|جواز السفر المصري|الإقامة في مصر|إقامة في مصر|الاقامة في مصر|اقامة في مصر/i,
    file: "knowledge/egypt-cbi-rbi.md",
    facts: `EGYPT CITIZENSHIP & RESIDENCE BY INVESTMENT — approved ELEVAY source (Elevay country summary, Aug 2026)
- Audience: non-Egyptian nationals (e.g. Arab and international families and investors living in or drawn to Egypt) — never address Egyptian citizens as if they need it.
- Citizenship routes (US dollars, plus a $10,000 government fee and professional fees): non-refundable donation of $250,000; real estate of at least $300,000 (one or more properties) held at least 5 years; company investment of at least $350,000 plus a $100,000 donation; or a $500,000 bank deposit refunded after 3 years without interest (in local currency at the exchange rate at the time — never promise a fixed dollar refund).
- Main applicant over 21; dependent children under 21; the spouse obtains citizenship after two years. Dual citizenship allowed; no residence requirement before applying.
- Indicative citizenship processing 6–9 months (estimate only; due diligence can take longer; the government may refuse at its discretion).
- Residence by investment (a renewable residence permit — not citizenship): property of at least $50,000 → 1-year permit, $100,000 → 3 years, $200,000 → 5 years; or a bank deposit of $50,000 → 1 year, $100,000 → 3 years.
- Do NOT state in public content: travel-destination counts (the summary conflicts: 66 vs 50), tax or privacy claims, automatic conversion of residence into citizenship, family pricing, or any figure not listed above.
- Public-content rules for every citizenship programme: say "جنسية ثانية" / "جواز سفر ثانٍ" in text only — never show passports in images; never write تأشيرة or فيزا (describe travel as "دخول ميسّر" / "حرية سفر لأكثر من … وجهة"); every price is a starting contribution or investment "تبدأ من" plus government and due-diligence fees; always "subject to due diligence and government approval"; no approval, timeline, tax, resale or return guarantees; no legal or tax advice.`,
  },
  {
    key: "nauru_cbi",
    name: "Nauru Citizenship by Investment (ECRCP)",
    match: /nauru|ناورو|\becrcp\b/i,
    file: "knowledge/nauru-cbi.md",
    facts: `NAURU CITIZENSHIP BY INVESTMENT — Economic and Climate Resilience Citizenship Program (ECRCP) — approved ELEVAY source (Elevay country summary, Aug 2026)
- Citizenship and a passport for the applicant and eligible family through a non-refundable contribution to the Nauru Treasury Fund, supporting climate resilience and national development. Dual citizenship allowed; no residency obligation or mandatory visit.
- Every principal applicant attends an interview (online or in person at an approved location); applications go only through licensed, accredited agents; lawful source of funds required.
- Family: spouse; unmarried dependent children up to 30; dependent parents; siblings of the applicant or spouse (extra charge).
- Indicative processing about 3–4 months (estimate only; due diligence can take longer).
- Travel access claimed: around 90 destinations including the UK (ETA), Hong Kong, Singapore and the UAE (brochure claim — never promise entry).
- PRICES: the fee table's currency is unconfirmed (AUD vs USD) — do NOT state any Nauru amount in public content; invite a consultation.
- Do NOT state tax or financial-privacy claims, restricted-jurisdiction details, or Australian/New Zealand rights.
- Public-content rules for every citizenship programme: say "جنسية ثانية" / "جواز سفر ثانٍ" in text only — never show passports in images; never write تأشيرة or فيزا (describe travel as "دخول ميسّر" / "حرية سفر لأكثر من … وجهة"); every price is a starting contribution or investment "تبدأ من" plus government and due-diligence fees; always "subject to due diligence and government approval"; no approval, timeline, tax, resale or return guarantees; no legal or tax advice.`,
  },
  {
    key: "sao_tome_cbi",
    name: "São Tomé and Príncipe Citizenship by Investment",
    match: /s[aã]o\s*tom[eé]|principe|príncipe|ساو تومي|ساوتومي|برينسيبي/i,
    file: "knowledge/sao-tome-principe-cbi.md",
    facts: `SÃO TOMÉ AND PRÍNCIPE CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay country summary, Aug 2026)
- Citizenship and a passport through a non-refundable donation to the National Development Fund (healthcare, education, infrastructure, energy, eco-tourism); programme launched in 2025. Dual citizenship allowed; no residency requirement or mandatory visits during the application; interview only in rare cases.
- Contribution (US dollars, plus submission, due-diligence, registration, ID and passport fees): from $90,000 for a single applicant; family packages of 2–4 members from $95,000.
- Family: spouse; unmarried dependent children up to 30; dependent parents/grandparents (55+, to be confirmed per case). Main applicant over 18.
- Indicative processing about 2 months as a guideline (may take longer with due diligence — never a promise).
- Travel access claimed: around 70 destinations including South Africa, Singapore and Hong Kong (brochure claim; the detailed list has 69 entries — say "around 70", never promise entry).
- Portuguese-speaking country (capital São Tomé, Gulf of Guinea); this gives NO rights in Portugal — never imply it.
- Do NOT state in public content: euro prices (quote US dollars only), tax or privacy claims, or any figure not listed above.
- Public-content rules for every citizenship programme: say "جنسية ثانية" / "جواز سفر ثانٍ" in text only — never show passports in images; never write تأشيرة or فيزا (describe travel as "دخول ميسّر" / "حرية سفر لأكثر من … وجهة"); every price is a starting contribution or investment "تبدأ من" plus government and due-diligence fees; always "subject to due diligence and government approval"; no approval, timeline, tax, resale or return guarantees; no legal or tax advice.`,
  },
];

export function matchPrograms(text: string) {
  const t = String(text || "");
  return PROGRAMS.filter((p) => p.match.test(t));
}

/** Fact block to put in a Claude prompt for this request/program. */
export function programFactsFor(text: string) {
  const hits = matchPrograms(text);
  const list = (hits.length ? hits : []).map((p) => p.facts).join("\n\n");
  return `${list ? list + "\n\n" : ""}PROGRAM FACT RULE: State program figures and conditions ONLY from the approved ELEVAY sources above${list ? "" : " (Spain Digital Nomad Residence, Malta Permanent Residence, Antigua & Barbuda, Dominica, Egypt, Nauru and São Tomé and Príncipe)"}. For any other program, do not state numbers, costs, timelines or eligibility details; speak in general benefit terms and invite a consultation. Always add the disclaimer.`;
}

/** Both fact sheets (for weekly planning and Q&A). */
export function allProgramFacts() {
  return PROGRAMS.map((p) => p.facts).join("\n\n");
}

/** Full approved Q&A text for detailed answers. */
export function fullProgramSource(text: string) {
  return matchPrograms(text).map((p) => assetText(p.file)).filter(Boolean).join("\n\n---\n\n");
}

// ------------------------------------------------------------------ creative direction
/** Condensed, binding rules from the ELEVAY creative direction files. */
export const CREATIVE_DIRECTION = `ELEVAY CREATIVE DIRECTION (binding)
People: every person Arab/Middle Eastern, in modern clothing that fits the scene — casual, smart-casual or formal (owner rule: casual is fine; not everyone needs to be formal) — always neat, tasteful and complete head to toe with matching footwear; suits always with polished formal shoes or elegant loafers; casual outfits with clean shoes or smart trainers (never slippers or house shoes).
Currency follows the content's country (captions, headlines and above all the voice-over): USA, Canada, Australia → US dollars (دولار أمريكي); United Kingdom → pounds sterling (جنيه إسترليني / باوند, never a bare جنيه); EU member countries (Spain, Portugal, Greece, Malta, Cyprus…) → euros (€ / EUR / يورو). No turbans, keffiyeh, ghutra, shemagh or random traditional accessories unless requested. Natural anatomy and hands, grounded feet, believable shadows, no wardrobe changes between shots.
Photography: warm natural light, premium editorial (luxury architecture / real-estate / international lifestyle campaign). Authentic European architecture, elegant apartments, terraces, offices, cafés, coastlines, city streets; remote-work, advisory, family and lifestyle moments; quiet confidence. Avoid generic stock travel photos, staged handshakes, impossible camera moves, distorted architecture, duplicated people.
Never: passports, visa imagery, flags as hero objects, approval seals or stamps, portals, sculptures, museum installations, abstract immigration symbols, QR codes, phone numbers, emails, WhatsApp, URLs, AI-drawn or AI-generated logo, logo on props/clothes/documents.
Color: ~90% ELEVAY palette in designed elements — off-white #FFEBDA, cream #FFE7D1, dark navy #3D4750, navy #445563, medium navy #4B6475, ELEVAY blue #5BA3B8, light teal #B3CFD4, soft gray #CCDBD5, white; gold (#FFBF5D, #EED38E, #EACA75, #C4985D) only as small accents. No neon, harsh black, fake HDR, heavy grain, busy patterns, glassmorphism, Canva-style templates or collages.
Static: editorial diagonal/asymmetric composition, no rectangular photo frames, no circles/squares or basic geometric shapes as decoration. English on-design text only, sentence case, Apex Sans. Exact official logo composited afterwards in a quiet corner with clear space.
Reel: vertical 9:16, 1080×1920, 30 fps, 4 scenes × 5 s (scene 1 hook/aspiration, 2 explanation, 3 trust/expertise/planning, 4 realistic outcome without guarantee), smooth restrained cinematic transitions, no on-screen text, then 3 s outro: the official logo file (origami-bird mark, as supplied) static and centered on pure white, no narration over the outro, music fades gently.
Voice-over: Egyptian Arabic by default; friendly, professional, premium and natural; about 40–50 Arabic words (about twenty seconds) across four approximately 5-second scenes; one connected message; no "مضمون" or "قبول أكيد", no legal or financial promises. Country names (Spain, Malta, Portugal…) and the company name Elevay written in English letters for correct pronunciation; all other words, including city names, in Arabic. Voice: the ELEVAY voice clone configured on elevay.vip. TTS format: "Speak in Egyptian Arabic with a friendly, professional advisory tone at a natural pace: [thoughtful] <script>". Narration audible over music (music about 25–30% lower under the voice).`;

export const DELIVERY_CHECKLIST = () => assetText("creative/delivery-checklist.md");

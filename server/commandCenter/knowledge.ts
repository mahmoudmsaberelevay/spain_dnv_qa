// @ts-nocheck
/*
 * ELEVAY approved sources for the AI Studio.
 *
 *   assets/knowledge/*.md   owner-approved program Q&A (Spain Digital Nomad Residence, Malta Permanent Residence)
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
- Main cost: a donation of approximately USD 100,000 covering all family members, plus other government fees (approximate).
- Family: spouse, unmarried children up to 26, and parents or parents-in-law for additional fees.
- No requirement to live in Malta to keep the residence, and no visit needed before applying.
- Process: collect the main applicant's information → gather, authenticate and translate family documents → submit for government approval → after approval pay the donation → permanent residence issued.
- Government approval about six to eight months (estimate only — never present it as a promise).
- Do NOT state citizenship timelines or residence-for-citizenship rules in public content (not verified); citizenship may only be described as a separate process subject to official requirements.`,
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
  return `${list ? list + "\n\n" : ""}PROGRAM FACT RULE: State program figures and conditions ONLY from the approved ELEVAY sources above${list ? "" : " (Spain Digital Nomad Residence and Malta Permanent Residence)"}. For any other program, do not state numbers, costs, timelines or eligibility details; speak in general benefit terms and invite a consultation. Always add the disclaimer.`;
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
People: every person Arab/Middle Eastern, modern elegant clothing, complete realistic outfit head to toe; suits always with polished formal shoes or elegant loafers (never slippers, sandals, sneakers or house shoes). No turbans, keffiyeh, ghutra, shemagh or random traditional accessories unless requested. Natural anatomy and hands, grounded feet, believable shadows, no wardrobe changes between shots.
Photography: warm natural light, premium editorial (luxury architecture / real-estate / international lifestyle campaign). Authentic European architecture, elegant apartments, terraces, offices, cafés, coastlines, city streets; remote-work, advisory, family and lifestyle moments; quiet confidence. Avoid generic stock travel photos, staged handshakes, impossible camera moves, distorted architecture, duplicated people.
Never: passports, visa imagery, flags as hero objects, approval seals or stamps, portals, sculptures, museum installations, abstract immigration symbols, QR codes, phone numbers, emails, WhatsApp, URLs, AI-drawn or AI-generated logo, logo on props/clothes/documents.
Color: ~90% ELEVAY palette in designed elements — off-white #FFEBDA, cream #FFE7D1, dark navy #3D4750, navy #445563, medium navy #4B6475, ELEVAY blue #5BA3B8, light teal #B3CFD4, soft gray #CCDBD5, white; gold (#FFBF5D, #EED38E, #EACA75, #C4985D) only as small accents. No neon, harsh black, fake HDR, heavy grain, busy patterns, glassmorphism, Canva-style templates or collages.
Static: editorial diagonal/asymmetric composition, no rectangular photo frames, no circles/squares or basic geometric shapes as decoration. English on-design text only, sentence case, Apex Sans. Exact official logo composited afterwards in a quiet corner with clear space.
Reel: vertical 9:16, 1080×1920, 30 fps, 4 scenes × 5 s (scene 1 hook/aspiration, 2 explanation, 3 trust/expertise/planning, 4 realistic outcome without guarantee), smooth restrained cinematic transitions, no on-screen text, then 3 s outro: the official logo file (origami-bird mark, as supplied) static and centered on pure white, no narration over the outro, music fades gently.
Voice-over: Egyptian Arabic by default; warm, thoughtful, premium, reassuring, calm; 8–13 Arabic words per 5-second scene; one idea per scene; no "مضمون" or "قبول أكيد", no legal or financial promises. Country, city, program and company names written in English letters (Spain, Malta, Lisbon, ELEVAY) for correct pronunciation. Voice: the ELEVAY voice clone configured on elevay.vip. TTS format: "Speak in Egyptian Arabic with a warm, thoughtful, premium advisory tone at a natural, calm pace: [thoughtful] <script>". Narration audible over music (music about 25–30% lower under the voice).`;

export const DELIVERY_CHECKLIST = () => assetText("creative/delivery-checklist.md");

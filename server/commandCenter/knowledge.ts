// @ts-nocheck
/*
 * ELEVAY approved sources for the AI Studio.
 *
 *   assets/knowledge/summaries/*.md  the owner's 26 ELEVAY program summaries (trusted sources, 1 Nov 2026)
 *   assets/knowledge/*.md   earlier owner-approved Q&A and training guides (Spain DNV, Malta PR, Antigua & Barbuda,
 *                           Dominica, Egypt, Nauru, São Tomé and Príncipe)
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
 * Fact sheets distilled from the owner's ELEVAY program summaries (Downloads/Summaries, 26 PDFs, checked by Elevay
 * against official sources in October 2026; given to the system as trusted sources on 1 Nov 2026). These replace the
 * older Q&A figures where they differ (e.g. Spain DNV income, Malta PR amounts, Nauru currency, Portugal income rules).
 * Full texts: assets/knowledge/summaries/*.md. Egypt residence by investment still comes from the Aug 2026 country summary.
 *
 * Matching: a program is picked when its own name/term appears (`unique`, or the country plus a program term), otherwise
 * every program of a country named in the text is picked (e.g. "Spain" → all four Spain routes).
 */
const CBI_RULES = `- Public-content rules for every citizenship programme: say "جنسية ثانية" / "جواز سفر ثانٍ" in text only — never show passports in images; never write تأشيرة or فيزا (describe travel as "دخول ميسّر" / "حرية سفر لأكثر من … وجهة"); every price is a starting contribution or investment "تبدأ من" plus government and due-diligence fees; always "subject to due diligence and government approval"; no approval, timeline, tax, resale or return guarantees; no legal or tax advice.`;
const RES_RULES = `- Public-content rules for every residence programme: say "إقامة" / "Residency" (the Arabic text never says تأشيرة or فيزا, even where the official name contains "Visa"); figures are minimums "تبدأ من" / "حد أدنى"; always "subject to government approval and individual circumstances"; never promise approval, renewal, processing time, citizenship or a tax result; no legal or tax advice; government fees are only mentioned as "تُعرض في مرحلة العرض" unless a figure is listed above.`;
const PT_COMMON = `- Visa valid 4 months (two entries); then a residence permit from AIMA valid 2 years, renewable in 3-year periods while the conditions are met; renewal is never guaranteed.
- Presence: the permit can be cancelled after more than 6 consecutive months or 8 months in total of unjustified absence during the 2 years — plan around 16 of 24 months in Portugal (planning guide, not a legal minimum).
- Processing about 3–6 months (Elevay experience; not official, never a promise). Government fees (AIMA, from 1 Mar 2026): national visa €110, residence permit €114.30.
- Family: spouse; minor or dependent children and adopted minors; unmarried adult children who are studying; dependent parents of the applicant or spouse; minor siblings under guardianship.
- Citizenship: under Organic Law 1/2026 (from 19 May 2026) nationality by residence needs 10 years of legal residence (7 for Portuguese-speaking and EU nationals); never automatic or guaranteed — do NOT use older "5 years to a Portuguese passport" claims.`;
const ES_FAMILY = `- Family: spouse or partner (unregistered partner: 1 year of cohabitation unless common children); minor children; adult children 18 to under 26 who depend on the holder (studying or registered job-seekers, no income), 26+ only with an incapacity; dependent parents and grandparents (over 80 presumed dependent). Family can apply with the holder or later.`;

const SPAIN = /\bspain\b|espa[ñn]a|إسبانيا|اسبانيا|\bmadrid\b|barcelona|مدريد|برشلونة|valencia|malaga|málaga/i;
const PORTUGAL = /portugal|portuguese residen|البرتغال|lisbon|lisboa|\bporto\b|لشبونة/i;
const MALTA = /\bmalta\b|maltese|مالطا|\bgozo\b/i;
const CARIBBEAN = /caribbean|الكاريبي|كاريبي|كاريبية/i;

export const PROGRAMS = [
  // ---------------------------------------------------------------- Spain
  {
    key: "spain_dnv", group: "spain", country: SPAIN,
    name: "Spain Digital Nomad Residence",
    unique: /\bdnv\b/i,
    terms: /digital\s*nomad|nomad|remote\s*work|teleworker|ديجيتال|نوماد|الرحال|رحالة|العمل عن ?بعد|العمل عن بُعد|عمل عن بعد|ريموت/i,
    file: ["knowledge/summaries/spain-digital-nomad.md", "knowledge/spain-digital-nomad.md"],
    facts: `SPAIN DIGITAL NOMAD RESIDENCE — approved ELEVAY source (Elevay summary checked against Law 14/2013 and the UGE, Oct 2026)
- Residence for adult non-EU nationals who work remotely, only through IT/telecom means, for companies located outside Spain (employees work only for foreign companies; freelancers may also serve Spanish clients for up to 20% of their activity). Programme open (Law 14/2013, Arts. 74 bis–74 quinquies).
- Conditions: a university/vocational/business-school degree OR at least 3 years of professional experience; the foreign company active for at least 1 year; the work relationship running at least 3 months before applying, with remote work allowed; over 18, no criminal record, health insurance.
- Income (gross, from the 2026 minimum wage of €17,094 — Elevay calculation; replaces the older €35,000 and €2,334/month figures): main applicant 200% = €34,188 a year (about €2,849 a month); first family member +€12,820.50 a year; each further family member +€4,273.50 a year.
${ES_FAMILY} Family members may work in Spain.
- Two routes: from abroad, a teleworking visa from a Spanish consulate valid up to 1 year; or from inside Spain, a residence authorisation of up to 3 years, renewable in 2-year periods while conditions are met. The UGE legal maximum to decide the in-Spain authorisation is 20 days (legal maximum, never a promise).
- Self-employed holders must register with Social Security (RETA) straight away after approval; a reduced first-year quota exists (do NOT state its amount in public content).
- All fees are presented at proposal stage. Do NOT state tax claims, health-insurance claims or approval/timeline promises.`,
  },
  {
    key: "spain_nlv", group: "spain", country: SPAIN,
    name: "Spain Non-Lucrative Residence",
    unique: /non[-\s]?lucrative|\bnlv\b/i,
    terms: /retire|retirement|passive income|without work|own means|غير ربحي|غير الربحية|بدون عمل|متقاعد|التقاعد|دخل سلبي/i,
    file: ["knowledge/summaries/spain-non-lucrative.md"],
    facts: `SPAIN NON-LUCRATIVE RESIDENCE — approved ELEVAY source (Elevay summary, Organic Law 4/2000 and Royal Decree 1155/2024, Oct 2026)
- Temporary residence for non-EU nationals who have enough of their own means to live in Spain WITHOUT working; no work or professional activity is allowed (it cannot be used for remote work or as a base for the digital nomad route). Programme open.
- Means (IPREM €600/month): main applicant 400% = €2,400 a month, €28,800 a year (gross); each dependant +100% = €7,200 a year.
- Apply in person at the Spanish consulate covering the place of residence; consulate decision legal maximum 1 month (no decision = refused at this stage). Initial validity 1 year from entry; renewals for 2 years.
- Renewal needs: means kept, health insurance, school-age children enrolled, more than 183 days in Spain in the calendar year, no criminal record. Renewal is never promised.
- Health insurance with an insurer authorised in Spain plus a medical certificate; no criminal record in the last 5 years.
- Family: spouse or registered/stable partner and children under 18; adult children only with a disability that prevents self-support.
- Fees presented at proposal stage. The 183-day rule is an immigration condition, not a tax statement — no tax claims.`,
  },
  {
    key: "spain_entrepreneur", group: "spain", country: SPAIN,
    name: "Spain Entrepreneur Residence",
    unique: /\benisa\b/i,
    terms: /entrepreneur|start-?up|innovative business|business project|رائد أعمال|رواد الأعمال|ريادة|مشروع مبتكر|شركة ناشئة|ستارت/i,
    file: ["knowledge/summaries/spain-entrepreneur.md"],
    facts: `SPAIN ENTREPRENEUR RESIDENCE — approved ELEVAY source (Elevay summary, Law 14/2013 Arts. 68–70, Oct 2026)
- For non-EU nationals over 18 who start, run or manage an INNOVATIVE business activity of special economic interest for Spain. Programme open.
- A favourable report from ENISA on the project is mandatory (due within 10 working days of the UGE request); it judges the founder profile, the business plan and the value added for Spain. No minimum investment and no minimum job creation are set — the project is judged on its merits, so a favourable report can never be promised.
- Entrepreneur visa valid 1 year for preparations; initial residence authorisation 3 years; renewals in 2-year periods while conditions hold. Authorisation decision legal maximum 20 days from filing (never a promise).
${ES_FAMILY}
- Social Security obligations must be met before starting any activity. Fees presented at proposal stage; no tax claims.`,
  },
  {
    key: "spain_hqp", group: "spain", country: SPAIN,
    name: "Spain Highly Qualified Professional Residence",
    unique: /highly\s*qualified|blue\s*card|البطاقة الزرقاء/i,
    terms: /qualified professional|job offer|employer|work permit|كفاءات|الكفاءات|عرض عمل|عقد عمل|مؤهل/i,
    file: ["knowledge/summaries/spain-highly-qualified.md"],
    facts: `SPAIN HIGHLY QUALIFIED PROFESSIONAL RESIDENCE — approved ELEVAY source (Elevay summary, Law 14/2013 Art. 71, Oct 2026)
- Employer-led: the hiring company applies for the professional. Categories: management or highly qualified staff of large companies/groups; staff in projects of general interest; graduates of renowned universities and business schools. Programme open.
- Minimum gross salary in the contract or firm offer: €41,356.36 a year (2026; 1.4× the national average salary). A reduced threshold applies only in limited cases.
- Company tests (large-company category): e.g. more than 250 workers in Spain, net turnover over €50 million, or qualifying foreign investment; strategic-sector SMEs can qualify.
- Qualification: a degree or 3 years of equivalent experience (EU Blue Card route: higher qualification or 5 years' experience plus a contract of at least 6 months).
- Authorisation: contract length plus 3 months, never more than 3 years; renewals in 2-year periods; decision legal maximum 20 days (never a promise). Allows residence and work throughout Spain.
${ES_FAMILY}
- Fees presented at proposal stage; no tax claims.`,
  },
  // ---------------------------------------------------------------- Portugal
  {
    key: "portugal_d7", group: "portugal", country: PORTUGAL,
    name: "Portugal D7 Residence (passive income)",
    unique: /\bd7\b/i,
    terms: /passive income|pension|retire|retirement|دخل سلبي|معاش|التقاعد|متقاعد/i,
    file: ["knowledge/summaries/portugal-d7.md"],
    facts: `PORTUGAL D7 RESIDENCE (passive income) — approved ELEVAY source (Elevay summary, Law 23/2007, Oct 2026)
- For people with a regular pension or income from property, intellectual property or financial assets.
- Income formula on the 2026 Portuguese minimum wage (€920/month), assured for at least 12 months (replaces the older €760/month figure): main applicant €11,040 a year (€920 a month); spouse +€5,520; each child +€3,312; couple €16,560; couple with one child €19,872. No fixed D7 amount exists in law; the minimum wage is reviewed each January.
${PT_COMMON}
${RES_RULES}`,
  },
  {
    key: "portugal_d8", group: "portugal", country: PORTUGAL,
    name: "Portugal D8 Digital Nomad Residence",
    unique: /\bd8\b/i,
    terms: /digital\s*nomad|nomad|remote\s*work|ديجيتال|نوماد|رحالة|الرحال|العمل عن ?بعد|عمل عن بعد|ريموت/i,
    file: ["knowledge/summaries/portugal-d8.md"],
    facts: `PORTUGAL D8 DIGITAL NOMAD RESIDENCE — approved ELEVAY source (Elevay summary, Law 23/2007 Art. 61-B, Oct 2026)
- For remote work for a person or company based outside Portugal (employees and self-employed).
- Income: average of at least 4× the minimum wage over the last 3 months = €3,680 a month (€44,160 a year), based on the 2026 minimum wage of €920 (replaces the older €3,040 figure).
- Proof of the remote-work link: work contract/employer declaration, or company/services contracts; plus a document attesting fiscal residence.
${PT_COMMON}
${RES_RULES}`,
  },
  {
    key: "portugal_d2", group: "portugal", country: PORTUGAL,
    name: "Portugal D2 Residence (entrepreneur / independent professional)",
    unique: /\bd2\b/i,
    terms: /entrepreneur|start-?up|freelanc|independent professional|business owner|رائد أعمال|رواد الأعمال|ريادة|مستقل|فريلانس|شركة ناشئة|مشروع/i,
    file: ["knowledge/summaries/portugal-d2.md"],
    facts: `PORTUGAL D2 RESIDENCE — approved ELEVAY source (Elevay summary, Law 23/2007, Oct 2026)
- For people who will work for themselves or run a business in Portugal. Three routes: independent professional (services contract or written proposal); immigrant entrepreneur (no legal minimum investment — show investment made or financial means in Portugal plus intent to invest); Startup Visa (project accepted by a certified incubator, IAPMEI declaration).
- Indicative funds (Elevay calculation, about 7 months × €920 minimum wage — not an official figure, confirm with the consulate): one adult about €6,440; couple about €9,660; each child about +€1,932.
${PT_COMMON}
${RES_RULES}`,
  },
  {
    key: "portugal_golden", group: "portugal", country: PORTUGAL,
    name: "Portugal Golden Residence (investment)",
    unique: /portugal\s+golden|golden\s+(?:visa|residen\w*)\s+(?:in\s+)?portugal|الإقامة الذهبية (?:في )?البرتغال|الاقامة الذهبية (?:في )?البرتغال|البرتغال الذهبية/i,
    terms: /golden|investment|investor|fund|الذهبية|استثمار|مستثمر|صندوق/i,
    file: ["knowledge/summaries/portugal-golden.md"],
    facts: `PORTUGAL GOLDEN RESIDENCE (investment, Law 23/2007 Art. 90-A) — approved ELEVAY source (Elevay summary, Oct 2026)
- Residence for investment, kept for at least 5 years. Six routes: job creation (10 jobs; 8 in low-density areas); scientific research €500,000 (€400,000 low-density); culture/heritage €250,000 (€200,000 low-density); venture-capital or company-capitalisation fund units €500,000 (≥60% in Portuguese companies, 5-year maturity); non-real-estate investment funds €500,000; company set-up or capital increase €500,000 with 5 permanent jobs.
- There is NO real-estate route — never mention buying property for the Portugal Golden residence (the older €250,000–€500,000 real-estate figures are obsolete).
- Minimum stay 7 days a year (Elevay management confirmation); renewals in 2-year periods while the investment is kept. Family reunification without the usual 2-year wait.
- Processing about 24 months on current Elevay cases (AIMA is working to reduce it; never a promise).
- Government fees (AIMA, from 1 Mar 2026): application analysis €842.80; grant €8,418.90 per person (investor and each family member); renewal €4,210.30 per person.
- Permanent residence after 5 years of temporary residence with basic Portuguese; citizenship under Organic Law 1/2026 needs 10 years of legal residence (7 for Portuguese-speaking and EU nationals) — never automatic or guaranteed.
- Family: spouse; minor or dependent children; unmarried adult children studying; dependent parents; minor siblings under guardianship.
${RES_RULES}`,
  },
  // ---------------------------------------------------------------- Greece, Hungary, Latvia
  {
    key: "greece_golden", group: "greece", country: /greece|greek|اليونان|يوناني|athens|أثينا|اثينا|thessaloniki|mykonos|santorini/i,
    name: "Greece Golden Residence (investment)",
    file: ["knowledge/summaries/greece-golden.md"],
    facts: `GREECE GOLDEN RESIDENCE (residence by investment) — approved ELEVAY source (Elevay summary, Oct 2026)
- A 5-year Greek residence permit, renewable while the investment (e.g. the property) is kept. Allows living in Greece and operating a business, NOT seeking employment; free movement in the Schengen Area.
- Real estate minimums: €800,000 in Attica, Thessaloniki regional unit, Mykonos, Santorini and islands with more than 3,100 people; €400,000 everywhere else; €250,000 for converting a non-residential property to residential use or a restored listed building.
- Other routes: €800,000 listed Greek shares/corporate bonds/government bonds; €500,000 capital increases, REIC, qualifying funds, government bonds (≥3 years left), 1-year time deposit in a Greek bank, or establishing a business; €350,000 Alternative Investment Fund investing only in Greece; €250,000 registered start-up (max 33% stake, at least 2 jobs, held 5 years); tourist accommodation €800,000/€400,000 by area.
- Costs: government fees €2,016 for the main applicant; family members €100 each; property transfer tax about 3.09% today. An increase to 15% for non-EU buyers is announced from 1 July 2027, subject to legislation — present it only as "announced", never as decided.
- Processing about 5–6 months (Elevay experience, never a promise).
${RES_RULES}`,
  },
  {
    key: "hungary_guest_investor", group: "hungary", country: /hungary|hungarian|المجر|هنغاريا|budapest|بودابست/i,
    name: "Hungary Guest Investor Residence",
    file: ["knowledge/summaries/hungary-guest-investor.md"],
    facts: `HUNGARY GUEST INVESTOR RESIDENCE PERMIT — approved ELEVAY source (Elevay summary, Act XC of 2023, open, Oct 2026)
- A residence permit (not Hungarian or EU citizenship) for one of two investments: at least €250,000 in a real-estate fund registered by the Hungarian National Bank, held directly for at least 5 years; or a donation of at least €1,000,000 to a qualifying higher-education institution.
- Permit valid up to 10 years, extendable once for up to 10 more years (extension is requested, never automatic).
- The holder can run a business or work for others; family members (spouse and minor children) receive a family permit that also allows work. Adult children and parents are not covered by the Act.
- Accommodation in Hungary is required; the Act sets no minimum stay. Investment changes must be reported within 5 days.
- Statutory administrative period 21 days (excludes document steps; never a promise). Fees presented at proposal stage.
${RES_RULES}`,
  },
  {
    key: "latvia_investor", group: "latvia", country: /latvia|latvian|لاتفيا|\briga\b|ريغا/i,
    name: "Latvia Investor Residence",
    file: ["knowledge/summaries/latvia-investor.md"],
    facts: `LATVIA INVESTOR RESIDENCE — approved ELEVAY source (Elevay summary, new Immigration Law in force 15 Sep 2026)
- Temporary residence permit of up to 2 years, renewable while the conditions still exist, for investing in the share capital of a Latvian company: €50,000 (smaller company: up to 50 employees and up to €10 million turnover/balance sheet; up to 10 foreigners per company) or €100,000 (larger company).
- One-off, non-refundable €10,000 state budget payment when requesting the first permit.
- Ongoing condition: the company pays at least €40,000 in taxes each year (€100,000 for the larger tier) — otherwise the permit lapses.
- This is now Latvia's only investor route (older real-estate routes must NOT be mentioned). Family: spouse and minor children.
- Permanent residence only as EU long-term resident after 5 years of continuous residence, with Latvian at A2 level — never guaranteed.
- Fees presented at proposal stage.
${RES_RULES}`,
  },
  // ---------------------------------------------------------------- Malta
  {
    key: "malta_pr", group: "malta", country: MALTA,
    name: "Malta Permanent Residence (MPRP)",
    unique: /\bmprp\b/i,
    terms: /permanent|الإقامة الدائمة|الاقامة الدائمة|إقامة دائمة|اقامة دائمة|دائمة/i,
    file: ["knowledge/summaries/malta-mprp.md", "knowledge/malta-permanent-residence.md"],
    facts: `MALTA PERMANENT RESIDENCE PROGRAMME (MPRP) — approved ELEVAY source (Elevay summary, Residency Malta, Oct 2026; replaces the earlier "no figures" rule)
- Permanent residence (not citizenship) for non-EU/EEA/Swiss nationals: the right to live in Malta permanently and Schengen travel up to 90 days in any 180; no automatic right to work.
- Property, held as the residence for at least 5 years: rent at least €14,000 a year, or buy at least €375,000 (Malta or Gozo).
- Capital assets kept for 5 years: €500,000 (of which €150,000 financial) or €650,000 (of which €75,000 financial).
- Government payments (euros only): administration fee €60,000 (non-refundable; €15,000 then €45,000); government contribution €37,000; €7,500 per additional dependant (children 18–28, parents/grandparents); €2,000 donation to a local NGO; residence card €500 per person. No official total exists — never state a total; invite a consultation for a personal estimate.
- Family: spouse/partner; children under 18; unmarried dependent children 18–28; dependent parents and grandparents; adult children with a certified disability (up to four generations).
- No minimum days in Malta; a 1-year temporary permit can be requested at submission. Processing about 6–9 months (Elevay experience, never a promise).
- Citizenship: MPRP gives no citizenship; naturalisation is a separate general process (residence in Malta for years, language, Minister's discretion) — never imply a route to a passport.
${RES_RULES}`,
  },
  {
    key: "malta_nomad", group: "malta", country: MALTA,
    name: "Malta Nomad Residence",
    terms: /nomad|remote\s*work|ديجيتال|نوماد|رحالة|الرحال|العمل عن ?بعد|عمل عن بعد|ريموت/i,
    file: ["knowledge/summaries/malta-nomad.md"],
    facts: `MALTA NOMAD RESIDENCE PERMIT — approved ELEVAY source (Elevay summary, Residency Malta, Oct 2026)
- For non-EU/EEA/Swiss nationals 18+ who work remotely as employees of a foreign employer, owners of a foreign business, or freelancers for foreign clients. Cannot work for Malta-based employers or clients.
- Minimum gross income €42,000 a year; rental/purchase agreement for the stay; health insurance (EU incl. Malta and UK, at least €100,000 cover, prepaid 1 year); police certificate.
- Permit valid 1 year, renewable 3 times (maximum 4 years) at Residency Malta's discretion; renewal needs at least 5 months in Malta in the previous 12. It does NOT lead to long-term residence or citizenship.
- Fees: €300 application per person, €100 residence card per person. Processing expectation about 30 working days from payment (never a promise).
- Family: spouse, minor children, dependent adult children.
- Not eligible: nationals or close ties to Afghanistan, North Korea, Iran, DR Congo, Somalia, South Sudan, Sudan, Yemen, Venezuela, and currently Russia and Belarus.
${RES_RULES}`,
  },
  {
    key: "malta_tax", group: "malta", country: MALTA,
    name: "Malta Tax-Residence Programmes (GRP / RP / Retirement)",
    unique: /global residence programme|global residence program|\bgrp\b|malta retirement/i,
    terms: /\btax\b|retire|pension|ضريب|ضرائب|معاش|متقاعد|التقاعد/i,
    file: ["knowledge/summaries/malta-tax-residence.md"],
    facts: `MALTA TAX-RESIDENCE PROGRAMMES — approved ELEVAY source (Elevay summary, Oct 2026): Global Residence Programme (non-EU), Residence Programme (EU/EEA/Swiss), Malta Retirement Programme (pensioners)
- Official programme rule: 15% tax on foreign income received in Malta, with a minimum tax of €15,000 a year (Retirement: €7,500), plus €500 per dependant. Other income taxed separately.
- Property as primary residence: buy at least €275,000 in Malta or €220,000 in Gozo/the south, or rent at least €9,600 a year (€8,750 Gozo/south). No more than 183 days a year in any other country; Retirement Programme needs at least 90 days a year in Malta (5-year average).
- Administration fee €6,000 (€5,500 property owned in the south); Retirement €2,500.
- From 1 January 2027 new rules apply: minimum tax €35,000 (retired pensioner €15,000), fee €8,500, property at least €700,000 to buy or €14,000 a year to rent. Status granted or applications received by 31 December 2026 stay under the earlier rules until 31 December 2031 — a true, dated reason to act this year.
- Public content may state these official programme parameters, but NEVER a personal tax calculation, savings claim or advice; always add that tax depends on personal circumstances and independent tax advice is needed.
${RES_RULES}`,
  },
  // ---------------------------------------------------------------- UAE, Türkiye, Canada
  {
    key: "uae_golden", group: "uae", country: /\buae\b|emirates|الإمارات|الامارات|إماراتي|اماراتي/i,
    name: "UAE Golden Residence (investor)",
    unique: /golden\s+(?:visa|residen\w*)\s+(?:in\s+)?(?:the\s+)?(?:uae|dubai|emirates)|(?:uae|dubai)\s+golden|الإقامة الذهبية (?:في )?(?:الإمارات|الامارات|دبي)|الاقامة الذهبية (?:في )?(?:الإمارات|الامارات|دبي)|الإقامة الذهبية الإماراتية/i,
    file: ["knowledge/summaries/uae-golden-residence.md"],
    facts: `UAE GOLDEN RESIDENCE (investor) — approved ELEVAY source (Elevay summary, ICP / DLD / GDRFA, Oct 2026)
- A 10-year UAE residence, renewable if the conditions are still met, with no sponsor needed. Arabic content: "الإقامة الذهبية" — never "التأشيرة الذهبية" or "الفيزا الذهبية". Amounts in UAE dirhams (درهم إماراتي / AED).
- Investor routes: property worth at least AED 2,000,000 in total (off-plan from approved developers and mortgaged property accepted; held for the residence period); a deposit of at least AED 2,000,000 (own funds, not a loan); company capital or partner share of at least AED 2,000,000; or federal taxes paid of at least AED 250,000 a year by the investor's company.
- Family: spouse, children and parents can be sponsored. Health insurance for the investor and family.
- Holders are exempt from the usual 6-month absence rule (authorities' statement — not unlimited absence, never a guarantee).
- Fees presented at proposal stage. Renewal requires all conditions still met.
${RES_RULES}`,
  },
  {
    key: "turkiye_cbi", group: "turkiye", country: /turkey|t[uü]rkiye|turkish|تركيا|التركية|istanbul|إسطنبول|اسطنبول/i,
    name: "Türkiye Citizenship by Investment",
    file: ["knowledge/summaries/turkiye.md"],
    facts: `TÜRKIYE CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay summary, Oct 2026)
- Turkish citizenship for a qualifying investment; spouse and children under 18 apply together with the main applicant. Every application is decided by the President of Türkiye — approval is never guaranteed. Dual citizenship allowed; no residence requirement.
- Routes (US dollars, converted at the Central Bank rate): real estate from $400,000, not sold for 3 years (title-deed restriction); or $500,000 in fixed capital investment, a bank deposit, government bonds, or real-estate/venture-capital fund shares, each held 3 years.
- Costs: government fee $1,000 per person; property transfer and insurance about 5–7% (budget estimate).
- Process: certificate of eligibility → residence permit → citizenship application → security archive check → Presidential decision.
- Typical time about 9–12 months (Elevay experience, never a promise). Travel access claimed: around 120 destinations (Passport Index, indicative — never promise entry).
${CBI_RULES}`,
  },
  {
    key: "canada_entrepreneur", group: "canada", country: /canada|canadian|كندا|كندي|provincial nominee|\bpnp\b|british columbia|alberta|nova scotia|new brunswick|newfoundland/i,
    name: "Canada Provincial Entrepreneur Streams",
    file: ["knowledge/summaries/canada-provincial-entrepreneur.md"],
    facts: `CANADA PROVINCIAL ENTREPRENEUR STREAMS — approved ELEVAY source (Elevay summary, Oct 2026). ELEVAY's Canada offer here is the provincial ENTREPRENEUR route, not skilled-worker Express Entry (no approved source for that).
- Five provinces: British Columbia (Base and Regional, by invitation), Alberta Rural Entrepreneur (open), Nova Scotia Entrepreneur (by invitation), New Brunswick Business Immigration (active), Newfoundland and Labrador International Entrepreneur (open).
- In every stream the entrepreneur must move to the province, run the business there and meet a performance agreement BEFORE a provincial nomination; permanent residence is then applied for federally (IRCC about 13 months for that stage, Oct 2026 — not the total time).
- Requirements vary by stream: business-owner experience, at least one new local job, language level CLB 4–5, minimum net worth and investment set by each province.
- CURRENCY: the official amounts are in Canadian dollars; the owner's rule requires US dollars for Canada content, and converting would misstate official figures — so do NOT state any Canada amount in public content (captions, headlines, voice-over); invite a consultation instead. Internal reference only: lowest stream minimums CAD 300,000 net worth and CAD 100,000 investment (BC Regional, Alberta Rural).
- Family: spouse or common-law partner and dependent children under 22.
- Never promise an invitation, nomination or approval.
${RES_RULES}`,
  },
  // ---------------------------------------------------------------- Caribbean & other citizenship
  {
    key: "antigua_cbi", group: "caribbean", country: CARIBBEAN,
    name: "Antigua & Barbuda Citizenship by Investment",
    unique: /antigua|barbuda|أنتيغوا|انتيغوا|أنتيجوا|انتيجوا|باربودا/i,
    file: ["knowledge/summaries/antigua-barbuda.md", "knowledge/antigua-barbuda-cbi.md"],
    facts: `ANTIGUA & BARBUDA CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay summary, CIU, Oct 2026)
- Citizenship for the applicant and qualifying family in one application; dual citizenship allowed.
- Routes (US dollars): National Development Fund $230,000 per application (spouse, dependent children and parents 55+ included, no extra NDF contribution); University of the West Indies Fund $260,000 for a family of at least six (includes a one-year tuition scholarship for one member); approved real estate $300,000, held 5 years; approved business $1,500,000 (or $5,000,000 jointly).
- Fees on top: government processing $10,000 single / $20,000 family of up to four; due diligence $8,500 main applicant, $5,000 spouse, $2,000–4,000 per older dependant; passport $300 per person.
- Family: spouse; children 0–30 financially dependent; parents/grandparents 55+; unmarried siblings.
- Presence: at least 5 days in Antigua & Barbuda in each five-year period after citizenship.
- Typical time about 9–12 months on current Elevay files (never a promise). Travel access: 144+ destinations (Passport Index, indicative — never promise entry).
- Restricted: nationals of Afghanistan, Iran, North Korea, Somalia, Sudan and Yemen only under strict conditions. EU context: rules for Caribbean programmes may change by 2028 (EU request) — only state this truthfully.
${CBI_RULES}`,
  },
  {
    key: "dominica_cbi", group: "caribbean", country: CARIBBEAN,
    name: "Dominica Citizenship by Investment",
    unique: /\bdominica\b|دومينيكا|دومنيكا/i,
    file: ["knowledge/summaries/dominica.md", "knowledge/dominica-cbi.md"],
    facts: `DOMINICA CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Commonwealth of Dominica — not the Dominican Republic; Elevay summary, CBIU, Oct 2026)
- Citizenship through authorised agents; dual citizenship allowed; no requirement to live in Dominica.
- Routes (US dollars): Economic Diversification Fund $200,000 single or $250,000 for the main applicant plus up to three dependants (additional: $25,000 under 18, $40,000 aged 18+); or approved real estate $200,000 plus government fees of $75,000 single / $100,000 family, held 3 years (resale to non-applicants) or 5 years (resale to applicants).
- Fees: processing $1,000; due diligence $7,500 main applicant, $4,000 per dependant 16+; interview $1,000 per applicant 16+; naturalisation certificate $500 and passport $300 per person.
- Family: spouse; children under 18; children 18–30 in higher education and supported; unmarried daughters under 25 living at home; parents/grandparents over 65.
- Mandatory interview for applicants 16+ (usually virtual). Banned: Belarus, Russia, Northern Iraq; suspended: Yemen; Iran, North Korea and Sudan restricted.
- Typical time about 9–12 months on current Elevay files (never a promise). Travel access: around 135 destinations (indicative — never promise entry).
${CBI_RULES}`,
  },
  {
    key: "grenada_cbi", group: "caribbean", country: CARIBBEAN,
    name: "Grenada Citizenship by Investment",
    unique: /grenada|غرينادا|جرينادا|غرانادا/i,
    file: ["knowledge/summaries/grenada.md"],
    facts: `GRENADA CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay summary, IMA Grenada, Oct 2026)
- Citizenship through authorised agents; dual citizenship allowed; no visit needed to apply.
- Routes (US dollars): National Transformation Fund $235,000 for a single applicant or main applicant with up to three dependants (each further dependant $25,000; parent/grandparent 55 or under $50,000; sibling $75,000); approved real estate $350,000 plus a $50,000 government contribution; or a share of an approved tourism unit $270,000 plus $50,000. Real estate cannot be sold for 5 years after citizenship.
- Fees: application $1,500 per person; processing $1,500 (17+) / $500; due diligence $5,000 per person 17+; interview $1,000; passport $375 per person. All non-refundable.
- Family: spouse; children under 30 supported; disabled adult children; supported parents/grandparents; unmarried adult siblings without children.
- Mandatory online interview. IMA Circular No. 2 of 2026 announces a regional residence requirement not yet in effect and without published details — do not describe it beyond "announced".
- Typical time about 6–9 months on current Elevay files (never a promise). Travel access: around 139 destinations (indicative).
${CBI_RULES}`,
  },
  {
    key: "st_kitts_cbi", group: "caribbean", country: CARIBBEAN,
    name: "St. Kitts & Nevis Citizenship by Investment",
    unique: /st\.?\s*kitts|saint\s*kitts|\bnevis\b|سانت كيتس|سانت كيتيس|كيتس|نيفيس/i,
    file: ["knowledge/summaries/st-kitts-nevis.md"],
    facts: `ST. KITTS & NEVIS CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay summary, CIU, Oct 2026)
- Citizenship for the family in one application; dual citizenship allowed; no mandatory residence.
- Routes (US dollars): Sustainable Island State Contribution or Public Benefit Option $250,000 for the main applicant or a family of up to four (additional dependants $25,000 under 18, $50,000 aged 18+), no holding period; approved developer real estate $325,000, or private real estate $325,000 (condominium/share) or $600,000 (single-family home), held 7 years.
- Fees: due diligence $10,000 main applicant, $7,500 per dependant 16+; passport $300 per person; real-estate routes add government fees after approval ($25,000 main applicant, $15,000 spouse, $10,000–15,000 per dependant).
- Family: spouse; children under 18; children 18–30 in full-time study; disabled adult children; parents 55+ supported.
- Biometric enrolment required; applications not accepted from citizens of Afghanistan, Belarus, Iran, Iraq, North Korea and Russia.
- Estimated time about 4–6 months (indicative; can be longer). Travel access: around 148 destinations (indicative).
${CBI_RULES}`,
  },
  {
    key: "st_lucia_cbi", group: "caribbean", country: CARIBBEAN,
    name: "Saint Lucia Citizenship by Investment",
    unique: /st\.?\s*lucia|saint\s*lucia|سانت لوسيا|سانت لوشيا/i,
    file: ["knowledge/summaries/saint-lucia.md"],
    facts: `SAINT LUCIA CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay summary, CIU, Oct 2026)
- Citizenship through authorised agents; dual citizenship allowed; no residence requirement at present.
- Routes (US dollars): National Economic Fund $240,000 for the applicant alone or with up to three dependants; National Action Bond $300,000 plus a $50,000 fee, held 5 years; approved real estate (branded hotel/resort or boutique property) $300,000 plus administration fees, held 5 years; approved enterprise project from $250,000 with dependants (or $3.5 million sole developer / $6 million joint venture).
- Fees: processing $2,000 main / $1,000 dependants; due diligence $8,000 / $5,000 (16+ only); interview and identity verification $500; passport $300 per person.
- Family: spouse; children 21 or under, and up to 30 if fully supported; supported parents over 55; unmarried siblings under 18.
- Typical time about 12–18 months on current Elevay files (never a promise). Travel access: around 137 destinations (indicative).
${CBI_RULES}`,
  },
  {
    key: "vanuatu_cbi", group: "vanuatu", country: /vanuatu|فانواتو/i,
    name: "Vanuatu Citizenship (Development Support Program)",
    file: ["knowledge/summaries/vanuatu.md"],
    facts: `VANUATU CITIZENSHIP — Development Support Program — approved ELEVAY source (Elevay summary, Oct 2026)
- Honorary citizenship granted under the Citizenship Act [Cap 112] for a non-refundable contribution, approved by the Vanuatu Citizenship Commission. Dual citizenship recognised; no residence requirement.
- Contribution (US dollars): single $130,000; married couple $150,000; couple and one child $165,000; couple and two children $180,000; each additional applicant $10,000. Other fees: due diligence $5,000; passport delivery $5,000.
- Family: spouse; dependent children up to 25; dependent parents 50+.
- Typical time about 60–90 days on current Elevay files (never a promise). Travel access: around 90 destinations (indicative).
- Vanuatu states no personal income or capital-gains tax — do NOT use this in public content as a tax benefit for the viewer.
${CBI_RULES}`,
  },
  {
    key: "nauru_cbi", group: "nauru", country: /nauru|naoero|ناورو|\becrcp\b/i,
    name: "Naoero (Nauru) Citizenship by Investment (ECRCP)",
    file: ["knowledge/summaries/naoero-nauru.md", "knowledge/nauru-cbi.md"],
    facts: `NAOERO (NAURU) CITIZENSHIP BY INVESTMENT — Economic and Climate Resilience Citizenship Program (ECRCP, Act 2024) — approved ELEVAY source (Elevay summary, Oct 2026; currency now confirmed as US dollars)
- Citizenship for a contribution funding development and climate-resilience projects; applications only through programme agents. Dual citizenship allowed; no residence requirement.
- Contribution (US dollars): main applicant $90,000 for applications filed by 31 December 2026, rising to $115,000 from 1 January 2027 (a true, dated reason to act now); spouse, dependent child or parent aged 16+ $2,000 each; dependants under 16 nothing; siblings $15,000 each.
- Government fees: application $5,000 (+$2,000 per dependant); due diligence $6,000 (+$3,000 per dependant 16+); passport $500 each; bank charges $1,200–2,200.
- Every main applicant attends an interview; Cabinet makes the final decision.
- Typical time about 6–9 months on current Elevay files (the official site says three to four months; never a promise). Travel access: around 87 destinations (indicative — never promise entry).
- Never imply Australian or New Zealand rights.
${CBI_RULES}`,
  },
  {
    key: "sao_tome_cbi", group: "sao_tome", country: /s[aã]o\s*tom[eé]|principe|príncipe|ساو تومي|ساوتومي|برينسيبي/i,
    name: "São Tomé and Príncipe Citizenship by Investment",
    file: ["knowledge/summaries/sao-tome-principe.md", "knowledge/sao-tome-principe-cbi.md"],
    facts: `SÃO TOMÉ AND PRÍNCIPE CITIZENSHIP BY INVESTMENT — approved ELEVAY source (Elevay summary, Nationality Law 07/2022 and Decree-Law 07/2025, Oct 2026)
- Citizenship for a contribution to the National Transformation Fund; carries no distinction from citizenship by birth and can pass to future generations. Dual citizenship allowed; no residence requirement.
- Contribution (US dollars): single applicant $90,000; family of 2–4 $95,000; each additional dependant $5,000 (due on approval in principle). Fees: submission $5,000 per application; citizenship documents $750 per person.
- Family: spouse (monogamous marriage or de facto partnership); unmarried children up to 30; parents/grandparents 55+; can be added after approval in principle for inclusion fees.
- Typical time about 60–90 days on current Elevay files (never a promise). Travel access: around 70 destinations (indicative).
- Portuguese-speaking country; this gives NO rights in Portugal — never imply it. Quote US dollars only.
${CBI_RULES}`,
  },
  {
    key: "egypt_cbi", group: "egypt",
    country: /egypt(?:ian)?\s+(?:citizenship|residence|residency|passport|golden|cbi|rbi)|(?:citizenship|residence|residency)\s+(?:in|of|by investment in)\s+egypt|الجنسية المصرية|الجواز المصري|جواز السفر المصري|الإقامة في مصر|إقامة في مصر|الاقامة في مصر|اقامة في مصر/i,
    name: "Egypt Citizenship & Residence by Investment",
    file: ["knowledge/summaries/egypt.md", "knowledge/egypt-cbi-rbi.md"],
    facts: `EGYPT CITIZENSHIP & RESIDENCE BY INVESTMENT — approved ELEVAY source (Elevay summary, Law 140 of 2019, Oct 2026; residence part from the Aug 2026 country summary)
- Audience: non-Egyptian nationals (Arab and international families and investors) — never address Egyptian citizens as if they need it.
- Citizenship routes (US dollars, transferred from abroad, plus a non-refundable $10,000 application fee): property from $300,000 held 5 years; investment project $350,000 plus a $100,000 donation, held 5 years; $500,000 deposit at the Central Bank of Egypt for 3 years, returned in Egyptian pounds without interest; or $250,000 non-refundable direct revenue to the government. The property and direct-revenue routes can be paid in instalments within one year.
- Family: spouse (included without extra fees; eligible after two years of marriage counted from the main applicant's citizenship) and children under 21. All nationalities may apply; no language test; no residence requirement; children who obtain citizenship by investment are exempt from military service. Dual citizenship allowed.
- Decision by the Prime Minister; typical time about 9–12 months on current Elevay files (official site 6–12 months; never a promise). Travel access: around 61 destinations (indicative).
- Residence by investment (renewable residence permit — not citizenship): property of at least $50,000 → 1-year permit, $100,000 → 3 years, $200,000 → 5 years; or a bank deposit of $50,000 → 1 year, $100,000 → 3 years.
- Do NOT state tax or privacy claims or automatic conversion of residence into citizenship.
${CBI_RULES}`,
  },
];

/** Trust facts about ELEVAY itself (from the "About Elevay" page of every summary). */
export const ELEVAY_FACTS = `ABOUT ELEVAY (approved, from the program summaries): 28+ years of experience since 1998; 2,500+ completed cases; offices in the UAE (Dubai), Egypt (Giza) and Sri Lanka; services: citizenship by investment, residency by investment and company formation; four pillars: dedication, integrity, passion, qualified staff. The name comes from the French "élevé" (to rise); the logo is the Arctic Tern, the farthest-migrating bird. Use these for trust scenes; never invent other company statistics.`;

export function matchPrograms(text: string) {
  const t = String(text || "");
  const specific = PROGRAMS.filter((p) => (p.unique && p.unique.test(t)) || (p.terms && p.country && p.country.test(t) && p.terms.test(t)));
  const covered = new Set(specific.map((p) => p.group));
  const general = PROGRAMS.filter((p) => !specific.includes(p) && !covered.has(p.group) && p.country && p.country.test(t));
  return PROGRAMS.filter((p) => specific.includes(p) || general.includes(p));
}

/** Fact block to put in a Claude prompt for this request/program. */
export function programFactsFor(text: string) {
  const hits = matchPrograms(text);
  const list = hits.map((p) => p.facts).join("\n\n");
  return `${list ? list + "\n\n" : ""}PROGRAM FACT RULE: State program figures and conditions ONLY from the approved ELEVAY sources above${list ? "" : ` (approved programs: ${PROGRAMS.map((p) => p.name).join("; ")})`}. For any other program (e.g. UK Expansion Worker, Canada skilled-worker Express Entry), do not state numbers, costs, timelines or eligibility details; speak in general benefit terms and invite a consultation. Always add the disclaimer.\n${ELEVAY_FACTS}`;
}

/** Every fact sheet (for monthly/weekly planning). */
export function allProgramFacts() {
  return `${PROGRAMS.map((p) => p.facts).join("\n\n")}\n\n${ELEVAY_FACTS}`;
}

/** Names of the programs with approved sources (for planning prompts). */
export function approvedProgramNames() {
  return PROGRAMS.map((p) => p.name).join("; ");
}

const files = (p) => (Array.isArray(p.file) ? p.file : [p.file]);
/** Full approved source text for detailed answers. */
export function fullProgramSource(text: string) {
  return matchPrograms(text).flatMap((p) => files(p).map((f) => assetText(f))).filter(Boolean).join("\n\n---\n\n");
}
/** Every packaged knowledge file (for the asset copy step and the status panel). */
export function programFiles() {
  return [...new Set(PROGRAMS.flatMap(files))];
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
Reel: vertical 9:16, 1080×1920, 30 fps, 4 scenes × 5 s (scene 1 hook/aspiration, 2 explanation, 3 trust/expertise/planning, 4 realistic outcome without guarantee), smooth restrained cinematic transitions, no on-screen text, then the owner's official animated ELEVAY outro (5 s, white background: origami pieces assemble into the bird logo and the ELEVAY wordmark, with its own short sound logo) (supplied file, never recreated: 9:16 for reels, 16:9 for landscape videos), no narration over the outro, music fades out as it starts.
Voice-over: Egyptian Arabic by default; friendly, professional, premium and natural; about 40–50 Arabic words (about twenty seconds) across four approximately 5-second scenes; one connected message; no "مضمون" or "قبول أكيد", no legal or financial promises. Country names (Spain, Malta, Portugal…) and the company name Elevay written in English letters for correct pronunciation; all other words, including city names, in Arabic. Voice: the ELEVAY voice clone configured on elevay.vip. TTS format: "Speak in Egyptian Arabic with a friendly, professional advisory tone at a natural pace: [thoughtful] <script>". Narration audible over music (music about 25–30% lower under the voice).`;

export const DELIVERY_CHECKLIST = () => assetText("creative/delivery-checklist.md");

export const META_ADS_STRATEGY_SECTIONS = [
  { key: "business_goals", label: "Business Goals & Economics", start: 1, end: 7 },
  { key: "ideal_client", label: "Ideal Client & Qualification Rules", start: 8, end: 16 },
  { key: "sales_results", label: "Actual Sales Results", start: 17, end: 23 },
  { key: "offer_trust", label: "Offer & Trust", start: 24, end: 31 },
  { key: "brand_creative", label: "Brand, Message & Creative Production", start: 32, end: 40 },
  { key: "lead_capture", label: "Lead Capture & Follow-up", start: 41, end: 48 },
  { key: "crm_tracking", label: "CRM, Tracking & Feedback", start: 49, end: 56 },
  { key: "campaign_history", label: "Campaign History & Competition", start: 57, end: 61 },
  { key: "reporting", label: "Reporting & Decisions", start: 62, end: 66 },
] as const;

export type MetaAdsStrategySection = (typeof META_ADS_STRATEGY_SECTIONS)[number]["key"];

const prompts = [
  "Which programs do you want to sell in the next 90 days? Rank them by priority.",
  "For each program, what is the client price, expected gross profit, and typical time from inquiry to signed contract?",
  "How many new signed clients per month can the operations team handle for each program?",
  "What is your monthly ad budget, and how much can you increase it if acquisition is profitable?",
  "What is the maximum acceptable cost per signed client for each program?",
  "Are you optimizing for immediate contracts, consultations, brand awareness, or entry into a new market?",
  "Are there seasonal deadlines, policy changes, appointment constraints, or provider capacity limits?",
  "Who is the best client for each program? Describe location, occupation, income or investment capacity, family situation, and motivation.",
  "Which countries and cities can Elevay serve effectively? Which should be excluded?",
  "What are the non-negotiable eligibility criteria for each program?",
  "What commonly disqualifies a lead after a consultant speaks with them?",
  "What total budget must a prospect realistically have, including all major costs and Elevay fees?",
  "How soon must a prospect intend to proceed?",
  "Who makes the purchase decision, and who needs to join a consultation?",
  "Which lead types close best? Which consume time without converting?",
  "What objections repeatedly stop otherwise qualified people from signing?",
  "For the last 6-12 months, how many inquiries, contacted leads, qualified leads, consultations, proposals, and contracts came from each program and source?",
  "What percentage cannot be reached? What percentage book and attend consultations?",
  "What percentage of qualified consultations sign, and how long does signing take?",
  "Which previous campaigns produced contracts?",
  "Are revenue, refunds, and cancellations linked to the original lead?",
  "Do conversion rates differ among consultants, locations, languages, or contact channels?",
  "Can you share anonymized examples of 20 excellent and 20 poor leads, with reasons?",
  "Why should a suitable client choose Elevay over a lawyer, another agency, or applying independently?",
  "What is included and excluded in each package? What are the payment stages and refund terms?",
  "What can be accurately promised about eligibility, timelines, approvals, and after-approval services?",
  "What proof can be used publicly: testimonials, case studies, credentials, office footage, or verified outcomes?",
  "Which claims require legal review before publication?",
  "What are the three biggest misconceptions prospects have about each program?",
  "Can we state a starting price or minimum qualifying budget in an ad or form?",
  "What should the first offer be: eligibility assessment, consultation, guide, webinar, or application review?",
  "Who should be the primary spokesperson?",
  "What languages and dialects should be used for each market?",
  "What tone should Elevay use?",
  "What videos, client stories, office footage, webinars, FAQs, and design assets exist?",
  "Can the team record regularly? How many new videos can be produced each month?",
  "Which recurring consultant questions could become short videos?",
  "Which benefits resonate with buyers, and which angles attract the wrong people?",
  "Which statements, imagery, competitors, or topics must be avoided?",
  "Who approves copy and creative, and what is the approval turnaround?",
  "Where should each ad send prospects: instant form, WhatsApp, Messenger, booking page, or landing page?",
  "Which qualifying questions are essential before a consultant spends time on a lead?",
  "How quickly does a lead receive the first response during and after business hours?",
  "Who owns the lead at each stage: AI qualifier, qualification officer, consultant, or manager?",
  "How many calls and messages are attempted, over how many days?",
  "Can prospects book directly? How are no-shows handled?",
  "What happens when a qualified lead is not ready to buy yet?",
  "Can the team handle the volume that a larger budget would generate?",
  "Do all Meta leads enter elevay.vip automatically with campaign, ad, form, time, program, and consultant recorded?",
  "Does the CRM consistently record qualification, attendance, proposal, contract, contract value, and refund?",
  "Is the Meta Pixel installed, and which meaningful events are tracked?",
  "Is a server-side Conversions API or CRM integration in place and checked?",
  "Can qualified-lead and later sales outcomes be shared back from the CRM with appropriate consent?",
  "Are duplicate leads from WhatsApp, forms, website, and repeat inquiries merged?",
  "Who can provide access to the ad account, Page, Instagram, dataset, analytics, and CRM reporting?",
  "Is there a clear privacy notice and lawful basis for collecting and using lead data?",
  "What ran in the past year, with spend, leads, qualified leads, appointments, and contracts?",
  "Which audiences, geographies, creatives, forms, and landing pages worked or failed?",
  "Were there rejected ads, restrictions, payment issues, or tracking breaks?",
  "Who are the five closest competitors in each market, and where does Elevay outperform them?",
  "What do prospects say they saw from competitors before contacting Elevay?",
  "What are the target costs per qualified lead, attended consultation, and signed client?",
  "How often should performance be reviewed and commercial decisions made?",
  "Who can approve offers, budgets, claims, and pausing a program?",
  "What would make the first 30, 60, and 90 days successful?",
  "How will sales report lead quality back to marketing, and who checks the accuracy of reasons?",
] as const;

export const META_ADS_STRATEGY_QUESTIONS = prompts.map((prompt, index) => {
  const number = index + 1;
  const section = META_ADS_STRATEGY_SECTIONS.find(item => number >= item.start && number <= item.end)!;
  return { number, prompt, section: section.key, sectionLabel: section.label };
});

export const META_ADS_STRATEGY_TOTAL_QUESTIONS = META_ADS_STRATEGY_QUESTIONS.length;

export function getMetaAdsStrategyQuestion(questionNumber: number) {
  const question = META_ADS_STRATEGY_QUESTIONS[questionNumber - 1];
  if (!question) throw new Error(`Unknown Meta Ads Strategy question ${questionNumber}`);
  return question;
}

export function calculateNextMetaAdsStrategyQuestion(answeredQuestionNumbers: number[]) {
  const answered = new Set(answeredQuestionNumbers);
  return META_ADS_STRATEGY_QUESTIONS.find(question => !answered.has(question.number))?.number ?? null;
}

export function isMetaAdsStrategyComplete(answeredQuestionNumbers: number[]) {
  return new Set(answeredQuestionNumbers).size === META_ADS_STRATEGY_TOTAL_QUESTIONS;
}

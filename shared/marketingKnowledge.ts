export const MARKETING_KNOWLEDGE_SOURCE_TYPES = [
  "official_programme",
  "official_law_or_regulation",
  "official_consular_guidance",
  "official_authority_update",
] as const;

export const MARKETING_KNOWLEDGE_CLAIM_TYPES = [
  "programme_overview",
  "eligibility",
  "family",
  "process",
  "document",
  "timeline",
  "cost_or_fee",
  "restriction",
] as const;

export const MARKETING_KNOWLEDGE_RISK_LEVELS = ["low", "medium", "high"] as const;

export const OFFICIAL_KNOWLEDGE_ALLOWED_DOMAINS = [
  "prie.comercio.gob.es",
  "exteriores.gob.es",
  "www.exteriores.gob.es",
  "residencymalta.gov.mt",
  "gov.mt",
  "vistos.mne.gov.pt",
  "migration.gov.gr",
  "gov.uk",
  "canada.ca",
] as const;

export type KnowledgeSourceSeed = {
  programKey: string;
  programLabel: string;
  title: string;
  authorityName: string;
  sourceType: (typeof MARKETING_KNOWLEDGE_SOURCE_TYPES)[number];
  sourceUrl: string;
  sourceDomain: (typeof OFFICIAL_KNOWLEDGE_ALLOWED_DOMAINS)[number];
  snapshotText: string;
  sourcePublishedAt?: number;
};

// These are primary-authority candidates from the reviewed source record. A seed is
// never a publishable claim and stays candidate until an owner approves it in the CRM.
export const OFFICIAL_KNOWLEDGE_SOURCE_SEEDS: readonly KnowledgeSourceSeed[] = [
  {
    programKey: "spain_digital_nomad_residency",
    programLabel: "Spain International Teleworker Residency",
    title: "Digital nomads (international teleworkers)",
    authorityName: "Government of Spain — Ministry of Economy, Commerce and Business",
    sourceType: "official_programme",
    sourceUrl: "https://prie.comercio.gob.es/en-us/paginas/teletrabajadores-caracter-internacional.aspx",
    sourceDomain: "prie.comercio.gob.es",
    snapshotText: "Primary Government of Spain programme page for international teleworkers. The retrieved page describes remote work for companies outside Spanish territory, official permit pathways, programme requirements and submission routes. Retrieved 2026-09-29; review the current source before any client guidance or public claim.",
  },
  {
    programKey: "spain_digital_nomad_residency",
    programLabel: "Spain International Teleworker Residency",
    title: "Digital Nomad Visa — Consular guidance",
    authorityName: "Ministry of Foreign Affairs, European Union and Cooperation — Consulate General of Spain in London",
    sourceType: "official_consular_guidance",
    sourceUrl: "https://www.exteriores.gob.es/Consulados/londres/en/ServiciosConsulares/Paginas/Consular/Digital-Nomad-Visa.aspx",
    sourceDomain: "www.exteriores.gob.es",
    snapshotText: "Official Spanish consular procedural guidance for the Digital Nomad Visa. Consular procedure can vary by jurisdiction and must not replace the primary programme authority. Retrieved 2026-09-29; review for local applicability before use.",
    sourcePublishedAt: Date.UTC(2024, 4, 17),
  },
  {
    programKey: "malta_permanent_residence_programme",
    programLabel: "Malta Permanent Residence Programme",
    title: "Malta Permanent Residence Programme (MPRP) legal framework",
    authorityName: "Residency Malta Agency",
    sourceType: "official_law_or_regulation",
    sourceUrl: "https://residencymalta.gov.mt/legal-framework-mprp-2/",
    sourceDomain: "residencymalta.gov.mt",
    snapshotText: "Primary Residency Malta Agency framework page for the Malta Permanent Residence Programme. It points to the programme legal framework and licensed-agent application route. Retrieved 2026-09-29; current legislation must be verified before any eligibility, fee, timeline or process claim.",
  },
] as const;

export function normalizeOfficialKnowledgeUrl(rawUrl: string): { url: string; domain: string } {
  if (/[\u0000-\u001F\u007F]/.test(rawUrl)) throw new Error("Official source URLs cannot contain control characters.");
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS official sources are accepted.");
  if (parsed.username || parsed.password || parsed.port) throw new Error("Official source URLs cannot include credentials or alternate ports.");
  const domain = parsed.hostname.toLowerCase();
  if (!(OFFICIAL_KNOWLEDGE_ALLOWED_DOMAINS as readonly string[]).includes(domain)) {
    throw new Error("This domain is not on ELEVAY’s official-source allowlist. Ask Mahmoud to approve it before adding it.");
  }
  parsed.hash = "";
  return { url: parsed.toString(), domain };
}

export function stableKnowledgeHash(value: string): string {
  // The implementation applies SHA-256 server-side. This helper normalizes the
  // value used as the input so identically reviewed content produces the same hash.
  return value.trim().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
}

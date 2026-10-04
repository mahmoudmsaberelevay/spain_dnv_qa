import crypto from "node:crypto";
import { normalizeOfficialKnowledgeUrl, stableKnowledgeHash } from "../shared/marketingKnowledge";

const MAX_SOURCE_BYTES = 512_000;
const MIN_EVIDENCE_CHARS = 24;

function visiblePageText(html: string) {
  return stableKnowledgeHash(html
    .replace(/<(?:script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|template)\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'"));
}

async function readBoundedHtml(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^text\/html\b/i.test(contentType)) throw new Error("Official citation source did not return an HTML page.");
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_SOURCE_BYTES) throw new Error("Official citation source exceeds the read-only size limit.");
  if (!response.body) throw new Error("Official citation source returned no readable body.");
  const reader = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) throw new Error("Official citation source exceeds the read-only size limit.");
      pieces.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) { bytes.set(piece, offset); offset += piece.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/**
 * Verifies literal evidence in a fresh, allowlisted authority page. This only
 * proves the quote appeared in that retrieved page, not that a legal claim is
 * current, applicable, or approved. Never send client data to this function.
 * No scheduling, generation, publication, DB write or media dispatch occurs.
 */
export async function verifyOfficialNewsCitation(
  input: { sourceUrl: string; evidenceQuote: string },
  request: typeof fetch = fetch,
) {
  const normalized = normalizeOfficialKnowledgeUrl(input.sourceUrl);
  const quote = stableKnowledgeHash(input.evidenceQuote);
  if (quote.length < MIN_EVIDENCE_CHARS || quote.length > 500 || /[\u0000-\u001f\u007f]/.test(quote)) {
    throw new Error("A citation needs an exact, bounded public-source evidence quote.");
  }
  const response = await request(normalized.url, {
    method: "GET",
    redirect: "manual", // no allowlist-bypassing cross-domain redirects
    cache: "no-store",
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status !== 200) throw new Error(`Official citation fetch failed with HTTP ${response.status}.`);
  if (response.url && normalizeOfficialKnowledgeUrl(response.url).domain !== normalized.domain) {
    throw new Error("Official citation response changed authority domain.");
  }
  const page = visiblePageText(await readBoundedHtml(response));
  if (!page || !page.includes(quote)) throw new Error("The quoted evidence was not found in the official source snapshot.");
  const digest = crypto.createHash("sha256").update(page).digest("hex");
  return {
    sourceUrl: normalized.url,
    authorityDomain: normalized.domain,
    evidenceQuote: quote,
    sourceSnapshotSha256: digest,
    retrievedAt: Date.now(),
    verificationMethod: "literal_quote_in_allowlisted_official_html" as const,
    publicationAuthority: false as const,
  };
}

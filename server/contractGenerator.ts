import axios from "axios";
import { storagePut, storageGet } from "./storage";
import PizZip from "pizzip";

// ── Appendix ───────────────────────────────────────────────────────────────
// The Spain contract appendix (ملحق) is stored in S3 and appended after the
// main 14-page contract body for every Spain DNV contract generated.
const SPAIN_APPENDIX_KEY = "spain_appendix_03c86694.docx";
let appendixCache: Buffer | null = null;

async function getSpainAppendix(): Promise<Buffer | null> {
  if (appendixCache) return appendixCache;
  try {
    const { url } = await storageGet(SPAIN_APPENDIX_KEY);
    const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
    appendixCache = Buffer.from(resp.data);
    return appendixCache;
  } catch (err) {
    console.error("[ContractGenerator] Failed to load Spain appendix:", err);
    return null;
  }
}

/**
 * Merge appendix DOCX into the main contract DOCX.
 * Handles:
 *  1. Body content merge (with page break separator)
 *  2. Numbering definitions merge (remapped IDs to avoid conflicts)
 *  3. Missing style definitions merge
 */
function mergeAppendixIntoContract(mainZip: PizZip, appendixBuf: Buffer): void {
  try {
    const appendixZip = new PizZip(appendixBuf.toString("binary"), { base64: false });
    const appendixDocXml = appendixZip.file("word/document.xml")!.asText();

    // ── Step 1: Merge numbering definitions ──────────────────────────────────
    // Find all numId values used in the appendix body
    const appendixNumIds = new Set<number>();
    const numIdMatches = appendixDocXml.matchAll(/<w:numId w:val="(\d+)"/g);
    for (const m of numIdMatches) appendixNumIds.add(parseInt(m[1]));

    let numIdOffset = 0;
    if (appendixNumIds.size > 0) {
      const appendixNumXmlFile = appendixZip.file("word/numbering.xml");
      const mainNumXmlFile = mainZip.file("word/numbering.xml");

      if (appendixNumXmlFile && mainNumXmlFile) {
        let mainNumXml = mainNumXmlFile.asText();
        const appendixNumXml = appendixNumXmlFile.asText();

        // Find the highest abstractNumId and numId in the main document
        const mainAbstractIds = [...mainNumXml.matchAll(/w:abstractNumId="(\d+)"/g)].map(m => parseInt(m[1]));
        const mainNumIds = [...mainNumXml.matchAll(/<w:num w:numId="(\d+)"/g)].map(m => parseInt(m[1]));
        const maxAbstractId = mainAbstractIds.length > 0 ? Math.max(...mainAbstractIds) : 0;
        const maxNumId = mainNumIds.length > 0 ? Math.max(...mainNumIds) : 0;
        numIdOffset = maxNumId;

        // Extract abstractNum definitions from appendix and remap their IDs
        const appendixAbstractNums = [...appendixNumXml.matchAll(/<w:abstractNum w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g)];
        const appendixNums = [...appendixNumXml.matchAll(/<w:num w:numId="(\d+)"[\s\S]*?<\/w:num>/g)];

        // Build a map: old abstractNumId -> new abstractNumId
        const abstractIdMap = new Map<number, number>();
        let nextAbstractId = maxAbstractId + 1;
        for (const m of appendixAbstractNums) {
          abstractIdMap.set(parseInt(m[1]), nextAbstractId++);
        }

        // Remap and append abstractNum definitions
        for (const m of appendixAbstractNums) {
          const oldId = parseInt(m[1]);
          const newId = abstractIdMap.get(oldId)!;
          let def = m[0].replace(`w:abstractNumId="${oldId}"`, `w:abstractNumId="${newId}"`);
          // Also remap any w:abstractNumId references inside the definition
          def = def.replace(/<w:abstractNumId w:val="(\d+)"/, (_, v) => {
            const mapped = abstractIdMap.get(parseInt(v));
            return `<w:abstractNumId w:val="${mapped !== undefined ? mapped : v}"`;
          });
          mainNumXml = mainNumXml.replace("</w:numbering>", def + "</w:numbering>");
        }

        // Remap and append num definitions (only those used in appendix body)
        for (const m of appendixNums) {
          const oldNumId = parseInt(m[1]);
          if (!appendixNumIds.has(oldNumId)) continue;
          const newNumId = oldNumId + numIdOffset;
          let def = m[0]
            .replace(`w:numId="${oldNumId}"`, `w:numId="${newNumId}"`)
            .replace(/<w:abstractNumId w:val="(\d+)"/, (_, v) => {
              const mapped = abstractIdMap.get(parseInt(v));
              return `<w:abstractNumId w:val="${mapped !== undefined ? mapped : v}"`;
            });
          mainNumXml = mainNumXml.replace("</w:numbering>", def + "</w:numbering>");
        }

        mainZip.file("word/numbering.xml", mainNumXml);
      }
    }

    // ── Step 2: Merge missing styles ─────────────────────────────────────────
    const appendixStyleFile = appendixZip.file("word/styles.xml");
    const mainStyleFile = mainZip.file("word/styles.xml");
    if (appendixStyleFile && mainStyleFile) {
      let mainStylesXml = mainStyleFile.asText();
      const appendixStylesXml = appendixStyleFile.asText();
      // Find styles used in appendix body
      const usedStyles = new Set([...appendixDocXml.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map(m => m[1]));
      for (const styleId of usedStyles) {
        // Only add if not already in main
        if (!mainStylesXml.includes(`w:styleId="${styleId}"`)) {
          const styleMatch = appendixStylesXml.match(
            new RegExp(`<w:style[^>]*w:styleId="${styleId}"[\\s\\S]*?<\/w:style>`)
          );
          if (styleMatch) {
            mainStylesXml = mainStylesXml.replace("</w:styles>", styleMatch[0] + "</w:styles>");
          }
        }
      }
      mainZip.file("word/styles.xml", mainStylesXml);
    }

    // ── Step 3: Merge body content ────────────────────────────────────────────
    const bodyStart = appendixDocXml.indexOf("<w:body>");
    const bodyEnd = appendixDocXml.lastIndexOf("</w:body>");
    if (bodyStart === -1 || bodyEnd === -1) return;

    let appendixBody = appendixDocXml.slice(bodyStart + "<w:body>".length, bodyEnd);

    // Remove the final <w:sectPr> from the appendix body so it doesn't override
    // the main contract's page settings
    appendixBody = appendixBody.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/, "");

    // Remap numId references in the appendix body to the new IDs
    if (numIdOffset > 0) {
      appendixBody = appendixBody.replace(/<w:numId w:val="(\d+)"/g, (_, v) => {
        const oldId = parseInt(v);
        return appendixNumIds.has(oldId)
          ? `<w:numId w:val="${oldId + numIdOffset}"`
          : `<w:numId w:val="${v}"`;
      });
    }

    // Build a page-break paragraph to separate the main contract from the appendix
    const pageBreakPara = `<w:p><w:r><w:rPr><w:rtl/></w:rPr><w:br w:type="page"/></w:r></w:p>`;

    // Insert before the closing </w:body> of the main contract
    let mainXml = mainZip.file("word/document.xml")!.asText();
    const mainBodyEnd = mainXml.lastIndexOf("</w:body>");
    if (mainBodyEnd === -1) return;

    mainXml =
      mainXml.slice(0, mainBodyEnd) +
      pageBreakPara +
      appendixBody +
      mainXml.slice(mainBodyEnd);

    mainZip.file("word/document.xml", mainXml);
  } catch (err) {
    console.error("[ContractGenerator] Failed to merge appendix:", err);
    // Non-fatal: contract is still generated without appendix
  }
}

// ── Template registry ──────────────────────────────────────────────────────
// Keys match the `country` field stored in the contracts table.
// The Spain template is fetched from an external CDN; the others are stored in
// the project's own S3 bucket via manus-upload-file --webdev.
const TEMPLATE_REGISTRY: Record<string, { url?: string; storageKey?: string; label: string }> = {
  spain: {
    // Modified Spain Nomad contract template with {{FAMILY_MEMBERS}} and {{CONTRACT_VALUE}} placeholders
    // These placeholders are replaced dynamically based on actual family count and calculated fees
    // Updated 2026-07-27: Minor edit to ملحق تعاقد for Spain Digital Nomad
    url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663524211981/qmnDdITCjNkCDrEs.docx",
    label: "Spain Digital Nomad Visa",
  },
  egypt: {
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/contract-templates/egypt.docx",
    label: "Egypt Citizenship",
  },
  dominica: {
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/contract-templates/dominica.docx",
    label: "Dominica Citizenship",
  },
  saint_kitts: {
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/contract-templates/saint_kitts.docx",
    label: "Saint Kitts & Nevis Citizenship",
  },
  grenada: {
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/contract-templates/grenada.docx",
    label: "Grenada Citizenship",
  },
};

export const CONTRACT_COUNTRIES = Object.entries(TEMPLATE_REGISTRY).map(([key, val]) => ({
  key,
  label: val.label,
}));

// Per-country template buffer cache
const templateCache: Record<string, Buffer> = {};

async function getTemplate(country: string): Promise<Buffer> {
  if (templateCache[country]) return templateCache[country];

  const entry = TEMPLATE_REGISTRY[country] ?? TEMPLATE_REGISTRY["spain"];

  let buffer: Buffer;

  if (entry.storageKey) {
    const { url } = await storageGet(entry.storageKey);
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
    buffer = Buffer.from(response.data);
  } else if (entry.url) {
    const response = await axios.get(entry.url, { responseType: "arraybuffer", timeout: 30000 });
    buffer = Buffer.from(response.data);
  } else {
    throw new Error(`No template source for country: ${country}`);
  }

  templateCache[country] = buffer;
  return buffer;
}

// ── Pricing ────────────────────────────────────────────────────────────────
// Spain uses a family-size pricing ladder.
// All citizenship programs (Egypt, Dominica, Saint Kitts, Grenada) use a flat
// placeholder value; the actual fee is entered manually per client.
export function calculateContractValue(familyMembers: number, country = "spain"): number {
  if (country === "spain") {
    if (familyMembers === 1) return 12000;
    if (familyMembers === 2) return 13000;
    if (familyMembers <= 4) return 14000;
    return 15000;
  }
  // For citizenship programs the fee varies by investment type; default to 0
  // so the user can set it via the discount / manual value field.
  return 0;
}

// ── XML helpers ────────────────────────────────────────────────────────────
/**
 * Replace a placeholder text in the docx XML and strip the red highlight/color
 * formatting from its containing <w:r> run.
 */
function replaceAndClean(xml: string, placeholder: string, value: string): string {
  const escapedValue = escapeXml(value);
  const placeholderIdx = xml.indexOf(placeholder);
  if (placeholderIdx === -1) return xml;

  const runStart = xml.lastIndexOf("<w:r ", placeholderIdx);
  if (runStart === -1) return xml.replace(placeholder, escapedValue);

  const runEnd = xml.indexOf("</w:r>", placeholderIdx);
  if (runEnd === -1) return xml.replace(placeholder, escapedValue);

  let runXml = xml.slice(runStart, runEnd + "</w:r>".length);
  runXml = runXml
    .replace(/<w:highlight w:val="red"\/>/g, "")
    .replace(/<w:color w:val="FF0000"\/>/g, "");
  runXml = runXml.replace(placeholder, escapedValue);

  return xml.slice(0, runStart) + runXml + xml.slice(runEnd + "</w:r>".length);
}

/** Get today's date formatted as D/M/YYYY in Cairo timezone (UTC+2) */
function getCairoDateString(): string {
  const now = new Date();
  const cairoOffset = 2 * 60;
  const cairoMs = now.getTime() + (cairoOffset - now.getTimezoneOffset()) * 60000;
  const cairoDate = new Date(cairoMs);
  return `${cairoDate.getDate()}/${cairoDate.getMonth() + 1}/${cairoDate.getFullYear()}`;
}

/** Escape special XML characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Main generator ─────────────────────────────────────────────────────────
export async function generateContractDoc(
  clientName: string,
  familyMembers: number,
  contractCode: string,
  country = "spain",
  contractValueOverride?: number
): Promise<{ buffer: Buffer; filename: string }> {
  const contractValue =
    contractValueOverride !== undefined
      ? contractValueOverride
      : calculateContractValue(familyMembers, country);

  const templateBuf = await getTemplate(country);

  const zip = new PizZip(templateBuf.toString("binary"), { base64: false });
  let docXml = zip.file("word/document.xml")!.asText();

  const todayDate = getCairoDateString();

  // ── Date replacement (non-Spain only) ────────────────────────────────────
  // For Spain the contract text is kept exactly as written; no date substitution.
  if (country !== "spain") {
    docXml = docXml.replace(/\d{1,2}\/\d{1,2}\/20\d{2}/, todayDate);
  }

    // ── Client name ───────────────────────────────────────────────────────────
  if (country === "spain") {
    // The Spain template has the placeholder client name "فيفيان نوناي بشاي جرجس"
    // in the الطرف الثاني section. Replace it with the actual client name in Arabic.
    const CLIENT_NAME_PLACEHOLDER = "\u0641\u064a\u0641\u064a\u0627\u0646 \u0646\u0648\u0646\u0627\u064a \u0628\u0634\u0627\u064a \u062c\u0631\u062c\u0633";
    docXml = docXml.replace(new RegExp(CLIENT_NAME_PLACEHOLDER, "g"), escapeXml(clientName));
    // Fallback: also try the 18-space placeholder in case older template is cached
    const SPACE_PLACEHOLDER = "                  "; // 18 spaces
    docXml = docXml.replace(SPACE_PLACEHOLDER, escapeXml(clientName));
  } else {
    // Citizenship templates (Egypt, Dominica, St Kitts, Grenada) use "Inset The Client Name"
    docXml = replaceAndClean(docXml, "Inset The Client Name", clientName);
  }
  // ── Family members & contract value (Spain only) ──────────────────────────
  // Replace the contract total amount based on family size.
  // Pricing: 1 member = 12,000 | 2 members = 13,000 | 3-4 = 14,000 | 5+ = 15,000
  // Template has "13,000" as placeholder. Replace with calculated amount.
  if (country === "spain") {
    // Replace {{FAMILY_MEMBERS}} if present (newer templates)
    docXml = docXml.replace("{{FAMILY_MEMBERS}}", familyMembers.toString());
    // Replace {{CONTRACT_VALUE}} if present (newer templates)
    docXml = docXml.replace("{{CONTRACT_VALUE}}", contractValue.toLocaleString("en-US"));
    // Replace the hardcoded "13,000" in the contract value section
    // This handles the template that has "13,000 EUR" as the placeholder amount
    docXml = docXml.replace("13,000", contractValue.toLocaleString("en-US"));
  }

  zip.file("word/document.xml", docXml);

  const outputBuffer = Buffer.from(
    zip.generate({ type: "nodebuffer", compression: "DEFLATE" })
  );

  const filename = `Contract_${contractCode}_${clientName.replace(/\s+/g, "_")}.docx`;

  console.log(
    `[ContractGenerator] Generated contract ${contractCode} for "${clientName}" | country: ${country} | ${familyMembers} members | value: ${contractValue} EUR | size: ${outputBuffer.length} bytes`
  );

  return { buffer: outputBuffer, filename };
}

export async function uploadContractToStorage(
  buffer: Buffer,
  contractCode: string,
  clientName: string
): Promise<string> {
  const filename = `contracts/${contractCode}_${clientName.replace(/\s+/g, "_")}_${Date.now()}.docx`;
  const { url } = await storagePut(
    filename,
    buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  return url;
}

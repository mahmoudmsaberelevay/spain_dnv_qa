import axios from "axios";
import { storagePut } from "./storage";
import PizZip from "pizzip";

// ── Template registry ──────────────────────────────────────────────────────
// Keys match the `country` field stored in the contracts table.
// The Spain template is fetched from an external CDN; the others are stored in
// the project's own S3 bucket via manus-upload-file --webdev.
const TEMPLATE_REGISTRY: Record<string, { url?: string; storageKey?: string; label: string }> = {
  spain: {
    url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/kN35iJC3mTAPmbEMAFkqBd/12K-Spain-NewContract_6b0097ff.docx",
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

  if (entry.url) {
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

  // ── Date replacement ──────────────────────────────────────────────────────
  // Replace the first date pattern (D/M/YYYY or DD/MM/YYYY) in the document.
  docXml = docXml.replace(/\d{1,2}\/\d{1,2}\/20\d{2}/, todayDate);

  // ── Client name ───────────────────────────────────────────────────────────
  // Spain template uses "XXXXXXXXXXXXXXXXXXXX"
  // Citizenship templates (Egypt, Dominica, St Kitts, Grenada) use "Inset The Client Name"
  docXml = replaceAndClean(docXml, "XXXXXXXXXXXXXXXXXXXX", clientName);
  docXml = replaceAndClean(docXml, "Inset The Client Name", clientName);
  // The word "Here" appears as a separate <w:r> run right after the name placeholder in all 4 citizenship templates.
  // We remove the entire run that contains only "Here " (with optional trailing space) to avoid matching
  // legitimate uses of the word "here" elsewhere in the document.
  docXml = docXml.replace(/<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>Here\s*<\/w:t><\/w:r>/, "");

  // ── Family members & contract value (Spain only) ──────────────────────────
  if (country === "spain") {
    const contractValueFormatted = `${contractValue.toLocaleString("en-US")} EUR`;
    docXml = replaceAndClean(docXml, "………………..", String(familyMembers));
    docXml = replaceAndClean(docXml, "………………..", contractValueFormatted);
  }
  // For citizenship programs the fee section is left as-is in the template
  // (no placeholder to replace — the template body already describes the program fees).

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

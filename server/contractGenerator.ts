import axios from "axios";
import { storagePut } from "./storage";
import PizZip from "pizzip";

const TEMPLATE_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/kN35iJC3mTAPmbEMAFkqBd/12K-Spain-NewContract_6b0097ff.docx";

// Cache the template locally to avoid re-downloading on every request
let templateBuffer: Buffer | null = null;

async function getTemplate(): Promise<Buffer> {
  if (templateBuffer) return templateBuffer;
  const response = await axios.get(TEMPLATE_URL, {
    responseType: "arraybuffer",
    timeout: 30000,
  });
  templateBuffer = Buffer.from(response.data);
  return templateBuffer;
}

export function calculateContractValue(familyMembers: number): number {
  if (familyMembers === 1) return 12000;
  if (familyMembers === 2) return 13000;
  if (familyMembers <= 4) return 14000;
  return 15000;
}

/**
 * Replace a placeholder text in the docx XML and strip the red highlight/color
 * formatting from its containing <w:r> run.
 *
 * Strategy: find the <w:r> run that contains the placeholder text, remove
 * <w:highlight w:val="red"/> and <w:color w:val="FF0000"/> from its <w:rPr>,
 * then replace the placeholder text with the new value.
 */
function replaceAndClean(xml: string, placeholder: string, value: string): string {
  const escapedValue = escapeXml(value);

  // Find the index of the placeholder text in the XML
  const placeholderIdx = xml.indexOf(placeholder);
  if (placeholderIdx === -1) return xml;

  // Find the start of the <w:r> run that contains this placeholder
  const runStart = xml.lastIndexOf("<w:r ", placeholderIdx);
  if (runStart === -1) return xml.replace(placeholder, escapedValue);

  // Find the end of this run (</w:r>)
  const runEnd = xml.indexOf("</w:r>", placeholderIdx);
  if (runEnd === -1) return xml.replace(placeholder, escapedValue);

  // Extract the run XML
  let runXml = xml.slice(runStart, runEnd + "</w:r>".length);

  // Remove red highlight and red color formatting tags from the run
  runXml = runXml
    .replace(/<w:highlight w:val="red"\/>/g, "")
    .replace(/<w:color w:val="FF0000"\/>/g, "");

  // Replace the placeholder text with the actual value
  runXml = runXml.replace(placeholder, escapedValue);

  // Splice back into the full XML
  return xml.slice(0, runStart) + runXml + xml.slice(runEnd + "</w:r>".length);
}

/**
 * Generate a contract Word document by replacing the highlighted placeholder fields:
 *
 * Field 1 (Page 1): "XXXXXXXXXXXXXXXXXXXX" → client full name
 *   (has both red highlight + red color in the XML)
 *
 * Field 2 (Page 5, first highlighted line): "………………..…" → family members count
 *   Context: "وبناءً عليه، فإن عدد أفراد الأسرة هو: ………………..…"
 *
 * Field 3 (Page 5, second highlighted line): "………………..…" → contract value in EUR
 *   Context: "وعليه، فإن إجمالي قيمة هذا العقد تُقدَّر بمبلغ: ………………..…"
 *
 * The signature lines (also dots) are left untouched.
 */
/** Get today's date formatted as D/M/YYYY in Cairo timezone (Africa/Cairo = UTC+2) */
function getCairoDateString(): string {
  const now = new Date();
  // Cairo is UTC+2 (no DST)
  const cairoOffset = 2 * 60; // minutes
  const cairoMs = now.getTime() + (cairoOffset - now.getTimezoneOffset()) * 60000;
  const cairoDate = new Date(cairoMs);
  const day = cairoDate.getDate();
  const month = cairoDate.getMonth() + 1;
  const year = cairoDate.getFullYear();
  return `${day}/${month}/${year}`;
}

export async function generateContractDoc(
  clientName: string,
  familyMembers: number,
  contractCode: string
): Promise<{ buffer: Buffer; filename: string }> {
  const contractValue = calculateContractValue(familyMembers);
  const templateBuf = await getTemplate();

  // Load the docx as a zip archive
  const zip = new PizZip(templateBuf.toString("binary"), { base64: false });
  let docXml = zip.file("word/document.xml")!.asText();

  const contractValueFormatted = `${contractValue.toLocaleString("en-US")} EUR`;

  // ── Replacement 0: Date (Page 1, yellow-highlighted) ───────────────────────
  // The template contains a hardcoded date like "7/4/2026" or "8/4/2026".
  // We replace it with today's Cairo date in D/M/YYYY format.
  // Match any date pattern D/M/YYYY or DD/MM/YYYY near the start of the document.
  const todayDate = getCairoDateString();
  // Replace the first occurrence of a date pattern in the XML (the contract date)
  docXml = docXml.replace(/\d{1,2}\/\d{1,2}\/20\d{2}/, todayDate);

  // ── Replacement 1: Client name (Page 1) ────────────────────────────────────
  // Placeholder: "XXXXXXXXXXXXXXXXXXXX" with red highlight + red color
  docXml = replaceAndClean(docXml, "XXXXXXXXXXXXXXXXXXXX", clientName);

  // ── Replacement 2: Family members (Page 5, first highlighted line) ─────────
  // Placeholder: "………………..…" — first occurrence
  // Context: "عدد أفراد الأسرة هو: ………………..…"
  docXml = replaceAndClean(docXml, "………………..", String(familyMembers));

  // ── Replacement 3: Contract value (Page 5, second highlighted line) ────────
  // Placeholder: "………………..…" — second occurrence (first was already replaced above)
  // Context: "قيمة هذا العقد تُقدَّر بمبلغ: ………………..…"
  docXml = replaceAndClean(docXml, "………………..", contractValueFormatted);

  // Write the modified XML back into the zip
  zip.file("word/document.xml", docXml);

  // Generate the output buffer
  const outputBuffer = Buffer.from(
    zip.generate({ type: "nodebuffer", compression: "DEFLATE" })
  );

  const filename = `Contract_${contractCode}_${clientName.replace(/\s+/g, "_")}.docx`;

  console.log(
    `[ContractGenerator] Generated contract ${contractCode} for "${clientName}" (${familyMembers} members, ${contractValueFormatted}), size: ${outputBuffer.length} bytes`
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

/** Escape special XML characters to prevent document corruption */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

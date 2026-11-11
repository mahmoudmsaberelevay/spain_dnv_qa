import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import PizZip from "pizzip";
import { DocusignError } from "./contractDocusignConfig";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
// Exact project-owned storage distribution and project path, from contractGenerator.ts.
const STORAGE_PREFIX = "/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/contracts/";
export function validateDocumentUrl(raw: string): URL {
  let url: URL; try { url = new URL(raw); } catch { throw new DocusignError("DOCUMENT_SOURCE_NOT_ALLOWED"); }
  let path: string; try { path = decodeURIComponent(url.pathname); } catch { throw new DocusignError("DOCUMENT_SOURCE_NOT_ALLOWED"); }
  if (url.protocol !== "https:" || url.hostname !== "d2xsxph8kpxj0f.cloudfront.net" || url.port || url.username || url.password || url.hash || !path.startsWith(STORAGE_PREFIX) || !/\.docx$/i.test(path) || path.includes("\\") || path.split("/").some(p => p === ".." || p === ".") || /[\x00-\x1f]/.test(path)) throw new DocusignError("DOCUMENT_SOURCE_NOT_ALLOWED");
  return url;
}
export function publicAddress(address: string): boolean {
  if (address.includes(":")) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address);
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19)));
}
export function validateDocx(bytes: Buffer): void {
  try {
    if (bytes.length < 22 || bytes.length > MAX_DOCUMENT_BYTES || bytes.readUInt32LE(0) !== 0x04034b50) throw 0;
    // Check central-directory expansion bounds before inflating any XML.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0 || bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6)) throw 0;
    const count = bytes.readUInt16LE(eocd + 10); let offset = bytes.readUInt32LE(eocd + 16); let expanded = 0;
    if (!count || count > 2000 || count === 65535) throw 0;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50 || (bytes.readUInt16LE(offset + 8) & 1)) throw 0;
      expanded += bytes.readUInt32LE(offset + 24);
      if (expanded > 30 * 1024 * 1024) throw 0;
      const length = bytes.readUInt16LE(offset + 28); const name = bytes.subarray(offset + 46, offset + 46 + length).toString("utf8");
      if (name.includes("..") || name.startsWith("/") || /vbaProject\.bin$/i.test(name)) throw 0;
      offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    }
    const zip = new PizZip(bytes); const types = zip.file("[Content_Types].xml")?.asText(); const document = zip.file("word/document.xml")?.asText();
    if (!types?.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") || !document?.includes("document") || !zip.file("_rels/.rels")) throw 0;
  } catch { throw new DocusignError("INVALID_SAVED_DOCX"); }
}
export type SavedDocument = { bytes: Buffer; hash: string; name: string };
export async function fetchSavedDocument(raw: string, fetcher: typeof fetch = fetch, resolve: typeof lookup = lookup): Promise<SavedDocument> {
  const url = validateDocumentUrl(raw);
  try {
    const addresses = await Promise.race([resolve(url.hostname, { all: true }), new Promise<never>((_, reject) => { const t = setTimeout(() => reject(new DocusignError("DOCUMENT_FETCH_FAILED")), 15000); t.unref(); })]);
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new DocusignError("DOCUMENT_SOURCE_NOT_ALLOWED");
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_DOCUMENT_BYTES) throw new DocusignError("DOCUMENT_FETCH_FAILED");
    const reader = response.body?.getReader(); if (!reader) throw new DocusignError("DOCUMENT_FETCH_FAILED");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_DOCUMENT_BYTES) { await reader.cancel(); throw new DocusignError("DOCUMENT_TOO_LARGE"); } chunks.push(value); }
    const bytes = Buffer.concat(chunks); validateDocx(bytes);
    return { bytes, hash: createHash("sha256").update(bytes).digest("hex"), name: decodeURIComponent(url.pathname.split("/").pop()!).replace(/[\x00-\x1f]/g, "").slice(0, 250) };
  } catch (error) { if (error instanceof DocusignError) throw error; throw new DocusignError("DOCUMENT_FETCH_FAILED"); }
}

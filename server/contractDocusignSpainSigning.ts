import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import { DocusignError } from "./contractDocusignConfig";
import type { ProviderTabs, ProviderTab } from "./contractDocusignProvider";
import { isValidSpainSigningPlan } from "./contractDocusignSpainPlan";

export const SPAIN_SIGNING_PROFILE = "spain-2026-11-12-v1" as const;
export const SPAIN_SIGNATURE_MARKERS = {
  FIRST: "ELEVAY_ES_SIGN_FIRST", MAIN: "ELEVAY_ES_SIGN_MAIN",
  SERVICES: "ELEVAY_ES_SIGN_SERVICES", ACK: "ELEVAY_ES_SIGN_ACK",
} as const;
export const SPAIN_INITIAL_MARKERS = {
  "6-1-b": "ELEVAY_ES_INIT_6_1_B", "6-1-j": "ELEVAY_ES_INIT_6_1_J",
  "7-5": "ELEVAY_ES_INIT_7_5", "7-7": "ELEVAY_ES_INIT_7_7",
  "8-5": "ELEVAY_ES_INIT_8_5", "9": "ELEVAY_ES_INIT_9",
  "10-2": "ELEVAY_ES_INIT_10_2", "12-4": "ELEVAY_ES_INIT_12_4",
  "12-1-j": "ELEVAY_ES_INIT_12_1_J",
} as const;
export const SPAIN_MARKERS = [...Object.values(SPAIN_SIGNATURE_MARKERS), ...Object.values(SPAIN_INITIAL_MARKERS)];
export type PdfItem = { text: string; x: number; y: number; width: number; height: number };
export type SigningPdfPage = { page: number; width: number; height: number; items: PdfItem[] };
export type SpainSigningPlan = {
  profile: typeof SPAIN_SIGNING_PROFILE; pdfHash: string; layoutHash: string; pageCount: number;
  pageSizes: { width: number; height: number }[];
  fullSignaturePages: number[]; initialPages: number[]; tabs: ProviderTabs;
};
const fail = (code = "SPAIN_SIGNING_LAYOUT_UNVERIFIED"): never => { throw new DocusignError(code); };
/** Existing saved bytes remain immutable. Old files require an owner-initiated regeneration, never silent rewriting. */
export function requireSpainSigningTemplate(bytes: Buffer): void {
  try {
    const zip = new PizZip(bytes), approved = new PizZip(readFileSync(new URL("./spain_dnv_contract_template_2026_11_12.docx",import.meta.url)));
    const xml = zip.file("word/document.xml")?.asText(), expected=approved.file("word/document.xml")?.asText();
    if (!xml || !expected) return fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
    for (const marker of SPAIN_MARKERS) if (xml.split(marker).length !== 2) fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
    const names=Object.keys(approved.files).filter(n=>!approved.files[n].dir).sort();
    if (JSON.stringify(names)!==JSON.stringify(Object.keys(zip.files).filter(n=>!zip.files[n].dir).sort())) fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
    for (const name of names.filter(n=>n!=="word/document.xml")) if (!Buffer.from(zip.file(name)!.asUint8Array()).equals(Buffer.from(approved.file(name)!.asUint8Array()))) fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
    // Exact XML and marker paragraph/cell/style provenance; only generated placeholder values may vary.
    const parts=expected.split(/(\{\{(?:CLIENT_NAME_AR|FAMILY_MEMBERS|CONTRACT_VALUE)\}\})/);
    let offset=0;const values=new Map<string,string>();
    for(let i=0;i<parts.length;i++) {
      const part=parts[i];
      if(i%2===0){if(!xml.startsWith(part,offset))fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");offset+=part.length;continue;}
      const next=parts[i+1],end=xml.indexOf(next,offset);if(end<offset)fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
      const value=xml.slice(offset,end);if(!value || value.length>1000 || /[<>{}\x00-\x1f\x7f]/.test(value))fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
      if(part==="{{FAMILY_MEMBERS}}" && (!/^\d{1,3}$/.test(value)||Number(value)<1))fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
      if(part==="{{CONTRACT_VALUE}}" && (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(value)||value.length>32))fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
      if(values.has(part)&&values.get(part)!==value)fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");values.set(part,value);offset=end;
    }
    if(offset!==xml.length || values.size!==3)fail("SPAIN_SIGNING_TEMPLATE_REQUIRED");
  } catch { fail("SPAIN_SIGNING_TEMPLATE_REQUIRED"); }
}
function locate(pages: SigningPdfPage[], marker: string): { page: SigningPdfPage; item: PdfItem } {
  const hits: { page: SigningPdfPage; item: PdfItem }[] = [];
  for (const page of pages) {
    // Marker runs are deliberately LTR and unique; whitespace inside a PDF text run is harmless.
    for (const item of page.items) {
      const occurrences=item.text.replace(/\s/g, "").split(marker).length-1;
      for(let n=0;n<occurrences;n++)hits.push({page,item});
    }
  }
  if (hits.length !== 1) fail();
  const {page,item}=hits[0];
  if(item.x<0||item.y<0||item.width<=0||item.height<=0||item.x+item.width>page.width||item.y+item.height>page.height)fail();
  return hits[0];
}
function tab(page: SigningPdfPage, label: string, x: number, y: number, signature: boolean): ProviderTab {
  const width = signature ? 72 : 34, height = signature ? 26 : 28;
  const px = Math.round(x), py = Math.round(y);
  if (![x,y].every(Number.isFinite) || px < 0 || py < 0 || px + width > page.width || py + height > page.height) fail();
  return { documentId: "1", recipientId: "1", pageNumber: String(page.page), xPosition: String(px), yPosition: String(py), tabLabel: label, optional: "false", scaleValue: "0.5", templateLocked: "true", templateRequired: "true" };
}
export function buildSpainSigningPlan(pages: SigningPdfPage[], pdfHash: string): SpainSigningPlan {
  if (!/^[a-f0-9]{64}$/.test(pdfHash) || pages.length < 4 || pages.length > 60) fail();
  for (let index=0;index<pages.length;index++) {
    const p=pages[index];
    if (p.page !== index + 1 || ![p.width,p.height].every(n => Number.isFinite(n) && n >= 400 && n <= 1200) || !Array.isArray(p.items) || p.items.length > 10000) fail();
    if (p.items.some(i => typeof i.text !== "string" || ![i.x,i.y,i.width,i.height].every(Number.isFinite))) fail();
  }
  const signs = Object.entries(SPAIN_SIGNATURE_MARKERS).map(([key,marker]) => ({ key, ...locate(pages, marker) }));
  const [first,main,services,ack] = signs;
  if (first.page.page !== 1 || main.page.page <= 1 || services.page.page <= main.page.page || ack.page.page < services.page.page || ack.page.page !== pages.length) fail();
  const signHereTabs = signs.map(s => tab(s.page, SPAIN_SIGNATURE_MARKERS[s.key as keyof typeof SPAIN_SIGNATURE_MARKERS], s.key === "FIRST" ? 12 : s.item.x + s.item.width + 2, s.key === "FIRST" ? s.page.height - 78 : s.item.y - 26, true));
  const fullSignaturePages = Array.from(new Set(signs.map(s => s.page.page)));
  const initialPages = pages.map(p => p.page).filter(n => !fullSignaturePages.includes(n));
  const initialHereTabs = initialPages.map(n => tab(pages[n-1], `ELEVAY_ES_PAGE_${n}`, 12, pages[n-1].height - 78, false));
  for (const marker of Object.values(SPAIN_INITIAL_MARKERS)) {
    const hit = locate(pages, marker);
    if (hit.item.y < 30 || hit.item.y > hit.page.height - 70) fail();
    // Clause initials occupy the left margin, not the clause's legal text or another party's signature.
    initialHereTabs.push(tab(hit.page, marker, 8, Math.max(0, hit.item.y - 8), false));
  }
  const tabs = { signHereTabs, initialHereTabs };
  // Prevent a short clause from placing two initial boxes over each other or a signature box.
  const group=[...signHereTabs,...initialHereTabs];
  for (let i=0;i<group.length;i++) for (let j=i+1;j<group.length;j++) {
    const a=group[i],b=group[j];
    const aw=a.tabLabel.startsWith("ELEVAY_ES_SIGN")?72:34,ah=a.tabLabel.startsWith("ELEVAY_ES_SIGN")?26:28,bw=b.tabLabel.startsWith("ELEVAY_ES_SIGN")?72:34,bh=b.tabLabel.startsWith("ELEVAY_ES_SIGN")?26:28;
    if(a.pageNumber===b.pageNumber && Number(a.xPosition)<Number(b.xPosition)+bw && Number(b.xPosition)<Number(a.xPosition)+aw && Number(a.yPosition)<Number(b.yPosition)+bh && Number(b.yPosition)<Number(a.yPosition)+ah)fail();
  }
  // PDF serialization metadata may change; this binds all extracted text and geometry, not just raw bytes.
  const round=(n:number)=>Math.round(n*100)/100;
  const layoutHash=createHash("sha256").update(JSON.stringify(pages.map(p=>({page:p.page,width:round(p.width),height:round(p.height),items:p.items.map(i=>({text:i.text,x:round(i.x),y:round(i.y),width:round(i.width),height:round(i.height)}))})))).digest("hex");
  return { profile: SPAIN_SIGNING_PROFILE, pdfHash, layoutHash, pageCount: pages.length, pageSizes: pages.map(({width,height})=>({width,height})), fullSignaturePages, initialPages, tabs };
}
/** Exact coverage is rechecked against provider tabs before issuing any fresh client session. */
export function verifySpainSigningTabs(plan: SpainSigningPlan | undefined, tabs: Record<string, unknown[]> | undefined): boolean {
  if (!isValidSpainSigningPlan(plan) || !tabs) return false;
  if(["approveTabs","declineTabs","signerAttachmentTabs","notarizeTabs"].some(k=>Array.isArray(tabs[k])&&tabs[k].length>0))return false;
  for (const key of ["signHereTabs", "initialHereTabs"] as const) {
    const actual = tabs[key]; const expected = plan.tabs[key];
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    for (const want of expected) {
      const matches = actual.filter((raw: any) => raw?.tabLabel === want.tabLabel);
      if (matches.length !== 1) return false;
      const got = matches[0] as any;
      if (got.documentId !== "1" || (got.recipientId !== undefined && got.recipientId !== "1") || !(got.optional === false || got.optional === "false") || got.tabGroupLabels?.length || got.conditionalParentLabel || got.conditionalParentValue || got.conditionalParentId) return false;
      if(!Number.isFinite(Number(got.scaleValue))||Math.abs(Number(got.scaleValue)-Number(want.scaleValue))>0.001)return false;
      if (Number(got.pageNumber) !== Number(want.pageNumber) || Math.abs(Number(got.xPosition)-Number(want.xPosition)) > 2 || Math.abs(Number(got.yPosition)-Number(want.yPosition)) > 2 || ![got.xPosition,got.yPosition].every((n:any)=>Number.isFinite(Number(n)))) return false;
    }
  }
  return true;
}
export async function readSpainSigningPdf(bytes: Buffer): Promise<SpainSigningPlan> {
  if (bytes.length > 10 * 1024 * 1024 || bytes.subarray(0,5).toString() !== "%PDF-") fail();
  let task: any; let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Reuse the public engine shipped with our existing pinned pdf-parse dependency.
    await import("pdf-parse");
    const { createRequire } = await import("node:module"); const { pathToFileURL } = await import("node:url");
    const root = createRequire(import.meta.url); const sub = createRequire(root.resolve("pdf-parse"));
    const engine: any = await import(pathToFileURL(sub.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
    const work = (async () => {
      task = engine.getDocument({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
      const doc = await task.promise;
      if (doc.numPages < 4 || doc.numPages > 60) fail();
      const pages: SigningPdfPage[] = [];
      for (let n=1;n<=doc.numPages;n++) {
        const page = await doc.getPage(n), view = page.getViewport({ scale: 1 });
        if (view.rotation !== 0) fail();
        const content = await page.getTextContent();
        if (content.items.length > 10000) fail();
        pages.push({ page: n, width: view.width, height: view.height, items: content.items.filter((i:any)=>typeof i.str==="string" && i.str).map((i:any)=>{ const [x,y]=view.convertToViewportPoint(i.transform[4],i.transform[5]); return {text:i.str.normalize("NFKC"),x,y:y-i.height,width:i.width,height:i.height}; }) });
      }
      return buildSpainSigningPlan(pages,createHash("sha256").update(bytes).digest("hex"));
    })();
    return await Promise.race([work,new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new DocusignError("SPAIN_SIGNING_LAYOUT_UNVERIFIED")),15000);})]);
  } catch { return fail(); }
  finally { if(timeout)clearTimeout(timeout); if(task) await task.destroy().catch(()=>{}); }
}

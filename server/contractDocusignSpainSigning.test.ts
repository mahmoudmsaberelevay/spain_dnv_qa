import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import PDFDocument from "pdfkit";
import { buildSpainSigningPlan, requireSpainSigningTemplate, readSpainSigningPdf, verifySpainSigningTabs, SPAIN_MARKERS, SPAIN_INITIAL_MARKERS, SPAIN_SIGNATURE_MARKERS, type SigningPdfPage } from "./contractDocusignSpainSigning";
export function syntheticPages(count=19): SigningPdfPage[] {
  const pages=Array.from({length:count},(_,i)=>({page:i+1,width:612,height:792,items:[] as any[]}));
  const place=(page:number,text:string,y:number)=>pages[page-1].items.push({text,x:230,y,width:25,height:1});
  const signs=[1,count-3,count-1,count];
  Object.values(SPAIN_SIGNATURE_MARKERS).forEach((m,i)=>place(signs[i],m,350));
  Object.values(SPAIN_INITIAL_MARKERS).forEach((m,i)=>place(Math.min(count-4,Math.floor(i/2)+3),m,150+(i%2)*70));
  return pages;
}
const hash="a".repeat(64);
describe("Spain versioned mandatory signing plan",()=>{
 it("four semantic full signatures and bottom-left initials on every other actual page plus nine clause initials",()=>{
  const p=buildSpainSigningPlan(syntheticPages(),hash);
  expect(p.fullSignaturePages).toEqual([1,16,18,19]);expect(p.initialPages).toHaveLength(15);
  expect(p.tabs.signHereTabs).toHaveLength(4);expect(p.tabs.initialHereTabs).toHaveLength(24);
  expect(p.tabs.initialHereTabs.map(t=>t.tabLabel)).toContain("ELEVAY_ES_INIT_12_1_J");
  expect(p.tabs.initialHereTabs.some(t=>t.tabLabel.includes("12_2_J"))).toBe(false);
  expect(p.tabs.initialHereTabs.filter(t=>t.tabLabel.startsWith("ELEVAY_ES_PAGE")).every(t=>!p.fullSignaturePages.includes(Number(t.pageNumber)))).toBe(true);
  for(const t of [...p.tabs.signHereTabs,...p.tabs.initialHereTabs])expect(t).toMatchObject({optional:"false",documentId:"1",recipientId:"1",templateLocked:"true",templateRequired:"true"});
  expect(verifySpainSigningTabs(p,p.tabs)).toBe(true);
 });
 it("tracks conversion pagination rather than fixed pages16/18/19/21/22",()=>{
  const p=buildSpainSigningPlan(syntheticPages(22),hash);expect(p.fullSignaturePages).toEqual([1,19,21,22]);expect(p.tabs.initialHereTabs).toHaveLength(27);
 });
 it("keeps Article8-5 initials two points clear of the adjacent legal clause while preserving other clause locations",()=>{const p=buildSpainSigningPlan(syntheticPages(),hash);expect(p.tabs.initialHereTabs.find(t=>t.tabLabel===SPAIN_INITIAL_MARKERS["8-5"])?.xPosition).toBe("6");expect(p.tabs.initialHereTabs.filter(t=>t.tabLabel.startsWith("ELEVAY_ES_INIT")&&t.tabLabel!==SPAIN_INITIAL_MARKERS["8-5"]).every(t=>t.xPosition==="8")).toBe(true);});
 it("rejects an approved document whose printed value differs from the saved net contract amount",()=>{const zip=new PizZip(readFileSync(new URL("./spain_dnv_contract_template_2026_11_12.docx",import.meta.url)));zip.file("word/document.xml",zip.file("word/document.xml")!.asText().replaceAll("{{CLIENT_NAME_AR}}","Synthetic").replace("{{FAMILY_MEMBERS}}","5").replace("{{CONTRACT_VALUE}}","10,000"));const bytes=zip.generate({type:"nodebuffer"});expect(()=>requireSpainSigningTemplate(bytes,"10000.00")).not.toThrow();expect(()=>requireSpainSigningTemplate(bytes,"15000.00")).toThrow("SPAIN_SIGNING_TEMPLATE_REQUIRED");});
 it.each(SPAIN_MARKERS)("fails closed if required marker %s is missing or duplicated",marker=>{
  const pages=syntheticPages();const owner=pages.find(p=>p.items.some(i=>i.text===marker))!;
  owner.items=owner.items.filter(i=>i.text!==marker);expect(()=>buildSpainSigningPlan(pages,hash)).toThrow("SPAIN_SIGNING_LAYOUT_UNVERIFIED");
  owner.items.push({text:marker,x:100,y:250,width:25,height:1},{text:marker,x:180,y:400,width:25,height:1});expect(()=>buildSpainSigningPlan(pages,hash)).toThrow();
 });
 it("permits services and acknowledgment on the same physical page while still requiring both full signatures",()=>{
  const pages=syntheticPages();pages[18].items.push(...pages[17].items.map(i=>({...i,y:200})));pages[17].items=[];
  const p=buildSpainSigningPlan(pages,hash);expect(p.fullSignaturePages).toEqual([1,16,19]);expect(p.tabs.signHereTabs).toHaveLength(4);expect(p.initialPages).toContain(18);
 });
 it.each(["optional","missing","wrong-document","wrong-recipient","moved","duplicate","conditional","grouped","NaN"])("refuses %s provider field tampering",kind=>{
  const p=buildSpainSigningPlan(syntheticPages(),hash),tabs=structuredClone(p.tabs) as any;
  const t=tabs.initialHereTabs[0];
  if(kind==="optional")t.optional="true";if(kind==="missing")tabs.initialHereTabs.shift();
  if(kind==="wrong-document")t.documentId="2";if(kind==="wrong-recipient")t.recipientId="2";
  if(kind==="moved")t.yPosition=String(Number(t.yPosition)+10);if(kind==="duplicate")tabs.initialHereTabs.push({...t});
  if(kind==="conditional")t.conditionalParentLabel="escape";if(kind==="grouped")t.tabGroupLabels=["optional group"];if(kind==="NaN")t.xPosition="NaN";
  expect(verifySpainSigningTabs(p,tabs)).toBe(false);
 });
 it.each(["bounds","blank","order","overlap","too-many","invalid-hash"])("refuses an unverified %s layout",kind=>{
  const pages=syntheticPages();let h=hash;
  if(kind==="bounds")pages[3].width=30;if(kind==="blank")pages[1].items=[]; // an ordinary page may contain no text
  if(kind==="order")pages[0].page=5;if(kind==="overlap")pages[2].items[1].y=pages[2].items[0].y;
  if(kind==="too-many")pages.push(...syntheticPages(60));if(kind==="invalid-hash")h="invalid";
  if(kind==="blank")expect(()=>buildSpainSigningPlan(pages,h)).not.toThrow();else expect(()=>buildSpainSigningPlan(pages,h)).toThrow();
 });
 it("revised source retains all legal text and all other ZIP parts; old template cannot silently use the new policy",()=>{
  const old=readFileSync(new URL("./spain_dnv_contract_template_2026_09_23.docx",import.meta.url)),fresh=readFileSync(new URL("./spain_dnv_contract_template_2026_11_12.docx",import.meta.url));
  expect(()=>requireSpainSigningTemplate(old)).toThrow("SPAIN_SIGNING_TEMPLATE_REQUIRED");
  const filled=new PizZip(fresh);filled.file("word/document.xml",filled.file("word/document.xml")!.asText().replaceAll("{{CLIENT_NAME_AR}}","أحمد &amp; محمد").replace("{{FAMILY_MEMBERS}}","4").replace("{{CONTRACT_VALUE}}","14,500.75"));expect(()=>requireSpainSigningTemplate(filled.generate({type:"nodebuffer"}))).not.toThrow();
  const valid=filled.file("word/document.xml")!.asText();for(const change of [(x:string)=>x.replace("ELEVAY_ES_SIGN_MAIN","TEMP_MARKER").replace("ELEVAY_ES_SIGN_ACK","ELEVAY_ES_SIGN_MAIN").replace("TEMP_MARKER","ELEVAY_ES_SIGN_ACK"),(x:string)=>x.replace("</w:t>","ALTERED_LEGAL_TEXT</w:t>"),(x:string)=>x.replace("أحمد &amp; محمد","Different Name")]){const tampered=change(valid);expect(tampered).not.toBe(valid);filled.file("word/document.xml",tampered);expect(()=>requireSpainSigningTemplate(filled.generate({type:"nodebuffer"}))).toThrow("SPAIN_SIGNING_TEMPLATE_REQUIRED");}
  const a=new PizZip(old),b=new PizZip(fresh),ax=a.file("word/document.xml")!.asText(),bx=b.file("word/document.xml")!.asText();
  const texts=(x:string)=>Array.from(x.replace(/<w:(t|delText|instrText)(?:\s[^>]*?)?\/>/g,"<w:$1></w:$1>").matchAll(/<w:(?:t|delText|instrText)(?:\s[^>]*)?>([\s\S]*?)<\/w:(?:t|delText|instrText)>/g)).map(m=>m[1]).filter(t=>!t.startsWith("ELEVAY_ES_"));
  expect(texts(bx)).toEqual(texts(ax));for(const n of Object.keys(a.files).filter(n=>n!=="word/document.xml"))expect(b.file(n)?.asUint8Array()).toEqual(a.file(n)?.asUint8Array());
  for(const m of SPAIN_MARKERS)expect(bx.split(m)).toHaveLength(2);
  expect(bx).toContain('w:color w:val="FFFFFF"');expect(bx).toContain('w:pageBreakBefore');
 });
 it("counts duplicate marker occurrences within one text item and rejects off-page marker rectangles",()=>{
  const pages=syntheticPages();pages[0].items[0].text+="ELEVAY_ES_SIGN_FIRST";expect(()=>buildSpainSigningPlan(pages,hash)).toThrow();
  for(const key of ["x","y"] as const){const p=syntheticPages();p[0].items[0][key]=-1;expect(()=>buildSpainSigningPlan(p,hash)).toThrow();}
 });
 it("parses the public PDF engine's actual text positions, never logs documents and sanitizes corrupt input",async()=>{
  const pages=syntheticPages();const doc=new PDFDocument({size:[612,792],margin:0,autoFirstPage:false});const chunks:Buffer[]=[];
  const ready=new Promise<Buffer>(resolve=>{doc.on("data",c=>chunks.push(c));doc.on("end",()=>resolve(Buffer.concat(chunks)));});
  for(const p of pages){doc.addPage();for(const i of p.items)doc.fontSize(1).fillColor("white").text(i.text,i.x,i.y,{lineBreak:false});}doc.end();
  const bytes=await ready;const log=vi.spyOn(console,"log"),warn=vi.spyOn(console,"warn"),error=vi.spyOn(console,"error");
  const plan=await readSpainSigningPdf(bytes);expect(plan.pageCount).toBe(19);expect(plan.tabs.signHereTabs).toHaveLength(4);
  await expect(readSpainSigningPdf(Buffer.from("%PDF- corrupt private document"))).rejects.toMatchObject({message:"SPAIN_SIGNING_LAYOUT_UNVERIFIED"});
  expect(log).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();log.mockRestore();warn.mockRestore();error.mockRestore();
 },20000);
});

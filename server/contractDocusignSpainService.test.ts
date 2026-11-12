import {beforeEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import PizZip from "pizzip";
vi.mock("./contractDocusignSpainSigning",async original=>({...await original<any>(),readSpainSigningPdf:vi.fn()}));
import {ContractDocusignService} from "./contractDocusignService";
import {buildSpainSigningPlan,readSpainSigningPdf,SPAIN_SIGNATURE_MARKERS,SPAIN_INITIAL_MARKERS,type SigningPdfPage} from "./contractDocusignSpainSigning";
import {DocusignError,type DocusignConfig} from "./contractDocusignConfig";
import type {ContractSource,DocusignStore,EnvelopeRow} from "./contractDocusignStore";
import type {ProviderTabs} from "./contractDocusignProvider";
class Store implements DocusignStore{
 rows=new Map<string,EnvelopeRow>(); inTransaction=false;tail=Promise.resolve();
 source:ContractSource={id:900,contractCode:"SYNTHETIC",clientName:"Synthetic Client",country:"spain",status:"pending",docUrl:"https://example.test/synthetic.docx"};
 async contract(){return {...this.source};}async get(id:string){return this.rows.get(id)??null;}
 async list(){return Array.from(this.rows.values()).sort((a,b)=>b.version-a.version);}
 async byRequest(id:string){return (await this.list()).find(r=>r.requestId===id)??null;}
 async insert(r:EnvelopeRow){this.rows.set(r.id,r);}async patch(id:string,p:Partial<EnvelopeRow>){const r={...this.rows.get(id)!,...p};this.rows.set(id,r);return r;}
 private lock<T>(fn:()=>Promise<T>){const result=this.tail.then(async()=>{this.inTransaction=true;try{return await fn();}finally{this.inTransaction=false;}});this.tail=result.then(()=>{},()=>{});return result;}
  async withEnvelopeLock<T>(id:string,fn:any):Promise<T>{return this.lock(()=>fn(this.rows.get(id),this));}
  async withContractLock<T>(_id:number,fn:any):Promise<T>{return this.lock(()=>fn({...this.source},this));}
  async withSigningLock<T>(id:string,fn:any):Promise<T>{return this.lock(()=>fn(this.rows.get(id),{...this.source},this));}
}
const actor={id:1,name:"Synthetic Staff",openId:"synthetic",email:"staff@example.test",role:"user" as const,canManage:true};
const input=()=>({contractId:900,requestId:randomUUID(),recipientName:"Synthetic Client",recipientEmail:"client@example.test",confirmed:true as const});
let store:Store,service:ContractDocusignService,provider:any,fields:ProviderTabs,status:string,bytes:Buffer;
beforeEach(()=>{
 store=new Store();fields={signHereTabs:[],initialHereTabs:[]};status="created";bytes=readFileSync(new URL("./spain_dnv_contract_template_2026_11_12.docx",import.meta.url));
 const zip=new PizZip(bytes);zip.file("word/document.xml",zip.file("word/document.xml")!.asText().replaceAll("{{CLIENT_NAME_AR}}","Synthetic Client").replace("{{FAMILY_MEMBERS}}","1").replace("{{CONTRACT_VALUE}}","12,000"));bytes=zip.generate({type:"nodebuffer"});
 const pages:SigningPdfPage[]=Array.from({length:19},(_,i)=>({page:i+1,width:612,height:792,items:[]}));
 Object.values(SPAIN_SIGNATURE_MARKERS).forEach((m,i)=>pages[[1,16,18,19][i]-1].items.push({text:m,x:230,y:350,width:25,height:1}));
 Object.values(SPAIN_INITIAL_MARKERS).forEach((m,i)=>pages[Math.floor(i/2)+2].items.push({text:m,x:230,y:150+i%2*70,width:25,height:1}));
 vi.mocked(readSpainSigningPdf).mockResolvedValue(buildSpainSigningPlan(pages,"a".repeat(64)));
 provider={assertOnlyDocumentOne:vi.fn(async()=>{expect(store.inTransaction).toBe(false);}),createDraft:vi.fn(async()=>randomUUID()),getEnvelopeStatus:vi.fn(async()=>status),getDocumentPdf:vi.fn(async()=>{expect(store.inTransaction).toBe(false);return Buffer.from("%PDF-SYNTHETIC");}),createSenderView:vi.fn(async()=>"https://demo.docusign.net/Member/StartInSession.aspx?synthetic=1"),createRecipientView:vi.fn(async()=>"https://demo.docusign.net/Signing/StartInSession.aspx?synthetic=1"),createRequiredTabs:vi.fn(async(_id:any,_recipient:any,t:any)=>{expect(store.inTransaction).toBe(false);expect((await store.list())[0].documentSourceSnapshot.signingSetupAttempted).toBe(true);fields=structuredClone(t);}),getRecipients:vi.fn(async()=>{expect(store.inTransaction).toBe(false);const row=(await store.list())[0];return {signers:[{name:row.recipientName,email:row.recipientEmail,recipientId:"1",clientUserId:row.clientUserId,status:"sent",tabs:fields}]};})};
 const cfg:DocusignConfig={environment:"demo",integrationKey:randomUUID(),userId:randomUUID(),accountId:randomUUID(),privateKey:"unused synthetic",linkSecret:"synthetic application secret32characters",publicBaseUrl:"https://elevay.vip"};
 service=new ContractDocusignService(store,provider,cfg,async()=>({bytes,name:"synthetic.docx",hash:createHash("sha256").update(bytes).digest("hex")}));
});
describe("Spain automatic mandatory fields and isolated ledger",()=>{
 it("uploads the exact saved bytes, persists the plan, creates required tabs once, preserves contract and returns no private plan",async()=>{
  const before=structuredClone(store.source),i=input(),result=await service.prepare(i,actor);
  expect(provider.createDraft).toHaveBeenCalledTimes(1);expect(provider.createDraft.mock.calls[0][0].document).toEqual(bytes);
  expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);expect(fields.signHereTabs).toHaveLength(4);expect(fields.initialHereTabs).toHaveLength(24);
  expect(result.envelope.hasSignatureTabs).toBe(true);expect(result.envelope.signingRequirements).toMatchObject({pageCount:19,pageInitialCount:15,clauseInitialCount:9,verified:true});
  expect((await store.list())[0].hasSignatureTabs).toBe(true);expect(store.source).toEqual(before);
  expect(result.envelope).not.toHaveProperty("documentSourceSnapshot");await service.prepare(i,actor);await service.senderView(result.envelope.id);expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);
});
 it("old saved Spain Word files fail before creating an envelope or changing a contract",async()=>{
  bytes=readFileSync(new URL("./spain_dnv_contract_template_2026_09_23.docx",import.meta.url));const before=structuredClone(store.source);
  await expect(service.prepare(input(),actor)).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_TEMPLATE_REQUIRED"});expect(provider.createDraft).not.toHaveBeenCalled();expect(store.rows.size).toBe(0);expect(store.source).toEqual(before);
 });
 it("non-Spain keeps the existing manual field workflow and never requests the new PDF/tab methods",async()=>{
  store.source.country="greece";const r=await service.prepare(input(),actor);expect(r.envelope.status).toBe("draft");expect(provider.getDocumentPdf).not.toHaveBeenCalled();expect(provider.createRequiredTabs).not.toHaveBeenCalled();
 });
 it("an uncertain tab POST is never repeated and the single draft is retained",async()=>{
  provider.createRequiredTabs.mockRejectedValueOnce(new DocusignError("PROVIDER_TIMEOUT_OR_NETWORK",true));const i=input();await expect(service.prepare(i,actor)).rejects.toBeInstanceOf(DocusignError);
  const row=(await store.list())[0];expect(row.status).toBe("draft");expect(row.documentSourceSnapshot.signingSetupAttempted).toBe(true);
  await expect(service.prepare(i,actor)).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED"});expect(provider.createDraft).toHaveBeenCalledTimes(1);expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);expect(provider.createSenderView).not.toHaveBeenCalled();
 });
 it("a lost response after successful field creation is reconciled by read-only inspection, not another POST",async()=>{
  const write=provider.createRequiredTabs.getMockImplementation();provider.createRequiredTabs.mockImplementationOnce(async(...args:any[])=>{await write(...args);throw new DocusignError("PROVIDER_TIMEOUT_OR_NETWORK",true);});
  const i=input();await expect(service.prepare(i,actor)).rejects.toBeInstanceOf(DocusignError);await service.prepare(i,actor);expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);expect((await store.list())[0].errorCode).toBe(null);
 });
 it("layout failure leaves one draft and creates neither fields nor sender session",async()=>{
  vi.mocked(readSpainSigningPdf).mockRejectedValueOnce(new DocusignError("SPAIN_SIGNING_LAYOUT_UNVERIFIED"));await expect(service.prepare(input(),actor)).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_LAYOUT_UNVERIFIED"});expect(store.rows.size).toBe(1);expect(provider.createRequiredTabs).not.toHaveBeenCalled();expect(provider.createSenderView).not.toHaveBeenCalled();
 });
 it("cannot edit provider sent or completed envelopes during initial setup",async()=>{
  status="sent";await expect(service.prepare(input(),actor)).rejects.toMatchObject({safeCode:"DRAFT_REQUIRED"});expect(provider.createRequiredTabs).not.toHaveBeenCalled();
 });
 it("refuses extra recipients, removes no recipient and never posts tabs for mismatched client identity",async()=>{
  const original=provider.getRecipients.getMockImplementation();provider.getRecipients.mockImplementationOnce(async()=>({...await original(),carbonCopies:[{email:"unapproved@example.test"}]}));
  await expect(service.prepare(input(),actor)).rejects.toMatchObject({safeCode:"RECIPIENT_MISMATCH"});expect(provider.createRequiredTabs).not.toHaveBeenCalled();
 });
 it("rechecks every required initial at link issue and session start even within the provider polling cache",async()=>{
  const r=await service.prepare(input(),actor);status="sent";const link=await service.signingLink(r.envelope.id);const token=link.url.split("#")[1];
  fields.initialHereTabs.shift();await expect(service.startSigning(r.envelope.id,token)).rejects.toMatchObject({safeCode:"SIGNING_LINK_UNAVAILABLE"});await expect(service.signingLink(r.envelope.id)).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED"});expect(provider.createRecipientView).not.toHaveBeenCalled();expect(store.source.status).toBe("pending");
 });
 it("existing completed legacy dummy remains readable without adding any markers or fields",async()=>{
  store.source.country="greece";const r=await service.prepare(input(),actor);await store.patch(r.envelope.id,{status:"completed"});store.source.country="spain";
  expect((await service.history(900))[0].status).toBe("completed");await expect(service.senderView(r.envelope.id)).rejects.toMatchObject({safeCode:"DRAFT_REQUIRED"});expect(provider.createRequiredTabs).not.toHaveBeenCalled();
 });
 it("blocks PDF layout drift and extra provider documents before sharing or returning a client session",async()=>{
  const r=await service.prepare(input(),actor);status="sent";const link=await service.signingLink(r.envelope.id),row=(await store.list())[0],plan=row.documentSourceSnapshot.signingPlan!;
  vi.mocked(readSpainSigningPdf).mockResolvedValueOnce({...plan,layoutHash:"b".repeat(64)});await expect(service.startSigning(r.envelope.id,link.url.split("#")[1])).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_DOCUMENT_CHANGED"});
  provider.assertOnlyDocumentOne.mockRejectedValueOnce(new DocusignError("SPAIN_SIGNING_DOCUMENTS_MISMATCH"));await expect(service.signingLink(r.envelope.id)).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_DOCUMENTS_MISMATCH"});expect(provider.createRecipientView).not.toHaveBeenCalled();expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);
 });
 it("rejects pre-existing unmatched signature fields before consuming the one-shot reservation",async()=>{
  fields.signHereTabs=[{documentId:"1",recipientId:"1",pageNumber:"1",xPosition:"12",yPosition:"600",tabLabel:"UNAPPROVED",optional:"false",scaleValue:"0.7",templateLocked:"true",templateRequired:"true"}];
  await expect(service.prepare(input(),actor)).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED"});expect(provider.createRequiredTabs).not.toHaveBeenCalled();expect((await store.list())[0].documentSourceSnapshot.signingSetupAttempted).not.toBe(true);
 });
 it("malformed saved metadata neither crashes history nor authorizes incomplete coverage",async()=>{
  const r=await service.prepare(input(),actor),row=(await store.list())[0];await store.patch(row.id,{documentSourceSnapshot:{...row.documentSourceSnapshot,signingPlan:{profile:"spain-2026-11-12-v1"} as any}});
  const history=await service.history(900);expect(history[0].canShare).toBe(false);expect(history[0].signingRequirements).toBeUndefined();expect(history[0].errorCode).toBe("SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED");
  await expect(service.senderView(r.envelope.id)).rejects.toBeInstanceOf(DocusignError);expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);
 });
 it("does not silently downgrade unknown new Spain metadata to the legacy manual policy",async()=>{
  const r=await service.prepare(input(),actor),row=(await store.list())[0];await store.patch(row.id,{documentSourceSnapshot:{...row.documentSourceSnapshot,signingProfile:"unknown" as any}});
  await expect(service.senderView(r.envelope.id)).rejects.toMatchObject({safeCode:"SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED"});expect((await service.history(900))[0].canShare).toBe(false);expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);
 });
 it("a freshly completed recipient cannot receive a cached eligible invitation or client session",async()=>{
  const r=await service.prepare(input(),actor);status="sent";const link=await service.signingLink(r.envelope.id),original=provider.getRecipients.getMockImplementation();provider.getRecipients.mockImplementation(async()=>{const x=await original();x.signers[0].status="completed";return x;});
  await expect(service.startSigning(r.envelope.id,link.url.split("#")[1])).rejects.toMatchObject({safeCode:"SIGNING_LINK_UNAVAILABLE"});await expect(service.signingLink(r.envelope.id)).rejects.toBeInstanceOf(DocusignError);expect(provider.createRecipientView).not.toHaveBeenCalled();
 });
 it("discards a private recipient URL if revocation races with provider session creation",async()=>{
  const r=await service.prepare(input(),actor);status="sent";const link=await service.signingLink(r.envelope.id);provider.createRecipientView.mockImplementationOnce(async()=>{expect(store.inTransaction).toBe(false);await service.revokeLink(r.envelope.id);return "https://demo.docusign.net/Signing/private-never-returned";});
  await expect(service.startSigning(r.envelope.id,link.url.split("#")[1])).rejects.toMatchObject({safeCode:"SIGNING_LINK_UNAVAILABLE"});expect(provider.createRecipientView).toHaveBeenCalledTimes(1);
 });
 it("ten concurrent sender reads perform no external work while retaining database locks and never repost fields",async()=>{
  const r=await service.prepare(input(),actor);await Promise.all(Array.from({length:10},()=>service.senderView(r.envelope.id)));expect(provider.createRequiredTabs).toHaveBeenCalledTimes(1);expect(store.inTransaction).toBe(false);
 });
});

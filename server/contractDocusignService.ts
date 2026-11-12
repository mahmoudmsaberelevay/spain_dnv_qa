import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { SafeEnvelope, PrepareDocusignInput, ContractDocusignStatus } from "../shared/contractDocusign";
import { DocusignError, getDocusignConfig, type DocusignConfig } from "./contractDocusignConfig";
import { JwtDocusignProvider, type DocusignProvider, type DraftInput, type ProviderRecipient } from "./contractDocusignProvider";
import { fetchSavedDocument, type SavedDocument } from "./contractDocusignDocument";
import { docusignStore, type DocusignStore, type EnvelopeRow, type ContractSource } from "./contractDocusignStore";
import type { DocusignActor } from "./contractDocusignAccess";
import { SPAIN_SIGNING_PROFILE, requireSpainSigningTemplate, readSpainSigningPdf, verifySpainSigningTabs } from "./contractDocusignSpainSigning";
import { isValidSpainSigningPlan } from "./contractDocusignSpainPlan";
import { captureCompletionDocumentProof, verifyCompletionDocumentProof } from "./contractDocusignCompletionProof";
export const POLL_INTERVAL_MS = 15 * 60 * 1000;
export const SIGNING_LINK_LIFETIME_MS = 48 * 60 * 60 * 1000;
const terminal = new Set<ContractDocusignStatus>(["completed", "declined", "voided"]);
const digest = (name: string, email: string) => createHash("sha256").update(JSON.stringify([name, email])).digest("hex");
const time = (date: Date | null) => date?.getTime() ?? 0;
function pending(source: ContractSource | null): asserts source is ContractSource & { docUrl: string } { if (!source || source.status !== "pending" || !source.docUrl) throw new DocusignError("PENDING_SAVED_CONTRACT_REQUIRED"); }
export function financialSource(source:ContractSource) {
  if(source.contractValue===undefined)return undefined; // synthetic/legacy projections only
  const money=(value:string|null|undefined)=>{const n=Number(value??0);if(!Number.isFinite(n)||n<0)throw new DocusignError("CONTRACT_SOURCE_CHANGED");return n.toFixed(2);};
  const result={originalValue:money(source.originalContractValueEur??String(Number(source.contractValue)+Number(source.discountValue??0))),netValue:money(source.netContractValueEur??source.contractValue),discount:money(source.discountValue),currency:source.currency??"EUR"};
  if(money(source.contractValue)!==result.netValue||Math.round(Number(result.originalValue)*100)-Math.round(Number(result.discount)*100)!==Math.round(Number(result.netValue)*100))throw new DocusignError("CONTRACT_SOURCE_CHANGED");
  return result;
}
function assertPinnedSource(row:EnvelopeRow,source:ContractSource|null) {
  pending(source);
  if(source.docUrl!==row.documentSourceUrl||source.contractCode!==row.documentSourceSnapshot.contractCode||source.clientName!==row.documentSourceSnapshot.clientName||(row.documentSourceSnapshot.country&&source.country!==row.documentSourceSnapshot.country))throw new DocusignError("CONTRACT_SOURCE_CHANGED");
  const saved=row.documentSourceSnapshot.financialSnapshot,current=financialSource(source);
  if(saved&&(!current||["originalValue","netValue","discount","currency"].some(k=>saved[k as keyof typeof saved]!==current[k as keyof typeof current])))throw new DocusignError("CONTRACT_SOURCE_CHANGED");
}
function readyToShare(row:EnvelopeRow,now:number) {
  return ["sent","delivered"].includes(row.status)&&row.hasSignatureTabs&&row.recipientVerified&&!row.errorCode&&!!row.lastCheckedAt&&now-time(row.lastCheckedAt)<POLL_INTERVAL_MS&&time(row.lastCheckAttemptAt)<=time(row.lastCheckedAt);
}
function shareable(row: EnvelopeRow, now: number) {
  return readyToShare(row,now)&&!row.revokedAt&&(!row.linkExpiresAt||time(row.linkExpiresAt)>now);
}
export function safeEnvelope(row: EnvelopeRow, now = Date.now()): SafeEnvelope {
  const metadata=row.documentSourceSnapshot;
  const isSpain=metadata.signingProfile===SPAIN_SIGNING_PROFILE||metadata.country==="spain"||!!metadata.signingPlan;
  const invalid=isSpain&&(metadata.signingProfile!==SPAIN_SIGNING_PROFILE||!isValidSpainSigningPlan(metadata.signingPlan));
  const plan = isValidSpainSigningPlan(metadata.signingPlan)?metadata.signingPlan:undefined;
  const signingRequirements = plan ? { profile:plan.profile,pageCount:plan.pageCount,fullSignaturePages:plan.fullSignaturePages,pageInitialCount:plan.initialPages.length,clauseInitialCount:9,verified:row.hasSignatureTabs && row.recipientVerified && !row.errorCode } : undefined;
  return { id: row.id, version: row.version, contractId: row.contractId, envelopeId: row.providerEnvelopeId, status: row.status, recipientName: row.recipientName, email: row.recipientEmail, createdAt: row.createdAt, updatedAt: row.updatedAt, lastCheckedAt: row.lastCheckedAt, linkExpiresAt: row.linkExpiresAt, nextRefreshAt: terminal.has(row.status) && !(row.status==="completed"&&metadata.completionProfile&&!metadata.syncCompletedAt) || !row.providerEnvelopeId ? null : row.lastCheckAttemptAt ? new Date(time(row.lastCheckAttemptAt) + POLL_INTERVAL_MS) : null, canShare: !invalid&&shareable(row, now), canRegenerate:!invalid&&readyToShare(row,now), linkRevoked:!!row.revokedAt, crmSigned:!!metadata.syncCompletedAt, autoSignEligible:row.environment==="production"&&metadata.completionProfile==="verified-production-v1", financeReviewRequired:!!metadata.financeReviewRequired, hasSignatureTabs: !invalid&&row.hasSignatureTabs, errorCode: invalid?"SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED":row.errorCode, documentHash: row.documentHash, ...(signingRequirements ? {signingRequirements} : {}) };
}
export function inspectSigner(row: EnvelopeRow, recipients: Record<string, unknown>) {
  const signers = recipients.signers as ProviderRecipient[];
  if (!Array.isArray(signers) || signers.length !== 1 || Object.keys(recipients).some(key => key !== "signers" && Array.isArray(recipients[key]) && (recipients[key] as unknown[]).length > 0)) return { verified: false, mandatory: false, completed: false };
  const signer = signers[0];
  const verified = signer.recipientId === row.recipientId && signer.clientUserId === row.clientUserId && signer.name === row.recipientName && signer.email?.toLowerCase() === row.recipientEmail && !["declined", "autoresponded"].includes(signer.status ?? "");
  const tabs = signer.tabs?.signHereTabs as any[] | undefined;
  const mandatory = verified && Array.isArray(tabs) && tabs.some(tab => tab.documentId === "1" && (tab.optional === undefined || tab.optional === false || tab.optional === "false") && !tab.tabGroupLabels?.length && !tab.conditionalParentLabel && !tab.conditionalParentValue && !tab.conditionalParentId && Number(tab.pageNumber) >= 1 && Number.isFinite(Number(tab.xPosition)) && Number.isFinite(Number(tab.yPosition)) && Number(tab.xPosition) >= 0 && Number(tab.yPosition) >= 0 && (tab.recipientId === undefined || tab.recipientId === row.recipientId));
  const needsSpain=row.documentSourceSnapshot.signingProfile||row.documentSourceSnapshot.country==="spain"||row.documentSourceSnapshot.signingPlan;
  const spainMandatory = needsSpain ? row.documentSourceSnapshot.signingProfile===SPAIN_SIGNING_PROFILE&&verifySpainSigningTabs(row.documentSourceSnapshot.signingPlan, signer.tabs) : true;
  return { verified, mandatory: mandatory && spainMandatory, completed: signer.status === "completed" || signer.status === "signed" };
}
export function completionTabsFingerprint(recipients:Record<string,unknown>){
  const signer=(recipients.signers as ProviderRecipient[])?.[0],tabs=signer?.tabs;
  if(!tabs)throw new DocusignError("COMPLETION_REVIEW_REQUIRED");
  const data=["signHereTabs","initialHereTabs"].flatMap(kind=>{
    const group=tabs[kind]??[];if(!Array.isArray(group)||group.length>100)throw new DocusignError("COMPLETION_REVIEW_REQUIRED");
    return group.map((raw:any)=>[kind,raw.documentId,raw.recipientId??"1",raw.tabLabel??"",Number(raw.pageNumber),Number(raw.xPosition),Number(raw.yPosition),String(raw.scaleValue??"1"),raw.optional===true||raw.optional==="true",raw.conditionalParentLabel??null,raw.conditionalParentValue??null,raw.tabGroupLabels??[]]);
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
export class ContractDocusignService {
  constructor(private readonly store: DocusignStore, private readonly provider: DocusignProvider, private readonly config: DocusignConfig, private readonly document: (url: string) => Promise<SavedDocument> = fetchSavedDocument, private readonly now = Date.now,private readonly finalizeCompletion:(id:string)=>Promise<{status:string}> = async id=>(await import("./contractDocusignCompletion")).finalizeVerifiedDocusignContract(id)) {}
  private date() { return new Date(Math.floor(this.now() / 1000) * 1000); }
  private async row(id: string) { const row = await this.store.get(id); if (!row) throw new DocusignError("ENVELOPE_UNAVAILABLE"); this.binding(row); return row; }
  private binding(row: EnvelopeRow) { if (row.environment !== this.config.environment || row.accountId !== this.config.accountId) throw new DocusignError("ACCOUNT_BINDING_MISMATCH"); }
  private async sourceMatches(row: EnvelopeRow) {
    const source = await this.store.contract(row.contractId); assertPinnedSource(row,source); pending(source);
    const document = await this.document(source.docUrl);
    if (document.hash !== row.documentHash) throw new DocusignError("CONTRACT_SOURCE_CHANGED");
    const after = await this.store.contract(row.contractId); assertPinnedSource(row,after); pending(after);
    if (after.docUrl !== source.docUrl || after.contractCode !== source.contractCode || after.clientName !== source.clientName || after.country !== source.country) throw new DocusignError("CONTRACT_SOURCE_CHANGED");
  }
  private recipient(row: EnvelopeRow): DraftInput { return { id: row.id, document: Buffer.alloc(0), documentName: row.documentName, recipientName: row.recipientName, recipientEmail: row.recipientEmail, clientUserId: row.clientUserId, recipientId: row.recipientId }; }
  async history(contractId: number) { if (!await this.store.contract(contractId)) throw new DocusignError("CONTRACT_UNAVAILABLE"); return (await this.store.list(contractId)).map(row => safeEnvelope(row, this.now())); }
  async prepare(input: PrepareDocusignInput, actor: DocusignActor) {
    const recipientName = input.recipientName.trim(); const recipientEmail = input.recipientEmail.trim().toLowerCase();
    const source = await this.store.contract(input.contractId); pending(source);
    const document = await this.document(source.docUrl);
    const spain = source.country === "spain";
    if (spain) requireSpainSigningTemplate(document.bytes,financialSource(source)?.netValue);
    const reservation = await this.store.withContractLock(input.contractId, async (locked, ledger) => {
      pending(locked); if (locked.docUrl !== source.docUrl || locked.clientName !== source.clientName || locked.contractCode !== source.contractCode || locked.country !== source.country) throw new DocusignError("CONTRACT_SOURCE_CHANGED");
      const existing = await ledger.byRequest(input.requestId);
      if (existing) {
        this.binding(existing);
        if (existing.contractId !== input.contractId || existing.recipientDigest !== digest(recipientName, recipientEmail) || existing.documentHash !== document.hash) throw new DocusignError("IDEMPOTENCY_CONFLICT");
        return { row: existing, reserved: false };
      }
      const history = await ledger.list(input.contractId); const latest = history[0];
      if (latest && !terminal.has(latest.status) && !(latest.status === "error" && !latest.providerEnvelopeId)) throw new DocusignError(latest.status === "uncertain" || latest.status === "preparing" ? "MANUAL_RECONCILIATION_REQUIRED" : "ACTIVE_ENVELOPE_EXISTS");
      const id = randomUUID(); const date = this.date();
      const row: EnvelopeRow = { id, contractId: input.contractId, version: (latest?.version ?? 0) + 1, requestId: input.requestId, documentSourceUrl: locked.docUrl, documentHash: document.hash, documentSourceSnapshot: { contractCode: locked.contractCode, clientName: locked.clientName, sourceUrl: locked.docUrl, ...(locked.country ? { country: locked.country } : {}), ...(spain ? { signingProfile: SPAIN_SIGNING_PROFILE } : {}) }, documentName: document.name, documentExtension: "docx", recipientName, recipientEmail, recipientDigest: digest(recipientName, recipientEmail), clientUserId: `elevay-${id}`, recipientId: "1", providerEnvelopeId: null, environment: this.config.environment, accountId: this.config.accountId, status: "preparing", hasSignatureTabs: false, recipientVerified: false, errorCode: null, createdByUserId: actor.id, createdByName: (actor.name ?? "CRM user").slice(0,255), linkNonce: randomBytes(32).toString("hex"), createdAt: date, updatedAt: date, lastCheckedAt: null, lastCheckAttemptAt: null, linkExpiresAt: null, revokedAt: null };
      const financialSnapshot=financialSource(locked);
      if(JSON.stringify(financialSnapshot)!==JSON.stringify(financialSource(source)))throw new DocusignError("CONTRACT_SOURCE_CHANGED");
      if(financialSnapshot)row.documentSourceSnapshot.financialSnapshot=financialSnapshot;
      if(this.config.environment==="production"&&financialSnapshot&&!locked.contractCode.startsWith("DS-DEMO-"))row.documentSourceSnapshot.completionProfile="verified-production-v1";
      await ledger.insert(row); return { row, reserved: true };
    });
    if (!reservation.reserved) {
      if (reservation.row.status !== "draft" || !reservation.row.providerEnvelopeId) throw new DocusignError("MANUAL_RECONCILIATION_REQUIRED");
      const sender = await this.senderView(reservation.row.id);
      return { envelope: safeEnvelope(await this.row(reservation.row.id), this.now()), senderUrl: sender.url };
    }
    let row = reservation.row;
    try {
      // Reserve is already committed before any provider write. Never repeat this POST.
      const envelopeId = await this.provider.createDraft({ ...this.recipient(row), document: document.bytes });
      row = await this.store.patch(row.id, { providerEnvelopeId: envelopeId, status: "draft", updatedAt: this.date() });
    } catch (error) {
      const safe = error instanceof DocusignError ? error : new DocusignError("PREPARATION_UNCERTAIN", true);
      await this.store.patch(row.id, { status: safe.uncertain ? "uncertain" : "error", errorCode: safe.safeCode, updatedAt: this.date() });
      throw safe;
    }
    // A sender-view failure never discards/recreates the safely persisted draft.
    const sender = await this.senderView(row.id);
    return { envelope: safeEnvelope(await this.row(row.id), this.now()), senderUrl: sender.url };
  }
  private spainPolicy(row:EnvelopeRow) {
    const s=row.documentSourceSnapshot;
    if(s.signingProfile===SPAIN_SIGNING_PROFILE)return true;
    if(s.signingProfile||s.signingPlan||s.signingSetupAttempted||s.country==="spain")throw new DocusignError("SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED");
    return false; // genuinely legacy rows and other programs retain their original workflow
  }
  private async checkedSpainDocument(row:EnvelopeRow) {
    if(!this.provider.assertOnlyDocumentOne||!this.provider.getDocumentPdf||!row.providerEnvelopeId)throw new DocusignError("SPAIN_SIGNING_FIELDS_UNAVAILABLE");
    await this.provider.assertOnlyDocumentOne(row.providerEnvelopeId);
    const fresh=await readSpainSigningPdf(await this.provider.getDocumentPdf(row.providerEnvelopeId));
    const saved=row.documentSourceSnapshot.signingPlan;
    if(saved&&(!isValidSpainSigningPlan(saved)||saved.layoutHash!==fresh.layoutHash))throw new DocusignError("SPAIN_SIGNING_DOCUMENT_CHANGED");
    if(!isValidSpainSigningPlan(fresh))throw new DocusignError("SPAIN_SIGNING_LAYOUT_UNVERIFIED");
    if(saved) {
      const canonical=(p:typeof fresh)=>JSON.stringify([p.pageCount,p.pageSizes.map(s=>[s.width,s.height]),p.fullSignaturePages,p.initialPages,...[p.tabs.signHereTabs,p.tabs.initialHereTabs].map(ts=>ts.map(t=>[t.tabLabel,t.documentId,t.recipientId,t.pageNumber,t.xPosition,t.yPosition,t.optional,t.scaleValue,t.templateLocked,t.templateRequired]))]);
      if(canonical(saved)!==canonical(fresh))throw new DocusignError("SPAIN_SIGNING_DOCUMENT_CHANGED");
    }
    return fresh;
  }
  private async checkSpainRecipient(row:EnvelopeRow,publicRequest=false) {
    if(!this.spainPolicy(row))return;
    await this.checkedSpainDocument(row);
    const result=inspectSigner(row,await this.provider.getRecipients(row.providerEnvelopeId!));
    if(!result.verified||!result.mandatory||result.completed)throw new DocusignError(publicRequest?"SIGNING_LINK_UNAVAILABLE":"SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED");
  }
  private async prepareSpainFields(id: string) {
    const row=await this.row(id);
    if(!this.spainPolicy(row))return row;
    if(row.status!=="draft"||!row.providerEnvelopeId||!this.provider.createRequiredTabs||!this.store.withSigningLock)throw new DocusignError("SPAIN_SIGNING_FIELDS_UNAVAILABLE");
    await this.sourceMatches(row);
    if(await this.provider.getEnvelopeStatus(row.providerEnvelopeId)!=="created")throw new DocusignError("DRAFT_REQUIRED");
    const plan=await this.checkedSpainDocument(row),recipients=await this.provider.getRecipients(row.providerEnvelopeId);
    const checked=inspectSigner({...row,documentSourceSnapshot:{...row.documentSourceSnapshot,signingPlan:plan}},recipients);
    if(!checked.verified||checked.completed)throw new DocusignError("RECIPIENT_MISMATCH");
    const signer=(recipients.signers as ProviderRecipient[])[0];
    const signatureKinds=["signHereTabs","initialHereTabs","approveTabs","declineTabs","signerAttachmentTabs","notarizeTabs"];
    const existing=signatureKinds.some(k=>Array.isArray(signer.tabs?.[k])&&signer.tabs![k].length>0);
    if(existing&&!checked.mandatory)throw new DocusignError("SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED");
    const reservation=await this.store.withSigningLock(id,async(locked,source,ledger)=>{
      this.binding(locked);pending(source);
      if(locked.status!=="draft"||locked.providerEnvelopeId!==row.providerEnvelopeId||locked.documentHash!==row.documentHash||source.docUrl!==row.documentSourceUrl||source.clientName!==row.documentSourceSnapshot.clientName||source.contractCode!==row.documentSourceSnapshot.contractCode||source.country!==row.documentSourceSnapshot.country)throw new DocusignError("CONTRACT_SOURCE_CHANGED");
      if(locked.documentSourceSnapshot.signingPlan&&!isValidSpainSigningPlan(locked.documentSourceSnapshot.signingPlan))throw new DocusignError("SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED");
      if(checked.mandatory)return {row:await ledger.patch(id,{errorCode:null,hasSignatureTabs:true,recipientVerified:true,updatedAt:this.date()}),write:false as const};
      if(locked.documentSourceSnapshot.signingSetupAttempted)throw new DocusignError("SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED");
      const reserved=await ledger.patch(id,{documentSourceSnapshot:{...locked.documentSourceSnapshot,signingPlan:plan,signingSetupAttempted:true},updatedAt:this.date()});
      return {row:reserved,plan,write:true as const};
    }); // commits the durable attempt before the external POST; no network call holds this connection
    if (!reservation.write) return reservation.row;
    const reserved=reservation.row;
    try {
      await this.sourceMatches(reserved);
      await this.provider.createRequiredTabs!(reserved.providerEnvelopeId!,"1",reservation.plan.tabs);
      const checked=inspectSigner(reserved,await this.provider.getRecipients(reserved.providerEnvelopeId!));
      if (!checked.verified || !checked.mandatory) throw new DocusignError("SPAIN_SIGNING_FIELDS_REVIEW_REQUIRED");
      return await this.store.patch(id,{errorCode:null,hasSignatureTabs:true,recipientVerified:true,updatedAt:this.date()});
    } catch(error) {
      const safe=error instanceof DocusignError ? error : new DocusignError("SPAIN_SIGNING_FIELDS_UNCERTAIN",true);
      await this.store.patch(id,{errorCode:safe.safeCode,hasSignatureTabs:false,recipientVerified:false,updatedAt:this.date()});
      throw safe;
    }
  }
  async senderView(id: string) { let row = await this.row(id); if (row.status !== "draft" || !row.providerEnvelopeId) throw new DocusignError("DRAFT_REQUIRED"); await this.sourceMatches(row); row = await this.prepareSpainFields(id); return { url: await this.provider.createSenderView(row.providerEnvelopeId!) }; }
  async refresh(id: string): Promise<SafeEnvelope> { return safeEnvelope(await this.refreshRow(id), this.now()); }
  private async refreshRow(id: string): Promise<EnvelopeRow> {
    const reservation = await this.store.withEnvelopeLock(id, async (row, ledger) => {
      this.binding(row);
      const retryCompletion=row.status==="completed"&&row.environment==="production"&&row.documentSourceSnapshot.completionProfile==="verified-production-v1"&&!row.documentSourceSnapshot.syncCompletedAt;
      if (terminal.has(row.status)&&!retryCompletion || !row.providerEnvelopeId || (row.lastCheckAttemptAt && this.now() < time(row.lastCheckAttemptAt) + POLL_INTERVAL_MS)) return { row, check: false };
      const updated = await ledger.patch(id, { lastCheckAttemptAt: this.date(), updatedAt: this.date() }); return { row: updated, check: true };
    });
    if (!reservation.check) return reservation.row;
    const row = reservation.row;
    try {
      const raw = await this.provider.getEnvelopeStatus(row.providerEnvelopeId!);
      const status: ContractDocusignStatus = raw === "created" ? "draft" : ["sent", "delivered", "completed", "declined", "voided"].includes(raw) ? raw as ContractDocusignStatus : "uncertain";
      let verified = false; let mandatory = false; let code: string | null = status === "uncertain" ? "UNSUPPORTED_PROVIDER_STATUS" : null;
      let recipients:Record<string,unknown>|undefined;
      if (!terminal.has(status) && status !== "uncertain") {
        recipients=await this.provider.getRecipients(row.providerEnvelopeId!);
        const result = inspectSigner(row, recipients); verified = result.verified; mandatory = result.mandatory;
        code = !verified ? "RECIPIENT_MISMATCH" : result.completed ? "RECIPIENT_ALREADY_COMPLETED" : !mandatory ? "MANDATORY_SIGNATURE_TABS_REQUIRED" : null;
      }
      const eligible=row.environment==="production"&&row.documentSourceSnapshot.completionProfile==="verified-production-v1";
      let metadata=row.documentSourceSnapshot;
      if(eligible&&["sent","delivered"].includes(status)&&!code&&recipients){
        await this.sourceMatches(row);
        if(!this.provider.getDocumentPdf||!this.provider.assertOnlyDocumentOne)throw new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED");
        await this.provider.assertOnlyDocumentOne(row.providerEnvelopeId!);
        const fingerprint=completionTabsFingerprint(recipients);
        if(metadata.completionTabsHash&&metadata.completionTabsHash!==fingerprint)throw new DocusignError("COMPLETION_FIELDS_CHANGED");
        if(!metadata.completionDocumentProof){
          const tabs=(recipients.signers as ProviderRecipient[])[0].tabs!;
          const proof=await captureCompletionDocumentProof(await this.provider.getDocumentPdf(row.providerEnvelopeId!),{signHereTabs:tabs.signHereTabs as any[],initialHereTabs:(tabs.initialHereTabs??[]) as any[]});
          // A signature may finish while the PDF is downloaded. Never adopt a completed document as the pre-sign baseline.
          const stillActive=await this.provider.getEnvelopeStatus(row.providerEnvelopeId!);
          const freshRecipients=await this.provider.getRecipients(row.providerEnvelopeId!),freshSigner=inspectSigner(row,freshRecipients);
          if(!["sent","delivered"].includes(stillActive)||!freshSigner.verified||!freshSigner.mandatory||freshSigner.completed||completionTabsFingerprint(freshRecipients)!==fingerprint)throw new DocusignError("COMPLETION_BASELINE_UNVERIFIED");
          metadata={...metadata,completionDocumentProof:proof,completionTabsHash:fingerprint};
        }
      }
      if(eligible&&status==="completed"){
        await this.sourceMatches(row);
        recipients=await this.provider.getRecipients(row.providerEnvelopeId!);
        const result=inspectSigner(row,recipients);
        if(!result.verified||!result.mandatory||!result.completed)throw new DocusignError("COMPLETION_RECIPIENT_UNVERIFIED");
        if(!metadata.completionDocumentProof||!metadata.completionTabsHash||metadata.completionTabsHash!==completionTabsFingerprint(recipients)||!this.provider.getDocumentPdf||!this.provider.assertSignedDocumentOne)throw new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED");
        await this.provider.assertSignedDocumentOne(row.providerEnvelopeId!);
        if(!await verifyCompletionDocumentProof(await this.provider.getDocumentPdf(row.providerEnvelopeId!),metadata.completionDocumentProof))throw new DocusignError("COMPLETION_DOCUMENT_CHANGED");
        metadata={...metadata,completionVerifiedAt:this.now(),completionSignedAt:(this.provider.getCompletionDate?.(row.providerEnvelopeId!)??this.date()).toISOString()};
        verified=true;mandatory=true;code=null;
      }
      if(!this.store.withSigningLock&&eligible)throw new DocusignError("COMPLETION_REVIEW_REQUIRED");
      let updated=eligible?await this.store.withSigningLock!(id,async(locked,source,ledger)=>{
        this.binding(locked);assertPinnedSource(locked,source);
        if(locked.providerEnvelopeId!==row.providerEnvelopeId||locked.documentHash!==row.documentHash||locked.documentSourceSnapshot.completionProfile!=="verified-production-v1")throw new DocusignError("CONTRACT_SOURCE_CHANGED");
        const snapshot={...locked.documentSourceSnapshot,...(metadata.completionDocumentProof?{completionDocumentProof:metadata.completionDocumentProof,completionTabsHash:metadata.completionTabsHash}:{}),...(status==="completed"?{completionVerifiedAt:metadata.completionVerifiedAt,completionSignedAt:metadata.completionSignedAt}: {})};
        return ledger.patch(id,{status,recipientVerified:verified,hasSignatureTabs:mandatory,errorCode:code,documentSourceSnapshot:snapshot,lastCheckedAt:this.date(),updatedAt:this.date()});
      }):await this.store.patch(id,{status,recipientVerified:verified,hasSignatureTabs:mandatory,errorCode:code,lastCheckedAt:this.date(),updatedAt:this.date()});
      if(eligible&&status==="completed"){
        const final=await this.finalizeCompletion(id);
        if(!["signed","already_signed"].includes(final.status))throw new DocusignError("COMPLETION_REVIEW_REQUIRED");
        updated=await this.row(id);
      }
      return updated;
    } catch (error) { return this.store.patch(id, { recipientVerified: false, hasSignatureTabs: false, errorCode: error instanceof DocusignError ? error.safeCode : "PROVIDER_CHECK_FAILED", updatedAt: this.date() }); }
  }
  private token(row: EnvelopeRow) { return createHmac("sha256", this.config.linkSecret).update(JSON.stringify(["elevay-sign-v1", row.id, row.linkNonce, time(row.linkExpiresAt), row.documentHash, row.recipientDigest])).digest("hex"); }
  async signingLink(id:string){return this.issueSigningLink(id);}
  async regenerateSigningLink(id:string,requestId:string){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw new DocusignError("INVALID_LINK_REQUEST");
    return this.issueSigningLink(id,requestId.toLowerCase());
  }
  private async issueSigningLink(id:string,renewalRequestId?:string){
    let row=await this.row(id);await this.sourceMatches(row);row=await this.refreshRow(id);
    if(!readyToShare(row,this.now()))throw new DocusignError(row.errorCode??"SENT_VERIFIED_ENVELOPE_REQUIRED");
    if(!renewalRequestId&&(row.revokedAt||row.linkExpiresAt&&time(row.linkExpiresAt)<=this.now()))throw new DocusignError(row.revokedAt?"LINK_REVOKED":"LINK_EXPIRED");
    await this.checkSpainRecipient(row);
    if(!this.store.withSigningLock)throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
    row=await this.store.withSigningLock(id,async(locked,source,ledger)=>{
      this.binding(locked);assertPinnedSource(locked,source);
      if(!readyToShare(locked,this.now())||locked.providerEnvelopeId!==row.providerEnvelopeId||locked.documentHash!==row.documentHash)throw new DocusignError("SENT_VERIFIED_ENVELOPE_REQUIRED");
      if(renewalRequestId){
        const raw=locked.documentSourceSnapshot.linkRenewalRequestIds;
        const ids=raw??(locked.documentSourceSnapshot.lastLinkRenewalRequestId?[locked.documentSourceSnapshot.lastLinkRenewalRequestId]:[]);
        if(!Array.isArray(ids)||ids.length>1024||ids.some(s=>typeof s!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)))throw new DocusignError("LINK_RENEWAL_HISTORY_REQUIRED");
        const consumed=ids.map(s=>s.toLowerCase());
        if(new Set(consumed).size!==consumed.length)throw new DocusignError("LINK_RENEWAL_HISTORY_REQUIRED");
        if(locked.documentSourceSnapshot.lastLinkRenewalRequestId?.toLowerCase()===renewalRequestId){if(!shareable(locked,this.now())||!locked.linkExpiresAt)throw new DocusignError("LINK_RENEWAL_REPLAY_EXPIRED");return locked;}
        if(consumed.includes(renewalRequestId))throw new DocusignError("LINK_RENEWAL_REPLAY_EXPIRED");
        if(consumed.length>=1024)throw new DocusignError("LINK_RENEWAL_HISTORY_REQUIRED");
        return ledger.patch(id,{linkNonce:randomBytes(32).toString("hex"),linkExpiresAt:new Date(this.date().getTime()+SIGNING_LINK_LIFETIME_MS),revokedAt:null,documentSourceSnapshot:{...locked.documentSourceSnapshot,lastLinkRenewalRequestId:renewalRequestId,linkRenewalRequestIds:[...consumed,renewalRequestId]},updatedAt:this.date()});
      }
      if(!shareable(locked,this.now()))throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
      return locked.linkExpiresAt?locked:ledger.patch(id,{linkExpiresAt:new Date(this.date().getTime()+SIGNING_LINK_LIFETIME_MS),updatedAt:this.date()});
    });
    return{url:`${this.config.publicBaseUrl}/sign-contract/${id}#${this.token(row)}`,expiresAt:row.linkExpiresAt!};
  }
  async revokeLink(id: string) { await this.row(id); await this.store.withEnvelopeLock(id, async (_row, ledger) => ledger.patch(id, { revokedAt: this.date(), updatedAt: this.date() })); return { success: true as const }; }
  async startSigning(id: string, token: string) {
    let row = await this.row(id);
    if (!/^[0-9a-f]{64}$/i.test(token) || !row.linkExpiresAt || row.revokedAt || time(row.linkExpiresAt) <= this.now() || !timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(this.token(row), "hex")) || terminal.has(row.status)) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
    await this.sourceMatches(row); row = await this.refreshRow(id);
    if (!shareable(row, this.now()) || !row.providerEnvelopeId) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
    await this.checkSpainRecipient(row,true);
    if(!this.store.withSigningLock)throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
    const validate=(locked:EnvelopeRow,source:ContractSource)=>{
      this.binding(locked);
      if (!shareable(locked, this.now()) || !locked.linkExpiresAt || !timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(this.token(locked), "hex"))) throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
      assertPinnedSource(locked,source);
      if(locked.providerEnvelopeId!==row.providerEnvelopeId||locked.documentHash!==row.documentHash||source.docUrl!==locked.documentSourceUrl||source.contractCode!==locked.documentSourceSnapshot.contractCode||source.clientName!==locked.documentSourceSnapshot.clientName)throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
      if(locked.documentSourceSnapshot.country&&source.country!==locked.documentSourceSnapshot.country)throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
      if(locked.documentSourceSnapshot.signingProfile===SPAIN_SIGNING_PROFILE&&(!isValidSpainSigningPlan(locked.documentSourceSnapshot.signingPlan)||locked.documentSourceSnapshot.signingPlan.layoutHash!==row.documentSourceSnapshot.signingPlan?.layoutHash))throw new DocusignError("SIGNING_LINK_UNAVAILABLE");
    };
    await this.store.withSigningLock(id,async(locked,source)=>validate(locked,source));
    const url=await this.provider.createRecipientView(row.providerEnvelopeId!,this.recipient(row));
    // A concurrent local revoke/source/status change discards the fresh private URL, never returns it.
    await this.store.withSigningLock(id,async(locked,source)=>validate(locked,source));
    return {url};
  }
}
let singleton: { binding: string; service: ContractDocusignService } | undefined;
export function getContractDocusignService() {
  const config = getDocusignConfig();
  // Include key material fingerprint without retaining an extra plaintext copy or exposing it.
  const binding = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  if (!singleton || singleton.binding !== binding) singleton = { binding, service: new ContractDocusignService(docusignStore, new JwtDocusignProvider(config), config) };
  return singleton.service;
}

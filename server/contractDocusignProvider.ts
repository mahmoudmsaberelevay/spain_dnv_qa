import { createPrivateKey, sign } from "node:crypto";
import { DocusignError, UUID, validateApiRoot, validateRecipientViewUrl, validateSenderViewUrl, type DocusignConfig } from "./contractDocusignConfig";
export type DraftInput = { id: string; document: Buffer; documentName: string; recipientName: string; recipientEmail: string; recipientId: string; clientUserId: string };
export type ProviderTab = { documentId: string; recipientId: string; pageNumber: string; xPosition: string; yPosition: string; tabLabel: string; optional: string; scaleValue?: string; templateLocked?: string; templateRequired?: string };
export type ProviderTabs = { signHereTabs: ProviderTab[]; initialHereTabs: ProviderTab[] };
export type ProviderRecipient = { name?: string; email?: string; clientUserId?: string; recipientId?: string; status?: string; tabs?: Record<string, unknown[]> };
export type ProviderSnapshot = { status: string; recipients: Record<string, unknown> };
export interface DocusignProvider {
  createDraft(input: DraftInput): Promise<string>;
  createSenderView(envelopeId: string): Promise<string>;
  getEnvelopeStatus(envelopeId: string): Promise<string>;
  getRecipients(envelopeId: string): Promise<Record<string, unknown>>;
  createRecipientView(envelopeId: string, recipient: DraftInput): Promise<string>;
  assertOnlyDocumentOne?(envelopeId: string): Promise<void>;
  getDocumentPdf?(envelopeId: string): Promise<Buffer>;
  createRequiredTabs?(envelopeId: string, recipientId: string, tabs: ProviderTabs): Promise<void>;
  assertSignedDocumentOne?(envelopeId:string):Promise<void>;
  getCompletionDate?(envelopeId:string):Date|null;
}
const SAFE_CODES = new Set(["consent_required", "invalid_grant", "USER_AUTHENTICATION_FAILED", "AUTHORIZATION_INVALID_TOKEN", "ENVELOPE_DOES_NOT_EXIST", "ENVELOPE_NOT_IN_DRAFT_STATUS", "ENVELOPE_HAS_BEEN_COMPLETED", "ENVELOPE_IS_VOIDED", "UNKNOWN_ENVELOPE_RECIPIENT", "HOURLY_APIINVOCATION_LIMIT_EXCEEDED", "BURST_APIINVOCATION_LIMIT_EXCEEDED", "DUPLICATE_TRANSACTION_ID", "ACCOUNT_NOT_AUTHORIZED_FOR_ENVELOPE"]);
const TAB_KEYS = ["documentId", "recipientId", "pageNumber", "xPosition", "yPosition", "tabLabel", "optional", "scaleValue", "templateLocked", "templateRequired"];
/** Validate and copy before any await: callers cannot change an approved plan in flight. */
function requiredTabs(input: ProviderTabs): ProviderTabs {
  try {
    const exactObject = (value: unknown, keys: string[]): value is Record<string, unknown> => {
      if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
      const own = Reflect.ownKeys(value);
      return own.length === keys.length && own.every(key => typeof key === "string" && keys.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"));
    };
    if (!exactObject(input, ["signHereTabs", "initialHereTabs"])) throw 0;
    const labels = new Set<string>();
    const integer = (value: unknown, min: number, max: number) => typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) && Number(value) >= min && Number(value) <= max;
    const copy = (tabs: unknown, min: number, max: number, scale: string): ProviderTab[] => {
      if (!Array.isArray(tabs) || tabs.length < min || tabs.length > max || Reflect.ownKeys(tabs).length !== tabs.length + 1) throw 0;
      return Array.from(tabs, tab => {
        if (!exactObject(tab, TAB_KEYS) || tab.documentId !== "1" || tab.recipientId !== "1" || !integer(tab.pageNumber, 1, 100) || !integer(tab.xPosition, 0, 2000) || !integer(tab.yPosition, 0, 2000) || typeof tab.tabLabel !== "string" || !/^ELEVAY_ES_[A-Z0-9_]+$/.test(tab.tabLabel) || labels.has(tab.tabLabel) || tab.optional !== "false" || tab.scaleValue !== scale || tab.templateLocked !== "true" || tab.templateRequired !== "true") throw 0;
        labels.add(tab.tabLabel);
        return Object.fromEntries(TAB_KEYS.map(key => [key, tab[key]])) as ProviderTab;
      });
    };
    return { signHereTabs: copy(input.signHereTabs, 4, 4, "0.5"), initialHereTabs: copy(input.initialHereTabs, 9, 100, "0.5") };
  } catch { throw new DocusignError("INVALID_PROVIDER_TABS"); }
}
/** Instance retained in memory; neither assertions nor tokens are persisted/logged. */
export class JwtDocusignProvider implements DocusignProvider {
  private token?: { value: string; expiresAt: number };
  private apiRoot?: string;
  private authInFlight?: Promise<void>;
  private lastCompletion?:{id:string;date:Date|null};
  constructor(private readonly config: DocusignConfig, private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {}
  private async request(url: string, method: "GET" | "POST", body?: unknown, authorization?: string, write = false, pdf = false): Promise<any> {
    const controller = new AbortController();
    const invalidCode = pdf ? "PROVIDER_DOCUMENT_FETCH_FAILED" : "INVALID_PROVIDER_RESPONSE";
    const networkCode = pdf ? "PROVIDER_DOCUMENT_FETCH_FAILED" : "PROVIDER_TIMEOUT_OR_NETWORK";
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A signal alone cannot bound a stalled/custom body reader. Race the whole operation.
    const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new DocusignError(networkCode, write)); }, 15000); });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await this.fetcher(url, { method, redirect: "error", signal: controller.signal, headers: { ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), ...(pdf ? { Accept: "application/pdf" } : { "Content-Type": body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json" }) }, ...(body !== undefined ? { body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) } : {}) });
        controller.signal.throwIfAborted();
        const httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : undefined;
        // Never decode a PDF endpoint's HTTP error body as JSON or provider text.
        if (pdf && !response.ok) throw new DocusignError(invalidCode, false, httpStatus);
        const limit = (pdf ? 10 : 2) * 1024 * 1024;
        const length = response.headers.get("content-length");
        if (length !== null && (!/^[0-9]+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limit)) throw new DocusignError(invalidCode, write, httpStatus);
        reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let total = 0;
        if (!reader) throw new DocusignError(invalidCode, write, httpStatus);
        while (true) { const { value, done } = await reader.read(); controller.signal.throwIfAborted(); if (done) break; total += value.byteLength; if (total > limit) throw new DocusignError(invalidCode, write, httpStatus); chunks.push(value); }
        const bytes = Buffer.concat(chunks, total);
        if (pdf) { if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new DocusignError(invalidCode, false, httpStatus); return bytes; }
        let data: any; try { data = JSON.parse(bytes.toString("utf8")); } catch { throw new DocusignError(invalidCode, write, httpStatus); }
        if (!response.ok) {
          const code = data?.errorCode ?? data?.error;
          throw new DocusignError(typeof code === "string" && SAFE_CODES.has(code) ? code : "PROVIDER_HTTP_ERROR", write && response.status >= 500, httpStatus);
        }
        return data;
      })()]);
    } catch (error) {
      if (error instanceof DocusignError) throw error;
      throw new DocusignError(networkCode, write);
    } finally {
      clearTimeout(timer);
      controller.abort();
      // Cleanup must not itself block a deadline or expose a stream/provider error.
      try { if (reader) void reader.cancel().catch(() => undefined); } catch { /* Sanitized outcome is already determined. */ }
    }
  }
  private async authenticate() {
    if (this.token && this.token.expiresAt > this.now() + 15 * 60 * 1000 && this.apiRoot) return;
    if (this.authInFlight) return this.authInFlight;
    this.authInFlight = (async () => {
      const host = this.config.environment === "demo" ? "account-d.docusign.com" : "account.docusign.com";
      const iat = Math.floor(this.now() / 1000);
      let assertion: string;
      try { const data = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: this.config.integrationKey, sub: this.config.userId, aud: host, iat, exp: iat + 3600, scope: "signature impersonation" })).toString("base64url")}`; assertion = `${data}.${sign("RSA-SHA256", Buffer.from(data), createPrivateKey(this.config.privateKey)).toString("base64url")}`; } catch { throw new DocusignError("SETTINGS_REQUIRED"); }
      const result = await this.request(`https://${host}/oauth/token`, "POST", new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }));
      if (typeof result?.access_token !== "string" || !result.access_token || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 0) throw new DocusignError("INVALID_PROVIDER_RESPONSE");
      if (!this.apiRoot) {
        const info = await this.request(`https://${host}/oauth/userinfo`, "GET", undefined, result.access_token);
        const matching = Array.isArray(info?.accounts) ? info.accounts.filter((a: any) => typeof a?.account_id === "string" && a.account_id.toLowerCase() === this.config.accountId) : [];
        if (matching.length !== 1 || (info?.sub && String(info.sub).toLowerCase() !== this.config.userId)) throw new DocusignError("ACCOUNT_BINDING_MISMATCH");
        this.apiRoot = validateApiRoot(matching[0].base_uri, this.config.environment);
      }
      this.token = { value: result.access_token, expiresAt: this.now() + Math.min(Number(result.expires_in), 3600) * 1000 };
    })();
    try { await this.authInFlight; } finally { this.authInFlight = undefined; }
  }
  private async api(path: string, method: "GET" | "POST", body?: unknown, write = false) {
    await this.authenticate();
    return this.request(`${this.apiRoot}/restapi/v2.1/accounts/${this.config.accountId}${path}`, method, body, this.token!.value, write);
  }
  private path(id: string) { if (typeof id !== "string" || !UUID.test(id)) throw new DocusignError("INVALID_PROVIDER_RESPONSE"); return `/envelopes/${id}`; }
  /** Read-only guard for unsigned draft/sent envelopes; callers choose when to assert. */
  async assertOnlyDocumentOne(envelopeId: string): Promise<void> {
    const result = await this.api(`${this.path(envelopeId)}/documents`, "GET");
    const documents = result?.envelopeDocuments;
    const document = Array.isArray(documents) && documents.length === 1 ? documents[0] : undefined;
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        !document || typeof document !== "object" || Array.isArray(document) ||
        document.documentId !== "1" || (Object.hasOwn(document, "type") && document.type !== "content")) {
      throw new DocusignError("SPAIN_SIGNING_DOCUMENTS_MISMATCH");
    }
  }
  async getDocumentPdf(id: string): Promise<Buffer> {
    const path = `${this.path(id)}/documents/1`;
    await this.authenticate();
    return this.request(`${this.apiRoot}/restapi/v2.1/accounts/${this.config.accountId}${path}`, "GET", undefined, this.token!.value, false, true);
  }
  async createRequiredTabs(id: string, recipientId: string, tabs: ProviderTabs): Promise<void> {
    const path = this.path(id);
    if (recipientId !== "1") throw new DocusignError("INVALID_PROVIDER_TABS");
    const body = requiredTabs(tabs);
    if (await this.getEnvelopeStatus(id) !== "created") throw new DocusignError("ENVELOPE_NOT_IN_DRAFT_STATUS");
    const result = await this.api(`${path}/recipients/1/tabs`, "POST", body, true);
    if (!result || !Array.isArray(result.signHereTabs) || !Array.isArray(result.initialHereTabs)) throw new DocusignError("INVALID_PROVIDER_RESPONSE", true);
  }
  async createDraft(input: DraftInput) {
    const result = await this.api("/envelopes", "POST", { status: "created", transactionId: input.id, emailSubject: "ELEVAY contract — signature requested", documents: [{ documentBase64: input.document.toString("base64"), name: input.documentName, fileExtension: "docx", documentId: "1", transformPdfFields: "false" }], recipients: { signers: [{ name: input.recipientName, email: input.recipientEmail, recipientId: input.recipientId, routingOrder: "1", clientUserId: input.clientUserId }] } }, true);
    if (!UUID.test(result.envelopeId ?? "") || result.status !== "created") throw new DocusignError("INVALID_PROVIDER_RESPONSE", true);
    return String(result.envelopeId).toLowerCase();
  }
  async createSenderView(id: string) {
    const result = await this.api(`${this.path(id)}/views/sender`, "POST", { returnUrl: `${this.config.publicBaseUrl}/sign-contract/return`, viewAccess: "envelope", settings: { startingScreen: "Tagger", showBackButton: "false", showDiscardAction: "false", showAdvancedOptions: "false", showSignNow: "false", documentSettings: { showEditDocuments: "false", showEditPages: "false", showEditDocumentVisibility: "false" }, recipientSettings: { showEditRecipients: "false", showContactsList: "false", showBulkSend: "false", showEditMessage: "false" } } });
    return validateSenderViewUrl(result.url, this.config.environment);
  }
  async getEnvelopeStatus(id:string){
    const result=await this.api(this.path(id),"GET");
    if(typeof result?.status!=="string"||(result.envelopeId!==undefined&&result.envelopeId!==id))throw new DocusignError("INVALID_PROVIDER_RESPONSE");
    const t=typeof result.completedDateTime==="string"?Date.parse(result.completedDateTime):NaN;
    this.lastCompletion={id,date:result.status==="completed"&&Number.isFinite(t)&&t>0&&t<=this.now()+60000?new Date(t):null};
    return result.status;
  }
  getCompletionDate(id:string){return this.lastCompletion?.id===id?this.lastCompletion.date:null;}
  async assertSignedDocumentOne(id:string):Promise<void>{
    const result=await this.api(`${this.path(id)}/documents`,"GET"),docs=result?.envelopeDocuments;
    if(!Array.isArray(docs)||docs.length<1||docs.length>2)throw new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED");
    const content=docs.filter(d=>d&&d.documentId==="1"&&(d.type===undefined||d.type==="content"));
    if(content.length!==1||docs.some(d=>d!==content[0]&&!(d?.documentId==="certificate"&&d.type==="summary")))throw new DocusignError("COMPLETION_DOCUMENT_UNVERIFIED");
  }
  async getRecipients(id: string) { const result = await this.api(`${this.path(id)}/recipients?include_tabs=true`, "GET"); if (!result || typeof result !== "object" || !Array.isArray(result.signers)) throw new DocusignError("INVALID_PROVIDER_RESPONSE"); return result as Record<string, unknown>; }
  async createRecipientView(id: string, recipient: DraftInput) {
    const result = await this.api(`${this.path(id)}/views/recipient`, "POST", { authenticationMethod: "none", returnUrl: `${this.config.publicBaseUrl}/sign-contract/return`, userName: recipient.recipientName, email: recipient.recipientEmail, clientUserId: recipient.clientUserId, recipientId: recipient.recipientId });
    return validateRecipientViewUrl(result.url, this.config.environment);
  }
}

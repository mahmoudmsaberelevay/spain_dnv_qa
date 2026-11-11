import { createPrivateKey, sign } from "node:crypto";
import { DocusignError, UUID, validateApiRoot, validateViewUrl, type DocusignConfig } from "./contractDocusignConfig";
export type DraftInput = { id: string; document: Buffer; documentName: string; recipientName: string; recipientEmail: string; recipientId: string; clientUserId: string };
export type ProviderRecipient = { name?: string; email?: string; clientUserId?: string; recipientId?: string; status?: string; tabs?: Record<string, unknown[]> };
export type ProviderSnapshot = { status: string; recipients: Record<string, unknown> };
export interface DocusignProvider {
  createDraft(input: DraftInput): Promise<string>;
  createSenderView(envelopeId: string): Promise<string>;
  getEnvelopeStatus(envelopeId: string): Promise<string>;
  getRecipients(envelopeId: string): Promise<Record<string, unknown>>;
  createRecipientView(envelopeId: string, recipient: DraftInput): Promise<string>;
}
const SAFE_CODES = new Set(["consent_required", "invalid_grant", "USER_AUTHENTICATION_FAILED", "AUTHORIZATION_INVALID_TOKEN", "ENVELOPE_DOES_NOT_EXIST", "ENVELOPE_NOT_IN_DRAFT_STATUS", "ENVELOPE_HAS_BEEN_COMPLETED", "ENVELOPE_IS_VOIDED", "UNKNOWN_ENVELOPE_RECIPIENT", "HOURLY_APIINVOCATION_LIMIT_EXCEEDED", "BURST_APIINVOCATION_LIMIT_EXCEEDED", "DUPLICATE_TRANSACTION_ID", "ACCOUNT_NOT_AUTHORIZED_FOR_ENVELOPE"]);
/** Instance retained in memory; neither assertions nor tokens are persisted/logged. */
export class JwtDocusignProvider implements DocusignProvider {
  private token?: { value: string; expiresAt: number };
  private apiRoot?: string;
  private authInFlight?: Promise<void>;
  constructor(private readonly config: DocusignConfig, private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {}
  private async request(url: string, method: "GET" | "POST", body?: unknown, authorization?: string, write = false): Promise<any> {
    let response: Response;
    try {
      response = await this.fetcher(url, { method, redirect: "error", signal: AbortSignal.timeout(15000), headers: { ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), "Content-Type": body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json" }, ...(body !== undefined ? { body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) } : {}) });
      // Bodies are bounded and deadline covers body consumption, not only headers.
      const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let total = 0;
      if (!reader) throw new DocusignError("INVALID_PROVIDER_RESPONSE", write);
      while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > 2 * 1024 * 1024) { await reader.cancel(); throw new DocusignError("INVALID_PROVIDER_RESPONSE", write); } chunks.push(value); }
      let data: any; try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new DocusignError("INVALID_PROVIDER_RESPONSE", write); }
      if (!response.ok) {
        const code = data?.errorCode ?? data?.error;
        throw new DocusignError(SAFE_CODES.has(code) ? code : "PROVIDER_HTTP_ERROR", write && response.status >= 500, response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof DocusignError) throw error;
      throw new DocusignError("PROVIDER_TIMEOUT_OR_NETWORK", write);
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
      if (typeof result.access_token !== "string" || !result.access_token || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 0) throw new DocusignError("INVALID_PROVIDER_RESPONSE");
      if (!this.apiRoot) {
        const info = await this.request(`https://${host}/oauth/userinfo`, "GET", undefined, result.access_token);
        const matching = Array.isArray(info.accounts) ? info.accounts.filter((a: any) => typeof a.account_id === "string" && a.account_id.toLowerCase() === this.config.accountId) : [];
        if (matching.length !== 1 || (info.sub && String(info.sub).toLowerCase() !== this.config.userId)) throw new DocusignError("ACCOUNT_BINDING_MISMATCH");
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
  private path(id: string) { if (!UUID.test(id)) throw new DocusignError("INVALID_PROVIDER_RESPONSE"); return `/envelopes/${id}`; }
  async createDraft(input: DraftInput) {
    const result = await this.api("/envelopes", "POST", { status: "created", transactionId: input.id, emailSubject: "ELEVAY contract — signature requested", documents: [{ documentBase64: input.document.toString("base64"), name: input.documentName, fileExtension: "docx", documentId: "1", transformPdfFields: "false" }], recipients: { signers: [{ name: input.recipientName, email: input.recipientEmail, recipientId: input.recipientId, routingOrder: "1", clientUserId: input.clientUserId }] } }, true);
    if (!UUID.test(result.envelopeId ?? "") || result.status !== "created") throw new DocusignError("INVALID_PROVIDER_RESPONSE", true);
    return String(result.envelopeId).toLowerCase();
  }
  async createSenderView(id: string) {
    const result = await this.api(`${this.path(id)}/views/sender`, "POST", { returnUrl: `${this.config.publicBaseUrl}/sign-contract/return`, viewAccess: "envelope", settings: { startingScreen: "Tagger", showBackButton: "false", showDiscardAction: "false", showAdvancedOptions: "false", showSignNow: "false", documentSettings: { showEditDocuments: "false", showEditPages: "false", showEditDocumentVisibility: "false" }, recipientSettings: { showEditRecipients: "false", showContactsList: "false", showBulkSend: "false", showEditMessage: "false" } } });
    return validateViewUrl(result.url, this.config.environment);
  }
  async getEnvelopeStatus(id: string) { const result = await this.api(this.path(id), "GET"); if (typeof result.status !== "string") throw new DocusignError("INVALID_PROVIDER_RESPONSE"); return result.status; }
  async getRecipients(id: string) { const result = await this.api(`${this.path(id)}/recipients?include_tabs=true`, "GET"); if (!result || typeof result !== "object" || !Array.isArray(result.signers)) throw new DocusignError("INVALID_PROVIDER_RESPONSE"); return result as Record<string, unknown>; }
  async createRecipientView(id: string, recipient: DraftInput) {
    const result = await this.api(`${this.path(id)}/views/recipient`, "POST", { authenticationMethod: "none", returnUrl: `${this.config.publicBaseUrl}/sign-contract/return`, userName: recipient.recipientName, email: recipient.recipientEmail, clientUserId: recipient.clientUserId, recipientId: recipient.recipientId });
    return validateViewUrl(result.url, this.config.environment);
  }
}

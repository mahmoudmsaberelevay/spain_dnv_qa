import { createPrivateKey } from "node:crypto";
import type { DocusignEnvironment } from "../shared/contractDocusign";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type DocusignConfig = { environment: DocusignEnvironment; integrationKey: string; userId: string; accountId: string; privateKey: string; linkSecret: string; publicBaseUrl: string };
export class DocusignError extends Error {
  constructor(public readonly safeCode: string, public readonly uncertain = false, public readonly httpStatus?: number) { super(safeCode); this.name = "DocusignError"; }
}

const MAX_PRIVATE_PEM_BYTES = 16 * 1024;
const MAX_PRIVATE_BASE64_LENGTH = 4 * Math.ceil(MAX_PRIVATE_PEM_BYTES / 3);
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PRIVATE_PEM = /^[\t \r\n]*-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END \1-----[\t \r\n]*$/;

function usesBase64PrivateKey(env: NodeJS.ProcessEnv): boolean {
  return env.DOCUSIGN_PRIVATE_KEY_BASE64 !== undefined && env.DOCUSIGN_PRIVATE_KEY_BASE64 !== "";
}

function privateKeySetting(env: NodeJS.ProcessEnv): string {
  return usesBase64PrivateKey(env) || !env.DOCUSIGN_RSA_PRIVATE_KEY
    ? "DOCUSIGN_PRIVATE_KEY_BASE64"
    : "DOCUSIGN_RSA_PRIVATE_KEY";
}

/** Server-only: never log, serialize, persist or expose the returned PEM. */
function readPrivateKey(env: NodeJS.ProcessEnv): string {
  try {
    let pem: string;
    if (usesBase64PrivateKey(env)) {
      const raw = env.DOCUSIGN_PRIVATE_KEY_BASE64!;
      if (raw.length > MAX_PRIVATE_BASE64_LENGTH + 16) throw 0;
      const encoded = raw.trim();
      // Node's native Base64 decoder is permissive; reject malformed/noncanonical
      // input before decoding rather than silently ignoring characters or line breaks.
      if (!encoded || encoded.length > MAX_PRIVATE_BASE64_LENGTH || !CANONICAL_BASE64.test(encoded)) throw 0;
      const decoded = Buffer.from(encoded, "base64");
      if (!decoded.length || decoded.length > MAX_PRIVATE_PEM_BYTES || decoded.toString("base64") !== encoded) throw 0;
      pem = decoded.toString("utf8");
      if (!Buffer.from(pem, "utf8").equals(decoded)) throw 0;
    } else {
      pem = env.DOCUSIGN_RSA_PRIVATE_KEY ?? "";
    }
    if (!pem || Buffer.byteLength(pem, "utf8") > MAX_PRIVATE_PEM_BYTES || !PRIVATE_PEM.test(pem)) throw 0;
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw 0;
    return pem; // Preserve the original decoded text; do not change the environment.
  } catch {
    // Do not attach OpenSSL errors, values, key fragments, or a raw error cause.
    throw new DocusignError("PRIVATE_KEY_INVALID");
  }
}

/** Runtime-only. Never call operationally from tooling or print returned settings. */
export function configReadiness(env: NodeJS.ProcessEnv = process.env) {
  const missingSettings: string[] = [];
  const environment: DocusignEnvironment = env.DOCUSIGN_ENVIRONMENT === "production" ? "production" : "demo";
  if (env.DOCUSIGN_ENVIRONMENT && !["demo", "production"].includes(env.DOCUSIGN_ENVIRONMENT)) missingSettings.push("DOCUSIGN_ENVIRONMENT");
  for (const key of ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_ACCOUNT_ID"] as const) if (!UUID.test(env[key] ?? "")) missingSettings.push(key);
  try { readPrivateKey(env); } catch { missingSettings.push(privateKeySetting(env)); }
  if ((env.DOCUSIGN_LINK_SECRET ?? "").length < 32) missingSettings.push("DOCUSIGN_LINK_SECRET");
  if (env.DOCUSIGN_PUBLIC_BASE_URL && !["https://elevay.vip", "https://www.elevay.vip"].includes(env.DOCUSIGN_PUBLIC_BASE_URL.replace(/\/$/, ""))) missingSettings.push("DOCUSIGN_PUBLIC_BASE_URL");
  return { configured: missingSettings.length === 0, environment, missingSettings };
}
export function getDocusignConfig(env: NodeJS.ProcessEnv = process.env): DocusignConfig {
  const ready = configReadiness(env);
  if (!ready.configured) throw new DocusignError("SETTINGS_REQUIRED");
  return { environment: ready.environment, integrationKey: env.DOCUSIGN_INTEGRATION_KEY!.toLowerCase(), userId: env.DOCUSIGN_USER_ID!.toLowerCase(), accountId: env.DOCUSIGN_ACCOUNT_ID!.toLowerCase(), privateKey: readPrivateKey(env), linkSecret: env.DOCUSIGN_LINK_SECRET!, publicBaseUrl: (env.DOCUSIGN_PUBLIC_BASE_URL || "https://elevay.vip").replace(/\/$/, "") };
}
export function validateApiRoot(raw: string, environment: DocusignEnvironment): string {
  let url: URL; try { url = new URL(raw); } catch { throw new DocusignError("INVALID_API_ORIGIN"); }
  const permitted = environment === "demo" ? url.hostname === "demo.docusign.net" : /^(?:www|na[1-4]?|eu[1-3]?|ca|au|jp)\.docusign\.net$/.test(url.hostname);
  if (!permitted || url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new DocusignError("INVALID_API_ORIGIN");
  return url.origin;
}
export function validateViewUrl(raw: unknown, environment: DocusignEnvironment): string {
  if (typeof raw !== "string") throw new DocusignError("INVALID_PROVIDER_RESPONSE");
  let url: URL; try { url = new URL(raw); } catch { throw new DocusignError("INVALID_PROVIDER_RESPONSE"); }
  validateApiRoot(url.origin, environment);
  if (url.username || url.password || url.port || !/^\/(?:Signing|signing|Member|member)\//.test(url.pathname)) throw new DocusignError("INVALID_PROVIDER_RESPONSE");
  return url.href;
}

/** Sender views can begin at DocuSign's managed-token redemption endpoint.
 * This exception is not an API root or a client signing destination. Keep the
 * environment, exact origin and exact public path bound; never inspect/log tokens.
 */
export function validateSenderViewUrl(raw: unknown, environment: DocusignEnvironment): string {
  if (typeof raw !== "string") throw new DocusignError("INVALID_PROVIDER_RESPONSE");
  let url: URL; try { url = new URL(raw); } catch { throw new DocusignError("INVALID_PROVIDER_RESPONSE"); }
  const accountHost = environment === "demo" ? "account-d.docusign.com" : "account.docusign.com";
  if (url.hostname === accountHost) {
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
        url.pathname !== "/managed_token/v1/redeem" || !url.search ||
        raw !== raw.trim() || /[\x00-\x1f\x7f]/.test(raw)) {
      throw new DocusignError("INVALID_PROVIDER_RESPONSE");
    }
    return raw; // Preserve DocuSign's opaque, short-lived handoff exactly as issued.
  }
  return validateViewUrl(raw, environment);
}

/** Modern recipient views use the app's authentication entry point, not an API
 * base URI. Preserve its opaque session query; do not expose it outside handoff.
 */
export function validateRecipientViewUrl(raw: unknown, environment: DocusignEnvironment): string {
  if (typeof raw !== "string") throw new DocusignError("INVALID_PROVIDER_RESPONSE");
  let url: URL; try { url = new URL(raw); } catch { throw new DocusignError("INVALID_PROVIDER_RESPONSE"); }
  const appHost = environment === "demo" ? "apps-d.docusign.com" : "apps.docusign.com";
  if (url.hostname === appHost) {
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
        url.pathname !== "/authenticate" || !url.search || raw.length > 4000 ||
        !raw.startsWith(`https://${appHost}/authenticate?`) || /[\s\x00-\x1f\x7f#]/.test(raw)) {
      throw new DocusignError("INVALID_PROVIDER_RESPONSE");
    }
    return raw;
  }
  return validateViewUrl(raw, environment);
}

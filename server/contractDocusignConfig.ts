import { createPrivateKey } from "node:crypto";
import type { DocusignEnvironment } from "../shared/contractDocusign";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type DocusignConfig = { environment: DocusignEnvironment; integrationKey: string; userId: string; accountId: string; privateKey: string; linkSecret: string; publicBaseUrl: string };
export class DocusignError extends Error {
  constructor(public readonly safeCode: string, public readonly uncertain = false, public readonly httpStatus?: number) { super(safeCode); this.name = "DocusignError"; }
}
/** Runtime-only. Never call operationally from tooling or print returned settings. */
export function configReadiness(env: NodeJS.ProcessEnv = process.env) {
  const missingSettings: string[] = [];
  const environment: DocusignEnvironment = env.DOCUSIGN_ENVIRONMENT === "production" ? "production" : "demo";
  if (env.DOCUSIGN_ENVIRONMENT && !["demo", "production"].includes(env.DOCUSIGN_ENVIRONMENT)) missingSettings.push("DOCUSIGN_ENVIRONMENT");
  for (const key of ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_ACCOUNT_ID"] as const) if (!UUID.test(env[key] ?? "")) missingSettings.push(key);
  try { const key = createPrivateKey(env.DOCUSIGN_RSA_PRIVATE_KEY ?? ""); if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw 0; } catch { missingSettings.push("DOCUSIGN_RSA_PRIVATE_KEY"); }
  if ((env.DOCUSIGN_LINK_SECRET ?? "").length < 32) missingSettings.push("DOCUSIGN_LINK_SECRET");
  if (env.DOCUSIGN_PUBLIC_BASE_URL && !["https://elevay.vip", "https://www.elevay.vip"].includes(env.DOCUSIGN_PUBLIC_BASE_URL.replace(/\/$/, ""))) missingSettings.push("DOCUSIGN_PUBLIC_BASE_URL");
  return { configured: missingSettings.length === 0, environment, missingSettings };
}
export function getDocusignConfig(env: NodeJS.ProcessEnv = process.env): DocusignConfig {
  const ready = configReadiness(env);
  if (!ready.configured) throw new DocusignError("SETTINGS_REQUIRED");
  return { environment: ready.environment, integrationKey: env.DOCUSIGN_INTEGRATION_KEY!.toLowerCase(), userId: env.DOCUSIGN_USER_ID!.toLowerCase(), accountId: env.DOCUSIGN_ACCOUNT_ID!.toLowerCase(), privateKey: env.DOCUSIGN_RSA_PRIVATE_KEY!, linkSecret: env.DOCUSIGN_LINK_SECRET!, publicBaseUrl: (env.DOCUSIGN_PUBLIC_BASE_URL || "https://elevay.vip").replace(/\/$/, "") };
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

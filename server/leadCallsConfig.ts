import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { LeadCallPolicy } from "../drizzle/schema";

export const CALL_INTENT_TTL_MS = 90_000;
export const VOICE_TOKEN_TTL_SECONDS = 120;
export type LeadCallsConfig = ReturnType<typeof getLeadCallsConfig>;
const explicit = (value: string | undefined) => value === "true";
const sid = (value: string, prefix: string) =>
  new RegExp(`^${prefix}[0-9a-fA-F]{32}$`).test(value);
/** Called at runtime only. Never serialize this object, log it, or put it in browser code. */
export function getLeadCallsConfig(env: NodeJS.ProcessEnv = process.env) {
  const defaultCallerId = normalizeCallerId(env.TWILIO_DEFAULT_CALLER_ID ?? "");
  const approvedCallerIds = Array.from(
    new Set(
      (env.TWILIO_APPROVED_CALLER_IDS ?? "")
        .split(",")
        .map(normalizeCallerId)
        .filter((value): value is string => !!value)
    )
  );
  // The explicitly configured default is an approved ENV caller ID, not a frontend value.
  if (defaultCallerId && !approvedCallerIds.includes(defaultCallerId))
    approvedCallerIds.push(defaultCallerId);
  let webhookBaseUrl = "";
  try {
    const url = new URL(env.TWILIO_WEBHOOK_BASE_URL ?? "");
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
    )
      webhookBaseUrl = url.origin;
  } catch {
    /* Missing/invalid config is a safe readiness condition. */
  }
  const browserOrigins = Array.from(
    new Set(
      [webhookBaseUrl, ...(env.TWILIO_BROWSER_ORIGINS ?? "").split(",")].filter(
        value => {
          try {
            const parsed = new URL(value);
            return (
              parsed.protocol === "https:" &&
              parsed.origin === value &&
              !parsed.username &&
              !parsed.password
            );
          } catch {
            return false;
          }
        }
      )
    )
  );
  return {
    enabled: explicit(env.ELEVAY_CALLING_ENABLED),
    processingEnabled: explicit(env.ELEVAY_CALL_PROCESSING_ENABLED),
    accountSid: env.TWILIO_ACCOUNT_SID ?? "",
    apiKeySid: env.TWILIO_API_KEY_SID ?? "",
    apiKeySecret: env.TWILIO_API_KEY_SECRET ?? "",
    authToken: env.TWILIO_AUTH_TOKEN ?? "",
    twimlAppSid: env.TWILIO_TWIML_APP_SID ?? "",
    defaultCallerId,
    approvedCallerIds,
    webhookBaseUrl,
    browserOrigins,
    retentionDays: 90,
  };
}
export function normalizeCallerId(value: string): string | null {
  if (!value.startsWith("+")) return null;
  const phone = parsePhoneNumberFromString(value);
  return phone?.isValid() ? phone.number : null;
}
/** Scope is intentionally Egypt mobiles initially; never dial arbitrary countries/extensions. */
export function normalizeLeadCallPhone(
  value: string | null | undefined
): string | null {
  if (!value || value.length > 80 || /[A-Za-z#;]/.test(value)) return null;
  const normalized = value.trim().replace(/^00/, "+");
  const phone = parsePhoneNumberFromString(normalized, "EG");
  return phone?.isValid() &&
    phone.country === "EG" &&
    /^\+201[0125]\d{8}$/.test(phone.number) &&
    !phone.ext
    ? phone.number
    : null;
}
export function getLeadCallsReadiness(
  config: LeadCallsConfig,
  policy: LeadCallPolicy | null
) {
  const reasons: string[] = [];
  if (!config.enabled) reasons.push("calling_disabled");
  const required: [string, boolean][] = [
    ["TWILIO_ACCOUNT_SID", sid(config.accountSid, "AC")],
    ["TWILIO_API_KEY_SID", sid(config.apiKeySid, "SK")],
    ["TWILIO_API_KEY_SECRET", !!config.apiKeySecret],
    ["TWILIO_AUTH_TOKEN", !!config.authToken],
    ["TWILIO_TWIML_APP_SID", sid(config.twimlAppSid, "AP")],
    ["TWILIO_DEFAULT_CALLER_ID", !!config.defaultCallerId],
    ["TWILIO_WEBHOOK_BASE_URL", !!config.webhookBaseUrl],
  ];
  for (const [name, present] of required)
    if (!present) reasons.push(`missing_or_invalid_${name}`);
  if (!policy?.enabled || !policy.callingApproved)
    reasons.push("owner_calling_approval_required");
  if (
    !policy?.policyVersion ||
    !policy.recordingNoticeAr?.trim() ||
    !policy.recordingNoticeEn?.trim() ||
    !policy.consentRequired
  )
    reasons.push("owner_recording_policy_required");
  if (!policy?.mediaProtectionConfirmed)
    reasons.push("provider_media_protection_confirmation_required");
  if (
    config.processingEnabled &&
    policy?.processingApproved &&
    (!policy.scheduleEnabled || !policy.scheduleCronTaskUid)
  )
    reasons.push("processing_recovery_required");
  return {
    enabled: config.enabled,
    processingEnabled: config.processingEnabled && !!policy?.processingApproved,
    ready: reasons.length === 0,
    reasons,
  };
}
export function webhookUrl(
  config: LeadCallsConfig,
  path: string,
  callId?: number
): string {
  if (!config.webhookBaseUrl || !/^\/api\/twilio\/[a-z-]+$/.test(path))
    throw new Error("calling_configuration_unavailable");
  return `${config.webhookBaseUrl}${path}${callId === undefined ? "" : `?callId=${callId}`}`;
}

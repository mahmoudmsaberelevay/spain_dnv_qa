export const CLIENT_DOCUMENTATION_ORIGINS = ["egypt", "dubai"] as const;

export type ClientDocumentationOrigin = typeof CLIENT_DOCUMENTATION_ORIGINS[number];

export const CLIENT_DOCUMENTATION_ORIGIN_LABELS: Record<ClientDocumentationOrigin, string> = {
  egypt: "Egypt",
  dubai: "Dubai",
};

export function normalizeClientDocumentationMobile(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || null;
}

export function isValidClientDocumentationMobile(value: string | null | undefined) {
  const normalized = normalizeClientDocumentationMobile(value);
  if (!normalized || !/^[+()\-\s0-9]+$/.test(normalized)) return false;
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function clientDocumentationOriginLabel(value: string | null | undefined) {
  return value === "dubai" ? CLIENT_DOCUMENTATION_ORIGIN_LABELS.dubai : CLIENT_DOCUMENTATION_ORIGIN_LABELS.egypt;
}

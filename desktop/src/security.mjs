export const APP_URL = "https://elevay.vip/";

export const TRUSTED_ORIGINS = Object.freeze(new Set([
  "https://elevay.vip",
  "https://www.elevay.vip",
]));

const SAFE_EXTERNAL_PROTOCOLS = Object.freeze(new Set(["https:", "mailto:", "tel:"]));
const ALLOWED_PERMISSIONS = Object.freeze(new Set([
  "clipboard-sanitized-write",
  "fullscreen",
  "media",
  "notifications",
]));

export function isTrustedOrigin(value) {
  try {
    return TRUSTED_ORIGINS.has(new URL(value).origin);
  } catch {
    return false;
  }
}

export function classifyNavigation(value) {
  if (value === "about:blank") return "local-popup";

  try {
    const url = new URL(value);
    if (url.protocol === "https:" && TRUSTED_ORIGINS.has(url.origin)) return "internal";
    if (url.protocol === "blob:" && TRUSTED_ORIGINS.has(url.origin)) return "trusted-blob";
    if (SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) return "external";
    return "blocked";
  } catch {
    return "blocked";
  }
}

export function canGrantPermission({ permission, requestingUrl, mediaTypes = [] }) {
  if (!isTrustedOrigin(requestingUrl) || !ALLOWED_PERMISSIONS.has(permission)) return false;
  if (permission !== "media") return true;

  const requestedTypes = Array.isArray(mediaTypes) ? mediaTypes : [];
  return requestedTypes.length === 0 || requestedTypes.every(type => type === "audio");
}

export function sanitizeDownloadFilename(value) {
  const fallback = "elevay-download";
  if (typeof value !== "string") return fallback;

  const leaf = value.split(/[\\/]/).pop() ?? fallback;
  const cleaned = leaf
    .replace(/[<>:"|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180)
    .trim();

  return cleaned || fallback;
}

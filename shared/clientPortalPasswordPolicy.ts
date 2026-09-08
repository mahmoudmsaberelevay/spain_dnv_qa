export const CLIENT_PORTAL_PASSWORD_MIN_LENGTH = 10;
export const CLIENT_PORTAL_PASSWORD_MAX_BYTES = 72;

export type ClientPortalPasswordCheck = {
  valid: boolean;
  errors: string[];
};

export function checkClientPortalPassword(password: string): ClientPortalPasswordCheck {
  const errors: string[] = [];
  const byteLength = new TextEncoder().encode(password).length;

  if (password.length < CLIENT_PORTAL_PASSWORD_MIN_LENGTH) errors.push("Use at least 10 characters");
  if (byteLength > CLIENT_PORTAL_PASSWORD_MAX_BYTES) errors.push("Use no more than 72 bytes");
  if (/\s/.test(password)) errors.push("Do not use spaces");
  if (!/[A-Z]/.test(password)) errors.push("Add an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Add a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Add a number");
  if (!/[^A-Za-z0-9\s]/.test(password)) errors.push("Add a symbol");

  return { valid: errors.length === 0, errors };
}

export function isStrongClientPortalPassword(password: string) {
  return checkClientPortalPassword(password).valid;
}

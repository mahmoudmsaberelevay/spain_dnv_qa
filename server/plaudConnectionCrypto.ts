import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

export type PlaudErrorCode =
  | "PLAUD_INVALID_INPUT"
  | "PLAUD_CONFIGURATION_UNAVAILABLE"
  | "PLAUD_STORAGE_UNAVAILABLE"
  | "PLAUD_CREDENTIALS_UNAVAILABLE"
  | "PLAUD_OAUTH_STATE_INVALID"
  | "PLAUD_CONNECTION_CHANGED"
  | "PLAUD_CONNECTION_BUSY"
  | "PLAUD_NOT_CONNECTED"
  | "PLAUD_RECONNECT_REQUIRED"
  | "PLAUD_NETWORK_REJECTED"
  | "PLAUD_PROVIDER_UNAVAILABLE"
  | "PLAUD_RESPONSE_UNSUPPORTED"
  | "PLAUD_TRANSCRIPT_UNAVAILABLE";

/** Public errors contain only a fixed code: never a provider error, cause, body or URL. */
export class PlaudError extends Error {
  constructor(public readonly code: PlaudErrorCode) {
    super(code);
    this.name = "PlaudError";
  }
}
export function plaudSafeError(error: unknown): PlaudError {
  return error instanceof PlaudError
    ? error
    : new PlaudError("PLAUD_PROVIDER_UNAVAILABLE");
}
export function assertPlaudUser(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new PlaudError("PLAUD_INVALID_INPUT");
}
export function plaudHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
export type PlaudSealPurpose = "credentials" | "oauth-state";
const CONTEXT = "elevay:plaud:private-connection:v1";
const MAX_PLAINTEXT = 40_000;

/** Injecting a secret reader allows offline tests; production reads the existing server secret lazily. */
export class PlaudConnectionCrypto {
  constructor(
    private readonly secret: () => string | undefined = () =>
      process.env.JWT_SECRET
  ) {}
  private material(userId: number, purpose: PlaudSealPurpose, binding: string) {
    assertPlaudUser(userId);
    const secret = this.secret();
    if (!secret || secret.length < 16)
      throw new PlaudError("PLAUD_CONFIGURATION_UNAVAILABLE");
    const aad = Buffer.from(
      JSON.stringify([CONTEXT, purpose, userId, binding])
    );
    const key = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(secret, "utf8"),
        Buffer.from(CONTEXT),
        aad,
        32
      )
    );
    return { key, aad };
  }
  seal(
    userId: number,
    purpose: PlaudSealPurpose,
    value: unknown,
    binding = ""
  ): string {
    const { key, aad } = this.material(userId, purpose, binding);
    try {
      const plaintext = Buffer.from(JSON.stringify(value), "utf8");
      if (plaintext.length > MAX_PLAINTEXT)
        throw new PlaudError("PLAUD_CREDENTIALS_UNAVAILABLE");
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      return [
        "v1",
        nonce.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        encrypted.toString("base64url"),
      ].join(".");
    } catch {
      throw new PlaudError("PLAUD_CREDENTIALS_UNAVAILABLE");
    } finally {
      key.fill(0);
    }
  }
  open<T>(
    userId: number,
    purpose: PlaudSealPurpose,
    sealed: string,
    binding = ""
  ): T {
    const { key, aad } = this.material(userId, purpose, binding);
    try {
      if (typeof sealed !== "string" || sealed.length > 60_000)
        throw new Error();
      const parts = sealed.split(".");
      if (
        parts.length !== 4 ||
        parts[0] !== "v1" ||
        parts.slice(1).some(p => !/^[A-Za-z0-9_-]+$/.test(p))
      )
        throw new Error();
      const nonce = Buffer.from(parts[1], "base64url"),
        tag = Buffer.from(parts[2], "base64url");
      if (nonce.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(parts[3], "base64url")),
        decipher.final(),
      ]);
      if (plaintext.length > MAX_PLAINTEXT) throw new Error();
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch {
      throw new PlaudError("PLAUD_CREDENTIALS_UNAVAILABLE");
    } finally {
      key.fill(0);
    }
  }
}

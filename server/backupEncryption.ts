import crypto from "node:crypto";

const BACKUP_MAGIC = Buffer.from("ELEVAYDB2", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PBKDF2_ITERATIONS = 210_000;

export function getBackupEncryptionPassword(): string {
  const password = process.env.BACKUP_ENCRYPTION_PASSWORD?.trim() || "";
  if (password.length < 12) {
    throw new Error("BACKUP_ENCRYPTION_PASSWORD is missing or too short");
  }
  return password;
}

function deriveKey(password: string, salt: Buffer) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

export function encryptBackupBuffer(data: Buffer, password = getBackupEncryptionPassword()): Buffer {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, salt, iv, authTag, encrypted]);
}

export function decryptBackupBuffer(data: Buffer, password = getBackupEncryptionPassword()): Buffer {
  if (!data.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error("Unsupported backup encryption envelope");
  }
  let offset = BACKUP_MAGIC.length;
  const salt = data.subarray(offset, offset += SALT_BYTES);
  const iv = data.subarray(offset, offset += IV_BYTES);
  const authTag = data.subarray(offset, offset += TAG_BYTES);
  const encrypted = data.subarray(offset);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export const BACKUP_ENCRYPTION_METADATA = {
  envelopeVersion: 2,
  algorithm: "AES-256-GCM",
  keyDerivation: "PBKDF2-HMAC-SHA256",
  iterations: PBKDF2_ITERATIONS,
} as const;

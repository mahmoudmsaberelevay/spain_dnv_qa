import { randomUUID } from "crypto";

export const MAX_PROVIDER_COVER_BYTES = 5 * 1024 * 1024;

const COVER_TYPES = {
  "image/jpeg": { extensions: ["jpg", "jpeg"], extension: "jpg" },
  "image/png": { extensions: ["png"], extension: "png" },
  "image/webp": { extensions: ["webp"], extension: "webp" },
} as const;

export type ProviderCoverUpload = {
  fileName: string;
  mimeType: keyof typeof COVER_TYPES;
  dataBase64: string;
};

function hasValidSignature(buffer: Buffer, mimeType: keyof typeof COVER_TYPES) {
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export function decodeProviderCoverUpload(upload: ProviderCoverUpload) {
  const type = COVER_TYPES[upload.mimeType];
  if (!type) throw new Error("unsupported_cover_photo_type");
  const extension = upload.fileName.split(".").pop()?.toLowerCase() || "";
  if (!type.extensions.includes(extension as never)) throw new Error("cover_photo_extension_mismatch");
  const buffer = Buffer.from(upload.dataBase64, "base64");
  if (buffer.length < 12 || buffer.length > MAX_PROVIDER_COVER_BYTES) throw new Error("invalid_cover_photo_size");
  if (!hasValidSignature(buffer, upload.mimeType)) throw new Error("cover_photo_content_mismatch");
  return { buffer, mimeType: upload.mimeType, extension: type.extension };
}

export function providerCoverStorageKey(publicId: string, extension: string) {
  return `client-portal/providers/${publicId}/cover-${randomUUID()}.${extension}`;
}

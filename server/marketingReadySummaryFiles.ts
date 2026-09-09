import { createHash } from "node:crypto";
import { nanoid } from "nanoid";

export const READY_SUMMARY_CATEGORIES = ["Residency", "Citizenship", "Immigration", "Other"] as const;
export type ReadySummaryCategory = (typeof READY_SUMMARY_CATEGORIES)[number];

export const READY_SUMMARY_MAX_BYTES = 25 * 1024 * 1024;
export const READY_SUMMARY_MAX_BASE64_LENGTH = Math.ceil(READY_SUMMARY_MAX_BYTES * 4 / 3) + 16;

export type ReadySummaryUpload = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileBase64: string;
};

export function decodeReadySummaryPdf(upload: ReadySummaryUpload) {
  const fileName = upload.fileName.trim().replace(/^.*[\\/]/, "");
  if (!fileName || fileName.length > 255) throw new Error("ready_summary_file_name_invalid");
  if (upload.mimeType !== "application/pdf" || !fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("ready_summary_pdf_required");
  }
  if (!Number.isInteger(upload.fileSize) || upload.fileSize <= 0 || upload.fileSize > READY_SUMMARY_MAX_BYTES) {
    throw new Error("ready_summary_file_size_invalid");
  }
  if (!upload.fileBase64 || upload.fileBase64.length > READY_SUMMARY_MAX_BASE64_LENGTH) {
    throw new Error("ready_summary_file_size_invalid");
  }

  const buffer = Buffer.from(upload.fileBase64, "base64");
  if (buffer.byteLength !== upload.fileSize || buffer.byteLength > READY_SUMMARY_MAX_BYTES) {
    throw new Error("ready_summary_file_size_mismatch");
  }
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("ready_summary_content_mismatch");
  }

  return {
    buffer,
    fileName,
    sha256Digest: createHash("sha256").update(buffer).digest("hex"),
  };
}

export function readySummaryStorageKey() {
  return `marketing/ready-summaries/${nanoid(24)}.pdf`;
}

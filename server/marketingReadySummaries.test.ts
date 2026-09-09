import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeReadySummaryPdf,
  READY_SUMMARY_MAX_BYTES,
  readySummaryStorageKey,
} from "./marketingReadySummaryFiles";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Marketing Ready Summaries", () => {
  it("accepts a real PDF header and produces a stable SHA-256 digest", () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "utf8");
    const decoded = decodeReadySummaryPdf({
      fileName: "../Spain Summary.pdf",
      mimeType: "application/pdf",
      fileSize: pdf.byteLength,
      fileBase64: pdf.toString("base64"),
    });
    expect(decoded.fileName).toBe("Spain Summary.pdf");
    expect(decoded.buffer.equals(pdf)).toBe(true);
    expect(decoded.sha256Digest).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect(readySummaryStorageKey()).toMatch(/^marketing\/ready-summaries\/[A-Za-z0-9_-]{24}\.pdf$/);
  });

  it("rejects spoofed, oversized, mismatched, and non-PDF uploads", () => {
    const executable = Buffer.from("MZ-not-a-pdf", "utf8");
    expect(() => decodeReadySummaryPdf({ fileName: "bad.pdf", mimeType: "application/pdf", fileSize: executable.byteLength, fileBase64: executable.toString("base64") })).toThrow("ready_summary_content_mismatch");
    expect(() => decodeReadySummaryPdf({ fileName: "bad.exe", mimeType: "application/pdf", fileSize: executable.byteLength, fileBase64: executable.toString("base64") })).toThrow("ready_summary_pdf_required");
    expect(() => decodeReadySummaryPdf({ fileName: "bad.pdf", mimeType: "application/pdf", fileSize: executable.byteLength + 1, fileBase64: executable.toString("base64") })).toThrow("ready_summary_file_size_mismatch");
    expect(() => decodeReadySummaryPdf({ fileName: "large.pdf", mimeType: "application/pdf", fileSize: READY_SUMMARY_MAX_BYTES + 1, fileBase64: "AA==" })).toThrow("ready_summary_file_size_invalid");
  });

  it("keeps downloads shared while restricting add/delete controls to administrators", () => {
    const router = read("server/marketingRouter.ts");
    expect(router).toContain("listReadySummaries: protectedProcedure");
    expect(router).toContain("getReadySummaryDownload: protectedProcedure");
    expect(router).toContain("requireReadySummaryManager(ctx.user)");
    expect(router).toContain('user.role !== "admin"');
    expect(router).toContain("isNull(marketingReadySummaries.deletedAt)");
    expect(router).toContain('"download", "marketing_ready_summary"');
    expect(router).not.toMatch(/listReadySummaries:[\s\S]{0,1300}storageKey:/);
  });

  it("provides desktop, mobile, dashboard, upload, download, and confirmed delete interfaces", () => {
    const page = read("client/src/pages/marketing/ReadySummaries.tsx");
    const app = read("client/src/App.tsx");
    const desktop = read("client/src/components/DashboardLayout.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    expect(app).toContain('path="/marketing/ready-summaries"');
    expect(desktop).toContain('label: "Ready Summaries"');
    expect(mobile).toContain('label: "Ready Summaries"');
    expect(dashboard).toContain('title: "Ready Summaries"');
    expect(page).toContain("uploadReadySummary.useMutation");
    expect(page).toContain("getReadySummaryDownload.useMutation");
    expect(page).toContain("deleteReadySummary.useMutation");
    expect(page).toContain("<AlertDialog");
    expect(page).toContain('const isAdmin = user?.role === "admin"');
  });

  it("uses an additive catalog migration with unique content and soft-deletion metadata", () => {
    const migration = read("drizzle/0072_marketing_ready_summaries.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_ready_summaries`");
    expect(migration).toContain("marketing_ready_summaries_sha256_unique");
    expect(migration).toContain("`deletedAt` bigint NULL");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});

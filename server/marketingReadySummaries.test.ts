import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeReadySummaryPdf,
  READY_SUMMARY_MAX_BYTES,
  readySummaryStorageKey,
} from "./marketingReadySummaryFiles";
import { buildReadySummaryWhatsappText, buildReadySummaryWhatsappUrl } from "../shared/readySummaryWhatsappShare";

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

  it("builds a manually sent WhatsApp URL with an encoded title and secure PDF link", () => {
    const downloadUrl = "https://files.example.test/summary.pdf?token=a+b&expires=1";
    const url = buildReadySummaryWhatsappUrl("Spain & Portugal Summary", downloadUrl);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://wa.me");
    expect(parsed.pathname).toBe("/");
    expect(parsed.searchParams.get("text")).toBe(buildReadySummaryWhatsappText("Spain & Portugal Summary", downloadUrl));
    expect(parsed.searchParams.get("text")).toContain("Spain & Portugal Summary");
    expect(() => buildReadySummaryWhatsappUrl("Unsafe", "http://files.example.test/summary.pdf")).toThrow("ready_summary_share_https_required");
  });

  it("prepares authenticated active-summary shares without sending through the Cloud API", () => {
    const router = read("server/marketingRouter.ts");
    const page = read("client/src/pages/marketing/ReadySummaries.tsx");
    expect(router).toContain("prepareReadySummaryWhatsappShare: protectedProcedure");
    expect(router).toContain("buildReadySummaryWhatsappUrl(summary.title, stored.url)");
    expect(router).toContain('"share_prepare", "marketing_ready_summary"');
    expect(router).toContain("sentAutomatically: false as const");
    expect(router).not.toMatch(/prepareReadySummaryWhatsappShare:[\s\S]{0,2200}graph\.facebook\.com/);
    expect(page).toContain("prepareReadySummaryWhatsappShare.useMutation");
    expect(page).toContain('window.open("about:blank", "_blank")');
    expect(page).toContain("shareWindow.location.replace(result.whatsappUrl)");
    expect(page).toContain("Allow pop-ups for ELEVAY");
    expect(page).toContain("the user chooses the recipient and sends it manually");
  });

  it("provides desktop, mobile, dashboard, upload, download, and confirmed delete interfaces", () => {
    const page = read("client/src/pages/marketing/ReadySummaries.tsx");
    const generator = read("client/src/pages/marketing/SummaryGenerator.tsx");
    const tabs = read("client/src/pages/marketing/MarketingSummaryTabs.tsx");
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
    expect(page).toContain("prepareReadySummaryWhatsappShare.useMutation");
    expect(page).toContain("deleteReadySummary.useMutation");
    expect(page).toContain("<AlertDialog");
    expect(page).toContain('const isAdmin = user?.role === "admin"');
    expect(page).toContain("<MarketingSummaryTabs />");
    expect(generator).toContain("<MarketingSummaryTabs />");
    expect(tabs).toContain('label: "Ready Summaries"');
    expect(tabs).toContain('path: "/marketing/ready-summaries"');
    expect(tabs).toContain('label: "Summary Generator"');
    expect(tabs).toContain('aria-label="Marketing summaries"');
  });

  it("exposes Ready Summaries and Program Proposal as direct mobile application shortcuts", () => {
    const mobileLayout = read("client/src/components/MobileLayout.tsx");
    const mobileHome = read("client/src/pages/MobileHome.tsx");
    const app = read("client/src/App.tsx");

    expect(mobileLayout).toContain('label: "Ready Summaries", icon: FolderOpen, path: "/marketing/ready-summaries"');
    expect(mobileLayout).toContain('label: "Program Proposal", icon: FileSignature, path: "/marketing/program-proposal"');
    expect(mobileLayout).toContain("Marketing shortcuts");
    expect(mobileHome).toContain("Marketing Tools");
    expect(mobileHome).toContain('handleNav("/marketing/ready-summaries")');
    expect(mobileHome).toContain('handleNav("/marketing/program-proposal")');
    expect(app).toContain('<Route path="/marketing/ready-summaries">');
    expect(app).toContain('<Route path="/marketing/program-proposal">');
  });

  it("uses an additive catalog migration with unique content and soft-deletion metadata", () => {
    const migration = read("drizzle/0072_marketing_ready_summaries.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_ready_summaries`");
    expect(migration).toContain("marketing_ready_summaries_sha256_unique");
    expect(migration).toContain("`deletedAt` bigint NULL");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "news-alert-test" });
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("News importer administration monitoring", () => {
  beforeEach(() => {
    sendMail.mockClear();
    process.env.GMAIL_USER = "info@elevay.com";
    process.env.GMAIL_APP_PASSWORD = "test-password";
  });

  it("puts importer health and authorization state on the admin Marketing dashboard", () => {
    const page = read("client/src/pages/marketing/MarketingDashboard.tsx");
    expect(page).toContain("/api/admin/news/gmail/status");
    expect(page).toContain("lastSuccessfulAt");
    expect(page).toContain("lastAttemptAt");
    expect(page).toContain("authorizationIssue");
    expect(page).toContain("60_000");
    expect(page).toContain("News importer health");
  });

  it("exposes safe Gmail authorization and import-error fields", () => {
    const service = read("server/newsDigestService.ts");
    const route = read("server/newsRoutes.ts");
    expect(service).toContain("authorizationIssue");
    expect(service).toContain("lastSuccessfulAt");
    expect(service).toContain("sendNewsDigestFailureAlert");
    expect(route).toContain('app.get("/api/admin/news/gmail/status", requireAdmin');
    expect(route).toContain("getNewsGmailConnectionStatus()");
  });

  it("sends an executive email alert with no Gmail token or message-body data", async () => {
    const { sendNewsDigestFailureAlert } = await import("./emailService");
    const result = await sendNewsDigestFailureAlert({
      attemptedAt: new Date("2026-09-20T09:30:00.000Z"),
      errorMessage: "Gmail authorization expired: invalid_grant <token>",
    });
    expect(result).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]?.[0];
    expect(String(message.to).toLowerCase()).toContain("mahmoud.saber@elevay.com");
    expect(String(message.to).toLowerCase()).toContain("ziadelshurafa@gmail.com");
    expect(message.subject).toContain("Daily Digest News import failed");
    expect(message.html).toContain("invalid_grant token");
    expect(message.html).not.toContain("<token>");
    expect(message.html).not.toContain("refresh_token");
    expect(message.html).not.toContain("Subject: Daily Digest");
  });

  it("routes this failure event through the executive recipient policy", () => {
    const recipients = read("server/systemNotificationRecipients.ts");
    expect(recipients).toContain('"news_digest_import_failed"');
  });
});

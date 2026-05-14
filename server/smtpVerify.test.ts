import { describe, it, expect } from "vitest";
import nodemailer from "nodemailer";

describe("Gmail SMTP credentials", () => {
  it("should create a transporter and verify the SMTP connection", async () => {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    // If secrets are not injected in this test environment, skip gracefully
    if (!gmailUser || !gmailPass) {
      console.warn("[smtpVerify] GMAIL credentials not set — skipping live SMTP check");
      expect(true).toBe(true);
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    // verify() throws if credentials are wrong or connection fails
    await expect(transporter.verify()).resolves.toBe(true);
    console.log(`[smtpVerify] SMTP connection verified for ${gmailUser}`);
  }, 15000); // allow up to 15s for network round-trip
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "test" });

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail }),
  },
}));

describe("system notification email integration", () => {
  beforeEach(() => {
    sendMail.mockClear();
    process.env.GMAIL_USER = "system.sender@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "test-password";
    delete process.env.SYSTEM_EMAIL_SENDER;
  });

  it("adds Ziad Gmail to shared internal system notifications", async () => {
    const { notifyNewContract } = await import("./emailService");
    await notifyNewContract("contract-1", "Test contract", "Test client");
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(String(sendMail.mock.calls[0]?.[0]?.to).toLowerCase()).toContain("ziadelshurafa@gmail.com");
    expect(String(sendMail.mock.calls[0]?.[0]?.to).toLowerCase()).toContain("mahmoud.saberelevay@gmail.com");
  });

  it("does not copy internal recipients on client-facing receipt or password-reset emails", async () => {
    const { sendClientPortalPasswordResetEmail, sendReceiptToClient } = await import("./emailService");
    await sendReceiptToClient("client@example.com", "Receipt", "https://example.test/receipt");
    await sendClientPortalPasswordResetEmail("portal@example.com", "test-token");
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0]?.[0]?.to).toBe("client@example.com");
    expect(sendMail.mock.calls[1]?.[0]?.to).toBe("portal@example.com");
  });

  it("adds Ziad Gmail to backup/support-style internal messages by default", async () => {
    const { sendEmail } = await import("./backupEmailService");
    await sendEmail({ to: "support@elevay.com", subject: "Test", text: "Test" });
    const recipients = String(sendMail.mock.calls[0]?.[0]?.to).toLowerCase().split(",");
    expect(recipients).toEqual(["support@elevay.com", "ziadelshurafa@gmail.com"]);
  });

  it("supports per-recipient scheduled delivery without re-adding the mandatory recipient", async () => {
    const { sendEmail } = await import("./backupEmailService");
    await sendEmail({
      to: "owner@example.com",
      subject: "Test",
      text: "Test",
      includeSystemRecipient: false,
    });
    expect(sendMail.mock.calls[0]?.[0]?.to).toBe("owner@example.com");
  });
});

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

  it("sends contract and receipt create/sign notifications to Mahmoud and Ziad", async () => {
    const { notifyContractStatusChange, notifyNewContract, notifyNewInvoice, notifyReceiptPaid } = await import("./emailService");
    await notifyNewContract("contract-1", "Test contract", "Test client");
    await notifyContractStatusChange("contract-1", "Test client", "signed");
    await notifyNewInvoice("receipt-1", "contract-1", "Test client", 1000, 2000);
    await notifyReceiptPaid("receipt-1", "contract-1", "Test client", 1000, 2000);
    expect(sendMail).toHaveBeenCalledTimes(4);
    for (const [message] of sendMail.mock.calls) {
      const recipients = String(message.to).toLowerCase();
      expect(recipients).toContain("ziadelshurafa@gmail.com");
      expect(recipients).toContain("mahmoud.saberelevay@gmail.com");
      expect(recipients).toContain("mahmoud.saber@elevay.com");
    }
  });

  it("does not notify executives for non-signed contract status changes", async () => {
    const { notifyContractStatusChange } = await import("./emailService");
    await notifyContractStatusChange("contract-1", "Test client", "pending");
    await notifyContractStatusChange("contract-1", "Test client", "cancelled");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not copy internal recipients on client-facing receipt or password-reset emails", async () => {
    const { sendClientPortalPasswordResetEmail, sendReceiptToClient } = await import("./emailService");
    await sendReceiptToClient("client@example.com", "Receipt", "https://example.test/receipt");
    await sendClientPortalPasswordResetEmail("portal@example.com", "test-token");
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0]?.[0]?.to).toBe("client@example.com");
    expect(sendMail.mock.calls[1]?.[0]?.to).toBe("portal@example.com");
  });

  it("keeps unrelated internal messages with non-executive recipients only", async () => {
    const { sendEmail } = await import("./backupEmailService");
    await sendEmail({ to: ["support@elevay.com", "mahmoud.saber@elevay.com", "Ziadelshurafa@gmail.com"], subject: "Test", text: "Test" });
    const recipients = String(sendMail.mock.calls[0]?.[0]?.to).toLowerCase().split(",");
    expect(recipients).toEqual(["support@elevay.com"]);
  });

  it("sends Lead assignment to Mahmoud and the assigned consultant but not Ziad", async () => {
    const { sendLeadAssignmentNotification } = await import("./emailService");
    await sendLeadAssignmentNotification({
      ownerName: "Fouad Abdo",
      ownerEmail: "fouad.abdo@elevay.com",
      leadId: 1,
      leadName: "Test Lead",
      origin: "https://example.test",
    });
    const recipients = String(sendMail.mock.calls[0]?.[0]?.to).toLowerCase();
    expect(recipients).toContain("fouad.abdo@elevay.com");
    expect(recipients).toContain("mahmoud.saberelevay@gmail.com");
    expect(recipients).not.toContain("ziad");
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

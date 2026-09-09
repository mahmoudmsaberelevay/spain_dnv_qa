import { describe, expect, it } from "vitest";
import {
  MAHMOUD_NOTIFICATION_RECIPIENTS,
  SYSTEM_NOTIFICATION_FROM_HEADER,
  SYSTEM_NOTIFICATION_SENDER_ADDRESS,
  ZIAD_NOTIFICATION_RECIPIENTS,
  extractSenderAddress,
  getSystemNotificationFromHeader,
  isSystemNotificationVisibleToExecutive,
  isAllowedSystemEmailSender,
  normalizeEmailRecipients,
  resolveSystemNotificationRecipients,
} from "./systemNotificationRecipients";

describe("system notification recipient policy", () => {
  it("routes contract and receipt create/sign events to Mahmoud and Ziad", () => {
    for (const eventType of ["contract_created", "contract_signed", "receipt_created", "receipt_paid"]) {
      expect(resolveSystemNotificationRecipients(eventType, "team@elevay.com")).toEqual([
        "team@elevay.com",
        ...MAHMOUD_NOTIFICATION_RECIPIENTS,
        ...ZIAD_NOTIFICATION_RECIPIENTS,
      ]);
    }
  });

  it("routes Lead assignment to the assigned consultant and Mahmoud, never Ziad", () => {
    expect(resolveSystemNotificationRecipients(
      "lead_assigned",
      ["consultant@elevay.com", "ziad.elshurafa@elevay.com"],
    )).toEqual([
      "consultant@elevay.com",
      ...MAHMOUD_NOTIFICATION_RECIPIENTS,
    ]);
  });

  it("removes Mahmoud and Ziad from every other automatic notification category", () => {
    expect(resolveSystemNotificationRecipients("client_document_uploaded", [
      "assigned@elevay.com",
      "mahmoud.saberelevay@gmail.com",
      "ZIAD.ELSHURAFA@ELEVAY.COM",
      "ziadelshurafa@gmail.com",
    ])).toEqual(["assigned@elevay.com"]);
  });

  it("keeps client-facing normalization independent of the executive matrix", () => {
    expect(normalizeEmailRecipients("client@example.com", ["CLIENT@example.com"])).toEqual([
      "client@example.com",
    ]);
  });

  it("filters CRM bell events for Mahmoud and Ziad while leaving other staff unchanged", () => {
    expect(isSystemNotificationVisibleToExecutive("mahmoud.saberelevay@gmail.com", "lead_assigned")).toBe(true);
    expect(isSystemNotificationVisibleToExecutive("ziad.elshurafa@elevay.com", "lead_assigned")).toBe(false);
    expect(isSystemNotificationVisibleToExecutive("ziadelshurafa@gmail.com", "contract_signed")).toBe(true);
    expect(isSystemNotificationVisibleToExecutive("mahmoud.saber@elevay.com", "client_message")).toBe(false);
    expect(isSystemNotificationVisibleToExecutive("consultant@elevay.com", "client_message")).toBe(true);
  });

  it("allows only the authenticated Info mailbox as the system sender", () => {
    const originalUser = process.env.GMAIL_USER;
    process.env.GMAIL_USER = "Info@elevay.com";
    expect(extractSenderAddress('"ELEVAY" <Info@elevay.com>')).toBe(SYSTEM_NOTIFICATION_SENDER_ADDRESS);
    expect(isAllowedSystemEmailSender('"ELEVAY" <Info@elevay.com>')).toBe(true);
    expect(isAllowedSystemEmailSender('"ELEVAY" <sender@gmail.com>')).toBe(false);
    expect(isAllowedSystemEmailSender('"ELEVAY" <sender@elevay.com>')).toBe(false);
    expect(isAllowedSystemEmailSender("")).toBe(false);
    expect(getSystemNotificationFromHeader()).toBe(SYSTEM_NOTIFICATION_FROM_HEADER);
    if (originalUser === undefined) delete process.env.GMAIL_USER;
    else process.env.GMAIL_USER = originalUser;
  });
});

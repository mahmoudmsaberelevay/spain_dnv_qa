import { describe, expect, it } from "vitest";
import {
  MANDATORY_SYSTEM_NOTIFICATION_RECIPIENT,
  extractSenderAddress,
  isAllowedSystemEmailSender,
  mergeSystemNotificationRecipients,
  normalizeEmailRecipients,
} from "./systemNotificationRecipients";

describe("system notification recipient policy", () => {
  it("always includes Ziad Gmail while preserving existing recipients", () => {
    expect(mergeSystemNotificationRecipients(["owner@example.com", "team@elevay.com"])).toEqual([
      "owner@example.com",
      "team@elevay.com",
      MANDATORY_SYSTEM_NOTIFICATION_RECIPIENT,
    ]);
  });

  it("deduplicates comma-separated and array recipients case-insensitively", () => {
    expect(mergeSystemNotificationRecipients(
      "OWNER@example.com, ziadelshurafa@GMAIL.com",
      ["owner@example.com", "another@example.com"],
    )).toEqual([
      "OWNER@example.com",
      "ziadelshurafa@GMAIL.com",
      "another@example.com",
    ]);
  });

  it("can normalize client-facing recipients without adding the system recipient", () => {
    expect(normalizeEmailRecipients("client@example.com", ["CLIENT@example.com"])).toEqual([
      "client@example.com",
    ]);
  });

  it("rejects ELEVAY-domain senders even when a display name is used", () => {
    expect(extractSenderAddress('"ELEVAY System" <sender@gmail.com>')).toBe("sender@gmail.com");
    expect(isAllowedSystemEmailSender('"ELEVAY System" <sender@gmail.com>')).toBe(true);
    expect(isAllowedSystemEmailSender('"ELEVAY System" <sender@elevay.com>')).toBe(false);
    expect(isAllowedSystemEmailSender("")).toBe(false);
  });
});

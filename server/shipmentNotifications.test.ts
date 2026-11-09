import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShipmentRecord } from "../shared/shipments";

const dependencies = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
  getSender: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => {
      // Do not retain or inspect auth configuration/environment values.
      const options = args[0] as Record<string, unknown>;
      dependencies.createTransport({
        connectionTimeout: options.connectionTimeout,
        greetingTimeout: options.greetingTimeout,
        socketTimeout: options.socketTimeout,
      });
      return { sendMail: dependencies.sendMail };
    },
  },
}));
vi.mock("./systemNotificationRecipients", async importOriginal => {
  const actual = await importOriginal<typeof import("./systemNotificationRecipients")>();
  return { ...actual, getSystemNotificationFromHeader: dependencies.getSender };
});
import { sendShipmentNotificationEmail } from "./emailService";
import { buildShipmentNotification, notifyShipmentCreated } from "./shipmentNotifications";

const row: ShipmentRecord = {
  id: 7,
  shipmentDate: "2026-11-09",
  companyName: "Synthetic carrier",
  shipmentNumber: "SHP-100",
  direction: "from",
  partyName: "Synthetic party",
  driveUrl: "https://drive.google.com/file/d/synthetic/view",
  recordedByName: "Synthetic manual recorder",
  notificationEmail: "shipment@example.test",
  notificationStatus: "sending",
  notificationSentAt: null,
  createdAt: new Date("2026-11-09T09:00:00.000Z"),
};
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  dependencies.sendMail.mockReset();
  dependencies.getSender.mockReset();
  dependencies.getSender.mockReturnValue("ELEVAY <info@elevay.com>");
  dependencies.sendMail.mockImplementation(async (message: { to: string[] }) => ({ accepted: message.to, rejected: [] }));
  log = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { log.mockRestore(); });

describe("Shipment dedicated SMTP sender", () => {
  it("reuses the bounded transporter (10s connection, 20s socket)", () => {
    expect(dependencies.createTransport).toHaveBeenCalledWith({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  });
  it("includes entered recipient and mandatory Ziad without attachments, stripped subject controls", async () => {
    await expect(sendShipmentNotificationEmail(" shipment@example.test ", "SHP\r\nBcc:\u0000\u202e", "<p>Safe</p>", "Safe")).resolves.toBe(true);
    expect(dependencies.sendMail).toHaveBeenCalledTimes(1);
    const message = dependencies.sendMail.mock.calls[0][0];
    expect(message).toEqual({
      from: "ELEVAY <info@elevay.com>", to: ["shipment@example.test", "Ziadelshurafa@gmail.com"],
      subject: "SHP  Bcc:  ", html: "<p>Safe</p>", text: "Safe",
    });
    expect(message).not.toHaveProperty("attachments");
  });
  it.each(["mahmoud.saber@elevay.com", "mahmoud.saberelevay@gmail.com", "ziad.elshurafa@elevay.com"])("preserves the entered executive %s instead of applying the global other policy", async notificationEmail => {
    expect(await sendShipmentNotificationEmail(notificationEmail, "Shipment", "Safe", "Safe")).toBe(true);
    expect(dependencies.sendMail.mock.calls[0][0].to).toEqual([notificationEmail, "Ziadelshurafa@gmail.com"]);
  });
  it.each(["Ziadelshurafa@gmail.com", "ziadelshurafa@gmail.com", "ZIADELSHURAFA@GMAIL.COM"])("deduplicates mandatory Ziad case-insensitively for entered %s", async notificationEmail => {
    expect(await sendShipmentNotificationEmail(notificationEmail, "Shipment", "Safe", "Safe")).toBe(true);
    expect(dependencies.sendMail.mock.calls[0][0].to).toEqual([notificationEmail]);
  });
  it.each([
    "first@example.test,second@example.test", "first@example.test;second@example.test",
    "Name <first@example.test>", "first@example.test\r\nBcc: other@example.test",
    "first@example.test\r\n", "first@example.test\u0000", "", "no-email",
    `${"a".repeat(245)}@example.test`,
  ])("rejects invalid single recipient %j before SMTP", async notificationEmail => {
    expect(await sendShipmentNotificationEmail(notificationEmail, "Shipment", "Safe", "Safe")).toBe(false);
    expect(dependencies.sendMail).not.toHaveBeenCalled();
  });
  it("fails closed if the approved system sender is unavailable", async () => {
    dependencies.getSender.mockReturnValue(null);
    expect(await sendShipmentNotificationEmail("shipment@example.test", "Shipment", "Safe", "Safe")).toBe(false);
    expect(dependencies.sendMail).not.toHaveBeenCalled();
  });
  it.each([
    { accepted: ["shipment@example.test"], rejected: ["Ziadelshurafa@gmail.com"] },
    { accepted: ["Ziadelshurafa@gmail.com"], rejected: ["shipment@example.test"] },
    { accepted: [] }, {},
  ])("does not call partial/missing SMTP acceptance success: %j", async result => {
    dependencies.sendMail.mockResolvedValue(result);
    expect(await sendShipmentNotificationEmail("shipment@example.test", "Shipment", "Safe", "Safe")).toBe(false);
    expect(dependencies.sendMail).toHaveBeenCalledTimes(1);
  });
  it("accepts a case-insensitive SMTP envelope with address objects", async () => {
    dependencies.sendMail.mockResolvedValue({ accepted: [{ address: "SHIPMENT@EXAMPLE.TEST" }, "ZIADELSHURAFA@GMAIL.COM"] });
    expect(await sendShipmentNotificationEmail("shipment@example.test", "Shipment", "Safe", "Safe")).toBe(true);
  });
  it("hides provider exception details and never retries", async () => {
    dependencies.sendMail.mockRejectedValue(new Error("SMTP token secret; private@example.test"));
    expect(await sendShipmentNotificationEmail("shipment@example.test", "Shipment", "Safe", "Safe")).toBe(false);
    expect(dependencies.sendMail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[Shipments] Notification could not be sent.");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/token|secret|private@/);
  });
});

describe("Shipment notification safe template", () => {
  it("includes all shipment details, both bodies and manual attribution but never private row identity", async () => {
    const privateRow = { ...row, requestKey: "private-replay-key", createdByUserId: 900, userEmail: "private@example.test", secret: "private-token" };
    expect(await notifyShipmentCreated(privateRow)).toBe(true);
    const message = dependencies.sendMail.mock.calls[0][0];
    for (const value of [row.shipmentDate, row.companyName, row.shipmentNumber, "Shipment from", row.partyName, row.driveUrl, row.recordedByName!, row.notificationEmail!, "2026-11-09T09:00:00.000Z"]) {
      expect(message.html).toContain(value);
      expect(message.text).toContain(value);
    }
    expect(message.html).toContain("manual entry");
    expect(message.text).toContain("not the authenticated account identity");
    expect(JSON.stringify(message)).not.toMatch(/private-replay-key|private@|private-token|createdByUserId/);
    expect(message).not.toHaveProperty("attachments");
  });
  it("HTML-escapes every user field and link attribute while preserving literal plain text", () => {
    const attack = `<img src=x onerror="alert(1)">'&`;
    const message = buildShipmentNotification({ ...row, shipmentDate: attack, companyName: attack, shipmentNumber: attack, partyName: attack, recordedByName: attack, notificationEmail: attack, driveUrl: `https://drive.google.com/file/d/synthetic?x="&y=<tag>` });
    expect(message.html).not.toContain("<img");
    expect(message.html).not.toContain("<tag>");
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;");
    expect(message.html).toContain("?x=&quot;&amp;y=&lt;tag&gt;");
    expect(message.text).toContain(attack);
  });
  it.each([
    "javascript:alert(1)", "http://drive.google.com/file", "https://drive.google.com.evil.test/file",
    "https://user:pass@drive.google.com/file", "https://drive.google.com:8443/file", "https://drive.google.com/file\r\n",
  ])("omits unsafe legacy link %j from both bodies", driveUrl => {
    const message = buildShipmentNotification({ ...row, driveUrl });
    expect(message.html).not.toContain("href=");
    expect(message.text).toContain("Drive link: Unavailable");
    expect(message.html).not.toContain(driveUrl);
  });
  it("handles legacy null fields and invalid timestamp without leaking identity", () => {
    const message = buildShipmentNotification({ ...row, recordedByName: null, notificationEmail: null, createdAt: "not-a-date" });
    expect(message.text).toContain("Recorded by (manual entry): Not recorded");
    expect(message.text).toContain("Created at (UTC): Unavailable");
  });
  it("does not invoke SMTP without an entered recipient", async () => {
    expect(await notifyShipmentCreated({ ...row, notificationEmail: null })).toBe(false);
    expect(dependencies.sendMail).not.toHaveBeenCalled();
  });
});

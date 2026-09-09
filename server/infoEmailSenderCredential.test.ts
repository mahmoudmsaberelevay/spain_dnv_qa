import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";

describe("Info notification sender credentials", () => {
  it("authenticates the configured Info mailbox without sending a message", async () => {
    expect(process.env.GMAIL_USER?.trim().toLowerCase()).toBe("info@elevay.com");
    expect(process.env.GMAIL_APP_PASSWORD?.trim()).toBeTruthy();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await expect(transporter.verify()).resolves.toBe(true);
    transporter.close();
  }, 20_000);
});

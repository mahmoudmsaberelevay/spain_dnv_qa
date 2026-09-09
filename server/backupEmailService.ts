import nodemailer from "nodemailer";
import {
  isAllowedSystemEmailSender,
  normalizeEmailRecipients,
  resolveSystemNotificationRecipients,
} from "./systemNotificationRecipients";

// Create transporter using Gmail credentials from env
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
  text,
  includeSystemRecipient = true,
}: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  includeSystemRecipient?: boolean;
}): Promise<boolean> {
  try {
    const sender = process.env.GMAIL_USER?.trim() || "";
    if (!isAllowedSystemEmailSender(sender)) {
      throw new Error("Backup email sender is missing or violates the non-ELEVAY sender policy");
    }
    const recipients = includeSystemRecipient
      ? resolveSystemNotificationRecipients("other", to)
      : normalizeEmailRecipients(to);
    if (recipients.length === 0) throw new Error("Email recipient is missing");
    await transporter.sendMail({
      from: sender,
      to: recipients.join(","),
      subject,
      html: html || text,
      text: text || html?.replace(/<[^>]*>/g, ""),
    });
    console.log(`[Email] Sent to ${recipients.length} recipient(s): ${subject}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send:`, String(err));
    return false;
  }
}

import nodemailer from "nodemailer";

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
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject,
      html: html || text,
      text: text || html?.replace(/<[^>]*>/g, ""),
    });
    console.log(`[Email] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, String(err));
    return false;
  }
}

import { notifyOwner } from "./_core/notification";
import nodemailer from "nodemailer";

// Team emails that receive ALL transaction notifications via SMTP
const TEAM_EMAILS = [
  "Mahmoud.saber@elevay.com",
];

/** Create a reusable nodemailer transporter using Gmail SMTP */
function createTransporter() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
}

/**
 * Send an HTML notification email to both team members via Gmail SMTP.
 * Falls back to Manus notifyOwner if SMTP credentials are not configured.
 */
async function notifyTeam(title: string, htmlContent: string, plainText: string): Promise<void> {
  const transporter = createTransporter();

  if (transporter) {
    const gmailUser = process.env.GMAIL_USER!;
    try {
      await transporter.sendMail({
        from: `"ELEVAY System" <${gmailUser}>`,
        to: TEAM_EMAILS.join(", "),
        subject: `[ELEVAY] ${title}`,
        html: wrapInEmailTemplate(title, htmlContent),
        text: plainText,
      });
      console.log(`[EmailService] Team notification sent: "${title}" → ${TEAM_EMAILS.join(", ")}`);
    } catch (err) {
      console.error("[EmailService] Failed to send team notification via SMTP:", err);
      // Fallback to Manus notification
      await notifyOwner({ title, content: plainText }).catch(() => {});
    }
  } else {
    // No SMTP credentials — use Manus notification as fallback
    await notifyOwner({ title, content: plainText }).catch(() => {});
    console.log(`[EmailService] (no SMTP) Manus notification sent: "${title}"`);
  }
}

/** Wrap content in a branded ELEVAY email HTML shell */
function wrapInEmailTemplate(title: string, body: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0;">
      <div style="background: #5E6A71; padding: 20px 24px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">ELEVAY</h1>
        <p style="color: #ccc; margin: 4px 0 0; font-size: 11px;">RESIDENCY BY INVESTMENT</p>
      </div>
      <div style="padding: 24px;">
        <h2 style="color: #2C3A40; margin-top: 0;">${title}</h2>
        ${body}
      </div>
      <div style="background: #F0F2F3; padding: 14px 24px; text-align: center;">
        <p style="color: #8A9499; font-size: 11px; margin: 0;">
          ELEVAY — Residency by Investment | Cairo, Egypt &amp; Dubai, UAE<br/>
          Tel: +20 16222280
        </p>
      </div>
    </div>
  `;
}

/** Send the receipt PDF directly to the client via email */
export async function sendReceiptToClient(
  clientEmail: string,
  clientName: string,
  receiptCode: string,
  pdfUrl: string
): Promise<{ success: boolean; message: string }> {
  const transporter = createTransporter();
  if (!transporter) {
    return {
      success: false,
      message: "Email credentials not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD.",
    };
  }

  try {
    const gmailUser = process.env.GMAIL_USER!;
    await transporter.sendMail({
      from: `"ELEVAY Residency" <${gmailUser}>`,
      to: clientEmail,
      subject: `Your ELEVAY Payment Receipt — ${receiptCode}`,
      html: wrapInEmailTemplate(
        `Payment Receipt ${receiptCode}`,
        `
        <p style="color: #2C3A40;">Dear <strong>${clientName}</strong>,</p>
        <p style="color: #5E6A71;">Please find your payment receipt linked below.</p>
        <p style="color: #5E6A71;"><strong>Receipt Code:</strong> ${receiptCode}</p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${pdfUrl}" style="background: #5E6A71; color: white; padding: 12px 28px; text-decoration: none; border-radius: 4px; font-size: 14px;">
            Download Receipt PDF
          </a>
        </div>
        <p style="color: #8A9499; font-size: 12px;">If you have any questions, please contact us at info@elevay.com</p>
        `
      ),
    });
    return { success: true, message: `Receipt sent to ${clientEmail}` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[EmailService] Failed to send receipt to client:", msg);
    return { success: false, message: `Failed to send email: ${msg}` };
  }
}

export async function notifyNewContract(
  contractCode: string,
  clientName: string,
  familyMembers: number,
  contractValue: number
): Promise<void> {
  try {
    const plain = `New contract issued.\n\nClient: ${clientName}\nContract Code: ${contractCode}\nFamily Members: ${familyMembers}\nContract Value: €${contractValue.toLocaleString("en-US")}`;
    const html = `
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Contract Code</td><td style="padding:6px 0; color:#2C3A40;">${contractCode}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Family Members</td><td style="padding:6px 0; color:#2C3A40;">${familyMembers}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Contract Value</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">€${contractValue.toLocaleString("en-US")}</td></tr>
      </table>`;
    await notifyTeam(`New Contract Issued: ${contractCode}`, html, plain);
  } catch (error) {
    console.error("[EmailService] Failed to send new contract notification:", error);
  }
}

export async function notifyContractStatusChange(
  contractCode: string,
  clientName: string,
  status: string
): Promise<void> {
  try {
    const statusLabel = status === "signed" ? "✅ Signed" : "❌ Cancelled";
    const plain = `Contract status updated.\n\nClient: ${clientName}\nContract Code: ${contractCode}\nNew Status: ${statusLabel}`;
    const html = `
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Contract Code</td><td style="padding:6px 0; color:#2C3A40;">${contractCode}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">New Status</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">${statusLabel}</td></tr>
      </table>`;
    await notifyTeam(`Contract ${statusLabel}: ${contractCode}`, html, plain);
  } catch (error) {
    console.error("[EmailService] Failed to send status change notification:", error);
  }
}

export async function notifyReceiptPaid(
  receiptCode: string,
  contractCode: string,
  clientName: string,
  amountEur: number,
  remainingBalance: number
): Promise<void> {
  try {
    const plain = `Receipt marked as paid.\n\nClient: ${clientName}\nReceipt Code: ${receiptCode}\nContract Code: ${contractCode}\nAmount Paid: €${amountEur.toLocaleString("en-US")}\nRemaining Balance: €${remainingBalance.toLocaleString("en-US")}`;
    const html = `
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Receipt Code</td><td style="padding:6px 0; color:#2C3A40;">${receiptCode}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Contract Code</td><td style="padding:6px 0; color:#2C3A40;">${contractCode}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Amount Paid</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">€${amountEur.toLocaleString("en-US")}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Remaining Balance</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">€${remainingBalance.toLocaleString("en-US")}</td></tr>
      </table>`;
    await notifyTeam(`Receipt Paid: ${receiptCode}`, html, plain);
  } catch (error) {
    console.error("[EmailService] Failed to send receipt paid notification:", error);
  }
}

// Keep old name as alias for backward compatibility
export const notifyInvoicePaid = notifyReceiptPaid;

import { notifyOwner } from "./_core/notification";
import nodemailer from "nodemailer";

// Team emails that receive ALL transaction notifications via SMTP
const TEAM_EMAILS = [
  "Mahmoud.saber@elevay.com",
  "fouad.abdo@elevay.com",
  "kirlos.nabil@elevay.com",
  "ziad.elshurafa@elevay.com",
  "madonna.adel@elevay.com",
  "monica.sobhy@elevay.com",
  "marina.kamel@elevay.com",
];

// Mahmoud's email — receives contract/receipt/proforma notifications
export const MAHMOUD_EMAILS = [
  "Mahmoud.saber@elevay.com",
];

// CC address for all paralegal/reminder emails
export const MAHMOUD_CC = "Mahmoud.saber@elevay.com";

// Map from display name → email for targeted per-case reminders
export const TEAM_EMAIL_MAP: Record<string, string> = {
  // Owner
  "Mahmoud Saber": "Mahmoud.saber@elevay.com",
  // Consultants
  "Fouad Abdo": "fouad.abdo@elevay.com",
  "Kirolos Nabil": "kirlos.nabil@elevay.com",
  "Ziad El Shurafa": "ziad.elshurafa@elevay.com",
  // Paralegals / Support
  "Madonna Adel": "madonna.adel@elevay.com",
  "Monica Sobhy": "monica.sobhy@elevay.com",
  "Nouran Mamdouh": "nouran.Mamdouh@elevay.com",
  "Hager Hany": "hager.hany@elevay.com",  // correct spelling
  "Marwa Abdallah": "marwa.abdallah@elevay.com",
  "Basmala Shereef": "basmala.shereef@elevay.com",
  "Eman Ahmed": "eman.ahmed@elevay.com",
  // Legacy short-name aliases (keep for backward compatibility)
  Mahmoud: "Mahmoud.saber@elevay.com",
  Fouad: "fouad.abdo@elevay.com",
  Kirolos: "kirlos.nabil@elevay.com",
  Ziad: "ziad.elshurafa@elevay.com",
  Madonna: "madonna.adel@elevay.com",
  Monica: "monica.sobhy@elevay.com",
  Marina: "marina.kamel@elevay.com",
  Nouran: "nouran.Mamdouh@elevay.com",
  Hagar: "hager.hany@elevay.com",  // legacy alias for old spelling
};

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
 * Send an HTML notification email to Mahmoud's two addresses only.
 * Used for contract/receipt/proforma events.
 */
async function notifyMahmoud(title: string, htmlContent: string, plainText: string): Promise<void> {
  const transporter = createTransporter();
  if (transporter) {
    const gmailUser = process.env.GMAIL_USER!;
    try {
      await transporter.sendMail({
        from: `"ELEVAY System" <${gmailUser}>`,
        to: MAHMOUD_EMAILS.join(", "),
        subject: `[ELEVAY] ${title}`,
        html: wrapInEmailTemplate(title, htmlContent),
        text: plainText,
      });
      console.log(`[EmailService] Mahmoud notification sent: "${title}"`);
    } catch (err) {
      console.error("[EmailService] Failed to send Mahmoud notification via SMTP:", err);
      await notifyOwner({ title, content: plainText }).catch(() => {});
    }
  } else {
    await notifyOwner({ title, content: plainText }).catch(() => {});
    console.log(`[EmailService] (no SMTP) Mahmoud notification fallback: "${title}"`);
  }
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

/**
 * Send daily lead sync summary to Mahmoud.
 * Called by the Meta sync scheduler when the daily summary check fires.
 */
export async function sendLeadSyncSummaryEmail(params: {
  date: string;
  totalNew: number;
  totalSkipped: number;
  byForm: Array<{ formName: string; newLeads: number; errors: string[] }>;
  errors: string[];
}): Promise<void> {
  const { date, totalNew, totalSkipped, byForm, errors } = params;

  const formRows = byForm
    .filter(f => f.newLeads > 0 || f.errors.length > 0)
    .map(f => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:#2C3A40;">${f.formName}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:#27AE60;font-weight:bold;text-align:center;">${f.newLeads}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:${f.errors.length > 0 ? '#C0392B' : '#8A9499'};text-align:center;">${f.errors.length > 0 ? f.errors.join(', ') : '—'}</td>
      </tr>`).join('');

  const html = `
    <p style="color:#2C3A40;font-size:14px;">Here is your daily lead sync summary for <strong>${date}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <tr style="background:#f8f9fa;">
        <th style="padding:8px;text-align:left;color:#5E6A71;font-weight:600;">Form</th>
        <th style="padding:8px;text-align:center;color:#5E6A71;font-weight:600;">New Leads</th>
        <th style="padding:8px;text-align:center;color:#5E6A71;font-weight:600;">Errors</th>
      </tr>
      ${formRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#8A9499;">No new leads today</td></tr>'}
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:6px 0;color:#8A9499;">Total New Leads</td>
        <td style="padding:6px 0;color:#27AE60;font-weight:bold;">${totalNew}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#8A9499;">Duplicates Skipped</td>
        <td style="padding:6px 0;color:#8A9499;">${totalSkipped}</td>
      </tr>
      ${errors.length > 0 ? `<tr><td style="padding:6px 0;color:#C0392B;">Errors</td><td style="padding:6px 0;color:#C0392B;">${errors.join(', ')}</td></tr>` : ''}
    </table>
  `;

  const plain = `Daily Lead Sync Summary — ${date}\n\nTotal New Leads: ${totalNew}\nDuplicates Skipped: ${totalSkipped}\n${errors.length > 0 ? 'Errors: ' + errors.join(', ') + '\n' : ''}\nBreakdown by form:\n${byForm.map(f => `  ${f.formName}: ${f.newLeads} new`).join('\n')}`;

  await notifyMahmoud(`Daily Lead Sync Summary — ${date}`, html, plain);
}

/** Send immediate alert when Meta sync brings in new leads — to Mahmoud + Nouran */
export async function sendMetaLeadAlert(params: {
  integrationName: string;
  formResults: Array<{ formName: string; newLeads: number }>;
  totalNew: number;
}): Promise<void> {
  const { integrationName, formResults, totalNew } = params;
  const transporter = createTransporter();
  if (!transporter) return;

  const recipients = [
    "Mahmoud.saber@elevay.com",
    "Nouran.mamdouh@elevay.com",
  ];

  const formRows = formResults
    .filter(f => f.newLeads > 0)
    .map(f => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#2C3A40;">${f.formName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#27AE60;font-weight:bold;text-align:center;">${f.newLeads}</td>
      </tr>`).join('');

  const htmlBody = `
    <p style="color:#2C3A40;font-size:15px;">
      <strong>${totalNew} new lead${totalNew !== 1 ? 's' : ''}</strong> have just been downloaded from Meta into the ELEVAY system.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <thead>
        <tr style="background:#f8f9fa;">
          <th style="padding:8px 12px;text-align:left;color:#5E6A71;font-weight:600;">Lead Form Name</th>
          <th style="padding:8px 12px;text-align:center;color:#5E6A71;font-weight:600;">New Leads</th>
        </tr>
      </thead>
      <tbody>
        ${formRows || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#8A9499;">No new leads</td></tr>'}
      </tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
      <tr>
        <td style="padding:6px 0;color:#8A9499;">Campaign / Integration</td>
        <td style="padding:6px 0;color:#2C3A40;font-weight:600;">${integrationName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#8A9499;">Total New Leads</td>
        <td style="padding:6px 0;color:#27AE60;font-weight:bold;">${totalNew}</td>
      </tr>
    </table>
  `;

  const plain = `New Meta Leads\n\nCampaign: ${integrationName}\nTotal New Leads: ${totalNew}\n\n${formResults.filter(f => f.newLeads > 0).map(f => `  ${f.formName}: ${f.newLeads} new`).join('\n')}`;

  try {
    await transporter.sendMail({
      from: `"ELEVAY System" <${process.env.GMAIL_USER}>`,
      to: recipients.join(', '),
      subject: 'New Meta Leads',
      html: wrapInEmailTemplate('New Meta Leads', htmlBody),
      text: plain,
    });
    console.log(`[EmailService] Meta lead alert sent: ${totalNew} new leads from "${integrationName}"`);
  } catch (err) {
    console.error('[emailService] sendMetaLeadAlert error:', err);
  }
}

/** Send email to a newly assigned lead owner with a deep link to the lead */
export async function sendLeadAssignmentNotification(params: {
  ownerName: string;
  ownerEmail: string;
  leadId: number;
  leadName: string;
  leadPhone?: string | null;
  leadProgram?: string | null;
  origin: string;
}): Promise<void> {
  const { ownerName, ownerEmail, leadId, leadName, leadPhone, leadProgram, origin } = params;
  const transporter = createTransporter();
  if (!transporter) return;

  const leadUrl = `${origin}/leads/${leadId}`;

  const htmlBody = `
    <p style="color:#2C3A40;font-size:15px;">Hi <strong>${ownerName}</strong>,</p>
    <p style="color:#2C3A40;font-size:15px;">A new lead has been assigned to you in the ELEVAY system.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <tr>
        <td style="padding:8px 0;color:#8A9499;width:140px;">Lead Name</td>
        <td style="padding:8px 0;color:#2C3A40;font-weight:600;">${leadName}</td>
      </tr>
      ${leadPhone ? `<tr><td style="padding:8px 0;color:#8A9499;">Phone</td><td style="padding:8px 0;color:#2C3A40;">${leadPhone}</td></tr>` : ''}
      ${leadProgram ? `<tr><td style="padding:8px 0;color:#8A9499;">Program</td><td style="padding:8px 0;color:#2C3A40;">${leadProgram}</td></tr>` : ''}
    </table>
    <div style="margin-top:24px;">
      <a href="${leadUrl}" style="display:inline-block;background:#1A3A5C;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Open Lead &rarr;</a>
    </div>
    <p style="color:#8A9499;font-size:12px;margin-top:20px;">Or copy this link: ${leadUrl}</p>
  `;

  const plain = `Hi ${ownerName},\n\nA new lead has been assigned to you.\n\nLead: ${leadName}${leadPhone ? '\nPhone: ' + leadPhone : ''}${leadProgram ? '\nProgram: ' + leadProgram : ''}\n\nOpen lead: ${leadUrl}`;

  try {
    await transporter.sendMail({
      from: `"ELEVAY System" <${process.env.GMAIL_USER}>`,
      to: ownerEmail,
      subject: `New Lead Assigned: ${leadName}`,
      html: wrapInEmailTemplate('New Lead Assigned to You', htmlBody),
      text: plain,
    });
    console.log(`[EmailService] Lead assignment notification sent to ${ownerEmail} for lead #${leadId}`);
  } catch (err) {
    console.error('[emailService] sendLeadAssignmentNotification error:', err);
  }
}

/** Send weekly backup confirmation email to Mahmoud */
export async function sendBackupNotification(params: {
  date: string;
  filename: string;
  driveLink: string;
  sizeKb: number;
  tables: { name: string; rows: number }[];
  success: boolean;
  error?: string;
}): Promise<void> {
  const tableRows = params.tables
    .map(t => `<tr><td style="padding:4px 12px;border:1px solid #ddd">${t.name}</td><td style="padding:4px 12px;border:1px solid #ddd;text-align:right">${t.rows.toLocaleString()}</td></tr>`)
    .join("");
  const html = params.success
    ? `<p>Your weekly ELEVAY system backup was completed on <strong>${params.date}</strong>.</p>
       <p>📁 <strong>File:</strong> ${params.filename}<br/>
       📦 <strong>Size:</strong> ${params.sizeKb.toLocaleString()} KB<br/>
       🔗 <strong>Google Drive:</strong> <a href="${params.driveLink}" style="color:#1a73e8">Open Backup File</a></p>
       <table style="border-collapse:collapse;margin-top:16px;font-size:13px">
         <thead><tr>
           <th style="padding:6px 12px;border:1px solid #ddd;background:#f5f5f5;text-align:left">Table</th>
           <th style="padding:6px 12px;border:1px solid #ddd;background:#f5f5f5;text-align:right">Records</th>
         </tr></thead>
         <tbody>${tableRows}</tbody>
       </table>
       <p style="margin-top:16px;color:#666;font-size:12px">Next backup: next Friday at 08:00 Cairo time.</p>`
    : `<p style="color:#c0392b">⚠️ The weekly backup scheduled for <strong>${params.date}</strong> <strong>failed</strong>.</p>
       <p><strong>Error:</strong> ${params.error ?? "Unknown error"}</p>
       <p>Please run a manual backup from the Security &amp; Audit page.</p>`;
  const subject = params.success
    ? `Weekly Backup Complete \u2014 ${params.date}`
    : `Weekly Backup Failed \u2014 ${params.date}`;
  const plain = params.success
    ? `Weekly backup complete. File: ${params.filename} (${params.sizeKb} KB). Drive: ${params.driveLink}`
    : `Weekly backup FAILED: ${params.error}`;
  await notifyMahmoud(subject, html, plain);
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
    await notifyMahmoud(`New Contract Issued: ${contractCode}`, html, plain);
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
    await notifyMahmoud(`Contract ${statusLabel}: ${contractCode}`, html, plain);
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
    await notifyMahmoud(`Receipt Paid: ${receiptCode}`, html, plain);
  } catch (error) {
    console.error("[EmailService] Failed to send receipt paid notification:", error);
  }
}

// Keep old name as alias for backward compatibility
export const notifyInvoicePaid = notifyReceiptPaid;

/**
 * Notify Mahmoud when a new invoice/receipt is created.
 */
export async function notifyNewInvoice(
  invoiceCode: string,
  contractCode: string,
  clientName: string,
  amountEur: number,
  remainingBalance: number
): Promise<void> {
  try {
    const plain = `New invoice created.\n\nClient: ${clientName}\nInvoice Code: ${invoiceCode}\nContract Code: ${contractCode}\nAmount: €${amountEur.toLocaleString("en-US")}\nRemaining Balance: €${remainingBalance.toLocaleString("en-US")}`;
    const html = `
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Invoice Code</td><td style="padding:6px 0; color:#2C3A40;">${invoiceCode}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Contract Code</td><td style="padding:6px 0; color:#2C3A40;">${contractCode}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Amount</td><td style="padding:6px 0; color:#27AE60; font-weight:bold;">€${amountEur.toLocaleString("en-US")}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Remaining Balance</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">€${remainingBalance.toLocaleString("en-US")}</td></tr>
      </table>`;
    await notifyMahmoud(`New Invoice Created: ${invoiceCode}`, html, plain);
  } catch (error) {
    console.error("[EmailService] Failed to send new invoice notification:", error);
  }
}

/**
 * Notify Mahmoud when a new Finance client record is added (auto-create or manual).
 */
export async function notifyFinClientAdded(
  clientName: string,
  clientCode: string | undefined,
  consultant: string | undefined,
  contractValueEur: number,
  source: "auto" | "manual"
): Promise<void> {
  try {
    const sourceLabel = source === "auto" ? "Auto-created from paid receipt" : "Manually added";
    const plain = `New Finance client added.\n\nClient: ${clientName}\nClient Code: ${clientCode ?? "—"}\nConsultant: ${consultant ?? "—"}\nContract Value: €${contractValueEur.toLocaleString("en-US")}\nSource: ${sourceLabel}`;
    const html = `
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Client Code</td><td style="padding:6px 0; color:#2C3A40;">${clientCode ?? "—"}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Contract Value</td><td style="padding:6px 0; color:#27AE60; font-weight:bold;">€${contractValueEur.toLocaleString("en-US")}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Source</td><td style="padding:6px 0; color:#5E6A71;">${sourceLabel}</td></tr>
      </table>`;
    await notifyTeam(`New Finance Client Added: ${clientName}`, html, plain);
  } catch (error) {
    console.error("[EmailService] Failed to send finance client notification:", error);
  }
}

/**
 * Send a document reminder to the paralegal AND consultant assigned to a client case.
 * Falls back to notifyTeam (all team) if specific emails are not found.
 */
export async function sendDocReminderToAssignedTeam(
  clientName: string,
  paralegal: string | null,
  consultant: string | null,
  subject: string,
  htmlBody: string,
  plainText: string
): Promise<void> {
  // Always include Mahmoud as a guaranteed recipient for all reminders
  const recipients: string[] = ["Mahmoud.saber@elevay.com"];
  if (paralegal && TEAM_EMAIL_MAP[paralegal]) recipients.push(TEAM_EMAIL_MAP[paralegal]);
  if (consultant && TEAM_EMAIL_MAP[consultant] && TEAM_EMAIL_MAP[consultant] !== "Mahmoud.saber@elevay.com") {
    recipients.push(TEAM_EMAIL_MAP[consultant]);
  }
  // Deduplicate
  const toList = Array.from(new Set(recipients));
  const transporter = createTransporter();
  if (transporter) {
    const gmailUser = process.env.GMAIL_USER!;
    try {
      await transporter.sendMail({
        from: `"ELEVAY System" <${gmailUser}>`,
        to: toList.join(", "),
        cc: MAHMOUD_CC,
        subject: `[ELEVAY] ${subject}`,
        html: wrapInEmailTemplate(subject, htmlBody),
        text: plainText,
      });
      console.log(`[EmailService] Doc reminder sent to ${toList.join(", ")} (CC: ${MAHMOUD_CC}) for client: ${clientName}`);
    } catch (err) {
      console.error("[EmailService] Failed to send doc reminder:", err);
      await notifyOwner({ title: subject, content: plainText }).catch(() => {});
    }
  } else {
    await notifyOwner({ title: subject, content: plainText }).catch(() => {});
    console.log(`[EmailService] (no SMTP) Doc reminder fallback for: ${clientName}`);
  }
}

/**
 * Notify the assigned paralegal and consultant when a new client case is created.
 */
export async function notifyNewClientAssigned(
  clientName: string,
  clientCode: string,
  applicationType: string,
  maritalStatus: string,
  paralegal: string | null,
  consultant: string | null,
): Promise<void> {
  // Always include Mahmoud as the primary recipient so the email is guaranteed
  // to be delivered even when no paralegal or consultant is assigned.
  const recipients: string[] = ["Mahmoud.saber@elevay.com"];
  if (paralegal && TEAM_EMAIL_MAP[paralegal]) recipients.push(TEAM_EMAIL_MAP[paralegal]);
  if (consultant && TEAM_EMAIL_MAP[consultant] && TEAM_EMAIL_MAP[consultant] !== "Mahmoud.saber@elevay.com") {
    recipients.push(TEAM_EMAIL_MAP[consultant]);
  }
  const toList = Array.from(new Set(recipients));
  const appTypeLabel = applicationType === 'freelancer' ? 'Freelancer' : 'Business Owner';
  const maritalLabel = maritalStatus === 'family' ? 'Family' : 'Single';
  const subject = `📋 New Client Assigned — ${clientName}`;
  const html = `
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tr><td style="padding:6px 0; color:#8A9499;">Client Name</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
      <tr><td style="padding:6px 0; color:#8A9499;">Client Code</td><td style="padding:6px 0; color:#2C3A40;">${clientCode}</td></tr>
      <tr><td style="padding:6px 0; color:#8A9499;">Application Type</td><td style="padding:6px 0; color:#2C3A40;">${appTypeLabel}</td></tr>
      <tr><td style="padding:6px 0; color:#8A9499;">Marital Status</td><td style="padding:6px 0; color:#2C3A40;">${maritalLabel}</td></tr>
      <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? '—'}</td></tr>
      <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? '—'}</td></tr>
    </table>
    <p style="color:#5E6A71; margin-top:16px; font-size:13px;">A new client case has been created and assigned to you. Please log in to the Elevay system to review the document checklist.</p>`;
  const plain = `New Client Assigned\n\nClient: ${clientName}\nCode: ${clientCode}\nType: ${appTypeLabel}\nStatus: ${maritalLabel}\nParalegal: ${paralegal ?? '—'}\nConsultant: ${consultant ?? '—'}`;
  const transporter = createTransporter();
  if (transporter && toList.length > 0) {
    const gmailUser = process.env.GMAIL_USER!;
    try {
      await transporter.sendMail({
        from: `"ELEVAY System" <${gmailUser}>`,
        to: toList.join(', '),
        subject: `[ELEVAY] ${subject}`,
        html: wrapInEmailTemplate(subject, html),
        text: plain,
      });
      console.log(`[EmailService] New client notification sent to ${toList.join(', ')} (CC: ${MAHMOUD_CC}) for: ${clientName}`);
    } catch (err) {
      console.error('[EmailService] Failed to send new client notification:', err);
      await notifyOwner({ title: subject, content: plain }).catch(() => {});
    }
  } else {
    await notifyOwner({ title: subject, content: plain }).catch(() => {});
  }
}

// ─── Financial Transaction Notifications ────────────────────────────────────

const FIN_NOTIFICATION_RECIPIENTS = [
  "Mahmoud.saber@elevay.com",
  "ziad.elshurafa@elevay.com",
];

/**
 * Send a financial transaction notification to Mahmoud & Ziad.
 */
export async function notifyFinancialTransaction(
  type: "income" | "expense" | "transfer",
  description: string,
  amount: number,
  currency: string,
  accountName: string,
  categoryName?: string,
  toAccountName?: string,
): Promise<void> {
  try {
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    const plain = `New ${typeLabel} Transaction\n\nDescription: ${description}\nAmount: ${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}\nAccount: ${accountName}${categoryName ? `\nCategory: ${categoryName}` : ""}${toAccountName ? `\nTo Account: ${toAccountName}` : ""}`;
    const html = `
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:6px 0; color:#8A9499;">Type</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${typeLabel}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Description</td><td style="padding:6px 0; color:#2C3A40;">${description}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Amount</td><td style="padding:6px 0; color:${type === "income" ? "#27AE60" : "#C0392B"}; font-weight:bold;">${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:6px 0; color:#8A9499;">Account</td><td style="padding:6px 0; color:#2C3A40;">${accountName}</td></tr>
        ${categoryName ? `<tr><td style="padding:6px 0; color:#8A9499;">Category</td><td style="padding:6px 0; color:#2C3A40;">${categoryName}</td></tr>` : ""}
        ${toAccountName ? `<tr><td style="padding:6px 0; color:#8A9499;">To Account</td><td style="padding:6px 0; color:#2C3A40;">${toAccountName}</td></tr>` : ""}
      </table>`;

    const transporter = createTransporter();
    if (transporter) {
      const gmailUser = process.env.GMAIL_USER!;
      await transporter.sendMail({
        from: `"ELEVAY Finance" <${gmailUser}>`,
        to: FIN_NOTIFICATION_RECIPIENTS.join(", "),
        subject: `[ELEVAY Finance] ${typeLabel}: ${description}`,
        html: wrapInEmailTemplate(`${typeLabel} Transaction`, html),
        text: plain,
      });
      console.log(`[EmailService] Financial notification sent: ${typeLabel} - ${description}`);
    } else {
      await notifyOwner({ title: `${typeLabel}: ${description}`, content: plain }).catch(() => {});
      console.log(`[EmailService] (no SMTP) Financial notification fallback: ${description}`);
    }
  } catch (error) {
    console.error("[EmailService] Failed to send financial notification:", error);
  }
}

/**
 * Send monthly financial summary email to Mahmoud & Ziad.
 */
export async function sendMonthlyFinancialSummary(
  month: string,
  year: number,
  totalIncome: number,
  totalExpense: number,
  profit: number,
  topExpenses: { category: string; amount: number }[],
): Promise<void> {
  try {
    const plain = `Monthly Financial Summary - ${month} ${year}\n\nTotal Income: EGP ${totalIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}\nTotal Expense: EGP ${totalExpense.toLocaleString("en-US", { minimumFractionDigits: 2 })}\nProfit: EGP ${profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const topExpenseRows = topExpenses.map(e =>
      `<tr><td style="padding:4px 8px; border-bottom:1px solid #eee;">${e.category}</td><td style="padding:4px 8px; border-bottom:1px solid #eee; text-align:right; color:#C0392B;">EGP ${e.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>`
    ).join("");
    const html = `
      <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:16px;">
        <tr><td style="padding:8px 0; color:#8A9499;">Total Income</td><td style="padding:8px 0; color:#27AE60; font-weight:bold; font-size:16px;">EGP ${totalIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:8px 0; color:#8A9499;">Total Expense</td><td style="padding:8px 0; color:#C0392B; font-weight:bold; font-size:16px;">EGP ${totalExpense.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:8px 0; color:#8A9499;">Profit</td><td style="padding:8px 0; color:${profit >= 0 ? "#27AE60" : "#C0392B"}; font-weight:bold; font-size:16px;">EGP ${profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
      </table>
      ${topExpenses.length > 0 ? `
        <h3 style="color:#2C3A40; font-size:14px; margin:16px 0 8px;">Top Expense Categories</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr style="background:#f5f5f5;"><th style="padding:6px 8px; text-align:left;">Category</th><th style="padding:6px 8px; text-align:right;">Amount</th></tr>
          ${topExpenseRows}
        </table>` : ""}`;

    const transporter = createTransporter();
    if (transporter) {
      const gmailUser = process.env.GMAIL_USER!;
      await transporter.sendMail({
        from: `"ELEVAY Finance" <${gmailUser}>`,
        to: FIN_NOTIFICATION_RECIPIENTS.join(", "),
        subject: `[ELEVAY Finance] Monthly Summary - ${month} ${year}`,
        html: wrapInEmailTemplate(`Monthly Financial Summary - ${month} ${year}`, html),
        text: plain,
      });
      console.log(`[EmailService] Monthly summary sent for ${month} ${year}`);
    } else {
      await notifyOwner({ title: `Monthly Summary - ${month} ${year}`, content: plain }).catch(() => {});
    }
  } catch (error) {
    console.error("[EmailService] Failed to send monthly summary:", error);
  }
}

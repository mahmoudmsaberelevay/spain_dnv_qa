import nodemailer from "nodemailer";
import { db } from "./db";

// Team email mapping
export const TEAM_EMAIL_MAP: Record<string, string> = {
  "Mahmoud Saber": "mahmoud.saber@elevay.com",
  "Madonna Adel": "madonna.adel@elevay.com",
  "Monica Sobhy": "monica.sobhy@elevay.com",
  "Marina Kamel": "marina.kamel@elevay.com",
  "Fouad Abdo": "fouad.abdo@elevay.com",
  "Kirolos Nabil": "kirlos.nabil@elevay.com",
  "Ziad Elshurafa": "ziad.elshurafa@elevay.com",
};

export const MAHMOUD_EMAILS = ["mahmoud.saber@elevay.com", "mahmoud.saberelevay@gmail.com"];

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER || "",
    pass: process.env.GMAIL_APP_PASSWORD || "",
  },
});

// Send email helper
async function sendEmail(to: string | string[], subject: string, html: string) {
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER || "noreply@elevay.com",
      to: Array.isArray(to) ? to.join(",") : to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
}

// Contract notifications
export async function notifyNewContract(contractId: string, contractName: string, clientName: string) {
  const html = `
    <h2>New Contract Created</h2>
    <p><strong>Contract:</strong> ${contractName}</p>
    <p><strong>Client:</strong> ${clientName}</p>
    <p><strong>ID:</strong> ${contractId}</p>
  `;
  return sendEmail(MAHMOUD_EMAILS, "New Contract Created", html);
}

export async function notifyContractStatusChange(contractId: string, contractName: string, status: string) {
  const html = `
    <h2>Contract Status Changed</h2>
    <p><strong>Contract:</strong> ${contractName}</p>
    <p><strong>New Status:</strong> ${status}</p>
    <p><strong>ID:</strong> ${contractId}</p>
  `;
  return sendEmail(MAHMOUD_EMAILS, "Contract Status Changed", html);
}

export async function notifyReceiptPaid(receiptId: string, receiptName: string, amount: number) {
  const html = `
    <h2>Receipt Marked as Paid</h2>
    <p><strong>Receipt:</strong> ${receiptName}</p>
    <p><strong>Amount:</strong> EGP ${amount.toLocaleString()}</p>
    <p><strong>ID:</strong> ${receiptId}</p>
  `;
  return sendEmail(MAHMOUD_EMAILS, "Receipt Marked as Paid", html);
}

export async function sendReceiptToClient(clientEmail: string, receiptName: string, receiptUrl: string) {
  const html = `
    <h2>Your Receipt</h2>
    <p><strong>Receipt:</strong> ${receiptName}</p>
    <p><a href="${receiptUrl}">Download Receipt</a></p>
  `;
  return sendEmail(clientEmail, "Your Receipt", html);
}

export async function notifyNewInvoice(invoiceId: string, invoiceName: string, clientName: string) {
  const html = `
    <h2>New Invoice Created</h2>
    <p><strong>Invoice:</strong> ${invoiceName}</p>
    <p><strong>Client:</strong> ${clientName}</p>
    <p><strong>ID:</strong> ${invoiceId}</p>
  `;
  return sendEmail(MAHMOUD_EMAILS, "New Invoice Created", html);
}

export async function notifyFinClientAdded(clientCode: string, clientName: string, program: string) {
  const html = `
    <h2>New Financial Client Added</h2>
    <p><strong>Code:</strong> ${clientCode}</p>
    <p><strong>Name:</strong> ${clientName}</p>
    <p><strong>Program:</strong> ${program}</p>
  `;
  return sendEmail(MAHMOUD_EMAILS, "New Financial Client Added", html);
}

export async function notifyNewClientAssigned(clientName: string, assignedTo: string) {
  const html = `
    <h2>New Client Assigned</h2>
    <p><strong>Client:</strong> ${clientName}</p>
    <p><strong>Assigned To:</strong> ${assignedTo}</p>
  `;
  return sendEmail(MAHMOUD_EMAILS, "New Client Assigned", html);
}

// Document reminders
export async function sendDocReminderToAssignedTeam(
  clientName: string,
  paralegal: string | null,
  consultant: string | null,
  reminderType: string,
  details: string
) {
  const emails: string[] = [];
  
  if (paralegal && TEAM_EMAIL_MAP[paralegal]) {
    emails.push(TEAM_EMAIL_MAP[paralegal]);
  }
  if (consultant && TEAM_EMAIL_MAP[consultant]) {
    emails.push(TEAM_EMAIL_MAP[consultant]);
  }

  if (emails.length === 0) {
    emails.push(...MAHMOUD_EMAILS);
  }

  const html = `
    <h2>${reminderType}</h2>
    <p><strong>Client:</strong> ${clientName}</p>
    <p>${details}</p>
  `;
  
  return sendEmail(emails, reminderType, html);
}

// Lead notifications
export async function sendLeadAssignmentNotification(opts: {
  ownerName: string;
  ownerEmail: string;
  leadId: number;
  leadName: string;
  leadPhone?: string | null;
  leadProgram?: string | null;
  origin?: string;
}) {
  const { ownerName, ownerEmail, leadId, leadName, leadPhone, leadProgram, origin } = opts;
  const leadUrl = origin ? `${origin}/leads?id=${leadId}` : '';
  const html = `
    <h2>New Lead Assigned to You</h2>
    <p><strong>Lead:</strong> ${leadName}</p>
    ${leadPhone ? `<p><strong>Phone:</strong> ${leadPhone}</p>` : ''}
    ${leadProgram ? `<p><strong>Program:</strong> ${leadProgram}</p>` : ''}
    <p><strong>Assigned To:</strong> ${ownerName}</p>
    ${leadUrl ? `<p><a href="${leadUrl}">View Lead</a></p>` : ''}
  `;
  return sendEmail(ownerEmail, "New Lead Assigned", html);
}

// Meta lead sync notifications
export async function sendLeadSyncSummaryEmail(summary: {
  date: string;
  totalNew: number;
  totalSkipped: number;
  byForm: Array<{ formName: string; newLeads: number; errors: string[] }>;
  errors: string[];
}) {
  const formRows = summary.byForm
    .map(f => `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${f.formName}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${f.newLeads}</td><td style="padding:4px 8px;border:1px solid #ddd;">${f.errors.length ? f.errors.join('<br>') : '—'}</td></tr>`)
    .join('');
  const html = `
    <h2>Meta Lead Sync — Daily Summary</h2>
    <p><strong>Date:</strong> ${summary.date}</p>
    <p><strong>New Leads:</strong> ${summary.totalNew} | <strong>Duplicates Skipped:</strong> ${summary.totalSkipped}</p>
    ${summary.byForm.length ? `
    <table style="border-collapse:collapse;margin-top:12px;">
      <tr style="background:#f5f5f5;"><th style="padding:4px 8px;border:1px solid #ddd;">Form</th><th style="padding:4px 8px;border:1px solid #ddd;">New Leads</th><th style="padding:4px 8px;border:1px solid #ddd;">Errors</th></tr>
      ${formRows}
    </table>` : ''}
    ${summary.errors.length ? `<p style="color:red;margin-top:12px;"><strong>Errors:</strong><br>${summary.errors.join('<br>')}</p>` : ''}
  `;
  return sendEmail(MAHMOUD_EMAILS, "Meta Lead Sync Summary", html);
}

export async function sendMetaLeadAlert(data: {
  integrationName: string;
  formResults: Array<{ formName: string; newLeads: number; leadDetails?: Array<{ name: string; phone?: string; program?: string }> }>;
  totalNew: number;
  assignedTo?: string | null;
}) {
  // Build lead details table
  const allLeads = data.formResults.flatMap(f =>
    (f.leadDetails ?? []).map(l => ({ ...l, formName: f.formName }))
  );
  const leadRows = allLeads
    .map(l => `<tr><td style="padding:6px 10px;border:1px solid #ddd;">${l.name}</td><td style="padding:6px 10px;border:1px solid #ddd;">${l.phone || '—'}</td><td style="padding:6px 10px;border:1px solid #ddd;">${l.program || '—'}</td><td style="padding:6px 10px;border:1px solid #ddd;font-size:12px;">${l.formName}</td></tr>`)
    .join('');

  const formLines = data.formResults
    .filter(f => f.newLeads > 0)
    .map(f => `<li><strong>${f.formName}:</strong> ${f.newLeads} new lead${f.newLeads > 1 ? 's' : ''}</li>`)
    .join('');

  const html = `
    <h2>\uD83D\uDE80 Meta Lead Alert</h2>
    <p><strong>${data.totalNew} new lead${data.totalNew > 1 ? 's' : ''}</strong> just synced from <strong>${data.integrationName}</strong>!</p>
    ${formLines ? `<ul style="margin-bottom:16px;">${formLines}</ul>` : ''}
    ${leadRows ? `
    <table style="border-collapse:collapse;width:100%;margin-top:12px;">
      <tr style="background:#1a3a5c;color:#fff;"><th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Name</th><th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Phone</th><th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Program</th><th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Form</th></tr>
      ${leadRows}
    </table>` : ''}
    <p style="margin-top:16px;"><a href="https://elevay.vip/leads" style="background:#1a3a5c;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">View Leads \u2192</a></p>
  `;

  // Determine recipients: always Mahmoud + assigned consultant if configured
  const recipients = [...MAHMOUD_EMAILS];
  if (data.assignedTo && TEAM_EMAIL_MAP[data.assignedTo] && !recipients.includes(TEAM_EMAIL_MAP[data.assignedTo])) {
    recipients.push(TEAM_EMAIL_MAP[data.assignedTo]);
  }

  return sendEmail(recipients, "Meta Lead Alert", html);
}

// Backup notifications
export async function sendBackupNotification(data: {
  date: string;
  filename: string;
  driveLink: string;
  sizeKb: number;
  tables: Array<{ name: string; rows: number }>;
  success: boolean;
  error?: string;
}) {
  const { date, filename, driveLink, sizeKb, tables, success, error } = data;
  const totalRows = tables.reduce((s, t) => s + t.rows, 0);
  const tableRows = tables
    .map(t => `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${t.name}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${t.rows.toLocaleString()}</td></tr>`)
    .join('');
  const html = success
    ? `
      <h2>✅ Database Backup Complete</h2>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>File:</strong> ${filename}</p>
      <p><strong>Size:</strong> ${sizeKb} KB</p>
      <p><strong>Total Records:</strong> ${totalRows.toLocaleString()}</p>
      ${driveLink ? `<p><a href="${driveLink}">View on Google Drive</a></p>` : ''}
      ${tables.length ? `
      <table style="border-collapse:collapse;margin-top:12px;">
        <tr style="background:#f5f5f5;"><th style="padding:4px 8px;border:1px solid #ddd;">Table</th><th style="padding:4px 8px;border:1px solid #ddd;">Rows</th></tr>
        ${tableRows}
      </table>` : ''}
    `
    : `
      <h2>❌ Database Backup Failed</h2>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Error:</strong> ${error || 'Unknown error'}</p>
    `;
  return sendEmail(["mahmoud.saberelevay@gmail.com", "mahmoud.saber@elevay.com"], success ? "Database Backup Complete" : "Database Backup Failed", html);
}

// Weekly financial report
export async function sendWeeklyFinancialReport(reportHtml: string) {
  const html = `
    <h2>Weekly Financial Report</h2>
    ${reportHtml}
  `;
  return sendEmail(MAHMOUD_EMAILS, "Weekly Financial Report", html);
}

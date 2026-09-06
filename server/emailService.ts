import nodemailer from "nodemailer";
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
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
  auth: {
    user: process.env.GMAIL_USER || "",
    pass: process.env.GMAIL_APP_PASSWORD || "",
  },
});

// Send email helper
async function sendEmail(to: string | string[], subject: string, html: string) {
  try {
    const sender = process.env.SYSTEM_EMAIL_SENDER || process.env.GMAIL_USER || "";
    if (!sender || sender.toLowerCase().endsWith("@elevay.com")) {
      console.error("Email send blocked: sender must be a configured non-@elevay.com address");
      return false;
    }
    await transporter.sendMail({
      from: sender,
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
export async function sendLeadAssignmentNotification(input: {
  ownerName: string;
  ownerEmail: string;
  leadId: number;
  leadName: string;
  leadPhone?: string | null;
  leadProgram?: string | null;
  origin: string;
} | string, legacyAssignedTo?: string, legacyAssignedEmail?: string) {
  const structured = typeof input !== "string";
  const leadName = structured ? input.leadName : input;
  const assignedTo = structured ? input.ownerName : (legacyAssignedTo || "Assigned consultant");
  const assignedEmail = structured ? input.ownerEmail : (legacyAssignedEmail || "");
  const html = `
    <h2>New Lead Assigned</h2>
    <p><strong>Lead:</strong> ${leadName}</p>
    <p><strong>Assigned To:</strong> ${assignedTo}</p>
    ${structured ? `<p><strong>Phone:</strong> ${input.leadPhone || "Not provided"}</p>` : ""}
    ${structured ? `<p><strong>Program:</strong> ${input.leadProgram || "Not specified"}</p>` : ""}
    ${structured ? `<p><a href="${input.origin}/leads/${input.leadId}">Open Lead</a></p>` : ""}
  `;
  return sendEmail(assignedEmail, "New Lead Assigned", html);
}

// Meta lead sync notifications
export async function sendLeadSyncSummaryEmail(summary: string | {
  date: string;
  totalNew: number;
  totalSkipped: number;
  byForm: Array<{ formName: string; newLeads: number; errors: string[] }>;
  errors: string[];
}) {
  const summaryText = typeof summary === "string"
    ? summary
    : [
        `Date: ${summary.date}`,
        `New leads: ${summary.totalNew}`,
        `Skipped duplicates: ${summary.totalSkipped}`,
        ...summary.byForm.map(form => `${form.formName}: ${form.newLeads} new${form.errors.length ? `; ${form.errors.join(" | ")}` : ""}`),
        ...(summary.errors.length ? [`Errors: ${summary.errors.join(" | ")}`] : []),
      ].join("\n");
  const html = `
    <h2>Meta Lead Sync Summary</h2>
    <pre>${summaryText}</pre>
  `;
  return sendEmail(MAHMOUD_EMAILS, "Meta Lead Sync Summary", html);
}

export async function sendMetaLeadAlert(alert: string | {
  leadName?: string;
  phone?: string;
  assignedTo?: string | null;
  assignedEmail?: string | null;
  program?: string | null;
  campaign?: string | null;
  integrationName?: string;
  newLeadCount?: number;
  totalNew?: number;
  totalSkipped?: number;
  formsDiscovered?: number;
  errors?: string[];
  formNames?: string[];
  formResults?: Array<{ formName: string; newLeads: number; errors?: string[] }>;
}) {
  const isLegacyMessage = typeof alert === "string";
  const recipients = new Set(MAHMOUD_EMAILS);
  if (!isLegacyMessage && alert.assignedEmail) {
    recipients.add(alert.assignedEmail);
  }
  if (!isLegacyMessage && alert.assignedTo && TEAM_EMAIL_MAP[alert.assignedTo]) {
    recipients.add(TEAM_EMAIL_MAP[alert.assignedTo]);
  }
  const html = `
    <h2>Meta Lead Alert</h2>
    ${isLegacyMessage ? `<p>${alert}</p>` : `
      ${alert.leadName ? `<p><strong>Lead:</strong> ${alert.leadName}</p>` : ""}
      ${alert.phone ? `<p><strong>Phone:</strong> ${alert.phone}</p>` : ""}
      <p><strong>Assigned consultant:</strong> ${alert.assignedTo || "Unassigned"}</p>
      <p><strong>Program:</strong> ${alert.program || "Not mapped"}</p>
      <p><strong>Campaign:</strong> ${alert.campaign || "Not available"}</p>
      ${alert.integrationName ? `<p><strong>Integration:</strong> ${alert.integrationName}</p>` : ""}
      ${typeof alert.newLeadCount === "number" ? `<p><strong>New leads:</strong> ${alert.newLeadCount}</p>` : ""}
      ${typeof alert.totalNew === "number" ? `<p><strong>New leads:</strong> ${alert.totalNew}</p>` : ""}
      ${typeof alert.totalSkipped === "number" ? `<p><strong>Skipped duplicates:</strong> ${alert.totalSkipped}</p>` : ""}
      ${typeof alert.formsDiscovered === "number" ? `<p><strong>Forms discovered:</strong> ${alert.formsDiscovered}</p>` : ""}
      ${alert.errors?.length ? `<p><strong>Errors:</strong> ${alert.errors.join(" | ")}</p>` : ""}
      ${alert.formNames?.length ? `<p><strong>Forms:</strong> ${alert.formNames.join(", ")}</p>` : ""}
      ${alert.formResults?.length ? `<p><strong>Forms:</strong> ${alert.formResults.map(form => `${form.formName} (${form.newLeads})`).join(", ")}</p>` : ""}
    `}
  `;
  return sendEmail(Array.from(recipients), "Meta Lead Alert", html);
}

export async function sendMetaOperationalAlert(input: {
  safeCode: string;
  summary: string;
  leadId?: number | null;
}) {
  const html = `
    <h2>Meta Leads Operational Alert</h2>
    <p><strong>Code:</strong> ${input.safeCode}</p>
    <p>${input.summary}</p>
    ${input.leadId ? `<p><a href="https://elevay.vip/leads/${input.leadId}">Open Lead</a></p>` : ""}
  `;
  return sendEmail(MAHMOUD_EMAILS, `Meta Leads Alert: ${input.safeCode}`, html);
}

// Backup notifications
export async function sendBackupNotification(backupName: string, downloadUrl: string, backupSize: string) {
  const html = `
    <h2>Database Backup Complete</h2>
    <p><strong>Backup:</strong> ${backupName}</p>
    <p><strong>Size:</strong> ${backupSize}</p>
    <p><a href="${downloadUrl}">Download Backup</a></p>
    <p style="color: #999; font-size: 12px;">This backup will be available for 30 days.</p>
  `;
  return sendEmail(["mahmoud.saberelevay@gmail.com", "mahmoud.saber@elevay.com"], "Database Backup Complete", html);
}

// Weekly financial report
export async function sendWeeklyFinancialReport(reportHtml: string) {
  const html = `
    <h2>Weekly Financial Report</h2>
    ${reportHtml}
  `;
  return sendEmail(MAHMOUD_EMAILS, "Weekly Financial Report", html);
}

/**
 * Reminder Scheduler — runs daily and sends targeted email reminders
 * to the paralegal AND consultant assigned to each client case.
 *
 * Reminder types:
 * 1. Schengen visa expiry — 30 days before schengenExpiryDate
 * 2. Schengen visa expiry — 20 days before schengenExpiryDate
 * 3. Embassy attestation email follow-up — 15 days after embassyEmailDate
 * 4. Document expiry — 30 days before a received document expires
 * 5. Submission deadline — 12 days before expectedSubmissionDate
 */

import { getAllClientCasesForReminders, getAllClientDocumentsForReminders, getUnpaidReceiptsOlderThanDays } from "./db";
import { sendDocReminderToAssignedTeam, MAHMOUD_EMAILS, TEAM_EMAIL_MAP } from "./emailService";
import nodemailer from "nodemailer";
import { isAllowedSystemEmailSender, mergeSystemNotificationRecipients } from "./systemNotificationRecipients";

const MAHMOUD_CC = "Mahmoud.saber@elevay.com";

function createTransporter() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass || !isAllowedSystemEmailSender(gmailUser)) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
}

function wrapEmail(title: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;"><div style="background:#5E6A71;padding:20px 24px;"><h1 style="color:white;margin:0;font-size:20px;">ELEVAY</h1><p style="color:#ccc;margin:4px 0 0;font-size:11px;">RESIDENCY BY INVESTMENT</p></div><div style="padding:24px;"><h2 style="color:#2C3A40;margin-top:0;">${title}</h2>${body}</div><div style="background:#F0F2F3;padding:14px 24px;text-align:center;"><p style="color:#8A9499;font-size:11px;margin:0;">ELEVAY — Residency by Investment | Cairo, Egypt &amp; Dubai, UAE</p></div></div>`;
}

async function sendToMahmoud(subject: string, html: string, plain: string): Promise<void> {
  const transporter = createTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"ELEVAY System" <${process.env.GMAIL_USER}>`,
        to: mergeSystemNotificationRecipients(MAHMOUD_EMAILS).join(", "),
        subject: `[ELEVAY] ${subject}`,
        html: wrapEmail(subject, html),
        text: plain,
      });
      console.log(`[ReminderScheduler] Sent to Mahmoud: ${subject}`);
    } catch (err) {
      console.error("[ReminderScheduler] Failed to send to Mahmoud:", err);
    }
  } else {
    console.log(`[ReminderScheduler] (no SMTP) Would send to Mahmoud: ${subject}`);
  }
}

function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function daysSince(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export async function runReminderCheck(): Promise<void> {
  try {
    const cases = await getAllClientCasesForReminders();
    const allDocs = await getAllClientDocumentsForReminders();

    for (const c of cases) {
      const paralegal = c.paralegal ?? null;
      const consultant = c.consultant ?? null;
      const clientName = c.clientName;

      // ── 1. Schengen visa expiry reminder — 30 days before ─────────────────
      const schengenExpiry = (c as any).schengenExpiryDate;
      const daysToSchengenExpiry = daysUntil(schengenExpiry);
      if (daysToSchengenExpiry !== null && daysToSchengenExpiry === 30) {
        const subject = `⚠️ Schengen Visa Expiry in 30 Days — ${clientName}`;
        const html = `
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Schengen Visa Expiry</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">${formatDate(schengenExpiry)}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Days Remaining</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">30 days</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? "—"}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
          </table>
          <p style="color:#C0392B; margin-top:16px; font-size:13px;">⚠️ The client's Schengen visa expires in 30 days. Please ensure the application is submitted or the visa is renewed before expiry.</p>`;
        const plain = `Schengen Visa Expiry Reminder (30 days)\n\nClient: ${clientName}\nExpiry: ${formatDate(schengenExpiry)}\nDays Remaining: 30\nParalegal: ${paralegal ?? "—"}\nConsultant: ${consultant ?? "—"}`;
        await sendDocReminderToAssignedTeam(clientName, paralegal, consultant, subject, html, plain);
      }

      // ── 2. Schengen visa expiry reminder — 20 days before ─────────────────
      if (daysToSchengenExpiry !== null && daysToSchengenExpiry === 20) {
        const subject = `🚨 Schengen Visa Expiry in 20 Days — ${clientName}`;
        const html = `
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Schengen Visa Expiry</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">${formatDate(schengenExpiry)}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Days Remaining</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">20 days — URGENT</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? "—"}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
          </table>
          <p style="color:#C0392B; margin-top:16px; font-size:13px;">🚨 URGENT: The client's Schengen visa expires in only 20 days. Immediate action is required.</p>`;
        const plain = `URGENT: Schengen Visa Expiry Reminder (20 days)\n\nClient: ${clientName}\nExpiry: ${formatDate(schengenExpiry)}\nDays Remaining: 20 — URGENT\nParalegal: ${paralegal ?? "—"}\nConsultant: ${consultant ?? "—"}`;
        await sendDocReminderToAssignedTeam(clientName, paralegal, consultant, subject, html, plain);
      }

      // ── 3. Embassy attestation email follow-up — 15 days after ────────────
      const embassyEmailDate = (c as any).embassyEmailDate;
      const daysSinceEmbassyEmail = daysSince(embassyEmailDate);
      if (daysSinceEmbassyEmail !== null && daysSinceEmbassyEmail === 15) {
        const subject = `📬 Embassy Attestation Follow-Up — ${clientName}`;
        const html = `
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Embassy Email Sent</td><td style="padding:6px 0; color:#2C3A40;">${formatDate(embassyEmailDate)}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Days Since Email</td><td style="padding:6px 0; color:#E67E22; font-weight:bold;">15 days</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? "—"}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
          </table>
          <p style="color:#E67E22; margin-top:16px; font-size:13px;">📬 It has been 15 days since the Embassy Attestation email was sent for this client. Please follow up if no response has been received.</p>`;
        const plain = `Embassy Attestation Follow-Up Reminder\n\nClient: ${clientName}\nEmbassy Email Sent: ${formatDate(embassyEmailDate)}\nDays Since Email: 15\nParalegal: ${paralegal ?? "—"}\nConsultant: ${consultant ?? "—"}`;
        await sendDocReminderToAssignedTeam(clientName, paralegal, consultant, subject, html, plain);
      }

      // ── 4. Submission deadline reminder (12 days before) ─────────────────
      const daysToSubmission = daysUntil(c.expectedSubmissionDate);
      if (daysToSubmission !== null && daysToSubmission === 12) {
        const subject = `📅 Submission Deadline in 12 Days — ${clientName} (${(c as any).clientCode})`;
        const html = `
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Client Code</td><td style="padding:6px 0; color:#2C3A40;">${(c as any).clientCode}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Submission Date</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">${formatDate(c.expectedSubmissionDate)}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Days Remaining</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">12 days</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? "—"}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
          </table>
          <p style="color:#C0392B; margin-top:16px; font-size:13px;">📅 The application submission deadline is approaching. Please ensure all documents are ready and outstanding payments are collected.</p>`;
        const plain = `Submission Deadline Reminder\n\nClient: ${clientName}\nClient Code: ${(c as any).clientCode}\nSubmission Date: ${formatDate(c.expectedSubmissionDate)}\nDays Remaining: 12\nParalegal: ${paralegal ?? "—"}\nConsultant: ${consultant ?? "—"}`;
        await sendDocReminderToAssignedTeam(clientName, paralegal, consultant, subject, html, plain);
      }

      // ── 5. Submission date update reminder (when submissionDate is updated) ──
      const submissionDate = (c as any).submissionDate;
      if (submissionDate && !c.expectedSubmissionDate) {
        // Send reminder when submission date is set (first reminder)
        const subject = `✅ Submission Confirmed — ${clientName} (${(c as any).clientCode})`;
        const html = `
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Client Code</td><td style="padding:6px 0; color:#2C3A40;">${(c as any).clientCode}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Submission Date</td><td style="padding:6px 0; color:#27AE60; font-weight:bold;">${formatDate(submissionDate)}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? "—"}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
          </table>
          <p style="color:#27AE60; margin-top:16px; font-size:13px;">✅ The client's application has been submitted. Please ensure all outstanding payments are collected and follow up on approval status.</p>`;
        const plain = `Submission Confirmed Reminder\n\nClient: ${clientName}\nClient Code: ${(c as any).clientCode}\nSubmission Date: ${formatDate(submissionDate)}\nParalegal: ${paralegal ?? "—"}\nConsultant: ${consultant ?? "—"}`;
        await sendDocReminderToAssignedTeam(clientName, paralegal, consultant, subject, html, plain);
      }

      // ── 6. Document expiry reminders (30 days before each doc expires) ────
      const clientDocs = allDocs.filter(d => d.clientCaseId === (c as any).id);
      for (const doc of clientDocs) {
        if (!doc.receivedDate || !doc.expirationMonths) continue;
        const expiryDate = new Date(doc.receivedDate);
        expiryDate.setMonth(expiryDate.getMonth() + doc.expirationMonths);
        const daysToExpiry = daysUntil(expiryDate);
        if (daysToExpiry !== null && daysToExpiry === 30) {
          const subject = `📄 Document Expiring in 30 Days — ${clientName}: ${doc.docName}`;
          const html = `
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
              <tr><td style="padding:6px 0; color:#8A9499;">Document</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${doc.docName}</td></tr>
              <tr><td style="padding:6px 0; color:#8A9499;">Expiry Date</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">${formatDate(expiryDate)}</td></tr>
              <tr><td style="padding:6px 0; color:#8A9499;">Days Remaining</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">30 days</td></tr>
              <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? "—"}</td></tr>
              <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
            </table>
            <p style="color:#C0392B; margin-top:16px; font-size:13px;">⚠️ Please renew or obtain a fresh copy of this document before it expires.</p>`;
          const plain = `Document Expiry Reminder\n\nClient: ${clientName}\nDocument: ${doc.docName}\nExpiry Date: ${formatDate(expiryDate)}\nDays Remaining: 30\nParalegal: ${paralegal ?? "—"}\nConsultant: ${consultant ?? "—"}`;
          await sendDocReminderToAssignedTeam(clientName, paralegal, consultant, subject, html, plain);
        }
      }
    }
    // ── 6. Office rent reminder — 1st of odd months starting July 2026 ─────
    // Send on: July, September, November 2026, January, March, May 2027, etc.
    // i.e., every 2 months starting July 2026 (0-indexed month: 6, 8, 10, 0, 2, 4, ...)
    await checkOfficeRentReminder();

    // ── 7. Unpaid receipt 5-day reminder ─────────────────────────────────────
    await checkUnpaidReceiptReminders();

    console.log("[ReminderScheduler] Daily check completed.");
  } catch (err) {
    console.error("[ReminderScheduler] Error during reminder check:", err);
  }
}

/**
 * Office rent reminder: send on the 1st of every other month starting July 2026.
 * Months: July, September, November 2026, January, March, May 2027, ...
 */
async function checkOfficeRentReminder(): Promise<void> {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();

  // Only run on the 1st of the month
  if (dayOfMonth !== 1) return;

  // Calculate months since July 2026 (month=6, year=2026)
  const startYear = 2026;
  const startMonth = 6; // July
  const monthsSinceStart = (year - startYear) * 12 + (month - startMonth);

  // Only send on even intervals (0, 2, 4, ...) — i.e., July, Sept, Nov, Jan, ...
  if (monthsSinceStart < 0 || monthsSinceStart % 2 !== 0) return;

  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const subject = `🏢 Office Rent Reminder — Due in 15 Days`;
  const html = `
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tr><td style="padding:6px 0; color:#8A9499;">Reminder</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">Office Rent Payment</td></tr>
      <tr><td style="padding:6px 0; color:#8A9499;">Due In</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">15 days</td></tr>
      <tr><td style="padding:6px 0; color:#8A9499;">Month</td><td style="padding:6px 0; color:#2C3A40;">${monthName}</td></tr>
    </table>
    <p style="color:#E67E22; margin-top:16px; font-size:13px;">🏢 This is your bi-monthly office rent reminder. The rent payment will be due in approximately 15 days. Please ensure the payment is arranged.</p>`;
  const plain = `Office Rent Reminder\n\nThe office rent is due in 15 days (${monthName}).\nPlease ensure the payment is arranged.`;
  await sendToMahmoud(subject, html, plain);
  console.log(`[ReminderScheduler] Office rent reminder sent for ${monthName}`);
}

/**
 * Unpaid receipt 5-day reminder: for each receipt that was created 5 days ago
 * and is still not marked as paid, send a reminder to the assigned consultant
 * and CC Mahmoud.
 */
async function checkUnpaidReceiptReminders(): Promise<void> {
  try {
    const unpaidReceipts = await getUnpaidReceiptsOlderThanDays(5);
    if (!unpaidReceipts || unpaidReceipts.length === 0) return;

    const transporter = createTransporter();
    for (const receipt of unpaidReceipts) {
      const consultantEmail = receipt.consultantName && TEAM_EMAIL_MAP[receipt.consultantName]
        ? TEAM_EMAIL_MAP[receipt.consultantName]
        : null;

      const subject = `⏰ Unpaid Receipt Reminder — ${receipt.receiptCode}`;
      const html = `
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr><td style="padding:6px 0; color:#8A9499;">Receipt Code</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${receipt.receiptCode}</td></tr>
          <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40;">${receipt.clientName ?? "—"}</td></tr>
          <tr><td style="padding:6px 0; color:#8A9499;">Amount</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">€${(receipt.amountEur ?? 0).toLocaleString("en-US")}</td></tr>
          <tr><td style="padding:6px 0; color:#8A9499;">Created</td><td style="padding:6px 0; color:#2C3A40;">${formatDate(receipt.createdAt)}</td></tr>
          <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${receipt.consultantName ?? "—"}</td></tr>
        </table>
        <p style="color:#E67E22; margin-top:16px; font-size:13px;">⏰ This receipt has been outstanding for 5 days without being marked as paid. Please follow up with the client or update the payment status.</p>`;
      const plain = `Unpaid Receipt Reminder\n\nReceipt: ${receipt.receiptCode}\nClient: ${receipt.clientName ?? "—"}\nAmount: €${(receipt.amountEur ?? 0).toLocaleString("en-US")}\nCreated: ${formatDate(receipt.createdAt)}\nConsultant: ${receipt.consultantName ?? "—"}`;

      if (transporter && consultantEmail) {
        try {
          await transporter.sendMail({
            from: `"ELEVAY System" <${process.env.GMAIL_USER}>`,
            to: consultantEmail,
            cc: mergeSystemNotificationRecipients(MAHMOUD_CC).join(", "),
            subject: `[ELEVAY] ${subject}`,
            html: wrapEmail(subject, html),
            text: plain,
          });
          console.log(`[ReminderScheduler] Unpaid receipt reminder sent for ${receipt.receiptCode} to ${consultantEmail}`);
        } catch (err) {
          console.error(`[ReminderScheduler] Failed to send unpaid receipt reminder for ${receipt.receiptCode}:`, err);
        }
      } else {
        // Fallback: send to Mahmoud only
        await sendToMahmoud(subject, html, plain);
      }
    }
  } catch (err) {
    console.error("[ReminderScheduler] Error checking unpaid receipts:", err);
  }
}

/**
 * Start the daily reminder scheduler.
 * Runs once at startup (to catch any missed reminders) then every 24 hours.
 */
export function startReminderScheduler(): void {
  console.log("[ReminderScheduler] Starting daily reminder scheduler...");
  // Run immediately on startup, then every 24 hours
  runReminderCheck();
  setInterval(runReminderCheck, 24 * 60 * 60 * 1000);
}

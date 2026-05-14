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

import { getAllClientCasesForReminders, getAllClientDocumentsForReminders } from "./db";
import { sendDocReminderToAssignedTeam } from "./emailService";

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
        const subject = `📅 Submission Deadline in 12 Days — ${clientName}`;
        const html = `
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr><td style="padding:6px 0; color:#8A9499;">Client</td><td style="padding:6px 0; color:#2C3A40; font-weight:bold;">${clientName}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Submission Date</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">${formatDate(c.expectedSubmissionDate)}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Days Remaining</td><td style="padding:6px 0; color:#C0392B; font-weight:bold;">12 days</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Paralegal</td><td style="padding:6px 0; color:#2C3A40;">${paralegal ?? "—"}</td></tr>
            <tr><td style="padding:6px 0; color:#8A9499;">Consultant</td><td style="padding:6px 0; color:#2C3A40;">${consultant ?? "—"}</td></tr>
          </table>
          <p style="color:#C0392B; margin-top:16px; font-size:13px;">📅 The application submission deadline is approaching. Please ensure all documents are ready.</p>`;
        const plain = `Submission Deadline Reminder\n\nClient: ${clientName}\nSubmission Date: ${formatDate(c.expectedSubmissionDate)}\nDays Remaining: 12\nParalegal: ${paralegal ?? "—"}\nConsultant: ${consultant ?? "—"}`;
        await sendDocReminderToAssignedTeam(clientName, paralegal, consultant, subject, html, plain);
      }

      // ── 5. Document expiry reminders (30 days before each doc expires) ────
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
    console.log("[ReminderScheduler] Daily check completed.");
  } catch (err) {
    console.error("[ReminderScheduler] Error during reminder check:", err);
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

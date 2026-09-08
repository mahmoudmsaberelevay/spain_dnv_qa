/**
 * Monthly Financial Report Scheduler
 * Runs on the last day of each month and sends a PDF summary email
 * to the finance team (Mahmoud + Ziad).
 */
import { getFinancialSummary, listAccounts } from "./finDb";
import nodemailer from "nodemailer";
import { isAllowedSystemEmailSender, mergeSystemNotificationRecipients } from "./systemNotificationRecipients";

const FINANCE_RECIPIENTS = [
  "Mahmoud.saber@elevay.com",
  "ziad.elshurafa@elevay.com",
];

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !isAllowedSystemEmailSender(user)) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function fmtMoney(n: number, currency = "EUR") {
  const sym = currency === "EGP" ? "EGP" : "€";
  return `${sym} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

async function generateMonthlyReportHtml(year: number, month: number): Promise<string> {
  const summary = await getFinancialSummary(year);
  const accounts = await listAccounts();

  const monthName = new Date(year, month - 1).toLocaleString("en-US", { month: "long" });

  const totalIncome = summary?.monthlyIncome ?? 0;
  const totalExpenses = summary?.monthlyExpense ?? 0;
  const netProfit = summary?.monthlyProfit ?? 0;

  // Build account balances table
  const accountRows = (accounts ?? [])
    .filter((a: any) => a.isActive)
    .map((a: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${a.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${a.currency}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtMoney(Number(a.balance), a.currency)}</td>
      </tr>
    `).join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e3a5f;color:white;padding:24px;text-align:center;">
        <h1 style="margin:0;font-size:24px;">ELEVAY</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:12px;">EXPANDING YOUR FREEDOM</p>
      </div>
      <div style="padding:24px;">
        <h2 style="color:#1e3a5f;margin-bottom:4px;">Monthly Financial Report</h2>
        <p style="color:#666;margin-top:0;">${monthName} ${year}</p>

        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr style="background:#f8f9fa;">
            <td style="padding:12px;font-weight:600;color:#16a34a;">Total Income</td>
            <td style="padding:12px;text-align:right;font-weight:700;color:#16a34a;font-size:18px;">${fmtMoney(totalIncome)}</td>
          </tr>
          <tr>
            <td style="padding:12px;font-weight:600;color:#dc2626;">Total Expenses</td>
            <td style="padding:12px;text-align:right;font-weight:700;color:#dc2626;font-size:18px;">${fmtMoney(totalExpenses)}</td>
          </tr>
          <tr style="background:#f8f9fa;">
            <td style="padding:12px;font-weight:600;color:#1e3a5f;">Net Profit</td>
            <td style="padding:12px;text-align:right;font-weight:700;color:${netProfit >= 0 ? '#16a34a' : '#dc2626'};font-size:18px;">${fmtMoney(netProfit)}</td>
          </tr>
        </table>

        <h3 style="color:#1e3a5f;margin-top:32px;">Account Balances</h3>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#1e3a5f;color:white;">
              <th style="padding:8px 12px;text-align:left;">Account</th>
              <th style="padding:8px 12px;text-align:right;">Currency</th>
              <th style="padding:8px 12px;text-align:right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${accountRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999;">No accounts found</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;color:#999;font-size:11px;">
          <p>This is an automated monthly report from the Elevay Financial System.</p>
          <p>Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</p>
        </div>
      </div>
    </div>
  `;
}

async function sendMonthlyReport() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // current month

  const html = await generateMonthlyReportHtml(year, month);
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const subject = `Elevay Financial Report — ${monthName} ${year}`;

  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: mergeSystemNotificationRecipients(FINANCE_RECIPIENTS).join(", "),
        subject,
        html,
      });
      console.log(`[MonthlyReport] Sent ${monthName} ${year} report to the configured internal recipients`);
      return true;
    } catch (err) {
      console.error("[MonthlyReport] Failed to send email:", err);
      return false;
    }
  } else {
    console.log(`[MonthlyReport] No SMTP credentials — skipping email for ${monthName} ${year}`);
    return false;
  }
}

function isLastDayOfMonth(): boolean {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
}

/**
 * Start the monthly report scheduler.
 * Checks every hour if it's the last day of the month at ~6 PM Cairo time.
 */
export function startMonthlyReportScheduler() {
  console.log("[MonthlyReport] Scheduler initialized.");

  // Check every hour
  setInterval(async () => {
    const now = new Date();
    const cairoHour = (now.getUTCHours() + 2) % 24; // Cairo = UTC+2

    // Send at ~6 PM Cairo time on the last day of the month
    if (isLastDayOfMonth() && cairoHour === 18) {
      console.log("[MonthlyReport] Last day of month detected, sending report...");
      await sendMonthlyReport();
    }
  }, 60 * 60 * 1000); // every hour
}

// Export for manual trigger via tRPC
export { sendMonthlyReport };

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("all-system email notification coverage", () => {
  it("routes shared internal notifications through the mandatory recipient merger", () => {
    const emailService = read("server/emailService.ts");
    const backupEmailService = read("server/backupEmailService.ts");
    expect(emailService).toContain("mergeSystemNotificationRecipients(to)");
    expect(backupEmailService).toContain("mergeSystemNotificationRecipients(to)");
    expect(emailService).toContain("sendClientPortalActivityEmail");
  });

  it("covers every direct scheduled and staff notification path", () => {
    const monthly = read("server/monthlyReportScheduler.ts");
    const reminders = read("server/reminderScheduler.ts");
    const scheduledBackup = read("server/scheduledDbBackupService.ts");
    const clientPortal = read("server/clientPortalRoutes.ts");
    expect(monthly).toContain("mergeSystemNotificationRecipients(FINANCE_RECIPIENTS)");
    expect(reminders).toContain("mergeSystemNotificationRecipients(MAHMOUD_EMAILS)");
    expect(reminders).toContain("mergeSystemNotificationRecipients(MAHMOUD_CC)");
    expect(scheduledBackup).toContain("mergeSystemNotificationRecipients([");
    expect(clientPortal).toContain("const recipients = mergeSystemNotificationRecipients(input.recipients)");
    expect(clientPortal).toContain("return mergeSystemNotificationRecipients([");
  });

  it("keeps client transactional emails excluded from internal copying", () => {
    const emailService = read("server/emailService.ts");
    const leadRouter = read("server/routers/leads.ts");
    expect(emailService.match(/includeSystemRecipient: false/g)).toHaveLength(2);
    expect(leadRouter).toContain("to: lead.email");
    expect(leadRouter).toContain("isAllowedSystemEmailSender(user)");
  });

  it("preserves the no-ELEVAY-domain sender policy across every SMTP implementation", () => {
    for (const file of [
      "server/emailService.ts",
      "server/backupEmailService.ts",
      "server/monthlyReportScheduler.ts",
      "server/reminderScheduler.ts",
      "server/routers/leads.ts",
    ]) {
      expect(read(file), file).toContain("isAllowedSystemEmailSender");
    }
  });
});

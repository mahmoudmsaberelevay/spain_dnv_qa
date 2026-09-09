import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("event-specific executive notification coverage", () => {
  it("routes shared internal notifications through the event-specific recipient resolver", () => {
    const emailService = read("server/emailService.ts");
    const backupEmailService = read("server/backupEmailService.ts");
    expect(emailService).toContain('resolveSystemNotificationRecipients(options.eventType ?? "other", to)');
    expect(backupEmailService).toContain('resolveSystemNotificationRecipients("other", to)');
    expect(emailService).toContain("sendClientPortalActivityEmail");
    expect(emailService).toContain('eventType: "contract_created"');
    expect(emailService).toContain('eventType: "contract_signed"');
    expect(emailService).toContain('eventType: "receipt_created"');
    expect(emailService).toContain('eventType: "receipt_paid"');
    expect(emailService).toContain('eventType: "lead_assigned"');
  });

  it("filters executives from every unrelated scheduled and staff notification path", () => {
    const monthly = read("server/monthlyReportScheduler.ts");
    const reminders = read("server/reminderScheduler.ts");
    const scheduledBackup = read("server/scheduledDbBackupService.ts");
    const clientPortal = read("server/clientPortalRoutes.ts");
    expect(monthly).toContain('resolveSystemNotificationRecipients("other", FINANCE_RECIPIENTS)');
    expect(reminders).toContain('resolveSystemNotificationRecipients("other", MAHMOUD_EMAILS)');
    expect(reminders).toContain('resolveSystemNotificationRecipients("other", consultantEmail)');
    expect(scheduledBackup).toContain('resolveSystemNotificationRecipients("other", [');
    expect(clientPortal).toContain("resolveSystemNotificationRecipients(input.eventType, input.recipients)");
    expect(clientPortal).toContain('return resolveSystemNotificationRecipients("other",');
  });

  it("filters the CRM notification bell by the signed-in executive", () => {
    const router = read("server/routers.ts");
    const leadRouter = read("server/routers/leads.ts");
    expect(router).toContain("isSystemNotificationVisibleToExecutive(ctx.user.email, row.type)");
    expect(router).toContain("const statusChanged = contract.status !== input.status");
    expect(router).toContain('if (statusChanged && input.status === "signed")');
    expect(leadRouter).toContain('type: "lead_assigned"');
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

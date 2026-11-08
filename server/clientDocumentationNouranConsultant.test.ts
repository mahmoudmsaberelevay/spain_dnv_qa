import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mail = vi.hoisted(() => ({ sendMail: vi.fn(async (_options: { to: string }) => ({ messageId: "synthetic-only" })) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mail.sendMail }) } }));
const { TEAM_EMAIL_MAP, getTeamNotificationEmail, notifyNewClientAssigned, sendDocReminderToAssignedTeam } = await import("./emailService");
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../drizzle/schema.ts");
const router = read("./routers.ts");
const form = read("../client/src/pages/ClientDocs.tsx");
const dashboard = read("../client/src/pages/ClientDocsDashboard.tsx");
const portal = read("./clientPortalRoutes.ts");
const roster = ["Mahmoud", "Ziad", "Fouad", "Kirolos", "Nouran"] as const;
const array = '["Mahmoud", "Ziad", "Fouad", "Kirolos", "Nouran"]';

beforeEach(() => mail.sendMail.mockClear());

describe("Nouran Client Documentation consultant", () => {
  it("preserves the existing storage choices and appends Nouran", () => {
    expect(schema).toContain(`mysqlEnum("consultant", ${array}).notNull()`);
    const migration = read("../drizzle/0126_client_documentation_nouran_consultant.sql");
    expect(migration).toContain("enum('Mahmoud','Ziad','Fouad','Kirolos','Nouran') NOT NULL");
    expect(migration).not.toMatch(/\b(?:DROP|DELETE|UPDATE|TRUNCATE|INSERT)\b/i);
  });
  it("accepts Nouran through the same validated API roster and rejects arbitrary names", () => {
    expect(router).toContain(`consultant: z.enum(${array})`);
    expect(z.enum(roster).parse("Nouran")).toBe("Nouran");
    for (const name of roster.slice(0, 4)) expect(z.enum(roster).parse(name)).toBe(name);
    expect(z.enum(roster).safeParse("Unknown user").success).toBe(false);
  });
  it("shows Nouran in folder creation and dashboard filtering", () => {
    expect(form).toContain(`${array}.map`);
    expect(form).toContain('consultant: "Mahmoud" | "Ziad" | "Fouad" | "Kirolos" | "Nouran" | ""');
    expect(dashboard).toContain('const CONSULTANTS = ["All", "Mahmoud", "Ziad", "Fouad", "Kirolos", "Nouran"]');
  });
  it("resolves her existing email from either short or full name", () => {
    expect(getTeamNotificationEmail("Nouran")).toBe("nouran.mamdouh@elevay.com");
    expect(getTeamNotificationEmail("Nouran Mamdouh")).toBe("nouran.mamdouh@elevay.com");
    expect(TEAM_EMAIL_MAP.Nouran).toBe("nouran.mamdouh@elevay.com");
  });
  it("sends assignment notification to Nouran with transport mocked", async () => {
    await notifyNewClientAssigned("Synthetic Client", "TEST-ONLY", "Spain", "single", null, "Nouran");
    expect(mail.sendMail).toHaveBeenCalledOnce();
    expect(mail.sendMail.mock.calls[0][0].to).toContain("nouran.mamdouh@elevay.com");
  });
  it("routes legacy documentation reminders to Nouran with transport mocked", async () => {
    await sendDocReminderToAssignedTeam("Synthetic Client", null, "Nouran", "Synthetic reminder", "Test only");
    expect(mail.sendMail).toHaveBeenCalledOnce();
    expect(mail.sendMail.mock.calls[0][0].to).toContain("nouran.mamdouh@elevay.com");
  });
  it("includes both Nouran labels in portal upload-notification routing", () => {
    const staffMap = portal.slice(portal.indexOf("function staffRecipients("), portal.indexOf("export function registerClientPortalRoutes"));
    expect(staffMap).toContain('Nouran: "nouran.mamdouh@elevay.com"');
    expect(staffMap).toContain('"Nouran Mamdouh": "nouran.mamdouh@elevay.com"');
  });
});

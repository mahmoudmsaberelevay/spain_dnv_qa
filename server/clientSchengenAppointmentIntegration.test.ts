import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0081_client_schengen_appointment.sql", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("./clientLifecycleNotificationService.ts", import.meta.url), "utf8");
const timeline = readFileSync(new URL("./clientProcessTimeline.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../client/src/pages/ClientDocDetail.tsx", import.meta.url), "utf8");
const portalRoutes = readFileSync(new URL("./clientPortalRoutes.ts", import.meta.url), "utf8");
const employeeDocuments = readFileSync(new URL("./clientEmployeeDocuments.ts", import.meta.url), "utf8");

describe("Client Documentation conditional Schengen appointment workflow", () => {
  it("adds one nullable appointment field through an additive migration", () => {
    expect(schema).toContain('schengenAppointmentDate: date("schengenAppointmentDate")');
    expect(migration).toContain("ADD COLUMN `schengenAppointmentDate` DATE NULL");
    expect(migration).not.toMatch(/DROP\s|DELETE\s|TRUNCATE\s/i);
  });

  it("validates no-visa scope and Embassy Email ordering before recording the date", () => {
    expect(routers).toContain('schengenAppointmentDate: z.string().nullable().optional()');
    expect(routers).toContain("Schengen Appointment Date is only available when the client has no valid Schengen visa");
    expect(routers).toContain("Schengen Appointment Date cannot be before the Embassy Email date");
    expect(routers).toContain("Clear the Schengen Appointment Date before removing the Embassy Email date");
    expect(routers).toContain("Embassy Email date cannot be after the Schengen Appointment Date");
    expect(routers).toContain('eventType: "schengen_appointment_confirmed"');
  });

  it("uses one idempotent second-day client reminder and stops once the appointment exists", () => {
    expect(lifecycle).toContain('c.schengenVisaValid === false && embassyEmail && !schengenAppointment');
    expect(lifecycle).toContain('calendarDaysBetween(embassyEmail, today) >= 2');
    expect(lifecycle).toContain('ruleKey: "schengen_appointment_booking_d2"');
    expect(lifecycle).toContain('eventType: "schengen_appointment_booking_reminder"');
  });

  it("places the conditional step immediately after Embassy Email in the shared staff and client timeline", () => {
    const embassyIndex = timeline.indexOf('key: "embassy_email"');
    const schengenIndex = timeline.indexOf('key: "schengen_appointment"');
    const preparationIndex = timeline.indexOf('key: "document_preparation"');
    expect(embassyIndex).toBeGreaterThan(-1);
    expect(schengenIndex).toBeGreaterThan(embassyIndex);
    expect(preparationIndex).toBeGreaterThan(schengenIndex);
    expect(timeline).toContain("clientCase.schengenVisaValid === false");
  });

  it("shows the appointment entry only for no-visa cases and explains when the reminder stops", () => {
    expect(detail).toContain('label: "Schengen Appointment Date"');
    expect(detail).toContain("visible: !isCaribbean && !caseData.schengenVisaValid");
    expect(detail).toContain("second day after this email");
    expect(detail).toContain("The booking reminder stops once this date is saved.");
  });

  it("exposes the same appointment state to client and employee mobile folder details", () => {
    for (const source of [portalRoutes, employeeDocuments]) {
      expect(source).toContain("hasSchengenVisa");
      expect(source).toContain("requiresSchengenAppointment");
      expect(source).toContain("schengenAppointmentDate");
      expect(source).toContain("embassyEmailSentAt");
    }
  });
});

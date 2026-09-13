import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { runClientLifecycleReminders } from "./clientLifecycleNotificationService";

vi.mock("./db", () => ({ getDb: vi.fn() }));

const NOW = new Date("2026-01-20T08:00:00Z");
const baseCase = {
  id: 0,
  clientName: "Test Client",
  clientCode: "TEST",
  paralegal: "Madonna",
  consultant: "Mahmoud",
  applicationTimezone: "Africa/Cairo",
  clientPortalSignedAt: null,
  appointmentBookingSubmittedAt: new Date("2026-01-01T12:00:00Z"),
  embassyAppointmentDate: null,
  embassyEmailDate: null,
  embassyReplyConfirmedAt: null,
  schengenVisaValid: false,
  schengenExpiryDate: null,
  expectedSubmissionDate: null,
  submissionDate: null,
  approvalDate: null,
  travelDate: null,
  arrivalConfirmedDate: null,
  travelByDate: null,
  ticketLink: null,
  biometricsAppointmentDate: null,
  biometricsAppointmentTime: null,
  biometricsLocation: null,
  biometricsStatus: "not_started",
};

function date(value: string) { return new Date(`${value}T12:00:00Z`); }
function row(id: number, updates: Record<string, unknown>) { return { clientCase: { ...baseCase, id, clientName: `Client ${id}`, clientCode: `C${id}`, ...updates }, portalUserId: 1000 + id, applicationPublicId: `application-${id}` }; }

function queryResult<T>(value: T) {
  const builder: any = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: (resolve: (result: T) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject),
  };
  return builder;
}

function scenarioDb() {
  const rows = [
    row(1, { clientPortalSignedAt: date("2026-01-18"), appointmentBookingSubmittedAt: null }),
    row(2, { embassyEmailDate: date("2026-01-17"), appointmentBookingSubmittedAt: date("2026-01-18") }),
    row(3, { embassyAppointmentDate: date("2026-01-23") }),
    row(4, { schengenVisaValid: true, schengenExpiryDate: date("2026-02-19") }),
    row(5, { embassyEmailDate: date("2026-01-05") }),
    row(6, { expectedSubmissionDate: date("2026-02-01") }),
    row(7, { expectedSubmissionDate: date("2026-01-27") }),
    row(8, { expectedSubmissionDate: date("2026-01-23") }),
    row(9, { clientPortalSignedAt: date("2026-01-02") }),
    row(10, { travelDate: "2026-01-19" }),
    row(11, { approvalDate: date("2026-01-19") }),
    row(12, { approvalDate: date("2026-01-17") }),
    row(13, { biometricsAppointmentDate: "2026-01-22", biometricsAppointmentTime: "09:30", biometricsLocation: "Madrid Police Office", biometricsStatus: "confirmed" }),
  ];
  const docs = [{ id: 1, clientCaseId: 9, docName: "Passport copy", received: false }];
  const payments = [
    { id: 1, clientCaseId: 6, paymentName: "Second payment", paymentMilestone: "submission", amountEur: "1000.00", dueDate: null, paidDate: null, archivedAt: null, sortOrder: 2 },
    { id: 2, clientCaseId: 7, paymentName: "Second payment", paymentMilestone: "submission", amountEur: "1000.00", dueDate: null, paidDate: null, archivedAt: null, sortOrder: 2 },
    { id: 3, clientCaseId: 11, paymentName: "Third payment", paymentMilestone: "approval", amountEur: "500.00", dueDate: null, paidDate: null, archivedAt: null, sortOrder: 3 },
  ];
  const queue: unknown[] = [[{ id: 1, enabled: true }], rows, docs, payments];
  const db: any = {
    select: vi.fn(() => queryResult(queue.shift() ?? [])),
    insert: vi.fn(() => ({ values: () => ({ onDuplicateKeyUpdate: () => Promise.resolve([{ affectedRows: 1 }]) }) })),
  };
  return db;
}

beforeEach(() => vi.mocked(getDb).mockImplementation(async () => scenarioDb() as any));

describe("client lifecycle reminder engine", () => {
  it("selects every scheduled lifecycle rule at its exact boundary and targets staff where required", async () => {
    const deliveries: any[] = [];
    const result = await runClientLifecycleReminders(NOW, { claimAndSend: async input => { deliveries.push(input); return true; } });
    const keys = deliveries.map(item => item.template.ruleKey);
    expect(keys).toEqual(expect.arrayContaining([
      "appointment_booking_d2", "embassy_inbox_cycle", "embassy_appointment_d3", "schengen_expiry_d30",
      "embassy_attestation_followup_d15", "submission_payment_d12", "flight_ticket_d3",
      "missing_documents_cycle", "arrival_confirmation_d1", "approval_payment_d1", "travel_deadline_d3", "biometrics_48h",
    ]));
    expect(deliveries.filter(item => item.template.notifyStaff).map(item => item.template.ruleKey)).toEqual(expect.arrayContaining([
      "embassy_attestation_followup_d15", "arrival_confirmation_d1", "travel_deadline_d3",
    ]));
    expect(deliveries.filter(item => ["submission_payment_d12", "approval_payment_d1"].includes(item.template.ruleKey)).every(item => item.template.notifyStaff === false)).toBe(true);
    const appointmentBooking = deliveries.find(item => item.template.ruleKey === "appointment_booking_d2");
    expect(appointmentBooking?.template).toMatchObject({
      titleEn: "Send the Embassy attestation appointment email",
      entityType: "notification_attachment",
      entityPublicId: "embassy-email-template",
      metadata: {
        attachment: {
          publicId: "embassy-email-template",
          fileName: "embassyemail.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      },
    });
    expect(appointmentBooking?.template.bodyEn).toBe("Dear Mr. Client 1\n\nnow you will need to send an email to the Spanish Embassy to book an attestation appointment\n\nyou can find an attached word file here you can just copy the subject and add it to the email subject field and also copy the mail body and just change you personal data Name and Passport Number");
    expect(result.sent).toBe(deliveries.length);
    expect(result.linkedApplications).toBe(13);
  });

  it("suppresses duplicate delivery when the same run is retried", async () => {
    const claimed = new Set<string>();
    const delivered: string[] = [];
    const claimAndSend = async (input: any) => {
      const key = input.template.idempotencyKey;
      if (claimed.has(key)) return false;
      claimed.add(key);
      delivered.push(key);
      return true;
    };
    const first = await runClientLifecycleReminders(NOW, { claimAndSend });
    const second = await runClientLifecycleReminders(NOW, { claimAndSend });
    expect(first.sent).toBeGreaterThan(0);
    expect(second.sent).toBe(0);
    expect(new Set(delivered).size).toBe(delivered.length);
  });
});

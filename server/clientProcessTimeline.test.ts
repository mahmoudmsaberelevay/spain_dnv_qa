import { describe, expect, it } from "vitest";
import { projectClientProcessTimeline } from "./clientProcessTimeline";

const applicationCreatedAt = new Date("2026-01-01T09:00:00Z");

function project(clientCase: Record<string, unknown> = {}, documents: Array<Record<string, unknown>> = [], payments: Array<Record<string, unknown>> = [], now = new Date("2026-01-02T09:00:00Z")) {
  return projectClientProcessTimeline({
    clientCase,
    documents,
    payments: payments as Array<{ paymentName: string; paymentMilestone?: "signed" | "submission" | "approval" | null; paidDate?: string | null; sortOrder?: number }>,
    applicationCreatedAt,
    now,
  });
}

describe("client process timeline projection", () => {
  it("returns exactly 17 client-safe stages and starts a newly linked application at Contract Signed", () => {
    const timeline = project();

    expect(timeline).toHaveLength(17);
    expect(timeline[0]).toMatchObject({ key: "contract_signed", position: 1, status: "current" });
    expect(timeline.slice(1).every(item => item.status === "upcoming")).toBe(true);
    expect(Object.keys(timeline[0]).sort()).toEqual(["key", "occurredAt", "position", "status", "titleAr", "titleEn"].sort());
  });

  it("makes the second-payment window current and keeps Ready to Submit in the future while unpaid", () => {
    const timeline = project({
      applicationTimezone: "Africa/Cairo",
      swornTranslationSubmittedAt: new Date("2026-02-01T10:00:00Z"),
      expectedSubmissionDate: new Date("2026-02-10T12:00:00Z"),
      secondPaymentStatus: "pending",
    }, [], [
      { paymentName: "First payment", paidDate: "2026-01-01", sortOrder: 1 },
      { paymentName: "Second payment", paymentMilestone: "submission", paidDate: null, sortOrder: 2 },
    ], new Date("2026-02-01T10:00:00Z"));

    expect(timeline[7]).toMatchObject({ key: "waiting_second_payment", status: "current", occurredAt: "2026-01-29" });
    expect(timeline[8]).toMatchObject({ key: "ready_to_submit", status: "upcoming" });
  });

  it("shows Third Payment Required from the day after approval without misusing approval as government submission", () => {
    const timeline = project({
      stage: "approved",
      submissionDate: new Date("2026-03-01T12:00:00Z"),
      approvalDate: new Date("2026-04-01T12:00:00Z"),
      thirdPaymentStatus: "pending",
    }, [], [
      { paymentName: "First payment", paidDate: "2026-01-01", sortOrder: 1 },
      { paymentName: "Second payment", paidDate: "2026-02-20", sortOrder: 2 },
      { paymentName: "Third payment", paymentMilestone: "approval", paidDate: null, sortOrder: 3 },
    ], new Date("2026-04-02T10:00:00Z"));

    expect(timeline[10]).toMatchObject({ key: "submitted_to_government", status: "completed" });
    expect(timeline[11]).toMatchObject({ key: "third_payment_required", status: "current", occurredAt: "2026-04-02" });
    expect(timeline[12]).toMatchObject({ key: "waiting_travel_biometrics", status: "upcoming" });
  });

  it("marks the entire sequence complete after Card Received", () => {
    const timeline = project({
      stage: "approved",
      submissionDate: new Date("2026-03-01T12:00:00Z"),
      approvalDate: new Date("2026-04-01T12:00:00Z"),
      biometricsAppointmentDate: "2026-04-15",
      biometricsDate: new Date("2026-04-15T12:00:00Z"),
      residencyCardReadyDate: "2026-05-01",
      residencyCardStatus: "collected",
      updatedAt: new Date("2026-05-03T12:00:00Z"),
    }, [], [], new Date("2026-05-03T13:00:00Z"));

    expect(timeline.every(item => item.status === "completed")).toBe(true);
    expect(timeline[16]).toMatchObject({ key: "card_received", status: "completed", occurredAt: "2026-05-03T12:00:00.000Z" });
  });
});

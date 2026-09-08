import { describe, expect, it } from "vitest";
import {
  calculateClientDocumentationPaymentSummary,
  cairoDateKey,
} from "./clientDocumentationPaymentsService";

function payment(overrides: Record<string, unknown>) {
  return {
    id: 1,
    clientCaseId: 10,
    paymentName: "Payment",
    amountEur: "1000.00",
    dueDate: "2026-09-09",
    paidDate: null,
    receiptName: null,
    receiptDriveLink: null,
    notes: null,
    sortOrder: 0,
    createdByUserId: 1,
    updatedByUserId: null,
    archivedAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  } as any;
}

describe("Client Documentation payment schedule", () => {
  it("calculates paid, remaining, due, overdue, and next payment from active rows", () => {
    const result = calculateClientDocumentationPaymentSummary([
      payment({ id: 1, paymentName: "First Payment Signing", amountEur: "3000.00", dueDate: "2026-09-01", paidDate: "2026-09-01" }),
      payment({ id: 2, paymentName: "Second Payment Submission", amountEur: "5000.00", dueDate: "2026-09-08", sortOrder: 1 }),
      payment({ id: 3, paymentName: "Third Payment Approval", amountEur: "2000.00", dueDate: "2026-10-01", sortOrder: 2 }),
      payment({ id: 4, paymentName: "Custom Overdue", amountEur: "1000.00", dueDate: "2026-09-05", sortOrder: 3 }),
      payment({ id: 5, paymentName: "Archived", amountEur: "9999.00", dueDate: "2026-09-01", archivedAt: new Date("2026-09-07T00:00:00Z") }),
    ], new Date("2026-09-08T09:00:00Z"));

    expect(result.summary).toMatchObject({
      contractValueEur: 11000,
      paidTotalEur: 3000,
      remainingBalanceEur: 8000,
      dueTotalEur: 6000,
      overdueTotalEur: 1000,
      paymentCount: 4,
      paidCount: 1,
    });
    expect(result.summary.nextPayment?.paymentName).toBe("Custom Overdue");
    expect(result.payments.map(item => [item.paymentName, item.status])).toEqual([
      ["First Payment Signing", "paid"],
      ["Second Payment Submission", "due_today"],
      ["Third Payment Approval", "upcoming"],
      ["Custom Overdue", "overdue"],
    ]);
  });

  it("uses Cairo dates at UTC day boundaries", () => {
    expect(cairoDateKey(new Date("2026-09-07T22:30:00Z"))).toBe("2026-09-08");
    const result = calculateClientDocumentationPaymentSummary([
      payment({ dueDate: "2026-09-08" }),
    ], new Date("2026-09-07T22:30:00Z"));
    expect(result.payments[0]?.status).toBe("due_today");
  });
});

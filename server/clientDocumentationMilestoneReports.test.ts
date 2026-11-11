import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { clientCases } from "../drizzle/schema";
import { DOCUMENTATION_MILESTONES } from "../shared/clientDocumentationMilestones";
import type { TrpcContext } from "./_core/context";
import {
  CLIENT_DOCUMENTATION_MILESTONE_PROJECTION,
  buildClientDocumentationMilestoneReport,
  clientDocumentationMilestoneReportsRouter,
  getClientDocumentationMilestoneReport,
  normalizeDocumentationMilestoneDate,
  type DocumentationMilestoneCase,
} from "./clientDocumentationMilestoneReports";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserModuleAccess: vi.fn(),
  isOwner: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./permissionsRouter", () => ({
  getUserModuleAccess: mocks.getUserModuleAccess,
  isOwner: mocks.isOwner,
}));

const clock = new Date("2026-11-11T09:00:00.000Z");
const reachedDate = "2026-10-12";
const zeroCounts = Object.fromEntries(
  DOCUMENTATION_MILESTONES.map(({ key }) => [key, 0])
);
function fixture(
  overrides: Partial<DocumentationMilestoneCase> = {}
): DocumentationMilestoneCase {
  return {
    id: 1,
    clientName: "Report Client",
    clientCode: "SP001",
    program: "spain",
    consultant: "Mahmoud",
    paralegal: "Madonna",
    ...overrides,
  };
}
function build(cases: readonly DocumentationMilestoneCase[]) {
  return buildClientDocumentationMilestoneReport(cases, clock);
}

const writes = {
  insert: vi.fn(() => {
    throw new Error("INSERT_FORBIDDEN");
  }),
  update: vi.fn(() => {
    throw new Error("UPDATE_FORBIDDEN");
  }),
  delete: vi.fn(() => {
    throw new Error("DELETE_FORBIDDEN");
  }),
  execute: vi.fn(() => {
    throw new Error("RAW_SQL_FORBIDDEN");
  }),
  transaction: vi.fn(() => {
    throw new Error("TRANSACTION_FORBIDDEN");
  }),
};
function selectOnlyDb(rows: DocumentationMilestoneCase[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { ...writes, select, from, where, orderBy };
}
function context(
  userOverrides: Partial<NonNullable<TrpcContext["user"]>> = {}
): TrpcContext {
  return {
    user: {
      id: 41,
      openId: "report-staff",
      name: "Report Staff",
      email: "report.staff@elevay.com",
      role: "user",
      loginMethod: "manus",
      createdAt: clock,
      updatedAt: clock,
      lastSignedIn: clock,
      ...userOverrides,
    } as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isOwner.mockReturnValue(false);
  mocks.getUserModuleAccess.mockResolvedValue({ clientDocs: "viewer" });
  mocks.getDb.mockResolvedValue(selectOnlyDb([]));
});
afterEach(() => {
  for (const write of Object.values(writes))
    expect(write).not.toHaveBeenCalled();
});

describe("milestone date normalization", () => {
  it.each([
    ["2026-10-12", "2026-10-12"],
    [" 2026-10-12 ", "2026-10-12"],
    [new Date("2026-10-12T12:34:56.000Z"), "2026-10-12"],
    ["2026-10-12T12:34:56.000Z", "2026-10-12"],
    ["2026-10-12 12:34:56", "2026-10-12"],
    ["2026-10-12T12:34:56", "2026-10-12"],
    ["2026-10-12T00:30:00+02:00", "2026-10-11"],
    ["2024-02-29", "2024-02-29"],
  ])("normalizes %s without local timezone assumptions", (input, output) => {
    expect(normalizeDocumentationMilestoneDate(input)).toBe(output);
  });
  it.each([
    null,
    undefined,
    "",
    " ",
    "not-a-date",
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "0000-01-01",
    "12/10/2026",
    "2026",
    "2026-1-1",
    "2026-10-12T25:00:00Z",
    "2026-10-12T12:60:00Z",
    "2026-10-12T12:00:60Z",
    "2026-02-30T12:00:00Z",
    new Date("invalid"),
    0,
    false,
  ])("rejects invalid/absent evidence %s", input => {
    expect(normalizeDocumentationMilestoneDate(input as any)).toBeNull();
  });
});

describe("pure current milestone report", () => {
  it("initializes all nine counts and totals for empty reports", () => {
    expect(build([])).toEqual({
      rows: [],
      counts: zeroCounts,
      totalSpainApplications: 0,
      withoutMilestone: 0,
      beyondMilestones: 0,
      generatedAt: clock.toISOString(),
    });
  });

  it.each(DOCUMENTATION_MILESTONES)(
    "projects exactly one row for $label",
    milestone => {
      const index = DOCUMENTATION_MILESTONES.findIndex(
        ({ key }) => key === milestone.key
      );
      const history = Object.fromEntries(
        DOCUMENTATION_MILESTONES.slice(0, index + 1).map(({ field }) => [
          field,
          reachedDate,
        ])
      );
      const report = build([fixture(history)]);
      expect(report.rows).toEqual([
        {
          id: 1,
          clientName: "Report Client",
          clientCode: "SP001",
          program: "spain",
          consultant: "Mahmoud",
          paralegal: "Madonna",
          currentMilestone: milestone.key,
          milestoneDate: reachedDate,
        },
      ]);
      expect(report.counts).toEqual({ ...zeroCounts, [milestone.key]: 1 });
      expect(report.totalSpainApplications).toBe(1);
      expect(report.withoutMilestone).toBe(0);
      expect(report.beyondMilestones).toBe(0);
    }
  );

  it("uses workflow rank for every possible subset, never counts historical milestones", () => {
    for (let mask = 0; mask < 2 ** DOCUMENTATION_MILESTONES.length; mask++) {
      const reached = DOCUMENTATION_MILESTONES.filter(
        (_, index) => (mask & (1 << index)) !== 0
      );
      const dates = Object.fromEntries(
        reached.map(({ field }, index) => [
          field,
          `2026-10-${String(20 - index).padStart(2, "0")}`,
        ])
      );
      const report = build([fixture(dates)]);
      const last = reached.at(-1);
      expect(report.rows.length).toBe(last ? 1 : 0);
      expect(report.rows[0]?.currentMilestone).toBe(last?.key);
      expect(report.counts).toEqual(
        last ? { ...zeroCounts, [last.key]: 1 } : zeroCounts
      );
      expect(report.withoutMilestone).toBe(last ? 0 : 1);
    }
  });

  it("earlier corrected history and future bookings cannot override later completion", () => {
    const report = build([
      fixture({
        appointmentBookingSubmittedAt: "2030-12-31",
        translationDate: "2030-12-30",
        travelDate: "2030-12-29",
        biometricsAppointmentDate: "2030-12-28",
        biometricsStatus: "confirmed",
        biometricsDate: reachedDate,
        bankAccountCompletedDate: "2026-10-11",
      }),
    ]);
    expect(report.rows[0]).toMatchObject({
      currentMilestone: "bank_account_completed",
      milestoneDate: "2026-10-11",
    });
    expect(report.counts).toEqual({ ...zeroCounts, bank_account_completed: 1 });
  });

  it("equal timestamps still resolve to the final reached workflow stage", () => {
    const dates = Object.fromEntries(
      DOCUMENTATION_MILESTONES.map(({ field }) => [field, reachedDate])
    );
    expect(build([fixture(dates)]).rows[0]?.currentMilestone).toBe(
      "residency_card_ready"
    );
  });

  it("future confirmed travel/booking counts without fabricating arrival or biometrics attendance", () => {
    const report = build([
      fixture({ id: 1, travelDate: "2030-12-31" }),
      fixture({
        id: 2,
        travelDate: reachedDate,
        biometricsAppointmentDate: "2030-12-31",
        biometricsStatus: "confirmed",
      }),
    ]);
    expect(report.rows.map(({ currentMilestone }) => currentMilestone)).toEqual(
      ["travel_booked", "biometrics_appointment"]
    );
    expect(report.counts.arrival_confirmed).toBe(0);
    expect(report.counts.biometrics_completed).toBe(0);
  });

  it("uses translator alias only when valid primary evidence is unavailable", () => {
    const report = build([
      fixture({ id: 1, swornTranslationSubmittedAt: "2026-10-01T12:00:00Z" }),
      fixture({
        id: 2,
        translationDate: reachedDate,
        swornTranslationSubmittedAt: "2030-12-31",
      }),
      fixture({
        id: 3,
        translationDate: "bad-date",
        swornTranslationSubmittedAt: reachedDate,
      }),
    ]);
    expect(report.rows.map(({ milestoneDate }) => milestoneDate)).toEqual([
      "2026-10-01",
      reachedDate,
      reachedDate,
    ]);
    expect(report.counts.translator_submitted).toBe(3);
  });

  it("ignores a cancelled appointment but preserves independently recorded completion evidence", () => {
    const report = build([
      fixture({
        id: 1,
        travelDate: reachedDate,
        biometricsAppointmentDate: "2030-12-31",
        biometricsStatus: "cancelled",
      }),
      fixture({
        id: 2,
        biometricsAppointmentDate: reachedDate,
        biometricsStatus: "cancelled",
      }),
      fixture({
        id: 3,
        biometricsAppointmentDate: reachedDate,
        biometricsStatus: "cancelled",
        biometricsDate: reachedDate,
      }),
      fixture({
        id: 4,
        biometricsAppointmentDate: reachedDate,
        biometricsStatus: "completed",
        biometricsDate: reachedDate,
      }),
    ]);
    expect(
      report.rows.map(({ id, currentMilestone }) => [id, currentMilestone])
    ).toEqual([
      [1, "travel_booked"],
      [3, "biometrics_completed"],
      [4, "biometrics_completed"],
    ]);
    expect(report.withoutMilestone).toBe(1);
    expect(report.counts.biometrics_appointment).toBe(0);
  });

  it("does not treat status/stage/activity metadata as milestone date evidence", () => {
    const metadataOnly = {
      ...fixture(),
      stage: "approved",
      biometricsStatus: "completed",
      residencyCardStatus: "ready_for_collection",
      biometricsBookedAt: clock,
      approvalDate: clock,
      createdAt: clock,
      updatedAt: clock,
      embassyAppointmentDate: clock,
      travelByDate: reachedDate,
      clientPortalSignedAt: clock,
      lifecycleEvents: [
        { eventType: "bank_account_completed", createdAt: clock },
      ],
    };
    const invalidDates = Object.fromEntries(
      DOCUMENTATION_MILESTONES.map(({ field }) => [field, "2026-02-30"])
    );
    const report = build([
      metadataOnly,
      fixture({
        id: 2,
        ...invalidDates,
        swornTranslationSubmittedAt: "bad-date",
      }),
    ]);
    expect(report.rows).toEqual([]);
    expect(report.counts).toEqual(zeroCounts);
    expect(report.withoutMilestone).toBe(2);
  });

  it("excludes collected cards beyond the final listed stage, including legacy records without dates", () => {
    const report = build([
      fixture({
        id: 1,
        residencyCardStatus: "collected",
        residencyCardReadyDate: reachedDate,
      }),
      fixture({ id: 2, residencyCardStatus: "collected" }),
      fixture({
        id: 3,
        residencyCardStatus: "ready_for_collection",
        residencyCardReadyDate: reachedDate,
      }),
      fixture({ id: 4 }),
    ]);
    expect(report.totalSpainApplications).toBe(4);
    expect(report.beyondMilestones).toBe(2);
    expect(report.withoutMilestone).toBe(1);
    expect(report.rows.map(({ id }) => id)).toEqual([3]);
    expect(
      report.rows.length + report.withoutMilestone + report.beyondMilestones
    ).toBe(report.totalSpainApplications);
  });

  it("ignores every non-Spain program, including beyond/without milestone totals", () => {
    const cases = [
      "grenada",
      "dominica",
      "st_kitts",
      "st_lucia",
      "antigua",
      "Spain",
      "unknown",
    ].map((program, id) =>
      fixture({
        id,
        program,
        residencyCardReadyDate: reachedDate,
        residencyCardStatus: "collected",
      })
    );
    expect(build(cases)).toEqual(build([]));
  });

  it("returns no duplicate case rows and zero-initialized unmatched counts", () => {
    const oneCase = fixture({ translationDate: reachedDate });
    const report = build([oneCase, oneCase]);
    expect(report.rows).toHaveLength(1);
    expect(report.totalSpainApplications).toBe(1);
    expect(report.counts.translator_submitted).toBe(1);
  });

  it("does not mutate inputs and exposes only the exact safe report allowlist", () => {
    const privateCase = Object.freeze({
      ...fixture({
        consultant: null,
        paralegal: undefined,
        embassyReplyConfirmedAt: reachedDate,
      }),
      userId: 98,
      finClientId: 99,
      internalTeamComment: "private-note",
      clientMobile: "private-contact",
      driveLink: "private-drive",
      contractDriveLink: "private-contract",
      childrenData: [{ name: "private-child" }],
      secondPaymentAmount: "private-payment",
      spouseName: "private-spouse",
      ticketLink: "private-ticket",
    });
    const report = build(Object.freeze([privateCase]));
    expect(Object.keys(report.rows[0]).sort()).toEqual(
      [
        "id",
        "clientName",
        "clientCode",
        "program",
        "consultant",
        "paralegal",
        "currentMilestone",
        "milestoneDate",
      ].sort()
    );
    expect(report.rows[0]).toMatchObject({ consultant: null, paralegal: null });
    expect(JSON.stringify(report)).not.toContain("private-");
    expect(privateCase.embassyReplyConfirmedAt).toBe(reachedDate);
  });
});

describe("SELECT-only service and protected real router caller", () => {
  it("selects only allowed columns, Spain rows, and deterministic case order", async () => {
    const db = selectOnlyDb([fixture({ translationDate: reachedDate })]);
    mocks.getDb.mockResolvedValue(db);
    const report = await getClientDocumentationMilestoneReport();
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledWith(
      CLIENT_DOCUMENTATION_MILESTONE_PROJECTION
    );
    expect(
      Object.keys(CLIENT_DOCUMENTATION_MILESTONE_PROJECTION).sort()
    ).toEqual(
      [
        "id",
        "clientName",
        "clientCode",
        "program",
        "consultant",
        "paralegal",
        ...DOCUMENTATION_MILESTONES.map(({ field }) => field),
        "swornTranslationSubmittedAt",
        "biometricsStatus",
        "residencyCardStatus",
      ].sort()
    );
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith(clientCases);
    const where = new MySqlDialect().sqlToQuery(db.where.mock.calls[0][0]);
    expect(where.sql).toBe("`clientCases`.`program` = ?");
    expect(where.params).toEqual(["spain"]);
    expect(db.orderBy).toHaveBeenCalledTimes(1);
    expect(db.orderBy).toHaveBeenCalledWith(clientCases.id);
    expect(report.rows[0]).toMatchObject({
      currentMilestone: "translator_submitted",
    });
    expect(Number.isFinite(Date.parse(report.generatedAt))).toBe(true);
  });

  it.each(["viewer", "full"])(
    "allows clientDocs %s using the actual report caller",
    async accessLevel => {
      const db = selectOnlyDb([fixture({ translationDate: reachedDate })]);
      mocks.getDb.mockResolvedValue(db);
      mocks.getUserModuleAccess.mockResolvedValue({ clientDocs: accessLevel });
      const result = await clientDocumentationMilestoneReportsRouter
        .createCaller(context())
        .report();
      expect(result.rows).toHaveLength(1);
      expect(mocks.getUserModuleAccess).toHaveBeenCalledTimes(1);
      expect(mocks.getUserModuleAccess).toHaveBeenCalledWith(41);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        clientDocumentationMilestoneReportsRouter._def.procedures.report._def
          .type
      ).toBe("query");
    }
  );

  it("allows owner without permission lookup/default seeding", async () => {
    mocks.isOwner.mockReturnValue(true);
    mocks.getUserModuleAccess.mockRejectedValue(
      new Error("SHOULD_NOT_LOOK_UP_PERMISSIONS")
    );
    await expect(
      clientDocumentationMilestoneReportsRouter.createCaller(context()).report()
    ).resolves.toMatchObject({ rows: [] });
    expect(mocks.getUserModuleAccess).not.toHaveBeenCalled();
    expect(mocks.getDb).toHaveBeenCalledTimes(1);
  });

  it.each(["user", "admin"] as const)(
    "denies %s without clientDocs access before any case read",
    async role => {
      mocks.getUserModuleAccess.mockResolvedValue({
        clientDocs: "none",
        reports: "full",
        financial: "full",
      });
      await expect(
        clientDocumentationMilestoneReportsRouter
          .createCaller(context({ role }))
          .report()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.getDb).not.toHaveBeenCalled();
    }
  );

  it("fails closed for missing/unknown module access", async () => {
    mocks.getUserModuleAccess.mockResolvedValue({ clientDocs: "unexpected" });
    await expect(
      clientDocumentationMilestoneReportsRouter.createCaller(context()).report()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers before permissions or data reads", async () => {
    const ctx = { ...context(), user: null };
    await expect(
      clientDocumentationMilestoneReportsRouter.createCaller(ctx).report()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.isOwner).not.toHaveBeenCalled();
    expect(mocks.getUserModuleAccess).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("propagates authorization errors without reading cases", async () => {
    mocks.getUserModuleAccess.mockRejectedValue(
      new Error("PERMISSION_LOOKUP_FAILED")
    );
    await expect(
      clientDocumentationMilestoneReportsRouter.createCaller(context()).report()
    ).rejects.toThrow("PERMISSION_LOOKUP_FAILED");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("reports unavailable databases instead of fabricating an empty report", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(
      clientDocumentationMilestoneReportsRouter.createCaller(context()).report()
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, enqueueMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  enqueueMock: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./metaLeadsService", () => ({ enqueueMappedMetaCrmEvent: enqueueMock }));

import { createContractWithClientOrigin } from "./contractLeadService";

function queryResult(value: unknown[]) {
  const builder: any = {
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(value),
  };
  return builder;
}

function createDb(selectQueue: unknown[][]) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const tx: any = {
    select: vi.fn(() => queryResult(selectQueue.shift() ?? [])),
    insert: vi.fn(() => ({ values: (value: unknown) => { inserted.push(value); return Promise.resolve(); } })),
    update: vi.fn(() => ({ set: (value: unknown) => { updated.push(value); return { where: () => Promise.resolve() }; } })),
  };
  const db: any = { transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
  return { db, inserted, updated };
}

const contract = {
  contractCode: "TEST-26001",
  programCountry: "Spain Digital Nomad Visa",
  clientName: "اختبار",
  invoicingName: "Test Client",
  clientMobile: "+200000000000",
  consultantName: "Test Consultant",
  familyMembers: 1,
  contractValue: "10000.00",
  status: "pending",
  contractUrl: "https://example.invalid/contract",
  createdBy: 1,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  enqueueMock.mockResolvedValue(undefined);
});

describe("createContractWithClientOrigin", () => {
  it("creates a Referral Contract without touching Leads or Meta synchronization", async () => {
    const created = { ...contract, id: 55, clientOrigin: "referral", marketingLeadId: null };
    const state = createDb([[created]]);
    getDbMock.mockResolvedValue(state.db);

    const result = await createContractWithClientOrigin({ contract, clientOrigin: "referral", actorUserId: 1, actorName: "Tester" });

    expect(result).toMatchObject({ contract: created, linkedLeadId: null, leadStageChanged: false });
    expect(state.inserted[0]).toMatchObject({ clientOrigin: "referral", marketingLeadId: null });
    expect(state.updated).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("atomically links a Marketing Lead, changes its stage to Client, records history, and enqueues Meta after commit", async () => {
    const created = { ...contract, id: 56, clientOrigin: "marketing", marketingLeadId: 101 };
    const state = createDb([[{ id: 101, stage: "qualified" }], [], [created]]);
    getDbMock.mockResolvedValue(state.db);

    const result = await createContractWithClientOrigin({ contract, clientOrigin: "marketing", marketingLeadId: 101, actorUserId: 7, actorName: "Tester" });

    expect(result).toMatchObject({ contract: created, linkedLeadId: 101, leadStageChanged: true });
    expect(state.inserted[0]).toMatchObject({ clientOrigin: "marketing", marketingLeadId: 101 });
    expect(state.updated[0]).toMatchObject({ stage: "client" });
    expect(state.inserted[1]).toMatchObject({ leadId: 101, userId: 7, activityType: "stage_changed" });
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ leadId: 101, mappingValue: "client", sourceType: "lead_stage" }));
  });

  it("blocks a Marketing Lead already linked to a non-cancelled Contract before any write", async () => {
    const state = createDb([[{ id: 101, stage: "qualified" }], [{ contractCode: "EXISTING" }]]);
    getDbMock.mockResolvedValue(state.db);

    await expect(createContractWithClientOrigin({ contract, clientOrigin: "marketing", marketingLeadId: 101, actorUserId: 7, actorName: "Tester" }))
      .rejects.toThrow("MARKETING_LEAD_ALREADY_LINKED");
    expect(state.inserted).toHaveLength(0);
    expect(state.updated).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

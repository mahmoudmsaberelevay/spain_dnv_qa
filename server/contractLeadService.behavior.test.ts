import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, enqueueMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  enqueueMock: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./metaLeadsService", () => ({ enqueueMappedMetaCrmEvent: enqueueMock }));

import { createContractWithClientOrigin, transitionContractStatusWithLeadConversion } from "./contractLeadService";

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

describe("Marketing Lead contract lifecycle", () => {
  it("creates a Referral Contract without touching Leads or Meta synchronization", async () => {
    const created = { ...contract, id: 55, clientOrigin: "referral", marketingLeadId: null };
    const state = createDb([[created]]);
    getDbMock.mockResolvedValue(state.db);

    const result = await createContractWithClientOrigin({ contract, clientOrigin: "referral" });

    expect(result).toMatchObject({ contract: created, linkedLeadId: null });
    expect(state.inserted[0]).toMatchObject({ clientOrigin: "referral", marketingLeadId: null });
    expect(state.updated).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("links a Marketing Lead when a pending Contract is created without converting the Lead", async () => {
    const created = { ...contract, id: 56, clientOrigin: "marketing", marketingLeadId: 101 };
    const state = createDb([[{ id: 101 }], [], [created]]);
    getDbMock.mockResolvedValue(state.db);

    const result = await createContractWithClientOrigin({ contract, clientOrigin: "marketing", marketingLeadId: 101 });

    expect(result).toMatchObject({ contract: created, linkedLeadId: 101 });
    expect(state.inserted[0]).toMatchObject({ clientOrigin: "marketing", marketingLeadId: 101 });
    expect(state.updated).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("converts the linked Marketing Lead only when its pending Contract is marked Signed", async () => {
    const pendingMarketingContract = { ...contract, id: 56, clientOrigin: "marketing", marketingLeadId: 101, status: "pending" };
    const state = createDb([[pendingMarketingContract], [{ id: 101, stage: "qualified" }]]);
    getDbMock.mockResolvedValue(state.db);

    const result = await transitionContractStatusWithLeadConversion({
      contractId: 56,
      status: "signed",
      actorUserId: 7,
      actorName: "Tester",
    });

    expect(result).toMatchObject({ contract: pendingMarketingContract, statusChanged: true, linkedLeadId: 101, leadStageChanged: true });
    expect(state.updated[0]).toMatchObject({ status: "signed" });
    expect(state.updated[1]).toMatchObject({ stage: "client" });
    expect(state.inserted[0]).toMatchObject({ leadId: 101, userId: 7, activityType: "stage_changed" });
    expect(state.inserted[0]).toMatchObject({ description: expect.stringContaining("marked Signed") });
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ leadId: 101, mappingValue: "client", sourceType: "lead_stage" }));
  });

  it("does not convert a linked Marketing Lead when the Contract is cancelled", async () => {
    const pendingMarketingContract = { ...contract, id: 56, clientOrigin: "marketing", marketingLeadId: 101, status: "pending" };
    const state = createDb([[pendingMarketingContract]]);
    getDbMock.mockResolvedValue(state.db);

    const result = await transitionContractStatusWithLeadConversion({
      contractId: 56,
      status: "cancelled",
      actorUserId: 7,
      actorName: "Tester",
    });

    expect(result).toMatchObject({ statusChanged: true, linkedLeadId: null, leadStageChanged: false });
    expect(state.updated).toEqual([expect.objectContaining({ status: "cancelled" })]);
    expect(state.inserted).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does not repeat Lead conversion, history, or Meta synchronization for an already Signed Contract", async () => {
    const signedMarketingContract = { ...contract, id: 56, clientOrigin: "marketing", marketingLeadId: 101, status: "signed" };
    const state = createDb([[signedMarketingContract]]);
    getDbMock.mockResolvedValue(state.db);

    const result = await transitionContractStatusWithLeadConversion({
      contractId: 56,
      status: "signed",
      actorUserId: 7,
      actorName: "Tester",
    });

    expect(result).toMatchObject({ statusChanged: false, linkedLeadId: null, leadStageChanged: false });
    expect(state.updated).toHaveLength(0);
    expect(state.inserted).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("blocks a Marketing Lead already linked to a non-cancelled Contract before any write", async () => {
    const state = createDb([[{ id: 101 }], [{ contractCode: "EXISTING" }]]);
    getDbMock.mockResolvedValue(state.db);

    await expect(createContractWithClientOrigin({ contract, clientOrigin: "marketing", marketingLeadId: 101 }))
      .rejects.toThrow("MARKETING_LEAD_ALREADY_LINKED");
    expect(state.inserted).toHaveLength(0);
    expect(state.updated).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  getCasesByUserId: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      clientName: "Ahmed Mohamed Hassan",
      clientEmail: "ahmed@example.com",
      clientNationality: "Egyptian",
      notes: null,
      status: "draft",
      passportFullName: null,
      passportNumber: null,
      passportDob: null,
      passportPob: null,
      passportExpiry: null,
      wizardStep: 1,
      analysisCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getCaseById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    clientName: "Ahmed Mohamed Hassan",
    clientEmail: "ahmed@example.com",
    clientNationality: "Egyptian",
    notes: null,
    status: "draft",
    passportFullName: null,
    passportNumber: null,
    passportDob: null,
    passportPob: null,
    passportExpiry: null,
    wizardStep: 1,
    analysisCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createCase: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateCase: vi.fn().mockResolvedValue(undefined),
  deleteCase: vi.fn().mockResolvedValue(undefined),
  getDocumentsByCaseId: vi.fn().mockResolvedValue([]),
  getDocumentById: vi.fn().mockResolvedValue(null),
  createDocument: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateDocument: vi.fn().mockResolvedValue(undefined),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  upsertAnalysisResult: vi.fn().mockResolvedValue(undefined),
  getAnalysisResultByCaseId: vi.fn().mockResolvedValue(null),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/test.jpg", key: "test/test.jpg" }),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ fullName: "AHMED MOHAMED HASSAN", dateOfBirth: "01/01/1990", placeOfBirth: "Cairo", passportNumber: "A12345678", expiryDate: "01/01/2030", nationality: "Egyptian", gender: "M", issuingCountry: "Egypt" }) } }],
  }),
}));

function createAuthContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("cases.list", () => {
  it("returns cases for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.cases.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].clientName).toBe("Ahmed Mohamed Hassan");
  });
});

describe("cases.get", () => {
  it("returns a specific case by id", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.cases.get({ id: 1 });
    expect(result).toBeDefined();
    expect(result?.clientName).toBe("Ahmed Mohamed Hassan");
    expect(result?.status).toBe("draft");
  });

  it("throws NOT_FOUND for case belonging to different user", async () => {
    const { getCaseById } = await import("./db");
    vi.mocked(getCaseById).mockResolvedValueOnce({
      id: 2,
      userId: 999, // different user
      clientName: "Other User",
      clientEmail: null,
      clientNationality: null,
      notes: null,
      status: "draft",
      passportFullName: null,
      passportNumber: null,
      passportDob: null,
      passportPob: null,
      passportExpiry: null,
      wizardStep: 1,
      analysisCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const ctx = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.cases.get({ id: 2 })).rejects.toThrow("NOT_FOUND");
  });
});

describe("cases.create", () => {
  it("creates a new case and returns it", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.cases.create({
      clientName: "Test Client",
      clientEmail: "test@example.com",
      clientNationality: "Egyptian",
    });
    expect(result).toBeDefined();
    expect(result?.clientName).toBe("Ahmed Mohamed Hassan"); // mocked return
  });
});

describe("cases.update", () => {
  it("updates case fields", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.cases.update({
      id: 1,
      clientName: "Updated Name",
      status: "in_progress",
    });
    expect(result).toBeDefined();
  });
});

describe("auth.logout", () => {
  it("clears session cookie on logout", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("analysis.getResult", () => {
  it("returns null when no analysis exists", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analysis.getResult({ caseId: 1 });
    expect(result).toBeNull();
  });
});

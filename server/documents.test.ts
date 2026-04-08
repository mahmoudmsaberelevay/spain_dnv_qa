import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db
vi.mock("./db", () => ({
  getCasesByUserId: vi.fn().mockResolvedValue([]),
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
  getDocumentsByCaseId: vi.fn().mockResolvedValue([
    {
      id: 1,
      caseId: 1,
      userId: 1,
      docType: "passport_main",
      fileName: "passport.jpg",
      fileUrl: "https://cdn.example.com/passport.jpg",
      fileKey: "cases/1/passport_main-abc123.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024,
      analysisStatus: "pending",
      analysisResult: null,
      createdAt: new Date(),
    },
  ]),
  getDocumentById: vi.fn().mockResolvedValue({
    id: 1,
    caseId: 1,
    userId: 1,
    docType: "passport_main",
    fileName: "passport.jpg",
    fileUrl: "https://cdn.example.com/passport.jpg",
    fileKey: "cases/1/passport_main-abc123.jpg",
    mimeType: "image/jpeg",
    fileSize: 1024,
    analysisStatus: "pending",
    analysisResult: null,
    createdAt: new Date(),
  }),
  createDocument: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateDocument: vi.fn().mockResolvedValue(undefined),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  upsertAnalysisResult: vi.fn().mockResolvedValue(undefined),
  getAnalysisResultByCaseId: vi.fn().mockResolvedValue(null),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/test.jpg", key: "test/test.jpg" }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          fullName: "AHMED MOHAMED HASSAN",
          dateOfBirth: "01/01/1990",
          placeOfBirth: "Cairo",
          passportNumber: "A12345678",
          expiryDate: "01/01/2030",
          nationality: "Egyptian",
          gender: "M",
          issuingCountry: "Egypt",
        }),
      },
    }],
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

describe("documents.list", () => {
  it("returns documents for a case", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.documents.list({ caseId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].docType).toBe("passport_main");
  });

  it("throws NOT_FOUND for case belonging to different user", async () => {
    const { getCaseById } = await import("./db");
    vi.mocked(getCaseById).mockResolvedValueOnce({
      id: 2,
      userId: 999,
      clientName: "Other",
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
    await expect(caller.documents.list({ caseId: 2 })).rejects.toThrow("NOT_FOUND");
  });
});

describe("documents.upload", () => {
  it("uploads a document and returns document record", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a minimal base64 image (1x1 pixel JPEG)
    const minimalBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=";

    const result = await caller.documents.upload({
      caseId: 1,
      docType: "passport_main",
      fileName: "passport.jpg",
      fileBase64: minimalBase64,
      mimeType: "image/jpeg",
      fileSize: 1024,
    });

    expect(result).toBeDefined();
    expect(result?.docType).toBe("passport_main");
  });
});

describe("analysis.extractPassportData", () => {
  it("extracts passport data from uploaded document", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analysis.extractPassportData({ documentId: 1 });

    expect(result).toBeDefined();
    expect(result.fullName).toBe("AHMED MOHAMED HASSAN");
    expect(result.passportNumber).toBe("A12345678");
    expect(result.dateOfBirth).toBe("01/01/1990");
  });
});

describe("analysis.runFullAnalysis", () => {
  it("throws BAD_REQUEST when no documents uploaded", async () => {
    const { getDocumentsByCaseId } = await import("./db");
    vi.mocked(getDocumentsByCaseId).mockResolvedValueOnce([]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analysis.runFullAnalysis({ caseId: 1 })).rejects.toThrow();
  });
});

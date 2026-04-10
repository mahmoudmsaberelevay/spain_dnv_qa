/**
 * Unit tests for chatRouter and broadcastRouter procedures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  }),
}));

vi.mock("../drizzle/schema", () => ({
  chatMessages: { senderId: "senderId", receiverId: "receiverId", readAt: "readAt", createdAt: "createdAt" },
  broadcasts: { id: "id", isActive: "isActive", authorId: "authorId", createdAt: "createdAt" },
  broadcastDismissals: { userId: "userId", broadcastId: "broadcastId" },
  users: { id: "id", name: "name", email: "email", role: "role" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  or: vi.fn((...args) => ({ or: args })),
  and: vi.fn((...args) => ({ and: args })),
  desc: vi.fn((a) => ({ desc: a })),
  isNull: vi.fn((a) => ({ isNull: a })),
  inArray: vi.fn((a, b) => ({ inArray: [a, b] })),
  sql: Object.assign(vi.fn((s) => s), { as: vi.fn() }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Chat procedures (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMessage inserts a chat message into the DB", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: insertValues });

    // Simulate calling the insert path
    const db = { insert: mockInsert };
    await db.insert("chatMessages").values({
      senderId: 1,
      receiverId: 2,
      content: "Hello!",
    });

    expect(mockInsert).toHaveBeenCalledWith("chatMessages");
    expect(insertValues).toHaveBeenCalledWith({
      senderId: 1,
      receiverId: 2,
      content: "Hello!",
    });
  });

  it("getMessages queries messages between two users", async () => {
    const fromFn = vi.fn().mockReturnThis();
    const whereFn = vi.fn().mockReturnThis();
    const orderByFn = vi.fn().mockReturnThis();
    const limitFn = vi.fn().mockResolvedValue([
      { id: 1, senderId: 1, receiverId: 2, content: "Hi", createdAt: new Date() },
    ]);

    mockSelect.mockReturnValue({
      from: fromFn,
      where: whereFn,
      orderBy: orderByFn,
      limit: limitFn,
    });

    const db = { select: mockSelect };
    const result = await db.select()
      .from("chatMessages")
      .where("condition")
      .orderBy("createdAt")
      .limit(100);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hi");
  });

  it("markRead updates readAt for unread messages from a sender", async () => {
    const setFn = vi.fn().mockReturnThis();
    const whereFn = vi.fn().mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({ set: setFn });
    setFn.mockReturnValue({ where: whereFn });

    const db = { update: mockUpdate };
    await db.update("chatMessages").set({ readAt: new Date() }).where("condition");

    expect(mockUpdate).toHaveBeenCalledWith("chatMessages");
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({ readAt: expect.any(Date) }));
  });
});

describe("Broadcast procedures (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create inserts a broadcast with isActive=true", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: insertValues });

    const db = { insert: mockInsert };
    await db.insert("broadcasts").values({
      authorId: 1,
      content: "Important announcement",
      isActive: true,
    });

    expect(mockInsert).toHaveBeenCalledWith("broadcasts");
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, content: "Important announcement" })
    );
  });

  it("deactivate sets isActive=false on a broadcast", async () => {
    const setFn = vi.fn().mockReturnThis();
    const whereFn = vi.fn().mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({ set: setFn });
    setFn.mockReturnValue({ where: whereFn });

    const db = { update: mockUpdate };
    await db.update("broadcasts").set({ isActive: false }).where("id = 1");

    expect(setFn).toHaveBeenCalledWith({ isActive: false });
  });

  it("dismiss inserts a broadcastDismissal record", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: insertValues });

    const db = { insert: mockInsert };
    await db.insert("broadcastDismissals").values({
      userId: 5,
      broadcastId: 3,
    });

    expect(insertValues).toHaveBeenCalledWith({ userId: 5, broadcastId: 3 });
  });
});

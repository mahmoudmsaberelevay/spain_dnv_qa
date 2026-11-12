import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const h = vi.hoisted(() => ({
  actor: {
    id: 21,
    name: "Employee",
    email: "employee@example.test",
    role: "user" as "user" | "admin",
  },
  signed: true,
  sameOrigin: true,
  importAllowed: true,
  calls: [] as any[],
  catalogue: vi.fn(),
  store: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
}));
vi.mock("./plaudAccess", () => ({
  requirePlaudActor: vi.fn(async () => {
    if (!h.signed) throw new TRPCError({ code: "UNAUTHORIZED" });
    return h.actor;
  }),
  requirePlaudSameOrigin: vi.fn(() => {
    if (!h.sameOrigin) throw new TRPCError({ code: "FORBIDDEN" });
  }),
  plaudSessionHash: () => "a".repeat(64),
  requirePlaudLead: vi.fn(),
  requirePlaudImportLead: vi.fn(async () => {
    if (!h.importAllowed)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "PLAUD_LEAD_IMPORT_DENIED",
      });
  }),
}));
vi.mock("./plaudTranscriptDb", () => ({
  listPlaudCatalogue: h.catalogue,
  storePlaudImport: h.store,
}));
vi.mock("./plaudProvider", () => ({
  PlaudProvider: class {
    async status(id: number) {
      h.calls.push(["status", id]);
      return { connected: false, needsReconnect: false };
    }
    async start(...args: any[]) {
      h.calls.push(["start", ...args]);
      return {
        authorizationUrl: "https://mcp.plaud.ai/authorize?state=synthetic",
      };
    }
    async disconnect(id: number) {
      h.calls.push(["disconnect", id]);
    }
    listRecordings = h.list;
    readRecording = h.read;
  },
}));
import { plaudRouter, safePlaudMessage } from "./plaudRouter";
const ctx = () => ({ req: { headers: {} }, res: {}, user: null }) as any;
beforeEach(() => {
  vi.clearAllMocks();
  h.signed = true;
  h.sameOrigin = true;
  h.importAllowed = true;
  h.actor.role = "user";
  h.calls = [];
  h.catalogue.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    timeZone: "Africa/Cairo",
  });
  h.store.mockResolvedValue({ noteId: 10, alreadyImported: false });
  h.read.mockResolvedValue({
    id: "own-recording",
    transcript: "Original source",
  });
  h.list.mockResolvedValue({ items: [], page: 1, hasMore: false });
});
describe("explicit shared Plaud router policy", () => {
  it("accepts an ordinary signed CRM employee without Lead import permission or a new module grant", async () => {
    h.importAllowed = false;
    const result = await plaudRouter
      .createCaller(ctx())
      .catalogue({ page: 1, pageSize: 20 });
    expect(result.total).toBe(0);
    expect(h.catalogue).toHaveBeenCalledWith(h.actor, expect.any(Object));
    expect(h.calls).toEqual([]);
    expect(h.read).not.toHaveBeenCalled();
  });
  it("does not trust ctx.user or a cron-shaped object without independently signed current identity", async () => {
    h.signed = false;
    const caller = plaudRouter.createCaller({
      ...ctx(),
      user: { id: 1, role: "admin" },
      isCron: true,
    } as any);
    await expect(
      caller.catalogue({ page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.connection()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(h.catalogue).not.toHaveBeenCalled();
  });
  it("limits private status, listing, connection and disconnection to the signed employee", async () => {
    const caller = plaudRouter.createCaller(ctx());
    await caller.connection();
    await caller.recordings({ leadId: 81, page: 2 });
    await caller.connect({ leadId: 81, acknowledgedSharing: true });
    await caller.disconnect();
    expect(h.calls).toEqual([
      ["status", 21],
      ["start", 21, "a".repeat(64), "/leads/81"],
      ["disconnect", 21],
    ]);
    expect(h.list).toHaveBeenCalledWith(21, 2);
  });
  it("requires explicit sharing acknowledgement and existing scoped Lead import permissions", async () => {
    const caller = plaudRouter.createCaller(ctx());
    await expect(
      caller.importRecording({
        leadId: 81,
        recordingId: "x",
        acknowledgedSharing: false,
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    h.importAllowed = false;
    await expect(
      caller.importRecording({
        leadId: 81,
        recordingId: "x",
        acknowledgedSharing: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.read).not.toHaveBeenCalled();
    expect(h.store).not.toHaveBeenCalled();
  });
  it("imports one selected server-fetched source, never user-supplied transcript/account scope", async () => {
    const result = await plaudRouter
      .createCaller(ctx())
      .importRecording({
        leadId: 81,
        recordingId: "own-recording",
        acknowledgedSharing: true,
      });
    expect(result.noteId).toBe(10);
    expect(h.read).toHaveBeenCalledWith(21, "own-recording");
    expect(h.store).toHaveBeenCalledWith(h.actor, 81, {
      id: "own-recording",
      transcript: "Original source",
    });
    await expect(
      plaudRouter
        .createCaller(ctx())
        .importRecording({
          leadId: 81,
          recordingId: "x",
          acknowledgedSharing: true,
          transcript: "forged",
        } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("rejects cross-origin connection/import/disconnect mutations", async () => {
    h.sameOrigin = false;
    const caller = plaudRouter.createCaller(ctx());
    await expect(caller.disconnect()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.calls).toEqual([]);
  });
  it("validates complete, ordered real dates and rejects hidden filters or another user ID", async () => {
    const caller = plaudRouter.createCaller(ctx());
    for (const input of [
      { from: "2026-11-01" },
      { from: "2026-11-12", to: "2026-11-01" },
      { from: "2026-02-30", to: "2026-03-01" },
    ])
      await expect(
        caller.catalogue({ ...input, page: 1, pageSize: 20 })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "PLAUD_DATE_RANGE_INVALID",
      });
    await expect(
      caller.catalogue({ page: 1, pageSize: 20, userId: 999 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.catalogue).not.toHaveBeenCalled();
  });
  it("never returns provider messages, private URLs, keys or transcript text in errors", async () => {
    h.read.mockRejectedValue(
      new Error(
        "Private body https://private.example/token?secret=forbidden Original source"
      )
    );
    await expect(
      plaudRouter
        .createCaller(ctx())
        .importRecording({
          leadId: 81,
          recordingId: "x",
          acknowledgedSharing: true,
        })
    ).rejects.toMatchObject({ message: "PLAUD_OPERATION_FAILED" });
    expect(safePlaudMessage(new Error("PLAUD_RECONNECT_REQUIRED"))).toBe(
      "PLAUD_RECONNECT_REQUIRED"
    );
    expect(safePlaudMessage(new Error("raw token"))).toBe(
      "PLAUD_OPERATION_FAILED"
    );
  });
});

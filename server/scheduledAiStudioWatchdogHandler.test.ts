import { describe, expect, it, vi } from "vitest";
import { createScheduledAiStudioWatchdogHandler } from "./scheduledAiStudioWatchdogHandler";

function response() {
  const out: any = { statusCode: 200, body: undefined };
  out.status = (code: number) => { out.statusCode = code; return out; };
  out.json = (body: unknown) => { out.body = body; return out; };
  return out;
}

describe("scheduled AI Studio watchdog", () => {
  it("rejects unsigned and ordinary requests before running recovery", async () => {
    const runWatchdog = vi.fn();
    const unsigned = createScheduledAiStudioWatchdogHandler({ authenticateRequest: vi.fn().mockRejectedValue(new Error("unsigned")), runWatchdog });
    const first = response(); await unsigned({} as any, first as any);
    expect(first.statusCode).toBe(401); expect(runWatchdog).not.toHaveBeenCalled();

    const ordinary = createScheduledAiStudioWatchdogHandler({ authenticateRequest: vi.fn().mockResolvedValue({ isCron: false }), runWatchdog });
    const second = response(); await ordinary({} as any, second as any);
    expect(second.statusCode).toBe(403); expect(runWatchdog).not.toHaveBeenCalled();
  });

  it("runs only for a verified platform cron", async () => {
    const runWatchdog = vi.fn().mockResolvedValue({ ok: true });
    const handler = createScheduledAiStudioWatchdogHandler({ authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "watchdog-task" }), runWatchdog });
    const out = response(); await handler({} as any, out as any);
    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual({ ok: true, taskUid: "watchdog-task" });
    expect(runWatchdog).toHaveBeenCalledOnce();
  });
});

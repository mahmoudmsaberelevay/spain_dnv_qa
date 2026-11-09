import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";
import {
  createLeadCallRecoveryHandler,
  CALL_RECOVERY_CRON,
  CALL_RECOVERY_PATH,
} from "./leadCallRecovery";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
const request = { body: { taskUid: "attacker-job", leadId: 1 } } as Request;

describe("managed CRM call recovery", () => {
  it("uses an application-native scheduled endpoint and one-minute platform cadence", () => {
    expect(CALL_RECOVERY_PATH).toBe("/api/scheduled/lead-calls");
    expect(CALL_RECOVERY_CRON).toBe("0 * * * * *");
  });
  it("checks the configured browser-origin allowlist for owner mutations", () => {
    const source = readFileSync(
      new URL("./leadCallRecovery.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain(
      'config.browserOrigins.includes(ctx.req.headers.origin ?? "")'
    );
  });
  it("rejects unauthenticated scheduler requests before database or provider work", async () => {
    const deps = {
      authenticate: vi
        .fn()
        .mockRejectedValue(new Error("synthetic credential should not escape")),
      policyEnabled: vi.fn(),
      run: vi.fn(),
    };
    const res = response();
    await createLeadCallRecoveryHandler(deps)(
      request,
      res as unknown as Response
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(deps.policyEnabled).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("rejects ordinary users and missing scheduler identities", async () => {
    for (const identity of [
      { isCron: false, taskUid: "verified-job" },
      { isCron: true },
    ]) {
      const deps = {
        authenticate: vi.fn().mockResolvedValue(identity),
        policyEnabled: vi.fn(),
        run: vi.fn(),
      };
      const res = response();
      await createLeadCallRecoveryHandler(deps)(
        request,
        res as unknown as Response
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(deps.run).not.toHaveBeenCalled();
    }
  });
  it("matches only the verified job UID and ignores attacker body identifiers", async () => {
    const deps = {
      authenticate: vi
        .fn()
        .mockResolvedValue({ isCron: true, taskUid: "verified-job" }),
      policyEnabled: vi.fn().mockResolvedValue(true),
      run: vi.fn().mockResolvedValue({ processed: 1 }),
    };
    const res = response();
    await createLeadCallRecoveryHandler(deps)(
      request,
      res as unknown as Response
    );
    expect(deps.policyEnabled).toHaveBeenCalledWith("verified-job");
    expect(deps.run).toHaveBeenCalledTimes(1);
    expect(deps.run.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      result: { processed: 1 },
    });
  });
  it("acknowledges paused and orphan schedules without provider work", async () => {
    const deps = {
      authenticate: vi
        .fn()
        .mockResolvedValue({ isCron: true, taskUid: "paused-job" }),
      policyEnabled: vi.fn().mockResolvedValue(false),
      run: vi.fn(),
    };
    const res = response();
    await createLeadCallRecoveryHandler(deps)(
      request,
      res as unknown as Response
    );
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      skipped: "inactive-or-orphan",
    });
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("never returns upstream messages, recording URLs, transcript or credentials on failure", async () => {
    const deps = {
      authenticate: vi
        .fn()
        .mockResolvedValue({ isCron: true, taskUid: "verified-job" }),
      policyEnabled: vi.fn().mockResolvedValue(true),
      run: vi
        .fn()
        .mockRejectedValue(
          new Error("synthetic credential and private transcript")
        ),
    };
    const res = response();
    await createLeadCallRecoveryHandler(deps)(
      request,
      res as unknown as Response
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "CALL_RECOVERY_FAILED",
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(
      "synthetic credential"
    );
  });
});

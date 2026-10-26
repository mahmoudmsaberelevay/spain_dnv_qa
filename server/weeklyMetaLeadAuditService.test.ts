import { describe, expect, it } from "vitest";
import { isCairoWeeklyMetaLeadAuditWindow, makeWeeklyMetaLeadAuditRunKey } from "./weeklyMetaLeadAuditService";

describe("weekly Meta lead audit Cairo schedule", () => {
  it("runs at Saturday 21:00 Cairo in both standard time and daylight-saving time", () => {
    expect(isCairoWeeklyMetaLeadAuditWindow(Date.parse("2026-01-03T19:00:00Z"))).toBe(true);
    expect(isCairoWeeklyMetaLeadAuditWindow(Date.parse("2026-07-18T18:00:00Z"))).toBe(true);
    expect(isCairoWeeklyMetaLeadAuditWindow(Date.parse("2026-07-18T19:00:00Z"))).toBe(false);
  });

  it("uses one idempotency key per Cairo Saturday audit date", () => {
    expect(makeWeeklyMetaLeadAuditRunKey("ignored", Date.parse("2026-07-18T18:00:00Z")))
      .toBe("meta-lead-weekly-audit:2026-07-18");
  });
});

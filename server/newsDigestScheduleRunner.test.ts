import { describe, expect, it } from "vitest";
import { isCairoNewsDigestHour } from "../scripts/run-news-digest-import";

describe("Daily Digest schedule runner", () => {
  it("runs at 09:30 Cairo across summer and winter time offsets", () => {
    expect(isCairoNewsDigestHour(new Date("2026-09-20T06:30:00Z"))).toBe(true);
    expect(isCairoNewsDigestHour(new Date("2026-01-20T07:30:00Z"))).toBe(true);
  });

  it("skips the alternate UTC slot instead of importing twice", () => {
    expect(isCairoNewsDigestHour(new Date("2026-09-20T07:30:00Z"))).toBe(false);
    expect(isCairoNewsDigestHour(new Date("2026-01-20T06:30:00Z"))).toBe(false);
  });
});

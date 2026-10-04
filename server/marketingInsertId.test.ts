import { describe, expect, it } from "vitest";
import { requireMarketingInsertId } from "./marketingInsertId";

describe("Marketing insert-ID compatibility", () => {
  it("reads the actual mysql2/Drizzle tuple-shaped result", () => {
    expect(requireMarketingInsertId([{ fieldCount: 0, affectedRows: 1, insertId: 60003 }, []])).toBe(60003);
  });
  it("continues to accept a direct adapter result", () => {
    expect(requireMarketingInsertId({ insertId: 41 })).toBe(41);
    expect(requireMarketingInsertId([{ insertId: BigInt(42) }, []])).toBe(42);
  });
  it("never propagates a missing, zero or unsafe ID into a database insert", () => {
    for (const result of [undefined, {}, [], [{ insertId: 0 }, []], { insertId: "NaN" }, { insertId: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(() => requireMarketingInsertId(result)).toThrow("valid new Marketing record ID");
    }
  });
});

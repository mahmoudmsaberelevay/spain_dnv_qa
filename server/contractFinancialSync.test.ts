import { describe, expect, it } from "vitest";
import { linkedClientContractFinancialState } from "./contractFinancialSync";

describe("linked Client Database contract financial state", () => {
  it("keeps the discounted contract value net and derives the remaining balance from paid EUR", () => {
    expect(linkedClientContractFinancialState(11_000, 3_297.3)).toEqual({
      contractValueEur: "11000.00",
      remainingAmountEur: "7702.70",
    });
  });

  it("never subtracts the discount a second time and prevents a negative remaining balance", () => {
    expect(linkedClientContractFinancialState(11_000, 12_000)).toEqual({
      contractValueEur: "11000.00",
      remainingAmountEur: "0.00",
    });
  });

  it("returns a single net value suitable for both legacy and EUR Client Database value fields", () => {
    const synced = linkedClientContractFinancialState(9_000, 2_810.81);
    expect(synced.contractValueEur).toBe("9000.00");
    expect(synced.remainingAmountEur).toBe("6189.19");
  });
});

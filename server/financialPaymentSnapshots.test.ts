import { describe, expect, it } from "vitest";
import {
  calculatePaymentEurEquivalent,
  calculateReceiptBalanceSnapshot,
} from "../shared/financialPaymentSnapshots";

describe("immutable payment snapshots", () => {
  it("keeps each entered EGP rate and produces the agreed €10,000 contract example", () => {
    const firstPaymentEur = calculatePaymentEurEquivalent({
      actualAmount: 186_000,
      currency: "EGP",
      exchangeRate: 62,
    });
    expect(firstPaymentEur).toBe(3_000);

    const afterFirst = calculateReceiptBalanceSnapshot({
      netContractValueEur: 10_000,
      totalPaidBeforeEur: 0,
      paymentEurEquivalent: firstPaymentEur,
    });
    expect(afterFirst.remainingBeforeEur).toBe(10_000);
    expect(afterFirst.remainingAfterEur).toBe(7_000);

    const secondPaymentEur = calculatePaymentEurEquivalent({
      actualAmount: 295_000,
      currency: "EGP",
      exchangeRate: 59,
    });
    expect(secondPaymentEur).toBe(5_000);

    const afterSecond = calculateReceiptBalanceSnapshot({
      netContractValueEur: 10_000,
      totalPaidBeforeEur: firstPaymentEur,
      paymentEurEquivalent: secondPaymentEur,
    });
    expect(afterSecond.remainingBeforeEur).toBe(7_000);
    expect(afterSecond.remainingAfterEur).toBe(2_000);
    expect(186_000 + 295_000).toBe(481_000);
  });

  it("does not silently rewrite an entered exchange rate", () => {
    expect(calculatePaymentEurEquivalent({
      actualAmount: 295_000,
      currency: "EGP",
      exchangeRate: 56,
    })).toBe(5_267.86);
  });

  it("supports USD payments with the entered USD-per-EUR rate", () => {
    expect(calculatePaymentEurEquivalent({
      actualAmount: 3_250,
      currency: "USD",
      exchangeRate: 1.25,
    })).toBe(2_600);
  });
});

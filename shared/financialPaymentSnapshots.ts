export type PaymentCurrency = "EGP" | "EUR" | "USD";

export type PaymentSnapshotInput = {
  actualAmount: number;
  currency: PaymentCurrency;
  exchangeRate: number;
};

export type ReceiptBalanceSnapshotInput = {
  netContractValueEur: number;
  totalPaidBeforeEur: number;
  paymentEurEquivalent: number;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePaymentEurEquivalent(input: PaymentSnapshotInput): number {
  if (!Number.isFinite(input.actualAmount) || input.actualAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0) {
    throw new Error("Exchange rate must be greater than zero.");
  }

  if (input.currency === "EUR") return roundMoney(input.actualAmount);
  return roundMoney(input.actualAmount / input.exchangeRate);
}

export function calculateReceiptBalanceSnapshot(input: ReceiptBalanceSnapshotInput) {
  const netContractValueEur = Math.max(0, roundMoney(input.netContractValueEur));
  const totalPaidBeforeEur = Math.max(0, roundMoney(input.totalPaidBeforeEur));
  const paymentEurEquivalent = Math.max(0, roundMoney(input.paymentEurEquivalent));
  const remainingBeforeEur = Math.max(0, roundMoney(netContractValueEur - totalPaidBeforeEur));
  const remainingAfterEur = Math.max(0, roundMoney(remainingBeforeEur - paymentEurEquivalent));

  return {
    netContractValueEur,
    totalPaidBeforeEur,
    paymentEurEquivalent,
    remainingBeforeEur,
    remainingAfterEur,
  };
}

export function normalizePaymentCurrency(value: string | null | undefined): PaymentCurrency {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "EUR" || normalized === "EGP" || normalized === "USD") return normalized;
  throw new Error("Client payments must be recorded in EGP, EUR, or USD.");
}

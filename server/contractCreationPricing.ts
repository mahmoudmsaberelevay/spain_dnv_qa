export interface ContractCreationPricing {
  originalContractValue: number;
  discountValue: number;
  netContractValue: number;
}

/** Amounts are in the selected contract currency; no FX conversion is performed. */
export function calculateContractCreationPricing(
  originalValue: number,
  discountValue = 0,
): ContractCreationPricing {
  if (!Number.isFinite(originalValue) || originalValue < 0) {
    throw new Error("Original contract value must be a finite non-negative amount.");
  }
  // Round the family/manual original once, then subtract integer cents.
  const originalCents = Math.round((originalValue + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(originalCents)) {
    throw new Error("Original contract value is too large.");
  }
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    throw new Error("Discount must be a finite non-negative amount in the contract currency.");
  }
  if (Number(discountValue.toFixed(2)) !== discountValue) {
    throw new Error("Discount must have at most two decimal places.");
  }
  const discountCents = Math.round(discountValue * 100);
  if (!Number.isSafeInteger(discountCents) || discountCents > originalCents) {
    throw new Error("Discount cannot exceed the original contract value.");
  }
  return {
    originalContractValue: originalCents / 100,
    discountValue: discountCents / 100,
    netContractValue: (originalCents - discountCents) / 100,
  };
}

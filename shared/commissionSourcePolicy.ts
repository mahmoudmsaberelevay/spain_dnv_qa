export type CommissionLeadSource = "Sales Mining" | "Referal" | "Marketing";
export type QualifierCommissionAmount = string | number | null | undefined;

export function hasPositiveQualifierCommission(amount: QualifierCommissionAmount): boolean {
  if (amount === null || amount === undefined || amount === "") return false;
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount) && numericAmount > 0;
}

export function enforceQualifierCommissionMarketingSource<
  T extends {
    qualifierCommissionAmount?: QualifierCommissionAmount;
    leadSource?: CommissionLeadSource | "" | null;
  },
>(record: T): T {
  if (!hasPositiveQualifierCommission(record.qualifierCommissionAmount)) return record;
  return { ...record, leadSource: "Marketing" };
}

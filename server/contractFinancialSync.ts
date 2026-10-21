/**
 * Contracting keeps contracts.contractValue as the net amount after a one-time
 * discount.  Financial-client rows mirror that net amount and must never
 * subtract the discount a second time.
 */
export function linkedClientContractFinancialState(
  contractNetValueEur: number,
  paidAmountEur: number,
) {
  const netCents = Math.max(0, Math.round(Number(contractNetValueEur || 0) * 100));
  const paidCents = Math.max(0, Math.round(Number(paidAmountEur || 0) * 100));
  const remainingCents = Math.max(0, netCents - paidCents);

  return {
    contractValueEur: (netCents / 100).toFixed(2),
    remainingAmountEur: (remainingCents / 100).toFixed(2),
  };
}

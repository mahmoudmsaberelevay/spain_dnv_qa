import { getDb } from "./db";

// Exchange rates (can be updated dynamically)
const EXCHANGE_RATES = {
  EGP_TO_USD: 0.032,
  EGP_TO_EUR: 0.029,
  USD_TO_EUR: 0.92,
  USD_TO_EGP: 31.25,
  EUR_TO_USD: 1.09,
  EUR_TO_EGP: 34.48,
};

// ─── Currency Conversion ──────────────────────────────────────────────────────
export function convertCurrency(amount: number, from: "EGP" | "USD" | "EUR", to: "EGP" | "USD" | "EUR"): number {
  if (from === to) return amount;
  
  let usdAmount: number;
  
  // Convert to USD first
  switch (from) {
    case "EGP":
      usdAmount = amount * EXCHANGE_RATES.EGP_TO_USD;
      break;
    case "USD":
      usdAmount = amount;
      break;
    case "EUR":
      usdAmount = amount * EXCHANGE_RATES.EUR_TO_USD;
      break;
  }
  
  // Convert from USD to target currency
  switch (to) {
    case "EGP":
      return usdAmount * EXCHANGE_RATES.USD_TO_EGP;
    case "USD":
      return usdAmount;
    case "EUR":
      return usdAmount * EXCHANGE_RATES.USD_TO_EUR;
  }
}

// ─── Financial Monthly Summary ────────────────────────────────────────────────
export async function listFinancialSummaries(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  
  const query = `
    SELECT * FROM financialMonthlySummary 
    WHERE 1=1 
    ${opts?.dateFrom ? `AND summaryDate >= '${opts.dateFrom.toISOString().split('T')[0]}'` : ''}
    ${opts?.dateTo ? `AND summaryDate <= '${opts.dateTo.toISOString().split('T')[0]}'` : ''}
    ORDER BY summaryDate DESC
  `;
  
  try {
    const result = await db.execute(query as any);
    return result as any[];
  } catch (error) {
    console.error("Error fetching financial summaries:", error);
    return [];
  }
}

export async function getFinancialSummary(id: number) {
  const db = await getDb(); if (!db) return null;
  
  const query = `SELECT * FROM financialMonthlySummary WHERE id = ${id}`;
  try {
    const result = await db.execute(query as any);
    return (result as any[])[0] || null;
  } catch (error) {
    console.error("Error fetching financial summary:", error);
    return null;
  }
}

export async function createFinancialSummary(data: {
  summaryDate: Date;
  totalSalesEgp?: number;
  totalSalesUsd?: number;
  totalSalesEur?: number;
  totalIncomeEgp?: number;
  totalIncomeUsd?: number;
  totalIncomeEur?: number;
  totalExpensesEgp?: number;
  totalExpensesUsd?: number;
  totalExpensesEur?: number;
  salariesEgp?: number;
  salariesUsd?: number;
  salariesEur?: number;
  commissionsEgp?: number;
  commissionsUsd?: number;
  commissionsEur?: number;
  mofaEgp?: number;
  mofaUsd?: number;
  mofaEur?: number;
  embassyEgp?: number;
  embassyUsd?: number;
  embassyEur?: number;
  translationFeesEgp?: number;
  translationFeesUsd?: number;
  translationFeesEur?: number;
  lawyerFeesEgp?: number;
  lawyerFeesUsd?: number;
  lawyerFeesEur?: number;
  officeExpensesEgp?: number;
  officeExpensesUsd?: number;
  officeExpensesEur?: number;
  officeRentEgp?: number;
  officeRentUsd?: number;
  officeRentEur?: number;
  miscEgp?: number;
  miscUsd?: number;
  miscEur?: number;
}) {
  const db = await getDb(); if (!db) return null;
  
  const summaryDate = data.summaryDate.toISOString().split('T')[0];
  
  const fields = [
    'summaryDate',
    'totalSalesEgp', 'totalSalesUsd', 'totalSalesEur',
    'totalIncomeEgp', 'totalIncomeUsd', 'totalIncomeEur',
    'totalExpensesEgp', 'totalExpensesUsd', 'totalExpensesEur',
    'salariesEgp', 'salariesUsd', 'salariesEur',
    'commissionsEgp', 'commissionsUsd', 'commissionsEur',
    'mofaEgp', 'mofaUsd', 'mofaEur',
    'embassyEgp', 'embassyUsd', 'embassyEur',
    'translationFeesEgp', 'translationFeesUsd', 'translationFeesEur',
    'lawyerFeesEgp', 'lawyerFeesUsd', 'lawyerFeesEur',
    'officeExpensesEgp', 'officeExpensesUsd', 'officeExpensesEur',
    'officeRentEgp', 'officeRentUsd', 'officeRentEur',
    'miscEgp', 'miscUsd', 'miscEur',
  ];
  
  const values = [
    `'${summaryDate}'`,
    data.totalSalesEgp ?? 0, data.totalSalesUsd ?? 0, data.totalSalesEur ?? 0,
    data.totalIncomeEgp ?? 0, data.totalIncomeUsd ?? 0, data.totalIncomeEur ?? 0,
    data.totalExpensesEgp ?? 0, data.totalExpensesUsd ?? 0, data.totalExpensesEur ?? 0,
    data.salariesEgp ?? 0, data.salariesUsd ?? 0, data.salariesEur ?? 0,
    data.commissionsEgp ?? 0, data.commissionsUsd ?? 0, data.commissionsEur ?? 0,
    data.mofaEgp ?? 0, data.mofaUsd ?? 0, data.mofaEur ?? 0,
    data.embassyEgp ?? 0, data.embassyUsd ?? 0, data.embassyEur ?? 0,
    data.translationFeesEgp ?? 0, data.translationFeesUsd ?? 0, data.translationFeesEur ?? 0,
    data.lawyerFeesEgp ?? 0, data.lawyerFeesUsd ?? 0, data.lawyerFeesEur ?? 0,
    data.officeExpensesEgp ?? 0, data.officeExpensesUsd ?? 0, data.officeExpensesEur ?? 0,
    data.officeRentEgp ?? 0, data.officeRentUsd ?? 0, data.officeRentEur ?? 0,
    data.miscEgp ?? 0, data.miscUsd ?? 0, data.miscEur ?? 0,
  ];
  
  const query = `
    INSERT INTO financialMonthlySummary (${fields.join(', ')})
    VALUES (${values.join(', ')})
  `;
  
  try {
    const result = await db.execute(query as any);
    return result;
  } catch (error) {
    console.error("Error creating financial summary:", error);
    return null;
  }
}

export async function updateFinancialSummary(id: number, data: Partial<{
  totalSalesEgp?: number;
  totalSalesUsd?: number;
  totalSalesEur?: number;
  totalIncomeEgp?: number;
  totalIncomeUsd?: number;
  totalIncomeEur?: number;
  totalExpensesEgp?: number;
  totalExpensesUsd?: number;
  totalExpensesEur?: number;
  salariesEgp?: number;
  salariesUsd?: number;
  salariesEur?: number;
  commissionsEgp?: number;
  commissionsUsd?: number;
  commissionsEur?: number;
  mofaEgp?: number;
  mofaUsd?: number;
  mofaEur?: number;
  embassyEgp?: number;
  embassyUsd?: number;
  embassyEur?: number;
  translationFeesEgp?: number;
  translationFeesUsd?: number;
  translationFeesEur?: number;
  lawyerFeesEgp?: number;
  lawyerFeesUsd?: number;
  lawyerFeesEur?: number;
  officeExpensesEgp?: number;
  officeExpensesUsd?: number;
  officeExpensesEur?: number;
  officeRentEgp?: number;
  officeRentUsd?: number;
  officeRentEur?: number;
  miscEgp?: number;
  miscUsd?: number;
  miscEur?: number;
}>) {
  const db = await getDb(); if (!db) return null;
  
  const updates: string[] = [];
  
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      updates.push(`${key} = ${value}`);
    }
  });
  
  if (updates.length === 0) return null;
  
  const query = `UPDATE financialMonthlySummary SET ${updates.join(', ')} WHERE id = ${id}`;
  
  try {
    return await db.execute(query as any);
  } catch (error) {
    console.error("Error updating financial summary:", error);
    return null;
  }
}

export async function deleteFinancialSummary(id: number) {
  const db = await getDb(); if (!db) return null;
  
  const query = `DELETE FROM financialMonthlySummary WHERE id = ${id}`;
  
  try {
    return await db.execute(query as any);
  } catch (error) {
    console.error("Error deleting financial summary:", error);
    return null;
  }
}

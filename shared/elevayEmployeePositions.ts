export const ELEVAY_EMPLOYEE_POSITIONS = [
  "Consultant",
  "Senior Consultant",
  "Country Manager",
  "CEO",
  "Paralegal",
  "Paralegal Team Lead",
  "Operations Manager",
  "Operations Team Lead",
  "Qualifier",
  "Qualifier Team Lead",
  "Marketing",
  "Marketing Manager",
  "Designer",
  "Accountant",
  "HR",
  "Lawyer",
  "Translator",
  "Office Assistant",
  "Executive Assistant",
  "Business Relations Officer",
  "Research and Development",
  "Driver",
  "External Consultant",
  "External Accountant",
  "Vendor / Company Expense",
] as const;

export type ElevayEmployeePosition = (typeof ELEVAY_EMPLOYEE_POSITIONS)[number];

function normalizedPosition(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Existing employee records retain their historic labels, while the Contracting
 * module treats current consultant-equivalent positions as eligible.
 */
export function isContractConsultantPosition(position?: string | null) {
  const normalized = normalizedPosition(position);
  return normalized === "consultant"
    || normalized === "senior consultant"
    || normalized === "s consultant"
    || normalized === "country manager"
    || normalized === "ceo";
}

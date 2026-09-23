export type LeadPersonnelSource = {
  id: number;
  name: string;
  role: string | null;
  isActive: boolean;
};

export type LeadPersonnelOption = {
  id: number;
  name: string;
  role: string;
};

const QUALIFIER_ROLES = new Set([
  "qualifier",
  "qualifier tl",
  "cs",
  "cs tl",
]);

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeLeadPersonnelRole(role: string | null | undefined): string {
  return normalizeWhitespace(role ?? "").toLowerCase();
}

export function isLeadQualifierRole(role: string | null | undefined): boolean {
  return QUALIFIER_ROLES.has(normalizeLeadPersonnelRole(role));
}

export function buildLeadPersonnelOptions(rows: LeadPersonnelSource[]): {
  owners: LeadPersonnelOption[];
  qualifiers: LeadPersonnelOption[];
} {
  const uniqueEmployees = new Map<string, LeadPersonnelOption>();

  for (const employee of rows) {
    const name = normalizeWhitespace(employee.name ?? "");
    const role = normalizeWhitespace(employee.role ?? "");
    if (!employee.isActive || !name || !role) continue;

    const key = name.toLocaleLowerCase("en");
    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, { id: employee.id, name, role });
    }
  }

  const owners = Array.from(uniqueEmployees.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }),
  );

  return {
    owners,
    qualifiers: owners.filter(employee => isLeadQualifierRole(employee.role)),
  };
}

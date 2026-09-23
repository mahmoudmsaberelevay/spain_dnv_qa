export type LeadPersonnelSource = {
  id: number;
  name: string;
  role: string | null;
  isActive: boolean;
};

export type LeadUserSource = {
  id: number;
  name: string | null;
  email: string | null;
};

export type LeadPersonnelOption = {
  id: number;
  name: string;
  role: string;
  userId: number | null;
  email: string | null;
};

export type CanonicalLeadOwnerIdentity = {
  name: string;
  userId: number | null;
  email: string | null;
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

function normalizeName(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("en");
}

function compactIdentity(value: string): string {
  return normalizeName(value).replace(/[^a-z0-9]/g, "");
}

function firstName(value: string): string {
  return normalizeName(value).split(" ")[0] ?? "";
}

function normalizeTransliteratedFirstName(value: string): string {
  return firstName(value).replace(/h/g, "");
}

function canonicalUser(user: LeadUserSource): CanonicalLeadOwnerIdentity | null {
  const name = normalizeWhitespace(user.name ?? "");
  if (!name) return null;
  return { name, userId: user.id, email: user.email };
}

function chooseUniqueCanonicalUser(users: LeadUserSource[]): CanonicalLeadOwnerIdentity | null {
  const byName = new Map<string, LeadUserSource[]>();
  for (const user of users) {
    const name = normalizeWhitespace(user.name ?? "");
    if (!name) continue;
    const key = normalizeName(name);
    byName.set(key, [...(byName.get(key) ?? []), user]);
  }
  if (byName.size !== 1) return null;

  const candidates = Array.from(byName.values())[0];
  const corporateCandidates = candidates.filter(user =>
    (user.email ?? "").toLocaleLowerCase("en").endsWith("@elevay.com"),
  );
  if (corporateCandidates.length === 1) return canonicalUser(corporateCandidates[0]);
  if (candidates.length === 1) return canonicalUser(candidates[0]);

  const name = normalizeWhitespace(candidates[0]?.name ?? "");
  return name ? { name, userId: null, email: null } : null;
}

export function normalizeLeadPersonnelRole(role: string | null | undefined): string {
  return normalizeWhitespace(role ?? "").toLowerCase();
}

export function isLeadQualifierRole(role: string | null | undefined): boolean {
  return QUALIFIER_ROLES.has(normalizeLeadPersonnelRole(role));
}

export function resolveCanonicalLeadOwnerIdentity(
  employeeName: string,
  users: LeadUserSource[],
): CanonicalLeadOwnerIdentity {
  const normalizedEmployeeName = normalizeName(employeeName);
  const fallback: CanonicalLeadOwnerIdentity = {
    name: normalizeWhitespace(employeeName),
    userId: null,
    email: null,
  };
  if (!normalizedEmployeeName) return fallback;

  const namedUsers = users.filter(user => normalizeWhitespace(user.name ?? ""));
  const employeeIdentity = compactIdentity(employeeName);
  const emailIdentityMatches = namedUsers.filter(user => {
    const emailLocalPart = (user.email ?? "").split("@")[0] ?? "";
    return compactIdentity(emailLocalPart) === employeeIdentity;
  });
  const emailIdentity = chooseUniqueCanonicalUser(emailIdentityMatches);
  if (emailIdentity) return emailIdentity;

  const exactIdentity = chooseUniqueCanonicalUser(
    namedUsers.filter(user => normalizeName(user.name ?? "") === normalizedEmployeeName),
  );
  if (exactIdentity) return exactIdentity;

  const employeeFirstName = firstName(employeeName);
  const firstNameIdentity = chooseUniqueCanonicalUser(
    namedUsers.filter(user => firstName(user.name ?? "") === employeeFirstName),
  );
  if (firstNameIdentity) return firstNameIdentity;

  const transliteratedFirstName = normalizeTransliteratedFirstName(employeeName);
  const transliterationIdentity = chooseUniqueCanonicalUser(
    namedUsers.filter(user =>
      normalizeTransliteratedFirstName(user.name ?? "") === transliteratedFirstName,
    ),
  );
  if (transliterationIdentity) return transliterationIdentity;

  return fallback;
}

export function resolveCanonicalLeadOwnerName(
  employeeName: string,
  users: LeadUserSource[],
): string {
  return resolveCanonicalLeadOwnerIdentity(employeeName, users).name;
}

export function buildLeadPersonnelOptions(
  rows: LeadPersonnelSource[],
  users: LeadUserSource[] = [],
): {
  owners: LeadPersonnelOption[];
  qualifiers: LeadPersonnelOption[];
} {
  const uniqueEmployees = new Map<string, LeadPersonnelOption>();

  for (const employee of rows) {
    const employeeName = normalizeWhitespace(employee.name ?? "");
    const role = normalizeWhitespace(employee.role ?? "");
    if (!employee.isActive || !employeeName || !role) continue;

    const identity = resolveCanonicalLeadOwnerIdentity(employeeName, users);
    const key = normalizeName(identity.name);
    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, {
        id: employee.id,
        name: identity.name,
        role,
        userId: identity.userId,
        email: identity.email,
      });
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

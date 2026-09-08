export type LeadContactInput = {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
};

export type LeadContactCandidate = {
  id: number;
  fullName: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
};

export type LeadContactMatchMethod = "phone" | "email";

export type LeadContactResolution =
  | { status: "new"; method: null; lead: null; candidateLeadIds: [] }
  | { status: "matched"; method: LeadContactMatchMethod; lead: LeadContactCandidate; candidateLeadIds: [number] }
  | { status: "ambiguous"; method: null; lead: null; candidateLeadIds: number[] };

export function normalizeLeadEmail(value?: string | null): string | null {
  const normalized = value?.normalize("NFKC").trim().toLowerCase() ?? "";
  if (!normalized || !normalized.includes("@")) return null;
  return normalized;
}

export function normalizeLeadPhone(value?: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `20${digits.slice(1)}`;
  if (!digits.startsWith("20") && digits.length === 10) digits = `20${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function normalizeLeadContacts(input: LeadContactInput) {
  const phones = Array.from(new Set([
    normalizeLeadPhone(input.phone),
    normalizeLeadPhone(input.whatsapp),
  ].filter((value): value is string => Boolean(value))));
  return { phones, email: normalizeLeadEmail(input.email) };
}

export function isLeadContactUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /leads_test_normalized_(?:phone|email)_uq|duplicate entry.*normalized(?:phone|email)/i.test(message);
}

export function resolveLeadContactCandidates(
  input: LeadContactInput,
  rows: LeadContactCandidate[],
): LeadContactResolution {
  const contact = normalizeLeadContacts(input);
  if (!contact.phones.length && !contact.email) {
    return { status: "new", method: null, lead: null, candidateLeadIds: [] };
  }

  const matches = rows.map(lead => {
    const leadPhones = new Set([
      normalizeLeadPhone(lead.normalizedPhone),
      normalizeLeadPhone(lead.phone),
      normalizeLeadPhone(lead.whatsapp),
    ].filter((value): value is string => Boolean(value)));
    const phoneMatch = contact.phones.some(phone => leadPhones.has(phone));
    const leadEmail = normalizeLeadEmail(lead.normalizedEmail || lead.email);
    const emailMatch = Boolean(contact.email && leadEmail === contact.email);
    return { lead, phoneMatch, emailMatch };
  }).filter(match => match.phoneMatch || match.emailMatch);

  const distinct = Array.from(new Map(matches.map(match => [match.lead.id, match])).values());
  if (distinct.length > 1) {
    return { status: "ambiguous", method: null, lead: null, candidateLeadIds: distinct.map(match => match.lead.id) };
  }
  if (!distinct.length) {
    return { status: "new", method: null, lead: null, candidateLeadIds: [] };
  }
  const match = distinct[0];
  return {
    status: "matched",
    method: match.phoneMatch ? "phone" : "email",
    lead: match.lead,
    candidateLeadIds: [match.lead.id],
  };
}

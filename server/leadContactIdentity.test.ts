import { describe, expect, it } from "vitest";
import {
  isLeadContactUniqueViolation,
  normalizeLeadContacts,
  resolveLeadContactCandidates,
  type LeadContactCandidate,
} from "./leadContactIdentity";

const lead = (id: number, input: Partial<LeadContactCandidate> = {}): LeadContactCandidate => ({
  id,
  fullName: `Lead ${id}`,
  phone: null,
  whatsapp: null,
  email: null,
  normalizedPhone: null,
  normalizedEmail: null,
  ...input,
});

describe("unified Lead contact identity resolution", () => {
  it("normalizes equivalent Egyptian mobile formats", () => {
    expect(normalizeLeadContacts({ phone: "010 1234 5678" }).phones).toEqual(["+201012345678"]);
    expect(normalizeLeadContacts({ phone: "+20 10 1234 5678" }).phones).toEqual(["+201012345678"]);
    expect(normalizeLeadContacts({ phone: "00201012345678" }).phones).toEqual(["+201012345678"]);
  });

  it("matches an incoming mobile against an existing formatted phone", () => {
    expect(resolveLeadContactCandidates(
      { phone: "+20 10 1234 5678" },
      [lead(10, { phone: "01012345678" })],
    )).toMatchObject({ status: "matched", method: "phone", candidateLeadIds: [10] });
  });

  it("matches an incoming WhatsApp number against an existing phone", () => {
    expect(resolveLeadContactCandidates(
      { whatsapp: "0020 10 1234 5678" },
      [lead(11, { normalizedPhone: "+201012345678" })],
    )).toMatchObject({ status: "matched", method: "phone", candidateLeadIds: [11] });
  });

  it("matches email case-insensitively after trimming", () => {
    expect(resolveLeadContactCandidates(
      { email: "  CLIENT@Example.COM " },
      [lead(12, { email: "client@example.com" })],
    )).toMatchObject({ status: "matched", method: "email", candidateLeadIds: [12] });
  });

  it("returns one Lead when phone and email both identify the same record", () => {
    expect(resolveLeadContactCandidates(
      { phone: "01012345678", email: "client@example.com" },
      [lead(13, { phone: "+201012345678", email: "CLIENT@example.com" })],
    )).toMatchObject({ status: "matched", method: "phone", candidateLeadIds: [13] });
  });

  it("blocks creation when phone and email identify different Leads", () => {
    expect(resolveLeadContactCandidates(
      { phone: "01012345678", email: "other@example.com" },
      [lead(14, { phone: "+201012345678" }), lead(15, { email: "other@example.com" })],
    )).toEqual({ status: "ambiguous", method: null, lead: null, candidateLeadIds: [14, 15] });
  });

  it("blocks creation when a contact matches multiple historical Leads", () => {
    expect(resolveLeadContactCandidates(
      { email: "shared@example.com" },
      [lead(16, { email: "shared@example.com" }), lead(17, { normalizedEmail: "shared@example.com" })],
    )).toEqual({ status: "ambiguous", method: null, lead: null, candidateLeadIds: [16, 17] });
  });

  it("allows a new Lead only when no usable contact matches", () => {
    expect(resolveLeadContactCandidates({ phone: "123", email: "not-an-email" }, [])).toEqual({
      status: "new", method: null, lead: null, candidateLeadIds: [],
    });
  });

  it("recognizes both normalized contact unique-index conflicts", () => {
    expect(isLeadContactUniqueViolation(new Error("Duplicate entry for key 'leads_test_normalized_phone_uq'"))).toBe(true);
    expect(isLeadContactUniqueViolation(new Error("Duplicate entry for key 'leads_test_normalized_email_uq'"))).toBe(true);
    expect(isLeadContactUniqueViolation(new Error("network timeout"))).toBe(false);
  });
});

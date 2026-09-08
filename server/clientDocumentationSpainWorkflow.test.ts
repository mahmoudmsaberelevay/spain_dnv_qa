import { describe, expect, it } from "vitest";
import {
  assertIsoDate,
  calculateExpectedApprovalDate,
  normalizeHttpLink,
} from "./clientDocumentationSpainWorkflow";

describe("Client Documentation Spain workflow validation", () => {
  it("accepts real ISO dates and rejects impossible calendar dates", () => {
    expect(assertIsoDate("2026-09-08")).toBe("2026-09-08");
    expect(() => assertIsoDate("2026-02-30")).toThrow("INVALID_DATE");
    expect(() => assertIsoDate("08-09-2026")).toThrow("INVALID_DATE");
  });

  it("accepts HTTP(S) evidence and rejects non-web links", () => {
    expect(normalizeHttpLink("https://drive.google.com/file/d/example")).toContain("drive.google.com");
    expect(() => normalizeHttpLink("ftp://example.com/file.pdf")).toThrow("INVALID_LINK");
    expect(() => normalizeHttpLink("javascript:alert(1)")).toThrow("INVALID_LINK");
  });

  it("calculates the expected approval date after 25 working days", () => {
    expect(calculateExpectedApprovalDate("2026-09-07").toISOString().slice(0, 10)).toBe("2026-10-12");
  });

});

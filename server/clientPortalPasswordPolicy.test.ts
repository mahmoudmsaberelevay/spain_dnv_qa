import { describe, expect, it } from "vitest";
import { checkClientPortalPassword, isStrongClientPortalPassword } from "../shared/clientPortalPasswordPolicy";

describe("Client Portal administrator-entered password policy", () => {
  it("accepts a strong password and rejects weak variants", () => {
    expect(isStrongClientPortalPassword("Elevay!2026Safe")).toBe(true);
    expect(checkClientPortalPassword("short").errors).toContain("Use at least 10 characters");
    expect(isStrongClientPortalPassword("elevay!2026safe")).toBe(false);
    expect(isStrongClientPortalPassword("ELEVAY!2026SAFE")).toBe(false);
    expect(isStrongClientPortalPassword("ElevayPassword!")).toBe(false);
    expect(isStrongClientPortalPassword("Elevay2026Safe")).toBe(false);
    expect(isStrongClientPortalPassword("Elevay !2026Safe")).toBe(false);
  });

  it("enforces bcrypt's 72-byte boundary without exposing password content", () => {
    const oversized = `Elevay!2026${"a".repeat(70)}`;
    const result = checkClientPortalPassword(oversized);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Use no more than 72 bytes");
    expect(JSON.stringify(result)).not.toContain(oversized);
  });
});

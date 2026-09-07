import { describe, expect, it } from "vitest";
import { formatClientPortalCreateError, validateClientPortalEmail } from "../client/src/lib/clientPortalAccountValidation";

describe("Client Portal account form validation", () => {
  it("accepts a complete client email address", () => {
    expect(validateClientPortalEmail("  client@example.com  ")).toBeNull();
  });

  it("explains that a surname alone is not an email address", () => {
    expect(validateClientPortalEmail("Diduk")).toBe(
      "Enter a valid client email address, for example name@example.com",
    );
  });

  it("converts the raw tRPC/Zod email issue into a friendly message", () => {
    const raw = '[{"origin":"string","code":"invalid_format","format":"email","path":["email"],"message":"Invalid email address"}]';
    expect(formatClientPortalCreateError(raw)).toBe(
      "Enter a valid client email address, for example name@example.com",
    );
  });

  it("preserves a clear duplicate-account message", () => {
    expect(formatClientPortalCreateError("Username or email already has client access")).toBe(
      "This username or email already has Client Portal access",
    );
  });
});

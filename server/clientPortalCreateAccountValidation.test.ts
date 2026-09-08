import { describe, expect, it } from "vitest";
import { clientPortalCreateAccountInput } from "./clientPortalAdminRouter";

const validInput = {
  caseIds: [26089],
  primaryCaseId: 26089,
  username: "vlad.diduk",
  email: "vlad.diduk@example.com",
  mobile: "+20 155 459 6994",
  locale: "en" as const,
};

describe("Client Portal create-account server contract", () => {
  it("accepts a valid account request", () => {
    expect(clientPortalCreateAccountInput.safeParse(validInput).success).toBe(true);
  });

  it("rejects a surname entered in the email field", () => {
    const result = clientPortalCreateAccountInput.safeParse({ ...validInput, email: "Diduk" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["email"]);
  });
});

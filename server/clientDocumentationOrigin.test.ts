import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLIENT_DOCUMENTATION_ORIGINS,
  clientDocumentationOriginLabel,
  isValidClientDocumentationMobile,
  normalizeClientDocumentationMobile,
} from "../shared/clientDocumentationOrigins";
import {
  clientDocumentationIdentityIssues,
  createDubaiDocumentationClientCode,
} from "./clientDocumentationIdentity";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Client Documentation Egypt and Dubai identity policy", () => {
  it("defines Egypt and Dubai as the only supported client origins", () => {
    expect([...CLIENT_DOCUMENTATION_ORIGINS]).toEqual(["egypt", "dubai"]);
    expect(clientDocumentationOriginLabel("egypt")).toBe("Egypt");
    expect(clientDocumentationOriginLabel("dubai")).toBe("Dubai");
  });

  it("requires an existing Finance client for Egypt", () => {
    expect(clientDocumentationIdentityIssues({ clientOrigin: "egypt" })).toEqual(["EGYPT_FIN_CLIENT_REQUIRED"]);
    expect(clientDocumentationIdentityIssues({ clientOrigin: "egypt", finClientId: 42 })).toEqual([]);
  });

  it("requires an independent name and valid mobile for Dubai", () => {
    expect(clientDocumentationIdentityIssues({ clientOrigin: "dubai", finClientId: 42, clientName: "", clientMobile: "12" }))
      .toEqual(["DUBAI_FIN_CLIENT_NOT_ALLOWED", "DUBAI_CLIENT_NAME_REQUIRED", "DUBAI_CLIENT_MOBILE_INVALID"]);
    expect(clientDocumentationIdentityIssues({ clientOrigin: "dubai", clientName: "Dubai Client", clientMobile: "+971 50 123 4567" }))
      .toEqual([]);
  });

  it("accepts international mobile formatting while enforcing 7 to 15 digits", () => {
    expect(normalizeClientDocumentationMobile("  +971   50 123 4567  ")).toBe("+971 50 123 4567");
    expect(isValidClientDocumentationMobile("+971 (50) 123-4567")).toBe(true);
    expect(isValidClientDocumentationMobile("123456")).toBe(false);
    expect(isValidClientDocumentationMobile("+971 invalid")).toBe(false);
  });

  it("generates non-PII Dubai documentation codes", () => {
    expect(createDubaiDocumentationClientCode(new Date("2026-09-21T12:00:00Z"), "abc12345"))
      .toBe("DXB-20260921-ABC12345");
  });
});

describe("Client Documentation origin integration", () => {
  const page = read("client/src/pages/ClientDocs.tsx");
  const detail = read("client/src/pages/ClientDocDetail.tsx");
  const router = read("server/routers.ts");
  const schema = read("drizzle/schema.ts");
  const migration = read("drizzle/0087_client_documentation_origin.sql");

  it("asks Egypt or Dubai first and branches between lookup and direct identity entry", () => {
    expect(page).toContain("Where is the client based?");
    expect(page).toContain("Select Existing Egypt Client");
    expect(page).toContain("New Dubai Client");
    expect(page).toContain("Client Name");
    expect(page).toContain("Mobile Number");
    expect(page).toContain("form.clientOrigin === \"egypt\"");
  });

  it("resolves identity on the server rather than trusting client-supplied Egypt details", () => {
    expect(router).toContain("resolveClientDocumentationIdentity(input)");
    expect(router).toContain("clientName: identity.clientName");
    expect(router).toContain("clientCode: identity.clientCode");
    expect(router).toContain("finClientId: identity.finClientId");
    expect(router).not.toContain("clientCode: input.clientCode.trim()");
  });

  it("persists and displays origin and mobile with an additive default-Egypt migration", () => {
    expect(schema).toContain('clientOrigin: mysqlEnum("clientOrigin", ["egypt", "dubai"]).default("egypt").notNull()');
    expect(schema).toContain('clientMobile: varchar("clientMobile", { length: 64 })');
    expect(detail).toContain("clientDocumentationOriginLabel(caseData.clientOrigin)");
    expect(detail).toContain("Mobile Number");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `clientOrigin`");
    expect(migration).toContain("NOT NULL DEFAULT 'egypt'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `clientMobile`");
    expect(migration).not.toContain("DROP ");
  });
});

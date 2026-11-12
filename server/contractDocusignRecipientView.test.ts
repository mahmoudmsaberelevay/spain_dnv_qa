import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { DocusignError, validateApiRoot, validateViewUrl, validateSenderViewUrl, validateRecipientViewUrl, type DocusignConfig } from "./contractDocusignConfig";
import { JwtDocusignProvider } from "./contractDocusignProvider";

const demo = "https://apps-d.docusign.com/authenticate?code=SYNTHETIC%2Fsession%2Bvalue%3D&state=SYNTHETIC";
const production = "https://apps.docusign.com/authenticate?code=SYNTHETIC";
const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config: DocusignConfig = { environment: "demo", integrationKey: randomUUID(), userId: randomUUID(), accountId: randomUUID(), privateKey, linkSecret: "SYNTHETIC-link-secret-at-least-32-characters", publicBaseUrl: "https://elevay.vip" };
const recipient = { id: randomUUID(), document: Buffer.alloc(0), documentName: "synthetic.docx", recipientName: "Synthetic Demo Signer", recipientEmail: "synthetic@example.com", recipientId: "1", clientUserId: "synthetic-client-id" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function transport(view: unknown) {
  return vi.fn(async (url: any) => {
    if (String(url).endsWith("/oauth/token")) return json({ access_token: "SYNTHETIC_ACCESS_TOKEN", expires_in: 3600 });
    if (String(url).endsWith("/oauth/userinfo")) return json({ sub: config.userId, accounts: [{ account_id: config.accountId, base_uri: "https://demo.docusign.net" }] });
    return json({ url: view }, 201);
  }) as unknown as typeof fetch;
}

describe("Modern DocuSign recipient authentication handoff", () => {
  it("preserves exact opaque Demo and production URLs", () => {
    expect(validateRecipientViewUrl(demo, "demo")).toBe(demo);
    expect(validateRecipientViewUrl(production, "production")).toBe(production);
  });

  it("supports the documented 4000-character maximum without truncating session data", () => {
    const prefix = "https://apps-d.docusign.com/authenticate?code=";
    const url = prefix + "S".repeat(4000 - prefix.length);
    expect(validateRecipientViewUrl(url, "demo")).toBe(url);
    expect(() => validateRecipientViewUrl(url + "S", "demo")).toThrow(DocusignError);
  });

  it("retains existing direct recipient session support", () => {
    const url = "https://demo.docusign.net/Signing/StartInSession.aspx?synthetic=1";
    expect(validateRecipientViewUrl(url, "demo")).toBe(validateViewUrl(url, "demo"));
    expect(validateRecipientViewUrl("https://na2.docusign.net/Signing/StartInSession.aspx?synthetic=1", "production")).toContain("https://na2.docusign.net/");
  });

  it.each([
    [demo, "production"], [production, "demo"],
    ["http://apps-d.docusign.com/authenticate?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com.evil.example/authenticate?code=SYNTHETIC", "demo"],
    ["https://evil.example/authenticate?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com:8443/authenticate?code=SYNTHETIC", "demo"],
    ["https://user:password@apps-d.docusign.com/authenticate?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/send/prepare?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/oauth/auth?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/managed_token/v1/redeem?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/authenticate/extra?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/authenticate/?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/Authenticate?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/authenticate", "demo"],
    ["https://apps-d.docusign.com/authenticate?", "demo"],
    ["https://account-d.docusign.com/managed_token/v1/redeem?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com:443/authenticate?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/other/../authenticate?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/other/%2e%2e/authenticate?code=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/authenticate?code=SYNTHETIC VALUE", "demo"],
    ["https://apps-d.docusign.com/authenticate?code=SYNTHETIC\tVALUE", "demo"],
    [demo + "#", "demo"],
    [demo + "#SYNTHETIC_FRAGMENT", "demo"],
    [" " + demo, "demo"], [demo + "\n", "demo"],
    ["javascript:alert(1)", "demo"], [null, "demo"], [42, "demo"],
  ] as const)("rejects unsafe or unsupported recipient URL %#", (url, environment) => {
    expect(() => validateRecipientViewUrl(url, environment)).toThrow(DocusignError);
  });

  it("does not broaden API-root, original view or sender handoff permissions", () => {
    expect(() => validateApiRoot("https://apps-d.docusign.com", "demo")).toThrow(DocusignError);
    expect(() => validateApiRoot("https://apps.docusign.com", "production")).toThrow(DocusignError);
    expect(() => validateViewUrl(demo, "demo")).toThrow(DocusignError);
    expect(() => validateSenderViewUrl(demo, "demo")).toThrow(DocusignError);
    expect(validateSenderViewUrl("https://account-d.docusign.com/managed_token/v1/redeem?token=SYNTHETIC", "demo")).toContain("https://account-d.docusign.com/");
  });

  it("accepts HTTP201 recipient response with unchanged binding and no create/send action", async () => {
    const fetcher = transport(demo);
    const id = randomUUID();
    expect(await new JwtDocusignProvider(config, fetcher).createRecipientView(id, recipient)).toBe(demo);
    const calls = (fetcher as any).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[2][0]).toBe(`https://demo.docusign.net/restapi/v2.1/accounts/${config.accountId}/envelopes/${id}/views/recipient`);
    expect(calls[2][1].redirect).toBe("error");
    expect(JSON.parse(calls[2][1].body)).toEqual({ authenticationMethod: "none", returnUrl: "https://elevay.vip/sign-contract/return", userName: recipient.recipientName, email: recipient.recipientEmail, clientUserId: recipient.clientUserId, recipientId: recipient.recipientId });
    expect(calls.some((c: any) => c[0].endsWith("/envelopes"))).toBe(false);
  });

  it("rejects a wrong-path HTTP201 response without logging tokens, URLs, key or raw cause", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const rejected = "https://apps-d.docusign.com/wrong-path?code=SYNTHETIC_PRIVATE_SESSION";
      let caught: any;
      try { await new JwtDocusignProvider(config, transport(rejected)).createRecipientView(randomUUID(), recipient); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(DocusignError);
      expect(caught.safeCode).toBe("INVALID_PROVIDER_RESPONSE");
      expect(caught.message).not.toContain(rejected);
      expect(caught.message).not.toContain("SYNTHETIC_PRIVATE_SESSION");
      expect(caught.cause).toBeUndefined();
      expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { log.mockRestore(); warn.mockRestore(); error.mockRestore(); }
  });
});

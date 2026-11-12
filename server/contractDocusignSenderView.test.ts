import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { DocusignError, validateApiRoot, validateSenderViewUrl, validateViewUrl, type DocusignConfig } from "./contractDocusignConfig";
import { JwtDocusignProvider } from "./contractDocusignProvider";

const demo = "https://account-d.docusign.com/managed_token/v1/redeem?token=SYNTHETIC%2Fsession%2Bvalue%3D&state=SYNTHETIC";
const production = "https://account.docusign.com/managed_token/v1/redeem?token=SYNTHETIC";
const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config: DocusignConfig = { environment: "demo", integrationKey: randomUUID(), userId: randomUUID(), accountId: randomUUID(), privateKey, linkSecret: "SYNTHETIC-link-secret-at-least-32-characters", publicBaseUrl: "https://elevay.vip" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function transport(view: unknown) {
  return vi.fn(async (url: any) => {
    if (String(url).endsWith("/oauth/token")) return json({ access_token: "SYNTHETIC_ACCESS_TOKEN", expires_in: 3600 });
    if (String(url).endsWith("/oauth/userinfo")) return json({ sub: config.userId, accounts: [{ account_id: config.accountId, base_uri: "https://demo.docusign.net" }] });
    return json({ url: view }, 201);
  }) as unknown as typeof fetch;
}

describe("Sender-only DocuSign managed-token handoff", () => {
  it("preserves the exact Demo and production sender URLs without rewriting opaque query data", () => {
    expect(validateSenderViewUrl(demo, "demo")).toBe(demo);
    expect(validateSenderViewUrl(production, "production")).toBe(production);
  });

  it("keeps existing direct sender sessions supported", () => {
    for (const path of ["/Signing/StartInSession.aspx", "/Member/StartInSession.aspx"]) {
      const url = `https://demo.docusign.net${path}?synthetic=1`;
      expect(validateSenderViewUrl(url, "demo")).toBe(validateViewUrl(url, "demo"));
    }
    expect(validateSenderViewUrl("https://na2.docusign.net/Member/StartInSession.aspx?synthetic=1", "production")).toContain("https://na2.docusign.net/");
  });

  it.each([
    [demo, "production"], [production, "demo"],
    ["http://account-d.docusign.com/managed_token/v1/redeem?token=SYNTHETIC", "demo"],
    ["https://account-d.docusign.com.evil.example/managed_token/v1/redeem?token=SYNTHETIC", "demo"],
    ["https://evil.example/managed_token/v1/redeem?token=SYNTHETIC", "demo"],
    ["https://apps-d.docusign.com/managed_token/v1/redeem?token=SYNTHETIC", "demo"],
    ["https://account-d.docusign.com:8443/managed_token/v1/redeem?token=SYNTHETIC", "demo"],
    ["https://user:password@account-d.docusign.com/managed_token/v1/redeem?token=SYNTHETIC", "demo"],
    ["https://account-d.docusign.com/oauth/auth?token=SYNTHETIC", "demo"],
    ["https://account-d.docusign.com/managed_token/v1/redeem/extra?token=SYNTHETIC", "demo"],
    ["https://account-d.docusign.com/managed_token/v1/redeem/?token=SYNTHETIC", "demo"],
    ["https://account-d.docusign.com/managed_token/v1/redeem", "demo"],
    [demo + "#SYNTHETIC_FRAGMENT", "demo"],
    [" " + demo, "demo"], [demo + "\n", "demo"],
    ["javascript:alert(1)", "demo"], [null, "demo"], [42, "demo"],
  ] as const)("rejects unsupported or unsafe sender handoff %#", (url, environment) => {
    expect(() => validateSenderViewUrl(url, environment)).toThrow(DocusignError);
  });

  it("does not broaden recipient-view or API origin permissions", () => {
    expect(() => validateViewUrl(demo, "demo")).toThrow(DocusignError);
    expect(() => validateViewUrl(production, "production")).toThrow(DocusignError);
    expect(() => validateApiRoot("https://account-d.docusign.com", "demo")).toThrow(DocusignError);
    expect(() => validateApiRoot("https://account.docusign.com", "production")).toThrow(DocusignError);
  });

  it("accepts actual sender provider response format without modifying scoped preparation settings or creating an envelope", async () => {
    const fetcher = transport(demo);
    expect(await new JwtDocusignProvider(config, fetcher).createSenderView(randomUUID())).toBe(demo);
    const calls = (fetcher as any).mock.calls;
    const body = JSON.parse(calls[2][1].body);
    expect(body.viewAccess).toBe("envelope");
    expect(body.returnUrl).toBe("https://elevay.vip/sign-contract/return");
    expect(body.settings.startingScreen).toBe("Tagger");
    expect(body.settings.showBackButton).toBe("false");
    expect(body.settings.documentSettings.showEditDocuments).toBe("false");
    expect(body.settings.recipientSettings.showEditRecipients).toBe("false");
    expect(calls).toHaveLength(3);
    expect(calls[2][0]).toMatch(/\/envelopes\/[0-9a-f-]+\/views\/sender$/);
  });

  it("recipient provider never accepts the sender authentication handoff", async () => {
    const provider = new JwtDocusignProvider(config, transport(demo));
    await expect(provider.createRecipientView(randomUUID(), { id: randomUUID(), document: Buffer.alloc(0), documentName: "synthetic.docx", recipientName: "Synthetic", recipientEmail: "synthetic@example.com", recipientId: "1", clientUserId: "synthetic" })).rejects.toBeInstanceOf(DocusignError);
  });

  it("invalid sender URLs expose no private URL, token, key or raw cause and are never logged", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const rejected = "https://account-d.docusign.com/wrong-path?token=SYNTHETIC_PRIVATE_SESSION_TOKEN";
      let caught: unknown;
      try { await new JwtDocusignProvider(config, transport(rejected)).createSenderView(randomUUID()); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(DocusignError);
      expect(String(caught)).not.toContain("SYNTHETIC_PRIVATE_SESSION_TOKEN");
      expect(String(caught)).not.toContain(rejected);
      expect((caught as Error).cause).toBeUndefined();
      expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { log.mockRestore(); warn.mockRestore(); error.mockRestore(); }
  });
});

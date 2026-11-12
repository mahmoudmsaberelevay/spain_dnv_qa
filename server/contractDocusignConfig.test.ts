import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { configReadiness, DocusignError, getDocusignConfig } from "./contractDocusignConfig";
import { JwtDocusignProvider } from "./contractDocusignProvider";

// Synthetic keys only. Never load managed settings or use a live provider here.
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs8 = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pkcs1 = pair.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const encode = (pem: string) => Buffer.from(pem, "utf8").toString("base64");
const baseEnv = (): NodeJS.ProcessEnv => ({
  DOCUSIGN_ENVIRONMENT: "demo",
  DOCUSIGN_INTEGRATION_KEY: randomUUID(),
  DOCUSIGN_USER_ID: randomUUID(),
  DOCUSIGN_ACCOUNT_ID: randomUUID(),
  DOCUSIGN_LINK_SECRET: "synthetic-link-secret-at-least-32-characters",
});
afterEach(() => vi.restoreAllMocks());

function rejects(encoded: string) {
  const env = { ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: encoded };
  const result = configReadiness(env);
  expect(result).toEqual({ configured: false, environment: "demo", missingSettings: ["DOCUSIGN_PRIVATE_KEY_BASE64"] });
  let caught: unknown;
  try { getDocusignConfig(env); } catch (error) { caught = error; }
  expect(caught instanceof DocusignError).toBe(true);
  expect((caught as DocusignError).safeCode).toBe("SETTINGS_REQUIRED");
  expect((caught as Error).message).toBe("SETTINGS_REQUIRED");
  expect((caught as Error).cause).toBeUndefined();
  const publicText = JSON.stringify(result) + String(caught);
  expect(publicText.includes(encoded)).toBe(false);
}

describe("DocuSign server-only Base64 private key configuration", () => {
  for (const [name, pem] of [["PKCS8", pkcs8], ["PKCS1", pkcs1], ["CRLF", pkcs8.replace(/\n/g, "\r\n")], ["no final newline", pkcs8.trimEnd()]] as const) {
    it(`decodes complete ${name} PEM and preserves the original text`, () => {
      const env = { ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: encode(pem) };
      const before = { ...env };
      const readiness = configReadiness(env);
      expect(readiness).toEqual({ configured: true, environment: "demo", missingSettings: [] });
      expect(getDocusignConfig(env).privateKey === pem).toBe(true);
      expect(env).toEqual(before);
      expect(Object.keys(readiness).sort()).toEqual(["configured", "environment", "missingSettings"]);
      expect(JSON.stringify(readiness).includes(pem)).toBe(false);
      expect(JSON.stringify(readiness).includes(encode(pem))).toBe(false);
    });
  }
  it("prefers valid Base64 over a stale legacy PEM and keeps the legacy setting unchanged", () => {
    const env = { ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: encode(pkcs8), DOCUSIGN_RSA_PRIVATE_KEY: "stale-invalid-legacy-setting" };
    expect(getDocusignConfig(env).privateKey === pkcs8).toBe(true);
    expect(env.DOCUSIGN_RSA_PRIVATE_KEY).toBe("stale-invalid-legacy-setting");
  });
  it("does not silently fall back to a valid legacy key when Base64 is invalid", () => {
    const env = { ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: "not-base64!", DOCUSIGN_RSA_PRIVATE_KEY: pkcs8 };
    expect(configReadiness(env).missingSettings).toEqual(["DOCUSIGN_PRIVATE_KEY_BASE64"]);
    expect(() => getDocusignConfig(env)).toThrow("SETTINGS_REQUIRED");
  });
  it("preserves legacy PEM support when Base64 is absent or explicitly empty", () => {
    for (const value of [undefined, ""]) {
      const env = { ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: value, DOCUSIGN_RSA_PRIVATE_KEY: pkcs1 };
      expect(configReadiness(env).configured).toBe(true);
      expect(getDocusignConfig(env).privateKey === pkcs1).toBe(true);
    }
  });
  it("reports the recommended Base64 name when neither key format is supplied", () => {
    expect(configReadiness(baseEnv()).missingSettings).toEqual(["DOCUSIGN_PRIVATE_KEY_BASE64"]);
    expect(configReadiness({ ...baseEnv(), DOCUSIGN_RSA_PRIVATE_KEY: "invalid legacy" }).missingSettings).toEqual(["DOCUSIGN_RSA_PRIVATE_KEY"]);
  });
  it("allows surrounding copy whitespace but rejects wrapped or escaped Base64", () => {
    expect(configReadiness({ ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: ` ${encode(pkcs8)}\n` }).configured).toBe(true);
    rejects(encode(pkcs8).slice(0, 40) + "\n" + encode(pkcs8).slice(40));
    rejects(encode(pkcs8).slice(0, 40) + "\\n" + encode(pkcs8).slice(40));
    rejects("   ");
  });
  for (const [name, value] of [
    ["non-Base64 characters", "invalid-characters!"],
    ["invalid padding", "Zg="],
    ["noncanonical pad bits", "Zh=="],
    ["URL-safe alphabet", "SGVsbG8_"],
    ["data URL prefix", "data:text/plain;base64," + encode(pkcs8)],
    ["quoted string", JSON.stringify(encode(pkcs8))],
    ["oversized secret", "A".repeat(24000)],
    ["oversized decoded PEM", encode("A".repeat(17000))],
    ["invalid UTF8", Buffer.from([0xff, 0xfe, 0xfd]).toString("base64")],
    ["public key instead of private", encode(pair.publicKey.export({ type: "spki", format: "pem" }).toString())],
    ["corrupt DER in a correctly framed private PEM", encode("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n")],
    ["missing PEM footer", encode(pkcs8.split("-----END")[0])],
    ["DER instead of original PEM", pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")],
    ["literal PEM newline escapes", encode(pkcs8.replace(/\n/g, "\\n"))],
    ["multiple private blocks", encode(pkcs8 + pkcs1)],
  ] as const) {
    it(`rejects ${name} with only sanitized status`, () => rejects(value));
  }
  it("rejects encrypted private keys without exposing a passphrase or OpenSSL error", () => {
    const encrypted = pair.privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "synthetic-only-passphrase" }).toString();
    rejects(encode(encrypted));
  });
  it("rejects non-RSA and RSA smaller than 2048 bits", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const weak = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    rejects(encode(ec));
    rejects(encode(weak));
  });
  it("logs neither valid credentials nor malformed input", () => {
    const spies = ["log", "info", "warn", "error", "debug"].map(name => vi.spyOn(console, name as "log").mockImplementation(() => {}));
    getDocusignConfig({ ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: encode(pkcs8) });
    rejects("private-canary-not-base64!");
    rejects(encode("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n"));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
  it("uses decoded PEM for a cryptographically valid JWT with mocked read-only transport", async () => {
    const config = getDocusignConfig({ ...baseEnv(), DOCUSIGN_PRIVATE_KEY_BASE64: encode(pkcs8) });
    let validSignature = false;
    const methods: string[] = [];
    const transport = vi.fn(async (input: any, options: RequestInit) => {
      const url = new URL(String(input));
      methods.push(`${options.method} ${url.pathname}`);
      if (url.pathname === "/oauth/token") {
        const assertion = new URLSearchParams(String(options.body)).get("assertion")!;
        const [header, payload, signature] = assertion.split(".");
        validSignature = verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), createPublicKey(pair.privateKey), Buffer.from(signature, "base64url"));
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        expect(claims.scope).toBe("signature impersonation");
        expect(claims.aud).toBe("account-d.docusign.com");
        return new Response(JSON.stringify({ access_token: "synthetic-test-token", expires_in: 3600 }));
      }
      if (url.pathname === "/oauth/userinfo") return new Response(JSON.stringify({ sub: config.userId, accounts: [{ account_id: config.accountId, base_uri: "https://demo.docusign.net" }] }));
      if (options.method !== "GET") throw new Error("SYNTHETIC_READ_ONLY_GUARD");
      return new Response(JSON.stringify({ status: "created" }));
    }) as unknown as typeof fetch;
    expect(await new JwtDocusignProvider(config, transport).getEnvelopeStatus("00000000-0000-4000-8000-000000000000")).toBe("created");
    expect(validSignature).toBe(true);
    expect(methods).toEqual(["POST /oauth/token", "GET /oauth/userinfo", `GET /restapi/v2.1/accounts/${config.accountId}/envelopes/00000000-0000-4000-8000-000000000000`]);
  });
  it("keeps the decoder and encoded value out of frontend source and public page", () => {
    const client = readFileSync(new URL("../client/src/components/ContractDocusignDialog.tsx", import.meta.url), "utf8");
    expect(client).not.toMatch(/process\.env|import\.meta\.env|Buffer\.from|atob\(/);
    const signing = readFileSync(new URL("./contractDocusignSigningPage.ts", import.meta.url), "utf8");
    expect(signing).not.toContain("DOCUSIGN_PRIVATE_KEY_BASE64");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { registerContractDocusignSigningPage } from "./contractDocusignSigningPage";

let server: Server | null = null;
afterEach(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close(error => (error ? reject(error) : resolve()))
    );
  server = null;
});
async function page(path: string) {
  const app = express();
  registerContractDocusignSigningPage(app);
  server = await new Promise<Server>(resolve => {
    const live = app.listen(0, "127.0.0.1", () => resolve(live));
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Synthetic server unavailable");
  return fetch(`http://127.0.0.1:${address.port}${path}`);
}

describe("DocuSign public signing handoff", () => {
  it("renders no client data, secret, CRM provider or third-party script", async () => {
    const response = await page(
      "/sign-contract/11111111-2222-4333-8444-555555555555"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    const text = await response.text();
    expect(text).toContain("Continue to DocuSign");
    expect(text).not.toMatch(
      /<script[^>]+src=|umami|auth\.me|permissions\.get|clientName|recipientEmail|DOCUSIGN_RSA_PRIVATE_KEY/
    );
    expect(text).toContain("history.replaceState(null,'',location.pathname)");
    expect(text).toContain("credentials:'omit'");
    expect(text).toContain("/api/trpc/contractDocusign.startSigning");
    expect(text).not.toMatch(
      /console\.(log|warn|error)|localStorage|sessionStorage/
    );
  });
  it("does not treat a signing_complete return parameter as signing evidence", async () => {
    const response = await page("/sign-contract/return?event=signing_complete");
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain(
      "does not confirm that your contract has been signed"
    );
    expect(text).not.toContain('id="continue"');
    expect(text).not.toMatch(
      /markSigned|transitionContractStatus|createContract|\.update\(/
    );
  });
  it("invalid identifiers reveal no record details", async () => {
    const response = await page("/sign-contract/not-a-valid-envelope");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("not-a-valid-envelope");
  });
  it("registers the isolated public page before the application renderer", () => {
    const entry = readFileSync(
      new URL("./_core/index.ts", import.meta.url),
      "utf8"
    );
    expect(
      entry.indexOf("registerContractDocusignSigningPage(app)")
    ).toBeLessThan(entry.indexOf("await setupVite"));
    const routers = readFileSync(
      new URL("./routers.ts", import.meta.url),
      "utf8"
    );
    expect(routers).toContain("contractDocusign: contractDocusignRouter");
  });
});

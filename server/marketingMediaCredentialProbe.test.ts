import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { handleMarketingMediaCredentialProbe } from "./marketingMediaCredentialProbe";

const originalJwt = process.env.JWT_SECRET;
const originalManus = process.env.MANUS_API_KEY;
afterEach(() => {
  if (originalJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalJwt;
  if (originalManus === undefined) delete process.env.MANUS_API_KEY; else process.env.MANUS_API_KEY = originalManus;
  vi.unstubAllGlobals();
});
function response() {
  const res = { setHeader: vi.fn(), sendStatus: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
describe("temporary marketing media credential probe", () => {
  it("rejects unauthenticated requests without calling an upstream service", async () => {
    process.env.JWT_SECRET = "a-long-test-only-secret-please-change";
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await handleMarketingMediaCredentialProbe({ header: () => undefined } as unknown as Request, res as unknown as Response);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns only read-only status and a short fingerprint for a signed request", async () => {
    const secret = "a-long-test-only-secret-please-change";
    const key = "test-only-manus-api-key-without-value";
    process.env.JWT_SECRET = secret;
    process.env.MANUS_API_KEY = ` ${key}\n`;
    const timestamp = String(Date.now());
    const signature = crypto.createHmac("sha256", secret).update(`marketing-media-probe:${timestamp}`).digest("hex");
    const headers: Record<string, string> = { "x-elevay-probe-time": timestamp, "x-elevay-probe-signature": signature };
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 }); vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await handleMarketingMediaCredentialProbe({ header: (name: string) => headers[name] } as unknown as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ credentialPresent: true, keyFingerprint: crypto.createHash("sha256").update(key).digest("hex").slice(0, 12), upstreamStatus: 401, route: "production-read-only-probe" });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(key);
    expect(fetchMock.mock.calls[0][0]).toContain("task.list");
  });
});

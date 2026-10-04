import { afterEach, describe, expect, it, vi } from "vitest";
import { checkManusMediaAuthentication, mediaCredential, requireManusMediaAuthentication, MANUS_MEDIA_AUTH_MESSAGE } from "./manusMediaAuthentication";
const original = process.env.MANUS_MEDIA_API_KEY;
afterEach(() => { if (original === undefined) delete process.env.MANUS_MEDIA_API_KEY; else process.env.MANUS_MEDIA_API_KEY = original; vi.unstubAllGlobals(); });
describe("deployed Manus media authentication gate", () => {
  it("fails closed before task.create when the deployed key is invalid", async () => {
    process.env.MANUS_MEDIA_API_KEY = `bad-production-key-${Date.now()}`;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return { status: 401 }; }));
    await expect(requireManusMediaAuthentication()).rejects.toThrow(MANUS_MEDIA_AUTH_MESSAGE);
    expect(calls).toEqual(["https://api.manus.ai/v2/task.list?limit=1"]);
  });
  it("accepts a validated media-specific credential without disclosing its value", async () => {
    process.env.MANUS_MEDIA_API_KEY = `valid-production-key-${Date.now()}`;
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const result = await checkManusMediaAuthentication();
    expect(result.ready).toBe(true);
    expect(result.status).toBe(200);
    expect(result.fingerprint).toHaveLength(12);
    expect(mediaCredential().value).toBe(process.env.MANUS_MEDIA_API_KEY);
    await requireManusMediaAuthentication();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

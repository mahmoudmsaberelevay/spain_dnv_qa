import { describe, expect, it } from "vitest";
import { checkManusMediaAuthentication, mediaCredential } from "./manusMediaAuthentication";

describe.runIf(process.env.RUN_MANUS_MEDIA_LIVE_TEST === "1")("dedicated Manus media credential live validation", () => {
  it("authenticates the supplied media-only key without generating anything", async () => {
    expect(process.env.MANUS_MEDIA_API_KEY?.trim()).toBeTruthy();
    expect(mediaCredential().value).toBe(process.env.MANUS_MEDIA_API_KEY?.trim());
    const result = await checkManusMediaAuthentication();
    expect(result.status).toBe(200);
    expect(result.ready).toBe(true);
  }, 30_000);
});

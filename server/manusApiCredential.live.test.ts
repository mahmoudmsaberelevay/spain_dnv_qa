import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("Manus media credential", () => {
  it("authenticates to the lightweight task-list endpoint without exposing the key", async () => {
    expect(ENV.manusApiKey).toBeTruthy();
    const response = await fetch("https://api.manus.ai/v2/task.list?limit=1", {
      headers: { "x-manus-api-key": ENV.manusApiKey },
      signal: AbortSignal.timeout(20_000),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { ok?: unknown };
    expect(body.ok).toBe(true);
  }, 30_000);
});

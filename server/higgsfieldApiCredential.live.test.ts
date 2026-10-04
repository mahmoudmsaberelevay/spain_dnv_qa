import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_HIGGSFIELD_LIVE_TEST === "1";

/** A nonexistent request ID tests authentication only; it never submits media. */
describe.skipIf(!enabled)("Higgsfield CRM credentials (read only)", () => {
  it("authenticates the server's complete HF_API_KEY without generating media", async () => {
    const apiKey = process.env.HF_API_KEY;
    expect(apiKey?.trim(), "HF_API_KEY must be supplied through WebDev Secrets").toBeTruthy();
    const response = await fetch("https://api.higgsfield.ai/requests/00000000-0000-4000-8000-000000000000/status", {
      method: "GET",
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    expect(response.status, "A 401/403 indicates invalid Higgsfield API credentials").not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.status, "Expected a nonexistent request, not a successful generation").toBe(404);
  });
});

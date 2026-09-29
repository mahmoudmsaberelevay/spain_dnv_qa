import { describe, expect, it } from "vitest";

const apiKey = process.env.CREATOMATE_API_KEY;
const runLiveValidation = process.env.RUN_LIVE_PROVIDER_VALIDATIONS === "true";

// Provider connectivity was validated when the credential was connected. Keep the
// regular CRM suite deterministic; operators may re-run this read-only probe with
// RUN_LIVE_PROVIDER_VALIDATIONS=true when checking a key or upstream status.
describe.runIf(runLiveValidation)("Creatomate media-rendering provider", () => {
  it("validates the protected key through the read-only template-list endpoint", async () => {
    expect(apiKey).toBeTruthy();
    const response = await fetch("https://api.creatomate.com/v2/templates", {
      headers: { Authorization: `Bearer ${apiKey!}` },
      // The endpoint is read-only; fail deterministically rather than leaving a
      // full CRM regression run blocked on an upstream network stall.
      signal: AbortSignal.timeout(12_000),
    });
    expect(response.ok).toBe(true);
    const templates = await response.json() as unknown;
    expect(Array.isArray(templates)).toBe(true);
  }, 15_000);
});

import { describe, expect, it } from "vitest";

const systemUserToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
const adAccountId = process.env.META_AD_ACCOUNT_ID;

describe("Meta Marketing provider read-only credential validation", () => {
  it("accepts the configured system-user token for a read-only ad-account list request", async () => {
    expect(systemUserToken, "META_SYSTEM_USER_ACCESS_TOKEN must be configured").toBeTruthy();

    const response = await fetch("https://graph.facebook.com/v26.0/me/adaccounts?fields=id,name,account_status,currency&limit=1", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${systemUserToken}`,
      },
    });
    const payload = await response.json() as { data?: unknown[]; error?: { code?: number; message?: string } };

    expect(response.status, `Meta rejected the read-only credential check (error code ${payload.error?.code ?? "unknown"}).`).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(Array.isArray(payload.data)).toBe(true);
  }, 30_000);

  it("accepts the configured ad-account identifier through a read-only account request", async () => {
    expect(adAccountId, "META_AD_ACCOUNT_ID must be configured").toMatch(/^\d+$/);

    const response = await fetch(`https://graph.facebook.com/v26.0/act_${adAccountId}?fields=id,name,account_status,currency`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${systemUserToken}`,
      },
    });
    const payload = await response.json() as { id?: string; error?: { code?: number; message?: string } };

    expect(response.status, `Meta rejected the read-only ad-account check (error code ${payload.error?.code ?? "unknown"}).`).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(payload.id).toBeTruthy();
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

const hasDedicatedCredentials = Boolean(ENV.newsGmailClientId && ENV.newsGmailClientSecret);

describe("ELEVAY News Gmail OAuth credentials", () => {
  it.runIf(hasDedicatedCredentials)("are accepted by Google's token endpoint", async () => {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ENV.newsGmailClientId,
        client_secret: ENV.newsGmailClientSecret,
        code: "elevay-intentional-invalid-code",
        grant_type: "authorization_code",
        redirect_uri: "https://elevay.vip/api/admin/news/gmail/callback",
      }),
    });
    const payload = await response.json() as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("invalid_grant");
  });
});

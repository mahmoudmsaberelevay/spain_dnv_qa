import crypto from "crypto";
import { describe, expect, it } from "vitest";

describe("configured Meta App Secret", () => {
  it("authenticates a signed PII-free payload through the real webhook endpoint", async () => {
    const appSecret = process.env.META_APP_SECRET;
    expect(appSecret, "META_APP_SECRET must be configured").toBeTruthy();

    const body = JSON.stringify({ object: "page", entry: [] });
    const signature = `sha256=${crypto.createHmac("sha256", appSecret!).update(body).digest("hex")}`;
    const response = await fetch("http://127.0.0.1:3000/api/webhook/meta-leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature,
      },
      body,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, accepted: 0, ignored: 0 });
  });
});

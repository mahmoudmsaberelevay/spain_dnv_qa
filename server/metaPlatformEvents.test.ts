import crypto from "crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { buildSafeEvents, verifyMetaSignedRequest } from "./metaPlatformEvents";

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signedRequest(payload: Record<string, unknown>, secret: string) {
  const encoded = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest();
  return `${base64Url(signature)}.${encoded}`;
}

describe("Meta platform webhook privacy boundary", () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = "unit-test-meta-secret";
  });

  it("keeps Page comment events idempotent and excludes comment text and names", () => {
    const payload = {
      object: "page",
      entry: [{ id: "page-123", time: 1_791_000_000, changes: [{
        field: "feed",
        value: { comment_id: "comment-1", verb: "add", message: "private comment body", from: { id: "person-4", name: "Private Name" } },
      }] }],
    };
    const events = buildSafeEvents(payload, true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ objectType: "page", field: "feed", eventType: "add", signatureValidated: true });
    expect(events[0]?.actorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(events[0])).not.toContain("private comment body");
    expect(JSON.stringify(events[0])).not.toContain("Private Name");
    expect(buildSafeEvents(payload, true)[0]?.eventKey).toBe(events[0]?.eventKey);
  });

  it("records Instagram Messenger delivery metadata without persisting message content", () => {
    const events = buildSafeEvents({
      object: "instagram",
      entry: [{ id: "ig-business-7", messaging: [{ sender: { id: "sender-1" }, recipient: { id: "ig-business-7" }, timestamp: 1_791_000_000_000, message: { mid: "mid-1", text: "confidential DM" } }] }],
    }, true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ objectType: "instagram", field: "messaging", eventType: "message" });
    expect(JSON.stringify(events[0])).not.toContain("confidential DM");
  });

  it("accepts only a correctly signed Meta data-deletion request and stores no raw user id", () => {
    const signed = signedRequest({ algorithm: "HMAC-SHA256", issued_at: 1_791_000_000, user_id: "meta-user-88" }, "unit-test-meta-secret");
    const verified = verifyMetaSignedRequest(signed);
    expect(verified?.userIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(verified)).not.toContain("meta-user-88");
    expect(verifyMetaSignedRequest(`${signed}tamper`)).toBeNull();
  });
});

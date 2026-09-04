import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  insertedInboxRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./emailService", () => ({ sendMetaLeadAlert: vi.fn(), TEAM_EMAIL_MAP: {} }));

import {
  addAttribution,
  buildMetaCrmEventId,
  buildMetaCrmPayload,
  findMatchingLead,
  hashMetaEmail,
  hashMetaPhone,
  isMetaEventWithinRetryWindow,
  mapMetaFields,
  normalizeMetaEmail,
  normalizeMetaPhone,
  requiredEarlierMetaEvents,
  safeMetaError,
  shouldEnqueueMetaConverted,
  storeMetaWebhookNotifications,
  verifyMetaWebhookSignature,
} from "./metaLeadsService";

function fakeInboxDb() {
  return {
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        mocks.insertedInboxRows.push(value);
        return { onDuplicateKeyUpdate: vi.fn(async () => [{ affectedRows: 1 }]) };
      }),
    })),
  };
}

describe("Meta Leads safety helpers", () => {
  const originalAppSecret = process.env.META_APP_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedInboxRows.length = 0;
    mocks.getDb.mockResolvedValue(fakeInboxDb());
    process.env.META_APP_SECRET = "unit-test-app-secret";
  });

  afterEach(() => {
    if (originalAppSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = originalAppSecret;
  });

  it("accepts the exact HMAC and rejects invalid signatures", () => {
    const raw = Buffer.from('{"object":"page","entry":[]}');
    const valid = `sha256=${crypto.createHmac("sha256", "unit-test-app-secret").update(raw).digest("hex")}`;
    expect(verifyMetaWebhookSignature(raw, valid)).toBe(true);
    expect(verifyMetaWebhookSignature(raw, "sha256=bad")).toBe(false);
    expect(verifyMetaWebhookSignature(raw)).toBe(false);
  });

  it("normalizes email and Egyptian phone values before SHA-256 hashing", () => {
    expect(normalizeMetaEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(normalizeMetaPhone("0100 123 4567")).toBe("+201001234567");
    expect(hashMetaEmail("Person@Example.COM")).toBe(crypto.createHash("sha256").update("person@example.com").digest("hex"));
    expect(hashMetaPhone("0100 123 4567")).toBe(crypto.createHash("sha256").update("+201001234567").digest("hex"));
  });

  it("maps supported Meta form fields without inventing values", () => {
    expect(mapMetaFields([
      { name: "first_name", values: ["Mahmoud"] },
      { name: "last_name", values: ["Saber"] },
      { name: "email", values: ["person@example.com"] },
      { name: "phone_number", values: ["01001234567"] },
    ])).toMatchObject({ fullName: "Mahmoud Saber", email: "person@example.com", phone: "01001234567" });
  });

  it("creates the same webhook idempotency key on replay and persists no form-answer PII", async () => {
    const payload = {
      object: "page",
      entry: [{
        id: "123456789",
        time: 1760000000,
        changes: [{
          field: "leadgen",
          value: {
            leadgen_id: "1234567890123456",
            page_id: "123456789",
            form_id: "99887766",
            ad_id: "88776655",
            created_time: 1760000000,
            field_data: [{ name: "email", values: ["person@example.com"] }],
            phone_number: "+201001234567",
          },
        }],
      }],
    };

    await storeMetaWebhookNotifications(payload);
    await storeMetaWebhookNotifications(payload);

    expect(mocks.insertedInboxRows).toHaveLength(2);
    expect(mocks.insertedInboxRows[0]?.webhookKey).toBe(mocks.insertedInboxRows[1]?.webhookKey);
    const persisted = JSON.stringify(mocks.insertedInboxRows[0]);
    expect(persisted).not.toContain("person@example.com");
    expect(persisted).not.toContain("+201001234567");
    expect(persisted).not.toContain("field_data");
  });

  it("matches an existing contact by normalized phone after Meta Lead ID checks", async () => {
    const existing = { id: 77, fullName: "Existing Contact", normalizedPhone: "+201001234567" };
    const sequences = [[], [], [existing]];
    let call = 0;
    const db = {
      select: vi.fn(() => {
        const rows = sequences[call++] ?? [];
        const chain: any = {};
        chain.from = vi.fn(() => chain);
        chain.where = vi.fn(() => chain);
        chain.orderBy = vi.fn(() => chain);
        chain.limit = vi.fn(async () => rows);
        return chain;
      }),
    };
    mocks.getDb.mockResolvedValue(db);

    await expect(findMatchingLead("9999999999999999", "+201001234567", "existing@example.com")).resolves.toEqual(existing);
    expect(db.select).toHaveBeenCalledTimes(3);
  });

  it("preserves separate immutable inquiry rows for two Meta Lead IDs on the same Lead", async () => {
    mocks.getDb.mockResolvedValue(fakeInboxDb());
    const base = {
      metaPageId: "page-1",
      metaFormId: "form-1",
      metaFormName: "Spain Form",
      metaCampaignId: "campaign-1",
      metaCampaignName: "Spain Campaign",
      metaAdSetId: "adset-1",
      metaAdSetName: "Ad Set",
      metaAdId: "ad-1",
      metaAdName: "Ad",
      metaIsOrganic: false,
      source: "Meta Instant Form",
      program: "Spain DNV",
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "Spain Campaign",
      utmContent: "Ad",
      utmTerm: "Ad Set",
      metaLeadCreatedAt: 1760000000000,
      firstReceivedAt: 1760000005000,
    };
    await addAttribution(77, { ...base, metaLeadId: "1111111111111111" } as any, true);
    await addAttribution(77, { ...base, metaLeadId: "2222222222222222", metaFormId: "form-2" } as any, false);

    expect(mocks.insertedInboxRows.map(row => row.metaLeadId)).toEqual(["1111111111111111", "2222222222222222"]);
    expect(mocks.insertedInboxRows.map(row => row.leadId)).toEqual([77, 77]);
    expect(mocks.insertedInboxRows.map(row => row.isPrimary)).toEqual([true, false]);
  });

  it("builds stable event IDs for the same authoritative transition", () => {
    const input = { leadId: 42, metaLeadId: "1234567890123456", eventName: "Converted", sourceType: "contract_status", sourceId: 9001 };
    expect(buildMetaCrmEventId(input)).toBe(buildMetaCrmEventId(input));
    expect(buildMetaCrmEventId(input)).not.toBe(buildMetaCrmEventId({ ...input, sourceId: 9002 }));
  });

  it("requires valid earlier funnel history before Sales Opportunity or Converted", () => {
    expect(requiredEarlierMetaEvents("Initial Lead from Facebook")).toEqual([]);
    expect(requiredEarlierMetaEvents("Contacted")).toEqual(["Initial Lead from Facebook"]);
    expect(requiredEarlierMetaEvents("Marketing Qualified Lead")).toEqual(["Initial Lead from Facebook"]);
    expect(requiredEarlierMetaEvents("Converted")).toEqual(["Initial Lead from Facebook", "Marketing Qualified Lead"]);
  });

  it("queues Converted only for a genuine transition into signed contract status", () => {
    expect(shouldEnqueueMetaConverted("pending", "signed")).toBe(true);
    expect(shouldEnqueueMetaConverted("cancelled", "signed")).toBe(true);
    expect(shouldEnqueueMetaConverted("signed", "signed")).toBe(false);
    expect(shouldEnqueueMetaConverted("pending", "cancelled")).toBe(false);
  });

  it("retries only events still inside Meta's seven-day upload window", () => {
    const nowMs = 1_800_000_000_000;
    const nowSeconds = Math.floor(nowMs / 1000);
    expect(isMetaEventWithinRetryWindow(nowSeconds - 60, nowMs)).toBe(true);
    expect(isMetaEventWithinRetryWindow(nowSeconds - 7 * 24 * 60 * 60, nowMs)).toBe(true);
    expect(isMetaEventWithinRetryWindow(nowSeconds - 7 * 24 * 60 * 60 - 1, nowMs)).toBe(false);
    expect(isMetaEventWithinRetryWindow(nowSeconds + 60, nowMs)).toBe(false);
  });

  it("builds a system-generated CRM payload with hashes and no raw contact data", () => {
    const payload = buildMetaCrmPayload({
      id: 1,
      leadId: 42,
      metaLeadId: "1234567890123456",
      eventName: "Marketing Qualified Lead",
      eventTime: 1760000000,
      eventId: "stable-event-id",
      sourceType: "lead_activity",
      sourceId: "meeting_scheduled",
      sourceStage: "meeting_scheduled",
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      hasLeadId: true,
      hasEmailHash: true,
      hasPhoneHash: true,
      metaResponse: null,
      errorCode: null,
      lastError: null,
      createdAt: 1760000000000,
      updatedAt: 1760000000000,
      sentAt: null,
    } as any, {
      id: 42,
      email: "person@example.com",
      phone: "0100 123 4567",
      normalizedEmail: "person@example.com",
      normalizedPhone: "+201001234567",
      interestedProgram: "Spain DNV",
    } as any, "TEST123");

    const serialized = JSON.stringify(payload);
    expect(payload).toMatchObject({
      test_event_code: "TEST123",
      data: [{
        event_name: "Marketing Qualified Lead",
        event_time: 1760000000,
        event_id: "stable-event-id",
        action_source: "system_generated",
        user_data: { lead_id: "1234567890123456" },
        custom_data: { program: "Spain DNV", internal_lead_id: "42", event_source: "crm" },
      }],
    });
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("0100 123 4567");
    expect(serialized).toContain(hashMetaEmail("person@example.com")!);
    expect(serialized).toContain(hashMetaPhone("0100 123 4567")!);
  });

  it("redacts query-string and bearer tokens from persisted error text", () => {
    const message = safeMetaError(new Error("request failed access_token=secret-value&x=1 Authorization Bearer abc.def.ghi"));
    expect(message).not.toContain("secret-value");
    expect(message).not.toContain("abc.def.ghi");
    expect(message).toContain("[REDACTED]");
  });
});

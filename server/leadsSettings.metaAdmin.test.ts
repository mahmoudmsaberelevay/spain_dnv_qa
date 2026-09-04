import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLeadIntegrations: vi.fn(),
  createLeadIntegration: vi.fn(),
  getMetaIntegrationHealth: vi.fn(),
}));

vi.mock("./leadsSettingsDb", async importOriginal => {
  const actual = await importOriginal<typeof import("./leadsSettingsDb")>();
  return {
    ...actual,
    listLeadIntegrations: mocks.listLeadIntegrations,
    createLeadIntegration: mocks.createLeadIntegration,
  };
});

vi.mock("./metaLeadsService", async importOriginal => {
  const actual = await importOriginal<typeof import("./metaLeadsService")>();
  return { ...actual, getMetaIntegrationHealth: mocks.getMetaIntegrationHealth };
});

import { leadsSettingsRouter } from "./routers/leadsSettings";

function caller(role: "admin" | "user") {
  return leadsSettingsRouter.createCaller({
    user: { id: role === "admin" ? 1 : 8, openId: `${role}-tester`, email: `${role}@example.com`, name: role, role },
    req: { headers: {} },
    res: {},
  } as any);
}

describe("Meta Leads admin authorization and secret redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMetaIntegrationHealth.mockResolvedValue({ configured: false });
    mocks.createLeadIntegration.mockResolvedValue({ webhookToken: "not-returned-for-meta-setup" });
  });

  it("denies non-admin access to Meta health, forms, and configuration creation", async () => {
    await expect(caller("user").metaAdmin.health()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").listMetaForms({ integrationId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").createIntegration({ type: "meta", name: "Meta" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getMetaIntegrationHealth).not.toHaveBeenCalled();
    expect(mocks.createLeadIntegration).not.toHaveBeenCalled();
  });

  it("allows an admin to read the Meta health summary", async () => {
    await expect(caller("admin").metaAdmin.health()).resolves.toEqual({ configured: false });
    expect(mocks.getMetaIntegrationHealth).toHaveBeenCalledTimes(1);
  });

  it("redacts all legacy stored Meta credentials and the webhook token from integration responses", async () => {
    mocks.listLeadIntegrations.mockResolvedValue([{
      id: 1,
      type: "meta",
      name: "Meta",
      config: JSON.stringify({
        page_access_token: "secret-page-token",
        access_token: "other-secret",
        app_secret: "app-secret",
        capi_token: "capi-secret",
        verify_token: "verify-secret",
        page_id: "123",
      }),
      isActive: true,
      webhookToken: "website-only-token",
      lastSyncAt: null,
      lastSyncCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }]);
    const result = await caller("user").listIntegrations();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret-page-token");
    expect(serialized).not.toContain("other-secret");
    expect(serialized).not.toContain("app-secret");
    expect(serialized).not.toContain("capi-secret");
    expect(serialized).not.toContain("verify-secret");
    expect(serialized).not.toContain("website-only-token");
    expect(result[0]?.hasMetaPageAccessToken).toBe(true);
    expect(result[0]?.hasMetaWebhookVerifyToken).toBe(true);
    expect(result[0]?.webhookToken).toBe("");
    expect(JSON.parse(result[0]!.config!)).toEqual({ page_id: "123" });
  });

  it("drops browser-supplied Meta credentials before creating an integration", async () => {
    await caller("admin").createIntegration({
      type: "meta",
      name: "Meta",
      config: {
        page_access_token: "page-secret",
        app_secret: "app-secret",
        verify_token: "verify-secret",
        page_id: "123",
      },
    });
    expect(mocks.createLeadIntegration).toHaveBeenCalledWith({
      type: "meta",
      name: "Meta",
      config: { page_id: "123" },
    });
  });
});

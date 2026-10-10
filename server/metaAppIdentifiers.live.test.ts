import { describe, expect, it } from "vitest";

/**
 * Opt-in real Graph API probe. It never prints credentials or mutates Meta.
 * Run with ELEVAY_RUN_META_IDENTIFIER_LIVE_TEST=true after changing IDs.
 */
describe("Meta app identifier configuration", () => {
  it.skipIf(process.env.ELEVAY_RUN_META_IDENTIFIER_LIVE_TEST !== "true")(
    "resolves the configured app and Page through the ELEVAY system user",
    async () => {
      const appId = process.env.META_APP_ID;
      const pageId = process.env.META_PAGE_ID;
      const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
      const version = process.env.META_GRAPH_API_VERSION || "v26.0";

      expect(appId).toMatch(/^\d+$/);
      expect(pageId).toMatch(/^\d+$/);
      expect(token).toBeTruthy();

      const get = async (id: string) => {
        const response = await fetch(
          `https://graph.facebook.com/${version}/${id}?fields=id&access_token=${encodeURIComponent(token!)}`,
        );
        const body = await response.json() as { id?: string; error?: { code?: number } };
        expect(response.ok, `Meta Graph error ${body.error?.code ?? response.status}`).toBe(true);
        return body;
      };

      expect((await get(appId!)).id).toBe(appId);
      expect((await get(pageId!)).id).toBe(pageId);
    },
    30_000,
  );
});

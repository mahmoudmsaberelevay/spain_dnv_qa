import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ELEVAY_REEL_PRODUCTION_PROVIDER, getMarketingProviderConnection, providerSecretPresence } from "../shared/marketingProviderConnections";

const root = resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

describe("automatic preview verification and Higgsfield reel policy", () => {
  it("selects Higgsfield clips after OpenAI keyframes, without unlocking generation", () => {
    expect(ELEVAY_REEL_PRODUCTION_PROVIDER).toBe("higgsfield-clips");
    const provider = getMarketingProviderConnection(ELEVAY_REEL_PRODUCTION_PROVIDER);
    expect(provider?.provider).toBe("Higgsfield API");
    expect(provider?.secretKeys).toEqual(["HF_API_KEY"]);
    expect(providerSecretPresence(provider!, {}).allPresent).toBe(false);
    expect(providerSecretPresence(provider!, { HF_API_KEY: "complete-server-side-key" }).allPresent).toBe(true);
    expect(provider?.executionBoundary).toContain("Read-only authentication");
    expect(getMarketingProviderConnection("manus-orchestrator")?.executionBoundary).toContain("No Manus-native footage");
  });

  it("requires a system-generated asset link without exposing manual URLs or fingerprints", () => {
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/WeeklyResults.tsx");
    const media = read("server/reelCompositorService.ts");
    const schema = read("drizzle/schema.ts");
    expect(router).toContain("requireSystemGeneratedWeeklyMedia");
    expect(router).toContain("requireSystemGeneratedContentMedia");
    expect(router).not.toContain("attachWeeklyResultsPreview");
    expect(router).toContain("fingerprintMarketingAsset(input.narration.url");
    expect(schema).toContain("marketingGeneratedMediaAssets");
    expect(media).toContain("callers must never ask a");
    expect(page).toContain("System-generated preview");
    expect(page).toContain("You do not upload an image or video, paste a URL");
    expect(page).not.toContain("Preview SHA-256 fingerprint");
    expect(page).not.toContain("Final preview HTTPS URL");
  });
});

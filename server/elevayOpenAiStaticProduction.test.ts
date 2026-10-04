import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { produceElevayOpenAiStaticForOwnerReview, type ApprovedStaticTypography, type ReadyWeeklyStaticItem } from "./elevayOpenAiStaticProduction";

function png(width = 1024, height = 1024, fill = 0) {
  const bytes = Buffer.alloc(33, fill);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function digest(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const item: ReadyWeeklyStaticItem = {
  id: 47,
  itemType: "static_post",
  status: "ready_to_generate",
  onDesignEnglishText: "Plan your global future",
  detailedPrompt: "Premium editorial 1024x1024 scene of a warm Mediterranean terrace and contemporary architecture at golden hour, composed with intentional lower-third quiet space for later English typography. Natural light, refined navy, baby-blue, cream, and restrained gold palette; no people, no text, no logo, no passports, no flags, no contact details.",
};

function approvedTypography(): ApprovedStaticTypography {
  return {
    family: "Plus Jakarta Sans",
    approvedFallback: true,
    faces: [
      { weight: "regular", path: "/approved/PlusJakartaSans-Regular.ttf", sha256: "a".repeat(64) },
      { weight: "bold", path: "/approved/PlusJakartaSans-Bold.ttf", sha256: "b".repeat(64) },
    ],
  };
}

function keyframe(bytes = png(1024, 1024, 1), overrides: Partial<Record<string, unknown>> = {}) {
  return {
    provider: "openai" as const,
    model: "gpt-image-2.5-sunburst",
    url: "https://storage.elevay.test/marketing/openai/static.png",
    storageKey: "marketing/openai/static_post/keyframe.png",
    sha256: digest(bytes),
    width: 1024,
    height: 1024,
    inputTokens: 123,
    outputTokens: 456,
    measuredCostUsd: 0.0143,
    ...overrides,
  };
}

describe("OpenAI ELEVAY static owner-review production", () => {
  it("orders owner font validation, fixed square keyframe download, English text treatment, exact logo composition, then immutable content-addressed storage", async () => {
    const events: string[] = [];
    const source = png(1024, 1024, 1);
    const textTreated = png(1024, 1024, 2);
    const final = png(1024, 1024, 3);
    const typography = vi.fn(async () => { events.push("typography"); return approvedTypography(); });
    const createKeyframe = vi.fn(async (input: { prompt: string; purpose: "static_post"; size?: string }) => {
      events.push("keyframe");
      expect(input).toMatchObject({ purpose: "static_post", size: "1024x1024" });
      expect(input.prompt).toContain(item.detailedPrompt);
      expect(input.prompt).toContain("Do not render any visible text");
      return keyframe(source);
    });
    const download = vi.fn(async () => {
      events.push("download");
      return new Response(source, { status: 200, headers: { "content-type": "image/png" } });
    });
    const ffmpeg = {
      overlayEnglishText: vi.fn(async input => {
        events.push("ffmpeg");
        expect(input).toMatchObject({ source, text: item.onDesignEnglishText, width: 1024, height: 1024, contrastGradient: "dark_navy_bottom" });
        expect(input.typography.family).toBe("Plus Jakarta Sans");
        expect(input.typography.approvedFallback).toBe(true);
        return textTreated;
      }),
    };
    const applyOfficialLogo = vi.fn(async input => {
      events.push("logo");
      expect(input).toEqual(textTreated);
      return { bytes: final, logoSha256: "c".repeat(64) };
    });
    const storeImmutable = vi.fn(async (storageKey: string, bytes: Buffer, mimeType: "image/png") => {
      events.push("store");
      expect(storageKey).toBe(`marketing/static-production/47/${digest(final)}.png`);
      expect(bytes).toEqual(final);
      expect(mimeType).toBe("image/png");
      return { key: storageKey, url: `https://storage.elevay.test/${storageKey}` };
    });

    const result = await produceElevayOpenAiStaticForOwnerReview(item, {
      trustedFirstPartyStorageOrigins: ["https://storage.elevay.test"],
      typography,
      createKeyframe,
      download: download as typeof fetch,
      ffmpeg,
      applyOfficialLogo,
      storeImmutable,
    });

    expect(events).toEqual(["typography", "keyframe", "download", "ffmpeg", "logo", "store"]);
    expect(result).toMatchObject({
      reviewOnly: true,
      publicationAuthorized: false,
      itemId: 47,
      actualOpenAiCostUsd: 0.0143,
      inputTokens: 123,
      outputTokens: 456,
      final: { sha256: digest(final), width: 1024, height: 1024, mimeType: "image/png" },
      provenance: {
        provider: "openai",
        keyframe: { sha256: digest(source), width: 1024, height: 1024 },
        officialLogoSha256: "c".repeat(64),
        typography: { family: "Plus Jakarta Sans", approvedFallback: true, faceSha256: ["a".repeat(64), "b".repeat(64)] },
      },
    });
  });

  it("fails closed before download or rendering when OpenAI provenance does not declare an exact 1024x1024 keyframe", async () => {
    const download = vi.fn();
    const ffmpeg = { overlayEnglishText: vi.fn() };
    await expect(produceElevayOpenAiStaticForOwnerReview(item, {
      trustedFirstPartyStorageOrigins: ["https://storage.elevay.test"],
      typography: async () => approvedTypography(),
      createKeyframe: async () => keyframe(png(1024, 1024), { width: 1080 }),
      download: download as typeof fetch,
      ffmpeg,
      applyOfficialLogo: async () => ({ bytes: png(), logoSha256: "d".repeat(64) }),
      storeImmutable: async () => ({ key: "unused", url: "https://storage.elevay.test/unused" }),
    })).rejects.toThrow("fixed dimensions");
    expect(download).not.toHaveBeenCalled();
    expect(ffmpeg.overlayEnglishText).not.toHaveBeenCalled();
  });

  it("requires the owner-approved Plus Jakarta Sans fallback before any chargeable keyframe call", async () => {
    const createKeyframe = vi.fn();
    await expect(produceElevayOpenAiStaticForOwnerReview(item, {
      trustedFirstPartyStorageOrigins: ["https://storage.elevay.test"],
      typography: async () => ({ ...approvedTypography(), family: "Apex Sans" } as unknown as ApprovedStaticTypography),
      createKeyframe,
      storeImmutable: async () => ({ key: "unused", url: "https://storage.elevay.test/unused" }),
    })).rejects.toThrow("Plus Jakarta Sans fallback");
    expect(createKeyframe).not.toHaveBeenCalled();
  });

  it("refuses an unsafe CDN before downloading, rendering, logo composition, or final storage", async () => {
    const source = png();
    const download = vi.fn();
    const ffmpeg = { overlayEnglishText: vi.fn() };
    const applyOfficialLogo = vi.fn();
    const storeImmutable = vi.fn();
    await expect(produceElevayOpenAiStaticForOwnerReview(item, {
      trustedFirstPartyStorageOrigins: ["https://storage.elevay.test"],
      typography: async () => approvedTypography(),
      createKeyframe: async () => keyframe(source, { url: "https://unsafe-cdn.example/static.png" }),
      download: download as typeof fetch,
      ffmpeg,
      applyOfficialLogo,
      storeImmutable,
    })).rejects.toThrow("untrusted CDN");
    expect(download).not.toHaveBeenCalled();
    expect(ffmpeg.overlayEnglishText).not.toHaveBeenCalled();
    expect(applyOfficialLogo).not.toHaveBeenCalled();
    expect(storeImmutable).not.toHaveBeenCalled();
  });

  it("refuses Arabic on-design text and privacy/guarantee violations without loading fonts or calling OpenAI", async () => {
    const typography = vi.fn();
    const createKeyframe = vi.fn();
    await expect(produceElevayOpenAiStaticForOwnerReview({ ...item, onDesignEnglishText: "خطط لمستقبلك" }, {
      trustedFirstPartyStorageOrigins: ["https://storage.elevay.test"],
      typography,
      createKeyframe,
      storeImmutable: async () => ({ key: "unused", url: "https://storage.elevay.test/unused" }),
    })).rejects.toThrow("English-only");
    await expect(produceElevayOpenAiStaticForOwnerReview({ ...item, detailedPrompt: `${item.detailedPrompt} Guaranteed approval; contact client name Ahmed.` }, {
      trustedFirstPartyStorageOrigins: ["https://storage.elevay.test"],
      typography,
      createKeyframe,
      storeImmutable: async () => ({ key: "unused", url: "https://storage.elevay.test/unused" }),
    })).rejects.toThrow("contact, client, or Lead");
    expect(typography).not.toHaveBeenCalled();
    expect(createKeyframe).not.toHaveBeenCalled();
  });

  it("requires an exact active-logo hash and never stores a final asset without it", async () => {
    const source = png();
    const storeImmutable = vi.fn();
    await expect(produceElevayOpenAiStaticForOwnerReview(item, {
      trustedFirstPartyStorageOrigins: ["https://storage.elevay.test"],
      typography: async () => approvedTypography(),
      createKeyframe: async () => keyframe(source),
      download: (async () => new Response(source, { headers: { "content-type": "image/png" } })) as typeof fetch,
      ffmpeg: { overlayEnglishText: async () => png(1024, 1024, 4) },
      applyOfficialLogo: async () => ({ bytes: png(1024, 1024, 5), logoSha256: "not-a-hash" }),
      storeImmutable,
    })).rejects.toThrow("official ELEVAY logo fingerprint");
    expect(storeImmutable).not.toHaveBeenCalled();
  });
});

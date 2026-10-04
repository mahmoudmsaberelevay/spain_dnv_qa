import { describe, expect, it } from "vitest";
import {
  validateArabicOnlyMarketingText,
  validateBilingualElevayCaption,
  validateElevayArabicVoiceOverScript,
  validateEnglishOnlyOnScreenText,
} from "../shared/marketingCreativeLanguagePolicy";

describe("ELEVAY creative language policy", () => {
  it("requires Arabic marketing copy while allowing normal Arabic punctuation", () => {
    expect(validateArabicOnlyMarketingText("اكتشف مسار الإقامة المناسب لعائلتك.", "Copy")).toBeNull();
    expect(validateArabicOnlyMarketingText("Discover your next residency path", "Copy")).toContain("Arabic");
    expect(validateArabicOnlyMarketingText("اكتشف Spain residency", "Copy")).toContain("English");
    expect(validateArabicOnlyMarketingText("اكتشف المسار المناسب #Spain", "Copy")).toContain("English");
  });

  it("allows an English companion line in a caption while retaining Arabic", () => {
    expect(validateBilingualElevayCaption("اكتشف مسار الإقامة المناسب\nDiscover your residency path")).toBeNull();
    expect(validateBilingualElevayCaption("Discover your residency path")).toContain("must include Arabic");
  });

  it("requires English-only on-screen visual text or the explicit NONE marker", () => {
    expect(validateEnglishOnlyOnScreenText("SPAIN DIGITAL NOMAD VISA")).toBeNull();
    expect(validateEnglishOnlyOnScreenText("NONE")).toBeNull();
    expect(validateEnglishOnlyOnScreenText("إقامة إسبانيا")).toContain("English only");
    expect(validateEnglishOnlyOnScreenText("")).toContain("required");
  });

  it("allows only English country and company names in Egyptian Arabic voice-over scripts", () => {
    expect(validateElevayArabicVoiceOverScript("اكتشف الإقامة في Spain مع ELEVAY")).toBeNull();
    expect(validateElevayArabicVoiceOverScript("اكتشف الإقامة في Spain معنا اليوم")).toBeNull();
    expect(validateElevayArabicVoiceOverScript("Discover Spain residency")).toContain("Arabic");
    expect(validateElevayArabicVoiceOverScript("اكتشف Spain residency مع ELEVAY")).toContain("Egyptian Arabic");
  });
});

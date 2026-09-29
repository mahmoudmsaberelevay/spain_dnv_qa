import { describe, expect, it } from "vitest";
import {
  MARKETING_CONTENT_ALLOWED_NEXT_STATES,
  MARKETING_CONTENT_QA_CHECKS,
  contentCanTransition,
  contentPacketHasArabicText,
  contentPacketOutputSchema,
  findDisallowedContentPacketData,
  validatePreviewFingerprint,
} from "../shared/marketingContentStudio";

describe("Agentic Marketing Phase 4 Content Studio policy", () => {
  it("defines a constrained human-review state machine with terminal stop and supersession", () => {
    expect(MARKETING_CONTENT_ALLOWED_NEXT_STATES.draft).toEqual(["in_review", "stopped"]);
    expect(contentCanTransition("in_review", "qa_passed")).toBe(true);
    expect(contentCanTransition("qa_passed", "approval_ready")).toBe(true);
    expect(contentCanTransition("approval_ready", "approved")).toBe(true);
    expect(contentCanTransition("draft", "approved")).toBe(false);
    expect(contentCanTransition("stopped", "draft")).toBe(false);
    expect(contentCanTransition("superseded", "approval_ready")).toBe(false);
  });

  it("requires the complete deterministic QA contract and typed outputs for every packet type", () => {
    expect(MARKETING_CONTENT_QA_CHECKS).toHaveLength(10);
    expect(MARKETING_CONTENT_QA_CHECKS).toContain("no_guarantees");
    expect(MARKETING_CONTENT_QA_CHECKS).toContain("preview_equivalence");
    expect(contentPacketOutputSchema("static_post").artifactType).toBe("StaticPostPacket");
    expect(contentPacketOutputSchema("reel").artifactType).toBe("ReelPacket");
    expect(contentPacketOutputSchema("lead_ad").artifactType).toBe("LeadAdPacket");
  });

  it("keeps Arabic-first content and blocks contact or client identity data", () => {
    expect(contentPacketHasArabicText("إقامة إسبانيا")) .toBe(true);
    expect(contentPacketHasArabicText("Spain residency")) .toBe(false);
    expect(findDisallowedContentPacketData("Use example@elevay.com in this post")).toBe("email address");
    expect(findDisallowedContentPacketData("Call +20 100 123 4567 now")).toBe("phone or contact number");
    expect(findDisallowedContentPacketData("Include the passport record in the caption")).toBe("client identity reference");
    expect(findDisallowedContentPacketData("Explain verified programme requirements with an effective date.")).toBeNull();
  });

  it("requires an HTTPS final preview and SHA-256 fingerprint before final approval processing", () => {
    const hash = "a".repeat(64);
    expect(validatePreviewFingerprint(undefined, undefined)).toContain("required");
    expect(validatePreviewFingerprint("http://example.com/preview", hash)).toContain("HTTPS");
    expect(validatePreviewFingerprint("https://example.com/preview", "not-a-hash")).toContain("SHA-256");
    expect(validatePreviewFingerprint("https://example.com/preview", hash)).toBeNull();
  });
});

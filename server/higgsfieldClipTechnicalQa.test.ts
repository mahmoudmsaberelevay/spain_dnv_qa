import { describe, expect, it } from "vitest";
import { validateHiggsfieldClipProbe } from "./higgsfieldClipTechnicalQa";

const valid = { width: 720, height: 1280, durationMs: 5_000, videoCodec: "h264", audioCodec: null };

describe("Higgsfield clip technical QA without generation", () => {
  it("accepts only a technically valid five-second silent vertical clip, pending human frame QC", () => {
    expect(validateHiggsfieldClipProbe(valid)).toMatchObject({ technicallyValid: true, needsHeadToToeFrameReview: true, sourceWidth: 720, sourceHeight: 1280 });
  });
  it("rejects landscape or stretched sources and low-resolution portrait clips", () => {
    expect(() => validateHiggsfieldClipProbe({ ...valid, width: 1280, height: 720 })).toThrow("native vertical 9:16");
    expect(() => validateHiggsfieldClipProbe({ ...valid, width: 480, height: 854 })).toThrow("premium source minimum");
  });
  it("rejects clips with native Higgsfield audio or the wrong scene length", () => {
    expect(() => validateHiggsfieldClipProbe({ ...valid, audioCodec: "aac" })).toThrow("native audio");
    expect(() => validateHiggsfieldClipProbe({ ...valid, durationMs: 7_000 })).toThrow("five seconds");
    expect(() => validateHiggsfieldClipProbe({ ...valid, videoCodec: null })).toThrow("playable video");
  });
});

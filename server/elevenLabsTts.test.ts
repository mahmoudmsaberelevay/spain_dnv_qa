import { describe, expect, it } from "vitest";
import {
  ElevenLabsVoiceUnavailableError,
  isValidMp3Buffer,
  prepareThoughtfulArabicScript,
} from "./elevenLabsTts";

describe("prepareThoughtfulArabicScript", () => {
  it("adds the approved thoughtful delivery tag to a plain script", () => {
    expect(prepareThoughtfulArabicScript("السلام عليكم")).toBe("[thoughtful] السلام عليكم");
  });

  it("preserves an existing thoughtful delivery tag", () => {
    expect(prepareThoughtfulArabicScript("[thoughtful] السلام عليكم")).toBe("[thoughtful] السلام عليكم");
  });
});

describe("ELEVAY voice-over output validation", () => {
  it("accepts MP3 files with either an ID3 tag or MPEG frame header", () => {
    expect(isValidMp3Buffer(Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]))).toBe(true);
    expect(isValidMp3Buffer(Buffer.from([0xff, 0xfb, 0x90, 0x64]))).toBe(true);
  });

  it("rejects empty, HTML, and non-audio provider responses before storage", () => {
    expect(isValidMp3Buffer(Buffer.alloc(0))).toBe(false);
    expect(isValidMp3Buffer(Buffer.from("<!DOCTYPE html>"))).toBe(false);
    expect(isValidMp3Buffer(Buffer.from("{\"error\":\"bad request\"}"))).toBe(false);
  });

  it("identifies an inaccessible approved voice without silently changing the brand voice", () => {
    const error = new ElevenLabsVoiceUnavailableError();
    expect(error.name).toBe("ElevenLabsVoiceUnavailableError");
    expect(error.message).toMatch(/approved ELEVAY voice/i);
  });
});

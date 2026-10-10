import { describe, expect, it } from "vitest";
import {
  ELEVAY_ARABIC_VOICE_DEFAULTS,
  ElevenLabsVoiceUnavailableError,
  isValidMp3Buffer,
  prepareElevayEgyptianSpeechScript,
  prepareThoughtfulArabicScript,
} from "./elevenLabsTts";

describe("mandatory ELEVAY Egyptian voice policy", () => {
  it("pins the owner-selected voice, model, Arabic language and Egyptian dialect", () => {
    expect(ELEVAY_ARABIC_VOICE_DEFAULTS).toMatchObject({ voiceId: "nc8XQG8lRYRZDnjvKW0H", modelId: "eleven_v3", languageCode: "ar", dialect: "Egyptian Arabic", stability: 0.5, outputFormat: "mp3_44100_128" });
  });
  it("prepares Egyptian speech and retains English country/company names", () => {
    expect(prepareElevayEgyptianSpeechScript("دلوقتي في Spain، الشغل عن بُعد بقى طريق إقامة رسمي")).toBe("[thoughtful] دلوقتي في Spain، الشغل عن بُعد بقى طريق إقامة رسمي");
    expect(prepareElevayEgyptianSpeechScript("ELEVAY بترافقك في كل خطوة من الأول للآخر")).toContain("ELEVAY بترافقك");
  });
  it("accepts the owner's Egyptian sample that the retired narrow marker check rejected", () => {
    const sample = "الاقامة الدايمة هي الحلم اللي كل الناس بتحلم بيه ودلوقتي في ELEVAY هنقدر نساعدك تحقق حلمك ده";
    expect(prepareElevayEgyptianSpeechScript(sample)).toBe(`[thoughtful] ${sample}`);
  });
  it("never sends unresolved formal Arabic or another dialect to the speech provider", () => {
    expect(() => prepareElevayEgyptianSpeechScript("سوف نقدم لكم المعلومات الصحيحة")).toThrow("natural Egyptian Arabic");
    expect(() => prepareElevayEgyptianSpeechScript("شو بدك تعرف عن Spain معاك")).toThrow("natural Egyptian Arabic");
    try { prepareElevayEgyptianSpeechScript("سوف نقدم لكم المعلومات الصحيحة"); } catch (error) {
      expect((error as Error).name).toBe("ElevenLabsLanguagePolicyError");
    }
  });
});

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

import { describe, expect, it } from "vitest";
import { decodeChatAttachment, normalizeChatFileName } from "./clientChatMedia";

function upload(buffer: Buffer, fileName: string, mimeType: string) {
  return { fileName, mimeType, fileSize: buffer.length, base64: buffer.toString("base64") };
}

describe("standalone client chat media security", () => {
  it("accepts an allowlisted image only when its extension and signature agree", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
    const decoded = decodeChatAttachment(upload(png, "passport-preview.png", "image/png"));
    expect(decoded.messageType).toBe("image");
    expect(decoded.mimeType).toBe("image/png");
    expect(decoded.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(decoded.buffer.equals(png)).toBe(true);
  });

  it("rejects extension and content-type disguises", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
    expect(() => decodeChatAttachment(upload(png, "document.pdf", "image/png"))).toThrow(/extension/i);
    expect(() => decodeChatAttachment(upload(Buffer.from("not-a-real-pdf"), "document.pdf", "application/pdf"))).toThrow(/content/i);
  });

  it("enforces declared size equality and voice-note limits", () => {
    const mp3 = Buffer.from([0x49, 0x44, 0x33, 0, 0, 0, 0, 0]);
    expect(() => decodeChatAttachment({ ...upload(mp3, "voice.mp3", "audio/mpeg"), fileSize: mp3.length + 1 })).toThrow(/16 MB/i);
  });

  it("normalizes traversal and control characters out of file names", () => {
    expect(normalizeChatFileName("../../secret\npassport.pdf")).toBe("secret_passport.pdf");
  });
});

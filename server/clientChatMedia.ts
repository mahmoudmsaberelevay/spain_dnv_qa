import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";

export const CHAT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CHAT_MAX_AUDIO_BYTES = 16 * 1024 * 1024;

const MIME_EXTENSIONS = new Map<string, string[]>([
  ["application/pdf", ["pdf"]],
  ["application/msword", ["doc"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["docx"]],
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/webp", ["webp"]],
  ["audio/mpeg", ["mp3"]],
  ["audio/mp4", ["m4a", "mp4"]],
  ["audio/wav", ["wav"]],
  ["audio/x-wav", ["wav"]],
  ["audio/ogg", ["ogg", "oga"]],
  ["audio/webm", ["webm"]],
  ["video/mp4", ["mp4"]],
  ["video/webm", ["webm"]],
]);

function validSignature(buffer: Buffer, mimeType: string) {
  const ascii = buffer.subarray(0, 16).toString("ascii");
  const hex = buffer.subarray(0, 16).toString("hex");
  if (mimeType === "application/pdf") return ascii.startsWith("%PDF-");
  if (mimeType === "application/msword") return hex.startsWith("d0cf11e0a1b11ae1");
  if (mimeType.includes("wordprocessingml")) return hex.startsWith("504b0304");
  if (mimeType === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mimeType === "image/png") return hex.startsWith("89504e470d0a1a0a");
  if (mimeType === "image/webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  if (mimeType === "audio/mpeg") return ascii.startsWith("ID3") || ["fffb", "fff3", "fff2"].some(prefix => hex.startsWith(prefix));
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE";
  if (mimeType === "audio/ogg") return ascii.startsWith("OggS");
  if (mimeType === "audio/webm" || mimeType === "video/webm") return hex.startsWith("1a45dfa3");
  if (mimeType === "audio/mp4" || mimeType === "video/mp4") return ascii.slice(4, 8) === "ftyp";
  return false;
}

export function normalizeChatFileName(value: string) {
  const cleaned = value.normalize("NFKC")
    .replace(/\.\.(?:[\\/]|$)/g, "")
    .replace(/[\\/\0\r\n\t]/g, "_")
    .replace(/[^A-Za-z0-9\u0600-\u06FF._ -]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim();
  return (cleaned || "attachment").slice(0, 180);
}

export function decodeChatAttachment(input: { fileName: string; mimeType: string; fileSize: number; base64: string }) {
  const mimeType = input.mimeType.trim().toLowerCase();
  const extensions = MIME_EXTENSIONS.get(mimeType);
  if (!extensions) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported attachment type" });
  const safeFileName = normalizeChatFileName(input.fileName);
  const extension = safeFileName.split(".").pop()?.toLowerCase() ?? "";
  if (!extensions.includes(extension)) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment extension does not match its type" });
  const buffer = Buffer.from(input.base64, "base64");
  const byteLimit = mimeType.startsWith("audio/") ? CHAT_MAX_AUDIO_BYTES : CHAT_MAX_FILE_BYTES;
  if (buffer.length < 8 || buffer.length > byteLimit || input.fileSize !== buffer.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: mimeType.startsWith("audio/") ? "Voice notes must be 16 MB or smaller" : "Attachments must be 25 MB or smaller" });
  }
  if (!validSignature(buffer, mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment content does not match its declared type" });
  if (hexLooksExecutable(buffer)) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsafe attachment rejected" });
  return {
    buffer,
    mimeType,
    safeFileName,
    originalFileName: input.fileName.trim().slice(0, 255),
    extension,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    messageType: mimeType.startsWith("image/") ? "image" as const : mimeType.startsWith("video/") ? "video" as const : mimeType.startsWith("audio/") ? "voice" as const : "file" as const,
  };
}

function hexLooksExecutable(buffer: Buffer) {
  const hex = buffer.subarray(0, 4).toString("hex");
  return hex.startsWith("4d5a") || hex === "7f454c46";
}

export async function transcribeChatVoice(audioUrl: string) {
  const result = await transcribeAudio({ audioUrl, prompt: "ELEVAY client conversation voice note. Transcribe accurately in the original language. Preserve names, numbers, dates, and uncertainty." });
  if ("error" in result || !result.text?.trim()) throw new Error("VOICE_TRANSCRIPTION_FAILED");
  const transcriptOriginal = result.text.trim();
  try {
    const translated = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "Translate an ELEVAY client-chat voice-note transcript faithfully into both Arabic and English. Preserve names, numbers, dates, and uncertainty. Do not summarize or add information." },
        { role: "user", content: transcriptOriginal },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "client_chat_bilingual_transcript",
          strict: true,
          schema: {
            type: "object",
            properties: { arabic: { type: "string" }, english: { type: "string" } },
            required: ["arabic", "english"],
            additionalProperties: false,
          },
        },
      },
    });
    const parsed = JSON.parse(String(translated.choices[0]?.message?.content ?? "{}")) as { arabic?: string; english?: string };
    return { transcriptOriginal, transcriptArabic: parsed.arabic?.trim() || null, transcriptEnglish: parsed.english?.trim() || null };
  } catch {
    const appearsArabic = /[\u0600-\u06ff]/.test(transcriptOriginal);
    return { transcriptOriginal, transcriptArabic: appearsArabic ? transcriptOriginal : null, transcriptEnglish: appearsArabic ? null : transcriptOriginal };
  }
}

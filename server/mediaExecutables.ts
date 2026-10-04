import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

// Prefer verified, absolute paths provided by the production image; otherwise
// use the app-packaged binaries. Never resolve a command through shell PATH.
function serverBinaryPath(override: string | undefined, packaged: string | null | undefined) {
  return override?.startsWith("/") && !/[\r\n\0]/.test(override) ? override : packaged || "";
}
export const FFMPEG_BIN = serverBinaryPath(process.env.ELEVAY_FFMPEG_BIN, ffmpegStatic);
export const FFPROBE_BIN = serverBinaryPath(process.env.ELEVAY_FFPROBE_BIN, ffprobeStatic?.path);
let cached: { ready: boolean; checkedAt: number } | null = null;

function checkBinary(binary: string) {
  if (!binary) return Promise.resolve(false);
  try { accessSync(binary, constants.X_OK); } catch { return Promise.resolve(false); }
  return new Promise<boolean>(resolve => {
    const child = spawn(binary, ["-version"], { stdio: "ignore" });
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(false); }, 5000);
    child.on("error", () => { clearTimeout(timer); resolve(false); });
    child.on("close", code => { clearTimeout(timer); resolve(code === 0); });
  });
}

export async function mediaRendererReadiness() {
  if (cached && Date.now() - cached.checkedAt < 30_000) return cached;
  const [ffmpeg, ffprobe] = await Promise.all([checkBinary(FFMPEG_BIN), checkBinary(FFPROBE_BIN)]);
  cached = { ready: ffmpeg && ffprobe, checkedAt: Date.now() };
  return cached;
}
export async function requireMediaRenderer() {
  if (!(await mediaRendererReadiness()).ready) throw new Error("Media generation is paused: this deployed CRM server is missing its packaged FFmpeg or ffprobe executable. No task was dispatched or billed; contact the administrator.");
}

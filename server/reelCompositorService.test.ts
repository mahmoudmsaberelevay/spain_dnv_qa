import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { __reelCompositorForTests, composeFourHiggsfieldClipsForReview, probeReelMedia } from "./reelCompositorService";

const tempDirs: string[] = [];
function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], { stdio: "ignore" });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}
afterEach(async () => { await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });

describe("review-only reel compositor", () => {
  it("refuses duplicate clip hashes before accessing any real media asset", async () => {
    const duplicated = ["a".repeat(64), "A".repeat(64), "b".repeat(64), "c".repeat(64)];
    await expect(composeFourHiggsfieldClipsForReview({ weeklyItemId: 1,
      clips: duplicated.map((sha256, index) => ({ url: `https://cdn.example.org/reel-${index}.mp4`, sha256, mimeType: "video/mp4" })),
      narration: { url: "https://cdn.example.org/audio.mp3", sha256: "d".repeat(64), mimeType: "audio/mpeg" },
    })).rejects.toThrow("Four distinct");
  });
  it("constructs a four-clip silent 20-second 1080×1920 master without provider audio", () => {
    const files = [1, 2, 3, 4].map(index => `/tmp/private-clip-${index}.mp4`);
    const args = __reelCompositorForTests.fourSceneConcatArgs(files, "/tmp/private-output.mp4");
    const filters = args[args.indexOf("-filter_complex") + 1];
    expect(filters.match(/trim=duration=5/g)).toHaveLength(4);
    expect(filters.match(/scale=1080:1920/g)).toHaveLength(4);
    expect(filters).toContain("[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]");
    expect(args).toContain("-an");
    expect(args.slice(args.indexOf("-t"), args.indexOf("-t") + 2)).toEqual(["-t", "20"]);
    expect(() => __reelCompositorForTests.fourSceneConcatArgs(files.slice(0, 3), "/tmp/out.mp4")).toThrow("Exactly four");
  });
  it("preserves all 20 seconds of four silent Higgsfield scenes before a 3-second logo outro", () => {
    const raw = { durationMs: 20_000, videoCodec: "h264", audioCodec: null, width: 1080, height: 1920 };
    const voice = { durationMs: 18_500, videoCodec: null, audioCodec: "mp3", width: null, height: null };
    expect(__reelCompositorForTests.planFourSceneReelTiming(raw, voice)).toEqual({ narrativeSeconds: 20, outputDurationMs: 23_000, logoOutroSeconds: 3 });
    expect(() => __reelCompositorForTests.planFourSceneReelTiming({ ...raw, durationMs: 17_000 }, voice)).toThrow("four complete");
    expect(() => __reelCompositorForTests.planFourSceneReelTiming({ ...raw, audioCodec: "aac" }, voice)).toThrow("silent video");
    expect(() => __reelCompositorForTests.planFourSceneReelTiming(raw, { ...voice, durationMs: 20_001 })).toThrow("before the silent logo outro");
  });

  it("mixes approved narration into a vertical source and verifies a playable MP4", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-compositor-test-"));
    tempDirs.push(dir);
    const source = path.join(dir, "source.mp4");
    const narration = path.join(dir, "narration.mp3");
    const output = path.join(dir, "output.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=c=#1A3A5C:s=360x640:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source]);
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=660:duration=1", "-c:a", "libmp3lame", narration]);
    const result = await __reelCompositorForTests.composeLocal(source, narration, output);
    const outputProbe = await probeReelMedia(output);
    expect(result.sourceProbe.width).toBe(360);
    expect(result.sourceProbe.height).toBe(640);
    expect(result.narrationProbe.audioCodec).toBeTruthy();
    expect(outputProbe.videoCodec).toBeTruthy();
    expect(outputProbe.audioCodec).toBeTruthy();
    expect(Math.abs(outputProbe.durationMs - result.sourceProbe.durationMs)).toBeLessThanOrEqual(1250);
  });

  it("extends the final source frame when approved Arabic narration is longer than the reel", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-compositor-extended-outro-"));
    tempDirs.push(dir);
    const source = path.join(dir, "source.mp4");
    const narration = path.join(dir, "narration.mp3");
    const output = path.join(dir, "output.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=c=white:s=360x640:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=660:duration=3", "-c:a", "libmp3lame", narration]);
    const result = await __reelCompositorForTests.composeLocal(source, narration, output);
    expect(result.outputProbe.durationMs).toBeGreaterThanOrEqual(result.narrationProbe.durationMs - 1_250);
    expect(result.outputProbe.videoCodec).toBeTruthy();
    expect(result.outputProbe.audioCodec).toBeTruthy();
  });

  it("rejects non-public source addresses before any media operation", () => {
    expect(__reelCompositorForTests.isPrivateIp("127.0.0.1")).toBe(true);
    expect(__reelCompositorForTests.isPrivateIp("10.0.0.5")).toBe(true);
    expect(__reelCompositorForTests.isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("composites a three-second white outro from the supplied logo input", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-compositor-logo-outro-"));
    tempDirs.push(dir);
    const source = path.join(dir, "source.mp4");
    const narration = path.join(dir, "narration.mp3");
    const logo = path.join(dir, "brand.png");
    const output = path.join(dir, "output.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=c=#1A3A5C:s=360x640:d=5:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=660:duration=1", "-c:a", "libmp3lame", narration]);
    await ffmpeg(["-f", "lavfi", "-i", "color=c=#5BA3B8:s=80x30:d=1", "-frames:v", "1", logo]);
    const result = await __reelCompositorForTests.composeLocal(source, narration, output, logo);
    expect(result.outputProbe.durationMs).toBeGreaterThanOrEqual(4800);
    expect(result.outputProbe.width).toBe(1080);
    expect(result.outputProbe.height).toBe(1920);
    expect(result.outputProbe.audioCodec).toBeTruthy();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { __reelCompositorForTests, probeReelMedia } from "./reelCompositorService";

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

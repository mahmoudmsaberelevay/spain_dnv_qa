import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FFMPEG_BIN, FFPROBE_BIN, mediaRendererReadiness } from "./mediaExecutables";

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

describe("ELEVAY production media executable packaging", () => {
  it("builds the complete WebDev app with installed absolute ffmpeg and ffprobe paths", () => {
    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).toContain("--no-install-recommends ffmpeg ca-certificates fontconfig");
    expect(dockerfile).toContain("corepack pnpm run build");
    expect(dockerfile).toContain("ELEVAY_FFMPEG_BIN=/usr/bin/ffmpeg");
    expect(dockerfile).toContain("ELEVAY_FFPROBE_BIN=/usr/bin/ffprobe");
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
    expect(dockerfile).not.toMatch(/(?:DATABASE_URL|HF_API_KEY|OPENAI_API_KEY)=/);
  });
  it("requires both selected executable paths to pass runtime version checks", async () => {
    expect(FFMPEG_BIN).toMatch(/^\//);
    expect(FFPROBE_BIN).toMatch(/^\//);
    expect((await mediaRendererReadiness()).ready).toBe(true);
  });
});

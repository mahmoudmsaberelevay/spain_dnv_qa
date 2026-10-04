import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { marketingDesignSystemAssets } from "../drizzle/schema";
import { FFMPEG_BIN, requireMediaRenderer } from "./mediaExecutables";

export async function officialElevayLogo() {
  const db = await getDb();
  if (!db) throw new Error("ELEVAY design system is unavailable.");
  const [logo] = await db.select().from(marketingDesignSystemAssets).where(and(eq(marketingDesignSystemAssets.assetType, "logo"), eq(marketingDesignSystemAssets.isActive, true), isNull(marketingDesignSystemAssets.archivedAt))).orderBy(desc(marketingDesignSystemAssets.updatedAt)).limit(1);
  if (!logo || logo.mimeType !== "image/png" || !/^https:\/\//.test(logo.fileUrl)) throw new Error("The approved official PNG logo is required for branded media.");
  return { url: logo.fileUrl, sha256: logo.sha256Digest };
}

export async function verifiedLogoBytes() {
  const logo = await officialElevayLogo();
  const response = await fetch(logo.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) throw new Error("The approved ELEVAY logo is unavailable.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024 || crypto.createHash("sha256").update(bytes).digest("hex") !== logo.sha256) throw new Error("The active official ELEVAY logo fingerprint is invalid.");
  return { bytes, sha256: logo.sha256 };
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errorTail = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Official-logo composition timed out.")); }, 45_000);
    child.stderr.on("data", data => { errorTail = `${errorTail}${data.toString()}`.slice(-800); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Official-logo composition failed (${code}): ${errorTail.slice(-180)}`)); });
  });
}

/** Existing exact logo pixels are only scaled proportionally and placed on an
 * already generated image. No generated/recreated wordmark can be used as the
 * system-owned brand mark. Source files are never overwritten. */
export async function applyOfficialElevayLogoToStatic(source: Buffer) {
  await requireMediaRenderer();
  const logo = await verifiedLogoBytes();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "elevay-brand-"));
  try {
    const input = path.join(dir, "generated-image"); const logoPath = path.join(dir, "official-logo.png"); const output = path.join(dir, "review.png");
    await Promise.all([fs.writeFile(input, source, { mode: 0o600 }), fs.writeFile(logoPath, logo.bytes, { mode: 0o600 })]);
    await runFfmpeg(["-y", "-i", input, "-i", logoPath, "-filter_complex", "[1:v]scale=300:-1[brand];[0:v][brand]overlay=x=40:y=40:format=auto[out]", "-map", "[out]", "-frames:v", "1", output]);
    const bytes = await fs.readFile(output);
    if (!bytes.length || bytes.length > 80 * 1024 * 1024) throw new Error("The final branded preview is invalid.");
    return { bytes, logoSha256: logo.sha256 };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

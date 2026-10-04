import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Owner-approved on 2026-10-04 as an explicit fallback, never represented as Apex Sans. */
export const ELEVAY_APPROVED_STATIC_FONT_FAMILY = "Plus Jakarta Sans";
const FACES = [
  { weight: "regular", filename: "PlusJakartaSans-Regular.ttf", sha256: "bd6276d4060e3b1ebc45047469e0bb86b08f301ba681cdf1ceb6245ea10478d2" },
  { weight: "bold", filename: "PlusJakartaSans-Bold.ttf", sha256: "5f5342ef76862b5b5365d1dff1a667629dfa484e388dd602552f647219c3870f" },
] as const;

/** FFmpeg/static-design input only. Calling this does not generate any media. */
export async function requireElevayApprovedStaticTypography() {
  const verified = await Promise.all(FACES.map(async face => {
    const url = new URL(`./marketing-fonts/${face.filename}`, import.meta.url);
    const buffer = await readFile(url).catch(() => { throw new Error("Owner-approved ELEVAY font is not packaged in this runtime; image production is blocked."); });
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    if (sha256 !== face.sha256) throw new Error("Owner-approved ELEVAY font fingerprint mismatch; image production is blocked.");
    return { weight: face.weight, path: fileURLToPath(url), sha256 };
  }));
  return { family: ELEVAY_APPROVED_STATIC_FONT_FAMILY, approvedFallback: true as const, faces: verified };
}

import { pathToFileURL } from "node:url";
import { runNewsDigestImport } from "../server/newsDigestService";

export function isCairoNewsDigestHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  return hour === 9;
}

export async function runScheduledNewsDigest(now = new Date()) {
  // The schedule calls both UTC candidates. Only the one that maps to the
  // 09:00 Cairo hour proceeds; the importer itself is idempotent per Gmail
  // message and canonical article URL.
  if (!isCairoNewsDigestHour(now)) {
    return { ok: true, skipped: "outside_cairo_0900_hour" } as const;
  }

  return { ok: true, ...(await runNewsDigestImport()) };
}

async function main() {
  console.log(JSON.stringify(await runScheduledNewsDigest(), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error("[NewsDigest] Scheduled import failed:", error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}

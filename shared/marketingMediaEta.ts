export type MediaEtaJob = { mediaKind: string; state: string; createdAt: number; completedAt?: number | null };

/** Manus does not expose a percentage or completion deadline. Return a range,
 * not a countdown promise, using prior successfully completed tasks if possible. */
export function estimateMediaCompletion(job: MediaEtaJob, history: MediaEtaJob[], now = Date.now()) {
  if (job.state === "completed") return { label: "Complete", remainingRange: null, basis: "completed" as const };
  if (job.state === "failed") return { label: "Needs attention", remainingRange: null, basis: "failed" as const };
  if (job.state === "waiting_input") return { label: "Waiting for provider action or input; no ETA", remainingRange: null, basis: "waiting_input" as const };
  if (!Number.isFinite(job.createdAt) || job.createdAt <= 0) return { label: "Checking status; no ETA", remainingRange: null, basis: "unknown" as const };
  const durations = history.filter(row => row.mediaKind === job.mediaKind && row.state === "completed" && row.completedAt && row.completedAt > row.createdAt)
    .map(row => Math.ceil(((row.completedAt ?? 0) - row.createdAt) / 60_000))
    .filter(minutes => minutes >= 1 && minutes <= 180).sort((a, b) => a - b);
  const baseline = job.mediaKind === "reel" ? [8, 25] : [4, 15];
  const low = durations.length >= 3 ? Math.max(1, durations[Math.floor(durations.length * .25)]) : baseline[0];
  const high = durations.length >= 3 ? Math.max(low + 2, durations[Math.floor(durations.length * .85)]) : baseline[1];
  const elapsed = Math.floor(Math.max(0, now - job.createdAt) / 60_000);
  if (elapsed >= high) return { label: `Running ${elapsed} min; beyond typical ${high} min — checking provider`, remainingRange: null, basis: "overdue" as const };
  const minimum = Math.max(0, low - elapsed);
  const maximum = Math.max(1, high - elapsed);
  return { label: `Typically ${minimum}–${maximum} min remaining (estimate, not guaranteed)`, remainingRange: [minimum, maximum], basis: durations.length >= 3 ? "observed" as const : "fallback" as const };
}

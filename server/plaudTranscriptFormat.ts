import { createHash } from "node:crypto";
import { ELEVAY_TIME_ZONE } from "../shared/financialEmployeeSalaryRates";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_DATE_MS = 8_640_000_000_000_000;

/** Reject text that UTF-8 encoding would silently replace or cannot safely store. */
function assertUnicodeText(
  value: unknown,
  label: string
): asserts value is string {
  if (typeof value !== "string")
    throw new TypeError(`${label} must be a string`);
  if (value.includes("\0"))
    throw new Error(`${label} must not contain NUL characters`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(
          `${label} must contain valid Unicode (no unpaired surrogates)`
        );
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error(
        `${label} must contain valid Unicode (no unpaired surrogates)`
      );
    }
  }
}

/**
 * Input must be the provider-parsed plain transcript, never a combined CRM note,
 * summary, or rich-text document. Do not infer/strip HTML or Markdown: characters
 * resembling markup can be genuine spoken content. No Unicode normalization,
 * rewriting, paragraph collapsing, or internal whitespace changes are performed.
 */
export function normalizePlaudTranscript(value: string): string {
  assertUnicodeText(value, "Plaud transcript");
  const transcript = value.replace(/\r\n?/g, "\n").trim();
  if (!transcript) throw new Error("Plaud transcript must not be empty");
  return transcript;
}

/** Stable account/workspace + recording identity, independent of text and dates. */
export function createTranscriptIdentity(
  sourceScope: string,
  recordingId: string
): string {
  assertUnicodeText(sourceScope, "Plaud source scope");
  assertUnicodeText(recordingId, "Plaud recording ID");
  if (!sourceScope.trim() || !recordingId.trim()) {
    throw new Error("Plaud source scope and recording ID are required");
  }
  // JSON's structured string boundaries avoid ambiguous delimiter concatenation.
  // Do not trim, case-fold, or otherwise merge distinct opaque provider IDs.
  return createHash("sha256")
    .update(
      JSON.stringify(["plaud-import-v1", sourceScope, recordingId]),
      "utf8"
    )
    .digest("hex");
}

function validTimeZone(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    /^[+-]/.test(value)
  ) {
    throw new Error(
      "Invalid Plaud business time zone; an IANA time zone is required"
    );
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    throw new Error(
      "Invalid Plaud business time zone; an IANA time zone is required"
    );
  }
}

/**
 * The shared HR/financial constant is the existing business-zone default; there
 * is no central runtime timezone setting. The explicit business override is not
 * the host's TZ or an employee's browser timezone. Invalid configuration fails.
 */
export function resolvePlaudTimeZone(
  env: NodeJS.ProcessEnv = process.env
): string {
  return validTimeZone(env.ELEVAY_BUSINESS_TIME_ZONE ?? ELEVAY_TIME_ZONE);
}

type CalendarDay = {
  year: number;
  month: number;
  day: number;
  utcMidnight: number;
};

// Date.UTC maps years 0..99 to 1900..1999. setUTCFullYear does not.
function gregorianUtc(year: number, month: number, day: number): number {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(0, 0, 0, 0);
  return value.getTime();
}

function parseCalendarDay(value: unknown): CalendarDay {
  if (typeof value !== "string")
    throw new Error("Plaud dates must use YYYY-MM-DD format");
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new Error("Plaud dates must use YYYY-MM-DD format");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMidnight = gregorianUtc(year, month, day);
  const candidate = new Date(utcMidnight);
  if (
    year < 1 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("Plaud date is not a valid Gregorian calendar day");
  }
  return { year, month, day, utcMidnight };
}

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    era: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

/** The local wall clock expressed as a fictitious UTC timestamp, not an offset. */
function wallClockAt(instant: number, formatter: Intl.DateTimeFormat): number {
  const parts = new Map(
    formatter.formatToParts(instant).map(part => [part.type, part.value])
  );
  let year = Number(parts.get("year"));
  if (parts.get("era") === "BC") year = 1 - year;
  return (
    gregorianUtc(year, Number(parts.get("month")), Number(parts.get("day"))) +
    Number(parts.get("hour")) * HOUR_MS +
    Number(parts.get("minute")) * 60_000 +
    Number(parts.get("second")) * 1000
  );
}

/**
 * Resolve the earliest real instant at or after the selected local midnight.
 * Read offset segments from ICU/IANA, rather than guessing a noon offset or
 * iterating one ambiguous midnight. Hourly UTC probes bracket IANA transitions;
 * binary search resolves each transition to its exact millisecond. The search
 * window covers all IANA offsets and date-line jumps (including skipped days).
 *
 * Within each constant-offset segment, wall time is linear: the first candidate
 * is max(segment start, midnight - offset). Taking the earliest valid candidate
 * selects the first occurrence of an overlapping midnight, the first valid time
 * after a midnight gap, or the next existing day for an entirely skipped date.
 * A range selecting only a skipped day therefore has zero duration, not 24 hours.
 */
function startOfLocalDay(
  utcMidnight: number,
  formatter: Intl.DateTimeFormat
): number {
  const windowStart = utcMidnight - 3 * DAY_MS;
  const windowEnd = utcMidnight + 3 * DAY_MS;
  const offsetAt = (instant: number) =>
    wallClockAt(instant, formatter) - Math.floor(instant / 1000) * 1000;
  let segmentStart = windowStart;
  let segmentOffset = offsetAt(windowStart);
  let earliest: number | null = null;

  const considerSegment = (start: number, end: number, offset: number) => {
    const candidate = Math.max(start, utcMidnight - offset);
    if (candidate < end && wallClockAt(candidate, formatter) >= utcMidnight) {
      earliest = earliest === null ? candidate : Math.min(earliest, candidate);
    }
  };

  for (
    let probe = windowStart + HOUR_MS;
    probe <= windowEnd;
    probe += HOUR_MS
  ) {
    const nextOffset = offsetAt(probe);
    if (nextOffset === segmentOffset) continue;
    let lower = probe - HOUR_MS;
    let upper = probe;
    while (upper - lower > 1) {
      const middle = Math.floor((lower + upper) / 2);
      if (offsetAt(middle) === segmentOffset) lower = middle;
      else upper = middle;
    }
    considerSegment(segmentStart, upper, segmentOffset);
    segmentStart = upper;
    segmentOffset = nextOffset;
  }
  considerSegment(segmentStart, windowEnd, segmentOffset);
  if (earliest === null)
    throw new Error("Unable to resolve Plaud local calendar boundary");
  return earliest;
}

export type ParsedPlaudRange = {
  fromUtc: number | null;
  toUtcExclusive: number | null;
  from: string | null;
  to: string | null;
  timeZone: string;
};

/** Calendar dates are inclusive; UTC query boundaries are [from, next day). */
export function parsePlaudRange(
  range: { from?: string; to?: string },
  timeZone: string,
  requireComplete = false
): ParsedPlaudRange {
  const zone = validTimeZone(timeZone);
  const hasFrom = range.from !== undefined;
  const hasTo = range.to !== undefined;
  if (hasFrom !== hasTo || (requireComplete && !hasFrom)) {
    throw new Error("A complete From and To date range is required");
  }
  if (!hasFrom) {
    return {
      fromUtc: null,
      toUtcExclusive: null,
      from: null,
      to: null,
      timeZone: zone,
    };
  }
  const from = parseCalendarDay(range.from);
  const to = parseCalendarDay(range.to);
  if (from.utcMidnight > to.utcMidnight) {
    throw new Error("From date must not be later than To date");
  }
  const formatter = wallClockFormatter(zone);
  return {
    fromUtc: startOfLocalDay(from.utcMidnight, formatter),
    // Advance the Gregorian calendar day, never the timezone-aware UTC instant.
    toUtcExclusive: startOfLocalDay(
      gregorianUtc(to.year, to.month, to.day + 1),
      formatter
    ),
    from: range.from!,
    to: range.to!,
    timeZone: zone,
  };
}

function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= MAX_DATE_MS
  );
}

/** No implicit clock reads: invalid/missing legacy call dates explicitly use import time. */
export function effectivePlaudDate(
  callAt: number | null,
  importedAt: number
): { effectiveAt: number; usesImportDate: boolean } {
  if (isValidTimestamp(callAt))
    return { effectiveAt: callAt, usesImportDate: false };
  if (!isValidTimestamp(importedAt))
    throw new Error("Plaud import timestamp is invalid");
  return { effectiveAt: importedAt, usesImportDate: true };
}

export type PlaudTranscriptBlock = {
  id: number;
  effectiveAt: number;
  transcript: string;
};

function assertBlockOrderKey(record: PlaudTranscriptBlock): void {
  if (
    !Number.isSafeInteger(record.id) ||
    record.id < 1 ||
    !isValidTimestamp(record.effectiveAt)
  ) {
    throw new Error("Invalid Plaud transcript ordering key");
  }
}

function compareBlocks(
  left: PlaudTranscriptBlock,
  right: PlaudTranscriptBlock
): number {
  return left.effectiveAt - right.effectiveAt || left.id - right.id;
}

/** Optional in-memory helper; database streaming should use effectiveAt ASC, id ASC. */
export function sortPlaudTranscripts<T extends PlaudTranscriptBlock>(
  records: Iterable<T>
): T[] {
  const sorted = Array.from(records);
  for (const record of sorted) assertBlockOrderKey(record);
  return sorted.sort(compareBlocks);
}

/**
 * Lazy, unlimited chunks for already sorted records. Encode each yielded string
 * as UTF-8 (or pass it to the existing UTF-8 response stream). No headers, wrappers,
 * metadata, trailing separator, filesystem writes, or transcript-body logging.
 * The caller must hold a consistent snapshot and handle retrieval/stream failures.
 */
export function* encodePlaudTranscriptBlocks(
  records: Iterable<PlaudTranscriptBlock>
): Generator<string> {
  let previous: PlaudTranscriptBlock | null = null;
  const iterator = records[Symbol.iterator]();
  let exhausted = false;
  try {
    while (true) {
      const next = iterator.next();
      if (next.done) {
        exhausted = true;
        break;
      }
      const record = next.value;
      assertBlockOrderKey(record);
      if (previous && compareBlocks(previous, record) >= 0) {
        throw new Error(
          "Plaud transcript records must be ordered by effectiveAt then unique id"
        );
      }
      const transcript = normalizePlaudTranscript(record.transcript);
      if (previous) yield "\n\n\n";
      yield transcript;
      previous = record;
    }
  } finally {
    if (!exhausted) iterator.return?.();
  }
  if (!previous)
    throw new Error("No Plaud transcripts found for this date range");
}

export function plaudExportFilename(from: string, to: string): string {
  const first = parseCalendarDay(from);
  const last = parseCalendarDay(to);
  if (first.utcMidnight > last.utcMidnight)
    throw new Error("From date must not be later than To date");
  return `plaud_transcripts_${from}_to_${to}.txt`;
}

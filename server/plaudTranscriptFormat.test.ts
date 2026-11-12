import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createTranscriptIdentity,
  effectivePlaudDate,
  encodePlaudTranscriptBlocks,
  normalizePlaudTranscript,
  parsePlaudRange,
  plaudExportFilename,
  resolvePlaudTimeZone,
  sortPlaudTranscripts,
  type PlaudTranscriptBlock,
} from "./plaudTranscriptFormat";

const utc = (value: string) => Date.parse(value);
const HOUR_MS = 3_600_000;
const encode = (records: Iterable<PlaudTranscriptBlock>) =>
  Array.from(encodePlaudTranscriptBlocks(records)).join("");
const block = (
  id: number,
  effectiveAt = id,
  transcript = `المتحدث ${id}: original text`
) => ({
  id,
  effectiveAt,
  transcript,
});

// All fixtures are in-memory provider-parsed plaintext: no database, provider,
// credentials, wall-clock reads, network requests, snapshots, or real imports.
describe("normalizePlaudTranscript", () => {
  it("normalizes only CRLF/CR and outer whitespace, preserving internal source content", () => {
    const input =
      " \t\r\n[00:01] أحمد: أهلاً  Hello 👋\r\n\r\n  Speaker 2: yes\t right.  \rNext\r\n \t";
    const expected =
      "[00:01] أحمد: أهلاً  Hello 👋\n\n  Speaker 2: yes\t right.  \nNext";
    expect(normalizePlaudTranscript(input)).toBe(expected);
    expect(normalizePlaudTranscript(expected)).toBe(expected);
  });

  it("does not infer a summary, remove genuine words, strip HTML-like words, or strip source Markdown", () => {
    const transcript =
      "Summary: I said Plaud.\n# spoken heading\n- original bullet\n**emphasis** _underscores_ `code`\nSpeaker: say <client> & then <b>bold</b>.";
    expect(normalizePlaudTranscript(transcript)).toBe(transcript);
  });

  it("preserves internal blank paragraphs, indentation, Unicode composition, and bidirectional marks", () => {
    const transcript =
      "أ: e\u0301 é\n\n\n\n  ب: \u200fعربي English\u200e\n\tsecond line\t  end";
    expect(normalizePlaudTranscript(transcript)).toBe(transcript);
  });

  it("round-trips valid Arabic, mixed language, and supplementary-plane characters through UTF-8 exactly", () => {
    const transcript =
      "[01:23] المتحدث: إقامة في إسبانيا — English 😀 𐍈\n\nSpeaker: أهلاً وسهلاً";
    const normalized = normalizePlaudTranscript(transcript);
    const bytes = Buffer.from(normalized, "utf8");
    expect(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toBe(
      transcript
    );
    expect(bytes.toString("utf8")).toBe(transcript);
    expect(normalized).not.toContain("\ufffd");
  });

  it("does not corrupt a replacement character genuinely present in the source", () => {
    expect(
      normalizePlaudTranscript("Speaker: replacement \ufffd from source")
    ).toBe("Speaker: replacement \ufffd from source");
  });

  it.each(["", " ", "\r\n\t \r", "\u00a0\u2003\n"])(
    "rejects empty/blank input %j",
    value => {
      expect(() => normalizePlaudTranscript(value)).toThrow(/empty/);
    }
  );

  it.each([null, undefined, 42, {}, [], Buffer.from("not a parsed string")])(
    "rejects non-string input %j",
    value => {
      expect(() =>
        normalizePlaudTranscript(value as unknown as string)
      ).toThrow(/string/);
    }
  );

  it.each([
    "a\0b",
    "\ud800",
    "\udfff",
    "a\ud800z",
    "a\udc00z",
    "\ud800\ud800",
    "\udfff\udfff",
  ])("rejects unsafe text %j before UTF-8 encoding could replace it", value => {
    expect(() => normalizePlaudTranscript(value)).toThrow(/NUL|Unicode/);
  });

  it("preserves a long transcript completely, with exact byte content and final spoken words", () => {
    const paragraph =
      "[00:15] المتحدث الأول: هذه مكالمة أصلية بالعربية. Speaker 2: exact  internal  spaces. 😀\n\n";
    const original =
      paragraph.repeat(30_000) + "[99:59] العميل: آخر كلمة — THE END";
    const normalized = normalizePlaudTranscript(
      `\r\n${original.replace(/\n/g, "\r\n")}\r\n`
    );
    expect(normalized).toBe(original);
    expect(
      Buffer.from(normalized, "utf8").equals(Buffer.from(original, "utf8"))
    ).toBe(true);
  });
});

describe("createTranscriptIdentity", () => {
  it("is a deterministic SHA-256 of versioned, structured scope and recording strings only", () => {
    const expected = createHash("sha256")
      .update(
        JSON.stringify(["plaud-import-v1", "workspace:أ", "rec:42"]),
        "utf8"
      )
      .digest("hex");
    expect(createTranscriptIdentity("workspace:أ", "rec:42")).toBe(expected);
    expect(createTranscriptIdentity("workspace:أ", "rec:42")).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(createTranscriptIdentity("workspace:أ", "rec:42")).toBe(
      createTranscriptIdentity("workspace:أ", "rec:42")
    );
  });

  it("distinguishes accounts, recordings, and delimiter-ambiguous pairs without text-based deduplication", () => {
    const values = [
      ["a:b", "c"],
      ["a", "b:c"],
      ["a", "bc"],
      ["ab", "c"],
      ["account1", "same-recording"],
      ["account2", "same-recording"],
      ["account1", "different-recording"],
      ["account1 ", "same-recording"],
    ];
    expect(
      new Set(values.map(([scope, id]) => createTranscriptIdentity(scope, id)))
        .size
    ).toBe(values.length);
  });

  it.each([
    ["", "id"],
    ["scope", " "],
    ["bad\0scope", "id"],
    ["scope", "\ud800"],
    [123, "id"],
  ])("rejects invalid identity components %j", (scope, id) => {
    expect(() =>
      createTranscriptIdentity(scope as string, id as string)
    ).toThrow();
  });
});

describe("resolvePlaudTimeZone", () => {
  it("uses the existing HR/financial Cairo business default, not the host timezone", () => {
    expect(resolvePlaudTimeZone({})).toBe("Africa/Cairo");
    expect(resolvePlaudTimeZone({ TZ: "America/Los_Angeles" })).toBe(
      "Africa/Cairo"
    );
  });

  it("honors a configured valid business timezone", () => {
    expect(
      resolvePlaudTimeZone({ ELEVAY_BUSINESS_TIME_ZONE: "America/New_York" })
    ).toBe("America/New_York");
    expect(resolvePlaudTimeZone({ ELEVAY_BUSINESS_TIME_ZONE: "UTC" })).toBe(
      "UTC"
    );
  });

  it.each(["", "Mars/Olympus", " Africa/Cairo", "Africa/Cairo ", "+02:00"])(
    "fails closed on invalid configuration %j",
    timeZone => {
      expect(() =>
        resolvePlaudTimeZone({ ELEVAY_BUSINESS_TIME_ZONE: timeZone })
      ).toThrow(/time zone/);
    }
  );
});

describe("parsePlaudRange", () => {
  it("allows an explicitly cleared list range but requires complete export dates", () => {
    expect(parsePlaudRange({}, "Africa/Cairo")).toEqual({
      fromUtc: null,
      toUtcExclusive: null,
      from: null,
      to: null,
      timeZone: "Africa/Cairo",
    });
    expect(() => parsePlaudRange({}, "Africa/Cairo", true)).toThrow(/complete/);
  });

  it.each([
    { from: "2026-11-01" },
    { to: "2026-11-12" },
    { from: "2026-11-01", to: "" },
    { from: "", to: "2026-11-12" },
    { from: "", to: "" },
    { from: null, to: null },
  ])(
    "rejects every partial or blank range, including when listing %j",
    range => {
      expect(() =>
        parsePlaudRange(range as { from?: string; to?: string }, "Africa/Cairo")
      ).toThrow();
    }
  );

  it.each([
    "2026-02-29",
    "2026-04-31",
    "1900-02-29",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "0000-01-01",
    "2026-1-01",
    "26-01-01",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01T00:00:00Z",
    "2026-01-01\n",
    "01/01/2026",
    "NaN",
    "10000-01-01",
  ])("rejects invalid Gregorian or non-date-only input %j", date => {
    expect(() => parsePlaudRange({ from: date, to: date }, "UTC")).toThrow();
  });

  it("accepts leap days and years below 100 without JavaScript's Date.UTC year remapping", () => {
    const leap = parsePlaudRange(
      { from: "2000-02-29", to: "2000-02-29" },
      "UTC",
      true
    );
    expect(leap.fromUtc).toBe(utc("2000-02-29T00:00:00.000Z"));
    expect(leap.toUtcExclusive).toBe(utc("2000-03-01T00:00:00.000Z"));
    const early = parsePlaudRange(
      { from: "0001-01-01", to: "0001-01-01" },
      "UTC"
    );
    expect(early.fromUtc).toBe(utc("0001-01-01T00:00:00.000Z"));
    expect(early.toUtcExclusive).toBe(utc("0001-01-02T00:00:00.000Z"));
  });

  it("can include the final four-digit Gregorian date with a five-digit exclusive boundary", () => {
    const range = parsePlaudRange(
      { from: "9999-12-31", to: "9999-12-31" },
      "UTC"
    );
    expect(range.fromUtc).toBe(utc("9999-12-31T00:00:00.000Z"));
    expect(range.toUtcExclusive).toBe(utc("+010000-01-01T00:00:00.000Z"));
  });

  it("rejects reversed dates instead of silently flipping them", () => {
    expect(() =>
      parsePlaudRange({ from: "2026-11-12", to: "2026-11-01" }, "Africa/Cairo")
    ).toThrow(/later/);
  });

  it("rejects invalid timezone even with no date filters", () => {
    expect(() => parsePlaudRange({}, "invalid/timezone")).toThrow(/time zone/);
  });

  it("includes the entire Cairo end date and excludes exactly the next day's start", () => {
    const range = parsePlaudRange(
      { from: "2026-11-01", to: "2026-11-12" },
      "Africa/Cairo",
      true
    );
    expect(range).toEqual({
      from: "2026-11-01",
      to: "2026-11-12",
      timeZone: "Africa/Cairo",
      fromUtc: utc("2026-10-31T22:00:00.000Z"),
      toUtcExclusive: utc("2026-11-12T22:00:00.000Z"),
    });
    const inRange = (at: number) =>
      at >= range.fromUtc! && at < range.toUtcExclusive!;
    expect(inRange(range.fromUtc! - 1)).toBe(false);
    expect(inRange(range.fromUtc!)).toBe(true);
    expect(inRange(utc("2026-11-12T21:59:59.999Z"))).toBe(true);
    expect(inRange(range.toUtcExclusive!)).toBe(false);
  });

  it("resolves Cairo's nonexistent midnight to the first valid 01:00 on 24 April 2026", () => {
    const range = parsePlaudRange(
      { from: "2026-04-24", to: "2026-04-24" },
      "Africa/Cairo"
    );
    expect(range.fromUtc).toBe(utc("2026-04-23T22:00:00.000Z"));
    expect(range.toUtcExclusive).toBe(utc("2026-04-24T21:00:00.000Z"));
    expect(range.toUtcExclusive! - range.fromUtc!).toBe(23 * HOUR_MS);
  });

  it("includes both occurrences of Cairo's repeated 23:00 hour on 29 October 2026", () => {
    const range = parsePlaudRange(
      { from: "2026-10-29", to: "2026-10-29" },
      "Africa/Cairo"
    );
    expect(range.fromUtc).toBe(utc("2026-10-28T21:00:00.000Z"));
    expect(range.toUtcExclusive).toBe(utc("2026-10-29T22:00:00.000Z"));
    expect(range.toUtcExclusive! - range.fromUtc!).toBe(25 * HOUR_MS);
    for (const repeatedHour of [
      "2026-10-29T20:30:00Z",
      "2026-10-29T21:30:00Z",
    ]) {
      expect(utc(repeatedHour)).toBeGreaterThanOrEqual(range.fromUtc!);
      expect(utc(repeatedHour)).toBeLessThan(range.toUtcExclusive!);
    }
  });

  it("uses the earliest occurrence when midnight itself is ambiguous in Havana", () => {
    const range = parsePlaudRange(
      { from: "2026-11-01", to: "2026-11-01" },
      "America/Havana"
    );
    expect(range.fromUtc).toBe(utc("2026-11-01T04:00:00.000Z"));
    expect(range.toUtcExclusive).toBe(utc("2026-11-02T05:00:00.000Z"));
    expect(range.toUtcExclusive! - range.fromUtc!).toBe(25 * HOUR_MS);
  });

  it.each([
    ["2026-03-08", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", 23],
    ["2026-11-01", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", 25],
  ])(
    "supports a non-Cairo DST day %s without fixed offsets",
    (date, start, end, hours) => {
      const range = parsePlaudRange(
        { from: date as string, to: date as string },
        "America/New_York"
      );
      expect(range.fromUtc).toBe(utc(start as string));
      expect(range.toUtcExclusive).toBe(utc(end as string));
      expect(range.toUtcExclusive! - range.fromUtc!).toBe(
        (hours as number) * HOUR_MS
      );
    }
  );

  it("handles a half-hour DST change in Lord Howe rather than assuming one-hour changes", () => {
    const range = parsePlaudRange(
      { from: "2026-10-04", to: "2026-10-04" },
      "Australia/Lord_Howe"
    );
    expect(range.fromUtc).toBe(utc("2026-10-03T13:30:00Z"));
    expect(range.toUtcExclusive).toBe(utc("2026-10-04T13:00:00Z"));
    expect(range.toUtcExclusive! - range.fromUtc!).toBe(23.5 * HOUR_MS);
  });

  it("maps an entirely skipped Apia day to an empty interval, not an invented 24-hour day", () => {
    const skipped = parsePlaudRange(
      { from: "2011-12-30", to: "2011-12-30" },
      "Pacific/Apia"
    );
    expect(skipped.fromUtc).toBe(utc("2011-12-30T10:00:00Z"));
    expect(skipped.toUtcExclusive).toBe(skipped.fromUtc);
    const preceding = parsePlaudRange(
      { from: "2011-12-29", to: "2011-12-29" },
      "Pacific/Apia"
    );
    expect(preceding.toUtcExclusive).toBe(skipped.fromUtc);
    const spanning = parsePlaudRange(
      { from: "2011-12-29", to: "2011-12-31" },
      "Pacific/Apia"
    );
    expect(spanning.toUtcExclusive! - spanning.fromUtc!).toBe(48 * HOUR_MS);
  });

  it("advances the local calendar across month/year and DST boundaries", () => {
    const range = parsePlaudRange(
      { from: "2026-12-31", to: "2026-12-31" },
      "Asia/Kathmandu"
    );
    expect(range.fromUtc).toBe(utc("2026-12-30T18:15:00Z"));
    expect(range.toUtcExclusive).toBe(utc("2026-12-31T18:15:00Z"));
    const beforeGap = parsePlaudRange(
      { from: "2026-04-23", to: "2026-04-23" },
      "Africa/Cairo"
    );
    const afterGap = parsePlaudRange(
      { from: "2026-04-24", to: "2026-04-24" },
      "Africa/Cairo"
    );
    expect(beforeGap.toUtcExclusive).toBe(afterGap.fromUtc);
  });
});

describe("effectivePlaudDate", () => {
  it("prefers the valid call timestamp, including the epoch, without consulting the clock", () => {
    expect(effectivePlaudDate(0, utc("2026-11-12T12:00:00Z"))).toEqual({
      effectiveAt: 0,
      usesImportDate: false,
    });
    expect(effectivePlaudDate(utc("2026-10-29T21:30:00Z"), 123)).toEqual({
      effectiveAt: utc("2026-10-29T21:30:00Z"),
      usesImportDate: false,
    });
  });

  it.each([
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    1.5,
    8_640_000_000_000_001,
    "2026-11-12",
    new Date("2026-11-12T00:00:00Z"),
  ])(
    "uses an explicit import-date fallback for invalid call timestamp %j",
    callAt => {
      const importedAt = utc("2026-10-29T21:30:00Z");
      const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
        throw new Error("clock must not be read");
      });
      try {
        expect(effectivePlaudDate(callAt as number | null, importedAt)).toEqual(
          { effectiveAt: importedAt, usesImportDate: true }
        );
      } finally {
        dateNow.mockRestore();
      }
    }
  );

  it("uses the same effective fallback across a repeated Cairo hour for filtering and ordering", () => {
    const range = parsePlaudRange(
      { from: "2026-10-29", to: "2026-10-29" },
      "Africa/Cairo"
    );
    const dates = [utc("2026-10-29T20:30:00Z"), utc("2026-10-29T21:30:00Z")];
    for (const importedAt of dates) {
      const { effectiveAt, usesImportDate } = effectivePlaudDate(
        null,
        importedAt
      );
      expect(usesImportDate).toBe(true);
      expect(effectiveAt).toBeGreaterThanOrEqual(range.fromUtc!);
      expect(effectiveAt).toBeLessThan(range.toUtcExclusive!);
    }
  });

  it.each([NaN, Infinity, -Infinity, 8_640_000_000_000_001, undefined, "123"])(
    "fails closed if the required import fallback is invalid %j",
    importedAt => {
      expect(() => effectivePlaudDate(null, importedAt as number)).toThrow(
        /import timestamp/
      );
    }
  );
});

describe("PLAUD exact plain-text block export", () => {
  it("emits only transcript text and exactly three LF bytes between adjacent blocks", () => {
    const records = [
      block(1, 10, " \r\n[00:01] أحمد: مرحباً\r\n\r\nSpeaker: hello\r\n "),
      block(2, 20, "\nNext **literal source** <word>\r\n"),
    ];
    const expected =
      "[00:01] أحمد: مرحباً\n\nSpeaker: hello\n\n\nNext **literal source** <word>";
    const chunks = Array.from(encodePlaudTranscriptBlocks(records));
    expect(chunks).toEqual([
      "[00:01] أحمد: مرحباً\n\nSpeaker: hello",
      "\n\n\n",
      "Next **literal source** <word>",
    ]);
    expect(chunks.join("")).toBe(expected);
    expect(
      Buffer.from(chunks.join(""), "utf8").equals(Buffer.from(expected, "utf8"))
    ).toBe(true);
    expect(chunks.join("")).not.toMatch(
      /\r|Note 1|plaud_transcripts_|Lead|importer/
    );
  });

  it("sorts oldest effective date then numeric import ID, without mutating input or merging real call notes", () => {
    const sameText = "أحمد: identical call text";
    const records = [
      block(12, 20, sameText),
      block(3, 10, "older"),
      block(2, 20, sameText),
    ];
    const original = records.slice();
    const sorted = sortPlaudTranscripts(records);
    expect(sorted.map(record => record.id)).toEqual([3, 2, 12]);
    expect(records).toEqual(original);
    expect(encode(sorted)).toBe(`older\n\n\n${sameText}\n\n\n${sameText}`);
    expect(createTranscriptIdentity("account", "call-a")).not.toBe(
      createTranscriptIdentity("account", "call-b")
    );
  });

  it("handles one record with no separator or trailing newline", () => {
    expect(encode([block(1, 10, "first\n\nlast")])).toBe("first\n\nlast");
  });

  it("rejects no matches instead of producing a misleading empty download", () => {
    expect(() => encode([])).toThrow(
      "No Plaud transcripts found for this date range"
    );
  });

  it("rejects blank/unsafe records instead of silently skipping them or changing the count", () => {
    for (const transcript of [" ", "bad\0text", "bad\ud800text"]) {
      expect(() => encode([block(1), block(2, 2, transcript)])).toThrow();
    }
  });

  it.each([
    [block(2, 20), block(1, 10)],
    [block(12, 20), block(2, 20)],
    [block(1, 10), block(1, 10)],
    [block(0)],
    [block(1, NaN)],
    [block(1.5)],
  ])(
    "rejects unsorted, duplicate-key, or invalid ordered streams %j",
    (...records) => {
      expect(() => encode(records)).toThrow(/order/);
    }
  );

  it("streams lazily without a hidden record limit across a large export", () => {
    let requested = 0;
    const count = 25_001;
    function* records() {
      for (let id = 1; id <= count; id += 1) {
        requested += 1;
        yield block(id);
      }
    }
    const iterator = encodePlaudTranscriptBlocks(records());
    expect(requested).toBe(0);
    expect(iterator.next().value).toBe("المتحدث 1: original text");
    expect(requested).toBe(1);
    const rest = Array.from(iterator);
    expect(requested).toBe(count);
    expect(rest.filter(chunk => chunk === "\n\n\n")).toHaveLength(count - 1);
    expect(rest[rest.length - 1]).toBe(`المتحدث ${count}: original text`);
    expect(rest).toHaveLength(2 * (count - 1));
  });

  it("propagates retrieval failures rather than silently reporting a shortened export", () => {
    function* records() {
      yield block(1);
      throw new Error("snapshot record disappeared");
    }
    const iterator = encodePlaudTranscriptBlocks(records());
    expect(iterator.next().value).toBe("المتحدث 1: original text");
    expect(() => iterator.next()).toThrow("snapshot record disappeared");
  });

  it("closes the source iterator when a caller cancels or invalid text fails", () => {
    let closed = 0;
    function* records() {
      try {
        yield block(1);
        yield block(2, 2, "\0");
      } finally {
        closed += 1;
      }
    }
    const cancelled = encodePlaudTranscriptBlocks(records());
    cancelled.next();
    cancelled.return(undefined);
    expect(closed).toBe(1);
    expect(() => encode(records())).toThrow(/NUL/);
    expect(closed).toBe(2);
  });
});

describe("plaudExportFilename", () => {
  it("uses only complete, validated calendar dates in a predictable .txt filename", () => {
    expect(plaudExportFilename("2026-11-01", "2026-11-12")).toBe(
      "plaud_transcripts_2026-11-01_to_2026-11-12.txt"
    );
    expect(plaudExportFilename("2028-02-29", "2028-02-29")).toBe(
      "plaud_transcripts_2028-02-29_to_2028-02-29.txt"
    );
  });

  it.each([
    ["", ""],
    ["2026-02-29", "2026-03-01"],
    ["2026-11-12", "2026-11-01"],
    ["2026-11-01\r\nInjected: bad", "2026-11-12"],
    ["../../etc/passwd", "2026-11-12"],
  ])(
    "rejects incomplete, reversed, invalid, or unsafe filename dates %j",
    (from, to) => {
      expect(() => plaudExportFilename(from, to)).toThrow();
    }
  );
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { storageGet, storagePut } from "./storage";
import { generateContractDoc, uploadContractToStorage } from "./contractGenerator";

vi.mock("./storage", () => ({ storageGet: vi.fn(), storagePut: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const PROJECT_BASE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/";
const TIMESTAMP = 1_800_000_000_000;
const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x23, 0x3f]);
const SAFE_BASENAME = `26999_TES_${TIMESTAMP}.docx`;
const SAFE_URL = `${PROJECT_BASE}contracts/${SAFE_BASENAME}`;

function storageUrl(key: string) {
  return PROJECT_BASE + key.split("/").map(encodeURIComponent).join("/");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(TIMESTAMP);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(storagePut).mockImplementation(async key => ({ key, url: storageUrl(key) }));
});

afterEach(() => {
  expect(storageGet).not.toHaveBeenCalled();
  expect(axios.get).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

const filenameCases = [
  { label: "ordinary whitespace", code: "26999", name: "Synthetic Client", safeCode: "26999", safeName: "Synthetic_Client" },
  { label: "reported hash suffix", code: "26999", name: "TES#", safeCode: "26999", safeName: "TES" },
  { label: "reserved punctuation and whitespace runs", code: "26999", name: " A # ? % / \\ . & : ; < > \" ' | * B ", safeCode: "26999", safeName: "A_B" },
  { label: "percent-encoded separator text", code: "26999", name: "A%2F%23%3FB", safeCode: "26999", safeName: "A_2F_23_3FB" },
  { label: "path traversal and extra extensions", code: "26999", name: "../A\\..\\B.docx", safeCode: "26999", safeName: "A_B_docx" },
  { label: "controls and format characters", code: "26999", name: "A\u0000\u001f\u007f\u0085\u200b\u202eB", safeCode: "26999", safeName: "A_B" },
  { label: "Arabic letters, combining marks and numbers", code: "26999", name: "أَحْمَد مُحَمَّد ١٢٣", safeCode: "26999", safeName: "أَحْمَد_مُحَمَّد_١٢٣" },
  { label: "decomposed Latin combining marks", code: "26999", name: "Jose\u0301 42", safeCode: "26999", safeName: "Jose\u0301_42" },
  { label: "other Unicode letters and numbers", code: "26999", name: "李 四 １２３", safeCode: "26999", safeName: "李_四_１２３" },
  { label: "safe underscores and hyphens", code: "26999", name: "Synthetic_Client-42", safeCode: "26999", safeName: "Synthetic_Client-42" },
  { label: "redundant delimiters", code: "26999", name: "__A__ # __B__", safeCode: "26999", safeName: "A_B" },
  { label: "empty client name", code: "26999", name: "", safeCode: "26999", safeName: "unnamed" },
  { label: "punctuation-only client name", code: "26999", name: " # ? % / \\ .. \u0000 __ ", safeCode: "26999", safeName: "unnamed" },
  { label: "unsafe contract-code segment", code: "../26#?%/\\.999", name: "Synthetic", safeCode: "26_999", safeName: "Synthetic" },
  { label: "empty contract code", code: "", name: "Synthetic", safeCode: "unnamed", safeName: "Synthetic" },
  { label: "punctuation-only contract code", code: " /\\.%#?\u0000 ", name: "Synthetic", safeCode: "unnamed", safeName: "Synthetic" },
  { label: "safe contract-code delimiters", code: "26_999-A", name: "Synthetic", safeCode: "26_999-A", safeName: "Synthetic" },
];

describe("contract storage filename components", () => {
  it.each(filenameCases)("sanitizes $label without changing upload bytes or MIME", async ({ code, name, safeCode, safeName }) => {
    const key = `contracts/${safeCode}_${safeName}_${TIMESTAMP}.docx`;
    const result = await uploadContractToStorage(BYTES, code, name);

    expect(storagePut).toHaveBeenCalledTimes(1);
    expect(storagePut).toHaveBeenCalledWith(key, BYTES, MIME);
    expect(vi.mocked(storagePut).mock.calls[0][1]).toBe(BYTES);
    expect(BYTES).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x23, 0x3f]));
    expect(key.split("/")).toHaveLength(2);
    expect(key.split(".")).toHaveLength(2);
    expect(result).toBe(storageUrl(key));
    const parsed = new URL(result);
    expect(decodeURIComponent(parsed.pathname)).toBe(`/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/${key}`);
    expect(parsed.search).toBe("");
    expect(parsed.hash).toBe("");
  });
});

describe("download filenames share the same component sanitizer", () => {
  it.each(filenameCases.filter(({ label }) => !label.includes("controls") && !label.includes("punctuation-only")))(
    "uses matching safe download and storage components for $label",
    async ({ code, name, safeCode, safeName }) => {
      const { buffer, filename } = await generateContractDoc(name, 1, code, "spain", 12_000);
      expect(filename).toBe(`Contract_${safeCode}_${safeName}.docx`);
      expect(filename).toMatch(new RegExp("^Contract_[\\p{L}\\p{N}\\p{M}_-]+\\.docx$", "u"));
      await uploadContractToStorage(buffer, code, name);
      expect(storagePut).toHaveBeenCalledTimes(1);
      expect(storagePut).toHaveBeenCalledWith(
        `contracts/${safeCode}_${safeName}_${TIMESTAMP}.docx`, buffer, MIME,
      );
      expect(vi.mocked(storagePut).mock.calls[0][1]).toBe(buffer);
    },
  );
});

describe("returned storage URL is fail-closed and filename-bound", () => {
  it("preserves a valid exact approved-project URL verbatim", async () => {
    vi.mocked(storagePut).mockResolvedValue({ key: `contracts/${SAFE_BASENAME}`, url: SAFE_URL });
    await expect(uploadContractToStorage(BYTES, "26999", "TES#")).resolves.toBe(SAFE_URL);
  });

  const invalidUrls = [
    { label: "malformed", url: "not a URL" },
    { label: "empty", url: "" },
    { label: "non-string", url: undefined },
    { label: "HTTP", url: SAFE_URL.replace("https:", "http:") },
    { label: "wrong host", url: SAFE_URL.replace("d2xsxph8kpxj0f.cloudfront.net", "evil.example") },
    { label: "deceptive host suffix", url: SAFE_URL.replace("cloudfront.net", "cloudfront.net.evil.example") },
    { label: "wrong project", url: SAFE_URL.replace("CjqhSqoCBRNxigxoNR3Jk2", "wrong-project") },
    { label: "wrong directory", url: SAFE_URL.replace("/contracts/", "/contract-templates/") },
    { label: "userinfo", url: SAFE_URL.replace("https://", "https://synthetic:password@") },
    { label: "nondefault port", url: SAFE_URL.replace("cloudfront.net/", "cloudfront.net:8443/") },
    { label: "fragment", url: `${SAFE_URL}#synthetic-private-fragment` },
    { label: "empty fragment marker", url: `${SAFE_URL}#` },
    { label: "query", url: `${SAFE_URL}?synthetic-private-query=1` },
    { label: "empty query marker", url: `${SAFE_URL}?` },
    { label: "leading whitespace", url: ` ${SAFE_URL}` },
    { label: "trailing whitespace", url: `${SAFE_URL}\n` },
    { label: "embedded control", url: SAFE_URL.replace("TES", "T\nES") },
    { label: "invalid percent encoding", url: SAFE_URL.replace("TES", "%ZZ") },
    { label: "hash-truncated original URL", url: `${PROJECT_BASE}contracts/26999_TES#_${TIMESTAMP}.docx` },
    { label: "bare truncated path", url: `${PROJECT_BASE}contracts/26999_TES` },
    { label: "wrong client name", url: SAFE_URL.replace("TES", "OTHER") },
    { label: "wrong contract code", url: SAFE_URL.replace("26999", "26998") },
    { label: "wrong timestamp", url: SAFE_URL.replace(String(TIMESTAMP), String(TIMESTAMP + 1)) },
    { label: "wrong extension", url: SAFE_URL.replace(".docx", ".pdf") },
    { label: "extra suffix", url: `${SAFE_URL}/extra.docx` },
    { label: "encoded slash within filename", url: SAFE_URL.replace("TES", "TE%2FS") },
    { label: "encoded backslash", url: SAFE_URL.replace("TES", "TE%5CS") },
    { label: "encoded hash", url: SAFE_URL.replace("TES", "TES%23") },
    { label: "encoded dot traversal", url: `${PROJECT_BASE}contracts/%2e%2e/${SAFE_BASENAME}` },
  ];

  it.each(invalidUrls)("rejects $label with only a sanitized error and no URL logging", async ({ url }) => {
    vi.mocked(storagePut).mockResolvedValue({ key: `contracts/${SAFE_BASENAME}`, url: url as string });
    let caught: unknown;
    try {
      await uploadContractToStorage(BYTES, "26999", "TES#");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("CONTRACT_DOCUMENT_STORAGE_URL_INVALID");
    expect(caught).not.toHaveProperty("cause");
    expect(storagePut).toHaveBeenCalledTimes(1);
    expect(storagePut).toHaveBeenCalledWith(`contracts/${SAFE_BASENAME}`, BYTES, MIME);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

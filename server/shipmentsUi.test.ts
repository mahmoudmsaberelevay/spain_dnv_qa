import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_SHIPMENT_FILTERS,
  SHIPMENT_SORT_FIELDS,
  shipmentEntrySchema,
  shipmentFiltersSchema,
} from "../shared/shipments";

// Source-level tests deliberately never mount the live app, import server routers,
// connect to a database, or make a provider/CRM request.
const source = readFileSync(
  new URL("../client/src/pages/Shipments.tsx", import.meta.url),
  "utf8"
);
const file = ts.createSourceFile(
  "Shipments.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const page = compact(source);

function functionSource(name: string): string {
  let found: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      found = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`Missing UI function: ${name}`);
  return found.getText(file);
}
function initializer(name: string): string {
  let found: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    )
      found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`Missing UI state/contract: ${name}`);
  return compact(found.getText(file));
}
function pureHelper<T extends (...args: any[]) => any>(name: string): T {
  const javascript = ts.transpileModule(functionSource(name), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  return new Function(`${javascript}; return ${name};`)() as T;
}
const validEntry = {
  shipmentDate: "2026-11-09",
  companyName: "Synthetic Carrier",
  shipmentNumber: "TEST-100",
  direction: "from" as const,
  partyName: "Synthetic Sender",
  driveUrl: "https://drive.google.com/file/d/synthetic/view",
  recordedByName: "Synthetic Record-maker",
  notificationEmail: "shipment@example.test",
};

function saveHarness() {
  const create = { mutateAsync: vi.fn() };
  const requestRef = { current: null };
  const submittingRef = { current: false };
  const invalidate = vi.fn().mockResolvedValue(undefined);
  const deps = {
    enabled: true,
    pending: false,
    entry: { ...validEntry, notes: "" },
    shipmentEntrySchema,
    EMPTY_ENTRY: { notes: "" },
    create,
    requestRef,
    submittingRef,
    crypto: { randomUUID: vi.fn(() => "11111111-1111-4111-8111-111111111111") },
    setErrors: vi.fn(),
    setSaveError: vi.fn(),
    setEntry: vi.fn(),
    setOpen: vi.fn(),
    shipmentSaveFeedback: pureHelper("shipmentSaveFeedback"),
    toast: {
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
    utils: { shipments: { list: { invalidate } } },
  };
  const javascript = ts.transpileModule(functionSource("save"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const save = new Function(
    "deps",
    `const { ${Object.keys(deps).join(", ")} } = deps; ${javascript}; return save;`
  )(deps);
  return { ...deps, invalidate, save: () => save({ preventDefault() {} }) };
}

describe("Shipment frontend source contracts", () => {
  it("uses auth-enabled tRPC queries without an extra layout or special user guard", () => {
    expect(page).toContain("= useAuth()");
    expect(initializer("enabled")).toBe("isAuthenticated && !authLoading");
    expect(initializer("list")).toContain(
      "trpc.shipments.list.useQuery(queryInput, { enabled, retry: false, refetchOnWindowFocus: false,"
    );
    expect(source).not.toMatch(
      /PageGuard|DashboardLayout|MobileLayout|isHrAdministrator|user\??\.role|trpc\.permissions|usePermissions/
    );
  });

  it("has the requested Shipment header and uses existing ELEVAY material tokens", () => {
    expect(source).toMatch(/<h1[^>]*>\s*Shipment\s*<\/h1>/);
    expect(source).toContain('<Package className="size-6"');
    expect(source).toContain("elevay-glass-panel");
    expect(source).toContain("elevay-featured-panel");
    expect(source).toContain("elevay-control-surface");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba\(/i);
  });

  it("takes KPI counts from the same server list, never just the visible rows", () => {
    for (const count of ["total", "fromCount", "toCount"])
      expect(source).toContain(`value: data?.${count}`);
    expect(source).toContain("Matching applied filters");
    expect(source).not.toMatch(/rows\.filter|rows\.length\s*[+*]/);
  });

  it("keeps creation in an accessible dialog with eight shared-schema fields", () => {
    const dialog = compact(functionSource("AddShipmentDialog"));
    expect(dialog).toContain("<DialogTrigger asChild>");
    expect(dialog).toContain("<DialogTitle");
    expect(dialog).toContain("<DialogDescription>");
    expect(dialog).toContain("All eight fields are required.");
    expect(dialog).toContain("shipmentEntrySchema.safeParse(entry)");
    expect(dialog).toContain("aria-invalid=");
    expect(dialog).toContain("aria-describedby=");
    expect(dialog).toContain('type: "date"');
    expect(dialog).toContain('type="url"');
    for (const field of Object.keys(validEntry))
      expect(dialog).toContain(`"${field}"`);
    expect(dialog).toContain('"Sender name"');
    expect(dialog).toContain('"Recipient name"');
    expect(dialog).toContain("shipmentDirectionLabel(direction)");
    expect(dialog).toContain("Choose Shipment from or Shipment to");
  });

  it("adds an accessible optional notes textarea after notification fields with a count and disclosure", () => {
    expect(initializer("EMPTY_ENTRY")).toContain('notes: ""');
    expect(source).toContain(
      'import { Textarea } from "@/components/ui/textarea"'
    );
    const dialog = compact(functionSource("AddShipmentDialog"));
    expect(dialog).toContain(
      "All eight fields are required. Notes are optional."
    );
    expect(dialog).toContain(
      'htmlFor={fieldId("notes")}>Notes (optional)</Label>'
    );
    expect(dialog.indexOf('htmlFor={fieldId("notes")}')).toBeGreaterThan(
      dialog.indexOf('htmlFor={fieldId("notificationEmail")}')
    );
    const textarea = dialog.slice(
      dialog.indexOf("<Textarea"),
      dialog.indexOf("/>", dialog.indexOf("<Textarea"))
    );
    for (const expected of [
      'id={fieldId("notes")}',
      'value={entry.notes ?? ""}',
      "maxLength={2000}",
      "rows={4}",
      "aria-invalid={!!errors.notes}",
      "aria-describedby=",
      'update("notes", event.target.value)',
    ])
      expect(textarea).toContain(expected);
    expect(textarea).not.toMatch(/\brequired\b/);
    expect(dialog).toContain('(entry.notes ?? "").length.toLocaleString()');
    expect(dialog).toContain("/ 2,000 characters.");
    expect(dialog).toContain(
      "Notes are included in the notification email and PDF reports."
    );
    expect(dialog).toContain(
      'FieldError id={errorId("notes")} message={errors.notes}'
    );
  });

  it("accepts omitted or empty notes while normalizing multiline content in shared validation", () => {
    expect(shipmentEntrySchema.parse(validEntry).notes).toBeUndefined();
    expect(shipmentEntrySchema.parse({ ...validEntry, notes: "" }).notes).toBe(
      ""
    );
    expect(
      shipmentEntrySchema.parse({
        ...validEntry,
        notes: "  First paragraph\r\n\r\nSecond\titem  ",
      }).notes
    ).toBe("First paragraph\n\nSecond\titem");
    expect(
      shipmentEntrySchema.safeParse({ ...validEntry, notes: "a".repeat(2000) })
        .success
    ).toBe(true);
    expect(
      shipmentEntrySchema.safeParse({ ...validEntry, notes: "a".repeat(2001) })
        .success
    ).toBe(false);
    for (const notes of [
      "Unsafe\u0000note",
      "Unsafe\u0085note",
      "Bad\u000bcontrol",
    ])
      expect(
        shipmentEntrySchema.safeParse({ ...validEntry, notes }).success
      ).toBe(false);
  });

  it("shared validation rejects missing fields, invalid calendar dates and unsafe Drive links", () => {
    expect(shipmentEntrySchema.safeParse(validEntry).success).toBe(true);
    for (const field of Object.keys(validEntry))
      expect(
        shipmentEntrySchema.safeParse({ ...validEntry, [field]: "" }).success
      ).toBe(false);
    expect(
      shipmentEntrySchema.safeParse({
        ...validEntry,
        shipmentDate: "2026-02-30",
      }).success
    ).toBe(false);
    for (const driveUrl of [
      "http://drive.google.com/file/a",
      "https://drive.google.com.evil.test/a",
      "javascript:alert(1)",
      "https://example.test/a",
    ]) {
      expect(
        shipmentEntrySchema.safeParse({ ...validEntry, driveUrl }).success
      ).toBe(false);
    }
  });

  it("requires manually entered recorder and a single bare notification address", () => {
    expect(initializer("EMPTY_ENTRY")).toContain('recordedByName: ""');
    expect(initializer("EMPTY_ENTRY")).toContain('notificationEmail: ""');
    const dialog = compact(functionSource("AddShipmentDialog"));
    expect(dialog).toContain('type="email"');
    expect(dialog).toContain("maxLength={254}");
    expect(dialog).toContain("Recorded by");
    expect(dialog).toContain("Notification email");
    expect(dialog).toContain("This does not change the signed-in user");
    expect(dialog).toContain(
      "All shipment details will be emailed immediately after saving"
    );
    expect(dialog).toContain("Ziad under the standing notification preference");
    expect(
      shipmentEntrySchema.parse({
        ...validEntry,
        recordedByName: "  Manual maker  ",
      }).recordedByName
    ).toBe("Manual maker");
    expect(
      shipmentEntrySchema.safeParse({
        ...validEntry,
        recordedByName: "a".repeat(201),
      }).success
    ).toBe(false);
    for (const notificationEmail of [
      "not-an-email",
      "Maker <maker@example.test>",
      "a@example.test,b@example.test",
      "a@example.test;b@example.test",
      "a@example.test\r\nBcc: b@example.test",
      `${"a".repeat(245)}@example.test`,
    ])
      expect(
        shipmentEntrySchema.safeParse({ ...validEntry, notificationEmail })
          .success
      ).toBe(false);
  });

  it("prevents duplicate submits and disables form controls while saving", () => {
    const save = compact(functionSource("save"));
    expect(save).toContain(
      "if (!enabled || pending || submittingRef.current) return"
    );
    expect(save).toContain("submittingRef.current = true");
    expect(save).toContain("finally { submittingRef.current = false;");
    expect(page).toContain("<fieldset disabled={pending}");
    expect(page).toContain("disabled={pending || !enabled}");
    expect(page).toContain("showCloseButton={!pending}");
    expect(page).toContain(
      "if (!pending && !submittingRef.current) setOpen(next)"
    );
    expect(page).toContain(
      "trpc.shipments.create.useMutation({ retry: false })"
    );
  });

  it("preserves an idempotency UUID after failure but invalidates it for any changed payload", () => {
    const save = compact(functionSource("save"));
    const update = compact(functionSource("update"));
    expect(save).toContain("const fingerprint = JSON.stringify(parsed.data)");
    expect(save).toContain(
      "!requestRef.current || requestRef.current.fingerprint !== fingerprint"
    );
    expect(save).toContain("requestKey: crypto.randomUUID()");
    expect(save).toContain("requestKey: requestRef.current.requestKey");
    const failure = save.slice(
      save.indexOf("} catch {"),
      save.indexOf("} finally {")
    );
    expect(failure).toContain("Retry without changing the fields");
    expect(failure).not.toContain("requestRef.current = null");
    expect(update).toContain(
      "if (entry[key] !== value) requestRef.current = null"
    );
  });

  it("does not falsely mark an already-saved shipment as failed when list refresh fails", () => {
    const save = compact(functionSource("save"));
    expect(
      save.indexOf("toast[feedback.level](feedback.message)")
    ).toBeGreaterThan(save.indexOf("await create.mutateAsync"));
    expect(save).toContain("void utils.shipments.list.invalidate().catch");
    expect(save).toContain("Shipment saved, but the list could not refresh");
    expect(save.indexOf("utils.shipments.list.invalidate")).toBeGreaterThan(
      save.indexOf("} finally {")
    );
  });

  it.each([
    ["sent", "success", "Notification email sent"],
    ["failed", "warning", "notification email failed"],
    ["unknown", "warning", "could not be confirmed"],
    [undefined, "warning", "could not be confirmed"],
    ["sending", "info", "is being sent"],
    ["not_requested", "warning", "No notification email was requested"],
  ] as const)(
    "closes and refreshes confirmed saves with %s email status",
    async (status, level, message) => {
      const harness = saveHarness();
      harness.create.mutateAsync.mockResolvedValue({
        row: { notificationStatus: status },
        created: true,
      });
      await harness.save();
      expect(harness.setOpen).toHaveBeenCalledWith(false);
      expect(harness.invalidate).toHaveBeenCalledOnce();
      expect(harness.toast[level]).toHaveBeenCalledWith(
        expect.stringContaining(message)
      );
      expect(harness.setSaveError.mock.calls).toEqual([[null]]);
      expect(harness.create.mutateAsync).toHaveBeenCalledOnce();
      expect(harness.requestRef.current).toBeNull();
      if (status === "failed" || status === "unknown")
        expect(harness.toast.warning).toHaveBeenCalledWith(
          expect.stringContaining("Do not save again")
        );
    }
  );

  it("reuses the UUID after an uncertain save and treats replay mail status as saved", async () => {
    const harness = saveHarness();
    harness.create.mutateAsync.mockRejectedValueOnce(
      new Error("Synthetic transport loss")
    );
    harness.create.mutateAsync.mockResolvedValueOnce({
      row: { notificationStatus: "unknown" },
      created: false,
    });
    await harness.save();
    expect(harness.setOpen).not.toHaveBeenCalled();
    expect(harness.invalidate).not.toHaveBeenCalled();
    await harness.save();
    expect(harness.create.mutateAsync.mock.calls[0][0].requestKey).toBe(
      harness.create.mutateAsync.mock.calls[1][0].requestKey
    );
    expect(harness.crypto.randomUUID).toHaveBeenCalledOnce();
    expect(harness.setOpen).toHaveBeenCalledWith(false);
    expect(harness.toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("Shipment saved")
    );
    expect(harness.invalidate).toHaveBeenCalledOnce();
  });

  it("keeps failed-email saves closed when list refresh also fails", async () => {
    const harness = saveHarness();
    harness.create.mutateAsync.mockResolvedValue({
      row: { notificationStatus: "failed" },
      created: true,
    });
    harness.invalidate.mockRejectedValue(new Error("Synthetic list failure"));
    await harness.save();
    await Promise.resolve();
    expect(harness.setOpen.mock.calls).toEqual([[false]]);
    expect(harness.setSaveError.mock.calls).toEqual([[null]]);
    expect(harness.toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("Shipment saved")
    );
    expect(harness.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Shipment saved, but the list could not refresh")
    );
    expect(harness.create.mutateAsync).toHaveBeenCalledOnce();
  });

  it("blocks a second click before pending mutation state can render", async () => {
    const harness = saveHarness();
    let complete!: (value: unknown) => void;
    harness.create.mutateAsync.mockImplementation(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const firstSave = harness.save();
    await harness.save();
    expect(harness.create.mutateAsync).toHaveBeenCalledOnce();
    complete({ row: { notificationStatus: "sent" }, created: true });
    await firstSave;
    expect(harness.submittingRef.current).toBe(false);
    expect(harness.invalidate).toHaveBeenCalledOnce();
  });

  it("submits normalized notes as shared-schema data and clears notes after a confirmed save", async () => {
    const harness = saveHarness();
    harness.entry.notes = "  First line\r\n\r\nFinal\tline  ";
    harness.create.mutateAsync.mockResolvedValue({
      row: { notificationStatus: "sent" },
      created: true,
    });
    await harness.save();
    expect(harness.create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: "First line\n\nFinal\tline",
      })
    );
    expect(harness.setEntry).toHaveBeenCalledWith({ notes: "" });
    expect(harness.setOpen).toHaveBeenCalledWith(false);
  });

  it("shows recorder, notification address/status and legacy fallbacks without altering sortable columns", () => {
    expect(page).toContain("Recorded by: ");
    expect(page).toContain("Notification email: ");
    expect(page).toContain('row.recordedByName?.trim() || "Not recorded"');
    expect(page).toContain('row.notificationEmail || "Not recorded"');
    expect(page).toContain("shipmentNotificationLabel(row.notificationStatus)");
    const label = pureHelper<(status?: string) => string>(
      "shipmentNotificationLabel"
    );
    expect(label(undefined)).toBe("Not recorded");
    for (const status of ["sent", "failed", "sending", "unknown"])
      expect(label(status).toLowerCase()).toBe(status);
    expect(source).not.toMatch(
      /notificationError|notificationRecipients|createdByUserId|SMTP|trpc\.shipments\.(notify|resend)/
    );
  });

  it("shows full saved notes in existing row details with readable whitespace and legacy fallback", () => {
    const rowDetails = page.slice(
      page.indexOf('<dl className="mt-2'),
      page.indexOf("</dl>")
    );
    expect(rowDetails).toContain("<dt>Notes:</dt>");
    expect(rowDetails).toContain(
      "whitespace-pre-wrap break-words text-xs text-foreground"
    );
    expect(rowDetails).toContain('row.notes?.trim() || "No notes"');
    expect(rowDetails).not.toMatch(
      /line-clamp|truncate|dangerouslySetInnerHTML/
    );
    expect(initializer("COLUMNS")).not.toContain('key: "notes"');
    for (const notes of [undefined, null, "", "  "])
      expect(notes?.trim() || "No notes").toBe("No notes");
    expect(source).toContain(
      'placeholder="Company, shipment number, recorder, email, notes or Drive link…"'
    );
  });

  it("only changes draft state when typing; Apply validates and Reset clears both scopes", () => {
    expect(initializer("queryInput")).toContain(
      "filters: appliedFilters, page, pageSize, sortBy, sortOrder"
    );
    expect(initializer("queryInput")).not.toContain("draftFilters");
    const update = compact(functionSource("updateFilter"));
    expect(update).toContain("setDraftFilters");
    expect(update).not.toMatch(/setAppliedFilters|refetch|fetch|useQuery/);
    const apply = compact(functionSource("applyFilters"));
    expect(apply).toContain("shipmentFiltersSchema.safeParse(draftFilters)");
    expect(apply).toContain("setAppliedFilters(parsed.data)");
    expect(apply).toContain("setPage(1)");
    const reset = compact(functionSource("resetFilters"));
    expect(reset).toContain("setDraftFilters({ ...EMPTY_SHIPMENT_FILTERS })");
    expect(reset).toContain("setAppliedFilters({ ...EMPTY_SHIPMENT_FILTERS })");
    expect(reset).toContain("setPage(1)");
  });

  it("offers global search plus explicit company, number, party, Drive, direction and inclusive dates", () => {
    for (const key of [
      "companyName",
      "shipmentNumber",
      "partyName",
      "driveUrl",
    ])
      expect(initializer("FILTER_FIELDS")).toContain(`key: "${key}"`);
    expect(source).toContain("Search all details");
    expect(source).toContain("draftFilters.direction");
    expect(source).toContain("draftFilters.from");
    expect(source).toContain("draftFilters.to");
    expect(source.match(/\(inclusive\)/g)).toHaveLength(2);
    expect(
      shipmentFiltersSchema.safeParse({
        ...EMPTY_SHIPMENT_FILTERS,
        from: "2026-11-09",
        to: "2026-11-09",
      }).success
    ).toBe(true);
    expect(
      shipmentFiltersSchema.safeParse({
        ...EMPTY_SHIPMENT_FILTERS,
        from: "2026-11-10",
        to: "2026-11-09",
      }).success
    ).toBe(false);
  });

  it("keeps primary filters visible, groups the date bounds, and discloses optional field filters accessibly", () => {
    const details = page.slice(
      page.indexOf("<details ref={moreFiltersRef}"),
      page.indexOf("</details>")
    );
    expect(details).toContain("<summary");
    expect(details).toContain("More search filters");
    expect(details).toContain("FILTER_FIELDS.map");
    expect(details).not.toMatch(
      /filter-search|filter-direction|filter-from|filter-to/
    );
    const primary = page.slice(
      page.indexOf("htmlFor={`${id}-filter-from`}"),
      page.indexOf("<details ref={moreFiltersRef}")
    );
    expect(primary).toContain("htmlFor={`${id}-filter-to`}");
    expect(primary).not.toContain("FILTER_FIELDS.map");
    expect(compact(functionSource("applyFilters"))).toContain(
      "moreFiltersRef.current.open = true"
    );
    expect(source).toContain("Field-specific filters set");
  });

  it("exports all pages using applied filters, or one shipment ID, through the dynamic PDF module", () => {
    const handler = compact(functionSource("exportReport"));
    expect(handler).toContain(
      "shipmentId === undefined ? { filters: appliedFilters } : { shipmentId }"
    );
    expect(handler).toMatch(
      /utils\.shipments\.report\.fetch\(reportInput, \{ staleTime: 0,? \}\)/
    );
    expect(handler).toContain('await import("@/lib/shipmentsPdf")');
    expect(handler).toContain("await exportShipmentsPdf(report)");
    expect(handler).not.toMatch(
      /draftFilters|pageSize|\.mutate|(?<!\.)\bfetch\s*\(/
    );
    expect(source).toContain("not just the visible rows");
    expect(page).toContain("exportReport(row.id)");
  });

  it("blocks filtered exports during unapplied changes/refetch and range exports without both valid bounds", () => {
    const disabled = initializer("filterExportDisabled");
    for (const guard of [
      "!enabled",
      "list.isFetching",
      "list.isPending",
      "list.isError",
      "unappliedFilters",
      "exportTarget !== null",
    ])
      expect(disabled).toContain(guard);
    expect(initializer("rangeReady")).toContain(
      "!!appliedFilters.from && !!appliedFilters.to && shipmentFiltersSchema.safeParse(appliedFilters).success"
    );
    expect(compact(functionSource("exportReport"))).toContain(
      "filterExportDisabled || (dateRange && !rangeReady)"
    );
    expect(page).toContain("disabled={filterExportDisabled || !rangeReady}");
    expect(source).toContain("Date-range PDF");
    expect(source).toContain("Export filtered PDF");
    expect(source).toContain("All dates");
  });

  it("reports PDF failure honestly and never displays success before the PDF finishes", () => {
    const handler = compact(functionSource("exportReport"));
    expect(
      handler.indexOf('toast.success("Shipment PDF downloaded")')
    ).toBeGreaterThan(handler.indexOf("await exportShipmentsPdf(report)"));
    const failure = handler.slice(
      handler.indexOf("} catch {"),
      handler.indexOf("} finally {")
    );
    expect(failure).toContain("No download was confirmed");
    expect(failure).toContain("setExportError(message)");
    expect(failure).toContain("toast.error(message)");
    expect(failure).not.toContain("toast.success");
    expect(handler).toContain("exportBusyRef.current = false");
    expect(handler).toContain("setExportTarget(null)");
  });

  it("opens validated Drive references in a safe new tab without fetching or changing permissions", () => {
    expect(page).toContain("isShipmentDriveUrl(row.driveUrl)");
    expect(page).toContain(
      'href={row.driveUrl} target="_blank" rel="noopener noreferrer"'
    );
    expect(source).toContain("Link unavailable");
    expect(source).not.toMatch(
      /(?<!\.)\bfetch\s*\(|axios|storagePut|drive\.permissions|window\.open/
    );
    expect(source).not.toMatch(/trpc\.shipments\.(update|edit|delete|remove)/);
  });

  it("supports all sortable fields and page sizes while resetting the page on changes", () => {
    const columns = initializer("COLUMNS");
    for (const key of SHIPMENT_SORT_FIELDS)
      expect(columns).toMatch(new RegExp(`key: "${key}"[^}]*sortable: true`));
    const sort = compact(functionSource("sort"));
    expect(sort).toContain('current === "asc" ? "desc" : "asc"');
    expect(sort).toContain("setSortBy(key)");
    expect(sort).toContain("setPage(1)");
    for (const value of [10, 25, 50])
      expect(source).toContain(
        `<SelectItem value="${value}">${value}</SelectItem>`
      );
    expect(page).toContain(
      "setPageSize(Number(value) as 10 | 25 | 50); setPage(1)"
    );
    expect(source).toContain("Previous shipment page");
    expect(source).toContain("Next shipment page");
    expect(source).toContain("aria-sort=");
  });

  it("bounds pointer and keyboard resizing, and preserves shipment calendar days", () => {
    const clamp =
      pureHelper<(width: number, min: number, max: number) => number>(
        "clampWidth"
      );
    expect(clamp(-1000, 110, 440)).toBe(110);
    expect(clamp(9999, 110, 440)).toBe(440);
    expect(clamp(220, 110, 440)).toBe(220);
    expect(compact(functionSource("resizeStart"))).toContain(
      "setPointerCapture(event.pointerId)"
    );
    expect(compact(functionSource("resizeMove"))).toContain("clampWidth(");
    const keyboard = compact(functionSource("resizeKey"));
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"])
      expect(keyboard).toContain(`"${key}"`);
    expect(keyboard).toContain("event.shiftKey ? 40 : 10");
    expect(keyboard).toContain("clampWidth(");
    expect(source).toContain('role="separator"');
    expect(source).toContain("aria-valuemin={column.min}");
    expect(source).toContain("aria-valuemax={column.max}");
    const date = pureHelper<(value: string) => string>("displayDate");
    expect(date("2026-11-09")).toBe("09 Nov 2026");
    expect(date("2024-02-29")).toBe("29 Feb 2024");
    expect(functionSource("displayDate")).toContain('timeZone: "UTC"');
  });

  it("contains horizontal overflow and long field values within mobile table/dialog surfaces", () => {
    expect(source).toContain(
      "min-w-0 grid-cols-[minmax(0,1fr)] max-h-[calc(100dvh-2rem)] overflow-y-auto"
    );
    expect(source).toContain(
      "min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
    );
    expect(source).toContain("[overflow-wrap:anywhere]");
    expect(page).toContain('tabIndex={0} role="region"');
    expect(page).toContain('tableLayout: "fixed"');
    expect(source).toContain("onPointerCancel={resizeEnd}");
    expect(source).toContain("onLostPointerCapture=");
  });

  it("offers honest loading, unknown-error retry, and meaningful empty states", () => {
    expect(source).toContain("Shipments could not be loaded");
    expect(source).toContain("Your applied filters are still here");
    expect(page).toContain("onClick={() => void list.refetch()}");
    expect(source).toContain("No shipments match these filters");
    expect(source).toContain("No shipments recorded yet");
    expect(source).toContain("Reset filters");
    expect(source).toContain("Loading shipments…");
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
    expect(initializer("data")).toBe(
      "!list.isError && enabled ? list.data : undefined"
    );
  });
});

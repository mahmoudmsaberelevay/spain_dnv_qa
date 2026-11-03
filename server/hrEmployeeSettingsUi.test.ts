import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { validateHrMaternityBreaks } from "../shared/hrMaternityBreaks";

// Deliberately source-only: no React mount, server/router import, DB, or real mutation.
const page = readFileSync(
  new URL("../client/src/pages/HrAttendanceDashboard.tsx", import.meta.url),
  "utf8"
);
const reports = readFileSync(
  new URL("../client/src/components/HrAdminReports.tsx", import.meta.url),
  "utf8"
);
const pageFile = ts.createSourceFile(
  "dashboard.tsx",
  page,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const reportFile = ts.createSourceFile(
  "reports.tsx",
  reports,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const flat = (value: string) => value.replace(/\s+/g, " ");
function nodes<T extends ts.Node>(
  root: ts.Node,
  guard: (node: ts.Node) => node is T
): T[] {
  const result: T[] = [];
  function visit(node: ts.Node) {
    if (guard(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return result;
}
function fn(file: ts.SourceFile, name: string) {
  const node = nodes(file, ts.isFunctionDeclaration).find(
    item => item.name?.text === name
  );
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
const dialog = flat(fn(pageFile, "AdminEditDialog").getText(pageFile));
const preview = flat(fn(pageFile, "EmployeePreview").getText(pageFile));
const admin = flat(fn(pageFile, "HrAdmin").getText(pageFile));
const actions = flat(fn(reportFile, "EmployeeEditActions").getText(reportFile));
const save = flat(fn(pageFile, "save").getText(pageFile));

// Execute only extracted pure frontend helpers, not the page or its API hooks.
const helperNames = [
  "dateKey",
  "dateLabel",
  "errorMessage",
  "dutyTimeMinutes",
  "maternityBreakEnd",
  "maternityBreakValidation",
  "maternityBreakSummary",
];
const helperJs = ts.transpileModule(
  helperNames.map(name => fn(pageFile, name).getText(pageFile)).join("\n"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }
).outputText;
const helpers = new Function(
  "validateHrMaternityBreaks",
  "getCairoBusinessDate",
  `${helperJs}\nreturn { dutyTimeMinutes, maternityBreakEnd, maternityBreakValidation, maternityBreakSummary };`
)(validateHrMaternityBreaks, () => "2026-11-03") as {
  dutyTimeMinutes: (value: string) => number | null;
  maternityBreakEnd: (value: string, duration: number) => string;
  maternityBreakValidation: (
    settings: Record<string, unknown>
  ) => string | null;
  maternityBreakSummary: (
    settings: Record<string, unknown>,
    date?: string
  ) => string;
};
const duty = {
  startTime: "09:00",
  endTime: "17:00",
  effectiveFrom: "2026-11-03",
  maternityBreakMode: "two_30",
  maternityBreakStart1: "11:00",
  maternityBreakStart2: "14:00",
  maternityBreakUntil: null,
};

describe("HR employee settings UI", () => {
  it("exposes labeled direct employee edit buttons in both report tabs without any API calls", () => {
    expect(flat(reports)).toContain(
      'onEditEmployee: (employeeId: number, kind: "schedule" | "salary") => void'
    );
    expect(actions).toContain(
      'onClick={() => onEditEmployee(employee.id, "schedule")}'
    );
    expect(actions).toContain(
      'onClick={() => onEditEmployee(employee.id, "salary")}'
    );
    expect(actions).toContain(
      "aria-label={`Edit duty & breaks for ${employee.name}`}"
    );
    expect(actions).toContain(
      "aria-label={`Edit salary for ${employee.name}`}"
    );
    expect(actions.match(/type="button"/g)).toHaveLength(2);
    expect(actions.match(/min-h-11/g)).toHaveLength(2);
    for (const tab of ["attendance", "vacation"]) {
      const content = nodes(reportFile, ts.isJsxElement).find(
        node =>
          node.openingElement.tagName.getText(reportFile) === "TabsContent" &&
          node.openingElement.getText(reportFile).includes(`value="${tab}"`)
      );
      expect(content).toBeDefined();
      expect(flat(content!.getText(reportFile))).toContain(
        "<EmployeeEditActions employee={employee} onEditEmployee={props.onEditEmployee} />"
      );
    }
    expect(reports).not.toMatch(
      /trpc|useMutation|mutateAsync|fetch\(|useEffect/
    );
  });

  it("resolves the actual employee by ID and opens the existing keyed admin dialog", () => {
    expect(admin).toContain(
      "onEditEmployee={(employeeId, kind) => { const employee = employees.find(item => item.id === employeeId); if (employee) setEdit({ kind, employee }); }}"
    );
    expect(admin).toContain("<AdminEditDialog");
    expect(admin).toContain(
      'key={`${edit.kind}-${"employee" in edit ? edit.employee.id'
    );
    expect(preview).toContain('onClick={() => edit("schedule")}');
    expect(preview).toContain('onClick={() => edit("salary")}');
    expect(preview).toContain('onClick={() => edit("entitlement")}');
    expect(preview).toContain(
      "Payroll cycles, daily breakdown & schedule history"
    );
  });

  it("prefills each employee's effective duty and complete policy without selecting a future schedule", () => {
    expect(dialog).toContain(
      'const employee = "employee" in edit ? edit.employee : null'
    );
    expect(dialog).toContain(
      ".filter(item => dateKey(item.effectiveFrom) <= today)"
    );
    expect(dialog).toContain(
      "dateKey(b.effectiveFrom).localeCompare(dateKey(a.effectiveFrom))"
    );
    expect(dialog).toContain('schedule?.startTime.slice(0, 5) ?? "09:00"');
    expect(dialog).toContain('schedule?.endTime.slice(0, 5) ?? "17:00"');
    expect(dialog).toContain('schedule?.maternityBreakMode ?? "none"');
    expect(dialog).toContain(
      'schedule?.maternityBreakStart1?.slice(0, 5) ?? ""'
    );
    expect(dialog).toContain(
      'schedule?.maternityBreakStart2?.slice(0, 5) ?? ""'
    );
    expect(dialog).toContain('schedule?.maternityBreakUntil ?? ""');
    expect(dialog).not.toMatch(/useEffect|useLayoutEffect/);
  });

  it("has none/2x30/1x60 controls, conditional start times, and automatic end times", () => {
    for (const mode of ["none", "two_30", "one_60"])
      expect(dialog).toContain(`<option value="${mode}">`);
    expect(dialog).toContain('maternityBreakMode !== "none" &&');
    expect(dialog).toContain('maternityBreakMode === "two_30" &&');
    for (const key of [
      "maternity-mode",
      "break-start-1",
      "break-start-2",
      "break-until",
    ]) {
      expect(dialog).toContain(`htmlFor={\`${"${id}"}-${key}\`}`);
      expect(dialog).toContain(`id={\`${"${id}"}-${key}\`}`);
    }
    expect(dialog).toContain(
      "maternityBreakEnd(maternityBreakStart1, breakDuration)"
    );
    expect(dialog).toContain("maternityBreakEnd(maternityBreakStart2, 30)");
    expect(dialog).toContain("Break end date (inclusive, optional)");
    expect(dialog).toContain("min={effectiveFrom}");
    expect(dialog).toContain("Leave empty for no expiry");
  });

  it("uses shared validation before schedule save and submits all four explicit normalized fields", () => {
    expect(page).toContain(
      'import { validateHrMaternityBreaks } from "@shared/hrMaternityBreaks"'
    );
    expect(save).toContain("if (breakError || breakDateError)");
    expect(save.indexOf("if (breakError || breakDateError)")).toBeLessThan(
      save.indexOf("await saveSchedule.mutateAsync")
    );
    for (const key of [
      "maternityBreakMode",
      "maternityBreakStart1",
      "maternityBreakStart2",
      "maternityBreakUntil",
    ])
      expect(save).toContain(`${key}: breakSettings.${key}`);
    expect(dialog).toContain(
      'maternityBreakMode === "none" ? null : maternityBreakStart1 || null'
    );
    expect(dialog).toContain(
      'maternityBreakMode === "two_30" ? maternityBreakStart2 || null : null'
    );
    expect(dialog).toContain(
      'maternityBreakMode === "none" ? null : maternityBreakUntil || null'
    );
    expect(save).toContain("employeeId: edit.employee.id");
    expect(save).toContain("reason: reason.trim()");
    const mutationCalls = nodes(
      fn(pageFile, "AdminEditDialog"),
      ts.isCallExpression
    ).filter(node =>
      /\.mutate(?:Async)?$/.test(node.expression.getText(pageFile))
    );
    expect(mutationCalls).toHaveLength(5);
    for (const call of mutationCalls) {
      let enclosing: ts.Node | undefined = call.parent;
      while (enclosing && !ts.isFunctionDeclaration(enclosing))
        enclosing = enclosing.parent;
      expect(
        enclosing && ts.isFunctionDeclaration(enclosing) && enclosing.name?.text
      ).toBe("save");
    }
  });

  it("handles full-duration windows, boundaries, overlap, invalid wall-clock times and inclusive expiry", () => {
    expect(helpers.dutyTimeMinutes("24:00")).toBeNull();
    expect(helpers.dutyTimeMinutes("11:60")).toBeNull();
    expect(helpers.maternityBreakEnd("11:00", 30)).toBe("11:30");
    expect(helpers.maternityBreakEnd("16:00", 60)).toBe("17:00");
    expect(helpers.maternityBreakEnd("23:45", 30)).toBe("—");
    expect(helpers.maternityBreakValidation(duty)).toBeNull();
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakStart2: "11:30",
      })
    ).toBeNull();
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakStart2: "11:29",
      })
    ).toMatch(/overlap/);
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakStart1: "08:45",
      })
    ).toMatch(/within/);
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakStart2: "16:45",
      })
    ).toMatch(/within/);
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        endTime: "10:00",
        maternityBreakMode: "one_60",
        maternityBreakStart1: "09:00",
        maternityBreakStart2: null,
      })
    ).toMatch(/positive non-break duty/);
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakMode: "one_60",
        maternityBreakStart1: "16:00",
        maternityBreakStart2: null,
      })
    ).toBeNull();
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakMode: "none",
        maternityBreakStart1: null,
        maternityBreakStart2: null,
      })
    ).toBeNull();
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakUntil: "2026-11-02",
      })
    ).toMatch(/effective date/);
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakUntil: "2026-02-30",
      })
    ).not.toBeNull();
    expect(
      helpers.maternityBreakValidation({
        ...duty,
        maternityBreakUntil: "2026-11-03",
      })
    ).toBeNull();
    const until = { ...duty, maternityBreakUntil: "2026-11-03" };
    expect(helpers.maternityBreakSummary(until, "2026-11-03")).toContain(
      "60 min/day"
    );
    expect(helpers.maternityBreakSummary(until, "2026-11-04")).toContain(
      "expired"
    );
    expect(
      helpers.maternityBreakSummary({
        ...duty,
        startTime: "09:00:00",
        endTime: "17:00:00",
        maternityBreakStart1: "11:00:00",
        maternityBreakStart2: "14:00:00",
      })
    ).toContain("11:00–11:30 (30 min)");
  });

  it("shows today's effective policy, historical windows, and paid versus actual excused minutes in details", () => {
    expect(preview).toContain("maternityBreakSummary(current, today)");
    expect(preview).toContain("maternityBreakSummary(schedule)");
    expect(reports).toContain("Paid break / excused min");
    expect(reports).toContain("day.maternityBreakMinutes ?? 0");
    expect(reports).toContain("day.maternityExcusedMinutes ?? 0");
    expect(flat(reports)).toContain("Full-day absences are not waived");
    expect(dialog).toContain("do not consume annual leave");
    expect(dialog).toContain("do not invent punches");
    expect(dialog).toContain(
      "Only the specified slots are excluded from late / early deductions"
    );
    expect(dialog).toContain("Duty and breaks share the effective date below");
  });

  it("preserves named-admin verification, applied-period export controls, Financial ledger, and audit reason", () => {
    const gate = flat(fn(pageFile, "HrAttendanceDashboard").getText(pageFile));
    expect(gate).toContain("isHrAdministrator(user)");
    expect(gate).toContain("access.data.isHrAdmin === true");
    expect(gate).toContain("!access.isError");
    expect(gate).toContain("verifiedAdministrator ? ( <HrAdmin />");
    expect(admin).toContain("draft.from !== filters.from");
    expect(admin).toContain("draft.to !== filters.to");
    expect(admin).toContain("overview.isFetching");
    expect(admin).toContain("unappliedFilters");
    expect(admin).toContain("from={filters.from}");
    expect(admin).toContain("to={filters.to}");
    expect(dialog).toContain("Financial salary ledger with your reason");
    expect(save).toContain(
      "await saveSalary.mutateAsync({ employeeId: edit.employee.id, salary, effectiveFrom, reason: reason.trim()"
    );
    expect(save).toContain("effectiveFrom < getCairoBusinessDate()");
    expect(dialog).toContain(
      "Previous schedules and salary rates stay in history"
    );
    expect(dialog).toContain("minLength={3}");
    expect(dialog).toContain("disabled={busy || reason.trim().length < 3}");
  });

  it("contains modal layouts within a zero-minimum grid using existing UI styles", () => {
    expect(dialog).toContain(
      "grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-2xl"
    );
    expect(dialog).toContain('className="min-w-0 space-y-4"');
    expect(dialog).toContain(
      "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2"
    );
    expect(dialog).toContain('aria-label="Duty start time (Cairo)"');
    expect(dialog).toContain('aria-label="Duty end time (Cairo)"');
    expect(dialog).toContain(
      'aria-label="Effective from (Cairo business date)"'
    );
    expect(reports).toContain(
      "max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto"
    );
    expect(page + reports).not.toMatch(/<style|document\.head|\.insertRule\(/);
  });
});

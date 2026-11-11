import {
  DOCUMENTATION_MILESTONES,
  type DocumentationMilestoneKey,
  type DocumentationMilestoneReportRow,
} from "@shared/clientDocumentationMilestones";

export const DEFAULT_DOCUMENTATION_MILESTONE = DOCUMENTATION_MILESTONES[0].key;
export const MILESTONE_REPORT_PAGE_SIZE = 20;
export const MILESTONE_REPORT_EXPLANATION =
  "Only the latest reached milestone is shown. Earlier completed steps are excluded.";

export type MilestoneReportFilters = {
  selectedMilestone: DocumentationMilestoneKey;
  search: string;
  consultant: string;
  paralegal: string;
};
export type MilestoneReportSort = {
  column: "clientName" | "clientCode" | "milestoneDate";
  direction: "asc" | "desc";
};

export function isDocumentationMilestoneKey(
  value: string
): value is DocumentationMilestoneKey {
  return DOCUMENTATION_MILESTONES.some(milestone => milestone.key === value);
}

export function documentationMilestoneLabel(
  key: DocumentationMilestoneKey
): string {
  return (
    DOCUMENTATION_MILESTONES.find(milestone => milestone.key === key)?.label ??
    ""
  );
}

/** Consume the server's furthest confirmed workflow step, never historic steps or dates. */
export function filterMilestoneReportRows(
  rows: readonly DocumentationMilestoneReportRow[],
  filters: MilestoneReportFilters
): DocumentationMilestoneReportRow[] {
  if (!isDocumentationMilestoneKey(filters.selectedMilestone)) return [];
  const search = filters.search.trim().toLocaleLowerCase("en");
  return rows.filter(
    row =>
      row.program === "spain" &&
      row.currentMilestone === filters.selectedMilestone &&
      (!filters.consultant || row.consultant === filters.consultant) &&
      (!filters.paralegal || row.paralegal === filters.paralegal) &&
      (!search ||
        [row.clientName, row.clientCode, row.consultant, row.paralegal].some(
          value => (value ?? "").toLocaleLowerCase("en").includes(search)
        ))
  );
}

export function milestoneReportAssignees(
  rows: readonly DocumentationMilestoneReportRow[],
  field: "consultant" | "paralegal"
): string[] {
  return Array.from(
    new Set(
      rows
        .filter(
          row =>
            row.program === "spain" &&
            isDocumentationMilestoneKey(row.currentMilestone)
        )
        .map(row => row[field])
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
    )
  ).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base", numeric: true })
  );
}

export function sortMilestoneReportRows(
  rows: readonly DocumentationMilestoneReportRow[],
  sort: MilestoneReportSort
): DocumentationMilestoneReportRow[] {
  const compareText = (a: string, b: string) =>
    a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
  const dateValue = (value: string) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  };
  return [...rows].sort((a, b) => {
    const comparison =
      sort.column === "milestoneDate"
        ? dateValue(a.milestoneDate) - dateValue(b.milestoneDate)
        : compareText(a[sort.column], b[sort.column]);
    return (
      (sort.direction === "asc" ? comparison : -comparison) ||
      compareText(a.clientName, b.clientName) ||
      compareText(a.clientCode, b.clientCode) ||
      a.id - b.id
    );
  });
}

/** A keyed page avoids even a one-render stale page after a filter or query refresh. */
export function milestoneReportPaginationKey(
  filters: MilestoneReportFilters,
  sort: MilestoneReportSort,
  pageSize: number,
  dataUpdatedAt: number
): string {
  return JSON.stringify([
    filters.selectedMilestone,
    filters.search,
    filters.consultant,
    filters.paralegal,
    sort.column,
    sort.direction,
    pageSize,
    dataUpdatedAt,
  ]);
}

export function paginateMilestoneReportRows(
  rows: readonly DocumentationMilestoneReportRow[],
  requestedPage: number,
  requestedPageSize = MILESTONE_REPORT_PAGE_SIZE
) {
  const pageSize =
    Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.floor(requestedPageSize) || MILESTONE_REPORT_PAGE_SIZE
      : MILESTONE_REPORT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1)
  );
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageCount,
    rows: rows.slice(offset, offset + pageSize),
    start: rows.length ? offset + 1 : 0,
    end: Math.min(offset + pageSize, rows.length),
  };
}

/** Quote every cell and neutralize spreadsheet formulas, including whitespace/control prefixes. */
export function escapeMilestoneCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  const dangerous =
    new RegExp("^[\\s\\p{C}]*[=+\\-@]", "u").test(text) ||
    /^[\t\r\n]/.test(text);
  return `"${(dangerous ? `'${text}` : text).replace(/"/g, '""')}"`;
}

/** Explicit safe-field projection: never serialize/spread entire application objects. */
export function buildMilestoneReportCsv(
  rows: readonly DocumentationMilestoneReportRow[],
  selectedMilestone: DocumentationMilestoneKey,
  generatedAt: string
): string {
  if (!isDocumentationMilestoneKey(selectedMilestone)) {
    throw new Error("Select one valid milestone before exporting.");
  }
  // Fail closed if an accidental caller passes other milestones/programs.
  const selectedRows = filterMilestoneReportRows(rows, {
    selectedMilestone,
    search: "",
    consultant: "",
    paralegal: "",
  });
  const csvRows: unknown[][] = [
    ["ELEVAY — Spain Documentation Milestone Report"],
    ["Selected milestone", documentationMilestoneLabel(selectedMilestone)],
    ["Generated at", generatedAt],
    ["Filtered results", selectedRows.length],
    [MILESTONE_REPORT_EXPLANATION],
    [],
    [
      "Client name",
      "Client code",
      "Program",
      "Current milestone",
      "Milestone date",
      "Consultant",
      "Paralegal",
    ],
    ...selectedRows.map(row => [
      row.clientName,
      row.clientCode,
      "Spain",
      documentationMilestoneLabel(row.currentMilestone),
      row.milestoneDate,
      row.consultant,
      row.paralegal,
    ]),
  ];
  return (
    "\uFEFF" +
    csvRows.map(row => row.map(escapeMilestoneCsvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

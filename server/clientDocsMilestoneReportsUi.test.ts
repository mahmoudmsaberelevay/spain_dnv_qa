import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENTATION_MILESTONES,
  type DocumentationMilestoneKey,
  type DocumentationMilestoneReport,
  type DocumentationMilestoneReportRow,
} from "../shared/clientDocumentationMilestones";
import {
  buildMilestoneReportCsv,
  DEFAULT_DOCUMENTATION_MILESTONE,
  escapeMilestoneCsvCell,
  filterMilestoneReportRows,
  isDocumentationMilestoneKey,
  milestoneReportAssignees,
  milestoneReportPaginationKey,
  MILESTONE_REPORT_EXPLANATION,
  MILESTONE_REPORT_PAGE_SIZE,
  paginateMilestoneReportRows,
  sortMilestoneReportRows,
  type MilestoneReportFilters,
} from "../client/src/lib/clientDocsMilestonesCsv";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: { documentationMilestoneReports: { report: { useQuery: queryMock } } },
}));
vi.mock("../client/src/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("main", { "data-testid": "dashboard-shell" }, children),
}));
vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { ...props, href }, children),
}));
import ClientDocsMilestoneReports, {
  MilestoneReportsWorkspace,
  type MilestoneReportsWorkspaceProps,
} from "../client/src/pages/ClientDocsMilestoneReports";

const pageSource = readFileSync(
  new URL(
    "../client/src/pages/ClientDocsMilestoneReports.tsx",
    import.meta.url
  ),
  "utf8"
);
const helperSource = readFileSync(
  new URL("../client/src/lib/clientDocsMilestonesCsv.ts", import.meta.url),
  "utf8"
);
const EXPECTED_MILESTONES = [
  [
    "appointment_booking_submitted",
    "Appointment Booking Confirmation Received",
  ],
  ["embassy_reply_confirmed", "Embassy Reply Confirmed"],
  ["translator_submitted", "Submitted to Spanish Sworn Translator"],
  ["travel_booked", "Travel to Spain"],
  ["arrival_confirmed", "Arrival Confirmed"],
  ["biometrics_appointment", "Biometrics Appointment"],
  ["biometrics_completed", "Biometrics Completed"],
  ["bank_account_completed", "Bank Account Completed"],
  ["residency_card_ready", "Residency Card Ready for Collection"],
];
const row = (
  id: number,
  overrides: Partial<DocumentationMilestoneReportRow> = {}
): DocumentationMilestoneReportRow => ({
  id,
  clientName: `English Client ${id}`,
  clientCode: `SP-${id}`,
  program: "spain",
  consultant: "Consultant A",
  paralegal: "Paralegal A",
  currentMilestone: DEFAULT_DOCUMENTATION_MILESTONE,
  milestoneDate: "2026-11-01",
  ...overrides,
});
const filters = (
  overrides: Partial<MilestoneReportFilters> = {}
): MilestoneReportFilters => ({
  selectedMilestone: DEFAULT_DOCUMENTATION_MILESTONE,
  search: "",
  consultant: "",
  paralegal: "",
  ...overrides,
});
const makeReport = (
  rows: DocumentationMilestoneReportRow[] = [row(1)]
): DocumentationMilestoneReport => ({
  rows,
  counts: Object.fromEntries(
    DOCUMENTATION_MILESTONES.map(milestone => [
      milestone.key,
      rows.filter(item => item.currentMilestone === milestone.key).length,
    ])
  ) as DocumentationMilestoneReport["counts"],
  totalSpainApplications: rows.length + 5,
  withoutMilestone: 3,
  beyondMilestones: 2,
  generatedAt: "2026-11-11T09:00:00.000Z",
});
function renderWorkspace(
  overrides: Partial<MilestoneReportsWorkspaceProps> = {}
) {
  return renderToStaticMarkup(
    React.createElement(MilestoneReportsWorkspace, {
      report: makeReport(),
      isLoading: false,
      isError: false,
      isFetching: false,
      dataUpdatedAt: 100,
      onRefresh: vi.fn(),
      ...overrides,
    })
  );
}
function selectMarkup(html: string, id: string) {
  return (
    html.match(
      new RegExp(`<select[^>]*id="${id}"[\\s\\S]*?<\\/select>`)
    )?.[0] ?? ""
  );
}
function buttonMarkup(html: string, label: string) {
  return (
    [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
      .map(match => match[0])
      .find(button => button.includes(label)) ?? ""
  );
}
// Minimal RFC-4180 parser to assert actual exported field values, including newlines/quotes.
function parseCsv(csv: string): string[][] {
  const result: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      record.push(field);
      field = "";
    } else if (char === "\r" && text[i + 1] === "\n" && !quoted) {
      record.push(field);
      result.push(record);
      record = [];
      field = "";
      i++;
    } else field += char;
  }
  return result;
}

beforeEach(() => queryMock.mockReset());

describe("Client Documentation milestone report shared contract and exact selection", () => {
  it("uses exactly the nine user-required keys and labels in workflow order", () => {
    expect(
      DOCUMENTATION_MILESTONES.map(item => [item.key, item.label])
    ).toEqual(EXPECTED_MILESTONES);
    expect(DEFAULT_DOCUMENTATION_MILESTONE).toBe(
      "appointment_booking_submitted"
    );
  });

  it("renders one required milestone select with all nine exact labels and current counts, with no all option", () => {
    const rows = DOCUMENTATION_MILESTONES.flatMap((milestone, index) =>
      Array.from({ length: index + 1 }, (_, i) =>
        row(index * 10 + i, { currentMilestone: milestone.key })
      )
    );
    const html = renderWorkspace({ report: makeReport(rows) });
    const select = selectMarkup(html, "report-milestone");
    expect(select).toContain('required=""');
    expect(select.match(/<option\b/g)).toHaveLength(9);
    EXPECTED_MILESTONES.forEach(([key, label], index) => {
      expect(select).toContain(`value="${key}"`);
      expect(select).toContain(`${label} (${index + 1})`);
    });
    expect(select).toContain(
      'value="appointment_booking_submitted" selected=""'
    );
    expect(select).not.toMatch(/value="(?:all|)"/);
  });

  it("filters every switch by exact current milestone without leaking historic earlier completions", () => {
    const rows = DOCUMENTATION_MILESTONES.map((milestone, index) => ({
      ...row(index + 1, { currentMilestone: milestone.key }),
      // Synthetic history deliberately has the newest date at an earlier step.
      appointmentBookingSubmittedAt: "2026-12-01",
      embassyReplyConfirmedAt: "2026-01-01",
    }));
    for (const milestone of DOCUMENTATION_MILESTONES) {
      expect(
        filterMilestoneReportRows(
          rows,
          filters({ selectedMilestone: milestone.key })
        ).map(item => item.id)
      ).toEqual([DOCUMENTATION_MILESTONES.indexOf(milestone) + 1]);
    }
    expect(helperSource).toContain(
      "row.currentMilestone === filters.selectedMilestone"
    );
    expect(pageSource).not.toMatch(
      /appointmentBookingSubmittedAt|embassyReplyConfirmedAt|\.field\b/
    );
  });

  it("fails closed for invalid, blank, and all selections", () => {
    for (const selectedMilestone of [
      "",
      "all",
      "unknown",
    ] as DocumentationMilestoneKey[]) {
      expect(isDocumentationMilestoneKey(selectedMilestone)).toBe(false);
      expect(
        filterMilestoneReportRows([row(1)], filters({ selectedMilestone }))
      ).toEqual([]);
      expect(() =>
        buildMilestoneReportCsv([row(1)], selectedMilestone, "2026-11-11")
      ).toThrow("Select one valid milestone");
    }
  });

  it("explains furthest workflow progress rather than newest date", () => {
    const html = renderWorkspace();
    expect(html).toContain(MILESTONE_REPORT_EXPLANATION);
    expect(html).toContain(
      "furthest confirmed step in the workflow, not the newest date"
    );
  });

  it("searches only name, code, consultant, and paralegal, case-insensitively", () => {
    const rows = [
      row(1, {
        clientName: "Ahmed English",
        clientCode: "DNV-432",
        consultant: "Ziad",
        paralegal: "Marwa",
      }),
    ];
    for (const search of ["  AHMED  ", "dnv-432", "ZIAD", "marwa"]) {
      expect(filterMilestoneReportRows(rows, filters({ search }))).toHaveLength(
        1
      );
    }
    expect(
      filterMilestoneReportRows(
        [
          {
            ...rows[0],
            email: "secret@example.com",
          } as DocumentationMilestoneReportRow,
        ],
        filters({ search: "secret@example.com" })
      )
    ).toEqual([]);
    expect(
      filterMilestoneReportRows(
        [row(2, { consultant: null, paralegal: null })],
        filters({ search: "no-match" })
      )
    ).toEqual([]);
  });

  it("combines team selectors and search, keeping the required milestone constraint", () => {
    const rows = [
      row(1),
      row(2, { consultant: "B" }),
      row(3, { paralegal: "B" }),
      row(4, { currentMilestone: "embassy_reply_confirmed" }),
    ];
    expect(
      filterMilestoneReportRows(
        rows,
        filters({
          consultant: "Consultant A",
          paralegal: "Paralegal A",
          search: "English",
        })
      ).map(item => item.id)
    ).toEqual([1]);
  });

  it("derives unique safe team options from report rows, never employee/provider lookups", () => {
    const rows = [
      row(1),
      row(2),
      row(3, { consultant: null }),
      row(4, { consultant: "B" }),
      row(5, { consultant: " " }),
      row(6, { program: "greece" as "spain", consultant: "Hidden" }),
    ];
    expect(milestoneReportAssignees(rows, "consultant")).toEqual([
      "B",
      "Consultant A",
    ]);
    expect(milestoneReportAssignees(rows, "paralegal")).toEqual([
      "Paralegal A",
    ]);
    expect(
      filterMilestoneReportRows(rows, filters()).map(item => item.id)
    ).not.toContain(6);
  });
});

describe("Milestone report read-only UI and query state", () => {
  it("calls only the protected report namespace and uses just DashboardLayout", () => {
    queryMock.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      isError: false,
      isFetching: false,
      dataUpdatedAt: 100,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(
      React.createElement(ClientDocsMilestoneReports)
    );
    expect(queryMock).toHaveBeenCalledWith(undefined, {
      staleTime: 0,
      refetchOnMount: "always",
    });
    expect(html).toContain('data-testid="dashboard-shell"');
    expect(pageSource.match(/trpc\./g)).toHaveLength(1);
    expect(pageSource).toContain(
      "trpc.documentationMilestoneReports.report.useQuery"
    );
    expect(pageSource).not.toMatch(
      /MobileLayout|MobileRoute|useMutation|\.mutate\b|\.create\b|\.update\b|\.delete\b|\bfetch\(/
    );
  });

  it("renders stored English name, workflow date, assignees, application link, and refresh metadata", () => {
    const html = renderWorkspace({
      report: makeReport([
        row(73, { clientName: "Ahmed & Omar", milestoneDate: "2026-11-01" }),
      ]),
    });
    expect(html).toContain("Milestone Reports");
    expect(html).toContain("Search clients");
    expect(html).toContain('lang="en">Ahmed &amp; Omar');
    expect(html).toContain('href="/docs/clients/73"');
    expect(html).toContain("View Application");
    expect(html).toMatch(/dateTime="2026-11-01"/i);
    expect(html).toMatch(/dateTime="2026-11-11T09:00:00.000Z"/i);
    expect(html).toContain("2 collected / beyond these milestones");
    expect(html).toContain("No confirmed report milestone");
    expect(pageSource).not.toMatch(
      /clientMobile|phone|email|passport|driveLink|documentLink|internalTeamComment/i
    );
  });

  it("has accessible sortable columns, resize affordances, and a contained sticky scrolling table", () => {
    const html = renderWorkspace();
    expect(html).toContain('aria-sort="ascending"');
    for (const label of ["client name", "client code", "milestone date"])
      expect(html).toContain(`aria-label="Sort by ${label}"`);
    expect(html).toContain("resize:horizontal");
    expect(html).toContain("overflow-auto");
    expect(html).toContain("sticky top-0");
    expect(html).toContain(
      'aria-label="Milestone applications table; scroll horizontally for all columns"'
    );
    expect(html).toContain('aria-label="Next page"');
  });

  it("hides stale results and counts after a refetch error and offers Retry", () => {
    const html = renderWorkspace({
      report: makeReport([row(9, { clientName: "Stale Private Name" })]),
      isError: true,
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Unable to load milestone report");
    expect(html).toContain("No cached results are shown");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Stale Private Name");
    expect(html).not.toContain("<table");
    expect(buttonMarkup(html, "Export CSV")).toContain('disabled=""');
    expect(selectMarkup(html, "report-consultant")).not.toContain(
      "Consultant A"
    );
  });

  it("shows loading and empty states and disables exports in each", () => {
    const loading = renderWorkspace({ isLoading: true });
    expect(loading).toContain("Loading milestone report");
    expect(loading).not.toContain("English Client 1");
    expect(buttonMarkup(loading, "Export CSV")).toContain('disabled=""');
    const empty = renderWorkspace({ report: makeReport([]) });
    expect(empty).toContain("No matching applications");
    expect(empty).toContain("No application is currently at this milestone");
    expect(buttonMarkup(empty, "Export CSV")).toContain('disabled=""');
  });

  it("allows successful exports but disables them during a background refresh", () => {
    expect(buttonMarkup(renderWorkspace(), "Export CSV")).not.toContain(
      'disabled=""'
    );
    const refreshing = renderWorkspace({ isFetching: true });
    expect(buttonMarkup(refreshing, "Export CSV")).toContain('disabled=""');
    expect(buttonMarkup(refreshing, "Refreshing")).toContain('disabled=""');
  });

  it("clear filters retains the required milestone and resets pagination", () => {
    const clear =
      pageSource.match(/function clearFilters\(\) \{([\s\S]*?)\n  \}/)?.[1] ??
      "";
    expect(clear).toContain('setSearch("")');
    expect(clear).toContain('setConsultant("")');
    expect(clear).toContain('setParalegal("")');
    expect(clear).toContain('setPagination({ key: "", page: 1 })');
    expect(clear).not.toContain("setSelectedMilestone");
  });
});

describe("Milestone sorting and pagination", () => {
  it("sorts name and code naturally and milestone date chronologically without mutating input", () => {
    const rows = [
      row(1, {
        clientName: "Zed",
        clientCode: "SP-10",
        milestoneDate: "2026-11-02",
      }),
      row(2, {
        clientName: "Ahmed",
        clientCode: "SP-2",
        milestoneDate: "2026-11-01",
      }),
    ];
    for (const column of [
      "clientName",
      "clientCode",
      "milestoneDate",
    ] as const) {
      expect(
        sortMilestoneReportRows(rows, { column, direction: "asc" }).map(
          item => item.id
        )
      ).toEqual([2, 1]);
      expect(
        sortMilestoneReportRows(rows, { column, direction: "desc" }).map(
          item => item.id
        )
      ).toEqual([1, 2]);
    }
    expect(rows.map(item => item.id)).toEqual([1, 2]);
  });

  it("shows only 20 rows by default while preserving all filtered rows for CSV", () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(i + 1));
    expect(MILESTONE_REPORT_PAGE_SIZE).toBe(20);
    const page = paginateMilestoneReportRows(rows, 1);
    expect(page).toMatchObject({ page: 1, pageCount: 3, start: 1, end: 20 });
    expect(page.rows).toHaveLength(20);
    const html = renderWorkspace({ report: makeReport(rows) });
    expect(html.match(/href="\/docs\/clients\//g)).toHaveLength(20);
    expect(html).toContain("Showing 1–20 of 45");
    expect(html).toContain("Page 1 of 3");
    expect(
      parseCsv(
        buildMilestoneReportCsv(
          rows,
          DEFAULT_DOCUMENTATION_MILESTONE,
          "2026-11-11"
        )
      ).slice(7)
    ).toHaveLength(45);
    expect(pageSource).toMatch(
      /buildMilestoneReportCsv\(\s*filteredRows,\s*selectedMilestone,\s*safeReport\.generatedAt\s*,?\s*\)/
    );
    expect(pageSource).not.toContain("buildMilestoneReportCsv(page.rows");
  });

  it("clamps pages after shrinking results and handles empty or invalid pagination safely", () => {
    expect(paginateMilestoneReportRows([row(1)], 99)).toMatchObject({
      page: 1,
      pageCount: 1,
      start: 1,
      end: 1,
    });
    expect(paginateMilestoneReportRows([], 99)).toMatchObject({
      page: 1,
      pageCount: 1,
      rows: [],
      start: 0,
      end: 0,
    });
    expect(paginateMilestoneReportRows([row(1)], NaN, 0).rows).toHaveLength(1);
    expect(
      paginateMilestoneReportRows(
        Array.from({ length: 45 }, (_, i) => row(i + 1)),
        3
      ).rows
    ).toHaveLength(5);
  });

  it("resets keyed pagination on selection, all filters, sorting, page size, and refetch", () => {
    const sort = { column: "clientName", direction: "asc" } as const;
    const original = milestoneReportPaginationKey(filters(), sort, 20, 100);
    for (const changed of [
      filters({ selectedMilestone: "embassy_reply_confirmed" }),
      filters({ search: "Ahmed" }),
      filters({ consultant: "B" }),
      filters({ paralegal: "B" }),
    ])
      expect(milestoneReportPaginationKey(changed, sort, 20, 100)).not.toBe(
        original
      );
    expect(
      milestoneReportPaginationKey(
        filters(),
        { column: "clientCode", direction: "desc" },
        20,
        100
      )
    ).not.toBe(original);
    expect(milestoneReportPaginationKey(filters(), sort, 50, 100)).not.toBe(
      original
    );
    expect(milestoneReportPaginationKey(filters(), sort, 20, 101)).not.toBe(
      original
    );
    expect(pageSource).toContain(
      "pagination.key === paginationKey ? pagination.page : 1"
    );
    expect(pageSource).toMatch(
      /milestoneReportPaginationKey\(\s*filters,\s*sort,\s*pageSize,\s*dataUpdatedAt\s*,?\s*\)/
    );
  });
});

describe("Milestone CSV safety and privacy", () => {
  it.each([
    "=1+1",
    "+SUM(A1)",
    "-1+2",
    "@SUM(A1)",
    "  =1+1",
    "\t=1",
    "\r+1",
    "\n@1",
    "\u0000=1",
    "\u200B=1",
  ])("neutralizes formula/control-prefixed cell %j", value => {
    expect(escapeMilestoneCsvCell(value)).toBe(`"'${value}"`);
  });

  it("round-trips commas, quotes, line breaks, nulls, and multilingual UTF-8 text with BOM", () => {
    const csv = buildMilestoneReportCsv(
      [row(1, { clientName: 'Ahmed, "English"\nأحمد', consultant: null })],
      DEFAULT_DOCUMENTATION_MILESTONE,
      "2026-11-11T09:00:00Z"
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(parseCsv(csv)[7]).toEqual([
      'Ahmed, "English"\nأحمد',
      "SP-1",
      "Spain",
      EXPECTED_MILESTONES[0][1],
      "2026-11-01",
      "",
      "Paralegal A",
    ]);
  });

  it("includes selection and server generation time metadata and exactly the safe table fields", () => {
    const unsafeRow = {
      ...row(1, {
        clientName: "=DANGEROUS()",
        clientCode: "+FORMULA",
        consultant: "@TEAM",
        paralegal: "-TEAM",
      }),
      email: "private@example.com",
      phone: "private-phone",
      documentUrl: "private-drive-link",
      internalTeamComment: "private-note",
    };
    const records = parseCsv(
      buildMilestoneReportCsv(
        [unsafeRow],
        DEFAULT_DOCUMENTATION_MILESTONE,
        "2026-11-11T09:00:00Z"
      )
    );
    expect(records[1]).toEqual([
      "Selected milestone",
      EXPECTED_MILESTONES[0][1],
    ]);
    expect(records[2]).toEqual(["Generated at", "2026-11-11T09:00:00Z"]);
    expect(records[6]).toEqual([
      "Client name",
      "Client code",
      "Program",
      "Current milestone",
      "Milestone date",
      "Consultant",
      "Paralegal",
    ]);
    expect(records[7]).toEqual([
      "'=DANGEROUS()",
      "'+FORMULA",
      "Spain",
      EXPECTED_MILESTONES[0][1],
      "2026-11-01",
      "'@TEAM",
      "'-TEAM",
    ]);
    expect(JSON.stringify(records)).not.toMatch(/private-|private@example/);
    expect(helperSource).not.toMatch(
      /Object\.values\(row\)|JSON\.stringify\(row\)|\.\.\.row\b/
    );
  });

  it("fails closed if another current milestone or non-Spain row accidentally reaches export", () => {
    const records = parseCsv(
      buildMilestoneReportCsv(
        [
          row(1),
          row(2, { currentMilestone: "embassy_reply_confirmed" }),
          row(3, { program: "greece" as "spain" }),
        ],
        DEFAULT_DOCUMENTATION_MILESTONE,
        "2026-11-11"
      )
    );
    expect(records[3]).toEqual(["Filtered results", "1"]);
    expect(records.slice(7)).toHaveLength(1);
    expect(records[7][0]).toBe("English Client 1");
  });
});

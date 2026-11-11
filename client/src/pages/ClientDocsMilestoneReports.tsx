import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderCheck,
  ListFilter,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  DOCUMENTATION_MILESTONES,
  type DocumentationMilestoneKey,
  type DocumentationMilestoneReport,
} from "@shared/clientDocumentationMilestones";
import {
  buildMilestoneReportCsv,
  DEFAULT_DOCUMENTATION_MILESTONE,
  documentationMilestoneLabel,
  filterMilestoneReportRows,
  isDocumentationMilestoneKey,
  milestoneReportAssignees,
  milestoneReportPaginationKey,
  MILESTONE_REPORT_EXPLANATION,
  MILESTONE_REPORT_PAGE_SIZE,
  paginateMilestoneReportRows,
  sortMilestoneReportRows,
  type MilestoneReportSort,
} from "@/lib/clientDocsMilestonesCsv";

const SELECT_CLASS =
  "elevay-control-surface h-10 w-full min-w-0 max-w-full rounded-lg border bg-background text-foreground px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const EMPTY_ROWS: DocumentationMilestoneReport["rows"] = [];

function displayMilestoneDate(value: string) {
  // Workflow dates are calendar dates, not midnight UTC instants.
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = calendarDate
    ? new Date(
        Number(calendarDate[1]),
        Number(calendarDate[2]) - 1,
        Number(calendarDate[3])
      )
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function displayRefreshTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

export type MilestoneReportsWorkspaceProps = {
  report?: DocumentationMilestoneReport;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  onRefresh: () => void;
};

/** Separate read-only workspace also allows synthetic tests without provider/database access. */
export function MilestoneReportsWorkspace({
  report,
  isLoading,
  isError,
  isFetching,
  dataUpdatedAt,
  onRefresh,
}: MilestoneReportsWorkspaceProps) {
  const [selectedMilestone, setSelectedMilestone] =
    useState<DocumentationMilestoneKey>(DEFAULT_DOCUMENTATION_MILESTONE);
  const [search, setSearch] = useState("");
  const [consultant, setConsultant] = useState("");
  const [paralegal, setParalegal] = useState("");
  const [sort, setSort] = useState<MilestoneReportSort>({
    column: "clientName",
    direction: "asc",
  });
  const [pageSize, setPageSize] = useState(MILESTONE_REPORT_PAGE_SIZE);
  const [pagination, setPagination] = useState({ key: "", page: 1 });

  // A failed refetch can retain cached query data: do not render or export those stale rows.
  const safeReport = !isError && !isLoading ? report : undefined;
  const safeRows = safeReport?.rows ?? EMPTY_ROWS;
  const consultants = useMemo(
    () => milestoneReportAssignees(safeRows, "consultant"),
    [safeRows]
  );
  const paralegals = useMemo(
    () => milestoneReportAssignees(safeRows, "paralegal"),
    [safeRows]
  );
  useEffect(() => {
    if (!safeReport) return;
    if (consultant && !consultants.includes(consultant)) setConsultant("");
    if (paralegal && !paralegals.includes(paralegal)) setParalegal("");
  }, [safeReport, consultant, paralegal, consultants, paralegals]);

  const filters = useMemo(
    () => ({ selectedMilestone, search, consultant, paralegal }),
    [selectedMilestone, search, consultant, paralegal]
  );
  const filteredRows = useMemo(
    () =>
      sortMilestoneReportRows(
        filterMilestoneReportRows(safeRows, filters),
        sort
      ),
    [safeRows, filters, sort]
  );
  const paginationKey = milestoneReportPaginationKey(
    filters,
    sort,
    pageSize,
    dataUpdatedAt
  );
  const currentPage = pagination.key === paginationKey ? pagination.page : 1;
  const page = paginateMilestoneReportRows(filteredRows, currentPage, pageSize);
  const selectedLabel = documentationMilestoneLabel(selectedMilestone);
  const hasFilters = Boolean(search || consultant || paralegal);
  const canExport = Boolean(safeReport && !isFetching && filteredRows.length);

  function clearFilters() {
    setSearch("");
    setConsultant("");
    setParalegal("");
    setPagination({ key: "", page: 1 });
    // Required milestone selection is deliberately retained.
  }

  function changeSort(column: MilestoneReportSort["column"]) {
    setSort(previous => ({
      column,
      direction:
        previous.column === column && previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  }

  function exportCsv() {
    if (!canExport || !safeReport) return;
    const csv = buildMilestoneReportCsv(
      filteredRows,
      selectedMilestone,
      safeReport.generatedAt
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `elevay-spain-${selectedMilestone}-${safeReport.generatedAt.slice(0, 10).replace(/[^0-9-]/g, "")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sortableHeading(
    column: MilestoneReportSort["column"],
    label: string,
    width: number
  ) {
    const active = sort.column === column;
    const SortIcon = active
      ? sort.direction === "asc"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown;
    return (
      <th
        scope="col"
        aria-sort={
          active
            ? sort.direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
        className="sticky top-0 z-10 border-b bg-background px-3 py-2 text-left align-middle"
      >
        <div
          style={{
            width,
            minWidth: 120,
            resize: "horizontal",
            overflow: "auto",
          }}
          title="Drag the lower-right corner to resize this column"
        >
          <button
            type="button"
            onClick={() => changeSort(column)}
            className="flex min-h-8 w-full items-center gap-2 rounded px-1 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Sort by ${label.toLowerCase()}`}
          >
            {label}
            <SortIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      </th>
    );
  }

  return (
    <section
      className="min-w-0 space-y-4 text-foreground"
      aria-labelledby="milestone-report-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Client Documentation / Spain
          </p>
          <h1
            id="milestone-report-title"
            className="text-2xl font-bold tracking-tight md:text-3xl"
          >
            Milestone Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A read-only view of where each application stands.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-4 w-4 ${isFetching ? "motion-safe:animate-spin" : ""}`}
            />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={exportCsv}
            disabled={!canExport}
            title="Export all filtered results, not just this page"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-2 sm:gap-3"
        aria-label="Report overview"
      >
        {[
          {
            label: "Selected matches",
            value: safeReport ? filteredRows.length : "—",
            detail: "After search and team filters",
            icon: ListFilter,
            tone: "metric-icon--primary",
          },
          {
            label: "Total Spain applications",
            value: safeReport?.totalSpainApplications ?? "—",
            detail: "All Spain applications in scope",
            icon: Users,
            tone: "metric-icon--info",
          },
          {
            label: "Not yet recorded",
            value: safeReport?.withoutMilestone ?? "—",
            detail: "No confirmed report milestone",
            icon: FolderCheck,
            tone: "metric-icon--muted",
          },
        ].map(metric => (
          <Card key={metric.label} className="gap-0 py-3">
            <CardContent className="flex items-center gap-3 px-2.5 sm:px-4">
              <div
                className={`metric-icon ${metric.tone} hidden h-10 w-10 shrink-0 items-center justify-center md:flex`}
              >
                <metric.icon aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                  {metric.label}
                </p>
                <p className="text-2xl font-semibold leading-tight tabular-nums">
                  {typeof metric.value === "number"
                    ? metric.value.toLocaleString()
                    : metric.value}
                </p>
                <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                  {metric.detail}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="space-y-3 p-4">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="report-milestone">
                Current milestone{" "}
                <span className="font-normal text-muted-foreground">
                  (required)
                </span>
              </Label>
              <select
                id="report-milestone"
                required
                aria-label="Current milestone"
                value={selectedMilestone}
                onChange={event => {
                  if (isDocumentationMilestoneKey(event.target.value))
                    setSelectedMilestone(event.target.value);
                }}
                className={SELECT_CLASS}
                aria-describedby="milestone-selection-explanation"
              >
                {DOCUMENTATION_MILESTONES.map(milestone => (
                  <option key={milestone.key} value={milestone.key}>
                    {milestone.label} (
                    {safeReport ? safeReport.counts[milestone.key] : "—"})
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="report-search">Search clients</Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                />
                <Input
                  id="report-search"
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Name, code, consultant or paralegal"
                  className="h-10 pl-9"
                />
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="report-consultant">Consultant</Label>
              <select
                id="report-consultant"
                value={consultant}
                onChange={event => setConsultant(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Any consultant</option>
                {consultants.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="report-paralegal">Paralegal</Label>
              <select
                id="report-paralegal"
                value={paralegal}
                onChange={event => setParalegal(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Any paralegal</option>
                {paralegals.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={clearFilters}
              disabled={!hasFilters}
            >
              Clear filters
            </Button>
          </div>
          <div
            id="milestone-selection-explanation"
            className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs leading-relaxed"
          >
            <p className="font-medium">{MILESTONE_REPORT_EXPLANATION}</p>
            <p className="text-muted-foreground">
              Current means the furthest confirmed step in the workflow, not the
              newest date. Counts show current milestones before search and team
              filters.
            </p>
          </div>
        </CardContent>
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 px-4 py-2.5">
          <h2 className="min-w-0 text-sm font-semibold">{selectedLabel}</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {safeReport
              ? `${filteredRows.length.toLocaleString()} matching applications`
              : "Report unavailable"}
          </p>
        </div>

        {isError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 px-4 py-10 text-center"
          >
            <AlertCircle
              aria-hidden="true"
              className="h-7 w-7 text-destructive"
            />
            <h3 className="font-semibold">Unable to load milestone report</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              No cached results are shown. Please retry to load an up-to-date
              report.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isFetching}
            >
              Retry
            </Button>
          </div>
        ) : isLoading || !safeReport ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"
          >
            <Loader2
              aria-hidden="true"
              className="h-5 w-5 motion-safe:animate-spin"
            />
            Loading milestone report…
          </div>
        ) : filteredRows.length === 0 ? (
          <div role="status" className="space-y-2 px-4 py-10 text-center">
            <FolderCheck
              aria-hidden="true"
              className="mx-auto h-8 w-8 text-muted-foreground"
            />
            <h3 className="font-semibold">No matching applications</h3>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "Try a different search or clear the team filters. The selected milestone will stay selected."
                : "No application is currently at this milestone. Select another milestone to explore."}
            </p>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div
            className="max-h-[min(52vh,560px)] min-w-0 overflow-auto overscroll-contain"
            tabIndex={0}
            role="region"
            aria-label="Milestone applications table; scroll horizontally for all columns"
          >
            <table className="elevay-data-table w-full min-w-[1120px] text-sm">
              <caption className="sr-only">
                Spain applications currently at {selectedLabel}.{" "}
                {MILESTONE_REPORT_EXPLANATION}
              </caption>
              <thead>
                <tr>
                  {sortableHeading("clientName", "Client name", 190)}
                  {sortableHeading("clientCode", "Client code", 125)}
                  <th
                    scope="col"
                    className="sticky top-0 z-10 min-w-[240px] border-b bg-background px-3 py-3 text-left"
                  >
                    Current milestone
                  </th>
                  {sortableHeading("milestoneDate", "Milestone date", 145)}
                  <th
                    scope="col"
                    className="sticky top-0 z-10 min-w-[120px] border-b bg-background px-3 py-3 text-left"
                  >
                    Consultant
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 min-w-[120px] border-b bg-background px-3 py-3 text-left"
                  >
                    Paralegal
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 border-b bg-background px-3 py-3 text-right"
                  >
                    Application
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map(row => (
                  <tr key={row.id} className="border-b border-border/40">
                    <td
                      className="border-b border-border/40 px-3 py-2.5 font-medium"
                      lang="en"
                    >
                      {row.clientName}
                    </td>
                    <td className="border-b border-border/40 px-3 py-2.5 tabular-nums">
                      {row.clientCode || "—"}
                    </td>
                    <td className="border-b border-border/40 px-3 py-2.5">
                      <span className="inline-block rounded-md bg-primary/8 px-2 py-1 text-xs leading-snug text-foreground">
                        {documentationMilestoneLabel(row.currentMilestone)}
                      </span>
                    </td>
                    <td className="border-b border-border/40 px-3 py-2.5 whitespace-nowrap">
                      <time dateTime={row.milestoneDate}>
                        {displayMilestoneDate(row.milestoneDate)}
                      </time>
                    </td>
                    <td className="border-b border-border/40 px-3 py-2.5">
                      {row.consultant || "—"}
                    </td>
                    <td className="border-b border-border/40 px-3 py-2.5">
                      {row.paralegal || "—"}
                    </td>
                    <td className="border-b border-border/40 px-3 py-2.5 text-right">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 whitespace-nowrap"
                      >
                        <Link
                          href={`/docs/clients/${row.id}`}
                          aria-label={`View Application for ${row.clientName}`}
                        >
                          View Application
                          <ExternalLink
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span aria-live="polite">
              {safeReport
                ? `Showing ${page.start}–${page.end} of ${filteredRows.length.toLocaleString()}`
                : "Showing 0 results"}
            </span>
            <div className="flex items-center gap-2">
              <Label htmlFor="report-page-size" className="text-xs">
                Rows per page
              </Label>
              <select
                id="report-page-size"
                value={pageSize}
                onChange={event => setPageSize(Number(event.target.value))}
                className={`${SELECT_CLASS} h-8 w-16 px-2 text-xs`}
              >
                {[20, 50, 100].map(size => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <nav
            className="flex items-center gap-2"
            aria-label="Report pagination"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={!safeReport || page.page <= 1}
              onClick={() =>
                setPagination({ key: paginationKey, page: page.page - 1 })
              }
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums">
              Page {page.page} of {page.pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={!safeReport || page.page >= page.pageCount}
              onClick={() =>
                setPagination({ key: paginationKey, page: page.page + 1 })
              }
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </Card>

      <footer className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:justify-between">
        <p>
          {safeReport
            ? `${safeReport.beyondMilestones.toLocaleString()} collected / beyond these milestones — excluded from the nine milestone groups.`
            : "Collected / beyond-workflow applications are excluded from the milestone groups."}
        </p>
        <p>
          Last refresh:{" "}
          {safeReport ? (
            <time dateTime={safeReport.generatedAt}>
              {displayRefreshTime(safeReport.generatedAt)}
            </time>
          ) : (
            "Unavailable"
          )}
        </p>
      </footer>
    </section>
  );
}

export default function ClientDocsMilestoneReports() {
  const query = trpc.documentationMilestoneReports.report.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
  });
  return (
    <DashboardLayout>
      <MilestoneReportsWorkspace
        report={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        isFetching={query.isFetching}
        dataUpdatedAt={query.dataUpdatedAt}
        onRefresh={() => {
          void query.refetch();
        }}
      />
    </DashboardLayout>
  );
}

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  FileDown,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  attendanceReportDisplayName,
  HR_ATTENDANCE_STATUS_LABELS,
} from "@shared/hrAttendanceReport";
import type { HrAttendanceTiming } from "@shared/hrAttendanceTiming";
import type { buildHrVacationReport } from "@shared/hrVacationReport";

type VacationReport = ReturnType<typeof buildHrVacationReport>;
type AttendanceEmployee = {
  id: number;
  name: string;
  timing?: HrAttendanceTiming;
  payroll: {
    workingDays: number;
    evaluatedDays: number;
    lateMinutes: number;
    earlyMinutes: number;
    absentDays: number;
    incompleteDays: number;
    totalLostMinutes: number;
    lostHours: number;
    equivalentDays: number;
    totalDeduction: number;
    coveredBaseSalary: number;
    netSalary: number;
    days: {
      date: string;
      status: string;
      lateMinutes: number;
      earlyMinutes: number;
      missingMinutes: number;
    }[];
  };
};
type Props = {
  employees: AttendanceEmployee[];
  vacation: VacationReport | null;
  vacationError: string | null;
  from: string;
  to: string;
  year: number;
  issuer: string;
  search: string;
  onSearch: (value: string) => void;
  exportDisabled: boolean;
  exporting: boolean;
  onAttendancePdf: (ids: number[]) => void;
  onVacationPdf: (ids: number[]) => void;
};
const n = (value: number | null | undefined, places = 2) =>
  value == null
    ? "—"
    : value.toLocaleString("en-GB", { maximumFractionDigits: places });
const egp = (value: number) =>
  `${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
function stamp(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        timeZone: "Africa/Cairo",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    : "—";
}
function Column({
  children,
  width = 130,
}: {
  children: ReactNode;
  width?: number;
}) {
  return (
    <TableHead scope="col">
      <div
        className="resize-x overflow-auto whitespace-normal py-2 leading-5"
        style={{ width, minWidth: 80, maxWidth: 400 }}
      >
        {children}
      </div>
    </TableHead>
  );
}
function SmallMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/25 p-3">
      <dt className="text-xs text-muted-foreground">{title}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Read-only workspace. Export callbacks receive the entire filtered selection, not just the page. */
export default function HrAdminReports(props: Props) {
  const [tab, setTab] = useState("attendance");
  const [sort, setSort] = useState("name");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [detail, setDetail] = useState<{
    id: number;
    kind: "attendance" | "vacation";
  } | null>(null);
  const query = props.search.trim().toLowerCase();
  const balances = new Map(
    props.vacation?.employees.map(employee => [employee.id, employee]) ?? []
  );
  const visible = props.employees
    .filter(employee => employee.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const key = (employee: AttendanceEmployee): string | number => {
        if (sort === "late") return employee.payroll.lateMinutes;
        if (sort === "deduction") return employee.payroll.totalDeduction;
        if (sort === "remaining")
          return balances.get(employee.id)?.remainingDays ?? 0;
        return employee.name.toLowerCase();
      };
      const left = key(a),
        right = key(b);
      const order =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return (order || a.id - b.id) * (descending ? -1 : 1);
    });
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const activePage = Math.min(page, pages - 1);
  const rows = visible.slice(
    activePage * pageSize,
    (activePage + 1) * pageSize
  );
  const ids = visible.map(employee => employee.id);
  const totals = visible.reduce(
    (sum, employee) => ({
      recorded: sum.recorded + (employee.timing?.recordedMinutes ?? 0),
      late: sum.late + employee.payroll.lateMinutes,
      days: sum.days + (employee.timing?.lateEquivalentDays ?? 0),
      deduction: sum.deduction + employee.payroll.totalDeduction,
      entitled: sum.entitled + (balances.get(employee.id)?.totalDays ?? 0),
      used: sum.used + (balances.get(employee.id)?.usedDays ?? 0),
      remaining:
        sum.remaining + (balances.get(employee.id)?.remainingDays ?? 0),
      requests: sum.requests + (balances.get(employee.id)?.requestCount ?? 0),
    }),
    {
      recorded: 0,
      late: 0,
      days: 0,
      deduction: 0,
      entitled: 0,
      used: 0,
      remaining: 0,
      requests: 0,
    }
  );
  const selected = props.employees.find(employee => employee.id === detail?.id);
  const vacationDetail = detail ? balances.get(detail.id) : undefined;
  const safeIssuer = attendanceReportDisplayName(
    props.issuer,
    "HR administrator"
  );
  return (
    <Card id="hr-admin-reports">
      <CardHeader>
        <CardTitle className="text-lg">Employee reports</CardTitle>
        <CardDescription>
          Payroll cycle attendance, lateness and deduction previews, plus annual
          vacation balances and complete request history. Issuer:{" "}
          <strong>{safeIssuer}</strong>. Each PDF includes its issuance time in
          Cairo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={tab}
          onValueChange={value => {
            setTab(value);
            setPage(0);
          }}
        >
          <TabsList className="h-auto flex-wrap gap-1">
            <TabsTrigger value="attendance" className="min-h-11">
              Attendance & deductions
            </TabsTrigger>
            <TabsTrigger value="vacation" className="min-h-11">
              Annual vacation ledger
            </TabsTrigger>
          </TabsList>
          <div className="mt-4 grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div>
              <Label htmlFor="hr-report-search">Find employee</Label>
              <div className="relative mt-2">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                />
                <Input
                  id="hr-report-search"
                  type="search"
                  className="min-h-11 pl-9"
                  placeholder="Search by employee name"
                  value={props.search}
                  onChange={event => {
                    props.onSearch(event.target.value);
                    setPage(0);
                  }}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="hr-report-sort">Sort report</Label>
              <select
                id="hr-report-sort"
                className="mt-2 block min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                value={sort}
                onChange={event => {
                  setSort(event.target.value);
                  setPage(0);
                }}
              >
                <option value="name">Employee name</option>
                <option value="late">Late minutes</option>
                <option value="deduction">Deduction preview</option>
                <option value="remaining">Vacation remaining</option>
              </select>
            </div>
            <Button
              variant="outline"
              className="min-h-11"
              aria-label={
                descending
                  ? "Change to ascending order"
                  : "Change to descending order"
              }
              onClick={() => {
                setDescending(!descending);
                setPage(0);
              }}
            >
              <ArrowUpDown aria-hidden="true" />
              {descending ? "Descending" : "Ascending"}
            </Button>
          </div>
          <TabsContent value="attendance" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">
                Applied period: {props.from} – {props.to} · Africa/Cairo
              </p>
              <Button
                className="min-h-11"
                disabled={props.exportDisabled || !ids.length}
                onClick={() => props.onAttendancePdf(ids)}
              >
                <FileDown aria-hidden="true" />
                {props.exporting ? "Preparing PDF…" : "Export attendance PDF"}
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <SmallMetric
                title="Recorded attendance hours"
                value={n(totals.recorded / 60)}
              />
              <SmallMetric
                title="Lateness · minutes / hours"
                value={`${n(totals.late)} / ${n(totals.late / 60)}`}
              />
              <SmallMetric
                title="Lateness · equivalent days"
                value={n(totals.days, 4)}
              />
              <SmallMetric
                title="Total deduction preview"
                value={egp(totals.deduction)}
              />
            </dl>
            <p className="text-xs leading-5 text-muted-foreground">
              Late days = sum of each finalized day's late minutes ÷ its
              scheduled shift minutes, not 24-hour days. Recorded time uses real
              closed punches only; rollout credits and open shifts are not
              fabricated work time. Absence, early departure and the cycle's 3:1
              incomplete-punch rule are included once in total loss. Salary ÷ 30
              always. Preview only — no financial posting.
            </p>
            <Table className="w-max min-w-full">
              <TableHeader>
                <TableRow>
                  <Column width={170}>Employee</Column>
                  <Column>Recorded / shift-overlap hours</Column>
                  <Column>Scheduled / evaluated days</Column>
                  <Column>Late minutes</Column>
                  <Column>Late hours</Column>
                  <Column>Late equivalent days</Column>
                  <Column>Absent days</Column>
                  <Column>Early min / incomplete days</Column>
                  <Column>Total lost min / hours / days</Column>
                  <Column width={160}>Deduction preview</Column>
                  <Column width={150}>Employee report</Column>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(employee => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {employee.name}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {n(
                        employee.timing
                          ? employee.timing.recordedMinutes / 60
                          : undefined
                      )}{" "}
                      /{" "}
                      {n(
                        employee.timing
                          ? employee.timing.scheduledPresenceMinutes / 60
                          : undefined
                      )}
                    </TableCell>
                    <TableCell>
                      {n(employee.payroll.workingDays)} /{" "}
                      {n(employee.payroll.evaluatedDays)}
                    </TableCell>
                    <TableCell>{n(employee.payroll.lateMinutes)}</TableCell>
                    <TableCell>
                      {n(employee.payroll.lateMinutes / 60)}
                    </TableCell>
                    <TableCell>
                      {n(employee.timing?.lateEquivalentDays, 4)}
                    </TableCell>
                    <TableCell>{n(employee.payroll.absentDays)}</TableCell>
                    <TableCell>
                      {n(employee.payroll.earlyMinutes)} /{" "}
                      {n(employee.payroll.incompleteDays)}
                    </TableCell>
                    <TableCell>
                      {n(employee.payroll.totalLostMinutes)} /{" "}
                      {n(employee.payroll.lostHours)} /{" "}
                      {n(employee.payroll.equivalentDays, 4)}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {egp(employee.payroll.totalDeduction)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDetail({ id: employee.id, kind: "attendance" })
                          }
                          aria-label={`View attendance report for ${employee.name}`}
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={props.exportDisabled}
                          onClick={() => props.onAttendancePdf([employee.id])}
                          aria-label={`Export attendance PDF for ${employee.name}`}
                        >
                          <FileDown aria-hidden="true" />
                          PDF
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No employees match this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="vacation" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">
                Calendar year {props.year} · full-year history, independent of
                payroll dates
              </p>
              <Button
                className="min-h-11"
                disabled={
                  props.exportDisabled || !ids.length || !props.vacation
                }
                onClick={() => props.onVacationPdf(ids)}
              >
                <FileDown aria-hidden="true" />
                {props.exporting ? "Preparing PDF…" : "Export vacation PDF"}
              </Button>
            </div>
            {props.vacationError ? (
              <p role="alert" className="text-sm text-destructive">
                {props.vacationError}
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <SmallMetric
                    title="Annual entitlement · days"
                    value={n(totals.entitled)}
                  />
                  <SmallMetric
                    title="Approved used / reserved days"
                    value={n(totals.used)}
                  />
                  <SmallMetric
                    title="Remaining balance · days"
                    value={n(totals.remaining)}
                  />
                  <SmallMetric
                    title="Requests in year · all statuses"
                    value={n(totals.requests)}
                  />
                </dl>
                <p className="text-xs leading-5 text-muted-foreground">
                  2026: 20 days; from 2027: 22 days per calendar year, unless
                  explicitly adjusted by HR. No carryover. Only approved
                  allocations consume the balance, including future approved
                  leave. Pending and rejected requests stay in history without
                  reducing remaining days. Cross-year approved usage retains its
                  original year allocation.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <Column width={180}>Employee</Column>
                      <Column>Annual entitlement</Column>
                      <Column>Approved used / reserved</Column>
                      <Column>Remaining days</Column>
                      <Column>Pending days</Column>
                      <Column>Requests</Column>
                      <Column width={190}>Full vacation history / PDF</Column>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(employee => {
                      const balance = balances.get(employee.id);
                      return (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium">
                            {employee.name}
                          </TableCell>
                          <TableCell>{n(balance?.totalDays)}</TableCell>
                          <TableCell>{n(balance?.usedDays)}</TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            {n(balance?.remainingDays)}
                          </TableCell>
                          <TableCell>{n(balance?.pendingDays)}</TableCell>
                          <TableCell>{n(balance?.requestCount)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setDetail({
                                    id: employee.id,
                                    kind: "vacation",
                                  })
                                }
                                aria-label={`View vacation history for ${employee.name}`}
                              >
                                History
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={props.exportDisabled || !balance}
                                onClick={() =>
                                  props.onVacationPdf([employee.id])
                                }
                                aria-label={`Export vacation PDF for ${employee.name}`}
                              >
                                <FileDown aria-hidden="true" />
                                PDF
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!rows.length && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No employees match this search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </TabsContent>
        </Tabs>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <p role="status">
            {visible.length} matching employees · page {activePage + 1} of{" "}
            {pages}. Exports include all matching rows.
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="hr-report-page-size" className="sr-only">
              Employees per page
            </Label>
            <select
              id="hr-report-page-size"
              className="min-h-10 rounded-md border bg-background px-2"
              value={pageSize}
              onChange={event => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              disabled={!activePage}
              onClick={() => setPage(activePage - 1)}
              aria-label="Previous report page"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={activePage >= pages - 1}
              onClick={() => setPage(activePage + 1)}
              aria-label="Next report page"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Drag a column heading's lower-right corner to resize. Scroll the table
          horizontally on smaller screens. Reports contain no location or login
          details.
        </p>
      </CardContent>
      <Dialog
        open={Boolean(detail)}
        onOpenChange={open => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-[95vw] lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              {selected?.name} ·{" "}
              {detail?.kind === "vacation"
                ? `Vacation history ${props.year}`
                : "Attendance report"}
            </DialogTitle>
            <DialogDescription>
              {detail?.kind === "vacation"
                ? `All vacation requests overlapping ${props.year}; pending and rejected history is preserved.`
                : `${props.from} – ${props.to}, Africa/Cairo. Payroll preview only; nothing is posted.`}
            </DialogDescription>
          </DialogHeader>
          {selected && detail?.kind === "attendance" && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SmallMetric
                  title="Recorded attendance hours"
                  value={n(
                    selected.timing
                      ? selected.timing.recordedMinutes / 60
                      : undefined
                  )}
                />
                <SmallMetric
                  title="Late min / hours / days"
                  value={`${n(selected.payroll.lateMinutes)} / ${n(selected.payroll.lateMinutes / 60)} / ${n(selected.timing?.lateEquivalentDays, 4)}`}
                />
                <SmallMetric
                  title="Deduction preview"
                  value={egp(selected.payroll.totalDeduction)}
                />
                <SmallMetric
                  title="Covered net salary preview"
                  value={egp(selected.payroll.netSalary)}
                />
              </dl>
              <p className="text-xs text-muted-foreground">
                Scheduled hours:{" "}
                {n(
                  selected.timing
                    ? selected.timing.scheduledMinutes / 60
                    : undefined
                )}{" "}
                · Evaluated scheduled hours:{" "}
                {n(
                  selected.timing
                    ? selected.timing.evaluatedScheduledMinutes / 60
                    : undefined
                )}{" "}
                · Actual present days: {n(selected.timing?.presentDays)} ·
                Credited days (no fabricated punches):{" "}
                {n(selected.timing?.creditedDays)}
              </p>
              <Button
                disabled={props.exportDisabled}
                onClick={() => props.onAttendancePdf([selected.id])}
              >
                <FileDown aria-hidden="true" />
                Employee PDF
              </Button>
              <Table>
                <TableHeader>
                  <TableRow>
                    <Column>Cairo date / status</Column>
                    <Column>Scheduled shift</Column>
                    <Column width={160}>Clock in / out · Cairo</Column>
                    <Column>Recorded / overlap min</Column>
                    <Column>Late / early min</Column>
                    <Column>Total lost min</Column>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.payroll.days.map(day => {
                    const timing = selected.timing?.days.find(
                      item => item.date === day.date
                    );
                    return (
                      <TableRow key={day.date}>
                        <TableCell>
                          {day.date}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {HR_ATTENDANCE_STATUS_LABELS[
                              day.status as keyof typeof HR_ATTENDANCE_STATUS_LABELS
                            ] ?? day.status}
                          </p>
                        </TableCell>
                        <TableCell>
                          {timing?.scheduleStart ?? "—"} –{" "}
                          {timing?.scheduleEnd ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className="block">
                            {stamp(timing?.checkInAt)}
                          </span>
                          <span className="block">
                            {stamp(timing?.checkOutAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {n(timing?.recordedMinutes)} /{" "}
                          {n(timing?.scheduledPresenceMinutes)}
                        </TableCell>
                        <TableCell>
                          {n(day.lateMinutes)} / {n(day.earlyMinutes)}
                        </TableCell>
                        <TableCell>{n(day.missingMinutes)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {vacationDetail && detail?.kind === "vacation" && (
            <div className="space-y-4">
              <p className="text-sm">
                Entitlement: <strong>{n(vacationDetail.totalDays)}</strong> ·
                Approved used / reserved:{" "}
                <strong>{n(vacationDetail.usedDays)}</strong> · Remaining:{" "}
                <strong>{n(vacationDetail.remainingDays)}</strong> days
              </p>
              <Button
                disabled={props.exportDisabled}
                onClick={() => props.onVacationPdf([vacationDetail.id])}
              >
                <FileDown aria-hidden="true" />
                Employee vacation PDF
              </Button>
              {vacationDetail.history.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <Column>Request / status</Column>
                      <Column>Vacation dates</Column>
                      <Column>Days · total / in year</Column>
                      <Column width={220}>Request reason / submitted</Column>
                      <Column width={220}>Decision reason / reviewed</Column>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vacationDetail.history.map(request => (
                      <TableRow key={request.id}>
                        <TableCell>
                          #{request.id}
                          <Badge variant="outline" className="mt-2 block w-fit">
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {request.fromDate} – {request.toDate}
                        </TableCell>
                        <TableCell>
                          {n(request.requestedDays)} / {n(request.yearDays)}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-xs whitespace-pre-wrap break-words">
                            {request.reason || "—"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {stamp(request.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="max-w-xs whitespace-pre-wrap break-words">
                            {request.decisionReason || "—"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {stamp(request.reviewedAt)}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No vacation requests during {props.year}.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

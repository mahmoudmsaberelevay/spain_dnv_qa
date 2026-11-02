import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { formatAttendanceDuration, formatCairoAttendanceTime, getCairoMonthBounds } from "@shared/hrAttendance";

function cairoDateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)}T12:00:00Z`));
}

function shortDateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)}T12:00:00Z`));
}

function MetricCard({ label, value, icon: Icon, tone = "primary" }: { label: string; value: string | number; icon: any; tone?: "primary" | "positive" | "gold" | "muted" }) {
  const tones = {
    primary: "metric-primary-bg",
    positive: "metric-positive-bg",
    gold: "metric-gold-bg",
    muted: "metric-icon--muted",
  };
  return (
    <Card className="min-w-0">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`metric-icon flex h-10 w-10 items-center justify-center ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default function HrAttendanceDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdministrator = user?.role === "admin";
  const inReportsRoute = window.location.pathname === "/hr/reports";
  const [tab, setTab] = useState(inReportsRoute && isAdministrator ? "reports" : "attendance");
  const monthBounds = useMemo(() => getCairoMonthBounds(), []);
  const [reportFrom, setReportFrom] = useState(monthBounds.from);
  const [reportTo, setReportTo] = useState(monthBounds.to);
  const utils = trpc.useUtils();
  const { data: attendance, isLoading } = trpc.hr.attendance.me.useQuery(undefined, { refetchInterval: 60_000 });
  const reportInput = useMemo(() => ({ from: reportFrom || undefined, to: reportTo || undefined }), [reportFrom, reportTo]);
  const { data: report, isLoading: reportLoading } = trpc.hr.attendance.report.useQuery(reportInput, { enabled: isAdministrator && tab === "reports" });

  useEffect(() => {
    if (!isAdministrator && tab === "reports") {
      setTab("attendance");
      setLocation("/hr");
    }
  }, [isAdministrator, setLocation, tab]);

  const invalidateAttendance = async () => {
    await utils.hr.attendance.me.invalidate();
    await utils.hr.attendance.report.invalidate();
  };
  const clockIn = trpc.hr.attendance.clockIn.useMutation({
    onSuccess: async (result) => {
      await invalidateAttendance();
      toast.success(result.created ? "You are clocked in." : "You are already clocked in for today.");
    },
    onError: (error) => toast.error(error.message),
  });
  const clockOut = trpc.hr.attendance.clockOut.useMutation({
    onSuccess: async () => {
      await invalidateAttendance();
      toast.success("You are clocked out. Have a great day.");
    },
    onError: (error) => toast.error(error.message),
  });

  const today = attendance?.today;
  const openAttendance = attendance?.openAttendance;
  const canClockIn = Boolean(attendance?.linked && attendance.employee?.isActive && !today && !openAttendance);
  const canClockOut = Boolean(attendance?.linked && attendance.employee?.isActive && openAttendance);

  const changeTab = (value: string) => {
    if (value === "reports" && !isAdministrator) return;
    setTab(value);
    setLocation(value === "reports" ? "/hr/reports" : "/hr");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Users className="h-4 w-4" /> Human Resources
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clock in, clock out, and keep attendance records in Cairo time.</p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full px-3 py-1.5 text-xs font-medium">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> {attendance?.attendanceDate ? cairoDateLabel(attendance.attendanceDate) : "Cairo business date"}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="space-y-5">
        <TabsList aria-label="HR sections" className="w-full sm:w-auto">
          <TabsTrigger value="attendance" className="min-w-32"><Clock3 className="h-4 w-4" /> My attendance</TabsTrigger>
          {isAdministrator && <TabsTrigger value="reports" className="min-w-28"><BarChartIcon className="h-4 w-4" /> Reports</TabsTrigger>}
        </TabsList>

        <TabsContent value="attendance" className="space-y-5">
          {isLoading ? (
            <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Loading your attendance…</CardContent></Card>
          ) : !attendance?.linked ? (
            <Card className="elevay-featured-panel overflow-hidden">
              <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="metric-gold-bg metric-icon flex h-11 w-11 shrink-0 items-center justify-center"><ShieldCheck className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-semibold">Your HR profile is not linked yet</h2>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">You can open HR with your CRM login. To clock in or out, an administrator must link your CRM login to your employee record in Financial → Employees. HR never matches identities by name or email.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="elevay-featured-panel overflow-hidden">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`metric-icon flex h-12 w-12 shrink-0 items-center justify-center ${openAttendance ? "metric-positive-bg" : today ? "metric-primary-bg" : "metric-gold-bg"}`}>
                        {openAttendance ? <Timer className="h-6 w-6" /> : today ? <CheckCircle2 className="h-6 w-6" /> : <Clock3 className="h-6 w-6" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{attendance.employee?.name}</p>
                        <h2 className="mt-0.5 text-xl font-bold">
                          {openAttendance ? "You are clocked in" : today ? "Today’s attendance is complete" : "Ready when you are"}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {openAttendance
                            ? `Clocked in at ${formatCairoAttendanceTime(openAttendance.checkInAt)}${openAttendance.attendanceDate !== attendance.attendanceDate ? ` on ${shortDateLabel(openAttendance.attendanceDate)}` : ""}.`
                            : today
                              ? `${formatCairoAttendanceTime(today.checkInAt)} — ${formatCairoAttendanceTime(today.checkOutAt)} · ${formatAttendanceDuration(today.durationMinutes)}`
                              : "Your attendance time is recorded securely by the server in Cairo time."}
                        </p>
                      </div>
                    </div>
                    {canClockOut ? (
                      <Button size="lg" onClick={() => clockOut.mutate()} disabled={clockOut.isPending} className="min-w-40">
                        <LogOut className="mr-2 h-4 w-4" /> {clockOut.isPending ? "Clocking out…" : "Clock out"}
                      </Button>
                    ) : (
                      <Button size="lg" onClick={() => clockIn.mutate()} disabled={!canClockIn || clockIn.isPending} className="min-w-40">
                        <LogIn className="mr-2 h-4 w-4" /> {clockIn.isPending ? "Clocking in…" : "Clock in"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <MetricCard label="Present days" value={attendance.monthSummary.presentDays} icon={CalendarDays} tone="primary" />
                <MetricCard label="Completed days" value={attendance.monthSummary.completedDays} icon={CheckCircle2} tone="positive" />
                <MetricCard label="Open records" value={attendance.monthSummary.openDays} icon={Clock3} tone="gold" />
                <MetricCard label="Tracked this month" value={formatAttendanceDuration(attendance.monthSummary.totalMinutes)} icon={Timer} tone="muted" />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">My attendance history</CardTitle>
                  <CardDescription>Most recent 20 attendance records. Times are shown in Cairo time.</CardDescription>
                </CardHeader>
                <CardContent>
                  {attendance.history.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No attendance records yet.</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border/70">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead><tr className="border-b bg-muted/35 text-left"><th className="px-3 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Clock in</th><th className="px-3 py-2.5 font-medium">Clock out</th><th className="px-3 py-2.5 text-right font-medium">Duration</th><th className="px-3 py-2.5 text-right font-medium">Status</th></tr></thead>
                        <tbody>{attendance.history.map((record: any) => <tr key={record.id} className="border-b border-border/60 last:border-0"><td className="px-3 py-3 font-medium">{shortDateLabel(record.attendanceDate)}</td><td className="px-3 py-3">{formatCairoAttendanceTime(record.checkInAt)}</td><td className="px-3 py-3">{formatCairoAttendanceTime(record.checkOutAt)}</td><td className="px-3 py-3 text-right tabular-nums">{formatAttendanceDuration(record.durationMinutes)}</td><td className="px-3 py-3 text-right"><Badge variant={record.status === "completed" ? "secondary" : "default"}>{record.status === "completed" ? "Complete" : "Clocked in"}</Badge></td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {isAdministrator && (
          <TabsContent value="reports" className="space-y-5">
            <Card>
              <CardHeader><CardTitle className="text-base">Attendance report</CardTitle><CardDescription>Administrator-only view. Every employee’s personal clock actions remain self-scoped.</CardDescription></CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div><label className="text-xs font-medium text-muted-foreground">From</label><Input aria-label="HR report start date" type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="mt-1 w-full sm:w-44" /></div>
                  <div><label className="text-xs font-medium text-muted-foreground">To</label><Input aria-label="HR report end date" type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} className="mt-1 w-full sm:w-44" /></div>
                  <Button variant="outline" onClick={() => { setReportFrom(monthBounds.from); setReportTo(monthBounds.to); }}>This month</Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <MetricCard label="Attendance records" value={report?.summary.presentDays ?? "—"} icon={Users} tone="primary" />
              <MetricCard label="Completed" value={report?.summary.completedDays ?? "—"} icon={CheckCircle2} tone="positive" />
              <MetricCard label="Still open" value={report?.summary.openDays ?? "—"} icon={Clock3} tone="gold" />
              <MetricCard label="Tracked time" value={report ? formatAttendanceDuration(report.summary.totalMinutes) : "—"} icon={Timer} tone="muted" />
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Team attendance</CardTitle><CardDescription>Server-recorded check-in and check-out times, grouped by Cairo business date.</CardDescription></CardHeader>
              <CardContent>
                {reportLoading ? <div className="py-10 text-center text-sm text-muted-foreground">Loading attendance report…</div> : !report?.records.length ? <div className="py-10 text-center text-sm text-muted-foreground">No attendance records in this date range.</div> : (
                  <div className="overflow-x-auto rounded-xl border border-border/70">
                    <table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-muted/35 text-left"><th className="px-3 py-2.5 font-medium">Employee</th><th className="px-3 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Clock in</th><th className="px-3 py-2.5 font-medium">Clock out</th><th className="px-3 py-2.5 text-right font-medium">Duration</th><th className="px-3 py-2.5 text-right font-medium">Status</th></tr></thead><tbody>{report.records.map((record: any) => <tr key={record.id} className="border-b border-border/60 last:border-0"><td className="px-3 py-3"><p className="font-medium">{record.employeeName}</p><p className="text-xs text-muted-foreground">{record.employeeRole ?? "Employee"}</p></td><td className="px-3 py-3">{shortDateLabel(record.attendanceDate)}</td><td className="px-3 py-3">{formatCairoAttendanceTime(record.checkInAt)}</td><td className="px-3 py-3">{formatCairoAttendanceTime(record.checkOutAt)}</td><td className="px-3 py-3 text-right tabular-nums">{formatAttendanceDuration(record.durationMinutes)}</td><td className="px-3 py-3 text-right"><Badge variant={record.status === "completed" ? "secondary" : "default"}>{record.status === "completed" ? "Complete" : "Clocked in"}</Badge></td></tr>)}</tbody></table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function BarChartIcon(props: React.ComponentProps<typeof CalendarDays>) {
  return <CalendarDays {...props} />;
}

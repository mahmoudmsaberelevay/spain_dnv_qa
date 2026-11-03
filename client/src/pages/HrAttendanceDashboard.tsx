import { useAuth } from "@/_core/hooks/useAuth";
import HrEmployeeOnboarding from "@/components/HrEmployeeOnboarding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { isHrAdministrator } from "@shared/hrAccess";
import { HR_ROLLOUT_CREDIT } from "@shared/hrAttendanceCredits";
import {
  formatAttendanceDuration,
  formatCairoAttendanceTime,
} from "@shared/hrAttendance";
import { getCairoBusinessDate } from "@shared/financialEmployeeSalaryRates";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileDown,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Timer,
  Trash2,
  Users,
  Wallet,
  Wifi,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Date-only business keys are deliberately not converted through the browser's timezone.
function dateKey(value: string | Date): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
function dateLabel(value: string | Date): string {
  const key = dateKey(value);
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", {
        timeZone: "Africa/Cairo",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}
function calendarDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function calendarKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function validDate(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key
  );
}
function rangeError(from: string, to: string): string | null {
  if (!validDate(from) || !validDate(to))
    return "Choose a valid start and end date.";
  if (from > to) return "The end date must be on or after the start date.";
  if (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000 +
      1 >
    366
  )
    return "Choose a date range of at most 366 days.";
  return null;
}
function numberLabel(
  value: number | string | null | undefined,
  places = 2
): string {
  const number = Number(value);
  return value == null || !Number.isFinite(number)
    ? "—"
    : number.toLocaleString("en-GB", { maximumFractionDigits: places });
}
function money(value: number | string | null | undefined): string {
  return value == null ? "—" : `${numberLabel(value)} EGP`;
}
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed. Please try again.";
}
function cycleFor(
  today: string,
  lastCompleted = false
): { from: string; to: string } {
  const [year, month] = today.split("-").map(Number);
  let end = new Date(Date.UTC(year, month - 1, 26));
  if (lastCompleted && end.toISOString().slice(0, 10) >= today)
    end = new Date(Date.UTC(year, month - 2, 26));
  return {
    from: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 27))
      .toISOString()
      .slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

type Balance = {
  year: number;
  totalDays: number | string;
  usedDays: number | string;
  remainingDays: number | string;
};
type LeaveRequest = {
  id: number;
  fromDate: string | Date;
  toDate: string | Date;
  requestedDays: number | string;
  reason: string;
  status: string;
  decisionReason: string | null;
  reviewedAt: string | Date | null;
  createdAt: string | Date;
  employeeName?: string;
};
type Holiday = { id: number; holidayDate: string | Date; name: string };
type Schedule = {
  id: number;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  effectiveFrom: string | Date;
};
type PayrollDay = {
  date: string;
  status: string;
  lateMinutes: number;
  earlyMinutes: number;
  missingMinutes: number;
};
type Payroll = {
  workingDays: number;
  evaluatedDays: number;
  lateMinutes: number;
  earlyMinutes: number;
  absentDays: number;
  incompleteDays: number;
  incompleteDeductionDays: number;
  totalLostMinutes: number;
  lostHours: number;
  equivalentDays: number;
  dailyRate: number;
  hourlyRate: number;
  minuteRate: number;
  totalDeduction: number;
  netSalary: number;
  coveredBaseSalary: number;
  cycleBreakdown: {
    from: string;
    to: string;
    coveredFrom: string;
    coveredTo: string;
    salary: number;
    fullCycleWorkingDays: number;
    workingDays: number;
    coveredBaseSalary: number;
    totalDeduction: number;
    equivalentDays: number;
    incompleteDeductionDays: number;
  }[];
  days: PayrollDay[];
};
type Employee = {
  id: number;
  name: string;
  crmUserId: number | null;
  salary: number | string;
  isActive: boolean | number;
  schedules: Schedule[];
  leaveBalance: Balance | null;
  payroll: Payroll;
};
type VerificationMethod = "pending" | "geofence" | "strict_wifi" | "both";
type VerificationSettings = {
  verificationMethod: string;
  officeLatitude: number | string | null;
  officeLongitude: number | string | null;
  radiusMeters: number;
  maxAccuracyMeters: number;
};
type CapturedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: number;
};

function Notice({
  title,
  children,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-xl border p-4 text-sm",
        error
          ? "border-destructive/35 bg-destructive/5"
          : "border-border bg-muted/25"
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle
          aria-hidden="true"
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            error ? "text-destructive" : "text-primary"
          )}
        />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          {children && (
            <div className="mt-1 break-words leading-6 text-muted-foreground">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function QueryState({
  loading,
  error,
  retry,
  label,
}: {
  loading: boolean;
  error?: { message: string } | null;
  retry: () => unknown;
  label: string;
}) {
  if (error)
    return (
      <Notice title={`Unable to load ${label}`} error>
        <p>{error.message}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-2 min-h-11"
          onClick={() => void retry()}
        >
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </Notice>
    );
  if (loading)
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl border p-5 text-sm text-muted-foreground"
      >
        <Loader2
          aria-hidden="true"
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
        />
        Loading {label}…
      </div>
    );
  return null;
}
function Metric({
  label,
  value,
  icon: Icon = Clock3,
}: {
  label: string;
  value: string | number;
  icon?: typeof Clock3;
}) {
  return (
    <Card className="min-w-0 gap-0 py-4">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="metric-icon metric-primary-bg flex h-9 w-9 shrink-0 items-center justify-center">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </div>
          <span className="break-words text-right text-xl font-semibold tabular-nums sm:text-2xl">
            {value}
          </span>
        </div>
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label className="block text-sm">
        {label}
        {children}
      </Label>
      {hint && (
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
function Status({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "rejected" || status === "absent"
          ? "destructive"
          : status === "approved" ||
              status === "completed" ||
              status === "present" ||
              status === "credited"
            ? "secondary"
            : "outline"
      }
      className="capitalize"
    >
      {status === "credited"
        ? "Present (rollout credit)"
        : status.replaceAll("_", " ")}
    </Badge>
  );
}
function UnlinkedProfile() {
  return (
    <Notice title="HR onboarding pending">
      Use your normal CRM login. Ask Mahmoud, Madonna, or Ziad to
      link your existing employee profile in HR Admin → Employee login links. HR does not match
      identities by name or email.
    </Notice>
  );
}

export default function HrAttendanceDashboard() {
  const { user, loading, error, refresh } = useAuth();
  const [location, navigate] = useLocation();
  const namedAdministrator = isHrAdministrator(user);
  const access = trpc.hr.access.useQuery(undefined, {
    enabled: Boolean(user) && !loading,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const section =
    location === "/hr/admin" || location === "/hr/reports"
      ? "admin"
      : location === "/hr/requests"
        ? "requests"
        : "daily";
  const verifiedAdministrator =
    namedAdministrator &&
    access.isSuccess &&
    !access.isError &&
    access.data.isHrAdmin === true;

  if (loading || error)
    return (
      <QueryState
        loading={loading}
        error={error}
        retry={refresh}
        label="your CRM session"
      />
    );
  if (!user)
    return (
      <Notice title="Sign in with your CRM account">
        HR uses the same authenticated CRM session as the rest of ELEVAY.
      </Notice>
    );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Users aria-hidden="true" className="h-4 w-4" />
            Human Resources
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {section === "daily"
              ? "Daily Activity"
              : section === "requests"
                ? "Vacation Requests"
                : "HR Administration"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {section === "daily"
              ? "Your attendance, securely recorded in Cairo time."
              : section === "requests"
                ? "Plan your time off and follow your own requests."
                : "Team schedules, leave decisions, and payroll previews."}
          </p>
        </div>
        <Badge variant="outline" className="px-3 py-2">
          <CalendarDays aria-hidden="true" />
          Cairo business date · {dateLabel(getCairoBusinessDate())}
        </Badge>
      </header>
      <nav aria-label="HR sections" className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={section === "daily" ? "default" : "outline"}
          className="min-h-11"
          aria-current={section === "daily" ? "page" : undefined}
          onClick={() => navigate("/hr")}
        >
          <Clock3 aria-hidden="true" />
          Daily Activity
        </Button>
        <Button
          type="button"
          variant={section === "requests" ? "default" : "outline"}
          className="min-h-11"
          aria-current={section === "requests" ? "page" : undefined}
          onClick={() => navigate("/hr/requests")}
        >
          <CalendarDays aria-hidden="true" />
          Vacation Requests
        </Button>
        {verifiedAdministrator && (
          <Button
            type="button"
            variant={section === "admin" ? "default" : "outline"}
            className="min-h-11"
            aria-current={section === "admin" ? "page" : undefined}
            onClick={() => navigate("/hr/admin")}
          >
            <ShieldCheck aria-hidden="true" />
            Admin
          </Button>
        )}
      </nav>
      <p
        className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-foreground"
        role="note"
      >
        On-time attendance credit for all staff:{" "}
        {dateLabel(HR_ROLLOUT_CREDIT.from)}–{dateLabel(HR_ROLLOUT_CREDIT.to)}{" "}
        inclusive. Normal attendance enforcement starts Wednesday,{" "}
        {dateLabel(HR_ROLLOUT_CREDIT.enforcementFrom)}. This reporting credit
        does not create clock records. Every actual clock-in and clock-out still
        requires verified office location within 1 km, including HR
        administrators.
      </p>
      {access.isError && section !== "admin" && (
        <QueryState
          loading={false}
          error={access.error}
          retry={access.refetch}
          label="HR access verification"
        />
      )}
      {section === "daily" && <DailyActivity />}
      {section === "requests" && <VacationRequests />}
      {section === "admin" &&
        (!namedAdministrator ? (
          <AccessDenied />
        ) : access.isLoading || access.isError ? (
          <QueryState
            loading={access.isLoading}
            error={access.error}
            retry={access.refetch}
            label="HR administrator access"
          />
        ) : verifiedAdministrator ? (
          <HrAdmin />
        ) : (
          <AccessDenied />
        ))}
    </div>
  );
}
function AccessDenied() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <LockKeyhole
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-primary"
        />
        <div>
          <h2 className="font-semibold">HR administrator access denied</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Only the explicitly authorized HR members may view team attendance,
            salaries, or administration. A generic CRM administrator role does
            not grant this access. No team or salary data has been requested.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function getCurrentLocation(): Promise<CapturedLocation> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext)
      return reject(
        new Error(
          "Location verification requires a secure HTTPS connection. No attendance was recorded."
        )
      );
    if (!navigator.geolocation)
      return reject(
        new Error(
          "This browser does not support geolocation. Use a supported browser; no attendance was recorded."
        )
      );
    navigator.geolocation.getCurrentPosition(
      position =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: position.timestamp,
        }),
      error => {
        const messages: Record<number, string> = {
          1: "Location permission was denied. Allow location access for this site and try again. No attendance was recorded.",
          2: "Your location is unavailable. Enable device location services and try again. No attendance was recorded.",
          3: "Location retrieval timed out after 15 seconds. Move to a place with a better GPS signal and try again. No attendance was recorded.",
        };
        reject(
          new Error(
            messages[error.code] ??
              "Location could not be verified. No attendance was recorded."
          )
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
function DailyActivity() {
  const utils = trpc.useUtils();
  const attendance = trpc.hr.attendance.me.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const verification = trpc.hr.attendance.verification.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: false,
  });
  const [locating, setLocating] = useState(false);
  const [captured, setCaptured] = useState<CapturedLocation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const clockIn = trpc.hr.attendance.clockIn.useMutation();
  const clockOut = trpc.hr.attendance.clockOut.useMutation();
  const data = attendance.data;
  const policy = verification.data;
  const busy = locating || clockIn.isPending || clockOut.isPending;
  const configured =
    verification.isSuccess &&
    !verification.isError &&
    policy?.allowed === true &&
    (policy.method === "geofence" ||
      policy.method === "strict_wifi" ||
      policy.method === "both");
  const canClockIn = Boolean(
    data?.linked &&
      data.employee?.isActive &&
      !data.today &&
      !data.openAttendance
  );
  const canClockOut = Boolean(
    data?.linked && data.employee?.isActive && data.openAttendance
  );

  async function punch(kind: "in" | "out") {
    if (
      actionLock.current ||
      !(kind === "in" ? canClockIn : canClockOut) ||
      !configured
    )
      return;
    actionLock.current = true;
    setActionError(null);
    setCaptured(null);
    try {
      // Refresh verification at the click; allowed denotes configuration, not GPS acceptance.
      const refreshed = await verification.refetch();
      if (refreshed.error || !refreshed.data?.allowed)
        throw new Error(
          refreshed.error?.message ??
            refreshed.data?.message ??
            "Office verification is not configured. Clock actions are blocked."
        );
      const method = refreshed.data.method;
      if (!["geofence", "strict_wifi", "both"].includes(method))
        throw new Error(
          "An attendance verification method has not been activated. Clock actions are blocked."
        );
      let location: CapturedLocation | undefined;
      if (method === "geofence" || method === "both") {
        setLocating(true);
        location = await getCurrentLocation();
        setLocating(false);
        setCaptured(location);
        // Send the device reading unchanged. The server rejects insufficient
        // accuracy, stale captures and out-of-office positions, and audits it.
      }
      const payload = location ? { location } : undefined;
      if (kind === "in") {
        const result = await clockIn.mutateAsync(payload);
        toast.success(
          result.created ? "You are clocked in." : "You are already clocked in."
        );
      } else {
        await clockOut.mutateAsync(payload);
        toast.success("You are clocked out.");
      }
      await utils.hr.attendance.me.invalidate();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setLocating(false);
      actionLock.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <QueryState
        loading={attendance.isLoading}
        error={attendance.error}
        retry={attendance.refetch}
        label="your attendance"
      />
      {!attendance.isLoading && !attendance.isError && data && (
        <>
          {!data.linked ? (
            <UnlinkedProfile />
          ) : (
            <>
              <Card className="elevay-featured-panel">
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="metric-icon metric-positive-bg flex h-12 w-12 shrink-0 items-center justify-center">
                        <Timer aria-hidden="true" className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {data.employee?.name}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold">
                          {data.openAttendance
                            ? "You are clocked in"
                            : data.today
                              ? "Today's attendance is complete"
                              : "Ready for your working day"}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {data.openAttendance
                            ? `Clocked in at ${formatCairoAttendanceTime(data.openAttendance.checkInAt)} on ${dateLabel(data.openAttendance.attendanceDate)}.`
                            : data.today
                              ? `${formatCairoAttendanceTime(data.today.checkInAt)} – ${formatCairoAttendanceTime(data.today.checkOutAt)} · ${formatAttendanceDuration(data.today.durationMinutes)}`
                              : "Clock actions record server time, not the time on your device."}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="lg"
                      className="min-h-12 w-full sm:w-auto sm:min-w-40"
                      disabled={
                        busy ||
                        !configured ||
                        !(canClockOut || canClockIn) ||
                        attendance.isError
                      }
                      onClick={() => void punch(canClockOut ? "out" : "in")}
                    >
                      {busy ? (
                        <Loader2
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : canClockOut ? (
                        <LogOut aria-hidden="true" />
                      ) : (
                        <LogIn aria-hidden="true" />
                      )}
                      {locating
                        ? "Getting fresh location…"
                        : busy
                          ? "Verifying attendance…"
                          : canClockOut
                            ? "Clock out"
                            : "Clock in"}
                    </Button>
                  </div>
                  {!data.employee?.isActive && (
                    <Notice title="Your employee record is inactive" error>
                      Clock actions are disabled. Your existing history remains
                      read-only.
                    </Notice>
                  )}
                  {actionError && (
                    <Notice title="Attendance action not completed" error>
                      {actionError}
                    </Notice>
                  )}
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Metric
                  label="Present days this month"
                  value={data.monthSummary.presentDays}
                  icon={CalendarDays}
                />
                <Metric
                  label="Completed days"
                  value={data.monthSummary.completedDays}
                  icon={CheckCircle2}
                />
                <Metric
                  label="Open records"
                  value={data.monthSummary.openDays}
                />
                <Metric
                  label="Tracked this month"
                  value={formatAttendanceDuration(
                    data.monthSummary.totalMinutes
                  )}
                  icon={Timer}
                />
              </div>
            </>
          )}
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            Office verification
          </CardTitle>
          <CardDescription>
            Attendance is accepted only after the server verifies the configured
            office policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <QueryState
            loading={verification.isLoading}
            error={verification.error}
            retry={verification.refetch}
            label="office verification"
          />
          {!verification.isLoading && !verification.isError && policy && (
            <>
              <Badge variant={configured ? "secondary" : "outline"}>
                {policy.method === "geofence"
                  ? "Geofence"
                  : policy.method === "strict_wifi"
                    ? "Strict office Wi-Fi"
                    : policy.method === "both"
                      ? "Geofence + strict Wi-Fi"
                      : "Method awaiting decision"}{" "}
                · {configured ? "Configured" : "Clock actions blocked"}
              </Badge>
              <p className="text-sm leading-6 text-muted-foreground">
                {policy.message}
              </p>
              {(policy.method === "strict_wifi" ||
                policy.method === "both") && (
                <Notice
                  title={
                    policy.allowed
                      ? "Server-side router verification"
                      : "Strict Wi-Fi verification unavailable — clocks blocked"
                  }
                >
                  Strict Wi-Fi requires a configured router/server integration.
                  This browser cannot prove which Wi-Fi network you are
                  connected to; a network name or SSID is not verification.
                </Notice>
              )}
              {(policy.method === "geofence" || policy.method === "both") && (
                <>
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    Office radius: {numberLabel(policy.radiusMeters, 0)} m ·
                    maximum location uncertainty:{" "}
                    {numberLabel(policy.maxAccuracyMeters, 0)} m.
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    “Configured” does not mean your location is accepted. At
                    each clock click we request a new high-accuracy device
                    position; the server checks the office boundary and
                    freshness.
                  </p>
                </>
              )}
            </>
          )}
          {captured && (
            <div role="status" className="rounded-xl border p-3 text-sm">
              <p className="font-medium">Fresh device location fetched</p>
              <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Latitude / longitude
                  </dt>
                  <dd className="tabular-nums">
                    {captured.latitude.toFixed(6)},{" "}
                    {captured.longitude.toFixed(6)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Accuracy / captured at
                  </dt>
                  <dd>
                    ±{numberLabel(captured.accuracy, 0)} m ·{" "}
                    {new Date(captured.capturedAt).toLocaleTimeString("en-GB")}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                This is a device reading, not a confirmation of server
                acceptance.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {!attendance.isLoading && !attendance.isError && data?.linked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My attendance history</CardTitle>
            <CardDescription>
              Most recent 20 records · Cairo time · read-only. No manual, test,
              or backdated punch controls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.history.length === 0 ? (
              <p className="py-5 text-sm text-muted-foreground">
                No attendance records yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Business date</TableHead>
                    <TableHead scope="col">Clock in</TableHead>
                    <TableHead scope="col">Clock out</TableHead>
                    <TableHead scope="col">Duration</TableHead>
                    <TableHead scope="col">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.map(
                    (record: {
                      id: number;
                      attendanceDate: string | Date;
                      checkInAt: Date;
                      checkOutAt: Date | null;
                      durationMinutes: number;
                      status: string;
                    }) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          {dateLabel(record.attendanceDate)}
                        </TableCell>
                        <TableCell>
                          {formatCairoAttendanceTime(record.checkInAt)}
                        </TableCell>
                        <TableCell>
                          {formatCairoAttendanceTime(record.checkOutAt)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAttendanceDuration(record.durationMinutes)}
                        </TableCell>
                        <TableCell>
                          <Status status={record.status} />
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LeaveHistory({
  requests,
  team = false,
  review,
}: {
  requests: LeaveRequest[];
  team?: boolean;
  review?: (request: LeaveRequest, decision: "approved" | "rejected") => void;
}) {
  if (!requests.length)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        {team
          ? "No vacation requests for this year."
          : "You have no vacation requests for this year."}
      </p>
    );
  return (
    <div className="space-y-3">
      {requests.map(request => (
        <div
          key={request.id}
          className="rounded-xl border border-border/70 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {team && (
                <p className="mb-1 font-semibold">
                  {request.employeeName ?? "Employee"}
                </p>
              )}
              <p className="text-sm font-medium">
                {dateLabel(request.fromDate)} – {dateLabel(request.toDate)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {numberLabel(request.requestedDays)} leave days · Request #
                {request.id} · submitted {dateLabel(request.createdAt)}
              </p>
            </div>
            <Status status={request.status} />
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
            {request.reason}
          </p>
          {request.decisionReason && (
            <div className="mt-3 rounded-lg bg-muted/35 p-3 text-sm">
              <p className="font-medium">
                Decision reason
                {request.reviewedAt
                  ? ` · ${dateLabel(request.reviewedAt)}`
                  : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                {request.decisionReason}
              </p>
            </div>
          )}
          {review && request.status === "pending" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => review(request, "approved")}
              >
                <CheckCircle2 aria-hidden="true" />
                Review & approve
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => review(request, "rejected")}
              >
                Review & reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function HolidayList({
  holidays,
  remove,
}: {
  holidays: Holiday[];
  remove?: (holiday: Holiday) => void;
}) {
  if (!holidays.length)
    return (
      <p className="text-sm text-muted-foreground">
        No public holidays configured for this year.
      </p>
    );
  return (
    <ul className="space-y-2">
      {holidays.map(holiday => (
        <li
          key={holiday.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
        >
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{holiday.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dateLabel(holiday.holidayDate)}
            </p>
          </div>
          {remove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="min-h-11 min-w-11"
              aria-label={`Remove holiday ${holiday.name}`}
              disabled={dateKey(holiday.holidayDate) <= getCairoBusinessDate()}
              title={
                dateKey(holiday.holidayDate) <= getCairoBusinessDate()
                  ? "Today's and historical holidays are protected"
                  : "Remove future holiday"
              }
              onClick={() => remove(holiday)}
            >
              <Trash2 aria-hidden="true" className="text-destructive" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
function YearInput({
  year,
  onChange,
}: {
  year: number;
  onChange: (year: number) => void;
}) {
  return (
    <Field label="Leave year">
      <Input
        type="number"
        min={2020}
        max={2100}
        step={1}
        value={year}
        onChange={event => {
          const value = Number(event.target.value);
          if (Number.isInteger(value) && value >= 2020 && value <= 2100)
            onChange(value);
        }}
        className="mt-2 w-28"
      />
    </Field>
  );
}
function VacationRequests() {
  const today = getCairoBusinessDate();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const input = useMemo(() => ({ year }), [year]);
  const mine = trpc.hr.leave.mine.useQuery(input);
  const create = trpc.hr.leave.create.useMutation();
  const utils = trpc.useUtils();
  const data = mine.data;
  const selected: DateRange | undefined = validDate(fromDate)
    ? {
        from: calendarDate(fromDate),
        to: validDate(toDate) ? calendarDate(toDate) : undefined,
      }
    : undefined;
  const holidays = (data?.holidays ?? []) as Holiday[];
  const balance = data?.balances.find((item: Balance) => item.year === year);
  const invalidRange = rangeError(fromDate, toDate);

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    if (create.isPending || !data?.linked || mine.isError) return;
    setFormError(null);
    if (invalidRange || fromDate < today || reason.trim().length < 3) {
      setFormError(
        invalidRange ??
          (fromDate < today
            ? "Vacation requests must start today or later."
            : "Enter a reason of at least 3 characters for your request.")
      );
      return;
    }
    try {
      const result = await create.mutateAsync({
        fromDate,
        toDate,
        reason: reason.trim(),
      });
      setSubmittedId(result.id);
      setYear(Number(fromDate.slice(0, 4)));
      setReason("");
      setFromDate("");
      setToDate("");
      toast.success("Vacation request submitted for approval.");
      await utils.hr.leave.mine.invalidate();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  return (
    <div className="space-y-5">
      <YearInput
        year={year}
        onChange={value => {
          setYear(value);
          setSubmittedId(null);
        }}
      />
      <QueryState
        loading={mine.isLoading}
        error={mine.error}
        retry={mine.refetch}
        label="your vacation balances and requests"
      />
      {!mine.isLoading &&
        !mine.isError &&
        data &&
        (!data.linked ? (
          <UnlinkedProfile />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric
                label={`${year} entitlement`}
                value={balance ? numberLabel(balance.totalDays) : "Not set"}
                icon={CalendarDays}
              />
              <Metric
                label="Approved days used"
                value={balance ? numberLabel(balance.usedDays) : "—"}
                icon={CheckCircle2}
              />
              <Metric
                label="Remaining days"
                value={balance ? numberLabel(balance.remainingDays) : "—"}
                icon={Timer}
              />
            </div>
            {submittedId !== null && (
              <Notice
                title={`Request #${submittedId} submitted — pending review`}
              >
                Only an authorized HR administrator can approve or reject it.
                Submitting a request does not grant leave.
              </Notice>
            )}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Request vacation</CardTitle>
                  <CardDescription>
                    Select your date range and provide a reason. Working-day
                    counts and balances are calculated by the server, excluding
                    configured weekends and holidays.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={event => void submitRequest(event)}
                    className="space-y-4"
                  >
                    <fieldset disabled={create.isPending} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="From">
                          <Input
                            type="date"
                            className="mt-2"
                            min={today}
                            value={fromDate}
                            onChange={event => setFromDate(event.target.value)}
                            required
                          />
                        </Field>
                        <Field label="To">
                          <Input
                            type="date"
                            className="mt-2"
                            min={fromDate || today}
                            value={toDate}
                            onChange={event => setToDate(event.target.value)}
                            required
                          />
                        </Field>
                      </div>
                      <div className="flex justify-center overflow-x-auto rounded-xl border">
                        <Calendar
                          mode="range"
                          selected={selected}
                          onSelect={range => {
                            setFromDate(
                              range?.from ? calendarKey(range.from) : ""
                            );
                            setToDate(range?.to ? calendarKey(range.to) : "");
                          }}
                          disabled={{ before: calendarDate(today) }}
                          modifiers={{
                            holiday: holidays.map(holiday =>
                              calendarDate(dateKey(holiday.holidayDate))
                            ),
                          }}
                          modifiersClassNames={{
                            holiday:
                              "underline decoration-primary decoration-2 underline-offset-4",
                          }}
                          defaultMonth={calendarDate(today)}
                          aria-label="Select a vacation date range"
                        />
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Underlined dates are configured public holidays. The
                        official requested-day count is shown after submission;
                        selecting calendar dates does not reserve leave.
                      </p>
                      <Field label="Reason">
                        <Textarea
                          className="mt-2 min-h-24"
                          value={reason}
                          onChange={event => setReason(event.target.value)}
                          required
                          minLength={3}
                          maxLength={1000}
                          placeholder="Describe your vacation request"
                        />
                      </Field>
                    </fieldset>
                    {formError && (
                      <Notice title="Request not submitted" error>
                        {formError}
                      </Notice>
                    )}
                    <Button
                      type="submit"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={
                        create.isPending ||
                        reason.trim().length < 3 ||
                        Boolean(invalidRange) ||
                        fromDate < today
                      }
                    >
                      {create.isPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <CalendarDays aria-hidden="true" />
                      )}
                      {create.isPending ? "Submitting…" : "Submit for approval"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Public holidays · {year}
                  </CardTitle>
                  <CardDescription>
                    Shared holiday calendar; no employee or salary data.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <HolidayList holidays={holidays} />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  My request history · {year}
                </CardTitle>
                <CardDescription>
                  Your own requests only. Pending requests remain pending until
                  HR reviews them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LeaveHistory requests={data.requests as LeaveRequest[]} />
              </CardContent>
            </Card>
          </>
        ))}
    </div>
  );
}

type AdminEdit =
  | { kind: "schedule" | "salary" | "entitlement"; employee: Employee }
  | { kind: "review"; request: LeaveRequest; decision: "approved" | "rejected" }
  | { kind: "removeHoliday"; holiday: Holiday };
function HrAdmin() {
  // This component is mounted ONLY after both exact identity and hr.access verification.
  const { user } = useAuth();
  const today = getCairoBusinessDate();
  const [filters, setFilters] = useState(() => ({
    ...cycleFor(today),
    year: Number(today.slice(0, 4)),
  }));
  const [draft, setDraft] = useState(filters);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [edit, setEdit] = useState<AdminEdit | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const overview = trpc.hr.admin.overview.useQuery(filters, {
    enabled: !rangeError(filters.from, filters.to),
  });
  const settings = trpc.hr.admin.settings.useQuery(undefined);
  const saveHoliday = trpc.hr.admin.saveHoliday.useMutation();
  const employees = (overview.data?.employees ?? []) as Employee[];
  const requests = (overview.data?.requests ?? []) as LeaveRequest[];
  const visibleEmployees = employees.filter(employee =>
    employee.name.toLowerCase().includes(employeeFilter.trim().toLowerCase())
  );
  const unappliedFilters =
    draft.from !== filters.from ||
    draft.to !== filters.to ||
    draft.year !== filters.year;
  const exportDisabled =
    exportingPdf ||
    overview.isFetching ||
    overview.isError ||
    !overview.data ||
    unappliedFilters;
  const pending = requests.filter(request => request.status === "pending");
  async function exportReport(selected: Employee[]) {
    if (exportDisabled || !selected.length) return;
    setExportingPdf(true);
    try {
      // Export the exact loaded server preview, never un-applied date inputs.
      const report = {
        from: filters.from,
        to: filters.to,
        employees: selected,
        generatedBy: user?.name || "HR Administrator",
      };
      const { exportHrAttendancePdf } = await import("@/lib/hrAttendancePdf");
      await exportHrAttendancePdf(report);
      toast.success("HR attendance PDF downloaded.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExportingPdf(false);
    }
  }
  function apply(next: typeof filters) {
    const error = rangeError(next.from, next.to);
    if (
      error ||
      !Number.isInteger(next.year) ||
      next.year < 2020 ||
      next.year > 2100
    ) {
      setFilterError(error ?? "Choose a leave year from 2020 to 2100.");
      return;
    }
    setFilterError(null);
    setFilters(next);
    setDraft(next);
  }
  async function addHoliday(event: React.FormEvent) {
    event.preventDefault();
    if (saveHoliday.isPending) return;
    setHolidayError(null);
    if (!validDate(holidayDate) || holidayName.trim().length < 2) {
      setHolidayError("Choose a valid holiday date and enter its name.");
      return;
    }
    try {
      await saveHoliday.mutateAsync({ holidayDate, name: holidayName.trim() });
      setHolidayDate("");
      setHolidayName("");
      toast.success("Public holiday saved.");
      await utils.hr.admin.overview.invalidate();
      await utils.hr.leave.mine.invalidate();
    } catch (error) {
      setHolidayError(errorMessage(error));
    }
  }
  return (
    <div className="space-y-5">
      <Notice title="Payroll preview only — no automatic deductions or payments">
        HR calculates an auditable preview. It does not create expenses, post
        payroll, deduct salary automatically, or mark salary receipts paid.
        Financial remains the salary source of truth.
      </Notice>
      <HrEmployeeOnboarding />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review period</CardTitle>
          <CardDescription>
            Payroll cycle: 27th of the previous month through 26th of the
            current month. Preview dates may include future days; evaluated days
            are reported separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={event => {
              event.preventDefault();
              apply(draft);
            }}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="From">
                <Input
                  type="date"
                  className="mt-2"
                  value={draft.from}
                  onChange={event =>
                    setDraft({ ...draft, from: event.target.value })
                  }
                  required
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  className="mt-2"
                  value={draft.to}
                  onChange={event =>
                    setDraft({ ...draft, to: event.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Leave / holiday year">
                <Input
                  type="number"
                  className="mt-2"
                  value={draft.year}
                  min={2020}
                  max={2100}
                  step={1}
                  onChange={event =>
                    setDraft({ ...draft, year: Number(event.target.value) })
                  }
                  required
                />
              </Field>
              <Button type="submit" className="min-h-11 self-end">
                Apply filters
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() =>
                  apply({ ...cycleFor(today), year: Number(today.slice(0, 4)) })
                }
              >
                Current month's cycle
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  const cycle = cycleFor(today, true);
                  apply({ ...cycle, year: Number(cycle.to.slice(0, 4)) });
                }}
              >
                Last completed cycle
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() =>
                  apply({
                    from: `${today.slice(0, 4)}-01-01`,
                    to: today,
                    year: Number(today.slice(0, 4)),
                  })
                }
              >
                Year to date
              </Button>
            </div>
            {filterError && (
              <Notice title="Filters not applied" error>
                {filterError}
              </Notice>
            )}
            <p className="text-xs text-muted-foreground">
              Applied: {dateLabel(filters.from)} – {dateLabel(filters.to)} ·
              leave year {filters.year} · maximum 366 days.
            </p>
          </form>
        </CardContent>
      </Card>
      <QueryState
        loading={overview.isLoading}
        error={overview.error}
        retry={overview.refetch}
        label="the team and payroll preview"
      />
      {!overview.isLoading && !overview.isError && overview.data && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric label="Employees" value={employees.length} icon={Users} />
            <Metric
              label="Pending vacation requests"
              value={pending.length}
              icon={CalendarDays}
            />
            <Metric
              label="Preview deductions (EGP)"
              value={numberLabel(
                employees.reduce(
                  (sum, employee) =>
                    sum + Number(employee.payroll.totalDeduction || 0),
                  0
                )
              )}
              icon={Wallet}
            />
            <Metric
              label="Lost hours (preview)"
              value={numberLabel(
                employees.reduce(
                  (sum, employee) =>
                    sum + Number(employee.payroll.lostHours || 0),
                  0
                )
              )}
              icon={Timer}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Vacation approval queue · {filters.year}
              </CardTitle>
              <CardDescription>
                Every approval and rejection requires an explicit reason. The
                server validates availability and updates the annual balance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pending.length ? (
                <LeaveHistory
                  requests={pending}
                  team
                  review={(request, decision) =>
                    setEdit({ kind: "review", request, decision })
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pending requests.
                </p>
              )}
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer rounded-lg p-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  All vacation decisions and request history ({requests.length})
                </summary>
                <div className="mt-3">
                  <LeaveHistory requests={requests} team />
                </div>
              </details>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">
                  Team payroll preview
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={exportDisabled || !visibleEmployees.length}
                  onClick={() => void exportReport(visibleEmployees)}
                >
                  {exportingPdf ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <FileDown aria-hidden="true" />
                  )}
                  {exportingPdf ? "Preparing PDF…" : "Export attendance PDF"}
                </Button>
              </div>
              <CardDescription>
                Daily salary = monthly salary ÷ 30, always. EGP 10,000 gives EGP
                333.33 per day. Hourly and minute rates use the scheduled
                working duration; calculations keep full precision until final
                monetary rounding. No schedule means no deductions. Three
                finalized incomplete attendance days convert to one deduction
                day.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Find employee">
                <Input
                  type="search"
                  className="mt-2"
                  value={employeeFilter}
                  onChange={event => setEmployeeFilter(event.target.value)}
                  placeholder="Search by employee name"
                />
              </Field>
              <p className="text-xs leading-5 text-muted-foreground">
                PDF exports include the applied period (
                {dateLabel(filters.from)} – {dateLabel(filters.to)}), visible
                employees, late and absence minutes, hours, equivalent days and
                a daily attendance sheet. Approved vacation is excluded from
                penalties. Deductions remain previews only.
                {unappliedFilters &&
                  " Apply your changed dates before exporting."}
              </p>
              {!visibleEmployees.length ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {employees.length
                    ? "No employees match your search."
                    : "No employees available."}
                </p>
              ) : (
                visibleEmployees.map(employee => (
                  <EmployeePreview
                    key={employee.id}
                    employee={employee}
                    today={today}
                    year={filters.year}
                    edit={kind => setEdit({ kind, employee })}
                    exportPdf={() => void exportReport([employee])}
                    exportDisabled={exportDisabled}
                  />
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Public holidays · {filters.year}
              </CardTitle>
              <CardDescription>
                Configured holidays are excluded by the server from applicable
                leave and scheduled working-day calculations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={event => void addHoliday(event)}
                className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
              >
                <Field label="Holiday date">
                  <Input
                    type="date"
                    className="mt-2"
                    value={holidayDate}
                    onChange={event => setHolidayDate(event.target.value)}
                    required
                    disabled={saveHoliday.isPending}
                  />
                </Field>
                <Field label="Holiday name">
                  <Input
                    className="mt-2"
                    value={holidayName}
                    onChange={event => setHolidayName(event.target.value)}
                    required
                    minLength={2}
                    maxLength={160}
                    disabled={saveHoliday.isPending}
                  />
                </Field>
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={
                    saveHoliday.isPending ||
                    holidayName.trim().length < 2 ||
                    !validDate(holidayDate)
                  }
                >
                  {saveHoliday.isPending ? "Saving…" : "Save holiday"}
                </Button>
              </form>
              {holidayError && (
                <Notice title="Holiday not saved" error>
                  {holidayError}
                </Notice>
              )}
              <HolidayList
                holidays={overview.data.holidays as Holiday[]}
                remove={holiday => setEdit({ kind: "removeHoliday", holiday })}
              />
            </CardContent>
          </Card>
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Attendance verification settings
          </CardTitle>
          <CardDescription>
            Office-location verification is the approved first-release policy.
            Both clock actions require a fresh, accurate device location. Any
            subsequent policy change requires an explicit administrator save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            loading={settings.isLoading}
            error={settings.error}
            retry={settings.refetch}
            label="attendance verification settings"
          />
          {!settings.isLoading && !settings.isError && settings.data && (
            <VerificationForm
              settings={settings.data as VerificationSettings}
            />
          )}
          {!settings.isLoading && !settings.isError && !settings.data && (
            <Notice title="Verification settings unavailable">
              Clock actions must remain blocked until server-side settings are
              configured.
            </Notice>
          )}
        </CardContent>
      </Card>
      <PunchAttemptsAudit />
      {edit && (
        <AdminEditDialog
          key={`${edit.kind}-${"employee" in edit ? edit.employee.id : "request" in edit ? edit.request.id : edit.holiday.id}`}
          edit={edit}
          year={filters.year}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function EmployeePreview({
  employee,
  today,
  year,
  edit,
  exportPdf,
  exportDisabled,
}: {
  employee: Employee;
  today: string;
  year: number;
  edit: (kind: "schedule" | "salary" | "entitlement") => void;
  exportPdf: () => void;
  exportDisabled: boolean;
}) {
  const payroll = employee.payroll;
  const schedules = [...employee.schedules].sort((a, b) =>
    dateKey(b.effectiveFrom).localeCompare(dateKey(a.effectiveFrom))
  );
  const current = schedules.find(
    schedule => dateKey(schedule.effectiveFrom) <= today
  );
  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{employee.name}</h3>
            <Badge variant="outline">
              {employee.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            CRM user ID: {employee.crmUserId ?? "Not linked"} · employee #
            {employee.id}
          </p>
          <p className="mt-2 text-sm">
            Financial-owned salary:{" "}
            <strong className="tabular-nums">{money(employee.salary)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={exportDisabled}
            onClick={exportPdf}
          >
            <FileDown aria-hidden="true" /> Employee PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => edit("schedule")}
          >
            <Pencil aria-hidden="true" />
            Schedule
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => edit("salary")}
          >
            Salary
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => edit("entitlement")}
          >
            Annual entitlement
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Effective schedule today
          </p>
          <p className="mt-1">
            {current
              ? `${current.startTime.slice(0, 5)} – ${current.endTime.slice(0, 5)} · ${current.graceMinutes} min grace`
              : "No effective schedule — no deductions"}
          </p>
          {current && (
            <p className="mt-1 text-xs text-muted-foreground">
              Effective from {dateLabel(current.effectiveFrom)}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Annual leave · {year}
          </p>
          <p className="mt-1">
            {employee.leaveBalance
              ? `${numberLabel(employee.leaveBalance.totalDays)} total · ${numberLabel(employee.leaveBalance.usedDays)} used · ${numberLabel(employee.leaveBalance.remainingDays)} remaining`
              : "Entitlement not configured"}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
        {(
          [
            [
              "Scheduled days in selected range",
              numberLabel(payroll.workingDays, 0),
            ],
            ["Evaluated days", numberLabel(payroll.evaluatedDays, 0)],
            [
              "Late / early minutes",
              `${numberLabel(payroll.lateMinutes, 0)} / ${numberLabel(payroll.earlyMinutes, 0)}`,
            ],
            ["Absent days", numberLabel(payroll.absentDays, 0)],
            ["Incomplete days", numberLabel(payroll.incompleteDays, 0)],
            [
              "Incomplete → deduction days (3:1)",
              numberLabel(payroll.incompleteDeductionDays),
            ],
            [
              "Lost minutes → hours",
              `${numberLabel(payroll.totalLostMinutes)} min → ${numberLabel(payroll.lostHours)} h`,
            ],
            ["Equivalent deduction days", numberLabel(payroll.equivalentDays)],
            ["Latest cycle daily rate", money(payroll.dailyRate)],
            [
              "Latest cycle hourly / minute rate",
              `${money(payroll.hourlyRate)} / ${money(payroll.minuteRate)}`,
            ],
            ["Covered base salary preview", money(payroll.coveredBaseSalary)],
            ["Deduction preview", money(payroll.totalDeduction)],
            ["Covered net salary preview", money(payroll.netSalary)],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Each 27th–26th payroll cycle uses its own effective Financial monthly
        salary ÷ 30 for daily deductions, never divided by workdays. A full
        configured cycle keeps its full monthly base; selected partial periods
        use the fixed daily rate for configured calendar days, capped at the
        monthly salary. Informational rates above refer to the latest cycle.
        Paid leave and approved rollout credits have no penalties. Future shifts
        and unconfigured dates have no deductions. These are previews only; no
        payroll payment or salary deduction is posted.
      </p>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer rounded-lg p-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Payroll cycles, daily breakdown & schedule history
        </summary>
        <div className="mt-3 space-y-3">
          {payroll.cycleBreakdown?.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payroll cycle</TableHead>
                  <TableHead>Monthly salary</TableHead>
                  <TableHead>Full-cycle working days</TableHead>
                  <TableHead>Covered days</TableHead>
                  <TableHead>Covered base (30-day basis)</TableHead>
                  <TableHead>Deduction preview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payroll.cycleBreakdown.map(cycle => (
                  <TableRow key={cycle.from}>
                    <TableCell>
                      {dateLabel(cycle.from)} – {dateLabel(cycle.to)}
                    </TableCell>
                    <TableCell>{money(cycle.salary)}</TableCell>
                    <TableCell>{cycle.fullCycleWorkingDays}</TableCell>
                    <TableCell>{cycle.workingDays}</TableCell>
                    <TableCell>{money(cycle.coveredBaseSalary)}</TableCell>
                    <TableCell>{money(cycle.totalDeduction)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {payroll.days.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Date</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Late min</TableHead>
                  <TableHead scope="col">Early min</TableHead>
                  <TableHead scope="col">Missing min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payroll.days.map(day => (
                  <TableRow key={day.date}>
                    <TableCell>{dateLabel(day.date)}</TableCell>
                    <TableCell>
                      <Status status={day.status} />
                    </TableCell>
                    <TableCell>{numberLabel(day.lateMinutes, 0)}</TableCell>
                    <TableCell>{numberLabel(day.earlyMinutes, 0)}</TableCell>
                    <TableCell>{numberLabel(day.missingMinutes, 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No evaluated daily records for this period.
            </p>
          )}
          <h4 className="text-sm font-medium">
            Read-only effective schedule history
          </h4>
          {schedules.length ? (
            <ul className="space-y-2">
              {schedules.map(schedule => (
                <li key={schedule.id} className="rounded-lg border p-3 text-sm">
                  {schedule.startTime.slice(0, 5)} –{" "}
                  {schedule.endTime.slice(0, 5)} · {schedule.graceMinutes} min
                  grace · from {dateLabel(schedule.effectiveFrom)}
                  {dateKey(schedule.effectiveFrom) > today && (
                    <Badge variant="outline" className="ml-2">
                      Upcoming
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No schedule configured. No schedule-based deductions.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

function AdminEditDialog({
  edit,
  year,
  onClose,
}: {
  edit: AdminEdit;
  year: number;
  onClose: () => void;
}) {
  const today = getCairoBusinessDate();
  const id = useId();
  const employee = "employee" in edit ? edit.employee : null;
  const schedule = employee?.schedules
    .filter(item => dateKey(item.effectiveFrom) <= today)
    .sort((a, b) =>
      dateKey(b.effectiveFrom).localeCompare(dateKey(a.effectiveFrom))
    )[0];
  const [startTime, setStartTime] = useState(
    schedule?.startTime.slice(0, 5) ?? "09:00"
  );
  const [endTime, setEndTime] = useState(
    schedule?.endTime.slice(0, 5) ?? "17:00"
  );
  const [graceMinutes, setGraceMinutes] = useState(
    String(schedule?.graceMinutes ?? 0)
  );
  const [amount, setAmount] = useState(
    String(
      employee
        ? edit.kind === "salary"
          ? employee.salary
          : (employee.leaveBalance?.totalDays ?? "")
        : ""
    )
  );
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const saveSchedule = trpc.hr.admin.saveSchedule.useMutation();
  const saveSalary = trpc.hr.admin.saveSalary.useMutation();
  const saveEntitlement = trpc.hr.admin.saveEntitlement.useMutation();
  const reviewLeave = trpc.hr.admin.reviewLeave.useMutation();
  const removeHoliday = trpc.hr.admin.removeHoliday.useMutation();
  const busy =
    saveSchedule.isPending ||
    saveSalary.isPending ||
    saveEntitlement.isPending ||
    reviewLeave.isPending ||
    removeHoliday.isPending;
  const effectiveEdit = edit.kind === "salary" || edit.kind === "schedule";
  const title =
    edit.kind === "schedule"
      ? "Change work schedule"
      : edit.kind === "salary"
        ? "Change Financial salary"
        : edit.kind === "entitlement"
          ? "Set annual leave entitlement"
          : edit.kind === "removeHoliday"
            ? "Remove public holiday"
            : edit.kind === "review"
              ? `${edit.decision === "approved" ? "Approve" : "Reject"} vacation request`
              : "HR change";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    if (reason.trim().length < 3) {
      setFormError("Enter a reason of at least 3 characters for this change.");
      return;
    }
    if (
      effectiveEdit &&
      (!validDate(effectiveFrom) || effectiveFrom < getCairoBusinessDate())
    ) {
      setFormError(
        "The effective date must be today or later. Historical records cannot be rewritten."
      );
      return;
    }
    try {
      switch (edit.kind) {
        case "schedule": {
          if (
            !/^\d{2}:\d{2}$/.test(startTime) ||
            !/^\d{2}:\d{2}$/.test(endTime) ||
            endTime <= startTime
          )
            throw new Error(
              "Choose a valid schedule with end time after start time."
            );
          const grace = Number(graceMinutes);
          if (
            graceMinutes.trim() === "" ||
            !Number.isInteger(grace) ||
            grace < 0 ||
            grace > 120
          )
            throw new Error(
              "Grace must be a whole number between 0 and 120 minutes."
            );
          await saveSchedule.mutateAsync({
            employeeId: edit.employee.id,
            startTime,
            endTime,
            graceMinutes: grace,
            effectiveFrom,
            reason: reason.trim(),
          });
          break;
        }
        case "salary": {
          const salary = Number(amount);
          if (
            amount.trim() === "" ||
            !Number.isFinite(salary) ||
            salary < 0 ||
            salary > 1e8
          )
            throw new Error("Enter a salary amount from 0 to 100,000,000 EGP.");
          await saveSalary.mutateAsync({
            employeeId: edit.employee.id,
            salary,
            effectiveFrom,
            reason: reason.trim(),
          });
          break;
        }
        case "entitlement": {
          const totalDays = Number(amount);
          if (
            amount.trim() === "" ||
            !Number.isInteger(totalDays) ||
            totalDays < 0 ||
            totalDays > 366
          )
            throw new Error(
              "Enter an annual entitlement of 0 to 366 whole days."
            );
          await saveEntitlement.mutateAsync({
            employeeId: edit.employee.id,
            year,
            totalDays,
            reason: reason.trim(),
          });
          break;
        }
        case "review":
          await reviewLeave.mutateAsync({
            requestId: edit.request.id,
            decision: edit.decision,
            reason: reason.trim(),
          });
          break;
        case "removeHoliday":
          await removeHoliday.mutateAsync({
            id: edit.holiday.id,
            reason: reason.trim(),
          });
          break;
      }
      toast.success(
        edit.kind === "review"
          ? `Vacation request ${edit.decision}.`
          : "HR change saved."
      );
      await Promise.all([
        utils.hr.admin.overview.invalidate(),
        utils.hr.leave.mine.invalidate(),
      ]);
      onClose();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        showCloseButton={!busy}
        onEscapeKeyDown={event => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {employee
              ? `${employee.name} · Employee #${employee.id}`
              : edit.kind === "review"
                ? `${edit.request.employeeName ?? "Employee"} · Request #${edit.request.id}`
                : edit.kind === "removeHoliday"
                  ? `${edit.holiday.name} · ${dateLabel(edit.holiday.holidayDate)}`
                  : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={event => void save(event)} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            {edit.kind === "schedule" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start time (Cairo)">
                  <Input
                    className="mt-2"
                    type="time"
                    value={startTime}
                    onChange={event => setStartTime(event.target.value)}
                    required
                  />
                </Field>
                <Field label="End time (Cairo)">
                  <Input
                    className="mt-2"
                    type="time"
                    value={endTime}
                    onChange={event => setEndTime(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Grace minutes">
                  <Input
                    className="mt-2"
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={graceMinutes}
                    onChange={event => setGraceMinutes(event.target.value)}
                    required
                  />
                </Field>
              </div>
            )}
            {edit.kind === "salary" && (
              <>
                <Notice title="This changes the Financial-owned salary">
                  The effective salary change is saved through the existing
                  Financial salary ledger with your reason. It does not post
                  payroll, pay salary, or apply preview deductions
                  automatically.
                </Notice>
                <Field label="Monthly salary (EGP)">
                  <Input
                    className="mt-2"
                    type="number"
                    min={0}
                    max={1e8}
                    step="0.01"
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                    required
                  />
                </Field>
              </>
            )}
            {edit.kind === "entitlement" && (
              <Field
                label={`Annual entitlement · ${year} (days)`}
                hint="This updates the selected year's entitlement; used days remain server-controlled."
              >
                <Input
                  className="mt-2"
                  type="number"
                  min={0}
                  max={366}
                  step={1}
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  required
                />
              </Field>
            )}
            {effectiveEdit && (
              <Field
                label="Effective from"
                hint="Today or a future Cairo business date only. Previous schedules and salary rates stay in history."
              >
                <Input
                  className="mt-2"
                  type="date"
                  min={today}
                  value={effectiveFrom}
                  onChange={event => setEffectiveFrom(event.target.value)}
                  required
                />
              </Field>
            )}
            {edit.kind === "review" && (
              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">
                  {dateLabel(edit.request.fromDate)} –{" "}
                  {dateLabel(edit.request.toDate)} ·{" "}
                  {numberLabel(edit.request.requestedDays)} days
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                  {edit.request.reason}
                </p>
              </div>
            )}
            {edit.kind === "removeHoliday" && (
              <Notice title="Removing this holiday changes future previews">
                This affects the configured holiday calendar and applicable
                server calculations. Attendance records are not edited.
              </Notice>
            )}
            <div className="space-y-2">
              <Label htmlFor={`${id}-reason`}>
                Required {edit.kind === "review" ? "decision" : "change"} reason
              </Label>
              <Textarea
                id={`${id}-reason`}
                className="min-h-24"
                value={reason}
                onChange={event => setReason(event.target.value)}
                required
                minLength={3}
                maxLength={1000}
                placeholder="Explain the decision or change for the audit history"
              />
            </div>
          </fieldset>
          {formError && (
            <Notice title="Change not saved" error>
              {formError}
            </Notice>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={
                edit.kind === "removeHoliday" ||
                (edit.kind === "review" && edit.decision === "rejected")
                  ? "destructive"
                  : "default"
              }
              className="min-h-11"
              disabled={busy || reason.trim().length < 3}
            >
              {busy
                ? "Saving…"
                : edit.kind === "review"
                  ? `Confirm ${edit.decision === "approved" ? "approval" : "rejection"}`
                  : "Save change"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VerificationForm({ settings }: { settings: VerificationSettings }) {
  const [method, setMethod] = useState<VerificationMethod>(
    ["pending", "geofence", "strict_wifi", "both"].includes(
      settings.verificationMethod
    )
      ? (settings.verificationMethod as VerificationMethod)
      : "pending"
  );
  // Coordinate defaults come from the server settings; never invent an office location.
  const [latitude, setLatitude] = useState(
    settings.officeLatitude == null ? "" : String(settings.officeLatitude)
  );
  const [longitude, setLongitude] = useState(
    settings.officeLongitude == null ? "" : String(settings.officeLongitude)
  );
  const [radius, setRadius] = useState(String(settings.radiusMeters));
  const [accuracy, setAccuracy] = useState(String(settings.maxAccuracyMeters));
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const save = trpc.hr.admin.saveVerification.useMutation();
  const utils = trpc.useUtils();
  const geo = method === "geofence" || method === "both";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    const officeLatitude = Number(latitude),
      officeLongitude = Number(longitude),
      radiusMeters = Number(radius),
      maxAccuracyMeters = Number(accuracy);
    if (reason.trim().length < 3) {
      setFormError(
        "Enter a reason of at least 3 characters to change office verification."
      );
      return;
    }
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(officeLatitude) ||
      officeLatitude < -90 ||
      officeLatitude > 90 ||
      !Number.isFinite(officeLongitude) ||
      officeLongitude < -180 ||
      officeLongitude > 180 ||
      !radius.trim() ||
      !accuracy.trim() ||
      !Number.isInteger(radiusMeters) ||
      radiusMeters < 10 ||
      radiusMeters > 1000 ||
      !Number.isInteger(maxAccuracyMeters) ||
      maxAccuracyMeters < 5 ||
      maxAccuracyMeters > 300
    ) {
      setFormError(
        "Enter valid office coordinates, a whole-number radius from 10 to 1,000 meters, and maximum uncertainty from 5 to 300 meters. These settings must be explicit even when another method is selected."
      );
      return;
    }
    try {
      await save.mutateAsync({
        verificationMethod: method,
        officeLatitude,
        officeLongitude,
        radiusMeters,
        maxAccuracyMeters,
        reason: reason.trim(),
      });
      setReason("");
      toast.success(
        "Verification settings saved. Strict Wi-Fi still requires a configured router integration."
      );
      await Promise.all([
        utils.hr.admin.settings.invalidate(),
        utils.hr.attendance.verification.invalidate(),
      ]);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }
  return (
    <form onSubmit={event => void submit(event)} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Current server method:{" "}
        <strong>{settings.verificationMethod.replaceAll("_", " ")}</strong>
      </p>
      <fieldset disabled={save.isPending} className="space-y-4">
        <Field label="Verification method">
          <Select
            value={method}
            onValueChange={value => setMethod(value as VerificationMethod)}
          >
            <SelectTrigger
              className="mt-2 min-h-11 w-full"
              aria-label="Attendance verification method"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">
                Awaiting decision — block clocks
              </SelectItem>
              <SelectItem value="geofence">
                Geofence — fresh device location
              </SelectItem>
              <SelectItem value="strict_wifi">
                Strict office Wi-Fi — router verification
              </SelectItem>
              <SelectItem value="both">
                Geofence + strict office Wi-Fi
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <div
            className={cn(
              "rounded-xl border p-4",
              geo && "border-primary/40 bg-primary/5"
            )}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MapPin aria-hidden="true" className="h-4 w-4" />
              Geofence
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              A fresh high-accuracy location is required at each punch. The
              server validates office radius, uncertainty and freshness. A
              configured policy is not proof of presence.
            </p>
          </div>
          <div
            className={cn(
              "rounded-xl border p-4",
              (method === "strict_wifi" || method === "both") &&
                "border-primary/40 bg-primary/5"
            )}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Wifi aria-hidden="true" className="h-4 w-4" />
              Strict Wi-Fi
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Cannot verify until router/server integration is configured.
              Selecting this method alone cannot enable clocks. Browser-reported
              network names or typed SSIDs are not accepted as proof.
            </p>
          </div>
        </div>
        {(method === "strict_wifi" || method === "both") && (
          <Notice title="Strict Wi-Fi / combined clocks remain blocked without router integration">
            No router integration is configured by this form. Only the server's
            verification result can permit a punch. There is intentionally no
            SSID or fake network-name input.
          </Notice>
        )}
        {method === "pending" && (
          <Notice title="Awaiting method decision — clocks blocked">
            Saving pending settings preserves a closed verification policy.
            Choose a method only when authorized to activate it.
          </Notice>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Office latitude">
            <Input
              type="number"
              className="mt-2"
              min={-90}
              max={90}
              step="any"
              value={latitude}
              onChange={event => setLatitude(event.target.value)}
              required
            />
          </Field>
          <Field label="Office longitude">
            <Input
              type="number"
              className="mt-2"
              min={-180}
              max={180}
              step="any"
              value={longitude}
              onChange={event => setLongitude(event.target.value)}
              required
            />
          </Field>
          <Field label="Office radius (meters)">
            <Input
              type="number"
              className="mt-2"
              min={10}
              max={1000}
              step={1}
              value={radius}
              onChange={event => setRadius(event.target.value)}
              required
            />
          </Field>
          <Field label="Maximum location uncertainty (meters)">
            <Input
              type="number"
              className="mt-2"
              min={5}
              max={300}
              step={1}
              value={accuracy}
              onChange={event => setAccuracy(event.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Required configuration-change reason">
          <Textarea
            className="mt-2 min-h-24"
            value={reason}
            onChange={event => setReason(event.target.value)}
            required
            minLength={3}
            maxLength={1000}
          />
        </Field>
      </fieldset>
      {formError && (
        <Notice title="Settings not saved" error>
          {formError}
        </Notice>
      )}
      <Button
        type="submit"
        className="min-h-11"
        disabled={save.isPending || reason.trim().length < 3}
      >
        {save.isPending ? "Saving settings…" : "Save verification settings"}
      </Button>
    </form>
  );
}

function PunchAttemptsAudit() {
  const attempts = trpc.hr.admin.punchAttempts.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const [rejectedOnly, setRejectedOnly] = useState(true);
  const rows = (attempts.data ?? []).filter(
    attempt => !rejectedOnly || !attempt.accepted
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Attendance verification audit
        </CardTitle>
        <CardDescription>
          Most recent 100 server-recorded attempts. Rejected attempts are shown
          by default; exact personal coordinates are intentionally omitted.
          Fetch failures leave this audit unavailable, not empty.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={rejectedOnly}
              onChange={event => setRejectedOnly(event.target.checked)}
              className="h-4 w-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            Show rejected attempts only
          </Label>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={attempts.isFetching}
            onClick={() => void attempts.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            {attempts.isFetching ? "Refreshing…" : "Refresh audit"}
          </Button>
        </div>
        <QueryState
          loading={attempts.isLoading}
          error={attempts.error}
          retry={attempts.refetch}
          label="attendance verification attempts"
        />
        {!attempts.isLoading &&
          !attempts.isError &&
          (rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Time (Cairo)</TableHead>
                  <TableHead scope="col">CRM user ID</TableHead>
                  <TableHead scope="col">Action / result</TableHead>
                  <TableHead scope="col">Server reason</TableHead>
                  <TableHead scope="col">Distance / accuracy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(attempt => (
                  <TableRow key={attempt.id}>
                    <TableCell>
                      {new Date(attempt.createdAt).toLocaleString("en-GB", {
                        timeZone: "Africa/Cairo",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{attempt.userId}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p>Clock {attempt.action === "in" ? "in" : "out"}</p>
                        <Status
                          status={attempt.accepted ? "accepted" : "rejected"}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-56 max-w-md whitespace-normal break-words">
                      {attempt.reason}
                    </TableCell>
                    <TableCell>
                      <p>
                        {attempt.distanceMeters == null
                          ? "Distance not evaluated"
                          : `${numberLabel(attempt.distanceMeters, 0)} m from office`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {attempt.accuracyMeters == null
                          ? "No device accuracy"
                          : `±${numberLabel(attempt.accuracyMeters, 0)} m accuracy`}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              {rejectedOnly
                ? "No rejected attempts among the most recent 100 attempts."
                : "No verification attempts have been recorded."}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

import { useAuth } from "@/_core/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { isHrAdministrator } from "@shared/hrAccess";
import {
  AlertCircle,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useId, useRef, useState } from "react";

type OnboardingData = {
  employees: Array<{
    id: number;
    name: string;
    isActive: boolean;
    crmUserId: number | null;
    hrSelfServiceRequired: boolean;
    crmUserEmail: string | null;
  }>;
  users: Array<{
    id: number;
    name: string | null;
    email: string | null;
    linkedEmployeeId: number | null;
  }>;
  summary: { unlinkedEmployees: number; unlinkedUsers: number };
};

/** Embed only in HR Admin. Exact identity + server verification guard this UI;
 * the server must independently enforce the named-admin gate on both endpoints.
 * No employee directory query is mounted for ordinary staff.
 */
export function HrEmployeeOnboarding() {
  const { user } = useAuth();
  const namedAdministrator = isHrAdministrator(user);
  const access = trpc.hr.access.useQuery(undefined, {
    enabled: namedAdministrator,
    retry: false,
  });
  const canAdmin =
    namedAdministrator && !access.isError && access.data?.isHrAdmin === true;

  if (!canAdmin) return null;
  return <VerifiedEmployeeOnboarding />;
}

function VerifiedEmployeeOnboarding() {
  const id = useId();
  const utils = trpc.useUtils();
  const onboarding = trpc.hr.admin.onboarding.useQuery(undefined, {
    retry: false,
  });
  const linkEmployee = trpc.hr.admin.linkEmployee.useMutation();
  const [employeeId, setEmployeeId] = useState("");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const submissionLock = useRef(false);
  const data: OnboardingData | undefined = onboarding.data;
  const requiredEmployees = (data?.employees ?? []).filter(
    employee => employee.isActive && employee.hrSelfServiceRequired
  );
  const unlinkedEmployees = requiredEmployees.filter(
    employee => employee.crmUserId === null
  );
  const employeesNeedingAttention = requiredEmployees.filter(
    employee => !employee.crmUserEmail
  );
  const readyCount = requiredEmployees.filter(employee =>
    Boolean(employee.crmUserEmail)
  ).length;
  const exemptCount = (data?.employees ?? []).filter(
    employee => employee.isActive && !employee.hrSelfServiceRequired
  ).length;
  const unassignedUsers = (data?.users ?? []).filter(
    account => account.linkedEmployeeId === null
  );
  // Never infer identity from similar names, email domains, or account ordering.
  const selectedEmployee = unlinkedEmployees.find(
    employee => String(employee.id) === employeeId
  );
  const selectedUser = unassignedUsers.find(
    account => String(account.id) === userId
  );
  const busy = isSaving || linkEmployee.isPending;
  const unavailable =
    busy || onboarding.isFetching || onboarding.isError || !data;
  const canLink =
    !unavailable &&
    Boolean(selectedEmployee && selectedUser) &&
    reason.trim().length >= 3;

  async function handleLink() {
    if (
      submissionLock.current ||
      !canLink ||
      !selectedEmployee ||
      !selectedUser
    )
      return;
    submissionLock.current = true;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await linkEmployee.mutateAsync({
        employeeId: selectedEmployee.id,
        userId: selectedUser.id,
        reason: reason.trim(),
      });
      setEmployeeId("");
      setUserId("");
      setReason("");
      setSuccess(
        `CRM login linked to ${selectedEmployee.name}. HR administrator access is unchanged.`
      );
      try {
        await Promise.all([
          utils.hr.admin.onboarding.invalidate(),
          utils.hr.admin.overview.invalidate(),
          utils.hr.attendance.me.invalidate(),
          utils.hr.leave.mine.invalidate(),
        ]);
      } catch {
        setError(
          "The link was saved, but refreshed readiness could not be loaded. Use Refresh; do not submit the link again."
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not link this CRM login. Review the selections and try again."
      );
    } finally {
      submissionLock.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle
              id={`${id}-title`}
              className="flex items-center gap-2 text-base"
            >
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              Employee self-service readiness
            </CardTitle>
            <CardDescription>
              Named HR administrators only. Explicitly link each active internal
              employee to their own CRM login to enable HR self-service.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy || onboarding.isFetching}
            onClick={() => void onboarding.refetch()}
          >
            <RefreshCw
              className={
                onboarding.isFetching ? "size-4 animate-spin" : "size-4"
              }
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent
        className="min-w-0 space-y-5"
        aria-busy={onboarding.isFetching || busy}
      >
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Link identities, not permissions</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Account choice never grants HR admin access. Verify the actual
              employee and their CRM login; accounts may be secondary or
              external and are never automatically suggested or associated.
            </p>
            <p>
              Financial-only employees are intentionally exempt from HR
              self-service and do not need a CRM link. If a CRM account has no
              corresponding staff profile, an authorized administrator must
              create the proper linked employee in Financial. This screen never
              creates employees or zero-salary clones.
            </p>
          </AlertDescription>
        </Alert>

        {onboarding.isLoading && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading employee readiness…
          </p>
        )}
        {onboarding.isError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Readiness could not be loaded</AlertTitle>
            <AlertDescription>{onboarding.error.message}</AlertDescription>
          </Alert>
        )}

        {data && !onboarding.isError && (
          <>
            <dl
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              aria-label="Employee readiness summary"
            >
              <div className="rounded-xl border bg-muted/30 p-4">
                <dt className="text-sm text-muted-foreground">
                  Ready for HR self-service
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {readyCount} / {requiredEmployees.length}
                </dd>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <dt className="text-sm text-muted-foreground">
                  Employees needing a link
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {data.summary.unlinkedEmployees}
                </dd>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <dt className="text-sm text-muted-foreground">
                  Unassigned CRM accounts
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {data.summary.unlinkedUsers}
                </dd>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <dt className="text-sm text-muted-foreground">
                  Financial-only exemptions
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {exemptCount}
                </dd>
              </div>
            </dl>

            <section
              className="min-w-0 space-y-3"
              aria-labelledby={`${id}-employees`}
            >
              <h3 id={`${id}-employees`} className="text-sm font-semibold">
                Unlinked active internal employees
              </h3>
              <Table
                aria-label="Active internal employees needing a CRM link"
                className="min-w-[28rem]"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Readiness</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeesNeedingAttention.map(employee => (
                    <TableRow key={employee.id}>
                      <TableCell className="max-w-xs whitespace-normal break-words font-medium">
                        {employee.name}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        #{employee.id}
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-normal">
                        <Badge variant="outline">
                          {employee.crmUserId === null
                            ? "CRM login required"
                            : "Existing login unresolved"}
                        </Badge>
                        {employee.crmUserId !== null && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            CRM user #{employee.crmUserId} has no resolved login
                            email. Ask an administrator to review the existing
                            account; this screen cannot replace a link.
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {employeesNeedingAttention.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="whitespace-normal text-muted-foreground"
                      >
                        No active internal employees are waiting for a CRM link.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </section>

            <section
              className="min-w-0 space-y-3"
              aria-labelledby={`${id}-accounts`}
            >
              <h3 id={`${id}-accounts`} className="text-sm font-semibold">
                Unassigned CRM accounts — review only
              </h3>
              <p className="text-sm text-muted-foreground">
                Not every unassigned account represents a staff member. Leave
                secondary or external accounts unassigned unless their identity
                is confirmed.
              </p>
              <Table
                aria-label="Unassigned CRM accounts"
                className="min-w-[30rem]"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Account name</TableHead>
                    <TableHead>CRM login email</TableHead>
                    <TableHead>User ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassignedUsers.map(account => (
                    <TableRow key={account.id}>
                      <TableCell className="max-w-xs whitespace-normal break-words">
                        {account.name || "Unnamed account"}
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-normal break-all">
                        {account.email || "No email recorded"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        #{account.id}
                      </TableCell>
                    </TableRow>
                  ))}
                  {unassignedUsers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="whitespace-normal text-muted-foreground"
                      >
                        No unassigned CRM accounts.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </section>

            <section
              className="space-y-4 rounded-xl border bg-muted/20 p-4"
              aria-labelledby={`${id}-link`}
            >
              <div className="space-y-1">
                <h3 id={`${id}-link`} className="text-sm font-semibold">
                  Explicitly link an employee and CRM login
                </h3>
                <p className="text-sm text-muted-foreground">
                  Nothing is selected or submitted automatically. Confirm both
                  identities and record the reason before linking.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${id}-employee`}>
                    Employee needing HR self-service
                  </Label>
                  <Select
                    value={employeeId}
                    onValueChange={setEmployeeId}
                    disabled={unavailable || unlinkedEmployees.length === 0}
                  >
                    <SelectTrigger
                      id={`${id}-employee`}
                      className="w-full min-h-11"
                    >
                      <SelectValue placeholder="Select an employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {unlinkedEmployees.map(employee => (
                        <SelectItem
                          key={employee.id}
                          value={String(employee.id)}
                        >
                          {employee.name} — Employee #{employee.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${id}-user`}>Confirmed CRM login</Label>
                  <Select
                    value={userId}
                    onValueChange={setUserId}
                    disabled={unavailable || unassignedUsers.length === 0}
                  >
                    <SelectTrigger
                      id={`${id}-user`}
                      className="w-full min-h-11"
                    >
                      <SelectValue placeholder="Select a CRM login" />
                    </SelectTrigger>
                    <SelectContent>
                      {unassignedUsers.map(account => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.email || "No email recorded"} —{" "}
                          {account.name || "Unnamed account"} — User #
                          {account.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-reason`}>Reason for linking</Label>
                <Textarea
                  id={`${id}-reason`}
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  placeholder="Explain how you verified this employee owns the selected CRM login."
                  minLength={3}
                  rows={3}
                  disabled={unavailable}
                  aria-describedby={`${id}-reason-help`}
                />
                <p
                  id={`${id}-reason-help`}
                  className="text-xs text-muted-foreground"
                >
                  Required: at least 3 non-padding characters. The server
                  records this reason for audit.
                </p>
              </div>
              {selectedEmployee && selectedUser && (
                <p className="break-words text-sm" role="status">
                  Confirm: <strong>{selectedEmployee.name}</strong> (Employee #
                  {selectedEmployee.id}) ↔{" "}
                  <strong>{selectedUser.email || "No email recorded"}</strong> (
                  {selectedUser.name || "Unnamed account"}, User #
                  {selectedUser.id}). HR admin permissions remain unchanged.
                </p>
              )}
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto"
                disabled={!canLink}
                onClick={() => void handleLink()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 className="size-4" aria-hidden="true" />
                )}
                {busy ? "Linking CRM login…" : "Link CRM login"}
              </Button>
            </section>
          </>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Linking update</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <p role="status" className="text-sm text-primary">
            {success}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default HrEmployeeOnboarding;

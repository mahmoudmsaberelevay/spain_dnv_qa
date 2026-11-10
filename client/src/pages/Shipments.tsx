import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  EMPTY_SHIPMENT_FILTERS,
  isShipmentDriveUrl,
  shipmentDirectionLabel,
  shipmentEntrySchema,
  shipmentFiltersSchema,
  type ShipmentEntry,
  type ShipmentFilters,
  type ShipmentRecord,
  type ShipmentSortField,
} from "@shared/shipments";
import {
  AlertCircle,
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  ArrowUpRight,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  Filter,
  GripVertical,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { toast } from "sonner";

type ShipmentDraft = Omit<ShipmentEntry, "direction"> & {
  direction: "" | ShipmentEntry["direction"];
};
type FieldErrors = Partial<Record<keyof ShipmentDraft, string>>;
type FilterErrors = Partial<Record<keyof ShipmentFilters, string>>;
type ColumnKey = ShipmentSortField | "driveUrl" | "report";

const EMPTY_ENTRY: ShipmentDraft = {
  shipmentDate: "",
  companyName: "",
  shipmentNumber: "",
  direction: "",
  partyName: "",
  driveUrl: "",
  recordedByName: "",
  notificationEmail: "",
  notes: "",
};
const COLUMNS: {
  key: ColumnKey;
  label: string;
  width: number;
  min: number;
  max: number;
  sortable?: boolean;
}[] = [
  {
    key: "shipmentDate",
    label: "Date",
    width: 160,
    min: 140,
    max: 300,
    sortable: true,
  },
  {
    key: "companyName",
    label: "Company",
    width: 210,
    min: 130,
    max: 400,
    sortable: true,
  },
  {
    key: "shipmentNumber",
    label: "Shipment number",
    width: 190,
    min: 160,
    max: 360,
    sortable: true,
  },
  {
    key: "direction",
    label: "Direction",
    width: 185,
    min: 175,
    max: 300,
    sortable: true,
  },
  {
    key: "partyName",
    label: "Sender / recipient",
    width: 230,
    min: 170,
    max: 440,
    sortable: true,
  },
  { key: "driveUrl", label: "Documents", width: 155, min: 140, max: 320 },
  { key: "report", label: "Report", width: 120, min: 110, max: 220 },
];
const FILTER_FIELDS = [
  {
    key: "companyName",
    label: "Company",
    placeholder: "Any company",
    max: 200,
  },
  {
    key: "shipmentNumber",
    label: "Shipment number",
    placeholder: "Any shipment number",
    max: 100,
  },
  {
    key: "partyName",
    label: "Sender / recipient",
    placeholder: "Any name",
    max: 200,
  },
  {
    key: "driveUrl",
    label: "Drive link contains",
    placeholder: "Link text or file ID",
    max: 2000,
  },
] as const;

// Dates are calendar keys, not instants: formatting must never shift the shipment day.
function displayDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}
function fieldsFromIssues<K extends string>(
  issues: { path: PropertyKey[]; message: string }[]
): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0] as K;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function shipmentNotificationLabel(
  status: ShipmentRecord["notificationStatus"]
): string {
  switch (status) {
    case "not_requested":
      return "Not requested";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "unknown":
      return "Unknown";
    default:
      return "Not recorded";
  }
}
function shipmentSaveFeedback(status: ShipmentRecord["notificationStatus"]): {
  level: "success" | "warning" | "info";
  message: string;
} {
  switch (status) {
    case "sent":
      return {
        level: "success",
        message: "Shipment saved. Notification email sent.",
      };
    case "failed":
      return {
        level: "warning",
        message:
          "Shipment saved, but notification email failed. Do not save again to resend it.",
      };
    case "sending":
      return {
        level: "info",
        message:
          "Shipment saved. Notification email is being sent; do not save again.",
      };
    case "not_requested":
      return {
        level: "warning",
        message: "Shipment saved. No notification email was requested.",
      };
    default:
      return {
        level: "warning",
        message:
          "Shipment saved, but notification email sending could not be confirmed. Do not save again to resend it.",
      };
  }
}

function AddShipmentDialog({ enabled }: { enabled: boolean }) {
  const utils = trpc.useUtils();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<ShipmentDraft>({ ...EMPTY_ENTRY });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestRef = useRef<{ fingerprint: string; requestKey: string } | null>(
    null
  );
  const submittingRef = useRef(false);
  const create = trpc.shipments.create.useMutation({ retry: false });
  const pending = create.isPending;
  const fieldId = (key: keyof ShipmentDraft) => `${id}-${key}`;
  const errorId = (key: keyof ShipmentDraft) => `${fieldId(key)}-error`;

  function update<K extends keyof ShipmentDraft>(
    key: K,
    value: ShipmentDraft[K]
  ) {
    if (entry[key] !== value) requestRef.current = null;
    setEntry(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    setSaveError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || pending || submittingRef.current) return;
    const parsed = shipmentEntrySchema.safeParse(entry);
    if (!parsed.success) {
      const nextErrors = fieldsFromIssues<keyof ShipmentDraft>(
        parsed.error.issues
      );
      if (!entry.direction)
        nextErrors.direction = "Choose Shipment from or Shipment to";
      setErrors(nextErrors);
      const firstField = parsed.error.issues[0]?.path[0] as keyof ShipmentDraft;
      document
        .getElementById(
          firstField === "direction" ? `${id}-from` : fieldId(firstField)
        )
        ?.focus();
      return;
    }
    setErrors({});
    setSaveError(null);
    const fingerprint = JSON.stringify(parsed.data);
    let result: Awaited<ReturnType<typeof create.mutateAsync>>;
    try {
      // Retain the UUID on an ambiguous failure. A changed payload always starts a new request.
      if (
        !requestRef.current ||
        requestRef.current.fingerprint !== fingerprint
      ) {
        requestRef.current = { fingerprint, requestKey: crypto.randomUUID() };
      }
      submittingRef.current = true;
      result = await create.mutateAsync({
        ...parsed.data,
        requestKey: requestRef.current.requestKey,
      });
    } catch {
      setSaveError(
        "We could not confirm the shipment was saved. Retry without changing the fields to safely reuse the same request."
      );
      return;
    } finally {
      submittingRef.current = false;
    }
    requestRef.current = null;
    setEntry({ ...EMPTY_ENTRY });
    setOpen(false);
    const feedback = shipmentSaveFeedback(result.row.notificationStatus);
    toast[feedback.level](feedback.message);
    // A refresh failure must not turn an already-confirmed save into a failed creation.
    void utils.shipments.list.invalidate().catch(() => {
      toast.error(
        "Shipment saved, but the list could not refresh. Use Retry or Refresh to load it."
      );
    });
  }

  const senderLabel =
    entry.direction === "from"
      ? "Sender name"
      : entry.direction === "to"
        ? "Recipient name"
        : "Sender / recipient name";
  const textFields = [
    {
      key: "shipmentDate",
      label: "Shipment date",
      type: "date",
      max: undefined,
      placeholder: undefined,
    },
    {
      key: "companyName",
      label: "Company name",
      type: "text",
      max: 200,
      placeholder: "e.g. DHL",
    },
    {
      key: "shipmentNumber",
      label: "Shipment number",
      type: "text",
      max: 100,
      placeholder: "Tracking or shipment reference",
    },
  ] as const;

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!pending && !submittingRef.current) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!enabled} className="gap-2">
          <Plus className="size-4" aria-hidden="true" />
          Add Shipment
        </Button>
      </DialogTrigger>
      <DialogContent
        className="min-w-0 grid-cols-[minmax(0,1fr)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:max-w-2xl sm:p-6"
        showCloseButton={!pending}
        onEscapeKeyDown={event => {
          if (pending || submittingRef.current) event.preventDefault();
        }}
        onPointerDownOutside={event => {
          if (pending || submittingRef.current) event.preventDefault();
        }}
      >
        <DialogHeader className="min-w-0 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5 text-primary" aria-hidden="true" />
            Add Shipment
          </DialogTitle>
          <DialogDescription>
            Keep the shipment reference and its supporting documents together.
            All eight fields are required. Notes are optional.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={save}
          noValidate
          className="min-w-0 space-y-5"
          aria-busy={pending}
        >
          <fieldset
            disabled={pending}
            className="min-w-0 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2"
          >
            <legend className="sr-only">Shipment details</legend>
            {textFields.map(field => (
              <div key={field.key} className="min-w-0 space-y-2">
                <Label htmlFor={fieldId(field.key)}>
                  {field.label}
                  <span aria-hidden="true"> *</span>
                </Label>
                <Input
                  id={fieldId(field.key)}
                  type={field.type}
                  value={entry[field.key]}
                  required
                  maxLength={field.max}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  className="min-w-0 w-full"
                  aria-invalid={!!errors[field.key]}
                  aria-describedby={
                    errors[field.key] ? errorId(field.key) : undefined
                  }
                  onChange={event => update(field.key, event.target.value)}
                />
                <FieldError
                  id={errorId(field.key)}
                  message={errors[field.key]}
                />
              </div>
            ))}
            <div className="min-w-0 space-y-2">
              <Label id={`${id}-direction-label`}>
                Direction<span aria-hidden="true"> *</span>
              </Label>
              <RadioGroup
                id={fieldId("direction")}
                value={entry.direction}
                disabled={pending}
                aria-labelledby={`${id}-direction-label`}
                aria-required="true"
                aria-invalid={!!errors.direction}
                aria-describedby={
                  errors.direction ? errorId("direction") : undefined
                }
                onValueChange={value =>
                  update("direction", value as ShipmentEntry["direction"])
                }
                className="grid grid-cols-[minmax(0,1fr)] gap-2"
              >
                {(["from", "to"] as const).map(direction => (
                  <label
                    key={direction}
                    htmlFor={`${id}-${direction}`}
                    className={cn(
                      "elevay-control-surface flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      entry.direction === direction && "border-ring"
                    )}
                  >
                    <RadioGroupItem
                      id={`${id}-${direction}`}
                      value={direction}
                      disabled={pending}
                    />
                    {shipmentDirectionLabel(direction)}
                  </label>
                ))}
              </RadioGroup>
              <FieldError
                id={errorId("direction")}
                message={errors.direction}
              />
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <Label htmlFor={fieldId("partyName")}>
                {senderLabel}
                <span aria-hidden="true"> *</span>
              </Label>
              <Input
                id={fieldId("partyName")}
                value={entry.partyName}
                required
                maxLength={200}
                placeholder={
                  entry.direction === "from"
                    ? "Who sent this shipment?"
                    : "Who is receiving this shipment?"
                }
                aria-invalid={!!errors.partyName}
                aria-describedby={
                  errors.partyName ? errorId("partyName") : undefined
                }
                onChange={event => update("partyName", event.target.value)}
                className="min-w-0 w-full"
              />
              <FieldError
                id={errorId("partyName")}
                message={errors.partyName}
              />
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <Label htmlFor={fieldId("driveUrl")}>
                Google Drive link<span aria-hidden="true"> *</span>
              </Label>
              <Input
                id={fieldId("driveUrl")}
                type="url"
                value={entry.driveUrl}
                required
                maxLength={2000}
                placeholder="https://drive.google.com/…"
                aria-invalid={!!errors.driveUrl}
                aria-describedby={`${id}-drive-help${errors.driveUrl ? ` ${errorId("driveUrl")}` : ""}`}
                onChange={event => update("driveUrl", event.target.value)}
                className="min-w-0 w-full"
                autoComplete="off"
              />
              <p
                id={`${id}-drive-help`}
                className="text-xs text-muted-foreground"
              >
                HTTPS Google Drive or Google Docs links only. This saves a
                reference; it does not upload files or change sharing
                permissions.
              </p>
              <FieldError id={errorId("driveUrl")} message={errors.driveUrl} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={fieldId("recordedByName")}>
                Recorded by<span aria-hidden="true"> *</span>
              </Label>
              <Input
                id={fieldId("recordedByName")}
                type="text"
                value={entry.recordedByName}
                required
                maxLength={200}
                placeholder="Record-maker's name"
                autoComplete="off"
                aria-invalid={!!errors.recordedByName}
                aria-describedby={`${id}-recorder-help${errors.recordedByName ? ` ${errorId("recordedByName")}` : ""}`}
                onChange={event => update("recordedByName", event.target.value)}
                className="min-w-0 w-full"
              />
              <p
                id={`${id}-recorder-help`}
                className="text-xs text-muted-foreground"
              >
                Enter the person making this record. This does not change the
                signed-in user.
              </p>
              <FieldError
                id={errorId("recordedByName")}
                message={errors.recordedByName}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={fieldId("notificationEmail")}>
                Notification email<span aria-hidden="true"> *</span>
              </Label>
              <Input
                id={fieldId("notificationEmail")}
                type="email"
                value={entry.notificationEmail}
                required
                maxLength={254}
                placeholder="name@example.com"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.notificationEmail}
                aria-describedby={`${id}-notification-help${errors.notificationEmail ? ` ${errorId("notificationEmail")}` : ""}`}
                onChange={event =>
                  update("notificationEmail", event.target.value)
                }
                className="min-w-0 w-full"
              />
              <p
                id={`${id}-notification-help`}
                className="text-xs text-muted-foreground"
              >
                All shipment details will be emailed immediately after saving to
                this address and to Ziad under the standing notification
                preference. Enter one email address only.
              </p>
              <FieldError
                id={errorId("notificationEmail")}
                message={errors.notificationEmail}
              />
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <Label htmlFor={fieldId("notes")}>Notes (optional)</Label>
              <Textarea
                id={fieldId("notes")}
                value={entry.notes ?? ""}
                maxLength={2000}
                rows={4}
                placeholder="Additional shipment details or handling instructions"
                className="min-w-0 w-full field-sizing-fixed resize-y"
                aria-invalid={!!errors.notes}
                aria-describedby={`${id}-notes-help${errors.notes ? ` ${errorId("notes")}` : ""}`}
                onChange={event => update("notes", event.target.value)}
              />
              <p
                id={`${id}-notes-help`}
                className="text-xs text-muted-foreground"
              >
                {(entry.notes ?? "").length.toLocaleString()} / 2,000
                characters. Notes are included in the notification email and PDF
                reports.
              </p>
              <FieldError id={errorId("notes")} message={errors.notes} />
            </div>
          </fieldset>
          {saveError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <p>{saveError}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !enabled}
              className="gap-2"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              {pending ? "Saving…" : saveError ? "Retry save" : "Save Shipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Shipments() {
  const {
    isAuthenticated,
    loading: authLoading,
    error: authError,
    refresh: refreshAuth,
  } = useAuth();
  const utils = trpc.useUtils();
  const id = useId();
  const [draftFilters, setDraftFilters] = useState<ShipmentFilters>({
    ...EMPTY_SHIPMENT_FILTERS,
  });
  const [appliedFilters, setAppliedFilters] = useState<ShipmentFilters>({
    ...EMPTY_SHIPMENT_FILTERS,
  });
  const [filterErrors, setFilterErrors] = useState<FilterErrors>({});
  const moreFiltersRef = useRef<HTMLDetailsElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(25);
  const [sortBy, setSortBy] = useState<ShipmentSortField>("shipmentDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(
    () =>
      Object.fromEntries(
        COLUMNS.map(column => [column.key, column.width])
      ) as Record<ColumnKey, number>
  );
  const resizeRef = useRef<{
    key: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const exportBusyRef = useRef(false);
  const [exportTarget, setExportTarget] = useState<
    number | "filtered" | "range" | null
  >(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const enabled = isAuthenticated && !authLoading;
  const queryInput = useMemo(
    () => ({ filters: appliedFilters, page, pageSize, sortBy, sortOrder }),
    [appliedFilters, page, pageSize, sortBy, sortOrder]
  );
  const list = trpc.shipments.list.useQuery(queryInput, {
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = !list.isError && enabled ? list.data : undefined;
  const rows: ShipmentRecord[] = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const tableWidth = COLUMNS.reduce(
    (sum, column) => sum + widths[column.key],
    0
  );
  const draftResult = shipmentFiltersSchema.safeParse(draftFilters);
  const unappliedFilters =
    !draftResult.success ||
    JSON.stringify(draftResult.data) !== JSON.stringify(appliedFilters);
  const hasAppliedFilters = Object.entries(appliedFilters).some(
    ([key, value]) => (key === "direction" ? value !== "all" : !!value)
  );
  const rangeReady =
    !!appliedFilters.from &&
    !!appliedFilters.to &&
    shipmentFiltersSchema.safeParse(appliedFilters).success;
  const filterExportDisabled =
    !enabled ||
    list.isFetching ||
    list.isPending ||
    list.isError ||
    data?.total === 0 ||
    unappliedFilters ||
    exportTarget !== null;
  const scopeNote =
    appliedFilters.from && appliedFilters.to
      ? `${displayDate(appliedFilters.from)} – ${displayDate(appliedFilters.to)} · Both dates included`
      : appliedFilters.from
        ? `From ${displayDate(appliedFilters.from)} onward`
        : appliedFilters.to
          ? `Through ${displayDate(appliedFilters.to)}`
          : "All dates";

  useEffect(() => {
    if (data && !list.isFetching && page > totalPages) setPage(totalPages);
  }, [data, list.isFetching, page, totalPages]);

  function updateFilter<K extends keyof ShipmentFilters>(
    key: K,
    value: ShipmentFilters[K]
  ) {
    setDraftFilters(current => ({ ...current, [key]: value }));
    setFilterErrors(current => ({ ...current, [key]: undefined }));
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = shipmentFiltersSchema.safeParse(draftFilters);
    if (!parsed.success) {
      setFilterErrors(
        fieldsFromIssues<keyof ShipmentFilters>(parsed.error.issues)
      );
      const firstField = parsed.error.issues[0]?.path[0];
      if (
        FILTER_FIELDS.some(field => field.key === firstField) &&
        moreFiltersRef.current
      ) {
        moreFiltersRef.current.open = true;
      }
      document.getElementById(`${id}-filter-${String(firstField)}`)?.focus();
      return;
    }
    setFilterErrors({});
    setDraftFilters(parsed.data);
    setAppliedFilters(parsed.data);
    setPage(1);
    setExportError(null);
  }
  function resetFilters() {
    setDraftFilters({ ...EMPTY_SHIPMENT_FILTERS });
    setAppliedFilters({ ...EMPTY_SHIPMENT_FILTERS });
    setFilterErrors({});
    setPage(1);
    setExportError(null);
  }
  function sort(key: ShipmentSortField) {
    if (sortBy === key)
      setSortOrder(current => (current === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortOrder("asc");
    }
    setPage(1);
  }
  function resizeStart(event: PointerEvent<HTMLButtonElement>, key: ColumnKey) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeRef.current = { key, startX: event.clientX, startWidth: widths[key] };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function resizeMove(event: PointerEvent<HTMLButtonElement>) {
    const active = resizeRef.current;
    if (!active) return;
    const column = COLUMNS.find(item => item.key === active.key)!;
    const width = clampWidth(
      active.startWidth + event.clientX - active.startX,
      column.min,
      column.max
    );
    setWidths(current => ({ ...current, [active.key]: width }));
  }
  function resizeEnd(event: PointerEvent<HTMLButtonElement>) {
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function resizeKey(event: KeyboardEvent<HTMLButtonElement>, key: ColumnKey) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const column = COLUMNS.find(item => item.key === key)!;
    const step = event.shiftKey ? 40 : 10;
    setWidths(current => ({
      ...current,
      [key]: clampWidth(
        event.key === "Home"
          ? column.min
          : event.key === "End"
            ? column.max
            : current[key] + (event.key === "ArrowRight" ? step : -step),
        column.min,
        column.max
      ),
    }));
  }

  async function exportReport(shipmentId?: number, dateRange = false) {
    if (!enabled || exportBusyRef.current) return;
    if (
      shipmentId === undefined &&
      (filterExportDisabled || (dateRange && !rangeReady))
    )
      return;
    // Reports intentionally omit pagination. The server returns ALL rows for these applied filters.
    const reportInput =
      shipmentId === undefined ? { filters: appliedFilters } : { shipmentId };
    exportBusyRef.current = true;
    setExportTarget(shipmentId ?? (dateRange ? "range" : "filtered"));
    setExportError(null);
    try {
      const report = await utils.shipments.report.fetch(reportInput, {
        staleTime: 0,
      });
      const { exportShipmentsPdf } = await import("@/lib/shipmentsPdf");
      await exportShipmentsPdf(report);
      toast.success("Shipment PDF downloaded");
    } catch {
      const message =
        "The shipment PDF could not be generated. No download was confirmed. Please try again.";
      setExportError(message);
      toast.error(message);
    } finally {
      exportBusyRef.current = false;
      setExportTarget(null);
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-6 pb-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="elevay-featured-icon flex size-12 shrink-0 items-center justify-center rounded-2xl">
            <Package className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Operations
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Shipment
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One clear record for every shipment, in both directions.
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <AddShipmentDialog enabled={enabled} />
        </div>
      </header>

      <section
        aria-label="Shipment summary for applied filters"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3"
      >
        {[
          {
            label: "Total shipments",
            value: data?.total,
            icon: Package,
            className: "metric-icon--primary",
          },
          {
            label: "Shipment from",
            value: data?.fromCount,
            icon: ArrowDownLeft,
            className: "metric-icon--info",
          },
          {
            label: "Shipment to",
            value: data?.toCount,
            icon: ArrowUpRight,
            className: "metric-icon--gold",
          },
        ].map(metric => (
          <Card
            key={metric.label}
            className="elevay-glass-panel min-w-0 gap-3 py-4"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 px-5">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <div
                className={cn(
                  "metric-icon flex size-9 items-center justify-center",
                  metric.className
                )}
              >
                <metric.icon className="size-4" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent className="px-5">
              <p
                className="text-3xl font-semibold tabular-nums"
                aria-live="polite"
              >
                {metric.value === undefined
                  ? "—"
                  : metric.value.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasAppliedFilters
                  ? "Matching applied filters"
                  : "All recorded shipments"}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="elevay-glass-panel min-w-0 gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4 text-primary" aria-hidden="true" />
            Find shipments
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Search across all details, or refine individual fields. Changes take
            effect only after Apply.
          </p>
        </CardHeader>
        <CardContent className="min-w-0 px-5">
          <form
            onSubmit={applyFilters}
            noValidate
            className="min-w-0 space-y-4"
          >
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="min-w-0 space-y-2 md:col-span-2">
                <Label htmlFor={`${id}-filter-search`}>
                  Search all details
                </Label>
                <div className="relative min-w-0">
                  <Search
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id={`${id}-filter-search`}
                    value={draftFilters.search}
                    onChange={event =>
                      updateFilter("search", event.target.value)
                    }
                    maxLength={200}
                    placeholder="Company, shipment number, recorder, email, notes or Drive link…"
                    className="min-w-0 w-full pl-9"
                    aria-invalid={!!filterErrors.search}
                    aria-describedby={
                      filterErrors.search ? `${id}-search-error` : undefined
                    }
                  />
                </div>
                <FieldError
                  id={`${id}-search-error`}
                  message={filterErrors.search}
                />
              </div>
              <div className="min-w-0 space-y-2 md:col-span-2 xl:col-span-1">
                <Label htmlFor={`${id}-filter-direction`}>Direction</Label>
                <Select
                  value={draftFilters.direction}
                  onValueChange={value =>
                    updateFilter(
                      "direction",
                      value as ShipmentFilters["direction"]
                    )
                  }
                >
                  <SelectTrigger
                    id={`${id}-filter-direction`}
                    className="min-w-0 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All directions</SelectItem>
                    <SelectItem value="from">Shipment from</SelectItem>
                    <SelectItem value="to">Shipment to</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 md:col-span-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`${id}-filter-from`}>
                    Date From{" "}
                    <span className="text-xs text-muted-foreground">
                      (inclusive)
                    </span>
                  </Label>
                  <Input
                    id={`${id}-filter-from`}
                    type="date"
                    value={draftFilters.from ?? ""}
                    onChange={event =>
                      updateFilter("from", event.target.value || undefined)
                    }
                    className="min-w-0 w-full"
                    aria-invalid={!!filterErrors.from}
                    aria-describedby={
                      filterErrors.from ? `${id}-from-error` : undefined
                    }
                  />
                  <FieldError
                    id={`${id}-from-error`}
                    message={filterErrors.from}
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`${id}-filter-to`}>
                    Date To{" "}
                    <span className="text-xs text-muted-foreground">
                      (inclusive)
                    </span>
                  </Label>
                  <Input
                    id={`${id}-filter-to`}
                    type="date"
                    value={draftFilters.to ?? ""}
                    onChange={event =>
                      updateFilter("to", event.target.value || undefined)
                    }
                    className="min-w-0 w-full"
                    aria-invalid={!!filterErrors.to}
                    aria-describedby={
                      filterErrors.to ? `${id}-to-error` : undefined
                    }
                  />
                  <FieldError id={`${id}-to-error`} message={filterErrors.to} />
                </div>
              </div>
            </div>
            <details
              ref={moreFiltersRef}
              className="min-w-0 rounded-xl border p-3"
            >
              <summary className="cursor-pointer rounded-sm text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">
                More search filters
                {FILTER_FIELDS.some(field => !!draftFilters[field.key]) && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Field-specific filters set
                  </span>
                )}
              </summary>
              <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {FILTER_FIELDS.map(field => (
                  <div key={field.key} className="min-w-0 space-y-2">
                    <Label htmlFor={`${id}-filter-${field.key}`}>
                      {field.label}
                    </Label>
                    <Input
                      id={`${id}-filter-${field.key}`}
                      value={draftFilters[field.key]}
                      onChange={event =>
                        updateFilter(field.key, event.target.value)
                      }
                      placeholder={field.placeholder}
                      maxLength={field.max}
                      className="min-w-0 w-full"
                      aria-invalid={!!filterErrors[field.key]}
                      aria-describedby={
                        filterErrors[field.key]
                          ? `${id}-${field.key}-error`
                          : undefined
                      }
                    />
                    <FieldError
                      id={`${id}-${field.key}-error`}
                      message={filterErrors[field.key]}
                    />
                  </div>
                ))}
              </div>
            </details>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground" role="status">
                {unappliedFilters
                  ? "You have unapplied changes. Apply them before exporting a filtered report."
                  : "The table, summary and filtered reports use the same applied filters."}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFilters}
                  className="gap-2"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Reset
                </Button>
                <Button type="submit" disabled={!enabled} className="gap-2">
                  <Filter className="size-3.5" aria-hidden="true" />
                  Apply
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <section
        aria-labelledby={`${id}-report-heading`}
        className="elevay-glass-panel elevay-featured-panel min-w-0 rounded-2xl border p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <h2
              id={`${id}-report-heading`}
              className="flex items-center gap-2 text-base font-semibold"
            >
              <FileDown className="size-4 text-primary" aria-hidden="true" />
              Shipment reports
            </h2>
            <p className="text-sm font-medium">{scopeNote}</p>
            <p className="text-xs text-muted-foreground">
              Applied filters only · All matching shipments across every page,
              not just the visible rows.
            </p>
            {!rangeReady && (
              <p className="text-xs text-muted-foreground">
                For a date-range PDF, choose both Date From and Date To, then
                Apply. Filtered PDF also supports all dates or a single date
                bound.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={filterExportDisabled}
              onClick={() => void exportReport()}
              className="gap-2"
            >
              {exportTarget === "filtered" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="size-4" aria-hidden="true" />
              )}
              Export filtered PDF
            </Button>
            <Button
              disabled={filterExportDisabled || !rangeReady}
              onClick={() => void exportReport(undefined, true)}
              className="gap-2"
            >
              {exportTarget === "range" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CalendarDays className="size-4" aria-hidden="true" />
              )}
              Date-range PDF
            </Button>
          </div>
        </div>
        {exportError && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 text-sm text-destructive"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{exportError}</span>
          </p>
        )}
      </section>

      <Card className="elevay-glass-panel min-w-0 max-w-full gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Shipment register</h2>
            <Badge variant="secondary">
              {data ? `${data.total.toLocaleString()} matching` : "—"}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={!enabled || list.isFetching}
            onClick={() => void list.refetch()}
            aria-label="Refresh shipments"
            className="gap-2"
          >
            <RotateCcw
              className={cn("size-3.5", list.isFetching && "animate-spin")}
              aria-hidden="true"
            />
            {list.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>
        <p
          id={`${id}-table-help`}
          className="px-5 py-3 text-xs text-muted-foreground"
        >
          Click a column heading to sort. Drag a column edge to resize, or focus
          its grip and use Left/Right arrows (Shift for larger steps). Scroll
          horizontally on smaller screens.
        </p>
        {authLoading ? (
          <div
            className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Loading your session…
          </div>
        ) : !isAuthenticated ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {authError
                ? "Your session could not be loaded. Please retry."
                : "Sign in to view shipments."}
            </p>
            {authError && (
              <Button variant="outline" onClick={() => void refreshAuth()}>
                Retry session
              </Button>
            )}
          </div>
        ) : list.isError ? (
          <div className="space-y-3 p-8 text-center" role="alert">
            <AlertCircle
              className="mx-auto size-7 text-destructive"
              aria-hidden="true"
            />
            <h3 className="font-medium">Shipments could not be loaded</h3>
            <p className="text-sm text-muted-foreground">
              The request did not complete. Your applied filters are still here.
            </p>
            <Button
              variant="outline"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
            >
              {list.isFetching ? "Retrying…" : "Retry"}
            </Button>
          </div>
        ) : list.isPending ? (
          <div
            className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Loading shipments…
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-3 p-10 text-center">
            <div className="elevay-featured-icon mx-auto flex size-14 items-center justify-center rounded-2xl">
              <Package className="size-7" aria-hidden="true" />
            </div>
            <h3 className="font-semibold">
              {hasAppliedFilters
                ? "No shipments match these filters"
                : "No shipments recorded yet"}
            </h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {hasAppliedFilters
                ? "Try a wider date range or reset your filters to see all shipments."
                : "Add your first shipment to keep its date, reference, sender or recipient, and documents in one place."}
            </p>
            {hasAppliedFilters && (
              <Button variant="outline" onClick={resetFilters}>
                Reset filters
              </Button>
            )}
          </div>
        ) : (
          <div
            className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain max-h-[32rem] overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring"
            tabIndex={0}
            role="region"
            aria-label="Shipment table, scroll horizontally"
            aria-describedby={`${id}-table-help`}
            aria-busy={list.isFetching}
          >
            <table
              className="elevay-data-table text-left text-sm"
              style={{
                width: tableWidth,
                minWidth: tableWidth,
                tableLayout: "fixed",
              }}
            >
              <caption className="sr-only">
                Shipments matching applied filters. Page {page} of {totalPages}.
              </caption>
              <colgroup>
                {COLUMNS.map(column => (
                  <col key={column.key} style={{ width: widths[column.key] }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  {COLUMNS.map(column => (
                    <th
                      key={column.key}
                      scope="col"
                      className="relative border-b px-4 py-3 pr-7"
                      aria-sort={
                        column.sortable
                          ? sortBy === column.key
                            ? sortOrder === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={() => sort(column.key as ShipmentSortField)}
                          className="flex w-full items-center gap-2 rounded-sm text-left font-semibold focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={`Sort by ${column.label}`}
                        >
                          <span>{column.label}</span>
                          {sortBy === column.key ? (
                            sortOrder === "asc" ? (
                              <ArrowUp
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <ArrowDown
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                            )
                          ) : (
                            <ArrowUpDown
                              className="size-3.5 shrink-0 opacity-50"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      ) : (
                        column.label
                      )}
                      <button
                        type="button"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${column.label} column`}
                        aria-valuemin={column.min}
                        aria-valuemax={column.max}
                        aria-valuenow={Math.round(widths[column.key])}
                        aria-valuetext={`${Math.round(widths[column.key])} pixels`}
                        aria-keyshortcuts="ArrowLeft ArrowRight Home End"
                        title="Drag to resize; arrow keys adjust width"
                        className="absolute inset-y-0 right-0 flex w-5 cursor-col-resize touch-none select-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                        onPointerDown={event => resizeStart(event, column.key)}
                        onPointerMove={resizeMove}
                        onPointerUp={resizeEnd}
                        onPointerCancel={resizeEnd}
                        onLostPointerCapture={() => {
                          resizeRef.current = null;
                        }}
                        onKeyDown={event => resizeKey(event, column.key)}
                      >
                        <GripVertical className="size-3" aria-hidden="true" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="border-b px-4 py-4 align-top whitespace-nowrap tabular-nums">
                      {displayDate(row.shipmentDate)}
                    </td>
                    <td className="border-b px-4 py-4 align-top font-medium [overflow-wrap:anywhere]">
                      {row.companyName}
                      <dl className="mt-2 space-y-1 text-[11px] font-normal text-muted-foreground">
                        <div>
                          <dt className="inline">Recorded by: </dt>
                          <dd className="inline">
                            {row.recordedByName?.trim() || "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Notification email: </dt>
                          <dd className="inline">
                            {row.notificationEmail || "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Email status: </dt>
                          <dd className="inline">
                            {shipmentNotificationLabel(row.notificationStatus)}
                          </dd>
                        </div>
                        <div>
                          <dt>Notes:</dt>
                          <dd className="whitespace-pre-wrap break-words text-xs text-foreground">
                            {row.notes?.trim() || "No notes"}
                          </dd>
                        </div>
                      </dl>
                    </td>
                    <td className="border-b px-4 py-4 align-top font-medium [overflow-wrap:anywhere]">
                      {row.shipmentNumber}
                    </td>
                    <td className="border-b px-4 py-4 align-top">
                      <Badge
                        variant="outline"
                        className={cn(
                          "max-w-full gap-1.5 whitespace-normal",
                          row.direction === "from"
                            ? "metric-primary-bg"
                            : "metric-gold-bg"
                        )}
                      >
                        {row.direction === "from" ? (
                          <ArrowDownLeft
                            className="size-3 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <ArrowUpRight
                            className="size-3 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        {shipmentDirectionLabel(row.direction)}
                      </Badge>
                    </td>
                    <td className="border-b px-4 py-4 align-top [overflow-wrap:anywhere]">
                      <p>{row.partyName}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {row.direction === "from" ? "Sender" : "Recipient"}
                      </p>
                    </td>
                    <td className="border-b px-4 py-4 align-top">
                      {isShipmentDriveUrl(row.driveUrl) ? (
                        <a
                          href={row.driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={`Open Google Drive documents for shipment ${row.shipmentNumber} in a new tab`}
                        >
                          Open Drive
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Link unavailable
                        </span>
                      )}
                    </td>
                    <td className="border-b px-3 py-3 align-top">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!enabled || exportTarget !== null}
                        onClick={() => void exportReport(row.id)}
                        aria-label={`Download PDF for shipment ${row.shipmentNumber}`}
                        className="gap-1.5 px-2.5"
                      >
                        {exportTarget === row.id ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <FileDown className="size-3.5" aria-hidden="true" />
                        )}
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" role="status">
            {data
              ? data.total === 0
                ? "0 shipments"
                : `Showing ${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, data.total).toLocaleString()} of ${data.total.toLocaleString()} shipments`
              : "Shipment counts unavailable"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label
                htmlFor={`${id}-page-size`}
                className="text-xs text-muted-foreground"
              >
                Rows per page
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={value => {
                  setPageSize(Number(value) as 10 | 25 | 50);
                  setPage(1);
                }}
              >
                <SelectTrigger id={`${id}-page-size`} className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Previous shipment page"
                disabled={!data || page <= 1 || list.isFetching}
                onClick={() => setPage(current => current - 1)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <span className="text-xs tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Next shipment page"
                disabled={!data || page >= totalPages || list.isFetching}
                onClick={() => setPage(current => current + 1)}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

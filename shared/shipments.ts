import { z } from "zod";

export const SHIPMENT_DIRECTIONS = ["from", "to"] as const;
export const SHIPMENT_NOTIFICATION_STATUSES = [
  "not_requested",
  "sending",
  "sent",
  "failed",
  "unknown",
] as const;
export type ShipmentNotificationStatus =
  (typeof SHIPMENT_NOTIFICATION_STATUSES)[number];
export const SHIPMENT_SORT_FIELDS = [
  "shipmentDate",
  "companyName",
  "shipmentNumber",
  "direction",
  "partyName",
] as const;
export function isShipmentDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function isShipmentDriveUrl(value: string): boolean {
  if (new RegExp("[\\p{Cc}\\p{Cf}]", "u").test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["drive.google.com", "docs.google.com"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}
const day = z.string().refine(isShipmentDate, "Choose a valid calendar date");
const shortText = (max: number) =>
  z.string().trim().min(1, "This field is required").max(max);
const withoutControls = z
  .string()
  .refine(
    value => !new RegExp("[\\p{Cc}\\p{Cf}]", "u").test(value),
    "Control characters are not allowed"
  );
export const shipmentNotificationEmailSchema = withoutControls.pipe(
  z
    .string()
    .trim()
    .min(1, "Enter one notification email")
    .max(254)
    .email("Enter one bare email address (no names or recipient lists)")
);
export const shipmentNotesSchema = z
  .string()
  .transform(value => value.replace(/\r\n?/g, "\n").trim())
  .pipe(
    z
      .string()
      .max(2000, "Notes must be 2,000 characters or fewer")
      .refine(
        value => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value),
        "Unsupported control characters are not allowed in Notes"
      )
  );
export const shipmentEntrySchema = z.object({
  shipmentDate: day,
  companyName: shortText(200),
  shipmentNumber: shortText(100),
  direction: z.enum(SHIPMENT_DIRECTIONS),
  partyName: shortText(200),
  recordedByName: withoutControls.pipe(shortText(200)),
  notificationEmail: shipmentNotificationEmailSchema,
  notes: shipmentNotesSchema.optional(),
  driveUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(
      isShipmentDriveUrl,
      "Enter an HTTPS Google Drive or Google Docs link"
    ),
});
export const shipmentCreateSchema = shipmentEntrySchema.extend({
  requestKey: z.string().uuid(),
});
export const shipmentFiltersSchema = z
  .object({
    search: z.string().trim().max(200).default(""),
    companyName: z.string().trim().max(200).default(""),
    shipmentNumber: z.string().trim().max(100).default(""),
    partyName: z.string().trim().max(200).default(""),
    driveUrl: z.string().trim().max(2000).default(""),
    direction: z.enum(["all", ...SHIPMENT_DIRECTIONS]).default("all"),
    from: day.optional(),
    to: day.optional(),
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: "From date must be on or before To date",
    path: ["to"],
  });
export const shipmentListSchema = z.object({
  filters: shipmentFiltersSchema,
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(25),
  sortBy: z.enum(SHIPMENT_SORT_FIELDS).default("shipmentDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export const shipmentReportSchema = z
  .object({
    shipmentId: z.number().int().positive().optional(),
    filters: shipmentFiltersSchema.optional(),
  })
  .refine(
    value => !(value.shipmentId && value.filters),
    "Select a shipment OR report filters"
  );
export type ShipmentEntry = z.infer<typeof shipmentEntrySchema>;
export type ShipmentFilters = z.infer<typeof shipmentFiltersSchema>;
export type ShipmentSortField = (typeof SHIPMENT_SORT_FIELDS)[number];
export type ShipmentRecord = Omit<
  ShipmentEntry,
  "recordedByName" | "notificationEmail" | "notes"
> & {
  id: number;
  createdAt: Date | string;
  /** Manual descriptive attribution; never an authenticated creator identity. */
  recordedByName?: string | null;
  notificationEmail?: string | null;
  notes?: string | null;
  notificationStatus?: ShipmentNotificationStatus;
  notificationSentAt?: Date | string | null;
};
export type ShipmentReport = {
  rows: ShipmentRecord[];
  generatedAt: Date | string;
  generatedBy: string;
  shipmentId?: number;
  filters: ShipmentFilters;
};
export const EMPTY_SHIPMENT_FILTERS: ShipmentFilters = {
  search: "",
  companyName: "",
  shipmentNumber: "",
  partyName: "",
  driveUrl: "",
  direction: "all",
};
export function shipmentDirectionLabel(value: "from" | "to"): string {
  return value === "from" ? "Shipment from" : "Shipment to";
}
export function safeShipmentIssuer(name: string | null | undefined): string {
  const clean = (name ?? "")
    .replace(/\S+@\S+\.\S+/g, "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .trim();
  return clean || "ELEVAY team member";
}

import {
  isShipmentDriveUrl,
  shipmentDirectionLabel,
  type ShipmentRecord,
} from "../shared/shipments";
import { sendShipmentNotificationEmail } from "./emailService";

function cleanText(value: string): string {
  return value.replace(new RegExp("[\\p{Cc}\\p{Cf}]", "gu"), " ");
}
function escapeHtml(value: string): string {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Whitelisted shipment details only: never spread a DB row or authenticated user.
 * The Drive URL is a link only; no file access, attachment or sharing changes. */
export function buildShipmentNotification(row: ShipmentRecord): {
  subject: string;
  html: string;
  text: string;
} {
  const createdAt = new Date(row.createdAt);
  const createdTime = Number.isFinite(createdAt.getTime())
    ? createdAt.toISOString()
    : "Unavailable";
  const driveUrl = isShipmentDriveUrl(row.driveUrl) ? row.driveUrl : "";
  const noteLines = (row.notes?.trim() || "No notes").split(/\r\n?|\n/);
  const details: [string, string][] = [
    ["Shipment date", row.shipmentDate],
    ["Company", row.companyName],
    ["Shipment number", row.shipmentNumber],
    ["Direction", shipmentDirectionLabel(row.direction)],
    ["Party", row.partyName],
    ["Recorded by (manual entry)", row.recordedByName ?? "Not recorded"],
    ["Notification email", row.notificationEmail ?? "Not recorded"],
    ["Created at (UTC)", createdTime],
  ];
  return {
    subject: cleanText(`ELEVAY — Shipment saved: ${row.shipmentNumber}`),
    html: `<h2>Shipment saved</h2>${details
      .map(
        ([label, value]) =>
          `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
      )
      .join("")}<p><strong>Drive link:</strong> ${
      driveUrl
        ? `<a href="${escapeHtml(driveUrl)}">${escapeHtml(driveUrl)}</a>`
        : "Unavailable"
    }</p><p><strong>Notes:</strong> ${noteLines.map(escapeHtml).join("<br>")}</p><p>The recorder name is manually entered descriptive attribution, not the authenticated account identity. This email includes a link only; it does not grant Drive access.</p>`,
    text: `Shipment saved\n${details
      .map(([label, value]) => `${label}: ${cleanText(value)}`)
      .join(
        "\n"
      )}\nDrive link: ${driveUrl || "Unavailable"}\n\nNotes: ${noteLines.map(cleanText).join("\n")}\n\nThe recorder name is manually entered descriptive attribution, not the authenticated account identity. This email includes a link only; it does not grant Drive access.`,
  };
}

/** Called only by the winning insert after its saved row has been confirmed. */
export async function notifyShipmentCreated(
  row: ShipmentRecord
): Promise<boolean> {
  if (!row.notificationEmail) return false;
  const message = buildShipmentNotification(row);
  return sendShipmentNotificationEmail(
    row.notificationEmail,
    message.subject,
    message.html,
    message.text
  );
}

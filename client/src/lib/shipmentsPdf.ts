import {
  EMPTY_SHIPMENT_FILTERS,
  safeShipmentIssuer,
  shipmentDirectionLabel,
  shipmentEntrySchema,
  shipmentFiltersSchema,
  type ShipmentReport,
} from "@shared/shipments";
import type { jsPDF } from "jspdf";

const NAVY = "#1A3A5C",
  TEAL = "#5BA3B8",
  INK = "#26394A",
  MUTED = "#526575";
const unicode = (text: string) => /[^\x20-\x7e]/.test(text);
const calendarDate = (date: string) =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

// New entries require these fields; historical report rows may predate them.
const reportEntrySchema = shipmentEntrySchema.extend({
  recordedByName: shipmentEntrySchema.shape.recordedByName.nullish(),
  notificationEmail: shipmentEntrySchema.shape.notificationEmail.nullish(),
});
function notificationLabel(status: string | undefined): string {
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
function notificationTime(value: Date | string | null | undefined): string {
  if (value == null) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Shipment notification time is invalid");
  return `${date.toLocaleString("en-GB", { timeZone: "Africa/Cairo", hourCycle: "h23" })} | Africa/Cairo`;
}

/** Local-only report: no uploads, Drive requests, sharing changes or database writes. */
export async function createShipmentsPdf(
  input: ShipmentReport
): Promise<jsPDF> {
  const filters = shipmentFiltersSchema.parse(
    input.filters ?? EMPTY_SHIPMENT_FILTERS
  );
  const generatedAt = new Date(input.generatedAt);
  if (!Number.isFinite(generatedAt.getTime()))
    throw new Error("Report issuance time is invalid");
  if (!input.rows.length)
    throw new Error("No shipments match the selected report");
  if (input.rows.length > 5000)
    throw new Error("Narrow the date range to export at most 5,000 shipments");
  const rows = input.rows.map(row => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0)
      throw new Error("Invalid shipment report identifier");
    return {
      id: row.id,
      ...reportEntrySchema.parse(row),
      notificationStatus: notificationLabel(row.notificationStatus),
      notificationSentAt: notificationTime(row.notificationSentAt),
    };
  });
  if (
    input.shipmentId &&
    (rows.length !== 1 || rows[0].id !== input.shipmentId)
  )
    throw new Error("Shipment report selection mismatch");
  if (
    !input.shipmentId &&
    rows.some(
      row =>
        (filters.from && row.shipmentDate < filters.from) ||
        (filters.to && row.shipmentDate > filters.to)
    )
  )
    throw new Error("Shipment report date coverage mismatch");
  const issuer = safeShipmentIssuer(input.generatedBy);
  const needsUnicode = [
    issuer,
    ...rows.flatMap(row => [
      row.companyName,
      row.shipmentNumber,
      row.partyName,
      row.recordedByName,
      row.notificationEmail,
    ]),
    ...Object.values(filters),
  ].some(value => typeof value === "string" && unicode(value));
  if (needsUnicode && typeof document === "undefined")
    throw new Error("Arabic shipment text requires browser rendering");
  if (needsUnicode && document.fonts) await document.fonts.ready;
  const { jsPDF: Pdf } = await import("jspdf");
  const pdf = new Pdf({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.setCreationDate(generatedAt);
  pdf.setProperties({
    title: "ELEVAY Shipment Report",
    author: "ELEVAY",
    creator: "ELEVAY CRM",
    subject: "Shipment register and document scan references",
  });
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight();
  const margin = 14,
    usable = width - margin * 2,
    bottom = height - 18,
    lineHeight = 4.4,
    fontSize = 8;
  const timestamp = generatedAt.toLocaleString("en-GB", {
    timeZone: "Africa/Cairo",
    hourCycle: "h23",
  });
  const reference = `SHIP-${generatedAt.toISOString().replace(/\D/g, "").slice(0, 17)}Z`;
  let y = 0,
    started = false,
    canvas: HTMLCanvasElement | undefined;
  type Column = { title: string; width: number };
  let columns: Column[] | null = null;
  const getCanvas = () => {
    canvas ??= document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser canvas unavailable");
    return ctx;
  };
  function textWidth(text: string, size = fontSize): number {
    if (!unicode(text)) {
      pdf.setFontSize(size);
      return pdf.getTextWidth(text);
    }
    const ctx = getCanvas();
    ctx.font = `${(size * 96) / 72}px system-ui, sans-serif`;
    return (ctx.measureText(text).width * 25.4) / 96;
  }
  function wrap(text: string, maxWidth: number, size = fontSize): string[] {
    if (text.includes("\n"))
      return text.split("\n").flatMap(line => wrap(line, maxWidth, size));
    const result: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) result.push(line);
      line = "";
      for (const char of Array.from(word)) {
        if (line && textWidth(line + char, size) > maxWidth) {
          result.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) result.push(line);
    return result.length ? result : [""];
  }
  function draw(
    text: string,
    x: number,
    baseline: number,
    size = fontSize,
    color = INK
  ) {
    pdf.setFontSize(size);
    pdf.setTextColor(color);
    if (!unicode(text)) {
      pdf.text(text, x, baseline);
      return;
    }
    const ctx = getCanvas(),
      scale = 3,
      pxMm = 96 / 25.4,
      px = (size * 96) / 72;
    canvas!.width = Math.ceil((textWidth(text, size) * pxMm + 6) * scale);
    canvas!.height = Math.ceil(px * 1.8 * scale);
    ctx.scale(scale, scale);
    ctx.font = `${px}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    const rtl = /[\u0590-\u08ff\ufb1d-\ufeff]/.test(text);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(text, rtl ? canvas!.width / scale - 3 : 3, px * 1.25);
    pdf.addImage(
      canvas!.toDataURL("image/png"),
      "PNG",
      x,
      baseline - (px * 1.25) / pxMm,
      canvas!.width / scale / pxMm,
      canvas!.height / scale / pxMm
    );
  }
  function tableHeader() {
    if (!columns) return;
    const lines = columns.map(c => wrap(c.title, c.width - 4)),
      h = Math.max(...lines.map(c => c.length)) * lineHeight + 4;
    pdf.setFillColor(NAVY);
    pdf.rect(margin, y, usable, h, "F");
    pdf.setFont("helvetica", "bold");
    let x = margin;
    lines.forEach((cell, i) => {
      cell.forEach((t, j) =>
        draw(t, x + 2, y + 4 + j * lineHeight, fontSize, "#FFFFFF")
      );
      x += columns![i].width;
    });
    y += h;
    pdf.setFont("helvetica", "normal");
  }
  function page() {
    if (started) pdf.addPage();
    started = true;
    pdf.setFillColor(NAVY);
    pdf.rect(0, 0, width, 3, "F");
    pdf.setFont("helvetica", "bold");
    draw("ELEVAY", margin, 16, 21, NAVY);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(MUTED);
    pdf.text("SHIPMENT REPORT / INTERNAL", width - margin, 11, {
      align: "right",
    });
    pdf.text(reference, width - margin, 16, { align: "right" });
    pdf.text(`${timestamp} | Africa/Cairo`, width - margin, 21, {
      align: "right",
    });
    pdf.setDrawColor(TEAL);
    pdf.line(margin, 25, width - margin, 25);
    y = 34;
    draw(
      input.shipmentId ? `Shipment #${input.shipmentId}` : "Shipment register",
      margin,
      y,
      12,
      NAVY
    );
    y += 9;
    if (columns) tableHeader();
  }
  function paragraph(text: string, color = MUTED) {
    for (const line of wrap(text, usable)) {
      if (y + lineHeight > bottom) page();
      draw(line, margin, y, fontSize, color);
      y += lineHeight;
    }
    y += 3;
  }
  function table(
    specs: { title: string; weight: number }[],
    data: string[][],
    links?: (string | undefined)[]
  ) {
    const weight = specs.reduce((sum, c) => sum + c.weight, 0);
    columns = specs.map(c => ({
      title: c.title,
      width: (usable * c.weight) / weight,
    }));
    if (y + 22 > bottom) page();
    else tableHeader();
    data.forEach((row, index) => {
      const cells = row.map((text, i) => wrap(text, columns![i].width - 5)),
        count = Math.max(...cells.map(c => c.length));
      const needed = count * lineHeight + 4;
      if (needed < bottom - 60 && y + needed > bottom) page();
      let offset = 0;
      while (offset < count) {
        if (y + lineHeight + 4 > bottom) page();
        const take = Math.min(
            count - offset,
            Math.max(1, Math.floor((bottom - y - 4) / lineHeight))
          ),
          rowHeight = take * lineHeight + 4;
        pdf.setFillColor(index % 2 ? "#FFFFFF" : "#EDF5F7");
        pdf.rect(margin, y, usable, rowHeight, "F");
        let x = margin;
        cells.forEach((cell, i) => {
          cell
            .slice(offset, offset + take)
            .forEach((text, j) =>
              draw(
                text,
                x + 2,
                y + 4 + j * lineHeight,
                fontSize,
                i === cells.length - 1 && links?.[index] ? TEAL : INK
              )
            );
          if (i === cells.length - 1 && links?.[index])
            pdf.link(x, y, columns![i].width, rowHeight, {
              url: links[index]!,
            });
          x += columns![i].width;
        });
        pdf.setDrawColor("#D8E4E9");
        pdf.line(margin, y + rowHeight, width - margin, y + rowHeight);
        y += rowHeight;
        offset += take;
        if (offset < count) page();
      }
    });
    columns = null;
    y += 6;
  }
  page();
  paragraph(`Issued by (report issuer): ${issuer}`);
  paragraph(
    "Recorded by identifies the manually entered record-maker, not the report issuer or authenticated user."
  );
  paragraph(
    `Date selection: ${filters.from ? calendarDate(filters.from) : "All dates"} to ${filters.to ? calendarDate(filters.to) : "All dates"}. Shipment dates are calendar dates; range boundaries are inclusive.`
  );
  const filterLabels: [keyof typeof filters, string][] = [
    ["search", "Search"],
    ["companyName", "Company"],
    ["shipmentNumber", "Shipment number"],
    ["partyName", "Sender / recipient"],
    ["driveUrl", "Drive link contains"],
  ];
  for (const [key, label] of filterLabels)
    if (filters[key]) paragraph(`${label}: ${filters[key]}`);
  if (filters.direction !== "all")
    paragraph(`Direction: ${shipmentDirectionLabel(filters.direction)}`);
  paragraph(
    `Report includes ${rows.length} shipment(s): ${rows.filter(row => row.direction === "from").length} from / ${rows.filter(row => row.direction === "to").length} to. All matching entries are included, not only the visible table page.`
  );
  if (input.shipmentId) {
    const row = rows[0];
    table(
      [
        { title: "Field", weight: 1 },
        { title: "Shipment details", weight: 4 },
      ],
      [
        ["Shipment date", calendarDate(row.shipmentDate)],
        ["Company name", row.companyName],
        ["Shipment number", row.shipmentNumber],
        ["Direction", shipmentDirectionLabel(row.direction)],
        [
          row.direction === "from" ? "Sender name" : "Recipient name",
          row.partyName,
        ],
        ["Recorded by (record-maker)", row.recordedByName || "Not recorded"],
        ["Notification email", row.notificationEmail || "Not recorded"],
        ["Notification status", row.notificationStatus],
        ["Notification sent at", row.notificationSentAt],
        ["Document scan Drive link", row.driveUrl],
      ],
      [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        row.driveUrl,
      ]
    );
  } else {
    table(
      [
        { title: "Date / ID", weight: 30 },
        { title: "Company name", weight: 42 },
        { title: "Shipment number", weight: 35 },
        { title: "Direction", weight: 34 },
        { title: "Sender / recipient", weight: 50 },
        { title: "Record / notification", weight: 75 },
        { title: "Document scan", weight: 70 },
      ],
      rows.map(row => [
        `${calendarDate(row.shipmentDate)} / #${row.id}`,
        row.companyName,
        row.shipmentNumber,
        shipmentDirectionLabel(row.direction),
        row.partyName,
        `Recorded by: ${row.recordedByName || "Not recorded"}\nNotification email: ${row.notificationEmail || "Not recorded"}\nNotification status: ${row.notificationStatus}\nNotification sent at: ${row.notificationSentAt}`,
        `Open Drive copy: ${row.driveUrl}`,
      ]),
      rows.map(row => row.driveUrl)
    );
  }
  paragraph(
    "Document references are clickable Google Drive links, not embedded scans. Existing Drive permissions still apply; this export does not change sharing access."
  );
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(TEAL);
    pdf.line(margin, height - 12, width - margin, height - 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(MUTED);
    pdf.text(
      "ELEVAY | Shipment register | Internal document",
      margin,
      height - 7
    );
    pdf.text(`Page ${p} of ${pages}`, width - margin, height - 7, {
      align: "right",
    });
  }
  return pdf;
}
export async function exportShipmentsPdf(
  report: ShipmentReport
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined")
    throw new Error("Shipment PDF downloads require a browser");
  const pdf = await createShipmentsPdf(report);
  const scope = report.shipmentId
    ? `Shipment-${report.shipmentId}`
    : `${report.filters.from ?? "all"}-to-${report.filters.to ?? "all"}`;
  await pdf.save(`ELEVAY-${scope}.pdf`, { returnPromise: true });
}

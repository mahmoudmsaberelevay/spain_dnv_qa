import {
  buildHrVacationReport,
  type HrVacationReportInput,
} from "@shared/hrVacationReport";
import { HR_ANNUAL_LEAVE_POLICY_TEXT } from "@shared/hrAnnualLeavePolicy";
import type { jsPDF } from "jspdf";

export type HrVacationPdfInput = Omit<HrVacationReportInput, "generatedAt"> & {
  generatedAt?: Date;
};

const NAVY = "#1A3A5C";
const TEAL = "#5BA3B8";
const PALE = "#EDF5F7";
const INK = "#26394A";
const MUTED = "#526575";
const unicode = (value: string) => /[^\x20-\x7e]/.test(value);
const number = (value: number | null) =>
  value === null
    ? "Not supplied"
    : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
type Column = { title: string; weight: number; align?: "left" | "right" };

/**
 * Local, in-memory document: no API/DB reads, backend writes, font/image fetches,
 * or payroll effects. Unicode human text uses the browser's canvas shaping/bidi
 * engine, not jsPDF's Latin-only fonts. ASCII synthetic reports also work in Node.
 */
export async function createHrVacationPdf(
  input: HrVacationPdfInput
): Promise<jsPDF> {
  const report = buildHrVacationReport({
    ...input,
    generatedAt: input.generatedAt ?? new Date(),
  });
  const needsUnicode =
    unicode(report.generatedBy) ||
    report.employees.some(
      employee =>
        unicode(employee.name) ||
        employee.history.some(
          row =>
            unicode(row.reason) ||
            unicode(row.decisionReason ?? "") ||
            unicode(row.status)
        )
    );
  if (needsUnicode && typeof document === "undefined") {
    throw new Error(
      "Unicode vacation names and reasons require browser canvas rendering"
    );
  }
  if (needsUnicode && document.fonts) await document.fonts.ready;
  const { jsPDF: Pdf } = await import("jspdf");
  const pdf = new Pdf({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.setCreationDate(new Date(report.generatedAt));
  pdf.setProperties({
    title: `ELEVAY HR Annual Vacation Report | ${report.year}`,
    subject: "Confidential annual vacation balances and full request history",
    author: "ELEVAY HR",
    creator: "ELEVAY CRM",
  });
  const margin = 14;
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const usable = width - margin * 2;
  const bottom = height - 17;
  const size = 8;
  const lineHeight = 4.3;
  const cairoTimestamp = new Date(report.generatedAt).toLocaleString("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  // A local traceable reference, not a database receipt or sequential record ID.
  const reference = `HR-VAC-${report.year}-${report.generatedAt.replace(/\D/g, "").slice(0, 17)}Z`;
  let y = 0;
  let section = "Team annual vacation balances";
  let contextName = "";
  let contextId = "";
  let pageStarted = false;
  let activeColumns: Column[] | undefined;
  let activeWidths: number[] = [];
  let canvas: HTMLCanvasElement | undefined;

  function context(): CanvasRenderingContext2D {
    canvas ??= document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "Browser canvas is unavailable; Unicode vacation text cannot be exported safely"
      );
    return ctx;
  }
  function textWidth(text: string, fontSize: number): number {
    if (!unicode(text)) {
      pdf.setFontSize(fontSize);
      return pdf.getTextWidth(text);
    }
    const ctx = context();
    ctx.font = `${(fontSize * 96) / 72}px system-ui, sans-serif`;
    return (ctx.measureText(text).width * 25.4) / 96;
  }
  function wrap(text: string, cellWidth: number, fontSize = size): string[] {
    if (!text) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, fontSize) <= cellWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      // Preserve unspaced names/reasons as well: no ellipses or truncated history.
      for (const char of Array.from(word)) {
        if (line && textWidth(line + char, fontSize) > cellWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }
  function textLine(
    text: string,
    x: number,
    baseline: number,
    fontSize = size,
    align: "left" | "right" = "left"
  ) {
    pdf.setFontSize(fontSize);
    if (!unicode(text)) {
      pdf.text(text, x, baseline, { align });
      return;
    }
    const ctx = context();
    const scale = 3;
    const pxPerMm = 96 / 25.4;
    const fontPx = (fontSize * 96) / 72;
    const measuredWidth = textWidth(text, fontSize);
    canvas!.width = Math.ceil((measuredWidth * pxPerMm + 6) * scale);
    canvas!.height = Math.ceil(fontPx * 1.8 * scale);
    // Setting canvas dimensions resets context state, including transforms.
    ctx.scale(scale, scale);
    ctx.font = `${fontPx}px system-ui, sans-serif`;
    ctx.fillStyle = INK;
    ctx.textBaseline = "alphabetic";
    const rtl = /[\u0590-\u08ff\ufb1d-\ufeff]/.test(text);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(text, rtl ? canvas!.width / scale - 3 : 3, fontPx * 1.25);
    const imageWidth = canvas!.width / scale / pxPerMm;
    pdf.addImage(
      canvas!.toDataURL("image/png"),
      "PNG",
      align === "right" ? x - imageWidth : x,
      baseline - (fontPx * 1.25) / pxPerMm,
      imageWidth,
      canvas!.height / scale / pxPerMm
    );
  }
  function page() {
    if (pageStarted) pdf.addPage();
    pageStarted = true;
    pdf.setFillColor(NAVY);
    pdf.rect(0, 0, width, 3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(NAVY);
    pdf.setFontSize(21);
    pdf.text("ELEVAY", margin, 15);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(MUTED);
    pdf.text(
      `ANNUAL VACATION REPORT  /  ${report.year}  /  CONFIDENTIAL`,
      width - margin,
      11,
      { align: "right" }
    );
    pdf.text(`${reference} | Local report reference`, width - margin, 16, {
      align: "right",
    });
    pdf.text(`${cairoTimestamp} | Africa/Cairo`, width - margin, 21, {
      align: "right",
    });
    pdf.setDrawColor(TEAL);
    pdf.line(margin, 25, width - margin, 25);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(NAVY);
    pdf.text(section, margin, 33);
    y = 40;
    if (contextName) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(size);
      pdf.setTextColor(INK);
      pdf.text(contextId, width - margin, y, { align: "right" });
      // Full name is printed in the paginated identity table; context is repeated.
      for (const line of wrap(contextName, usable - 40).slice(0, 2)) {
        textLine(line, margin, y);
        y += lineHeight;
      }
      y += 3;
    }
    if (activeColumns) tableHeader();
  }
  function room(required: number) {
    if (y + required > bottom) page();
  }
  function paragraph(text: string) {
    pdf.setFont("helvetica", "normal");
    for (const line of wrap(text, usable)) {
      room(lineHeight);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(MUTED);
      textLine(line, margin, y);
      y += lineHeight;
    }
    y += 3;
  }
  function tableHeader() {
    pdf.setFont("helvetica", "bold");
    const lines = activeColumns!.map((column, index) =>
      wrap(column.title, activeWidths[index] - 5)
    );
    const rowHeight =
      Math.max(...lines.map(cell => cell.length)) * lineHeight + 4;
    pdf.setFillColor(NAVY);
    pdf.rect(margin, y, usable, rowHeight, "F");
    pdf.setTextColor("#FFFFFF");
    let x = margin;
    lines.forEach((cell, index) => {
      cell.forEach((line, lineIndex) =>
        textLine(
          line,
          activeColumns![index].align === "right"
            ? x + activeWidths[index] - 2
            : x + 2,
          y + 4 + lineIndex * lineHeight,
          size,
          activeColumns![index].align
        )
      );
      x += activeWidths[index];
    });
    y += rowHeight;
    pdf.setFont("helvetica", "normal");
  }
  function table(columns: Column[], rows: string[][]) {
    activeColumns = columns;
    const weights = columns.reduce((sum, column) => sum + column.weight, 0);
    activeWidths = columns.map(column => (usable * column.weight) / weights);
    if (y + 30 > bottom) page();
    else tableHeader();
    rows.forEach((row, rowIndex) => {
      pdf.setFont("helvetica", "normal");
      const lines = row.map((cell, index) =>
        wrap(cell, activeWidths[index] - 5)
      );
      const count = Math.max(...lines.map(cell => cell.length));
      const needed = count * lineHeight + 4;
      // Keep ordinary history rows together; exceptionally long reasons are split
      // across pages without dropping text, with column/context headers repeated.
      if (needed < bottom - 80 && y + needed > bottom) page();
      let offset = 0;
      while (offset < count) {
        room(lineHeight + 4);
        const capacity = Math.max(1, Math.floor((bottom - y - 4) / lineHeight));
        const take = Math.min(count - offset, capacity);
        const rowHeight = take * lineHeight + 4;
        pdf.setFillColor(rowIndex % 2 === 0 ? PALE : "#FFFFFF");
        pdf.rect(margin, y, usable, rowHeight, "F");
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(INK);
        let x = margin;
        lines.forEach((cell, index) => {
          cell
            .slice(offset, offset + take)
            .forEach((line, lineIndex) =>
              textLine(
                line,
                columns[index].align === "right"
                  ? x + activeWidths[index] - 2
                  : x + 2,
                y + 4 + lineIndex * lineHeight,
                size,
                columns[index].align
              )
            );
          x += activeWidths[index];
        });
        pdf.setDrawColor("#D8E4E9");
        pdf.line(margin, y + rowHeight, width - margin, y + rowHeight);
        y += rowHeight;
        offset += take;
        if (offset < count) page();
      }
    });
    activeColumns = undefined;
    y += 6;
  }
  const numeric = (title: string, weight: number): Column => ({
    title,
    weight,
    align: "right",
  });
  const balanceColumns: Column[] = [
    { title: "Employee / ID", weight: 85 },
    numeric("Allowance days", 35),
    numeric("Approved used days", 40),
    numeric("Remaining days", 40),
    numeric("Pending days", 35),
    numeric("Requests", 28),
  ];
  const values = (
    employee: (typeof report.employees)[number] | typeof report.totals
  ) => [
    number(employee.totalDays),
    number(employee.usedDays),
    number(employee.remainingDays),
    number(employee.pendingDays),
    number(employee.requestCount),
  ];
  const displayInstant = (instant: string | null) =>
    instant === null
      ? "Not reviewed"
      : new Date(instant).toLocaleString("en-GB", {
          timeZone: "Africa/Cairo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        });
  const statusLabel = (status: string) => {
    switch (status) {
      case "approved":
        return "Approved";
      case "pending":
        return "Pending";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  };

  page();
  paragraph(
    `Calendar year: 1 January - 31 December ${report.year} | Selected employees: ${report.totals.employeeCount} | All overlapping vacation statuses, including cross-year requests.`
  );
  table(
    [{ title: "Issued by (display name)", weight: 1 }],
    [[report.generatedBy]]
  );
  table(balanceColumns, [
    ...report.employees.map(employee => [
      `${employee.name} | #${employee.id}`,
      ...values(employee),
    ]),
    ["SELECTED TEAM TOTAL", ...values(report.totals)],
  ]);
  if (report.totals.missingBalanceCount) {
    paragraph(
      `Balance unavailable for ${report.totals.missingBalanceCount} employee(s). Team balance totals are partial and sum supplied balances only; missing values are not zero allowances.`
    );
  }
  paragraph(HR_ANNUAL_LEAVE_POLICY_TEXT);
  paragraph(
    "Balances are the authoritative selected-year overview values, including audited adjustments. Pending requests are informational only: they do not reserve leave and are NOT deducted from remaining days. No balances are recalculated by this export."
  );
  paragraph(
    "History includes every supplied request overlapping the calendar year, not just the current payroll period. Requested days cover the whole request; year days use its stored year allocation, including zero. Approved allocations are frozen at approval and are never recalculated against today's holidays. Pending/rejected rows retain the stored request snapshot. Working week: Sunday-Thursday, excluding public holidays."
  );
  paragraph(
    "All creation and decision timestamps are displayed in Africa/Cairo. This is a local HR report, not a salary receipt or payment instruction. No GPS, emails or CRM login identities are exported."
  );

  for (const employee of report.employees) {
    section = "Employee full vacation history";
    contextName = employee.name;
    contextId = `Employee #${employee.id}`;
    page();
    table([{ title: "Employee display name", weight: 1 }], [[employee.name]]);
    table(balanceColumns.slice(1), [values(employee)]);
    paragraph(
      `Selected calendar year: ${report.year} | ${employee.requestCount} overlapping request(s). Full original request dates are retained; year days refer only to ${report.year}. Pending days are not charged.`
    );
    if (employee.totalDays === null)
      paragraph(
        "Balance not supplied for this employee. No allowance or remaining balance has been inferred."
      );
    if (!employee.history.length) {
      paragraph(
        "No vacation requests overlap this calendar year in the supplied full history. The authoritative balance above is retained."
      );
      continue;
    }
    table(
      [
        { title: "Request / status", weight: 28 },
        { title: "From / to dates", weight: 29 },
        numeric("Requested / year days", 24),
        { title: "Request reason", weight: 62 },
        { title: "Decision reason", weight: 62 },
        { title: "Created (Cairo)", weight: 32 },
        { title: "Reviewed (Cairo)", weight: 32 },
      ],
      employee.history.map(row => [
        `#${row.id} ${statusLabel(row.status)}`,
        `${row.fromDate} to ${row.toDate}`,
        `${number(row.requestedDays)} / ${number(row.yearDays)}`,
        row.reason || "Not supplied",
        row.decisionReason ||
          (row.status === "pending" ? "Awaiting decision" : "Not supplied"),
        row.createdAt === null ? "Not supplied" : displayInstant(row.createdAt),
        displayInstant(row.reviewedAt),
      ])
    );
    paragraph(
      `History complete for supplied selection | ${employee.requestCount} request(s) | ${number(employee.pendingDays)} pending year day(s), not deducted from remaining balance.`
    );
  }
  const pages = pdf.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    pdf.setPage(index);
    pdf.setDrawColor(TEAL);
    pdf.line(margin, height - 12, width - margin, height - 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(MUTED);
    pdf.text(
      `ELEVAY | HR - CONFIDENTIAL | Annual vacation ${report.year} | No carryover; approved usage only`,
      margin,
      height - 7
    );
    pdf.text(`Page ${index} of ${pages}`, width - margin, height - 7, {
      align: "right",
    });
  }
  return pdf;
}

/** In-memory output for synthetic tests or an authorized local preview. */
export async function generateHrVacationPdfArrayBuffer(
  input: HrVacationPdfInput
): Promise<ArrayBuffer> {
  return (await createHrVacationPdf(input)).output("arraybuffer");
}

/** Browser-only download of exactly the supplied, already-authorized selection. */
export async function exportHrVacationPdf(
  input: HrVacationPdfInput
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Vacation PDF downloads require a browser");
  }
  const pdf = await createHrVacationPdf(input);
  await pdf.save(`ELEVAY-HR-Annual-Vacation-${input.year}.pdf`, {
    returnPromise: true,
  });
}

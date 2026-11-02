import {
  buildHrAttendanceReport,
  type HrAttendanceReportInput,
} from "@shared/hrAttendanceReport";
import type { jsPDF } from "jspdf";

export type HrAttendancePdfInput = Omit<
  HrAttendanceReportInput,
  "generatedAt"
> & {
  generatedAt?: Date;
};

const NAVY = "#1A3A5C";
const TEAL = "#5BA3B8";
const PALE = "#EDF5F7";
const INK = "#26394A";
const MUTED = "#526575";
const unicode = (value: string) => /[^\x20-\x7e]/.test(value);
const number = (value: number, places = 2) =>
  value.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
const money = (value: number) =>
  value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type Column = { title: string; weight: number; align?: "left" | "right" };
type Cell = string | { name: string };

/**
 * Generates an in-memory PDF without saving, network requests or CRM reads.
 * ASCII synthetic reports work in Node without a DOM. Browser canvas is used
 * ONLY for Unicode display names: existing report PDFs have no reusable Unicode
 * font/VFS helper. All other report content is selectable/searchable PDF text.
 */
export async function createHrAttendancePdf(
  input: HrAttendancePdfInput
): Promise<jsPDF> {
  const report = buildHrAttendanceReport({
    ...input,
    generatedAt: input.generatedAt ?? new Date(),
  });
  const needsUnicode =
    unicode(report.generatedBy) ||
    report.employees.some(employee => unicode(employee.name));
  if (needsUnicode && typeof document === "undefined") {
    throw new Error(
      "Unicode attendance names require browser canvas rendering"
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
    title: `ELEVAY HR Attendance | ${report.from} to ${report.to}`,
    subject: "Confidential attendance and payroll preview",
    author: "ELEVAY HR",
    creator: "ELEVAY CRM",
  });
  const margin = 14;
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const usable = width - margin * 2;
  const bottom = height - 17;
  const size = 8;
  const lineHeight = 4.4;
  let y = 0;
  let section = "Team summary";
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
        "Browser canvas is unavailable; Unicode names cannot be exported safely"
      );
    return ctx;
  }
  function nameWidth(text: string, fontSize: number): number {
    const ctx = context();
    ctx.font = `${(fontSize * 96) / 72}px system-ui, sans-serif`;
    return (ctx.measureText(text).width * 25.4) / 96;
  }
  function wrap(
    text: string,
    cellWidth: number,
    fontSize = size,
    isName = false
  ): string[] {
    if (!text) return [""];
    pdf.setFontSize(fontSize);
    const measure =
      isName && unicode(text)
        ? (line: string) => nameWidth(line, fontSize)
        : (line: string) => pdf.getTextWidth(line);
    // Word wrapping also breaks exceptionally long unspaced names, without
    // silently clipping or shrinking an entire row to an unreadable size.
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= cellWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const char of Array.from(word)) {
        if (line && measure(line + char) > cellWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }
  function nameLine(
    text: string,
    x: number,
    baseline: number,
    fontSize = size
  ) {
    if (!unicode(text)) {
      pdf.text(text, x, baseline);
      return;
    }
    // Canvas relies on the browser's shaping and bidi engines, unlike the
    // built-in Latin jsPDF fonts. Never pass Arabic names through Helvetica.
    const ctx = context();
    const scale = 3;
    const pxPerMm = 96 / 25.4;
    const fontPx = (fontSize * 96) / 72;
    const textWidth = nameWidth(text, fontSize);
    const imageHeight = fontPx * 1.8;
    canvas!.width = Math.ceil((textWidth * pxPerMm + 6) * scale);
    canvas!.height = Math.ceil(imageHeight * scale);
    ctx.scale(scale, scale);
    ctx.font = `${fontPx}px system-ui, sans-serif`;
    ctx.fillStyle = INK;
    ctx.textBaseline = "alphabetic";
    const rtl = /[\u0590-\u08ff\ufb1d-\ufeff]/.test(text);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(text, rtl ? canvas!.width / scale - 3 : 3, fontPx * 1.25);
    pdf.addImage(
      canvas!.toDataURL("image/png"),
      "PNG",
      x,
      baseline - (fontPx * 1.25) / pxPerMm,
      canvas!.width / scale / pxPerMm,
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
    pdf.text("HUMAN RESOURCES  /  CONFIDENTIAL", width - margin, 13, {
      align: "right",
    });
    pdf.text(
      `${report.from} to ${report.to} | Inclusive | Africa/Cairo`,
      width - margin,
      19,
      { align: "right" }
    );
    pdf.setDrawColor(TEAL);
    pdf.line(margin, 23, width - margin, 23);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(NAVY);
    pdf.text(section, margin, 31);
    y = 37;
    if (contextName) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(size);
      pdf.setTextColor(INK);
      // Context is deliberately bounded to two lines; the full name is printed
      // in a paginated identity table on the employee's first detail page.
      for (const line of wrap(contextName, usable - 36, size, true).slice(
        0,
        2
      )) {
        nameLine(line, margin, y);
        y += lineHeight;
      }
      pdf.text(contextId, width - margin, 37, { align: "right" });
      y += 2;
    }
    if (activeColumns) tableHeader();
  }
  function room(required: number) {
    if (y + required > bottom) page();
  }
  function paragraph(text: string, fontSize = size) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(MUTED);
    for (const line of wrap(text, usable, fontSize)) {
      room(lineHeight);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize);
      pdf.setTextColor(MUTED);
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += 2;
  }
  function tableHeader() {
    const lines = activeColumns!.map((col, index) =>
      wrap(col.title, activeWidths[index] - 4, size)
    );
    const rowHeight =
      Math.max(...lines.map(cell => cell.length)) * lineHeight + 4;
    pdf.setFillColor(NAVY);
    pdf.rect(margin, y, usable, rowHeight, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(size);
    pdf.setTextColor("#FFFFFF");
    let x = margin;
    lines.forEach((cell, index) => {
      cell.forEach((line, lineIndex) =>
        pdf.text(
          line,
          activeColumns![index].align === "right"
            ? x + activeWidths[index] - 2
            : x + 2,
          y + 4 + lineIndex * lineHeight,
          { align: activeColumns![index].align ?? "left" }
        )
      );
      x += activeWidths[index];
    });
    y += rowHeight;
    pdf.setFont("helvetica", "normal");
  }
  function table(columns: Column[], rows: Cell[][]) {
    // Set widths before entering a continuation page so repeated headers have
    // exactly the same geometry as the initial table header.
    activeColumns = columns;
    const weights = columns.reduce((total, col) => total + col.weight, 0);
    activeWidths = columns.map(col => (usable * col.weight) / weights);
    if (y + 28 > bottom) page();
    else tableHeader();
    rows.forEach((row, rowIndex) => {
      pdf.setFont("helvetica", "normal");
      const lines = row.map((cell, index) =>
        wrap(
          typeof cell === "string" ? cell : cell.name,
          activeWidths[index] - 5,
          size,
          typeof cell !== "string"
        )
      );
      const count = Math.max(...lines.map(cell => cell.length));
      let offset = 0;
      while (offset < count) {
        room(lineHeight + 4);
        const capacity = Math.max(1, Math.floor((bottom - y - 4) / lineHeight));
        const take = Math.min(count - offset, capacity);
        const rowHeight = take * lineHeight + 4;
        pdf.setFillColor(rowIndex % 2 === 0 ? PALE : "#FFFFFF");
        pdf.rect(margin, y, usable, rowHeight, "F");
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(INK);
        let x = margin;
        lines.forEach((cell, index) => {
          cell.slice(offset, offset + take).forEach((line, lineIndex) => {
            const baseline = y + 4 + lineIndex * lineHeight;
            if (typeof row[index] !== "string") nameLine(line, x + 2, baseline);
            else
              pdf.text(
                line,
                columns[index].align === "right"
                  ? x + activeWidths[index] - 2
                  : x + 2,
                baseline,
                { align: columns[index].align ?? "left" }
              );
          });
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
  const summaryColumns: Column[] = [
    { title: "Employee / ID", weight: 48 },
    numeric("Late min", 17),
    numeric("Early exit min", 19),
    numeric("Absent days", 17),
    numeric("Absence min", 21),
    numeric("Incomplete penalty min", 23),
    numeric("Total lost min", 22),
    numeric("Lost hours", 20),
    numeric("Equivalent days", 22),
    numeric("Preview EGP", 28),
  ];
  const summaryValues = (employee: typeof report.totals): string[] => [
    number(employee.lateMinutes),
    number(employee.earlyMinutes),
    number(employee.absentDays),
    number(employee.absenceMinutes),
    number(employee.incompletePenaltyMinutes),
    number(employee.totalLostMinutes),
    number(employee.lostHours, 4),
    number(employee.equivalentDays, 4),
    money(employee.totalDeduction),
  ];
  page();
  paragraph(
    `Selected employees: ${report.employees.length} | Calendar days: ${report.calendarDays} | Payroll preview only - not a finalized salary receipt.`
  );
  const cairoTimestamp = new Date(report.generatedAt).toLocaleString("en-GB", {
    timeZone: report.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  paragraph(`Generated: ${cairoTimestamp} (Africa/Cairo)`);
  table(
    [{ title: "Generated by (display name)", weight: 1 }],
    [[{ name: report.generatedBy }]]
  );
  table(summaryColumns, [
    ...report.employees.map(employee => [
      { name: `${employee.name} | #${employee.id}` },
      ...summaryValues(employee),
    ]),
    ["SELECTED TOTAL", ...summaryValues(report.totals)],
  ]);
  paragraph(
    "Units: min = minutes; hours = lost minutes / 60. Equivalent days are the authoritative sum of each day's lost minutes / that day's configured shift length; no fixed eight-hour conversion is used. Team equivalent days are employee-day equivalents."
  );
  paragraph(
    "Total lost minutes already include late arrival, early exit, absence and incomplete-punch penalties. Do not add the components to the total again. Incomplete penalties follow the payroll cycle's three-for-one rule; only charged dates carry missing minutes."
  );
  paragraph(
    "Approved paid leave, weekends, public holidays, future days, shifts in progress and unconfigured dates carry no penalties. Only the supplied employee selection is included, in its supplied order. EGP figures are payroll previews using the existing cycle/salary context."
  );
  paragraph(
    "Salary deduction basis: monthly salary / 30 calendar days (not monthly salary / scheduled working days). Payroll preserves precision until final monetary rounding. All displayed deductions are the supplied authoritative payroll values, not recalculated by this export."
  );
  paragraph(
    "27 Oct-3 Nov 2026: owner-approved on-time attendance credit; regular enforcement from 4 Nov. Credits do not fabricate clock-in/out records. Credited dates are explicitly labeled and carry no penalties."
  );

  for (const employee of report.employees) {
    section = "Employee attendance detail";
    contextName = employee.name;
    contextId = `Employee #${employee.id}`;
    page();
    table(
      [{ title: "Employee display name", weight: 1 }],
      [[{ name: employee.name }]]
    );
    table(summaryColumns.slice(1), [summaryValues(employee)]);
    paragraph(
      `Working days: ${number(employee.workingDays)} | Evaluated days: ${number(employee.evaluatedDays)} | Incomplete punches: ${number(employee.incompleteDays)} | Charged incomplete days: ${number(employee.incompleteDeductionDays)}`
    );
    paragraph(
      `Covered base: ${money(employee.coveredBaseSalary)} EGP | Preview deduction: ${money(employee.totalDeduction)} EGP | Preview net: ${money(employee.netSalary)} EGP`
    );
    paragraph(
      "Daily salary weight = monthly salary / 30 calendar days. Shift lengths determine attendance day-equivalents, not the salary divisor. Amounts below preserve the existing payroll preview."
    );
    if (employee.cycleBreakdown.length) {
      table(
        [
          { title: "Payroll cycle (27th-26th)", weight: 49 },
          { title: "Covered dates", weight: 49 },
          numeric("Full cycle workdays", 25),
          numeric("Covered workdays", 25),
          numeric("Monthly EGP", 29),
          numeric("Covered base EGP", 29),
          numeric("Preview deduction EGP", 31),
          numeric("Equivalent days", 26),
        ],
        employee.cycleBreakdown.map(cycle => [
          `${cycle.from} to ${cycle.to}`,
          `${cycle.coveredFrom} to ${cycle.coveredTo}`,
          number(cycle.fullCycleWorkingDays),
          number(cycle.workingDays),
          money(cycle.salary),
          money(cycle.coveredBaseSalary),
          money(cycle.totalDeduction),
          number(cycle.equivalentDays, 4),
        ])
      );
      paragraph(
        "Cycle money rows are rounded individually by payroll. The authoritative selected-period summary can differ from their sum by rounding; it has not been recomputed here."
      );
    }
    section = "Employee daily attendance sheet";
    page();
    paragraph(
      "One row per inclusive Cairo business date. Lost min is the source missingMinutes value, not late + early + missing. No raw punches, GPS, emails or CRM user identities are exported."
    );
    table(
      [
        { title: "Cairo date", weight: 29 },
        { title: "Payroll status", weight: 74 },
        numeric("Late min", 25),
        numeric("Early exit min", 27),
        numeric("Absence min", 29),
        numeric("Incomplete penalty min", 36),
        numeric("Total lost min", 29),
      ],
      employee.days.map(day => [
        day.date,
        day.statusLabel,
        number(day.lateMinutes),
        number(day.earlyMinutes),
        number(day.absenceMinutes),
        number(day.incompletePenaltyMinutes),
        number(day.missingMinutes),
      ])
    );
    paragraph(
      `Period totals | Late: ${number(employee.lateMinutes)} min | Early exit: ${number(employee.earlyMinutes)} min | Absent: ${number(employee.absentDays)} days / ${number(employee.absenceMinutes)} min | Incomplete penalties: ${number(employee.incompletePenaltyMinutes)} min`
    );
    paragraph(
      `Total lost: ${number(employee.totalLostMinutes)} min / ${number(employee.lostHours, 4)} hours / ${number(employee.equivalentDays, 4)} equivalent days | Preview deduction: ${money(employee.totalDeduction)} EGP`
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
      "ELEVAY | HR - CONFIDENTIAL | Payroll preview, not a finalized deduction",
      margin,
      height - 7
    );
    pdf.text(`Page ${index} of ${pages}`, width - margin, height - 7, {
      align: "right",
    });
  }
  return pdf;
}

/** In-memory output for tests, previews or an authorized browser download flow. */
export async function generateHrAttendancePdfArrayBuffer(
  input: HrAttendancePdfInput
): Promise<ArrayBuffer> {
  return (await createHrAttendancePdf(input)).output("arraybuffer");
}

/** Browser-only download; exports exactly the supplied, already-authorized selection. */
export async function exportHrAttendancePdf(
  input: HrAttendancePdfInput
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Attendance PDF downloads require a browser");
  }
  const pdf = await createHrAttendancePdf(input);
  await pdf.save(`ELEVAY-HR-Attendance-${input.from}-to-${input.to}.pdf`, {
    returnPromise: true,
  });
}

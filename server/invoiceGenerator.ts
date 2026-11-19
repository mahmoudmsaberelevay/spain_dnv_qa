import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import { readFileSync } from "node:fs";
import { storagePut } from "./storage";

// CDN assets
const LOGO_CDN_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/bird_logo_trimmed_4fc28cf5.png";
const SIGNATURE_CDN_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/signature_original_40ea0ddc.png";

export interface ReceiptData {
  invoiceCode: string;
  contractCode?: string;
  clientName: string;
  clientMobile?: string;
  amountEur: number;
  amountEgp: number;
  exchangeRate: number;
  contractValue?: number;
  totalPaid?: number;
  remainingBalance?: number;
  netContractValueEur?: number;
  remainingBeforeEur?: number;
  paymentEurEquivalent?: number;
  actualReceivedAmount?: number;
  actualReceivedCurrency?: "EGP" | "EUR" | "USD";
  paymentExchangeRate?: number;
  remainingAfterEur?: number;
  createdAt: Date;
  financialSummary?: {
    status: "available" | "reconciliation_required";
    netContractValueEur?: number;
    totalPaidEur?: number;
    remainingEur?: number;
  };
  notes?: string;
  // Partial payment fields (EGP)
  actualPaidAmountEgp?: number;
  remainingAmountEgp?: number;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** Current Income totals and immutable receipt evidence are deliberately separate. */
export function getReceiptPresentationRows(data: ReceiptData): { label: string; value: string }[] {
  const summary = data.financialSummary;
  const money = (value: number | undefined, currency: string) =>
    value != null && Number.isFinite(value) ? formatCurrency(value, currency) : "Reconciliation required";
  const isAvailable = summary ? summary.status === "available" : data.totalPaid != null && data.remainingBalance != null;
  const rows = [
    { label: "TOTAL NET CONTRACT VALUE (EUR)", value: money(summary ? summary.netContractValueEur : data.contractValue ?? data.netContractValueEur, "EUR") },
    { label: "TOTAL PAID FROM INCOME (EUR)", value: money(isAvailable ? (summary ? summary.totalPaidEur : data.totalPaid) : undefined, "EUR") },
    { label: "TOTAL REMAINING FROM INCOME (EUR)", value: money(isAvailable ? (summary ? summary.remainingEur : data.remainingBalance) : undefined, "EUR") },
    { label: "CURRENT PAYMENT DUE (EUR)", value: money(data.amountEur, "EUR") },
  ];
  if (Number.isFinite(data.amountEgp)) {
    rows.push({ label: "CURRENT PAYMENT DUE (EGP)", value: money(data.amountEgp, "EGP") });
  }
  const currency = data.actualReceivedCurrency ?? "EGP";
  const actual = data.actualReceivedAmount ?? data.actualPaidAmountEgp;
  rows.push({ label: `RECEIPT ACTUAL PAID (${currency})`, value: actual != null && Number.isFinite(actual) ? formatCurrency(actual, currency) : "Not recorded" });
  if (data.paymentEurEquivalent != null) {
    rows.push({ label: "RECEIPT EUR EQUIVALENT (EVIDENCE)", value: money(data.paymentEurEquivalent, "EUR") });
  }
  const rate = data.paymentExchangeRate ?? (currency === "EGP" ? data.exchangeRate : undefined);
  rows.push({ label: `STORED RATE (1 EUR = ${currency})`, value: rate != null && Number.isFinite(rate) && rate > 0 ? rate.toFixed(4) : "Not recorded" });
  return rows;
}

/** Download a remote image and return a Buffer */
function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/** Generate a PDF receipt using PDFKit and upload to S3 */
export async function generateAndUploadInvoicePdf(data: ReceiptData): Promise<string> {
  const [logoBuffer, signatureBuffer] = await Promise.allSettled([
    downloadImage(LOGO_CDN_URL),
    downloadImage(SIGNATURE_CDN_URL),
  ]).then((results) =>
    results.map((r) => (r.status === "fulfilled" ? r.value : null))
  );

  const pdfBuffer = await buildPdf(data, logoBuffer as Buffer | null, signatureBuffer as Buffer | null);
  const filename = `receipts/${data.invoiceCode}_${data.clientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
  const { url } = await storagePut(filename, pdfBuffer, "application/pdf");
  return url;
}

/** Generate a current report without network calls, storage writes or changes to original evidence. */
export async function generateInvoicePdfBuffer(data: ReceiptData): Promise<Buffer> {
  let logo: Buffer | null = null;
  for (const asset of ["./command-center-assets/elevay-logo.png", "./commandCenter/assets/elevay-logo.png"]) {
    try { logo = readFileSync(new URL(asset, import.meta.url)); break; } catch { /* fixed packaged paths only */ }
  }
  return buildPdf(data, logo, null);
}

export { downloadImage };

function buildPdf(
  data: ReceiptData,
  logoBuffer: Buffer | null,
  signatureBuffer: Buffer | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Color palette matching template ─────────────────────────────────
    const greyBg    = "#7A8C95";   // logo box background + table header bg
    const lightGrey = "#B0BEC5";   // "Reciept" title color
    const darkText  = "#1A1A1A";   // body text
    const midGrey   = "#6B7B84";   // secondary text, exchange rate
    const tableHdr  = "#7A8C95";   // description table header bg
    const summaryHdr = "#5E6A71";  // summary table left-column bg
    const summaryVal = "#8A9BA3";  // summary table right-column bg
    const white     = "#FFFFFF";

    // Page geometry (A4 = 595 x 842 pts)
    const PW = 595;
    const L  = 50;   // left margin
    const R  = 545;  // right margin
    const W  = R - L; // 495 usable width

    let y = 40;

    // ══════════════════════════════════════════════════════════════════════
    // HEADER: Logo box (left) + "Reciept" title (right)
    // ══════════════════════════════════════════════════════════════════════
    const logoBoxSize = 90;

    // No bird logo — just ELEVAY text and subtitle
    doc.fontSize(36).fillColor(greyBg).font("Helvetica-Bold")
       .text("ELEVAY", L, y + 8, { lineBreak: false });

    // "EXPANDING YOUR FREEDOM" subtitle
    doc.fontSize(10).fillColor(midGrey).font("Helvetica")
       .text("EXPANDING YOUR FREEDOM", L, y + 52, { lineBreak: false });

    // "Reciept" title on the right (italic-style, light grey)
    doc.fontSize(32).fillColor(lightGrey).font("Helvetica")
       .text("Receipt", R - 160, y + 20, { width: 160, align: "right", lineBreak: false });

    y += logoBoxSize + 30;

    // ══════════════════════════════════════════════════════════════════════
    // CLIENT INFO + DATE / INVOICE #
    // ══════════════════════════════════════════════════════════════════════
    // Left: "To:" + client name + phone
    doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
       .text("To:", L, y, { continued: true })
       .font("Helvetica")
       .text(`  ${data.clientName}`, { lineBreak: false });
    if (data.clientMobile) {
      doc.fontSize(10).fillColor(darkText).font("Helvetica")
         .text(data.clientMobile, L + 22, y + 14, { lineBreak: false });
    }

    // Right: Date + Invoice #
    const rightColX = PW / 2 + 20;
    const labelW = 65;
    const valX = rightColX + labelW;

    doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
       .text("Date:", rightColX, y, { width: labelW, lineBreak: false });
    doc.fontSize(10).fillColor(darkText).font("Helvetica")
       .text(formatDate(data.createdAt), valX, y, { lineBreak: false });

    doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
       .text("Invoice #:", rightColX, y + 14, { width: labelW, lineBreak: false });
    doc.fontSize(10).fillColor(darkText).font("Helvetica")
       .text(data.invoiceCode, valX, y + 14, { lineBreak: false });

    y += 50;

    // ══════════════════════════════════════════════════════════════════════
    // DESCRIPTION TABLE
    // ══════════════════════════════════════════════════════════════════════
    const col1W = W * 0.55;   // Description column
    const col2W = W * 0.225;  // EUROS column
    const col3W = W * 0.225;  // EGP column
    const col2X = L + col1W;
    const col3X = col2X + col2W;

    // Table header row
    const thH = 22;
    doc.rect(L, y, W, thH).fill(tableHdr);
    doc.fontSize(9).fillColor(white).font("Helvetica-Bold");
    doc.text("DESCRIPTION", L + 6, y + 7, { width: col1W - 6, lineBreak: false });
    doc.text("EUROS", col2X, y + 7, { width: col2W, align: "center", lineBreak: false });
    doc.text("EGP", col3X, y + 7, { width: col3W, align: "center", lineBreak: false });
    y += thH;

    // Table data row — service line
    const serviceRowH = 20;
    doc.rect(L, y, W, serviceRowH).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    doc.fontSize(9).fillColor(darkText).font("Helvetica")
       .text("Current receipt payment due - Client services", L + 6, y + 6, { width: col1W - 12, lineBreak: false });
    // Add space between € sign and number in description table
    const eurAmtFormatted = formatCurrency(data.amountEur, "EUR").replace(/^(€|EUR\s*)/, "€ ");
    const egpAmtFormatted = Number.isFinite(data.amountEgp) ? formatCurrency(data.amountEgp, "EGP").replace(/^(EGP\s*)/, "EGP ") : "Not recorded";
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text(eurAmtFormatted, col2X, y + 6, { width: col2W, align: "center", lineBreak: false });
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text(egpAmtFormatted, col3X, y + 6, { width: col3W, align: "center", lineBreak: false });
    y += serviceRowH;

    // Note row (spans full width)
    const noteText = data.notes || "";
    const noteRowH = 22;
    doc.rect(L, y, W, noteRowH).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    doc.fontSize(9).fillColor(darkText).font("Helvetica")
       .text(noteText, L + 6, y + 7, { width: W - 12, lineBreak: false });
    y += noteRowH + 14;

    // ══════════════════════════════════════════════════════════════════════
    // EXCHANGE RATE LINE
    // ══════════════════════════════════════════════════════════════════════
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    y += 6;
    doc.fontSize(9).fillColor(midGrey).font("Helvetica")
       .text(
         Number.isFinite(data.exchangeRate) && data.exchangeRate > 0
           ? `Stored due rate: 1 EUR = ${data.exchangeRate.toFixed(4)} EGP`
           : "Stored due rate: Not recorded (original evidence unchanged)",
         L, y, { lineBreak: false }
       );
    y += 20;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    y += 16;

    // ══════════════════════════════════════════════════════════════════════
    // SUMMARY TABLE (2 columns: label | value)
    // ══════════════════════════════════════════════════════════════════════
    const summaryRows = getReceiptPresentationRows(data);

    const sLabelW = W * 0.64;
    const sValW   = W * 0.36;
    const sValX   = L + sLabelW;

    for (const row of summaryRows) {
      const rH = 24;
      // Left cell (dark grey bg, white text)
      doc.rect(L, y, sLabelW, rH).fill(summaryHdr);
      doc.fontSize(9).fillColor(white).font("Helvetica-Bold")
         .text(row.label, L + 6, y + 8, { width: sLabelW - 12, lineBreak: false });
      // Right cell (medium grey bg, white text)
      doc.rect(sValX, y, sValW, rH).fill(summaryVal);
      // Add a non-breaking space between € and the number for visual breathing room
      const spacedValue = row.value.replace(/^(€|EUR\s*)/, "€ ");
      doc.fontSize(9).fillColor(white).font("Helvetica-Bold")
         .text(spacedValue, sValX, y + 8, { width: sValW - 6, align: "right", lineBreak: false });
      y += rH;
    }

    y += 8;
    doc.fontSize(8).fillColor(midGrey).font("Helvetica").text(
      "Current financial totals use Finance Income only. This receipt is evidence; issuing or marking it paid does not credit the balance. Original amounts and stored rates are unchanged.",
      L, y, { width: W }
    );
    y = doc.y;
    y += 20;

    // ══════════════════════════════════════════════════════════════════════
    // AUTHORIZED SIGNATURE
    // ══════════════════════════════════════════════════════════════════════
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    y += 10;
    doc.fontSize(10).fillColor(darkText).font("Helvetica")
       .text("Authorized Signature", L, y, { lineBreak: false });
    y += 14;

    if (signatureBuffer) {
      try {
        doc.image(signatureBuffer, L, y, { width: 200, height: 80 });
        y += 90;
      } catch (e) {
        console.warn("[Receipt] Could not embed signature:", e);
        y += 20;
      }
    }

    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    y += 10;

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER — centered
    // ══════════════════════════════════════════════════════════════════════
    const pageH = doc.page.height; // 841.89 for A4
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text("ELEVAY", L, pageH - 72, { width: W, align: "center", lineBreak: false });
    doc.fontSize(8).fillColor(midGrey).font("Helvetica")
       .text("Citizenship &Residency by Investment | Cairo, Egypt & Dubai, UAE", L, pageH - 58, { width: W, align: "center", lineBreak: false });
    doc.fontSize(8).fillColor(midGrey).font("Helvetica")
       .text("Tel: +20 016222280 | Building 3, 2nd Floor, Office 2D2, Beverly Hills, Al Sheikh Zayed, Giza", L, pageH - 46, { width: W, align: "center", lineBreak: false });

    doc.end();
  });
}

/** HTML uses the same presentation model as the PDF. */
export function generateInvoiceHtml(data: ReceiptData): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
  const rows = getReceiptPresentationRows(data).map(row => `<tr><th>${escape(row.label)}</th><td>${escape(row.value)}</td></tr>`).join("");
  return `<html><body><h1>Receipt ${escape(data.invoiceCode)}</h1><p>${escape(data.clientName)}</p><table>${rows}</table><p>Finance Income only changes the balance. Receipt amounts are evidence, not additional credit.</p></body></html>`;
}

import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import { storagePut } from "./storage";

// Full signature (ELEVAY stamp + handwritten) — complete crop
const SIGNATURE_CDN_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/kN35iJC3mTAPmbEMAFkqBd/signature_full_eb898951.png";

export interface ReceiptData {
  invoiceCode: string;
  contractCode: string;
  clientName: string;       // invoicing name (English)
  clientMobile?: string;
  amountEur: number;
  amountEgp: number;
  exchangeRate: number;
  contractValue: number;
  totalPaid: number;
  remainingBalance: number;
  createdAt: Date;
  notes?: string;
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

/** Generate a PDF receipt using PDFKit (no Chromium required) */
export async function generateAndUploadInvoicePdf(data: ReceiptData): Promise<string> {
  let signatureBuffer: Buffer | null = null;
  try {
    signatureBuffer = await downloadImage(SIGNATURE_CDN_URL);
  } catch (e) {
    console.warn("[Receipt] Could not download signature image:", e);
  }

  const pdfBuffer = await buildPdf(data, signatureBuffer);
  const filename = `receipts/${data.invoiceCode}_${data.clientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
  const { url } = await storagePut(filename, pdfBuffer, "application/pdf");
  return url;
}

/** Generate the PDF buffer only (without uploading) — used for Google Drive sync */
export async function generateInvoicePdfBuffer(data: ReceiptData): Promise<Buffer> {
  let signatureBuffer: Buffer | null = null;
  try {
    signatureBuffer = await downloadImage(SIGNATURE_CDN_URL);
  } catch (e) {
    console.warn("[Receipt] Could not download signature image:", e);
  }
  return buildPdf(data, signatureBuffer);
}

export { downloadImage };

function buildPdf(data: ReceiptData, signatureBuffer: Buffer | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Colour Palette (no red — all text matches row context) ──────────────
    const headerGrey  = "#5E6A71";   // ELEVAY grey — header background
    const white       = "#FFFFFF";   // header text
    const darkText    = "#1A1A1A";   // body labels, names, dates, amounts
    const midGrey     = "#5E6A71";   // secondary labels (exchange rate, sub-text)
    const rowGrey     = "#D0D5D8";   // table header row background
    const summaryBg   = "#E8EBEC";   // summary rows background

    // Page geometry
    const L = 50;                    // left margin
    const R = 545;                   // right edge
    const W = R - L;                 // usable width = 495

    let y = 40; // current vertical cursor

    // ══════════════════════════════════════════════════════════════════════
    // HEADER BOX
    // ══════════════════════════════════════════════════════════════════════
    const headerH = 80;
    doc.rect(L, y, W, headerH).fill(headerGrey);

    // Left: ELEVAY / RESIDENCY BY / INVESTMENT
    doc.fontSize(16).fillColor(white).font("Helvetica-Bold")
       .text("ELEVAY", L + 16, y + 14, { lineBreak: false });
    doc.fontSize(10).fillColor(white).font("Helvetica-Bold")
       .text("RESIDENCY BY", L + 16, y + 34, { lineBreak: false });
    doc.fontSize(10).fillColor(white).font("Helvetica-Bold")
       .text("INVESTMENT", L + 16, y + 50, { lineBreak: false });

    // Right: RECEIPT label (white) + receipt number (white)
    doc.fontSize(18).fillColor(white).font("Helvetica-Bold")
       .text("RECEIPT", R - 220, y + 14, { width: 210, align: "right", lineBreak: false });
    doc.fontSize(11).fillColor(white).font("Helvetica-Bold")
       .text(`1# ${data.invoiceCode}`, R - 220, y + 42, { width: 210, align: "right", lineBreak: false });

    y += headerH + 20;

    // ══════════════════════════════════════════════════════════════════════
    // BILL TO + DATE
    // ══════════════════════════════════════════════════════════════════════
    // Left: BILL TO label + client name (dark) + mobile (dark)
    doc.fontSize(11).fillColor(darkText).font("Helvetica-Bold")
       .text("BILL TO:", L, y, { lineBreak: false });
    doc.fontSize(12).fillColor(darkText).font("Helvetica-Bold")
       .text(data.clientName.toUpperCase(), L, y + 18, { lineBreak: false });
    if (data.clientMobile) {
      doc.fontSize(10).fillColor(darkText).font("Helvetica")
         .text(data.clientMobile, L, y + 36, { lineBreak: false });
    }

    // Right: Date label + date value (dark)
    doc.fontSize(11).fillColor(darkText).font("Helvetica-Bold")
       .text("Date", R - 160, y, { width: 160, align: "right", lineBreak: false });
    doc.fontSize(11).fillColor(darkText).font("Helvetica")
       .text(formatDate(data.createdAt), R - 160, y + 18, { width: 160, align: "right", lineBreak: false });

    y += data.clientMobile ? 60 : 44;

    // ── Horizontal divider ─────────────────────────────────────────────────
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(headerGrey).stroke();
    y += 16;

    // ══════════════════════════════════════════════════════════════════════
    // DESCRIPTION TABLE
    // ══════════════════════════════════════════════════════════════════════
    const colEurX  = R - 170;
    const colEgpX  = R - 80;
    const colW     = 80;

    // Table header row (grey bg, white text)
    const thH = 24;
    doc.rect(L, y, W, thH).fill(rowGrey);
    doc.fontSize(10).fillColor(white).font("Helvetica-Bold");
    doc.text("DESCRIPTION", L + 10, y + 7, { lineBreak: false });
    doc.text("EUR", colEurX, y + 7, { width: colW, align: "center", lineBreak: false });
    doc.text("EGP", colEgpX, y + 7, { width: colW, align: "center", lineBreak: false });
    y += thH;

    // Table data row (white bg, values in red)
    const descText = `Spanish Residency Service — Digital Nomad Program${data.notes ? `\n${data.notes}` : ""}`;
    const rowH = 56;
    doc.rect(L, y, W, rowH).fill(white);
    // thin border
    doc.rect(L, y, W, rowH).lineWidth(0.5).strokeColor("#CCCCCC").stroke();

    doc.fontSize(11).fillColor(darkText).font("Helvetica-Bold")
       .text("Service Payment", L + 10, y + 8, { lineBreak: false });
    doc.fontSize(9).fillColor(darkText).font("Helvetica")
       .text(descText, L + 10, y + 24, { width: colEurX - L - 20 });

    // EUR/EGP amounts: font size reduced by 2 (was 11 → now 9)
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text(formatCurrency(data.amountEur, "EUR"), colEurX, y + 20, { width: colW, align: "center", lineBreak: false });
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text(formatCurrency(data.amountEgp, "EGP"), colEgpX, y + 20, { width: colW, align: "center", lineBreak: false });

    y += rowH + 14;

    // ── Exchange Rate line (grey text) ─────────────────────────────────────
    doc.fontSize(10).fillColor(midGrey).font("Helvetica")
       .text(
         `Exchange Rate: 1 EUR = ${data.exchangeRate.toFixed(4)} EGP (as of ${formatDate(data.createdAt)})`,
         L, y, { lineBreak: false }
       );
    y += 28;

    // ══════════════════════════════════════════════════════════════════════
    // SUMMARY TABLE
    // ══════════════════════════════════════════════════════════════════════
    const summaryRows = [
      { label: "TOTAL CONTRACT VALUE", value: formatCurrency(data.contractValue, "EUR") },
      { label: "TOTAL PAID",           value: formatCurrency(data.totalPaid, "EUR") },
      { label: "REMAINING BALANCE",    value: formatCurrency(data.remainingBalance, "EUR") },
    ];

    for (const row of summaryRows) {
      const rH = 26;
      doc.rect(L, y, W, rH).fill(summaryBg);
      doc.rect(L, y, W, rH).lineWidth(0.5).strokeColor("#BBBBBB").stroke();
      doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
         .text(row.label, L + 10, y + 8, { lineBreak: false });
      doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
         .text(row.value, R - 160, y + 8, { width: 150, align: "right", lineBreak: false });
      y += rH;
    }

    y += 20;

    // ══════════════════════════════════════════════════════════════════════
    // AUTHORIZED SIGNATURE
    // ══════════════════════════════════════════════════════════════════════
    doc.fontSize(11).fillColor(darkText).font("Helvetica")
       .text("Authorized Signature", L, y, { lineBreak: false });
    y += 16;

    if (signatureBuffer) {
      try {
        // Render the full signature (stamp + handwriting) — height increased by 50% (78 → 117)
        doc.image(signatureBuffer, L, y, { width: 220, height: 117 });
        y += 130;
      } catch (e) {
        console.warn("[Receipt] Could not embed signature image:", e);
        y += 20;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER — centered 2-line address text + horizontal line at very bottom
    // ══════════════════════════════════════════════════════════════════════
    const pageH = doc.page.height; // 841.89 for A4

    // Footer text: 2 lines, centered, font size 8
    const footerLine1 = "ELEVAY \u2014 Residency by Investment | Cairo, Egypt & Dubai, UAE";
    const footerLine2 = "Tel: +20 016222280 | Building 3, 2nd Floor, Office 2D2, Beverly Hills, Al Sheikh Zayed, Giza";
    doc.fontSize(8).fillColor(midGrey).font("Helvetica")
       .text(footerLine1, L, pageH - 62, { width: W, align: "center", lineBreak: false });
    doc.fontSize(8).fillColor(midGrey).font("Helvetica")
       .text(footerLine2, L, pageH - 52, { width: W, align: "center", lineBreak: false });

    // Bottom horizontal line
    doc.moveTo(L, pageH - 40).lineTo(R, pageH - 40).lineWidth(1.5).strokeColor(headerGrey).stroke();

    doc.end();
  });
}

/** Keep for reference */
export function generateInvoiceHtml(data: ReceiptData): string {
  return `<html><body><h1>Receipt ${data.invoiceCode}</h1><p>${data.clientName}</p></body></html>`;
}

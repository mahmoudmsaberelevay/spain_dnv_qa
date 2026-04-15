import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import { storagePut } from "./storage";

const LOGO_CDN_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/bird_logo_trimmed_4fc28cf5.png";
const SIGNATURE_CDN_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/signature_original_40ea0ddc.png";

export interface ProformaData {
  proformaCode: string;
  contractCode?: string;
  clientName: string;
  clientMobile?: string;
  amountEur: number;
  amountEgp: number;
  exchangeRate: number;
  notes?: string;
  createdAt: Date;
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

export async function generateAndUploadProformaPdf(data: ProformaData): Promise<string> {
  const [logoBuffer, signatureBuffer] = await Promise.allSettled([
    downloadImage(LOGO_CDN_URL),
    downloadImage(SIGNATURE_CDN_URL),
  ]).then((results) =>
    results.map((r) => (r.status === "fulfilled" ? r.value : null))
  );
  const pdfBuffer = await buildProformaPdf(data, logoBuffer as Buffer | null, signatureBuffer as Buffer | null);
  const filename = `proforma/${data.proformaCode}_${data.clientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
  const { url } = await storagePut(filename, pdfBuffer, "application/pdf");
  return url;
}

async function buildProformaPdf(
  data: ProformaData,
  logoBuffer: Buffer | null,
  signatureBuffer: Buffer | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Colour palette (same as receipt)
    const white     = "#FFFFFF";
    const greyBg    = "#2D2D2D";
    const lightGrey = "#AAAAAA";
    const midGrey   = "#666666";
    const darkText  = "#333333";
    const tableHdr  = "#3A3A3A";
    const summaryHdr = "#4A4A4A";
    const summaryVal = "#6A6A6A";

    const PW = doc.page.width;   // 595.28
    const L  = 50;               // left margin
    const R  = PW - 50;          // right margin
    const W  = R - L;            // 495 usable width
    let y = 40;

    // ── HEADER ────────────────────────────────────────────────────────────
    doc.fontSize(36).fillColor(greyBg).font("Helvetica-Bold")
       .text("ELEVAY", L, y + 8, { lineBreak: false });
    doc.fontSize(10).fillColor(midGrey).font("Helvetica")
       .text("EXPANDING YOUR FREEDOM", L, y + 52, { lineBreak: false });
    // "Proforma Invoice" title on the right
    doc.fontSize(24).fillColor(lightGrey).font("Helvetica")
       .text("Proforma Invoice", R - 200, y + 20, { width: 200, align: "right", lineBreak: false });
    y += 120;

    // ── CLIENT INFO + DATE / PROFORMA # ──────────────────────────────────
    doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
       .text("To:", L, y, { continued: true })
       .font("Helvetica")
       .text(`  ${data.clientName}`, { lineBreak: false });
    if (data.clientMobile) {
      doc.fontSize(10).fillColor(darkText).font("Helvetica")
         .text(data.clientMobile, L + 22, y + 14, { lineBreak: false });
    }
    const rightColX = PW / 2 + 20;
    const labelW = 80;
    const valX = rightColX + labelW;
    doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
       .text("Date:", rightColX, y, { width: labelW, lineBreak: false });
    doc.fontSize(10).fillColor(darkText).font("Helvetica")
       .text(formatDate(data.createdAt), valX, y, { lineBreak: false });
    doc.fontSize(10).fillColor(darkText).font("Helvetica-Bold")
       .text("Proforma #:", rightColX, y + 14, { width: labelW, lineBreak: false });
    doc.fontSize(10).fillColor(darkText).font("Helvetica")
       .text(data.proformaCode, valX, y + 14, { lineBreak: false });
    y += 50;

    // ── DESCRIPTION TABLE ─────────────────────────────────────────────────
    const col1W = W * 0.55;
    const col2W = W * 0.225;
    const col3W = W * 0.225;
    const col2X = L + col1W;
    const col3X = col2X + col2W;

    const thH = 22;
    doc.rect(L, y, W, thH).fill(tableHdr);
    doc.fontSize(9).fillColor(white).font("Helvetica-Bold");
    doc.text("DESCRIPTION", L + 6, y + 7, { width: col1W - 6, lineBreak: false });
    doc.text("EUROS", col2X, y + 7, { width: col2W, align: "center", lineBreak: false });
    doc.text("EGP", col3X, y + 7, { width: col3W, align: "center", lineBreak: false });
    y += thH;

    const serviceRowH = 20;
    doc.rect(L, y, W, serviceRowH).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    doc.fontSize(9).fillColor(darkText).font("Helvetica")
       .text("Service Payment - Spain Digital Nomad Residency", L + 6, y + 6, { width: col1W - 12, lineBreak: false });
    const eurAmtFormatted = formatCurrency(data.amountEur, "EUR").replace(/^(€|EUR\s*)/, "€ ");
    const egpAmtFormatted = formatCurrency(data.amountEgp, "EGP").replace(/^(EGP\s*)/, "EGP ");
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text(eurAmtFormatted, col2X, y + 6, { width: col2W, align: "center", lineBreak: false });
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text(egpAmtFormatted, col3X, y + 6, { width: col3W, align: "center", lineBreak: false });
    y += serviceRowH;

    const noteText = data.notes || "";
    const noteRowH = 22;
    doc.rect(L, y, W, noteRowH).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    doc.fontSize(9).fillColor(darkText).font("Helvetica")
       .text(noteText, L + 6, y + 7, { width: W - 12, lineBreak: false });
    y += noteRowH + 14;

    // ── EXCHANGE RATE ─────────────────────────────────────────────────────
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    y += 6;
    doc.fontSize(9).fillColor(midGrey).font("Helvetica")
       .text(
         `Exchange Rate: 1 EUR = ${data.exchangeRate.toFixed(4)} EGP (as of ${formatDate(data.createdAt)})`,
         L, y, { lineBreak: false }
       );
    y += 20;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    y += 16;

    // ── AMOUNT TOTAL (no contract value / remaining balance for proforma) ─
    const summaryRows = [
      { label: "AMOUNT DUE (EUR)", value: formatCurrency(data.amountEur, "EUR") },
      { label: "AMOUNT DUE (EGP)", value: formatCurrency(data.amountEgp, "EGP") },
    ];
    const sLabelW = W * 0.55;
    const sValW   = W * 0.45;
    const sValX   = L + sLabelW;
    for (const row of summaryRows) {
      const rH = 24;
      doc.rect(L, y, sLabelW, rH).fill(summaryHdr);
      doc.fontSize(9).fillColor(white).font("Helvetica-Bold")
         .text(row.label, L + 6, y + 8, { width: sLabelW - 12, lineBreak: false });
      doc.rect(sValX, y, sValW, rH).fill(summaryVal);
      const spacedValue = row.value.replace(/^(€|EUR\s*)/, "€ ").replace(/^(EGP\s*)/, "EGP ");
      doc.fontSize(9).fillColor(white).font("Helvetica-Bold")
         .text(spacedValue, sValX, y + 8, { width: sValW - 6, align: "right", lineBreak: false });
      y += rH;
    }
    y += 20;

    // ── AUTHORIZED SIGNATURE ──────────────────────────────────────────────
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
        console.warn("[Proforma] Could not embed signature:", e);
        y += 20;
      }
    }
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor("#CCCCCC").stroke();

    // ── FOOTER ────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.fontSize(9).fillColor(darkText).font("Helvetica-Bold")
       .text("ELEVAY", L, pageH - 72, { width: W, align: "center", lineBreak: false });
    doc.fontSize(8).fillColor(midGrey).font("Helvetica")
       .text("Citizenship & Residency by Investment | Cairo, Egypt & Dubai, UAE", L, pageH - 58, { width: W, align: "center", lineBreak: false });
    doc.fontSize(8).fillColor(midGrey).font("Helvetica")
       .text("Tel: +20 016222280 | Building 3, 2nd Floor, Office 2D2, Beverly Hills, Al Sheikh Zayed, Giza", L, pageH - 46, { width: W, align: "center", lineBreak: false });

    doc.end();
  });
}

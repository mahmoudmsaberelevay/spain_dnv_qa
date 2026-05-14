/**
 * Generates an Arabic Word (.docx) document for the pending document checklist
 * of a client case. Layout fixes:
 *  - Logo: smaller (80×40), left-aligned
 *  - Client name: "اسم العميل :" label on the RIGHT before the actual name (RTL)
 *  - Numbering: number appears on the RIGHT of each document line (RTL)
 *  - All text is Arabic, right-to-left
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import https from "https";
import http from "http";
import { getArabicDocName } from "../shared/clientDocDefs";

const LOGO_CDN_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/bird_logo_trimmed_4fc28cf5.png";

// ── Helpers ───────────────────────────────────────────────────────────────────
function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// Arabic ordinal label for child index (1-based)
function arabicChildLabel(n: number): string {
  const labels = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس",
    "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
  return labels[n - 1] ?? `${n}`;
}

// No-border helper for table cells
const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

// ── Main export ───────────────────────────────────────────────────────────────
export type DocItem = {
  docKey: string;
  docName: string;
  category: "main" | "family";
  received: boolean;
};

export async function generateChecklistDocx(
  clientName: string,
  docs: DocItem[]
): Promise<Buffer> {
  const logoBuffer = await downloadBuffer(LOGO_CDN_URL);

  // Separate pending docs by category
  const pending = docs.filter((d) => !d.received);
  const mainPending = pending.filter((d) => d.category === "main");
  const familyPending = pending.filter((d) => d.category === "family");

  // ── Document builder ───────────────────────────────────────────────────────
  const children: (Paragraph | Table)[] = [];

  // ── Header row: logo LEFT, company name CENTER ─────────────────────────────
  // Use a 3-column table so logo stays left while company name is centered
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            // Left cell: logo (smaller, ~80×40)
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              borders: noBorder,
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 0 },
                  children: [
                    new ImageRun({
                      data: logoBuffer,
                      transformation: { width: 80, height: 40 },
                      type: "png",
                    }),
                  ],
                }),
              ],
            }),
            // Center cell: company name
            new TableCell({
              width: { size: 60, type: WidthType.PERCENTAGE },
              borders: noBorder,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: "إيليفاي للاستشارات",
                      bold: true,
                      size: 28,
                      color: "1e3a5f",
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
            // Right cell: empty spacer
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              borders: noBorder,
              children: [new Paragraph({ children: [] })],
            }),
          ],
        }),
      ],
    })
  );

  // Divider line
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 240 },
      children: [
        new TextRun({
          text: "─────────────────────────────────────",
          color: "1e3a5f",
          size: 20,
        }),
      ],
    })
  );

  // Document title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "قائمة المستندات المطلوبة",
          bold: true,
          size: 32,
          color: "1e3a5f",
          font: "Arial",
        }),
      ],
    })
  );

  // ── Client name: RIGHT-aligned, label "اسم العميل :" first (RTL = appears on right) ──
  // In RTL paragraphs, the first TextRun appears on the RIGHT side of the line.
  // So we put the label first, then the actual name.
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: "اسم العميل : ",
          bold: true,
          size: 24,
          font: "Arial",
          color: "374151",
          rightToLeft: true,
        }),
        new TextRun({
          text: clientName,
          size: 24,
          font: "Arial",
          color: "111827",
          rightToLeft: false,
        }),
      ],
    })
  );

  // Date
  const today = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 400 },
      children: [
        new TextRun({ text: "التاريخ : ", bold: true, size: 22, font: "Arial", color: "374151", rightToLeft: true }),
        new TextRun({ text: today, size: 22, font: "Arial", color: "374151", rightToLeft: true }),
      ],
    })
  );

  // ── Section builder helper ─────────────────────────────────────────────────
  // In RTL: number goes at the END of the text run so it appears on the RIGHT visually.
  // Format: "☐  {arabicName}  .{num}"  — the .num part renders on the far right in RTL.
  function buildSection(title: string, items: DocItem[]) {
    if (items.length === 0) return;

    // Section header
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 300, after: 160 },
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 26,
            color: "1e3a5f",
            font: "Arial",
            rightToLeft: true,
          }),
        ],
      })
    );

    // Each document row
    // RTL layout: [☐]  [document name]  [number.]
    // We put number first (it will appear on the right), then the name, then the checkbox
    items.forEach((doc, idx) => {
      const arabicName = getArabicDocName(doc.docKey, doc.docName);
      const num = `${idx + 1}.`;
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 120 },
          children: [
            // Number — appears on the RIGHT in RTL
            new TextRun({
              text: `${num}  `,
              size: 22,
              font: "Arial",
              color: "111827",
              bold: true,
              rightToLeft: true,
            }),
            // Document name
            new TextRun({
              text: `${arabicName}  `,
              size: 22,
              font: "Arial",
              color: "111827",
              rightToLeft: true,
            }),
            // Checkbox on the LEFT
            new TextRun({
              text: "☐",
              size: 22,
              font: "Arial",
              color: "6b7280",
            }),
          ],
        })
      );
    });
  }

  // ── Main applicant section ─────────────────────────────────────────────────
  buildSection("أولاً : مستندات مقدم الطلب الرئيسي", mainPending);

  // ── Family section ─────────────────────────────────────────────────────────
  const baseFamily = familyPending.filter((d) => !d.docKey.startsWith("child_"));
  const childDocs = familyPending.filter((d) => d.docKey.startsWith("child_"));

  if (baseFamily.length > 0 || childDocs.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 300, after: 160 },
        children: [
          new TextRun({
            text: "ثانياً : مستندات أفراد الأسرة",
            bold: true,
            size: 26,
            color: "1e3a5f",
            font: "Arial",
            rightToLeft: true,
          }),
        ],
      })
    );

    // Base family docs
    baseFamily.forEach((doc, idx) => {
      const arabicName = getArabicDocName(doc.docKey, doc.docName);
      const num = `${idx + 1}.`;
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `${num}  `, size: 22, font: "Arial", color: "111827", bold: true, rightToLeft: true }),
            new TextRun({ text: `${arabicName}  `, size: 22, font: "Arial", color: "111827", rightToLeft: true }),
            new TextRun({ text: "☐", size: 22, font: "Arial", color: "6b7280" }),
          ],
        })
      );
    });

    // Per-child groups
    const childIndices = new Set<number>();
    childDocs.forEach((d) => {
      const m = d.docKey.match(/^child_(\d+)_/);
      if (m) childIndices.add(parseInt(m[1]));
    });

    Array.from(childIndices)
      .sort((a, b) => a - b)
      .forEach((childNum) => {
        const docsForChild = childDocs.filter((d) => d.docKey.startsWith(`child_${childNum}_`));
        if (docsForChild.length === 0) return;

        children.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: `الطفل ${arabicChildLabel(childNum)} :`,
                bold: true,
                size: 23,
                color: "374151",
                font: "Arial",
                rightToLeft: true,
              }),
            ],
          })
        );

        docsForChild.forEach((doc, idx) => {
          const arabicName = getArabicDocName(doc.docKey, doc.docName);
          const num = `${idx + 1}.`;
          children.push(
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              bidirectional: true,
              spacing: { after: 100 },
              children: [
                new TextRun({ text: `${num}  `, size: 22, font: "Arial", color: "111827", bold: true, rightToLeft: true }),
                new TextRun({ text: `${arabicName}  `, size: 22, font: "Arial", color: "111827", rightToLeft: true }),
                new TextRun({ text: "☐", size: 22, font: "Arial", color: "6b7280" }),
              ],
            })
          );
        });
      });
  }

  // Footer note
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [
        new TextRun({
          text: "يُرجى تسليم المستندات المذكورة أعلاه في أقرب وقت ممكن.",
          size: 20,
          italics: true,
          color: "6b7280",
          font: "Arial",
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/**
 * Generates an Arabic Word (.docx) document for the pending document checklist.
 * Layout:
 *  - Header: ELEVAY logo image (letterhead) centered at top
 *  - All body text: fully right-aligned, RTL (Arabic)
 *  - Client name label "اسم العميل :" on the right
 *  - Numbering on the right side of each document line
 */

import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  ImageRun,
  Header,
  Footer,
} from "docx";
import { getArabicDocName } from "../shared/clientDocDefs";

// Arabic ordinal label for child index (1-based)
function arabicChildLabel(n: number): string {
  const labels = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس",
    "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
  return labels[n - 1] ?? `${n}`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export type DocItem = {
  docKey: string;
  docName: string;
  category: "main" | "family";
  received: boolean;
};

// Logo image path — read from local filesystem at generation time
const LOGO_PATH = path.resolve("/home/ubuntu/webdev-static-assets/elevay_letterhead_logo.png");

export async function generateChecklistDocx(
  clientName: string,
  docs: DocItem[]
): Promise<Buffer> {
  // Separate pending docs by category
  const pending = docs.filter((d) => !d.received);
  const mainPending = pending.filter((d) => d.category === "main");
  const familyPending = pending.filter((d) => d.category === "family");

  // Load logo image
  let logoBuffer: Buffer | null = null;
  try {
    logoBuffer = fs.readFileSync(LOGO_PATH);
  } catch {
    logoBuffer = null;
  }

  // ── Document body ──────────────────────────────────────────────────────────
  const children: Paragraph[] = [];

  // Document title — centered, bold
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
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

  // Divider
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "─────────────────────────────────────",
          color: "1e3a5f",
          size: 20,
        }),
      ],
    })
  );

  // Client name — RIGHT-aligned RTL: "اسم العميل :" then client name
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
        }),
      ],
    })
  );

  // Date — RIGHT-aligned
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
  // RTL layout per row: number on the RIGHT, document name in the middle, checkbox on LEFT
  function buildSection(title: string, items: DocItem[]) {
    if (items.length === 0) return;

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

    items.forEach((doc, idx) => {
      const arabicName = getArabicDocName(doc.docKey, doc.docName);
      const num = `${idx + 1}.`;
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 120 },
          children: [
            // Number on the RIGHT (first in RTL)
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
            // Checkbox on the LEFT (last in RTL)
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

  // ── Build header with ELEVAY logo ──────────────────────────────────────────
  // Logo dimensions from letterhead: cx=2066290, cy=737870 EMU
  // 1 EMU = 1/914400 inch; at 96dpi: 1 inch = 96px
  // cx EMU → inches: 2066290/914400 ≈ 2.26 in → ~217px wide
  // cy EMU → inches: 737870/914400 ≈ 0.81 in → ~77px tall
  // We'll use a slightly smaller size for the header: 180×64px equivalent in EMU
  const logoWidthEmu = 1800000;  // ~1.97 inches
  const logoHeightEmu = 640000;  // ~0.70 inches

  const headerChildren: Paragraph[] = [];

  if (logoBuffer) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: {
              width: Math.round(logoWidthEmu / 9144),   // convert EMU to points (1pt = 12700 EMU)
              height: Math.round(logoHeightEmu / 9144),
            },
            type: "png",
          }),
        ],
      })
    );
  } else {
    // Fallback: text-only header if logo file not found
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "ELEVAY",
            bold: true,
            size: 32,
            color: "1e3a5f",
            font: "Arial",
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "إيليفاي للاستشارات",
                    size: 18,
                    color: "9ca3af",
                    font: "Arial",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

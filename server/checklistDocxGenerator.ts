/**
 * Generates an Arabic Word (.docx) document for the pending document checklist
 * of a client case. The document includes:
 *  - Elevay logo at the top
 *  - Client name (right-aligned, Arabic)
 *  - Two sections: Main Applicant documents + Family Member documents
 *  - Only documents that have NOT yet been received are listed
 *  - All text is in Arabic, right-to-left
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
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
  const children: Paragraph[] = [];

  // Logo (centered)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new ImageRun({
          data: logoBuffer,
          transformation: { width: 120, height: 60 },
          type: "png",
        }),
      ],
    })
  );

  // Company name in Arabic
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: "إيليفاي للاستشارات",
          bold: true,
          size: 28,
          color: "1e3a5f",
          font: "Arial",
        }),
      ],
    })
  );

  // Divider line
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
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
      spacing: { after: 160 },
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

  // Client name
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "اسم العميل: ", bold: true, size: 24, font: "Arial", color: "374151" }),
        new TextRun({ text: clientName, size: 24, font: "Arial", color: "111827" }),
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
      spacing: { after: 400 },
      children: [
        new TextRun({ text: "التاريخ: ", bold: true, size: 22, font: "Arial", color: "374151" }),
        new TextRun({ text: today, size: 22, font: "Arial", color: "374151" }),
      ],
    })
  );

  // ── Section builder helper ─────────────────────────────────────────────────
  function buildSection(title: string, items: DocItem[]) {
    if (items.length === 0) return;

    // Section header
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 300, after: 160 },
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 26,
            color: "1e3a5f",
            font: "Arial",
          }),
        ],
      })
    );

    // Each document as a row with checkbox placeholder
    items.forEach((doc, idx) => {
      const arabicName = getArabicDocName(doc.docKey, doc.docName);
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: `${idx + 1}. ${arabicName}`,
              size: 22,
              font: "Arial",
              color: "111827",
            }),
            new TextRun({
              text: "   ☐",
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
  buildSection("أولاً: مستندات مقدم الطلب الرئيسي", mainPending);

  // ── Family section ─────────────────────────────────────────────────────────
  // Group family docs: base family docs first, then per-child groups
  const baseFamily = familyPending.filter((d) => !d.docKey.startsWith("child_"));
  const childDocs = familyPending.filter((d) => d.docKey.startsWith("child_"));

  if (baseFamily.length > 0 || childDocs.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 300, after: 160 },
        children: [
          new TextRun({
            text: "ثانياً: مستندات أفراد الأسرة",
            bold: true,
            size: 26,
            color: "1e3a5f",
            font: "Arial",
          }),
        ],
      })
    );

    // Base family docs
    baseFamily.forEach((doc, idx) => {
      const arabicName = getArabicDocName(doc.docKey, doc.docName);
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `${idx + 1}. ${arabicName}`, size: 22, font: "Arial", color: "111827" }),
            new TextRun({ text: "   ☐", size: 22, font: "Arial", color: "6b7280" }),
          ],
        })
      );
    });

    // Per-child groups
    // Detect how many children by extracting max child index from docKeys
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
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: `الطفل ${arabicChildLabel(childNum)}:`,
                bold: true,
                size: 23,
                color: "374151",
                font: "Arial",
              }),
            ],
          })
        );

        docsForChild.forEach((doc, idx) => {
          const arabicName = getArabicDocName(doc.docKey, doc.docName);
          children.push(
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 100 },
              children: [
                new TextRun({ text: `   ${idx + 1}. ${arabicName}`, size: 22, font: "Arial", color: "111827" }),
                new TextRun({ text: "   ☐", size: 22, font: "Arial", color: "6b7280" }),
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

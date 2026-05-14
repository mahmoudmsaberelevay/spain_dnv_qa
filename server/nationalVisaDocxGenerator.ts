/**
 * nationalVisaDocxGenerator.ts
 * Generates an Arabic Word document (التأشيرة الوطنية) for a client's family reunion national visa.
 * All content is RTL right-aligned. Uses the Elevay letterhead logo.
 */
import fs from "fs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  ImageRun,
  BorderStyle,
  convertInchesToTwip,
} from "docx";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toArabicDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = [
    "يناير","فبراير","مارس","أبريل","مايو","يونيو",
    "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function toArabicNumber(n: number): string {
  const arabic = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
  return String(n).replace(/\d/g, (d) => arabic[parseInt(d)]);
}

// ── Paragraph builders ─────────────────────────────────────────────────────────

function rtlPara(text: string, opts?: {
  bold?: boolean;
  size?: number;
  color?: string;
  underline?: boolean;
  spacing?: number;
  italics?: boolean;
}): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: opts?.spacing ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold ?? false,
        size: opts?.size ?? 24,
        color: opts?.color ?? "000000",
        underline: opts?.underline ? {} : undefined,
        italics: opts?.italics ?? false,
        rightToLeft: true,
      }),
    ],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 240, after: 160 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        color: "1e3a5f",
        rightToLeft: true,
      }),
    ],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 160, after: 100 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        color: "1e3a5f",
        rightToLeft: true,
      }),
    ],
  });
}

function dividerPara(): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1e3a5f" } },
    children: [],
  });
}

/** Bullet item with checkbox */
function bulletItem(text: string, note?: string, noteColor?: string): Paragraph {
  const runs: TextRun[] = [
    new TextRun({ text: `☐  ${text}`, size: 22, rightToLeft: true }),
  ];
  if (note) {
    runs.push(new TextRun({
      text: `  ${note}`,
      size: 20,
      color: noteColor ?? "7f1d1d",
      bold: true,
      rightToLeft: true,
    }));
  }
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 80 },
    children: runs,
  });
}

/** Sub-bullet item (indented) */
function subBulletItem(text: string): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 60 },
    indent: { right: 360 },
    children: [
      new TextRun({ text: `◦  ${text}`, size: 20, color: "374151", rightToLeft: true }),
    ],
  });
}

/** Note paragraph (colored, italic) */
function notePara(text: string, color = "7c3aed"): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 80, after: 100 },
    children: [
      new TextRun({ text, size: 20, color, bold: true, italics: true, rightToLeft: true }),
    ],
  });
}

// ── Ordinals ──────────────────────────────────────────────────────────────────
const CHILD_ORDINALS = ["الأول","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن","التاسع","العاشر"];

// ── Input interface ────────────────────────────────────────────────────────────
export interface NationalVisaDocInput {
  clientName: string;
  wifeName?: string;
  children: Array<{ name: string; age: number }>;
  followUpEmail?: string;
  notes?: string;
}

// ── Main generator ─────────────────────────────────────────────────────────────
export async function generateNationalVisaDocx(input: NationalVisaDocInput): Promise<Buffer> {
  const today = new Date().toISOString().split("T")[0];

  // ── Logo ──────────────────────────────────────────────────────────────────────
  const logoPath = "/home/ubuntu/webdev-static-assets/elevay_letterhead_logo.png";
  let logoRun: ImageRun | null = null;
  if (fs.existsSync(logoPath)) {
    const logoData = fs.readFileSync(logoPath);
    logoRun = new ImageRun({
      data: logoData,
      transformation: { width: 120, height: 50 },
      type: "png",
    });
  }

  const docChildren: Paragraph[] = [];

  // ── Header ────────────────────────────────────────────────────────────────────
  if (logoRun) {
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 80 },
        children: [logoRun],
      })
    );
  }
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "إيليفاي للاستشارات", bold: true, size: 32, color: "1e3a5f", rightToLeft: true })],
    })
  );
  docChildren.push(dividerPara());

  // Document title
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "قائمة المستندات المطلوبة — التأشيرة الوطنية", bold: true, size: 32, color: "1e3a5f", rightToLeft: true })],
    })
  );
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "شركة إيليفاي", bold: true, size: 26, color: "1e3a5f", rightToLeft: true })],
    })
  );

  // Client info
  docChildren.push(rtlPara(`اسم العميل : ${input.clientName}`, { bold: true, size: 24 }));
  docChildren.push(rtlPara(`التاريخ : ${toArabicDate(today)}`, { size: 22 }));
  if (input.wifeName) {
    docChildren.push(rtlPara(`اسم الزوجة : ${input.wifeName}`, { size: 22 }));
  }
  if (input.followUpEmail) {
    docChildren.push(rtlPara(`البريد الإلكتروني للمتابعة : ${input.followUpEmail}`, { size: 22 }));
  }
  docChildren.push(dividerPara());

  // Intro
  docChildren.push(rtlPara(
    "يرجى تجهيز المستندات التالية واستيفاؤها بالكامل لكل فرد ضمن الطلب",
    { bold: true, size: 24, color: "1e3a5f" }
  ));
  docChildren.push(dividerPara());

  // ── Section A: Wife Documents ─────────────────────────────────────────────────
  docChildren.push(sectionHeading("أولاً : المستندات الأساسية للزوجة"));
  if (input.wifeName) {
    docChildren.push(subHeading(`الزوجة : ${input.wifeName}`));
  }

  docChildren.push(bulletItem("عدد (٢) صورة شخصية حديثة"));
  docChildren.push(bulletItem("جميع الموافقات المطلوبة وفقاً لنوع الطلب"));
  docChildren.push(bulletItem(
    "شهادة زواج مترجمة إلى اللغة الإسبانية",
    "(مصدقة من وزارة الخارجية)"
  ));
  docChildren.push(bulletItem(
    "شهادة ميلاد مترجمة إلى اللغة الإسبانية",
    "(مصدقة من وزارة الخارجية)"
  ));
  docChildren.push(bulletItem(
    "صحيفة حالة جنائية (فيش وتشبيه) للأم",
    "(مصدقة من وزارة الخارجية ومختومة من السفارة)"
  ));
  docChildren.push(bulletItem("صورة من بطاقة كارت الإقامة الخاصة بالزوج"));
  docChildren.push(dividerPara());

  // ── Section B: Children Documents ────────────────────────────────────────────
  if (input.children.length > 0) {
    docChildren.push(sectionHeading("ثانياً : مستندات الأبناء"));

    input.children.forEach((child, idx) => {
      const ordinal = CHILD_ORDINALS[idx] ?? `${toArabicNumber(idx + 1)}`;
      const childLabel = child.name ? `الطفل ${ordinal} (${child.name})` : `الطفل ${ordinal}`;
      const age = child.age;

      docChildren.push(subHeading(`${childLabel} — العمر : ${toArabicNumber(age)} سنة`));

      // Universal docs for ALL children regardless of age
      docChildren.push(bulletItem("عدد (٢) صورة شخصية حديثة"));
      docChildren.push(bulletItem("جميع الموافقات المطلوبة وفقاً لنوع الطلب"));

      if (age < 16) {
        // Under 16
        docChildren.push(rtlPara("المستندات المطلوبة (أقل من ١٦ عاماً) :", { bold: true, size: 22, color: "374151", spacing: 60 }));
        docChildren.push(bulletItem("صورة من جواز السفر"));
        docChildren.push(bulletItem(
          "شهادة ميلاد مترجمة إلى اللغة الإسبانية",
          "(مصدقة من وزارة الخارجية)"
        ));
      } else if (age >= 16 && age < 21) {
        // 16 to 20
        docChildren.push(rtlPara("المستندات المطلوبة (من ١٦ إلى ٢٠ عاماً) :", { bold: true, size: 22, color: "374151", spacing: 60 }));
        docChildren.push(bulletItem("صورة من جواز السفر"));
        docChildren.push(bulletItem(
          "شهادة ميلاد مترجمة إلى اللغة الإسبانية",
          "(مصدقة من وزارة الخارجية)"
        ));
        docChildren.push(bulletItem(
          "صحيفة حالة جنائية (فيش وتشبيه)",
          "(مصدقة من وزارة الخارجية ومختومة من السفارة)"
        ));
        if (age >= 18) {
          docChildren.push(bulletItem("قيد فردي"));
        }
        docChildren.push(bulletItem("قيد دراسي حديث من المدرسة أو الجامعة"));
      } else {
        // 21 and above
        docChildren.push(rtlPara("المستندات المطلوبة (٢١ عاماً فأكثر) :", { bold: true, size: 22, color: "374151", spacing: 60 }));
        docChildren.push(bulletItem("صورة من جواز السفر"));
        docChildren.push(bulletItem(
          "شهادة ميلاد مترجمة إلى اللغة الإسبانية",
          "(مصدقة من وزارة الخارجية)"
        ));
        docChildren.push(bulletItem(
          "صحيفة حالة جنائية (فيش وتشبيه)",
          "(مصدقة من وزارة الخارجية ومختومة من السفارة)"
        ));
        docChildren.push(bulletItem("قيد فردي"));
        docChildren.push(bulletItem("قيد دراسي حديث من المدرسة أو الجامعة"));
        // Financial dependency proof
        docChildren.push(rtlPara(
          "إثبات أن الأب ما زال متكفلاً بالابن مادياً — يشمل أي مما يلي :",
          { bold: true, size: 22, color: "1e3a5f", spacing: 60 }
        ));
        docChildren.push(subBulletItem("إثبات سداد مصروفات الجامعة (إيصالات مصاريف الجامعة مدفوعة بفيزا الأب)"));
        docChildren.push(subBulletItem("إثبات سداد اشتراكات أو مصروفات الأنشطة (مثل النادي)"));
        docChildren.push(subBulletItem("في حالة وجود حساب للأبناء — يجب أن تكون التحويلات من حساب الأب"));
        docChildren.push(subBulletItem("أي مستندات رسمية أخرى تثبت تحمل الأب للنفقات المالية الخاصة بالابن"));
      }
    });

    docChildren.push(dividerPara());
  }

  // ── Section C: General Documents ─────────────────────────────────────────────
  docChildren.push(sectionHeading("ثالثاً : الأوراق العامة (مطلوبة في جميع الحالات)"));

  docChildren.push(bulletItem(
    "إثبات سكن ودخل الزوج في إسبانيا",
    "(العنوان موضح في كارت الإقامة)"
  ));
  docChildren.push(bulletItem(
    "خطاب HR حديث للزوج، أو سجل تجاري وبطاقة ضريبية",
    "(حسب طبيعة العمل)"
  ));
  docChildren.push(bulletItem("كشف حساب بنكي للأب عن آخر ٦ أشهر"));
  docChildren.push(dividerPara());

  // ── Section D: Final Notes ────────────────────────────────────────────────────
  docChildren.push(sectionHeading("ملحوظات هامة"));

  const finalNotes = [
    "إذا لم يسافر أحد الوالدين — نحتاج إلى موافقة الطرف الآخر.",
    "في حالة وجود طلاق — نحتاج إلى لا مانع سفر من الشهر العقاري.",
    "لمّ الشمل بواسطة إيليفاي — Cover Letter.",
    "حجز طيران (Hold).",
    "إضافة بريد إلكتروني عليه متابعة.",
    "صورة من بطاقة كارت الإقامة الخاصة بالزوج.",
    "إثبات الإقامة والعمل والدخل.",
  ];

  finalNotes.forEach((note, i) => {
    docChildren.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: `${toArabicNumber(i + 1)}.  ${note}`,
            size: 22,
            rightToLeft: true,
          }),
        ],
      })
    );
  });

  docChildren.push(dividerPara());

  // Footer disclaimer
  docChildren.push(notePara(
    "جميع المستندات المذكورة أعلاه مطلوبة لإتمام إجراءات التأشيرة الوطنية — يرجى التواصل مع فريق إيليفاي لأي استفسار.",
    "6b7280"
  ));

  // ── Build document ────────────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { rightToLeft: true },
          paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

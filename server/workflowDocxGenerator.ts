/**
 * workflowDocxGenerator.ts
 * Generates an Arabic Word document (خطة العمل) for a client workflow.
 * All content is RTL right-aligned. Uses the Elevay letterhead logo.
 */
import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  ImageRun,
  BorderStyle,
  PageOrientation,
  SectionType,
  convertInchesToTwip,
} from "docx";

// ── Helpers ────────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

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

function formatEGP(amount: number): string {
  return amount.toLocaleString("ar-EG") + " جنيه مصري";
}

// ── Paragraph builders ─────────────────────────────────────────────────────────

function rtlPara(text: string, opts?: {
  bold?: boolean;
  size?: number;
  color?: string;
  underline?: boolean;
  spacing?: number;
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

function dividerPara(): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1e3a5f" } },
    children: [],
  });
}

function numberedDocItem(index: number, text: string): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `☐  ${text}  .${index}`, size: 22, rightToLeft: true }),
    ],
  });
}

function stageItem(label: string, dateStr: string, note?: string): Paragraph {
  const dateLabel = toArabicDate(dateStr);
  const noteText = note ? `  (${note})` : "";
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 100 },
    children: [
      new TextRun({
        text: `${label} : ${dateLabel}${noteText}`,
        size: 22,
        rightToLeft: true,
      }),
    ],
  });
}

// ── Main generator ─────────────────────────────────────────────────────────────

export interface WorkflowDocInput {
  clientName: string;
  applicationType: "freelancer" | "business_owner";
  familyMembersCount: number;
  childrenData: Array<{ ageRange: "0-17" | "18-26" }>;
  schengenStatus?: string;
  submissionStage: "one" | "two";
  submissionDate: string; // YYYY-MM-DD
  yearlyIncome: number;
  incomeFrequency: "monthly" | "quarterly" | "biannual" | "yearly" | "task";
  incomePayments: Array<{ date: string; amount: number }>;
  // Remaining documents pulled from clientDocuments
  mainApplicantDocs: string[];
  familyDocs: string[];
}

export async function generateWorkflowDocx(input: WorkflowDocInput): Promise<Buffer> {
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

  // ── Application type label ────────────────────────────────────────────────────
  const appTypeLabel = input.applicationType === "freelancer" ? "فريلانسر (مستقل)" : "صاحب عمل";

  // ── Income frequency label ────────────────────────────────────────────────────
  const freqLabels: Record<string, string> = {
    monthly: "شهري",
    quarterly: "ربع سنوي",
    biannual: "نصف سنوي",
    yearly: "سنوي",
    task: "بالمهمة",
  };
  const freqLabel = freqLabels[input.incomeFrequency] || input.incomeFrequency;

  // ── Timeline dates ────────────────────────────────────────────────────────────
  const approvalDate = addDays(input.submissionDate, 45);
  const cardCollectionDate = addDays(approvalDate, 20);
  const familySubmissionDate = input.submissionStage === "two" ? addDays(cardCollectionDate, 10) : null;
  const familyApprovalDate = familySubmissionDate ? addDays(familySubmissionDate, 45) : null;
  const familyNationalVisaDate = familyApprovalDate ? addDays(familyApprovalDate, 15) : null;

  // ── Build paragraphs ──────────────────────────────────────────────────────────
  const children: Paragraph[] = [];

  // Header: logo + company name
  if (logoRun) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 80 },
        children: [logoRun],
      })
    );
  }
  children.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "إيليفاي للاستشارات", bold: true, size: 32, color: "1e3a5f", rightToLeft: true })],
    })
  );
  children.push(dividerPara());

  // Document title
  children.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "خطة العمل للمشروع الخاص بالاقامة الاسبانية", bold: true, size: 32, color: "1e3a5f", rightToLeft: true })],
    })
  );
  children.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "شركة ايليفاي", bold: true, size: 26, color: "1e3a5f", rightToLeft: true })],
    })
  );

  // Client info
  children.push(rtlPara(`اسم العميل : ${input.clientName}`, { bold: true, size: 24 }));
  children.push(rtlPara(`التاريخ : ${toArabicDate(today)}`, { size: 22 }));
  children.push(rtlPara(`نوع الطلب : ${appTypeLabel}`, { size: 22 }));
  children.push(rtlPara(`عدد أفراد الأسرة : ${toArabicNumber(input.familyMembersCount)} فرد`, { size: 22 }));
  if (input.schengenStatus) {
    children.push(rtlPara(`حالة تأشيرة شنغن : ${input.schengenStatus}`, { size: 22 }));
  }
  children.push(dividerPara());

  // ── Section 1: Income proof schedule ─────────────────────────────────────────
  children.push(sectionHeading("أولاً : الدخل السنوي المطلوب وجدول الإثبات"));
  children.push(rtlPara(`الدخل السنوي المطلوب : ${formatEGP(input.yearlyIncome)}`, { bold: true, size: 24 }));
  children.push(rtlPara(`طريقة الإثبات : ${freqLabel}`, { size: 22 }));

  if (input.incomePayments.length > 0) {
    children.push(rtlPara("جدول المدفوعات :", { bold: true, size: 22, spacing: 80 }));
    input.incomePayments.forEach((p, i) => {
      children.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: `${toArabicNumber(i + 1)}.  ${toArabicDate(p.date)}  —  ${formatEGP(p.amount)}`,
              size: 22,
              rightToLeft: true,
            }),
          ],
        })
      );
    });
  }
  children.push(dividerPara());

  // ── Section 2: Processing timeline ───────────────────────────────────────────
  children.push(sectionHeading("ثانياً : مراحل معالجة الطلب والجدول الزمني المتوقع"));

  if (input.submissionStage === "two") {
    // Two-stage
    children.push(stageItem("تاريخ تقديم الطلب الرئيسي (تقريبي)", input.submissionDate, "قد يتغير وفقاً للظروف"));
    children.push(stageItem("تاريخ الحصول على الموافقة المتوقع", approvalDate));
    children.push(stageItem("تاريخ استلام البطاقات المتوقع", cardCollectionDate));
    children.push(stageItem("تاريخ تقديم طلب الأسرة المتوقع", familySubmissionDate!));
    children.push(stageItem("تاريخ الحصول على موافقة الأسرة المتوقع", familyApprovalDate!));
    children.push(stageItem("تاريخ التأشيرة الوطنية للأسرة المتوقع", familyNationalVisaDate!));
  } else {
    // One-stage
    children.push(stageItem("تاريخ تقديم الطلب (كامل الأسرة) (تقريبي)", input.submissionDate, "قد يتغير وفقاً للظروف"));
    children.push(stageItem("تاريخ الحصول على الموافقة المتوقع", approvalDate));
    children.push(stageItem("تاريخ استلام البطاقات المتوقع", cardCollectionDate));
  }
  children.push(dividerPara());

  // ── Section 3: Process steps ──────────────────────────────────────────────────
  children.push(sectionHeading("ثالثاً : خطوات سير العملية بالتفصيل"));

  const processSteps = [
    "بعد توقيع العقد، سنحتاج إلى شهرين لإعداد كامل ملف الطلب وإتمام التصديق من وزارة الخارجية والسفارة.",
    "بعد ذلك، ستحتاج إلى السفر إلى إسبانيا لمدة ٣ أيام (لا تُحتسب السبت والأحد) لتقديم الطلب.",
    "عند تقديم الطلب، يجب أن تكون إسبانيا هي وجهتك المباشرة أو نقطة العبور لوجهتك النهائية.",
    "فور وصولك إلى إسبانيا، ستُقدّم إقرار الدخول وتُرسله إلينا.",
    "بعد ٤٨ ساعة من التقديم، سنُرسل إليك إيصال التقديم الرسمي من الجهة الحكومية.",
    "بعد ٤٥ يوماً من تاريخ التقديم، سنحصل على الموافقة ونُرسلها إليك.",
    "بعد ذلك، سنحجز لك موعد البيومترية خلال ١٥ يوماً (هذا الموعد غير قابل للتخصيص).",
    "ستسافر إلى إسبانيا للمرة الثانية للحصول على بيانات البيومترية.",
    "بعد ٢٠ يوماً من البيومترية، ستحتاج إلى السفر مجدداً لاستلام بطاقات الإقامة وفتح الحساب البنكي.",
  ];

  if (input.submissionStage === "two" && input.familyMembersCount > 0) {
    processSteps.push(
      "بعد ١٠ أيام من استلام بطاقاتك، سنُقدّم طلب الأسرة دون الحاجة إلى زيارة إسبانيا.",
      "بعد ٤٥ يوماً من تقديم طلب الأسرة، سنحصل على موافقتهم.",
      "بعد ١٠ أيام من الموافقة، سنحجز لهم موعداً في السفارة لتقديم طلب التأشيرة الوطنية.",
      "بعد ١٥ يوماً، سيحصلون على التأشيرة مع موعد البيومترية."
    );
  }

  processSteps.forEach((step, i) => {
    children.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: `${toArabicNumber(i + 1)}.  ${step}`,
            size: 22,
            rightToLeft: true,
          }),
        ],
      })
    );
  });
  children.push(dividerPara());

  // ── Section 4: Remaining documents ───────────────────────────────────────────
  children.push(sectionHeading("رابعاً : المستندات المتبقية المطلوبة"));

  if (input.mainApplicantDocs.length > 0) {
    children.push(rtlPara("أ- مستندات مقدم الطلب الرئيسي :", { bold: true, size: 24, spacing: 80 }));
    input.mainApplicantDocs.forEach((doc, i) => children.push(numberedDocItem(i + 1, doc)));
  }

  if (input.familyDocs.length > 0) {
    children.push(rtlPara("ب- مستندات أفراد الأسرة :", { bold: true, size: 24, spacing: 80 }));
    input.familyDocs.forEach((doc, i) => children.push(numberedDocItem(i + 1, doc)));
  }

  if (input.mainApplicantDocs.length === 0 && input.familyDocs.length === 0) {
    children.push(rtlPara("✓ جميع المستندات مكتملة", { size: 22, color: "16a34a" }));
  }
  children.push(dividerPara());

  // ── Section 5: Important notes ────────────────────────────────────────────────
  children.push(sectionHeading("ملاحظات هامة"));
  const notes = [
    "يجب استخراج كل الأوراق والمستندات المطلوبة حين طلبها من حضرتكم فقط وليس قبل ذلك، حيث إن كل مستند له تاريخ صلاحية وتوقيت محدد. بالإضافة إلى أن بعض الأوراق من الممكن استخراجها أكثر من مرة وذلك باختلاف المرحلة الخاصة بالملف ولنفس السبب السالف ذكره.",
    "كل المحادثات والمراسلات يجب أن تكون فقط على هذا الجروب حتى نتمكن من خدمتكم بالشكل والطريقة المثلى.",
    "يجب إرسال صورة ممسوحة ضوئياً لكل المستندات قبل إرسال الأصول إلينا حتى نتمكن من مراجعتها ومعالجة أي خلل أو خطأ فيها.",
  ];
  notes.forEach((note, i) => {
    children.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: `${toArabicNumber(i + 1)}- ${note}`,
            size: 22,
            rightToLeft: true,
          }),
        ],
      })
    );
  });

  // ── Build document ────────────────────────────────────────────────────────────
  const doc = new Document({
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
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

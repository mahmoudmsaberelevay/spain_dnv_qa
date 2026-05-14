/**
 * workflowDocxGenerator.ts
 * Generates an Arabic Word document (خطة العمل) for a client workflow.
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

// ── Template notes for specific documents ────────────────────────────────────────
// These documents have a note that Elevay will provide the template.
const TEMPLATE_NOTE_DOCS = new Set([
  "عقد عمل الاستشارات",
  "فواتير الدفعات المستقبلة",
  "خطاب التوصية",
]);

// ── Stamp notes for specific document keys ─────────────────────────────────────
// These notes are appended beside the document name in the remaining docs section.
const STAMP_NOTES: Record<string, string> = {
  // Passport — main applicant: all pages including blank
  "passport": "(صورة جميع صفحات الجواز بما فيها الصفحات الفارغة)",
  // Family member passports — scan all pages including blank
  "family_passport": "(سكان حتى للصفحات الفارغة)",
  // Education enrollment certificate — Ministry of Higher Education stamp only
  "enrollment_cert": "(ختم وزارة التعليم العالي)",
  // Police clearance
  "police_clearance": "(عليه طابع شهيد)",
  // Birth certificates
  "birth_cert": "(مختومة من الأحوال المدنية على خلف الشهادة)",
  // Marriage certificates
  "marriage_cert": "(مختومة من الأحوال المدنية على خلف الشهادة)",
  // Single record / عزوبية
  "single_record": "(مختومة من الأحوال المدنية على خلف الشهادة)",
  // Company document — must be at least 3 years old
  "company_doc": "(قد مر ٣ سنوات على إنشائها)",
  // Annual tax report — tax authority + foreign affairs stamps
  "annual_tax_report": "(ختم مصلحة الضرائب وختم خارجية)",
  // Tax data certificate — tax authority + foreign affairs stamps
  "tax_details": "(ختم مصلحة الضرائب وختم خارجية)",
  // Social insurance — NO note (intentionally blank)
  "social_insurance": "",
};

// Map Arabic document names to their stamp notes (for dynamic per-child docs)
function getStampNote(arabicName: string): string | null {
  // Passports: family member passports get the scan-all-pages note; main applicant passport gets the full-pages note
  if (arabicName.includes("جواز سفر أفراد الأسرة") || arabicName.includes("جوازات سفر أفراد الأسرة")) return STAMP_NOTES["family_passport"] || null;
  if (arabicName.includes("جواز سفر")) return STAMP_NOTES["passport"];
  // Education enrollment certificate — Ministry of Higher Education stamp
  // NOTE: must NOT match "شهادة التسجيل بالتأمين الاجتماعي" — check for التأمين first
  if (arabicName.includes("التأمين الاجتماعي")) return null;
  if (arabicName.includes("قيد التعليم") || arabicName.includes("شهادة التسجيل")) return STAMP_NOTES["enrollment_cert"];
  // Police clearance
  if (arabicName.includes("شهادة حسن السيرة") || arabicName.includes("الفيش")) return STAMP_NOTES["police_clearance"];
  // Birth certificates
  if (arabicName.includes("شهادة الميلاد")) return STAMP_NOTES["birth_cert"];
  // Marriage certificates
  if (arabicName.includes("شهادات الزواج") || arabicName.includes("شهادة الزواج")) return STAMP_NOTES["marriage_cert"];
  // Single record / عزوبية
  if (arabicName.includes("وثيقة العزوبية") || arabicName.includes("قيد العزوبية")) return STAMP_NOTES["single_record"];
  // Company document — 3 years note
  if (arabicName.includes("صورة سجل وثيقة شركة العميل") || arabicName.includes("صورة سجل الشركة المملوكة")) return STAMP_NOTES["company_doc"];
  // Annual tax report
  if (arabicName.includes("التقرير الضريبي السنوي")) return STAMP_NOTES["annual_tax_report"];
  // Tax data certificate
  if (arabicName.includes("شهادة البيانات الضريبة") || arabicName.includes("شهادة البيانات الضريبية")) return STAMP_NOTES["tax_details"];
  // Social insurance — explicitly no note
  if (arabicName.includes("شهادة التسجيل بالتأمين الاجتماعي") || arabicName.includes("التأمين الاجتماعي")) return null;
  return null;
}

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

/** Document item — checkbox + name + optional stamp note + optional template note */
function docItem(arabicName: string): Paragraph {
  const stampNote = getStampNote(arabicName);
  // Check if any of the template-note doc names is contained in the arabic name
  const needsTemplateNote = Array.from(TEMPLATE_NOTE_DOCS).some(n => arabicName.includes(n));
  const runs: TextRun[] = [
    new TextRun({ text: `☐  ${arabicName}`, size: 22, rightToLeft: true }),
  ];
  if (stampNote) {
    runs.push(new TextRun({ text: `  ${stampNote}`, size: 20, color: "7f1d1d", rightToLeft: true }));
  }
  if (needsTemplateNote) {
    runs.push(new TextRun({ text: "  (إيليفاي ستقوم بتزويدك بنموذج)", size: 20, color: "1e3a5f", bold: true, rightToLeft: true }));
  }
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 80 },
    children: runs,
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

// Ordinal labels for children in Arabic
const CHILD_ORDINALS = ["الأول","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن","التاسع","العاشر"];

// ── Main generator ─────────────────────────────────────────────────────────────

export interface WorkflowDocInput {
  clientName: string;
  applicationType: "freelancer" | "business_owner";
  familyMembersCount: number;
  childrenData: Array<{ ageRange: "0-17" | "18-26" }>;
  childrenNamesData?: Array<{ name: string; ageRange: string }>;
  schengenStatus?: string;
  schengenExpiry?: string;
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
  const docChildren: Paragraph[] = [];

  // Header: logo + company name
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
      children: [new TextRun({ text: "خطة العمل للمشروع الخاص بالاقامة الاسبانية", bold: true, size: 32, color: "1e3a5f", rightToLeft: true })],
    })
  );
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "شركة ايليفاي", bold: true, size: 26, color: "1e3a5f", rightToLeft: true })],
    })
  );

  // Client info
  docChildren.push(rtlPara(`اسم العميل : ${input.clientName}`, { bold: true, size: 24 }));
  docChildren.push(rtlPara(`التاريخ : ${toArabicDate(today)}`, { size: 22 }));
  docChildren.push(rtlPara(`نوع الطلب : ${appTypeLabel}`, { size: 22 }));
  docChildren.push(rtlPara(`عدد أفراد الأسرة : ${toArabicNumber(input.familyMembersCount)} فرد`, { size: 22 }));
  if (input.schengenStatus) {
    docChildren.push(rtlPara(`حالة تأشيرة شنغن : ${input.schengenStatus}`, { size: 22 }));
  }
  if (input.schengenExpiry) {
    docChildren.push(rtlPara(`تاريخ انتهاء تأشيرة شنغن : ${toArabicDate(input.schengenExpiry)}`, { size: 22 }));
  }
  docChildren.push(dividerPara());

  // ── Section 1: Income proof schedule ─────────────────────────────────────────
  docChildren.push(sectionHeading("أولاً : الدخل السنوي المطلوب وجدول الإثبات"));
  docChildren.push(rtlPara(`الدخل السنوي المطلوب : ${formatEGP(input.yearlyIncome)}`, { bold: true, size: 24 }));
  docChildren.push(rtlPara(`طريقة الإثبات : ${freqLabel}`, { size: 22 }));

  if (input.incomePayments.length > 0) {
    docChildren.push(rtlPara("جدول المدفوعات :", { bold: true, size: 22, spacing: 80 }));
    input.incomePayments.forEach((p, i) => {
      docChildren.push(
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
  docChildren.push(dividerPara());

  // ── Section 2: Processing timeline ───────────────────────────────────────────
  docChildren.push(sectionHeading("ثانياً : مراحل معالجة الطلب والجدول الزمني المتوقع"));

  if (input.submissionStage === "two") {
    docChildren.push(stageItem("تاريخ تقديم الطلب الرئيسي (تقريبي)", input.submissionDate, "قد يتغير وفقاً للظروف"));
    docChildren.push(stageItem("تاريخ الحصول على الموافقة المتوقع", approvalDate));
    docChildren.push(stageItem("تاريخ استلام البطاقات المتوقع", cardCollectionDate));
    docChildren.push(stageItem("تاريخ تقديم طلب الأسرة المتوقع", familySubmissionDate!));
    docChildren.push(stageItem("تاريخ الحصول على موافقة الأسرة المتوقع", familyApprovalDate!));
    docChildren.push(stageItem("تاريخ التأشيرة الوطنية للأسرة المتوقع", familyNationalVisaDate!));
  } else {
    docChildren.push(stageItem("تاريخ تقديم الطلب (كامل الأسرة) (تقريبي)", input.submissionDate, "قد يتغير وفقاً للظروف"));
    docChildren.push(stageItem("تاريخ الحصول على الموافقة المتوقع", approvalDate));
    docChildren.push(stageItem("تاريخ استلام البطاقات المتوقع", cardCollectionDate));
  }  // Timeline final note
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { before: 120, after: 200 },
      children: [
        new TextRun({
          text: "ملحوظة : كل تلك المواعيد هي مواعيد تقريبية بناءً على خبرتنا وتوقعنا لسرعة الإجراءات، ولكن من المهم فهم أن هذه المواعيد تتأثر بالعديد من العوامل، أهمها تواريخ الحصول على الفيزا الشنغن وتاريخ انتهائها، بالإضافة لتواريخ الحصول على مواعيد توثيق الأوراق من السفارة الإسبانية، ولذلك من الممكن أن تتأثر أو تتغير تلك المواعيد بتلك الظروف السابق ذكرها.",
          size: 20,
          color: "7c3aed",
          bold: true,
          italics: true,
          rightToLeft: true,
        }),
      ],
    })
  );
  docChildren.push(dividerPara());
  // ── Section 3: Process steps ─────────────────────────────────────────────────────
  docChildren.push(sectionHeading("ثالثاً : خطوات سير العملية بالتفصيل"));
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
    docChildren.push(
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
  docChildren.push(dividerPara());

  // ── Section 4: Remaining documents (no numbering, with stamp notes) ───────────
  docChildren.push(sectionHeading("رابعاً : المستندات المتبقية المطلوبة"));

  if (input.mainApplicantDocs.length > 0) {
    docChildren.push(rtlPara("أ- مستندات مقدم الطلب الرئيسي :", { bold: true, size: 24, spacing: 80 }));
    input.mainApplicantDocs.forEach((doc) => docChildren.push(docItem(doc)));
  }

  if (input.familyDocs.length > 0) {
    docChildren.push(rtlPara("ب- مستندات أفراد الأسرة :", { bold: true, size: 24, spacing: 80 }));
    // Group family docs by child — detect per-child sections using "الطفل X" prefix
    // First emit non-child family docs, then per-child groups
    const nonChildDocs = input.familyDocs.filter(d => !d.startsWith("الطفل"));
    const childDocs = input.familyDocs.filter(d => d.startsWith("الطفل"));

    nonChildDocs.forEach((doc) => docChildren.push(docItem(doc)));

    // Group per-child docs
    const childGroups: Record<string, string[]> = {};
    childDocs.forEach((doc) => {
      // Format: "الطفل X — Document Name"
      const match = doc.match(/^(الطفل\s+\S+)\s+—\s+(.+)$/);
      if (match) {
        const childLabel = match[1];
        const docName = match[2];
        if (!childGroups[childLabel]) childGroups[childLabel] = [];
        childGroups[childLabel].push(docName);
      } else {
        docChildren.push(docItem(doc));
      }
    });

    // Emit per-child groups with child name from childrenNamesData if available
    Object.entries(childGroups).forEach(([childLabel, docs], groupIdx) => {
      // Try to find the child's actual name
      const childEntry = input.childrenNamesData?.[groupIdx];
      const displayLabel = childEntry?.name
        ? `${childLabel} (${childEntry.name})`
        : childLabel;

      docChildren.push(rtlPara(`${displayLabel} :`, { bold: true, size: 22, spacing: 60 }));
      docs.forEach((d) => docChildren.push(docItem(d)));
    });
  }

  if (input.mainApplicantDocs.length === 0 && input.familyDocs.length === 0) {
    docChildren.push(rtlPara("✓ جميع المستندات مكتملة", { size: 22, color: "16a34a" }));
  }
  docChildren.push(dividerPara());

  // ── Section 5: Important notes (full text as provided) ───────────────────────
  docChildren.push(sectionHeading("ملحوظة هامة :"));

  const importantNotes = [
    "تختلف المستندات المطلوبة لإجراءات الإقامة الإسبانية بحسب كل مرحلة من مراحل التقديم، حيث إن الأوراق المطلوبة لتقديم طلب رب الأسرة تختلف عن المستندات الخاصة بتقديم أفراد الأسرة، كما تختلف أيضًا عن الأوراق المطلوبة لاستخراج التأشيرة من السفارة الإسبانية لدخول أفراد الأسرة إلى إسبانيا لاستكمال باقي إجراءات الإقامة مثل البصمة.",
    "يجب استخراج كل الأوراق والمستندات المطلوبة حين طلبها من حضرتكم فقط وليس قبل ذلك، حيث إن كل مستند له تاريخ صلاحية وتوقيت محدد. بالإضافة إلى أن بعض الأوراق من الممكن استخراجها أكثر من مرة وذلك باختلاف المرحلة الخاصة بالملف ولنفس السبب السالف ذكره.",
    "كل المحادثات والمراسلات يجب أن تكون فقط على هذا الجروب حتى نتمكن من خدمتكم بالشكل والطريقة المثلى.",
    "يجب إرسال صورة ممسوحة ضوئياً لكل المستندات قبل إرسال الأصول إلينا حتى نتمكن من مراجعتها ومعالجة أي خلل أو خطأ فيها. ويُفضل استخراج المستندات بأطول فترة صلاحية ممكنة وتجنب الحاجة إلى إعادة استخراجها خلال نفس المرحلة.",
    "تنقسم إجراءات التقديم إلى أربع مراحل رئيسية، وقد يتطلب الأمر إعادة إصدار بعض المستندات خلال أكثر من مرحلة، وتشمل هذه المراحل ما يلي:\nأ- التقديم لرب الأسرة والحصول على الموافقات الحكومية الخاصة بالإقامة.\nب- التقديم للحصول على تأشيرة شنغن جديدة لاستكمال إجراءات إقامة رب الأسرة (وذلك في حالة انتهاء التأشيرة الأولى فقط).\nج- التقديم لباقي أفراد الأسرة والحصول على الموافقات الحكومية الخاصة بهم.\nد- التقديم للحصول على تأشيرة سفر خاصة من السفارة الإسبانية في مصر، لتمكين أفراد الأسرة من السفر إلى إسبانيا واستكمال باقي إجراءات الإقامة مثل البصمة.",
  ];

  importantNotes.forEach((note, i) => {
    // Handle multi-line notes (note 5 has sub-items)
    const lines = note.split("\n");
    lines.forEach((line, lineIdx) => {
      const prefix = lineIdx === 0 ? `${toArabicNumber(i + 1)}- ` : "     ";
      docChildren.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { after: lineIdx === lines.length - 1 ? 140 : 60 },
          children: [
            new TextRun({
              text: `${prefix}${line}`,
              size: 22,
              rightToLeft: true,
            }),
          ],
        })
      );
    });
  });

  // ── Document validity table ─────────────────────────────────────────────────
  docChildren.push(dividerPara());
  docChildren.push(sectionHeading("فترات صلاحية المستندات"));
  docChildren.push(rtlPara("يوضح الجدول التالي فترات الصلاحية الخاصة ببعض المستندات :", { bold: true, size: 22, spacing: 100 }));

  const validityRows: [string, string][] = [
    ["شهادات الميلاد", "٦ أشهر"],
    ["صحيفة الحالة الجنائية", "٣ أشهر"],
    ["كشف الحساب البنكي", "٣ أشهر"],
    ["عقد الزواج", "٣ أشهر"],
    ["شهادات القيد الفردي", "٣ أشهر"],
    ["شهادات القيد الدراسي", "٣ أشهر"],
  ];

  // Table header
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "المستند", bold: true, size: 22, rightToLeft: true }),
        new TextRun({ text: "          ", size: 22 }),
        new TextRun({ text: "مدة الصلاحية", bold: true, size: 22, rightToLeft: true }),
      ],
    })
  );
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "1e3a5f" } },
      children: [],
    })
  );

  validityRows.forEach(([doc, validity]) => {
    docChildren.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 60 },
        children: [
          new TextRun({ text: doc, size: 22, rightToLeft: true }),
          new TextRun({ text: "          ", size: 22 }),
          new TextRun({ text: validity, size: 22, rightToLeft: true }),
        ],
      })
    );
  });

  // Final disclaimer
  docChildren.push(dividerPara());
  docChildren.push(
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "جميع التوقيتات والمواعيد المثبتة في هذه الخطة هي تواريخ تقريبية بناءً على واقع سير العمل في ملف طلب الإقامة وقد تتغير بتغير مواعيد الفيزا الشنغن بالإضافة لمواعيد توثيق السفارة الإسبانية.",
          size: 20,
          color: "6b7280",
          italics: true,
          rightToLeft: true,
        }),
      ],
    })
  );

  // ── Build document ────────────────────────────────────────────────────────────
  const doc = new Document({
    // Document-level RTL: sets the default text direction to right-to-left
    // so that all paragraphs without explicit alignment default to RTL
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
              // Swap left/right margins for RTL: wider right margin for binding
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

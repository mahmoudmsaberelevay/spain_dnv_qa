import type { CaribbeanJourneyStage } from "./clientDocumentationPrograms";

export type CaribbeanTimelinePayment = {
  paymentName: string;
  paymentMilestone: string | null;
  amountEur?: string | number | null;
  paidDate: Date | string | null;
};

export type CaribbeanTimelineCase = {
  caribbeanJourneyStage: CaribbeanJourneyStage | null;
  questionnaireSubmittedAt: Date | string | null;
  caribbeanLegalizationStartedAt: Date | string | null;
  expectedSubmissionDate: Date | string | null;
  submissionDate: Date | string | null;
  approvalDate: Date | string | null;
  naturalizationIssuingDate: string | null;
  naturalizationIssuedDate: string | null;
  passportsIssuingDate: string | null;
  passportsIssuedDate: string | null;
};

export type CaribbeanTimelineStep = {
  key: string;
  order: number;
  titleEn: string;
  titleAr: string;
  status: "completed" | "active" | "pending";
  date: Date | string | null;
  dueDate?: string | null;
  amountEur?: string | number | null;
  detailEn: string;
};

export type ClientMobileTimelineStep = {
  key: string;
  position: number;
  titleEn: string;
  titleAr: string;
  status: "completed" | "current" | "upcoming";
  occurredAt: string | null;
};

const stageRank: Record<CaribbeanJourneyStage, number> = {
  questionnaire: 0,
  document_collection: 1,
  legalization: 2,
  in_process: 3,
  submitted: 4,
  approved: 5,
  naturalization_issuing: 6,
  naturalization_issued: 7,
  passports_issuing: 8,
  passports_issued: 9,
};

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function addDays(value: Date | string | null | undefined, days: number) {
  const source = dateOnly(value);
  if (!source) return null;
  const date = new Date(`${source}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function paymentByMilestone(payments: CaribbeanTimelinePayment[], milestone: "submission" | "approval") {
  return payments.find(payment => payment.paymentMilestone === milestone) ?? null;
}

export function projectCaribbeanTimeline(input: {
  clientCase: CaribbeanTimelineCase;
  receivedDocuments: number;
  totalDocuments: number;
  payments?: CaribbeanTimelinePayment[];
}) {
  const { clientCase, receivedDocuments, totalDocuments } = input;
  const payments = input.payments ?? [];
  const currentStage = clientCase.caribbeanJourneyStage ?? "questionnaire";
  const rank = stageRank[currentStage];
  const allDocumentsReceived = totalDocuments > 0 && receivedDocuments >= totalDocuments;
  const submissionPayment = paymentByMilestone(payments, "submission");
  const approvalPayment = paymentByMilestone(payments, "approval");
  const submissionPaymentDueDate = addDays(clientCase.expectedSubmissionDate, -12);
  const approvalPaymentDueDate = addDays(clientCase.approvalDate, 1);
  const completed = (condition: boolean) => condition ? "completed" as const : "pending" as const;
  const activeAt = (stage: CaribbeanJourneyStage, condition = true) => currentStage === stage && condition ? "active" as const : "pending" as const;

  const steps: CaribbeanTimelineStep[] = [
    { key: "questionnaire", order: 1, titleEn: "Sending the Questionnaire Form", titleAr: "إرسال نموذج الاستبيان", status: clientCase.questionnaireSubmittedAt ? "completed" : activeAt("questionnaire"), date: clientCase.questionnaireSubmittedAt, detailEn: "The client completes one question at a time and submits the final form securely to ELEVAY." },
    { key: "document_collection", order: 2, titleEn: "Document Collection", titleAr: "جمع المستندات", status: allDocumentsReceived || rank >= stageRank.legalization ? "completed" : activeAt("document_collection"), date: allDocumentsReceived ? clientCase.caribbeanLegalizationStartedAt : null, detailEn: `${receivedDocuments} of ${totalDocuments} conditional checklist documents received.` },
    { key: "legalization", order: 3, titleEn: "In the Legalization Process", titleAr: "قيد التصديق", status: clientCase.expectedSubmissionDate || rank > stageRank.legalization ? "completed" : activeAt("legalization"), date: clientCase.caribbeanLegalizationStartedAt, detailEn: "Begins automatically after every required checklist document is received; staff can also control the stage." },
    { key: "submission_date", order: 4, titleEn: "Submission Date", titleAr: "تاريخ التقديم", status: completed(Boolean(clientCase.expectedSubmissionDate)), date: clientCase.expectedSubmissionDate, detailEn: "The planned submission date set by the consultant or paralegal." },
    { key: "in_process", order: 5, titleEn: "In Process", titleAr: "قيد المعالجة", status: clientCase.submissionDate || rank > stageRank.in_process ? "completed" : activeAt("in_process"), date: clientCase.expectedSubmissionDate, detailEn: "Starts directly when the planned submission date is saved." },
    { key: "submission_payment", order: 6, titleEn: "Submission Payment", titleAr: "دفعة التقديم", status: submissionPayment?.paidDate ? "completed" : (submissionPaymentDueDate ? "active" : "pending"), date: submissionPayment?.paidDate ?? null, dueDate: submissionPaymentDueDate, amountEur: submissionPayment?.amountEur ?? null, detailEn: "Due at least 12 days before the planned submission date." },
    { key: "submitted", order: 7, titleEn: "Submitted", titleAr: "تم التقديم", status: clientCase.submissionDate ? "completed" : activeAt("submitted"), date: clientCase.submissionDate, detailEn: "Marked by the consultant or paralegal when the application is submitted." },
    { key: "approved", order: 8, titleEn: "Approved", titleAr: "تمت الموافقة", status: clientCase.approvalDate ? "completed" : activeAt("approved"), date: clientCase.approvalDate, detailEn: "Marked when citizenship approval is received." },
    { key: "approval_payment", order: 9, titleEn: "Approval Payment", titleAr: "دفعة الموافقة", status: approvalPayment?.paidDate ? "completed" : (approvalPaymentDueDate ? "active" : "pending"), date: approvalPayment?.paidDate ?? null, dueDate: approvalPaymentDueDate, amountEur: approvalPayment?.amountEur ?? null, detailEn: "Due from the day after approval." },
    { key: "naturalization_issuing", order: 10, titleEn: "Issuing Naturalization Certificate", titleAr: "إصدار شهادة التجنس", status: clientCase.naturalizationIssuingDate ? "completed" : activeAt("naturalization_issuing"), date: clientCase.naturalizationIssuingDate, detailEn: "Controlled by the consultant or paralegal." },
    { key: "naturalization_issued", order: 11, titleEn: "Naturalization Certificate Issued", titleAr: "صدور شهادة التجنس", status: clientCase.naturalizationIssuedDate ? "completed" : activeAt("naturalization_issued"), date: clientCase.naturalizationIssuedDate, detailEn: "Marked when the certificate is issued." },
    { key: "passports_issuing", order: 12, titleEn: "Issuing of Passports", titleAr: "إصدار جوازات السفر", status: clientCase.passportsIssuingDate ? "completed" : activeAt("passports_issuing"), date: clientCase.passportsIssuingDate, detailEn: "Controlled by the consultant or paralegal." },
    { key: "passports_issued", order: 13, titleEn: "Passports Issued", titleAr: "صدور جوازات السفر", status: clientCase.passportsIssuedDate ? "completed" : activeAt("passports_issued"), date: clientCase.passportsIssuedDate, detailEn: "Final milestone after passports are issued." },
  ];

  const firstActive = steps.find(step => step.status === "active") ?? steps.find(step => step.status === "pending") ?? steps[steps.length - 1];
  const completedCount = steps.filter(step => step.status === "completed").length;
  return {
    stages: steps,
    progressPercent: Math.round((completedCount / steps.length) * 100),
    currentStage: firstActive,
    paymentDueDates: { submission: submissionPaymentDueDate, approval: approvalPaymentDueDate },
  };
}

/**
 * The native client folder screen consumes a stable array-based process
 * timeline. Keep the detailed Caribbean projection above for CRM and web
 * clients, while adapting it at the mobile REST boundary.
 */
export function projectCaribbeanMobileTimeline(
  input: Parameters<typeof projectCaribbeanTimeline>[0],
): ClientMobileTimelineStep[] {
  return projectCaribbeanTimeline(input).stages.map((step, index) => ({
    key: step.key,
    position: step.order || index + 1,
    titleEn: step.titleEn,
    titleAr: step.titleAr,
    status: step.status === "active" ? "current" : step.status === "completed" ? "completed" : "upcoming",
    occurredAt: step.date instanceof Date
      ? (Number.isNaN(step.date.getTime()) ? null : step.date.toISOString())
      : typeof step.date === "string" && !Number.isNaN(new Date(step.date).getTime())
        ? step.date
        : null,
  }));
}

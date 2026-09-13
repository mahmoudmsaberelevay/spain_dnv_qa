export type ClientProcessTimelineStatus = "completed" | "current" | "upcoming";

export type ClientProcessTimelineItem = {
  key: string;
  position: number;
  titleEn: string;
  titleAr: string;
  status: ClientProcessTimelineStatus;
  occurredAt: string | null;
};

type DateValue = Date | string | null | undefined;

type TimelineCase = {
  stage?: string | null;
  embassyEmailDate?: DateValue;
  spainTeamReceivedDate?: DateValue;
  spanishTeamSubmittedAt?: DateValue;
  translationDate?: DateValue;
  swornTranslationSubmittedAt?: DateValue;
  expectedSubmissionDate?: DateValue;
  submissionDate?: DateValue;
  spanishGovernmentSubmittedAt?: DateValue;
  approvalDate?: DateValue;
  approvalTransitionAt?: DateValue;
  secondPaymentStatus?: string | null;
  secondPaymentAmount?: string | number | null;
  secondPaymentDueDate?: DateValue;
  thirdPaymentStatus?: string | null;
  thirdPaymentAmount?: string | number | null;
  thirdPaymentDueDate?: DateValue;
  travelDate?: DateValue;
  arrivalConfirmedDate?: DateValue;
  biometricsAppointmentDate?: DateValue;
  biometricsBookedAt?: DateValue;
  biometricsStatus?: string | null;
  biometricsDate?: DateValue;
  residencyCardReadyDate?: DateValue;
  residencyCardStatus?: string | null;
  clientPortalSignedAt?: DateValue;
  applicationTimezone?: string | null;
  updatedAt?: DateValue;
};

type TimelineDocument = {
  received?: boolean | null;
  receivedDate?: DateValue;
  mofaSubmitted?: boolean | null;
  mofaSubmittedDate?: DateValue;
  embassySubmitted?: boolean | null;
  embassySubmittedDate?: DateValue;
};

type TimelinePayment = {
  paymentName: string;
  paymentMilestone?: "signed" | "submission" | "approval" | null;
  paidDate?: DateValue;
  sortOrder?: number | null;
};

type TimelineProjectionInput = {
  clientCase: TimelineCase;
  documents: TimelineDocument[];
  payments: TimelinePayment[];
  applicationCreatedAt: DateValue;
  now?: Date;
};

type TimelineDefinition = Omit<ClientProcessTimelineItem, "status"> & {
  reached: boolean;
};

const DAY_MS = 86_400_000;
const STAGE_RANK: Record<string, number> = {
  preparation: 0,
  spain_team_received: 1,
  submission: 2,
  approved: 3,
};

function asIso(value: DateValue): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed.length === 10 ? `${trimmed}T12:00:00Z` : trimmed);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

function dateKey(value: DateValue): string | null {
  const iso = asIso(value);
  if (!iso) return null;
  return iso.slice(0, 10);
}

function firstDate(...values: DateValue[]): string | null {
  for (const value of values) {
    const iso = asIso(value);
    if (iso) return iso;
  }
  return null;
}

function earliestDate(values: DateValue[]): string | null {
  return values.map(asIso).filter((value): value is string => Boolean(value)).sort((a, b) => +new Date(a) - +new Date(b))[0] ?? null;
}

function addDays(value: DateValue, days: number): string | null {
  const key = dateKey(value);
  if (!key) return null;
  const next = new Date(`${key}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function todayInTimezone(now: Date, timeZone: string | null | undefined): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  try {
    return format(timeZone || "Africa/Cairo");
  } catch {
    return format("Africa/Cairo");
  }
}

function calendarDaysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / DAY_MS);
}

function paymentByOrdinal(payments: TimelinePayment[], ordinal: 2 | 3): TimelinePayment | null {
  const ordered = [...payments].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const explicit = ordered.find(payment => {
    const normalized = payment.paymentName.toLowerCase();
    return ordinal === 2
      ? /(^|\s)(second|2nd|payment\s*2)(\s|$)/.test(normalized)
      : /(^|\s)(third|3rd|payment\s*3)(\s|$)/.test(normalized);
  });
  return explicit ?? ordered[ordinal - 1] ?? null;
}

function paymentByMilestone(payments: TimelinePayment[], milestone: "submission" | "approval", legacyOrdinal: 2 | 3): TimelinePayment | null {
  return payments.find(payment => payment.paymentMilestone === milestone) ?? paymentByOrdinal(payments, legacyOrdinal);
}

/**
 * Projects the client-safe progress view from authoritative CRM case fields.
 * The result intentionally contains no database IDs, payment amounts, or staff-only data.
 */
export function projectClientProcessTimeline(input: TimelineProjectionInput): ClientProcessTimelineItem[] {
  const { clientCase, documents, payments, applicationCreatedAt } = input;
  const now = input.now ?? new Date();
  const today = todayInTimezone(now, clientCase.applicationTimezone);
  const caseStageRank = STAGE_RANK[clientCase.stage || "preparation"] ?? 0;

  const receivedDate = earliestDate(documents.filter(document => document.received || document.receivedDate).map(document => document.receivedDate));
  const mofaDate = earliestDate(documents.filter(document => document.mofaSubmitted || document.mofaSubmittedDate).map(document => document.mofaSubmittedDate));
  const embassyDate = earliestDate(documents.filter(document => document.embassySubmitted || document.embassySubmittedDate).map(document => document.embassySubmittedDate));
  const spainTeamDate = firstDate(clientCase.spanishTeamSubmittedAt, clientCase.spainTeamReceivedDate);
  const translatorDate = firstDate(clientCase.swornTranslationSubmittedAt, clientCase.translationDate);
  const governmentSubmissionDate = firstDate(clientCase.spanishGovernmentSubmittedAt, clientCase.submissionDate);
  const approvalDate = firstDate(clientCase.approvalTransitionAt, clientCase.approvalDate);
  const approvalPlusOne = addDays(approvalDate, 1);
  const approvalPlusThree = addDays(approvalDate, 3);
  const secondPayment = paymentByMilestone(payments, "submission", 2);
  const thirdPayment = paymentByMilestone(payments, "approval", 3);
  const secondPaymentConfigured = Boolean(secondPayment || clientCase.secondPaymentAmount || asIso(clientCase.secondPaymentDueDate));
  const thirdPaymentConfigured = Boolean(thirdPayment || clientCase.thirdPaymentAmount || asIso(clientCase.thirdPaymentDueDate));
  const secondPaymentPaid = Boolean(asIso(secondPayment?.paidDate) || clientCase.secondPaymentStatus === "paid");
  const thirdPaymentPaid = Boolean(asIso(thirdPayment?.paidDate) || clientCase.thirdPaymentStatus === "paid");
  const expectedSubmissionDate = dateKey(clientCase.expectedSubmissionDate);
  const secondPaymentThreshold = addDays(expectedSubmissionDate, -12);
  const waitingSecondPayment = Boolean(
    secondPaymentConfigured &&
    !secondPaymentPaid &&
    expectedSubmissionDate &&
    calendarDaysBetween(today, expectedSubmissionDate) <= 12 &&
    !governmentSubmissionDate,
  );
  const thirdPaymentRequired = Boolean(
    thirdPaymentConfigured && !thirdPaymentPaid && approvalPlusOne && today >= approvalPlusOne,
  );
  const waitingTravel = Boolean(
    (approvalPlusThree && today >= approvalPlusThree) ||
    asIso(clientCase.travelDate) ||
    asIso(clientCase.biometricsAppointmentDate) ||
    asIso(clientCase.biometricsDate),
  );
  const biometricsConfirmed = Boolean(
    asIso(clientCase.biometricsAppointmentDate) ||
    asIso(clientCase.biometricsBookedAt) ||
    clientCase.biometricsStatus === "confirmed" ||
    clientCase.biometricsStatus === "completed",
  );
  const biometricsDone = Boolean(asIso(clientCase.biometricsDate) || clientCase.biometricsStatus === "completed");
  const cardReady = Boolean(
    asIso(clientCase.residencyCardReadyDate) ||
    clientCase.residencyCardStatus === "ready_for_collection" ||
    clientCase.residencyCardStatus === "collected",
  );
  const cardReceived = clientCase.residencyCardStatus === "collected";

  const definitions: TimelineDefinition[] = [
    { key: "contract_signed", position: 1, titleEn: "Contract Signed", titleAr: "تم توقيع العقد", reached: Boolean(asIso(clientCase.clientPortalSignedAt) || asIso(applicationCreatedAt)), occurredAt: firstDate(clientCase.clientPortalSignedAt, applicationCreatedAt) },
    { key: "embassy_email", position: 2, titleEn: "Embassy Email", titleAr: "بريد السفارة", reached: Boolean(asIso(clientCase.embassyEmailDate)), occurredAt: asIso(clientCase.embassyEmailDate) },
    { key: "document_preparation", position: 3, titleEn: "Document Preparation", titleAr: "تجهيز المستندات", reached: documents.some(document => Boolean(document.received || document.receivedDate)), occurredAt: receivedDate },
    { key: "mofa_attestation", position: 4, titleEn: "MOFA Attestation", titleAr: "تصديق وزارة الخارجية", reached: documents.some(document => Boolean(document.mofaSubmitted || document.mofaSubmittedDate)), occurredAt: mofaDate },
    { key: "embassy_attestation", position: 5, titleEn: "Embassy Attestation", titleAr: "تصديق السفارة", reached: documents.some(document => Boolean(document.embassySubmitted || document.embassySubmittedDate)), occurredAt: embassyDate },
    { key: "spain_team_submission", position: 6, titleEn: "Submission to Spain Team", titleAr: "التقديم إلى فريق إسبانيا", reached: Boolean(spainTeamDate || caseStageRank >= STAGE_RANK.spain_team_received), occurredAt: spainTeamDate },
    { key: "sworn_translator_submission", position: 7, titleEn: "Submission to Sworn Translator", titleAr: "التقديم إلى المترجم المحلف", reached: Boolean(translatorDate), occurredAt: translatorDate },
    { key: "waiting_second_payment", position: 8, titleEn: "Waiting for Second Payment", titleAr: "في انتظار الدفعة الثانية", reached: Boolean(waitingSecondPayment || secondPaymentPaid || governmentSubmissionDate), occurredAt: waitingSecondPayment ? secondPaymentThreshold : firstDate(secondPayment?.paidDate, governmentSubmissionDate) },
    { key: "ready_to_submit", position: 9, titleEn: "Ready to Submit", titleAr: "جاهز للتقديم", reached: Boolean(translatorDate && (!secondPaymentConfigured || secondPaymentPaid || governmentSubmissionDate)), occurredAt: translatorDate && (!secondPaymentConfigured || secondPaymentPaid || governmentSubmissionDate) ? translatorDate : null },
    { key: "waiting_client_arrival", position: 10, titleEn: "Waiting for Client Arrival Confirmation", titleAr: "في انتظار تأكيد وصول العميل", reached: Boolean(governmentSubmissionDate), occurredAt: governmentSubmissionDate },
    { key: "submitted_to_government", position: 11, titleEn: "Submitted to Government", titleAr: "تم التقديم إلى الحكومة", reached: Boolean(governmentSubmissionDate || caseStageRank >= STAGE_RANK.submission), occurredAt: governmentSubmissionDate },
    { key: "third_payment_required", position: 12, titleEn: "Third Payment Required", titleAr: "الدفعة الثالثة مطلوبة", reached: thirdPaymentRequired, occurredAt: thirdPaymentRequired ? approvalPlusOne : null },
    { key: "waiting_travel_biometrics", position: 13, titleEn: "Waiting for Travel to Biometrics / Setting Up Appointment", titleAr: "في انتظار السفر للبصمات / تحديد الموعد", reached: waitingTravel, occurredAt: firstDate(clientCase.travelDate, approvalPlusThree) },
    { key: "biometrics_appointment_confirmed", position: 14, titleEn: "Biometrics Appointment Confirmed", titleAr: "تم تأكيد موعد البصمات", reached: biometricsConfirmed, occurredAt: firstDate(clientCase.biometricsAppointmentDate, clientCase.biometricsBookedAt) },
    { key: "biometrics_done", position: 15, titleEn: "Biometrics Done", titleAr: "تمت البصمات", reached: biometricsDone, occurredAt: asIso(clientCase.biometricsDate) },
    { key: "card_ready_collection", position: 16, titleEn: "Card Ready for Collection", titleAr: "البطاقة جاهزة للاستلام", reached: cardReady, occurredAt: asIso(clientCase.residencyCardReadyDate) },
    { key: "card_received", position: 17, titleEn: "Card Received", titleAr: "تم استلام البطاقة", reached: cardReceived, occurredAt: cardReceived ? asIso(clientCase.updatedAt) : null },
  ];

  const highestReachedIndex = Math.max(0, ...definitions.map((item, index) => item.reached ? index : -1));
  const processComplete = highestReachedIndex === definitions.length - 1 && definitions[highestReachedIndex].reached;

  return definitions.map(({ reached: _reached, ...item }, index) => ({
    ...item,
    status: index < highestReachedIndex || (processComplete && index === highestReachedIndex)
      ? "completed"
      : index === highestReachedIndex
        ? "current"
        : "upcoming",
  }));
}

export const DOCUMENTATION_MILESTONES = [
  { key: "appointment_booking_submitted", label: "Appointment Booking Confirmation Received", field: "appointmentBookingSubmittedAt" },
  { key: "embassy_reply_confirmed", label: "Embassy Reply Confirmed", field: "embassyReplyConfirmedAt" },
  { key: "translator_submitted", label: "Submitted to Spanish Sworn Translator", field: "translationDate" },
  { key: "travel_booked", label: "Travel to Spain", field: "travelDate" },
  { key: "arrival_confirmed", label: "Arrival Confirmed", field: "arrivalConfirmedDate" },
  { key: "biometrics_appointment", label: "Biometrics Appointment", field: "biometricsAppointmentDate" },
  { key: "biometrics_completed", label: "Biometrics Completed", field: "biometricsDate" },
  { key: "bank_account_completed", label: "Bank Account Completed", field: "bankAccountCompletedDate" },
  { key: "residency_card_ready", label: "Residency Card Ready for Collection", field: "residencyCardReadyDate" },
] as const;

export type DocumentationMilestoneKey = typeof DOCUMENTATION_MILESTONES[number]["key"];

export type DocumentationMilestoneReportRow = {
  id: number;
  clientName: string;
  clientCode: string;
  program: "spain";
  consultant: string | null;
  paralegal: string | null;
  currentMilestone: DocumentationMilestoneKey;
  milestoneDate: string;
};

export type DocumentationMilestoneReport = {
  rows: DocumentationMilestoneReportRow[];
  counts: Record<DocumentationMilestoneKey, number>;
  totalSpainApplications: number;
  withoutMilestone: number;
  beyondMilestones: number;
  generatedAt: string;
};

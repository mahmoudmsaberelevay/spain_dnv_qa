import {
  int,
  bigint,
  mysqlEnum,
  mysqlTable,
  text,
  mediumtext,
  timestamp,
  varchar,
  json,
  boolean,
  decimal,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(), // Optional for email/password auth
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(), // Required for email/password login
  loginMethod: varchar("loginMethod", { length: 64 }), // 'oauth' or 'email'
  password: varchar("password", { length: 255 }), // Hashed password for email/password auth
  passwordResetToken: varchar("passwordResetToken", { length: 255 }), // Token for password reset
  passwordResetExpiry: timestamp("passwordResetExpiry"), // Expiry time for reset token
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  groupId: int("groupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Cases ────────────────────────────────────────────────────────────────────
export const cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientNationality: varchar("clientNationality", { length: 100 }),
  notes: text("notes"),
  status: mysqlEnum("status", ["draft", "in_progress", "complete", "issues_found"])
    .default("draft")
    .notNull(),
  // Extracted passport data
  passportFullName: varchar("passportFullName", { length: 255 }),
  passportNumber: varchar("passportNumber", { length: 50 }),
  passportDob: varchar("passportDob", { length: 50 }),
  passportPob: varchar("passportPob", { length: 255 }),
  passportExpiry: varchar("passportExpiry", { length: 50 }),
  // Wizard progress
  wizardStep: int("wizardStep").default(1).notNull(),
  analysisCompleted: boolean("analysisCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Case = typeof cases.$inferSelect;
export type InsertCase = typeof cases.$inferInsert;

// ─── Documents ────────────────────────────────────────────────────────────────
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  docType: mysqlEnum("docType", [
    "passport_main",
    "passport_family",
    "company_owned",
    "client_company",
    "recommendation_letter",
    "freelancing_contract",
    "birth_certificate",
    "marriage_certificate",
    "police_clearance",
    "education_certificate",
    "other",
  ]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: text("fileKey").notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  // Per-document analysis result
  analysisStatus: mysqlEnum("analysisStatus", ["pending", "processing", "pass", "fail", "warning"])
    .default("pending")
    .notNull(),
  analysisResult: json("analysisResult"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Analysis Results ─────────────────────────────────────────────────────────
export const analysisResults = mysqlTable("analysisResults", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull().unique(),
  overallScore: int("overallScore"), // 0-100
  overallStatus: mysqlEnum("overallStatus", ["pass", "fail", "needs_review"]),
  passportData: json("passportData"),
  stampVerification: json("stampVerification"),
  companyOwnership: json("companyOwnership"),
  clientCompany: json("clientCompany"),
  freelancingEligibility: json("freelancingEligibility"),
  recommendationLetter: json("recommendationLetter"),
  flaggedIssues: json("flaggedIssues"),
  recommendations: json("recommendations"),
  fullReport: text("fullReport"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = typeof analysisResults.$inferInsert;

// ─── Contracting Module ───────────────────────────────────────────────────────
export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  contractCode: varchar("contractCode", { length: 32 }).notNull().unique(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  invoicingName: varchar("invoicingName", { length: 255 }),
  clientMobile: varchar("clientMobile", { length: 32 }),
  familyMembers: int("familyMembers").notNull(),
  contractValue: decimal("contractValue", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("EUR").notNull(),
  status: mysqlEnum("status", ["pending", "signed", "cancelled"]).default("pending").notNull(),
  country: varchar("country", { length: 64 }).default("spain").notNull(),
  consultantName: varchar("consultantName", { length: 128 }),
  clientOrigin: mysqlEnum("clientOrigin", ["referral", "marketing"]),
  marketingLeadId: int("marketingLeadId"),
  discountValue: decimal("discountValue", { precision: 10, scale: 2 }).default("0"),
  docUrl: text("docUrl"),
  driveFileId: varchar("driveFileId", { length: 255 }),
  driveLink: text("driveLink"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceCode: varchar("invoiceCode", { length: 32 }).notNull().unique(),
  contractId: int("contractId"),
  contractCode: varchar("contractCode", { length: 32 }),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  isLegacyReceipt: boolean("isLegacyReceipt").default(false).notNull(),
  legacyFinClientId: int("legacyFinClientId"),
  amountEur: decimal("amountEur", { precision: 10, scale: 2 }).notNull(),
  amountEgp: decimal("amountEgp", { precision: 12, scale: 2 }),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  actualPaidAmountEgp: decimal("actualPaidAmountEgp", { precision: 12, scale: 2 }),
  remainingAmountEgp: decimal("remainingAmountEgp", { precision: 12, scale: 2 }),
  status: mysqlEnum("status", ["unpaid", "paid"]).default("unpaid").notNull(),
  pdfUrl: text("pdfUrl"),
  driveFileId: varchar("driveFileId", { length: 255 }),
  driveLink: text("driveLink"),
  notes: text("notes"),
  receiptDate: timestamp("receiptDate").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  invoiceId: int("invoiceId").notNull(),
  amountEur: decimal("amountEur", { precision: 10, scale: 2 }).notNull(),
  amountEgp: decimal("amountEgp", { precision: 12, scale: 2 }),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── Proforma Invoices ───────────────────────────────────────────────────────
export const proformaInvoices = mysqlTable("proformaInvoices", {
  id: int("id").autoincrement().primaryKey(),
  proformaCode: varchar("proformaCode", { length: 32 }).notNull().unique(),
  contractId: int("contractId"),
  contractCode: varchar("contractCode", { length: 32 }),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  isLegacy: boolean("isLegacy").default(false).notNull(),
  legacyFinClientId: int("legacyFinClientId"),
  amountEur: decimal("amountEur", { precision: 10, scale: 2 }).notNull(),
  amountEgp: decimal("amountEgp", { precision: 12, scale: 2 }),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  status: mysqlEnum("status", ["pending", "paid"]).default("pending").notNull(),
  pdfUrl: text("pdfUrl"),
  notes: text("notes"),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProformaInvoice = typeof proformaInvoices.$inferSelect;
export type InsertProformaInvoice = typeof proformaInvoices.$inferInsert;

// ─── Client Documentation Module ─────────────────────────────────────────────
export const clientCases = mysqlTable("clientCases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  finClientId: int("finClientId"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientCode: varchar("clientCode", { length: 64 }).notNull(),
  clientOrigin: mysqlEnum("clientOrigin", ["egypt", "dubai"]).default("egypt").notNull(),
  clientMobile: varchar("clientMobile", { length: 64 }),
  program: mysqlEnum("program", ["spain", "grenada", "dominica", "st_kitts", "st_lucia", "antigua"]).default("spain").notNull(),
  applicationType: mysqlEnum("applicationType", ["freelancer", "business_owner"]).notNull(),
  maritalStatus: mysqlEnum("maritalStatus", ["single", "family"]).notNull(),
  paralegal: mysqlEnum("paralegal", ["Madonna", "Monica", "Marina", "Marwa", "Minerva", "Lea"]),
  consultant: mysqlEnum("consultant", ["Mahmoud", "Ziad", "Fouad", "Kirolos"]).notNull(),
  schengenDate: timestamp("schengenDate"),
  embassyAppointmentDate: timestamp("embassyAppointmentDate"),
  expectedSubmissionDate: timestamp("expectedSubmissionDate"),
  // Schengen visa tracking
  schengenVisaValid: boolean("schengenVisaValid").default(false),
  schengenExpiryDate: date("schengenExpiryDate"),
  // Embassy attestation email date (for 15-day reminder)
  embassyEmailDate: date("embassyEmailDate"),
  // Required only when the client has no valid Schengen visa
  schengenAppointmentDate: date("schengenAppointmentDate"),
  // Google Drive link for client documents folder
  driveLink: text("driveLink"),
  // Dedicated Google Drive link for the signed client contract
  contractDriveLink: text("contractDriveLink"),
  // Children data: JSON array of { name: string; age: number } (exact name + age per child)
  childrenData: json("childrenData"),
  // Spouse / wife name
  spouseName: varchar("spouseName", { length: 255 }),
  // Spain documentation workflow
  stage: mysqlEnum("stage", ["preparation", "spain_team_received", "submission", "approved"]).default("preparation").notNull(),
  spainTeamReceivedDate: date("spainTeamReceivedDate", { mode: "string" }),
  // Submission stage fields
  submissionDate: timestamp("submissionDate"),
  submissionReceiptLink: text("submissionReceiptLink"),
  expectedApprovalDate: timestamp("expectedApprovalDate"),
  translationDate: timestamp("translationDate"),
  // Approved stage fields
  approvalDate: timestamp("approvalDate"),
  approvalLetterLink: text("approvalLetterLink"),
  settlementFeeAmount: decimal("settlementFeeAmount", { precision: 12, scale: 2 }),
  settlementFeeDate: timestamp("settlementFeeDate"),
  biometricsAppointmentDate: date("biometricsAppointmentDate", { mode: "string" }),
  biometricsDate: timestamp("biometricsDate"),
  // Client application lifecycle anchors. Nullable by design: legacy cases are
  // never backfilled from assumptions.
  clientPortalSignedAt: timestamp("clientPortalSignedAt"),
  appointmentBookingSubmittedAt: timestamp("appointmentBookingSubmittedAt"),
  embassyReplyConfirmedAt: timestamp("embassyReplyConfirmedAt"),
  secondPaymentAmount: decimal("secondPaymentAmount", { precision: 12, scale: 2 }),
  secondPaymentCurrency: varchar("secondPaymentCurrency", { length: 10 }).default("EUR"),
  secondPaymentDueDate: date("secondPaymentDueDate"),
  secondPaymentStatus: mysqlEnum("secondPaymentStatus", ["pending", "paid"]).default("pending"),
  spanishTeamSubmittedAt: timestamp("spanishTeamSubmittedAt"),
  swornTranslationSubmittedAt: timestamp("swornTranslationSubmittedAt"),
  spanishGovernmentSubmittedAt: timestamp("spanishGovernmentSubmittedAt"),
  spanishGovernmentReceiptDocumentPublicId: varchar("spanishGovernmentReceiptDocumentPublicId", { length: 36 }),
  approvalTransitionAt: timestamp("approvalTransitionAt"),
  approvalDocumentPublicId: varchar("approvalDocumentPublicId", { length: 36 }),
  thirdPaymentAmount: decimal("thirdPaymentAmount", { precision: 12, scale: 2 }),
  thirdPaymentCurrency: varchar("thirdPaymentCurrency", { length: 10 }).default("EUR"),
  thirdPaymentDueDate: date("thirdPaymentDueDate"),
  thirdPaymentStatus: mysqlEnum("thirdPaymentStatus", ["pending", "paid"]).default("pending"),
  travelByDate: date("travelByDate"),
  biometricsLocation: varchar("biometricsLocation", { length: 500 }),
  biometricsAppointmentTime: varchar("biometricsAppointmentTime", { length: 5 }),
  biometricsTimezone: varchar("biometricsTimezone", { length: 100 }).default("Europe/Madrid"),
  biometricsStatus: mysqlEnum("biometricsStatus", ["not_booked", "confirmed", "cancelled", "completed"]).default("not_booked"),
  biometricsBookedAt: timestamp("biometricsBookedAt"),
  residencyCardStatus: mysqlEnum("residencyCardStatus", ["not_started", "processing", "ready_for_collection", "collected"]).default("not_started"),
  residencyCardCollectionLocation: varchar("residencyCardCollectionLocation", { length: 500 }),
  residencyCardCollectionInstructions: text("residencyCardCollectionInstructions"),
  residencyCardDocumentPublicId: varchar("residencyCardDocumentPublicId", { length: 36 }),
  applicationTimezone: varchar("applicationTimezone", { length: 100 }).default("Africa/Cairo"),
  bankAccountCompletedDate: date("bankAccountCompletedDate", { mode: "string" }),
  travelDate: date("travelDate", { mode: "string" }),
  ticketLink: text("ticketLink"),
  hotelLink: text("hotelLink"),
  arrivalConfirmedDate: date("arrivalConfirmedDate", { mode: "string" }),
  residencyCardReadyDate: date("residencyCardReadyDate", { mode: "string" }),
  // Caribbean citizenship journeys begin with the client-owned questionnaire.
  // The later Collecting Data checklist is intentionally deferred until supplied.
  caribbeanJourneyStage: mysqlEnum("caribbeanJourneyStage", ["questionnaire", "document_collection", "legalization", "in_process", "submitted", "approved", "naturalization_issuing", "naturalization_issued", "passports_issuing", "passports_issued"]),
  questionnaireSubmittedAt: timestamp("questionnaireSubmittedAt"),
  questionnaireVersion: varchar("questionnaireVersion", { length: 64 }),
  caribbeanLegalizationStartedAt: timestamp("caribbeanLegalizationStartedAt"),
  naturalizationIssuingDate: date("naturalizationIssuingDate", { mode: "string" }),
  naturalizationIssuedDate: date("naturalizationIssuedDate", { mode: "string" }),
  passportsIssuingDate: date("passportsIssuingDate", { mode: "string" }),
  passportsIssuedDate: date("passportsIssuedDate", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientCase = typeof clientCases.$inferSelect;
export type InsertClientCase = typeof clientCases.$inferInsert;

export const clientDocuments = mysqlTable("clientDocuments", {
  id: int("id").autoincrement().primaryKey(),
  clientCaseId: int("clientCaseId").notNull(),
  docKey: varchar("docKey", { length: 64 }).notNull(),       // e.g. "passport_main"
  docName: varchar("docName", { length: 255 }).notNull(),    // e.g. "Main Applicant Passport"
  category: mysqlEnum("category", ["main", "family"]).default("main").notNull(),
  expirationMonths: int("expirationMonths"),                 // null = no expiry
  requiresMofa: boolean("requiresMofa").default(false).notNull(),
  requiresEmbassy: boolean("requiresEmbassy").default(false).notNull(),
  // Tracking fields
  received: boolean("received").default(false).notNull(),
  receivedDate: timestamp("receivedDate"),
  documentLink: text("documentLink"),
  mofaSubmitted: boolean("mofaSubmitted").default(false).notNull(),
  mofaSubmittedDate: date("mofaSubmittedDate", { mode: "string" }),
  mofaReceived: boolean("mofaReceived").default(false).notNull(),
  mofaReceivedDate: date("mofaReceivedDate", { mode: "string" }),
  mofaAttested: boolean("mofaAttested").default(false).notNull(),
  mofaAttestedDate: timestamp("mofaAttestedDate"),
  embassySubmitted: boolean("embassySubmitted").default(false).notNull(),
  embassySubmittedDate: date("embassySubmittedDate", { mode: "string" }),
  embassyReceived: boolean("embassyReceived").default(false).notNull(),
  embassyReceivedDate: date("embassyReceivedDate", { mode: "string" }),
  embassyAttested: boolean("embassyAttested").default(false).notNull(),
  embassyAttestedDate: timestamp("embassyAttestedDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type InsertClientDocument = typeof clientDocuments.$inferInsert;

export const clientDocumentationPayments = mysqlTable("clientDocumentationPayments", {
  id: int("id").autoincrement().primaryKey(),
  clientCaseId: int("clientCaseId").notNull(),
  paymentName: varchar("paymentName", { length: 160 }).notNull(),
  amountEur: decimal("amountEur", { precision: 12, scale: 2 }).notNull(),
  paymentMilestone: mysqlEnum("paymentMilestone", ["signed", "submission", "approval"]),
  dueDate: date("dueDate", { mode: "string" }),
  paidDate: date("paidDate", { mode: "string" }),
  receiptName: varchar("receiptName", { length: 255 }),
  receiptDriveLink: text("receiptDriveLink"),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  updatedByUserId: int("updatedByUserId"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("idx_client_documentation_payments_case").on(table.clientCaseId),
  index("idx_client_documentation_payments_due").on(table.dueDate),
  index("idx_client_doc_payments_case_milestone").on(table.clientCaseId, table.paymentMilestone, table.archivedAt),
]);
export type ClientDocumentationPayment = typeof clientDocumentationPayments.$inferSelect;
export type InsertClientDocumentationPayment = typeof clientDocumentationPayments.$inferInsert;

// ─── Financial Module ────────────────────────────────────────────────────────

export const finAccounts = mysqlTable("finAccounts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("EGP").notNull(),
  openingBalance: decimal("openingBalance", { precision: 14, scale: 2 }).default("0").notNull(),
  balance: decimal("balance", { precision: 14, scale: 2 }).default("0").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  logoUrl: varchar("logoUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinAccount = typeof finAccounts.$inferSelect;
export type InsertFinAccount = typeof finAccounts.$inferInsert;

export const finCategories = mysqlTable("finCategories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinCategory = typeof finCategories.$inferSelect;
export type InsertFinCategory = typeof finCategories.$inferInsert;

export const finEmployees = mysqlTable("finEmployees", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 128 }),
  salary: decimal("salary", { precision: 14, scale: 2 }).default("0"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinEmployee = typeof finEmployees.$inferSelect;
export type InsertFinEmployee = typeof finEmployees.$inferInsert;

export const finClients = mysqlTable("finClients", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId"),
  // Identification
  clientCode: varchar("clientCode", { length: 32 }),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  address: varchar("address", { length: 500 }),
  // Contract info
  program: varchar("program", { length: 128 }),
  signingDate: timestamp("signingDate"),
  salesPerson: varchar("salesPerson", { length: 128 }),
  consultant: varchar("consultant", { length: 128 }),
  contractValue: decimal("contractValue", { precision: 12, scale: 2 }),
  familyMembers: int("familyMembers"),
  // EUR-based financials (primary)
  contractValueEur: decimal("contractValueEur", { precision: 12, scale: 2 }),
  paidAmountEur: decimal("paidAmountEur", { precision: 12, scale: 2 }).default("0").notNull(),
  paidAmountEgp: decimal("paidAmountEgp", { precision: 14, scale: 2 }),
  remainingAmountEur: decimal("remainingAmountEur", { precision: 12, scale: 2 }),
  // Base paid amount set manually (pre-April 14 2026) — new transactions are added on top
  basePaidAmountEur: decimal("basePaidAmountEur", { precision: 12, scale: 2 }).default("0").notNull(),
  // Legacy flag: true = imported from old DB, remainingAmountEur is the starting balance
  isLegacy: boolean("isLegacy").default(false).notNull(),
  stage: mysqlEnum("stage", ["not_yet", "started"]).default("not_yet").notNull(),
  contractUrl: varchar("contractUrl", { length: 2048 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinClient = typeof finClients.$inferSelect;
export type InsertFinClient = typeof finClients.$inferInsert;

export const finCommissions = mysqlTable("finCommissions", {
  id: int("id").autoincrement().primaryKey(),
  // Sequence number (1, 2, 3...)
  seqNumber: int("seqNumber"),
  // Client link
  finClientId: int("finClientId"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  // Status
  status: mysqlEnum("status", ["Pending", "Started", "Cancelled"]).default("Pending"),
  // Contract info
  signingDate: timestamp("signingDate"),
  contractValue: decimal("contractValue", { precision: 12, scale: 2 }),
  // Lead source
  leadSource: mysqlEnum("leadSource", ["Sales Mining", "Referal", "Marketing"]),
  // Qualifier (CS or CS TL)
  qualifierName: varchar("qualifierName", { length: 128 }),
  qualifierCommissionAmount: decimal("qualifierCommissionAmount", { precision: 12, scale: 2 }),
  qualifierCommissionDate: timestamp("qualifierCommissionDate"),
  // Qualifier Leader (CS TL)
  qualifierLeader: varchar("qualifierLeader", { length: 128 }),
  qualifierLeaderCommissionAmount: decimal("qualifierLeaderCommissionAmount", { precision: 12, scale: 2 }),
  qualifierLeaderCommissionDate: timestamp("qualifierLeaderCommissionDate"),
  // Paralegal TL
  paralegalTlCommissionAmount: decimal("paralegalTlCommissionAmount", { precision: 12, scale: 2 }),
  paralegalTlCommissionDate: timestamp("paralegalTlCommissionDate"),
  // Operation Manager
  operationManagerCommissionAmount: decimal("operationManagerCommissionAmount", { precision: 12, scale: 2 }),
  operationManagerCommissionDate: timestamp("operationManagerCommissionDate"),
  // Paralegal
  paralegal: varchar("paralegal", { length: 128 }),
  paralegalFirstPaymentAmount: decimal("paralegalFirstPaymentAmount", { precision: 12, scale: 2 }),
  paralegalFirstPaymentDate: timestamp("paralegalFirstPaymentDate"),
  paralegalSecondPaymentAmount: decimal("paralegalSecondPaymentAmount", { precision: 12, scale: 2 }),
  paralegalSecondPaymentDate: timestamp("paralegalSecondPaymentDate"),
  paralegalThirdPaymentAmount: decimal("paralegalThirdPaymentAmount", { precision: 12, scale: 2 }),
  paralegalThirdPaymentDate: timestamp("paralegalThirdPaymentDate"),
  // Consultant (CS/Senior Consultant/Country Manager/CEO)
  consultant: varchar("consultant", { length: 128 }),
  consultantTotalPayment: decimal("consultantTotalPayment", { precision: 12, scale: 2 }),
  consultantFirstPayment: decimal("consultantFirstPayment", { precision: 12, scale: 2 }),
  consultantFirstPaymentDate: timestamp("consultantFirstPaymentDate"),
  consultantSecondPayment: decimal("consultantSecondPayment", { precision: 12, scale: 2 }),
  consultantSecondPaymentDate: timestamp("consultantSecondPaymentDate"),
  consultantThirdPayment: decimal("consultantThirdPayment", { precision: 12, scale: 2 }),
  consultantThirdPaymentDate: timestamp("consultantThirdPaymentDate"),
  // Leader (Mahmoud Saber)
  leaderName: varchar("leaderName", { length: 128 }).default("Mahmoud Saber"),
  leaderCommissionAmount: decimal("leaderCommissionAmount", { precision: 12, scale: 2 }),
  leaderCommissionDate: timestamp("leaderCommissionDate"),
  // Notion sync
  notionPageId: varchar("notionPageId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinCommission = typeof finCommissions.$inferSelect;
export type InsertFinCommission = typeof finCommissions.$inferInsert;

export const finTransactions = mysqlTable("finTransactions", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["income", "expense", "transfer"]).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  // For income/expense
  accountId: int("accountId"),
  categoryId: int("categoryId"),
  // For transfer
  fromAccountId: int("fromAccountId"),
  toAccountId: int("toAccountId"),
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 4 }),
  // Common
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  convertedAmount: decimal("convertedAmount", { precision: 14, scale: 2 }),
  note: text("note"),
  employeeId: int("employeeId"),
  finClientId: int("finClientId"),
  transactionDate: timestamp("transactionDate").notNull(),
  balanceBefore: decimal("balanceBefore", { precision: 14, scale: 2 }),
  balanceAfter: decimal("balanceAfter", { precision: 14, scale: 2 }),
  // For transfer: second account balance tracking
  balanceBefore2: decimal("balanceBefore2", { precision: 14, scale: 2 }),
  balanceAfter2: decimal("balanceAfter2", { precision: 14, scale: 2 }),
  evidenceLink: varchar("evidenceLink", { length: 1000 }),
  createdBy: varchar("createdBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinTransaction = typeof finTransactions.$inferSelect;
export type InsertFinTransaction = typeof finTransactions.$inferInsert;

// ─── Chat Messages ──────────────────────────────────────────────────────────
export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull(),
  receiverId: int("receiverId").notNull(),
  content: text("content").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── Broadcasts ───────────────────────────────────────────────────────────────
export const broadcasts = mysqlTable("broadcasts", {
  id: int("id").autoincrement().primaryKey(),
  authorId: int("authorId").notNull(),
  content: text("content").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Broadcast = typeof broadcasts.$inferSelect;
export type InsertBroadcast = typeof broadcasts.$inferInsert;

export const broadcastDismissals = mysqlTable("broadcastDismissals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  broadcastId: int("broadcastId").notNull(),
  dismissedAt: timestamp("dismissedAt").defaultNow().notNull(),
});
export type BroadcastDismissal = typeof broadcastDismissals.$inferSelect;
export type InsertBroadcastDismissal = typeof broadcastDismissals.$inferInsert;

// ─── App Settings (global key-value store) ───────────────────────────────────
export const appSettings = mysqlTable("appSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: varchar("value", { length: 500 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: varchar("updatedBy", { length: 320 }),
});
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

// ─── User Permissions ─────────────────────────────────────────────────────────
// One row per user per page key. If a row doesn't exist, access is denied by default.
// The owner (OWNER_OPEN_ID) always has full access regardless of this table.
export const userPermissions = mysqlTable("userPermissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  pageKey: varchar("pageKey", { length: 100 }).notNull(), // e.g. "contracting", "finance", "docs", "analysis", "chat"
  canAccess: boolean("canAccess").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),     // can create/edit/delete within this page
  canCreate: boolean("canCreate").default(false).notNull(), // can create records (used for finance-creator role)
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;

// ─── Pending Invites ──────────────────────────────────────────────────────────
// Owner can generate invite links. When a new user signs up via the link,
// their permissions are pre-populated from the invitePermissions JSON.
export const pendingInvites = mysqlTable("pendingInvites", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  invitePermissions: json("invitePermissions").notNull(), // Record<string, boolean>
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  usedAt: timestamp("usedAt"),
  usedByUserId: int("usedByUserId"),
});
export type PendingInvite = typeof pendingInvites.$inferSelect;
export type InsertPendingInvite = typeof pendingInvites.$inferInsert;

// ─── User Groups ──────────────────────────────────────────────────────────────
// Named groups with a predefined set of permissions. Users assigned to a group
// inherit the group's permissions instead of their individual ones.
export const userGroups = mysqlTable("userGroups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#6366f1").notNull(), // hex color for the badge
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserGroup = typeof userGroups.$inferSelect;
export type InsertUserGroup = typeof userGroups.$inferInsert;

// ─── Group Permissions ────────────────────────────────────────────────────────
// One row per group per page key. Defines the permission set for the group.
export const groupPermissions = mysqlTable("groupPermissions", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  pageKey: varchar("pageKey", { length: 100 }).notNull(),
  canAccess: boolean("canAccess").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),     // can create/edit/delete within this page
  canCreate: boolean("canCreate").default(false).notNull(), // can create records (used for finance-creator role)
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GroupPermission = typeof groupPermissions.$inferSelect;
export type InsertGroupPermission = typeof groupPermissions.$inferInsert;

// ─── Module Permissions (simplified 4-module access control) ────────────────────
// One row per user per module. accessLevel varies by module
// Modules: contracting, clientDocs, appAnalysis, financial, marketing, leads, waQc
// contracting: 'none' | 'full'
// clientDocs: 'none' | 'full'
// appAnalysis: 'none' | 'full'
// financial: 'none' | 'level1' | 'full'
//   - 'level1' = Create expense/income, view accounts/expenses/income/upcoming payments/client database
//   - 'full' = full financial access
// marketing: 'none' | 'full'
// leads: 'none' | 'full'
// waQc: 'none' | 'full' (only owner can have 'full')
export const modulePermissions = mysqlTable("modulePermissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  accessLevel: varchar("accessLevel", { length: 20 }).default("none").notNull(), // 'none' | 'level1' | 'full'
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ModulePermission = typeof modulePermissions.$inferSelect;
export type InsertModulePermission = typeof modulePermissions.$inferInsert;

// ─── Settlement Payments (After Settlement / Dubai Afterlanding Services) ─────
// Tracks post-settlement payments in AED. EUR = AED / 4.
export const settlementPayments = mysqlTable("settlementPayments", {
  id: int("id").autoincrement().primaryKey(),
  clientName: varchar("clientName", { length: 255 }), // free-text or from finClients
  finClientId: int("finClientId"),                     // optional link to finClients
  amountAed: decimal("amountAed", { precision: 12, scale: 2 }).notNull(),
  amountEur: decimal("amountEur", { precision: 12, scale: 2 }).notNull(), // = amountAed / 4
  serviceDate: date("serviceDate").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SettlementPayment = typeof settlementPayments.$inferSelect;
export type InsertSettlementPayment = typeof settlementPayments.$inferInsert;

// ─── Upcoming Payments ────────────────────────────────────────────────────────
// Tracks scheduled future payments per client (EUR amounts).
export const upcomingPayments = mysqlTable("upcomingPayments", {
  id: int("id").autoincrement().primaryKey(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  finClientId: int("finClientId"),                     // optional link to finClients
  consultant: mysqlEnum("consultant", ["Mahmoud", "Fouad", "Kirolos", "Ziad"]).notNull(),
  paymentFor: mysqlEnum("paymentFor", ["First", "Second", "Third"]).notNull(),
  dueDate: date("dueDate").notNull(),
  dueAmount: decimal("dueAmount", { precision: 12, scale: 2 }).notNull(),   // EUR
  paidAmount: decimal("paidAmount", { precision: 12, scale: 2 }).default("0").notNull(), // EUR
  status: mysqlEnum("status", ["Pending", "Done"]).default("Pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UpcomingPayment = typeof upcomingPayments.$inferSelect;
export type InsertUpcomingPayment = typeof upcomingPayments.$inferInsert;

// ─── Salary Receipts ─────────────────────────────────────────────────────────
export const salaryReceipts = mysqlTable("salaryReceipts", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  employeeName: varchar("employeeName", { length: 255 }).notNull(),
  salaryAmount: decimal("salaryAmount", { precision: 14, scale: 2 }).notNull(),
  deductionAmount: decimal("deductionAmount", { precision: 14, scale: 2 }).default("0").notNull(),
  netPaidSalary: decimal("netPaidSalary", { precision: 14, scale: 2 }).notNull(),
  forMonth: varchar("forMonth", { length: 20 }).notNull(),
  receiptDate: timestamp("receiptDate").notNull(),
  status: mysqlEnum("status", ["draft", "paid"]).default("draft").notNull(),
  linkedTransactionId: int("linkedTransactionId"),
  createdBy: varchar("createdBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SalaryReceipt = typeof salaryReceipts.$inferSelect;
export type InsertSalaryReceipt = typeof salaryReceipts.$inferInsert;

// ─── Commission Receipts ──────────────────────────────────────────────────────
export const commissionReceipts = mysqlTable("commissionReceipts", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  employeeName: varchar("employeeName", { length: 255 }).notNull(),
  forMonth: varchar("forMonth", { length: 20 }).notNull(),
  eurToEgpRate: decimal("eurToEgpRate", { precision: 10, scale: 4 }).notNull(),
  totalAmountEur: decimal("totalAmountEur", { precision: 14, scale: 2 }).notNull(),
  totalAmountEgp: decimal("totalAmountEgp", { precision: 14, scale: 2 }).notNull(),
  receiptDate: timestamp("receiptDate").notNull(),
  status: mysqlEnum("status", ["draft", "paid"]).default("draft").notNull(),
  createdBy: varchar("createdBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CommissionReceipt = typeof commissionReceipts.$inferSelect;
export type InsertCommissionReceipt = typeof commissionReceipts.$inferInsert;

export const commissionReceiptItems = mysqlTable("commissionReceiptItems", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receiptId").notNull(),
  clientId: int("clientId").notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  commissionFor: varchar("commissionFor", { length: 100 }).notNull(),
  amountEur: decimal("amountEur", { precision: 14, scale: 2 }).notNull(),
  amountEgp: decimal("amountEgp", { precision: 14, scale: 2 }).notNull(),
  linkedTransactionId: int("linkedTransactionId"),
});
export type CommissionReceiptItem = typeof commissionReceiptItems.$inferSelect;
export type InsertCommissionReceiptItem = typeof commissionReceiptItems.$inferInsert;

// ─── WhatsApp Quality Control ─────────────────────────────────────────────────
export const whatsappConfig = mysqlTable("whatsapp_config", {
  id: int("id").autoincrement().primaryKey(),
  phoneNumberId: varchar("phoneNumberId", { length: 64 }).notNull().unique(),
  displayName: varchar("displayName", { length: 128 }),
  accessToken: text("accessToken"),
  webhookVerifyToken: varchar("webhookVerifyToken", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappConfig = typeof whatsappConfig.$inferSelect;
export type InsertWhatsappConfig = typeof whatsappConfig.$inferInsert;

export const whatsappGroups = mysqlTable("whatsapp_groups", {
  id: int("id").autoincrement().primaryKey(),
  groupId: varchar("groupId", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 256 }),
  description: text("description"),
  phoneNumberId: varchar("phoneNumberId", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  messageCount: int("messageCount").default(0).notNull(),
  lastMessageAt: timestamp("lastMessageAt"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappGroup = typeof whatsappGroups.$inferSelect;
export type InsertWhatsappGroup = typeof whatsappGroups.$inferInsert;

export const waMessages = mysqlTable("wa_messages", {
  id: int("id").autoincrement().primaryKey(),
  messageId: varchar("messageId", { length: 256 }).notNull().unique(),
  groupId: varchar("groupId", { length: 128 }).notNull(),
  senderId: varchar("senderId", { length: 64 }).notNull(),
  senderName: varchar("senderName", { length: 256 }),
  senderPhone: varchar("senderPhone", { length: 32 }),
  messageType: mysqlEnum("messageType", [
    "text", "image", "video", "audio", "document",
    "sticker", "location", "reaction", "contacts", "system", "unknown",
  ]).default("text").notNull(),
  textContent: text("textContent"),
  caption: text("caption"),
  mediaId: varchar("mediaId", { length: 256 }),
  mimeType: varchar("mimeType", { length: 128 }),
  fileName: varchar("fileName", { length: 512 }),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  locationName: varchar("locationName", { length: 256 }),
  reactionEmoji: varchar("reactionEmoji", { length: 16 }),
  reactedToMessageId: varchar("reactedToMessageId", { length: 256 }),
  rawPayload: json("rawPayload"),
  fromMe: boolean("fromMe").default(false).notNull(),
  mediaUrl: text("mediaUrl"),
  mediaMimeType: varchar("mediaMimeType", { length: 100 }),
  transcript: text("transcript"),
  transcriptLang: varchar("transcriptLang", { length: 10 }),
  transcriptArabic: text("transcriptArabic"),
  transcriptEnglish: text("transcriptEnglish"),
  docText: text("docText"),
  whatsappTimestamp: bigint("whatsappTimestamp", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WaMessage = typeof waMessages.$inferSelect;
export type InsertWaMessage = typeof waMessages.$inferInsert;

export const waMediaFiles = mysqlTable("wa_media_files", {
  id: int("id").autoincrement().primaryKey(),
  messageId: varchar("messageId", { length: 256 }).notNull(),
  mediaId: varchar("mediaId", { length: 256 }),
  storageKey: varchar("storageKey", { length: 512 }),
  storageUrl: varchar("storageUrl", { length: 1024 }),
  mimeType: varchar("mimeType", { length: 128 }),
  fileName: varchar("fileName", { length: 512 }),
  fileSize: int("fileSize"),
  downloadStatus: mysqlEnum("downloadStatus", ["pending", "downloaded", "failed"]).default("pending").notNull(),
  downloadError: text("downloadError"),
  downloadedAt: timestamp("downloadedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("wa_media_files_message_unique").on(table.messageId),
  index("wa_media_files_status_created_idx").on(table.downloadStatus, table.createdAt),
]);
export type WaMediaFile = typeof waMediaFiles.$inferSelect;
export type InsertWaMediaFile = typeof waMediaFiles.$inferInsert;

export const waBridgeEvents = mysqlTable("wa_bridge_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  eventType: mysqlEnum("eventType", ["message", "duplicate", "media_stored", "media_failed", "invalid", "error"]).notNull(),
  outcome: mysqlEnum("outcome", ["accepted", "duplicate", "rejected", "failed"]).notNull(),
  messageId: varchar("messageId", { length: 256 }),
  groupId: varchar("groupId", { length: 128 }),
  errorCode: varchar("errorCode", { length: 64 }),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, table => [
  index("wa_bridge_events_occurred_idx").on(table.occurredAt),
  index("wa_bridge_events_outcome_occurred_idx").on(table.outcome, table.occurredAt),
  index("wa_bridge_events_message_idx").on(table.messageId),
]);
export type WaBridgeEvent = typeof waBridgeEvents.$inferSelect;
export type InsertWaBridgeEvent = typeof waBridgeEvents.$inferInsert;

// ─── Client Workflows ─────────────────────────────────────────────────────────
export const clientWorkflows = mysqlTable("clientWorkflows", {
  id: int("id").autoincrement().primaryKey(),
  clientCaseId: int("clientCaseId").notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  // Submission stage: "one" | "two"
  submissionStage: varchar("submissionStage", { length: 10 }).notNull().default("one"),
  // Expected submission date (ISO date string YYYY-MM-DD)
  submissionDate: varchar("submissionDate", { length: 20 }).notNull(),
  // Schengen visa status
  schengenStatus: varchar("schengenStatus", { length: 100 }),
  // Schengen visa expiry date (ISO date string YYYY-MM-DD)
  schengenExpiry: varchar("schengenExpiry", { length: 20 }),
  // Yearly income in EGP
  yearlyIncome: int("yearlyIncome").notNull().default(0),
  // Income proof frequency: "monthly" | "quarterly" | "biannual" | "yearly" | "task"
  incomeFrequency: varchar("incomeFrequency", { length: 20 }).notNull().default("monthly"),
  // JSON array of payment entries: [{date: string, amount: number}]
  incomePayments: text("incomePayments"),
  // Family members count
  familyMembersCount: int("familyMembersCount").notNull().default(0),
  // Application type: "freelancer" | "business_owner"
  applicationType: varchar("applicationType", { length: 30 }).notNull().default("freelancer"),
  // Children data JSON (copied from clientCase at creation time)
  childrenData: text("childrenData"),
  // Children names/ages JSON: [{name: string, ageRange: string}]
  childrenNamesData: text("childrenNamesData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClientWorkflow = typeof clientWorkflows.$inferSelect;
export type InsertClientWorkflow = typeof clientWorkflows.$inferInsert;

// ─── National Visa Workflows ──────────────────────────────────────────────────
export const nationalVisaWorkflows = mysqlTable("nationalVisaWorkflows", {
  id: int("id").autoincrement().primaryKey(),
  clientCaseId: int("clientCaseId").notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  // Wife name
  wifeName: varchar("wifeName", { length: 255 }),
  // JSON array of children: [{name: string, age: number}]
  childrenData: text("childrenData"),
  // Email to CC on follow-up
  followUpEmail: varchar("followUpEmail", { length: 255 }),
   // Notes / additional info
  notes: text("notes"),
  // Status tracking
  status: mysqlEnum("status", ["in_progress", "completed", "submitted"]).default("in_progress").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type NationalVisaWorkflow = typeof nationalVisaWorkflows.$inferSelect;
export type InsertNationalVisaWorkflow = typeof nationalVisaWorkflows.$inferInsert;

// ─── System Notifications ────────────────────────────────────────────────────────────────
export const systemNotifications = mysqlTable("systemNotifications", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  entityId: int("entityId"),
  entityType: varchar("entityType", { length: 64 }),
  isRead: boolean("isRead").notNull().default(false),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type SystemNotification = typeof systemNotifications.$inferSelect;
export type InsertSystemNotification = typeof systemNotifications.$inferInsert;

// ─── ELEVAY LEADS CRM ─────────────────────────────────────────────────────────

export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  // Personal Information
  fullName: varchar("fullName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  email: varchar("email", { length: 320 }),
  nationality: varchar("nationality", { length: 100 }),
  countryOfResidence: varchar("countryOfResidence", { length: 100 }),
  dob: date("dob"),
  gender: mysqlEnum("gender", ["male", "female", "other"]),
  maritalStatus: mysqlEnum("maritalStatus", ["single", "married", "divorced", "widowed"]),
  familyMembers: int("familyMembers").default(1),
  passportStatus: mysqlEnum("passportStatus", ["valid", "expired", "none"]),
  preferredLanguage: varchar("preferredLanguage", { length: 50 }),
  // Immigration Information
  interestedProgram: varchar("interestedProgram", { length: 100 }),
  interestedCountry: varchar("interestedCountry", { length: 100 }),
  budgetRange: varchar("budgetRange", { length: 100 }),
  netWorth: varchar("netWorth", { length: 100 }),
  occupation: varchar("occupation", { length: 100 }),
  monthlyIncome: varchar("monthlyIncome", { length: 100 }),
  educationLevel: varchar("educationLevel", { length: 100 }),
  travelHistory: text("travelHistory"),
  visaRefusals: boolean("visaRefusals").default(false),
  criminalRecord: boolean("criminalRecord").default(false),
  sourceOfFunds: varchar("sourceOfFunds", { length: 100 }),
  // Lead Tracking
  leadSource: varchar("leadSource", { length: 100 }),
  // Meta Lead Ads IDs
  metaLeadId: varchar("metaLeadId", { length: 100 }).unique(),
  metaFormId: varchar("metaFormId", { length: 100 }),
  metaFormName: varchar("metaFormName", { length: 255 }),
  metaPageId: varchar("metaPageId", { length: 100 }),
  metaCampaignId: varchar("metaCampaignId", { length: 100 }),
  metaAdsetId: varchar("metaAdsetId", { length: 100 }),
  metaAdId: varchar("metaAdId", { length: 100 }),
  metaCampaign: varchar("metaCampaign", { length: 255 }),
  metaAdset: varchar("metaAdset", { length: 255 }),
  metaAd: varchar("metaAd", { length: 255 }),
  isOrganic: boolean("isOrganic").default(false),
  isMetaTestLead: boolean("isMetaTestLead").default(false).notNull(),
  // UTM & Attribution
  utmSource: varchar("utmSource", { length: 100 }),
  utmMedium: varchar("utmMedium", { length: 100 }),
  utmCampaign: varchar("utmCampaign", { length: 255 }),
  utmContent: varchar("utmContent", { length: 255 }),
  utmTerm: varchar("utmTerm", { length: 255 }),
  fbclid: varchar("fbclid", { length: 255 }),
  fbcCookie: varchar("fbcCookie", { length: 255 }),
  fbpCookie: varchar("fbpCookie", { length: 255 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  utmParams: text("utmParams"),
  normalizedPhone: varchar("normalizedPhone", { length: 50 }),
  normalizedEmail: varchar("normalizedEmail", { length: 320 }),
  metaLeadCreatedAt: bigint("metaLeadCreatedAt", { mode: "number" }),
  firstReceivedAt: bigint("firstReceivedAt", { mode: "number" }),
  metaLastEventSent: varchar("metaLastEventSent", { length: 255 }),
  metaLastEventSentAt: bigint("metaLastEventSentAt", { mode: "number" }),
  metaSyncStatus: mysqlEnum("metaSyncStatus", ["pending", "sent", "failed", "retrying", "manual_review", "approval_gated"]).default("pending"),
  metaSyncError: text("metaSyncError"),
  // Qualification & Deal
  investmentBudget: varchar("investmentBudget", { length: 100 }),
  numberOfApplicants: int("numberOfApplicants").default(1),
  estimatedDealValue: decimal("estimatedDealValue", { precision: 12, scale: 2 }),
  dealCurrency: varchar("dealCurrency", { length: 10 }).default("USD"),
  // Conversion Dates
  consultationBookedDate: bigint("consultationBookedDate", { mode: "number" }),
  consultationCompletedDate: bigint("consultationCompletedDate", { mode: "number" }),
  contractSignedDate: bigint("contractSignedDate", { mode: "number" }),
  contractValueUsd: decimal("contractValueUsd", { precision: 12, scale: 2 }),
  contractValueEur: decimal("contractValueEur", { precision: 12, scale: 2 }),
  paymentReceivedDate: bigint("paymentReceivedDate", { mode: "number" }),
  totalPaymentsReceived: decimal("totalPaymentsReceived", { precision: 12, scale: 2 }),
  // GDPR & Consent
  gdprConsent: boolean("gdprConsent").default(false),
  consentTimestamp: bigint("consentTimestamp", { mode: "number" }),
  dataSharingConsent: boolean("dataSharingConsent").default(false),
  marketingOptIn: boolean("marketingOptIn").default(false),
  optOutSignal: boolean("optOutSignal").default(false),
  dataRegion: varchar("dataRegion", { length: 20 }),
  assignedTo: varchar("assignedTo", { length: 255 }),
  assignedConsultantUserId: int("assignedConsultantUserId"),
  metaAssignmentStatus: mysqlEnum("metaAssignmentStatus", ["not_applicable", "assigned", "preserved", "pending", "manual_review"]).default("not_applicable").notNull(),
  metaAssignmentErrorCode: varchar("metaAssignmentErrorCode", { length: 100 }),
  metaAssignmentUpdatedAt: bigint("metaAssignmentUpdatedAt", { mode: "number" }),
  stage: mysqlEnum("stage", [
    "fresh",
    "contacted",
    "qualified",
    "prospect",
    "client",
    "dormant",
    "resubmit",
    "not_qualified_budget",
    "not_qualified_work",
    "not_qualified_study",
    "not_qualified_criminal",
    "not_qualified_other",
  ]).default("fresh").notNull(),
  leadScore: int("leadScore").default(0),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium"),
  notes: text("notes"),
  specialNoteType: mysqlEnum("specialNoteType", ["zoom_meeting", "physical_meeting"]),
  specialNote: text("specialNote"),
  specialNoteSetBy: varchar("specialNoteSetBy", { length: 255 }),
  specialNoteUpdatedAt: bigint("specialNoteUpdatedAt", { mode: "number" }),
  lastContactAt: bigint("lastContactAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => ({
  normalizedPhoneIdentityUnique: uniqueIndex("leads_test_normalized_phone_uq").on(table.isMetaTestLead, table.normalizedPhone),
  normalizedEmailIdentityUnique: uniqueIndex("leads_test_normalized_email_uq").on(table.isMetaTestLead, table.normalizedEmail),
  specialNoteTypeIndex: index("leads_special_note_type_idx").on(table.specialNoteType),
}));
export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * Privacy-safe, idempotent receipt ledger for the separate Spain DNV landing
 * website. Contact data remains on the Lead row; this table stores only the
 * external submission identity, routing context, and processing outcome.
 */
export const spainLandingInquiries = mysqlTable("spain_landing_inquiries", {
  id: int("id").autoincrement().primaryKey(),
  externalSubmissionId: int("externalSubmissionId").notNull().unique(),
  leadId: int("leadId"),
  source: varchar("source", { length: 100 }).default("Spain_landing page").notNull(),
  program: varchar("program", { length: 100 }).default("Spain DNV").notNull(),
  language: mysqlEnum("language", ["en", "ar"]).notNull(),
  jobPosition: varchar("jobPosition", { length: 80 }).notNull(),
  matchMethod: mysqlEnum("matchMethod", ["new", "phone", "email", "manual_review"]).notNull(),
  status: mysqlEnum("status", ["processing", "created", "matched", "manual_review", "failed"]).default("processing").notNull(),
  processingToken: varchar("processingToken", { length: 64 }),
  payloadFingerprint: varchar("payloadFingerprint", { length: 64 }).notNull(),
  lastErrorCode: varchar("lastErrorCode", { length: 100 }),
  firstReceivedAt: bigint("firstReceivedAt", { mode: "number" }).notNull(),
  processedAt: bigint("processedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type SpainLandingInquiry = typeof spainLandingInquiries.$inferSelect;
export type InsertSpainLandingInquiry = typeof spainLandingInquiries.$inferInsert;

export const leadActivities = mysqlTable("lead_activities", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  userId: int("userId"),
  activityType: mysqlEnum("activityType", [
    "created",
    "assigned",
    "note_added",
    "whatsapp_sent",
    "email_sent",
    "call_made",
    "stage_changed",
    "document_uploaded",
    "followup_scheduled",
    "meeting_scheduled",
    "status_updated",
    "task_created",
    "task_completed",
    "call",
    "whatsapp",
    "sms",
    "email",
    "meeting",
    "note",
    "stage_change",
    "other",
  ]).notNull(),
  description: text("description").notNull(),
  score: int("score").default(0),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = typeof leadActivities.$inferInsert;

export const leadNotes = mysqlTable("lead_notes", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }),
  note: text("note").notNull(),
  isPinned: boolean("isPinned").default(false),
  isImportant: boolean("isImportant").default(false),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type LeadNote = typeof leadNotes.$inferSelect;
export type InsertLeadNote = typeof leadNotes.$inferInsert;

export const leadTasks = mysqlTable("lead_tasks", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  assignedTo: varchar("assignedTo", { length: 255 }),
  taskType: mysqlEnum("taskType", ["call", "whatsapp", "email", "meeting", "document_request", "other"]).notNull(),
  dueDate: bigint("dueDate", { mode: "number" }).notNull(),
  completed: boolean("completed").default(false),
  completedAt: bigint("completedAt", { mode: "number" }),
  notes: text("notes"),
  createdBy: varchar("createdBy", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type LeadTask = typeof leadTasks.$inferSelect;
export type InsertLeadTask = typeof leadTasks.$inferInsert;

// ─── LEADS SETTINGS ──────────────────────────────────────────────────────────

export const leadSources = mysqlTable("lead_sources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  isActive: boolean("isActive").default(true),
  isDefault: boolean("isDefault").default(false),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type LeadSource = typeof leadSources.$inferSelect;
export type InsertLeadSource = typeof leadSources.$inferInsert;

export const leadIntegrations = mysqlTable("lead_integrations", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["meta", "website"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  config: text("config"), // JSON blob: page_id, form_id, verify_token, page_access_token, lead_source, assigned_to
  isActive: boolean("isActive").default(true),
  webhookToken: varchar("webhookToken", { length: 128 }),
  lastSyncAt: bigint("lastSyncAt", { mode: "number" }), // timestamp of last successful Meta sync
  lastSyncCount: int("lastSyncCount").default(0), // leads pulled in last sync
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type LeadIntegration = typeof leadIntegrations.$inferSelect;
export type InsertLeadIntegration = typeof leadIntegrations.$inferInsert;

// ─── META LEAD ADS / CONVERSIONS API FOR CRM ─────────────────────────────────

/**
 * Immutable inquiry-level attribution. A contact can submit more than one Meta
 * Instant Form without creating a duplicate Lead or losing earlier attribution.
 */
export const leadMetaAttributions = mysqlTable("lead_meta_attributions", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  metaLeadId: varchar("metaLeadId", { length: 100 }).notNull().unique(),
  metaPageId: varchar("metaPageId", { length: 100 }),
  metaFormId: varchar("metaFormId", { length: 100 }),
  metaFormName: varchar("metaFormName", { length: 255 }),
  metaCampaignId: varchar("metaCampaignId", { length: 100 }),
  metaCampaignName: varchar("metaCampaignName", { length: 255 }),
  metaAdSetId: varchar("metaAdSetId", { length: 100 }),
  metaAdSetName: varchar("metaAdSetName", { length: 255 }),
  metaAdId: varchar("metaAdId", { length: 100 }),
  metaAdName: varchar("metaAdName", { length: 255 }),
  metaIsOrganic: boolean("metaIsOrganic").default(false),
  isTestLead: boolean("isTestLead").default(false).notNull(),
  routingConsultantUserId: int("routingConsultantUserId"),
  routingConsultantDisplayName: varchar("routingConsultantDisplayName", { length: 255 }),
  matchMethod: mysqlEnum("matchMethod", ["new_lead", "meta_lead_id", "phone", "email"]).default("new_lead").notNull(),
  duplicateIndicator: boolean("duplicateIndicator").default(false).notNull(),
  ambiguousMatch: boolean("ambiguousMatch").default(false).notNull(),
  source: varchar("source", { length: 100 }).default("Meta Instant Form").notNull(),
  program: varchar("program", { length: 150 }),
  utmSource: varchar("utmSource", { length: 100 }),
  utmMedium: varchar("utmMedium", { length: 100 }),
  utmCampaign: varchar("utmCampaign", { length: 255 }),
  utmContent: varchar("utmContent", { length: 255 }),
  utmTerm: varchar("utmTerm", { length: 255 }),
  metaLeadCreatedAt: bigint("metaLeadCreatedAt", { mode: "number" }).notNull(),
  firstReceivedAt: bigint("firstReceivedAt", { mode: "number" }).notNull(),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type LeadMetaAttribution = typeof leadMetaAttributions.$inferSelect;
export type InsertLeadMetaAttribution = typeof leadMetaAttributions.$inferInsert;

/** Sanitized, idempotent webhook notification inbox. Never stores lead PII. */
export const metaWebhookInbox = mysqlTable("meta_webhook_inbox", {
  id: int("id").autoincrement().primaryKey(),
  webhookKey: varchar("webhookKey", { length: 255 }).notNull().unique(),
  metaLeadId: varchar("metaLeadId", { length: 100 }).notNull(),
  metaPageId: varchar("metaPageId", { length: 100 }),
  metaFormId: varchar("metaFormId", { length: 100 }),
  metaAdId: varchar("metaAdId", { length: 100 }),
  metaAdGroupId: varchar("metaAdGroupId", { length: 100 }),
  metaCreatedTime: bigint("metaCreatedTime", { mode: "number" }),
  isTestLead: boolean("isTestLead").default(false).notNull(),
  ingestionSource: mysqlEnum("ingestionSource", ["webhook", "reconciliation"]).default("webhook").notNull(),
  signatureValidated: boolean("signatureValidated").default(false).notNull(),
  matchMethod: varchar("matchMethod", { length: 50 }),
  duplicateIndicator: boolean("duplicateIndicator").default(false).notNull(),
  ambiguousMatch: boolean("ambiguousMatch").default(false).notNull(),
  requiresManualReview: boolean("requiresManualReview").default(false).notNull(),
  manualReviewReason: varchar("manualReviewReason", { length: 100 }),
  assignmentStatus: mysqlEnum("assignmentStatus", ["not_applicable", "assigned", "preserved", "pending", "manual_review"]).default("not_applicable").notNull(),
  lastErrorCode: varchar("lastErrorCode", { length: 100 }),
  leadId: int("leadId"),
  status: mysqlEnum("status", ["pending", "processing", "processed", "failed", "retrying", "dead_letter", "manual_review"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  nextAttemptAt: bigint("nextAttemptAt", { mode: "number" }),
  lastError: text("lastError"),
  receivedAt: bigint("receivedAt", { mode: "number" }).notNull(),
  processedAt: bigint("processedAt", { mode: "number" }),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type MetaWebhookInboxItem = typeof metaWebhookInbox.$inferSelect;
export type InsertMetaWebhookInboxItem = typeof metaWebhookInbox.$inferInsert;

/** Admin-configurable attribution and CRM-stage mapping rules. */
export const metaIntegrationMappings = mysqlTable("meta_integration_mappings", {
  id: int("id").autoincrement().primaryKey(),
  mappingKey: varchar("mappingKey", { length: 255 }).notNull().unique(),
  mappingType: mysqlEnum("mappingType", ["form", "campaign", "adset", "ad", "page", "crm_stage"]).notNull(),
  matchValue: varchar("matchValue", { length: 255 }).notNull(),
  matchName: varchar("matchName", { length: 255 }),
  program: varchar("program", { length: 150 }),
  outputValue: varchar("outputValue", { length: 255 }),
  priority: int("priority").default(100).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type MetaIntegrationMapping = typeof metaIntegrationMappings.$inferSelect;
export type InsertMetaIntegrationMapping = typeof metaIntegrationMappings.$inferInsert;

/** Ordered, idempotent CRM-stage event outbox for Meta Conversions API. */
export const metaCrmEventLog = mysqlTable("meta_crm_event_log", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  metaLeadId: varchar("metaLeadId", { length: 100 }),
  eventName: varchar("eventName", { length: 255 }).notNull(),
  eventTime: bigint("eventTime", { mode: "number" }).notNull(),
  eventId: varchar("eventId", { length: 255 }).notNull().unique(),
  sourceType: varchar("sourceType", { length: 64 }).notNull(),
  sourceId: varchar("sourceId", { length: 100 }),
  sourceStage: varchar("sourceStage", { length: 100 }),
  isTestLead: boolean("isTestLead").default(false).notNull(),
  deliveryMode: mysqlEnum("deliveryMode", ["production", "test", "approval_gated", "legacy_unknown"]),
  testEventCodeUsed: boolean("testEventCodeUsed").default(false).notNull(),
  productionGateEnabledAtAttempt: boolean("productionGateEnabledAtAttempt"),
  requestDispatchedAt: bigint("requestDispatchedAt", { mode: "number" }),
  metaResponseReceiptId: varchar("metaResponseReceiptId", { length: 255 }),
  deliveryEvidenceCode: varchar("deliveryEvidenceCode", { length: 100 }),
  status: mysqlEnum("status", ["pending", "sent", "failed", "retrying", "dead_letter", "manual_review", "approval_gated"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  nextAttemptAt: bigint("nextAttemptAt", { mode: "number" }),
  hasLeadId: boolean("hasLeadId").default(false).notNull(),
  hasEmailHash: boolean("hasEmailHash").default(false).notNull(),
  hasPhoneHash: boolean("hasPhoneHash").default(false).notNull(),
  metaResponse: text("metaResponse"),
  errorCode: varchar("errorCode", { length: 100 }),
  lastError: text("lastError"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  sentAt: bigint("sentAt", { mode: "number" }),
});
export type MetaCrmEvent = typeof metaCrmEventLog.$inferSelect;
export type InsertMetaCrmEvent = typeof metaCrmEventLog.$inferInsert;

/** Named, server-side policy that resolves the default consultant for real Meta inquiries. */
export const metaAssignmentPolicies = mysqlTable("meta_assignment_policies", {
  id: int("id").autoincrement().primaryKey(),
  policyKey: varchar("policyKey", { length: 100 }).notNull().unique(),
  consultantUserId: int("consultantUserId").notNull(),
  consultantDisplayName: varchar("consultantDisplayName", { length: 255 }).notNull(),
  monitoringCronTaskUid: varchar("monitoringCronTaskUid", { length: 65 }).unique(),
  isActive: boolean("isActive").default(true).notNull(),
  backfillBaselineAt: bigint("backfillBaselineAt", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type MetaAssignmentPolicy = typeof metaAssignmentPolicies.$inferSelect;

/** Idempotent system audit for every Meta default-assignment decision. */
export const metaLeadAssignmentAudits = mysqlTable("meta_lead_assignment_audits", {
  id: int("id").autoincrement().primaryKey(),
  assignmentKey: varchar("assignmentKey", { length: 255 }).notNull().unique(),
  leadId: int("leadId"),
  metaLeadId: varchar("metaLeadId", { length: 100 }),
  previousConsultant: varchar("previousConsultant", { length: 255 }),
  newConsultantUserId: int("newConsultantUserId"),
  newConsultant: varchar("newConsultant", { length: 255 }),
  reason: varchar("reason", { length: 100 }).default("meta_default_assignment").notNull(),
  outcome: mysqlEnum("outcome", ["assigned", "preserved", "pending", "manual_review", "skipped_test"]).notNull(),
  systemActor: varchar("systemActor", { length: 100 }).default("system:meta_ingestion").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type MetaLeadAssignmentAudit = typeof metaLeadAssignmentAudits.$inferSelect;

/** Durable notification deduplication and retry state; no recipient or Lead PII is stored. */
export const metaNotificationLog = mysqlTable("meta_notification_log", {
  id: int("id").autoincrement().primaryKey(),
  notificationKey: varchar("notificationKey", { length: 255 }).notNull().unique(),
  notificationType: mysqlEnum("notificationType", ["lead_alert", "admin_alert"]).notNull(),
  leadId: int("leadId"),
  metaLeadId: varchar("metaLeadId", { length: 100 }),
  safeAlertCode: varchar("safeAlertCode", { length: 100 }),
  status: mysqlEnum("status", ["pending", "sent", "failed", "suppressed"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  nextAttemptAt: bigint("nextAttemptAt", { mode: "number" }),
  recipientCount: int("recipientCount").default(0).notNull(),
  lastError: text("lastError"),
  sentAt: bigint("sentAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type MetaNotificationLog = typeof metaNotificationLog.$inferSelect;

/** PII-free webhook security counters used for signature and acceptance monitoring. */
export const metaWebhookSecurityEvents = mysqlTable("meta_webhook_security_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: mysqlEnum("eventType", ["signed_accepted", "signature_failure", "verification_failure"]).notNull(),
  safeCode: varchar("safeCode", { length: 100 }).notNull(),
  occurredAt: bigint("occurredAt", { mode: "number" }).notNull(),
});
export type MetaWebhookSecurityEvent = typeof metaWebhookSecurityEvents.$inferSelect;

/** Heartbeat-produced operational evidence for the 24-hour Meta monitoring window. */
export const metaMonitoringSnapshots = mysqlTable("meta_monitoring_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  capturedAt: bigint("capturedAt", { mode: "number" }).notNull(),
  signedWebhookCount: int("signedWebhookCount").default(0).notNull(),
  signatureFailureCount: int("signatureFailureCount").default(0).notNull(),
  processedInboxCount: int("processedInboxCount").default(0).notNull(),
  failedInboxCount: int("failedInboxCount").default(0).notNull(),
  retryInboxCount: int("retryInboxCount").default(0).notNull(),
  p50IngestionDelaySeconds: int("p50IngestionDelaySeconds"),
  p95IngestionDelaySeconds: int("p95IngestionDelaySeconds"),
  metaLeadIdCoverageBps: int("metaLeadIdCoverageBps"),
  attributionCoverageBps: int("attributionCoverageBps"),
  programCoverageBps: int("programCoverageBps"),
  assignmentCoverageBps: int("assignmentCoverageBps"),
  unassignedOverTenMinutes: int("unassignedOverTenMinutes").default(0).notNull(),
  duplicateAttributionCount: int("duplicateAttributionCount").default(0).notNull(),
  ambiguousMatchCount: int("ambiguousMatchCount").default(0).notNull(),
  manualReviewCount: int("manualReviewCount").default(0).notNull(),
  stageOrderViolationCount: int("stageOrderViolationCount").default(0).notNull(),
  testLeadLeakageCount: int("testLeadLeakageCount").default(0).notNull(),
  productionSendingEnabled: boolean("productionSendingEnabled").default(false).notNull(),
});
export type MetaMonitoringSnapshot = typeof metaMonitoringSnapshots.$inferSelect;

export const metaReconciliationState = mysqlTable("meta_reconciliation_state", {
  id: int("id").autoincrement().primaryKey(),
  integrationId: int("integrationId").unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).unique(),
  cursor: text("cursor"),
  status: mysqlEnum("status", ["idle", "running", "success", "failed"]).default("idle").notNull(),
  lastAttemptAt: bigint("lastAttemptAt", { mode: "number" }),
  lastSuccessAt: bigint("lastSuccessAt", { mode: "number" }),
  lastError: text("lastError"),
  leadsScanned: int("leadsScanned").default(0).notNull(),
  leadsImported: int("leadsImported").default(0).notNull(),
  eventsRetried: int("eventsRetried").default(0).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type MetaReconciliationState = typeof metaReconciliationState.$inferSelect;
export type InsertMetaReconciliationState = typeof metaReconciliationState.$inferInsert;

export const databaseBackupSettings = mysqlTable("database_backup_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).unique(),
  cronExpression: varchar("cronExpression", { length: 100 }).notNull(),
  timeZone: varchar("timeZone", { length: 64 }).default("Africa/Cairo").notNull(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  authorizedTestRunUntil: bigint("authorizedTestRunUntil", { mode: "number" }),
  lastAttemptAt: bigint("lastAttemptAt", { mode: "number" }),
  lastSuccessAt: bigint("lastSuccessAt", { mode: "number" }),
  lastFailureAt: bigint("lastFailureAt", { mode: "number" }),
  lastErrorCode: varchar("lastErrorCode", { length: 80 }),
  lastArtifactKey: varchar("lastArtifactKey", { length: 500 }),
  lastArtifactSizeBytes: bigint("lastArtifactSizeBytes", { mode: "number" }),
  lastEmailSuccessCount: int("lastEmailSuccessCount").default(0).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type DatabaseBackupSetting = typeof databaseBackupSettings.$inferSelect;

export const databaseBackupRuns = mysqlTable("database_backup_runs", {
  id: int("id").autoincrement().primaryKey(),
  runKey: varchar("runKey", { length: 160 }).notNull().unique(),
  taskUid: varchar("taskUid", { length: 65 }).notNull(),
  status: mysqlEnum("status", ["processing", "success", "failed", "skipped"]).default("processing").notNull(),
  artifactKey: varchar("artifactKey", { length: 500 }),
  artifactSizeBytes: bigint("artifactSizeBytes", { mode: "number" }),
  emailSuccessCount: int("emailSuccessCount").default(0).notNull(),
  emailFailureCount: int("emailFailureCount").default(0).notNull(),
  errorCode: varchar("errorCode", { length: 80 }),
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  durationMs: int("durationMs"),
});
export type DatabaseBackupRun = typeof databaseBackupRuns.$inferSelect;

export const leadsPermissions = mysqlTable("leads_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  canView: boolean("canView").default(true),
  canCreate: boolean("canCreate").default(false),
  canEdit: boolean("canEdit").default(false),
  canDelete: boolean("canDelete").default(false),
  canExport: boolean("canExport").default(false),
  canImport: boolean("canImport").default(false),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type LeadsPermission = typeof leadsPermissions.$inferSelect;

// ─── LEADS PROGRAMS ──────────────────────────────────────────────────────────
export const leadPrograms = mysqlTable("lead_programs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type LeadProgram = typeof leadPrograms.$inferSelect;
export type InsertLeadProgram = typeof leadPrograms.$inferInsert;

// ─── LEADS ACTIVITY PRESETS ───────────────────────────────────────────────────
export const leadActivityPresets = mysqlTable("lead_activity_presets", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 150 }).notNull(),
  activityType: mysqlEnum("activityType", ["call", "whatsapp", "sms", "email", "meeting", "note", "stage_change", "email_sent", "other"]).notNull().default("other"),
  score: int("score").notNull().default(0),
  isActive: boolean("isActive").default(true),
  isDefault: boolean("isDefault").default(false),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type LeadActivityPreset = typeof leadActivityPresets.$inferSelect;
export type InsertLeadActivityPreset = typeof leadActivityPresets.$inferInsert;

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userEmail: varchar("userEmail", { length: 320 }),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),
  resourceId: varchar("resourceId", { length: 100 }),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── ELEVAY Client Portal ─────────────────────────────────────────────────────
// Client-portal identities are deliberately separate from employee `users`.
// A portal session can never be accepted by the employee tRPC router.
export const clientPortalUsers = mysqlTable("client_portal_users", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  primaryClientCaseId: int("primaryClientCaseId"),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  mobile: varchar("mobile", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  accountType: mysqlEnum("accountType", ["client", "admin"]).default("client").notNull(),
  isReviewAccount: boolean("isReviewAccount").default(false).notNull(),
  status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
  mustChangePassword: boolean("mustChangePassword").default(true).notNull(),
  consultant: varchar("consultant", { length: 128 }),
  paralegal: varchar("paralegal", { length: 128 }),
  locale: mysqlEnum("locale", ["en", "ar"]).default("en").notNull(),
  notificationPreferences: json("notificationPreferences"),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  passwordResetTokenHash: varchar("passwordResetTokenHash", { length: 255 }),
  passwordResetExpiresAt: timestamp("passwordResetExpiresAt"),
  deletionRequestedAt: timestamp("deletionRequestedAt"),
  lastLoginAt: timestamp("lastLoginAt"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientPortalUser = typeof clientPortalUsers.$inferSelect;
export type InsertClientPortalUser = typeof clientPortalUsers.$inferInsert;

export const clientPortalApplications = mysqlTable("client_portal_applications", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  portalUserId: int("portalUserId").notNull(),
  clientCaseId: int("clientCaseId").notNull(),
  label: varchar("label", { length: 255 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  accessRevokedAt: timestamp("accessRevokedAt"),
  accessRevokedBy: int("accessRevokedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uniquePortalCase: uniqueIndex("client_portal_applications_user_case_unique").on(table.portalUserId, table.clientCaseId),
  activeAccess: index("client_portal_applications_active_access_idx").on(table.portalUserId, table.accessRevokedAt, table.isPrimary),
}));
export type ClientPortalApplication = typeof clientPortalApplications.$inferSelect;
export type InsertClientPortalApplication = typeof clientPortalApplications.$inferInsert;

export const clientApplicationQuestionnaires = mysqlTable("caribbeanQuestionnaires", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  clientCaseId: int("clientCaseId").notNull(),
  program: mysqlEnum("program", ["grenada", "dominica", "st_kitts", "st_lucia", "antigua"]).notNull(),
  questionnaireVersion: varchar("version", { length: 64 }).notNull(),
  questionnaireDefinition: json("definitionJson"),
  status: mysqlEnum("status", ["draft", "submitted"]).default("draft").notNull(),
  answers: json("answersJson").notNull(),
  currentStepKey: varchar("currentStepKey", { length: 191 }),
  startedByPortalUserId: int("startedByPortalUserId"),
  submittedByPortalUserId: int("submittedByPortalUserId"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  lastSavedAt: timestamp("lastSavedAt").defaultNow().notNull(),
  submittedAt: timestamp("submittedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uniqueClientCase: uniqueIndex("caribbean_questionnaire_case_unique").on(table.clientCaseId),
  statusIndex: index("caribbean_questionnaire_status_idx").on(table.status, table.updatedAt),
}));
export type ClientApplicationQuestionnaire = typeof clientApplicationQuestionnaires.$inferSelect;
export type InsertClientApplicationQuestionnaire = typeof clientApplicationQuestionnaires.$inferInsert;

export const clientQuestionnaireLaunchTokens = mysqlTable("client_questionnaire_launch_tokens", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  portalUserId: int("portalUserId").notNull(),
  portalApplicationId: int("portalApplicationId").notNull(),
  clientCaseId: int("clientCaseId").notNull(),
  sourceSessionId: int("sourceSessionId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  launchLookup: uniqueIndex("client_questionnaire_launch_tokens_hash_unique").on(table.tokenHash),
  applicationExpiry: index("client_questionnaire_launch_tokens_application_expiry_idx").on(table.portalApplicationId, table.expiresAt, table.usedAt),
}));
export type ClientQuestionnaireLaunchToken = typeof clientQuestionnaireLaunchTokens.$inferSelect;
export type InsertClientQuestionnaireLaunchToken = typeof clientQuestionnaireLaunchTokens.$inferInsert;

export const clientPortalApplicants = mysqlTable("client_portal_applicants", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  portalApplicationId: int("portalApplicationId").notNull(),
  relation: mysqlEnum("relation", ["main", "spouse", "child", "dependent"]).notNull(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  birthDate: date("birthDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClientPortalApplicant = typeof clientPortalApplicants.$inferSelect;
export type InsertClientPortalApplicant = typeof clientPortalApplicants.$inferInsert;

export const clientPortalSessions = mysqlTable("client_portal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  portalUserId: int("portalUserId").notNull(),
  refreshTokenHash: varchar("refreshTokenHash", { length: 255 }).notNull(),
  deviceName: varchar("deviceName", { length: 255 }),
  platform: varchar("platform", { length: 50 }),
  osVersion: varchar("osVersion", { length: 100 }),
  appVersion: varchar("appVersion", { length: 50 }),
  pushToken: varchar("pushToken", { length: 512 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  expiresAt: timestamp("expiresAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClientPortalSession = typeof clientPortalSessions.$inferSelect;
export type InsertClientPortalSession = typeof clientPortalSessions.$inferInsert;

// CRM employees reuse their existing `users` identity and password hash, but
// receive an isolated mobile session that can never authenticate client-owned
// portal routes or the employee web tRPC API.
export const clientEmployeeSessions = mysqlTable("client_employee_sessions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  staffUserId: int("staffUserId").notNull(),
  refreshTokenHash: varchar("refreshTokenHash", { length: 255 }).notNull(),
  deviceName: varchar("deviceName", { length: 255 }),
  platform: varchar("platform", { length: 50 }),
  osVersion: varchar("osVersion", { length: 100 }),
  appVersion: varchar("appVersion", { length: 50 }),
  pushToken: varchar("pushToken", { length: 512 }),
  locale: mysqlEnum("locale", ["en", "ar"]).default("en").notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  expiresAt: timestamp("expiresAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  activeStaffSession: index("client_employee_sessions_staff_active_idx").on(table.staffUserId, table.revokedAt, table.expiresAt),
}));
export type ClientEmployeeSession = typeof clientEmployeeSessions.$inferSelect;
export type InsertClientEmployeeSession = typeof clientEmployeeSessions.$inferInsert;

export const clientPortalDocuments = mysqlTable("client_portal_documents", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  portalApplicationId: int("portalApplicationId").notNull(),
  applicantId: int("applicantId"),
  clientDocumentId: int("clientDocumentId"),
  documentType: varchar("documentType", { length: 128 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: int("fileSize").notNull(),
  source: mysqlEnum("source", ["client_upload", "client_scan", "staff"]).notNull(),
  visibleToClient: boolean("visibleToClient").default(true).notNull(),
  reviewStatus: mysqlEnum("reviewStatus", ["submitted", "under_review", "accepted", "replacement_required"]).default("submitted").notNull(),
  clientComment: text("clientComment"),
  staffComment: text("staffComment"),
  uploadedByPortalUserId: int("uploadedByPortalUserId"),
  uploadedByStaffUserId: int("uploadedByStaffUserId"),
  sourceChatMessageId: int("sourceChatMessageId"),
  sourceChatAttachmentId: int("sourceChatAttachmentId"),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientPortalDocument = typeof clientPortalDocuments.$inferSelect;
export type InsertClientPortalDocument = typeof clientPortalDocuments.$inferInsert;

export const clientPortalMessages = mysqlTable("client_portal_messages", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  portalApplicationId: int("portalApplicationId").notNull(),
  senderType: mysqlEnum("senderType", ["client", "staff"]).notNull(),
  senderPortalUserId: int("senderPortalUserId"),
  senderStaffUserId: int("senderStaffUserId"),
  visibility: mysqlEnum("visibility", ["internal", "client"]).default("client").notNull(),
  body: text("body").notNull(),
  attachmentDocumentId: int("attachmentDocumentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClientPortalMessage = typeof clientPortalMessages.$inferSelect;
export type InsertClientPortalMessage = typeof clientPortalMessages.$inferInsert;

// ─── Unified ELEVAY Client Chat ───────────────────────────────────────────────
// One canonical conversation per Client Documentation folder. This subsystem is
// independent from the WhatsApp module and is shared by staff, Client Portal,
// and mobile clients through the same authorization service.
export const clientChatConversations = mysqlTable("client_chat_conversations", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  clientCaseId: int("clientCaseId").notNull(),
  primaryPortalApplicationId: int("primaryPortalApplicationId"),
  status: mysqlEnum("status", ["active", "archived", "blocked"]).default("active").notNull(),
  assignedStaffUserId: int("assignedStaffUserId"),
  waitingOn: mysqlEnum("waitingOn", ["none", "client", "staff"]).default("none").notNull(),
  retentionPolicy: mysqlEnum("retentionPolicy", ["indefinite"]).default("indefinite").notNull(),
  legalHoldAt: bigint("legalHoldAt", { mode: "number" }),
  legalHoldReason: varchar("legalHoldReason", { length: 500 }),
  legalHoldByStaffUserId: int("legalHoldByStaffUserId"),
  lastMessageId: int("lastMessageId"),
  lastMessageAt: bigint("lastMessageAt", { mode: "number" }),
  lastClientMessageAt: bigint("lastClientMessageAt", { mode: "number" }),
  lastStaffMessageAt: bigint("lastStaffMessageAt", { mode: "number" }),
  createdByStaffUserId: int("createdByStaffUserId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueClientCase: uniqueIndex("client_chat_conversations_case_unique").on(table.clientCaseId),
  statusActivity: index("client_chat_conversations_status_activity_idx").on(table.status, table.lastMessageAt),
  assignedActivity: index("client_chat_conversations_assigned_activity_idx").on(table.assignedStaffUserId, table.lastMessageAt),
}));
export type ClientChatConversation = typeof clientChatConversations.$inferSelect;
export type InsertClientChatConversation = typeof clientChatConversations.$inferInsert;

export const clientChatParticipants = mysqlTable("client_chat_participants", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  conversationId: int("conversationId").notNull(),
  participantType: mysqlEnum("participantType", ["staff", "portal"]).notNull(),
  staffUserId: int("staffUserId"),
  portalUserId: int("portalUserId"),
  role: mysqlEnum("role", ["client", "consultant", "paralegal", "manager", "admin", "observer"]).notNull(),
  status: mysqlEnum("status", ["active", "left", "revoked", "blocked"]).default("active").notNull(),
  canSend: boolean("canSend").default(true).notNull(),
  canViewInternal: boolean("canViewInternal").default(false).notNull(),
  canManage: boolean("canManage").default(false).notNull(),
  notificationPreferences: json("notificationPreferences"),
  muteUntil: bigint("muteUntil", { mode: "number" }),
  lastReadMessageId: int("lastReadMessageId"),
  clearedThroughMessageId: int("clearedThroughMessageId"),
  lastSeenAt: bigint("lastSeenAt", { mode: "number" }),
  typingExpiresAt: bigint("typingExpiresAt", { mode: "number" }),
  joinedAt: bigint("joinedAt", { mode: "number" }).notNull(),
  leftAt: bigint("leftAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueStaffParticipant: uniqueIndex("client_chat_participants_staff_unique").on(table.conversationId, table.staffUserId),
  uniquePortalParticipant: uniqueIndex("client_chat_participants_portal_unique").on(table.conversationId, table.portalUserId),
  activeConversation: index("client_chat_participants_active_idx").on(table.conversationId, table.status),
  staffLookup: index("client_chat_participants_staff_idx").on(table.staffUserId, table.status),
  portalLookup: index("client_chat_participants_portal_idx").on(table.portalUserId, table.status),
}));
export type ClientChatParticipant = typeof clientChatParticipants.$inferSelect;
export type InsertClientChatParticipant = typeof clientChatParticipants.$inferInsert;

export const clientChatMessages = mysqlTable("client_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  conversationId: int("conversationId").notNull(),
  clientMessageId: varchar("clientMessageId", { length: 64 }).notNull(),
  legacyPortalMessageId: int("legacyPortalMessageId"),
  senderParticipantId: int("senderParticipantId"),
  senderType: mysqlEnum("senderType", ["client", "staff", "system"]).notNull(),
  senderNameSnapshot: varchar("senderNameSnapshot", { length: 255 }).notNull(),
  visibility: mysqlEnum("visibility", ["client", "internal"]).default("client").notNull(),
  messageType: mysqlEnum("messageType", ["text", "image", "video", "file", "voice", "audio", "system"]).default("text").notNull(),
  body: text("body"),
  replyToMessageId: int("replyToMessageId"),
  isImportant: boolean("isImportant").default(false).notNull(),
  isPinned: boolean("isPinned").default(false).notNull(),
  editedAt: bigint("editedAt", { mode: "number" }),
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByParticipantId: int("deletedByParticipantId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueClientMessage: uniqueIndex("client_chat_messages_client_id_unique").on(table.clientMessageId),
  uniqueLegacyPortal: uniqueIndex("client_chat_messages_legacy_portal_unique").on(table.legacyPortalMessageId),
  conversationCursor: index("client_chat_messages_conversation_cursor_idx").on(table.conversationId, table.id),
  conversationCreated: index("client_chat_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  replyLookup: index("client_chat_messages_reply_idx").on(table.replyToMessageId),
}));
export type ClientChatMessage = typeof clientChatMessages.$inferSelect;
export type InsertClientChatMessage = typeof clientChatMessages.$inferInsert;

export const clientChatMessageVersions = mysqlTable("client_chat_message_versions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  body: text("body"),
  editedByParticipantId: int("editedByParticipantId"),
  editReason: varchar("editReason", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueVersion: uniqueIndex("client_chat_message_versions_unique").on(table.messageId, table.versionNumber),
  messageLookup: index("client_chat_message_versions_message_idx").on(table.messageId, table.createdAt),
}));
export type ClientChatMessageVersion = typeof clientChatMessageVersions.$inferSelect;
export type InsertClientChatMessageVersion = typeof clientChatMessageVersions.$inferInsert;

export const clientChatMessageMentions = mysqlTable("client_chat_message_mentions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  participantId: int("participantId").notNull(),
  notifiedAt: bigint("notifiedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueMention: uniqueIndex("client_chat_message_mentions_unique").on(table.messageId, table.participantId),
  participantLookup: index("client_chat_message_mentions_participant_idx").on(table.participantId, table.createdAt),
}));
export type ClientChatMessageMention = typeof clientChatMessageMentions.$inferSelect;
export type InsertClientChatMessageMention = typeof clientChatMessageMentions.$inferInsert;

export const clientChatMessageStars = mysqlTable("client_chat_message_stars", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  participantId: int("participantId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueStar: uniqueIndex("client_chat_message_stars_unique").on(table.messageId, table.participantId),
  participantLookup: index("client_chat_message_stars_participant_idx").on(table.participantId, table.createdAt),
}));
export type ClientChatMessageStar = typeof clientChatMessageStars.$inferSelect;
export type InsertClientChatMessageStar = typeof clientChatMessageStars.$inferInsert;

export const clientChatMessageReceipts = mysqlTable("client_chat_message_receipts", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  participantId: int("participantId").notNull(),
  deliveredAt: bigint("deliveredAt", { mode: "number" }),
  readAt: bigint("readAt", { mode: "number" }),
  listenedAt: bigint("listenedAt", { mode: "number" }),
  deviceName: varchar("deviceName", { length: 255 }),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueMessageParticipant: uniqueIndex("client_chat_receipts_message_participant_unique").on(table.messageId, table.participantId),
  participantUnread: index("client_chat_receipts_participant_read_idx").on(table.participantId, table.readAt),
}));
export type ClientChatMessageReceipt = typeof clientChatMessageReceipts.$inferSelect;
export type InsertClientChatMessageReceipt = typeof clientChatMessageReceipts.$inferInsert;

export const clientChatReactions = mysqlTable("client_chat_reactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  participantId: int("participantId").notNull(),
  reaction: varchar("reaction", { length: 32 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueReaction: uniqueIndex("client_chat_reactions_unique").on(table.messageId, table.participantId, table.reaction),
  messageLookup: index("client_chat_reactions_message_idx").on(table.messageId),
}));
export type ClientChatReaction = typeof clientChatReactions.$inferSelect;
export type InsertClientChatReaction = typeof clientChatReactions.$inferInsert;

export const clientChatAttachments = mysqlTable("client_chat_attachments", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  messageId: int("messageId").notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  originalFileName: varchar("originalFileName", { length: 255 }).notNull(),
  safeFileName: varchar("safeFileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: int("fileSize").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  width: int("width"),
  height: int("height"),
  durationMs: int("durationMs"),
  waveform: json("waveform"),
  scanStatus: mysqlEnum("scanStatus", ["pending", "clean", "rejected", "failed"]).default("pending").notNull(),
  transcriptStatus: mysqlEnum("transcriptStatus", ["not_applicable", "pending", "complete", "failed"]).default("not_applicable").notNull(),
  transcriptOriginal: text("transcriptOriginal"),
  transcriptArabic: text("transcriptArabic"),
  transcriptEnglish: text("transcriptEnglish"),
  savedClientDocumentId: int("savedClientDocumentId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueMessageFile: uniqueIndex("client_chat_attachments_message_hash_unique").on(table.messageId, table.sha256),
  messageLookup: index("client_chat_attachments_message_idx").on(table.messageId),
  scanLookup: index("client_chat_attachments_scan_idx").on(table.scanStatus, table.createdAt),
}));
export type ClientChatAttachment = typeof clientChatAttachments.$inferSelect;
export type InsertClientChatAttachment = typeof clientChatAttachments.$inferInsert;

export const clientChatHiddenMessages = mysqlTable("client_chat_hidden_messages", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  participantId: int("participantId").notNull(),
  hiddenAt: bigint("hiddenAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueHiddenMessage: uniqueIndex("client_chat_hidden_message_unique").on(table.messageId, table.participantId),
}));
export type ClientChatHiddenMessage = typeof clientChatHiddenMessages.$inferSelect;
export type InsertClientChatHiddenMessage = typeof clientChatHiddenMessages.$inferInsert;

export const clientChatDrafts = mysqlTable("client_chat_drafts", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  participantId: int("participantId").notNull(),
  body: text("body"),
  replyToMessageId: int("replyToMessageId"),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  uniqueParticipantDraft: uniqueIndex("client_chat_drafts_participant_unique").on(table.conversationId, table.participantId),
}));
export type ClientChatDraft = typeof clientChatDrafts.$inferSelect;
export type InsertClientChatDraft = typeof clientChatDrafts.$inferInsert;

export const clientChatScheduledMessages = mysqlTable("client_chat_scheduled_messages", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  conversationId: int("conversationId").notNull(),
  senderParticipantId: int("senderParticipantId").notNull(),
  body: text("body").notNull(),
  visibility: mysqlEnum("visibility", ["client", "internal"]).default("client").notNull(),
  scheduledFor: bigint("scheduledFor", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["scheduled", "sending", "sent", "cancelled", "failed"]).default("scheduled").notNull(),
  heartbeatTaskUid: varchar("heartbeatTaskUid", { length: 65 }),
  sentMessageId: int("sentMessageId"),
  failureReason: varchar("failureReason", { length: 500 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  dueStatus: index("client_chat_scheduled_due_idx").on(table.status, table.scheduledFor),
  taskLookup: uniqueIndex("client_chat_scheduled_task_uid_unique").on(table.heartbeatTaskUid),
}));
export type ClientChatScheduledMessage = typeof clientChatScheduledMessages.$inferSelect;
export type InsertClientChatScheduledMessage = typeof clientChatScheduledMessages.$inferInsert;

export const clientChatMessageReports = mysqlTable("client_chat_message_reports", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  messageId: int("messageId").notNull(),
  reporterParticipantId: int("reporterParticipantId").notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  status: mysqlEnum("status", ["open", "reviewed", "dismissed", "actioned"]).default("open").notNull(),
  reviewedByStaffUserId: int("reviewedByStaffUserId"),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  reporterLookup: index("client_chat_reports_reporter_idx").on(table.reporterParticipantId, table.status),
  messageLookup: index("client_chat_reports_message_idx").on(table.messageId),
}));
export type ClientChatMessageReport = typeof clientChatMessageReports.$inferSelect;
export type InsertClientChatMessageReport = typeof clientChatMessageReports.$inferInsert;

export const clientChatAuditEvents = mysqlTable("client_chat_audit_events", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  conversationId: int("conversationId"),
  messageId: int("messageId"),
  actorStaffUserId: int("actorStaffUserId"),
  actorPortalUserId: int("actorPortalUserId"),
  action: varchar("action", { length: 100 }).notNull(),
  outcome: mysqlEnum("outcome", ["success", "denied", "failure"]).default("success").notNull(),
  metadata: json("metadata"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  conversationTime: index("client_chat_audit_conversation_idx").on(table.conversationId, table.createdAt),
  actionTime: index("client_chat_audit_action_idx").on(table.action, table.createdAt),
}));
export type ClientChatAuditEvent = typeof clientChatAuditEvents.$inferSelect;
export type InsertClientChatAuditEvent = typeof clientChatAuditEvents.$inferInsert;

export const clientChatEvents = mysqlTable("client_chat_events", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  eventType: mysqlEnum("eventType", [
    "message_created",
    "message_edited",
    "message_deleted",
    "reaction_changed",
    "receipt_changed",
    "typing_changed",
    "presence_changed",
    "attachment_changed",
    "participant_changed",
    "conversation_changed",
  ]).notNull(),
  entityId: int("entityId"),
  actorParticipantId: int("actorParticipantId"),
  metadata: json("metadata"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  conversationCursor: index("client_chat_events_conversation_cursor_idx").on(table.conversationId, table.id),
  conversationTime: index("client_chat_events_conversation_time_idx").on(table.conversationId, table.createdAt),
}));
export type ClientChatEvent = typeof clientChatEvents.$inferSelect;
export type InsertClientChatEvent = typeof clientChatEvents.$inferInsert;

export const clientPortalNotifications = mysqlTable("client_portal_notifications", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  portalUserId: int("portalUserId").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 191 }).unique(),
  type: varchar("type", { length: 64 }).notNull(),
  titleEn: varchar("titleEn", { length: 255 }).notNull(),
  titleAr: varchar("titleAr", { length: 255 }).notNull(),
  bodyEn: text("bodyEn").notNull(),
  bodyAr: text("bodyAr").notNull(),
  entityType: varchar("entityType", { length: 64 }),
  entityPublicId: varchar("entityPublicId", { length: 36 }),
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type ClientPortalNotification = typeof clientPortalNotifications.$inferSelect;
export type InsertClientPortalNotification = typeof clientPortalNotifications.$inferInsert;

export const clientPortalAuditLogs = mysqlTable("client_portal_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  portalUserId: int("portalUserId"),
  clientCaseId: int("clientCaseId"),
  action: varchar("action", { length: 100 }).notNull(),
  recordType: varchar("recordType", { length: 100 }),
  recordPublicId: varchar("recordPublicId", { length: 64 }),
  outcome: mysqlEnum("outcome", ["success", "denied", "failure"]).default("success").notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  deviceName: varchar("deviceName", { length: 255 }),
  osVersion: varchar("osVersion", { length: 100 }),
  appVersion: varchar("appVersion", { length: 50 }),
  correlationId: varchar("correlationId", { length: 64 }),
  details: text("details"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type ClientPortalAuditLog = typeof clientPortalAuditLogs.$inferSelect;
export type InsertClientPortalAuditLog = typeof clientPortalAuditLogs.$inferInsert;

export const clientPortalDeliveryOutbox = mysqlTable("client_portal_delivery_outbox", {
  id: int("id").autoincrement().primaryKey(),
  idempotencyKey: varchar("idempotencyKey", { length: 191 }).unique(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  channel: mysqlEnum("channel", ["email", "push", "crm_notification"]).notNull(),
  recipient: varchar("recipient", { length: 512 }).notNull(),
  payload: json("payload").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const clientApplicationActivities = mysqlTable("client_application_activities", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  clientCaseId: int("clientCaseId").notNull(),
  actorType: mysqlEnum("actorType", ["staff", "client", "system"]).notNull(),
  actorStaffUserId: int("actorStaffUserId"),
  actorPortalUserId: int("actorPortalUserId"),
  actorName: varchar("actorName", { length: 255 }).notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  titleEn: varchar("titleEn", { length: 255 }).notNull(),
  titleAr: varchar("titleAr", { length: 255 }).notNull(),
  bodyEn: text("bodyEn").notNull(),
  bodyAr: text("bodyAr").notNull(),
  entityType: varchar("entityType", { length: 64 }),
  entityPublicId: varchar("entityPublicId", { length: 64 }),
  metadata: json("metadata"),
  visibleToClient: boolean("visibleToClient").default(true).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull().unique(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClientApplicationActivity = typeof clientApplicationActivities.$inferSelect;
export type InsertClientApplicationActivity = typeof clientApplicationActivities.$inferInsert;

export const clientReminderDeliveries = mysqlTable("client_reminder_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull().unique(),
  clientCaseId: int("clientCaseId").notNull(),
  portalUserId: int("portalUserId").notNull(),
  ruleKey: varchar("ruleKey", { length: 80 }).notNull(),
  scheduledFor: timestamp("scheduledFor").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "skipped", "failed"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const clientReminderSettings = mysqlTable("client_reminder_settings", {
  id: int("id").primaryKey(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Public Program & Service Provider Content ────────────────────────────────
export const publicPrograms = mysqlTable("public_programs", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  category: mysqlEnum("category", ["residency", "citizenship"]).notNull(),
  nameEn: varchar("nameEn", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  country: varchar("country", { length: 128 }).notNull(),
  summaryEn: text("summaryEn"),
  summaryAr: text("summaryAr"),
  details: json("details"),
  imageUrl: varchar("imageUrl", { length: 1024 }),
  sourceUrl: varchar("sourceUrl", { length: 1024 }).notNull(),
  sourceHash: varchar("sourceHash", { length: 64 }),
  isOverridden: boolean("isOverridden").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  displayOrder: int("displayOrder").default(0).notNull(),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PublicProgram = typeof publicPrograms.$inferSelect;
export type InsertPublicProgram = typeof publicPrograms.$inferInsert;

export const publicServiceProviders = mysqlTable("public_service_providers", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  providerType: mysqlEnum("providerType", ["lawyer", "accountant", "service_facilitator"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  country: varchar("country", { length: 128 }).notNull(),
  city: varchar("city", { length: 128 }),
  logoUrl: varchar("logoUrl", { length: 1024 }),
  coverImageKey: varchar("coverImageKey", { length: 1024 }),
  coverImageUrl: varchar("coverImageUrl", { length: 1024 }),
  description: text("description"),
  services: json("services"),
  price: decimal("price", { precision: 14, scale: 2 }),
  currency: varchar("currency", { length: 10 }),
  phone: varchar("phone", { length: 64 }),
  whatsapp: varchar("whatsapp", { length: 64 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 1024 }),
  languages: json("languages"),
  availability: varchar("availability", { length: 255 }),
  displayOrder: int("displayOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PublicServiceProvider = typeof publicServiceProviders.$inferSelect;
export type InsertPublicServiceProvider = typeof publicServiceProviders.$inferInsert;

export const publicAfterSettlementServices = mysqlTable("public_after_settlement_services", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  category: mysqlEnum("category", ["housing", "banking", "insurance", "tax", "legal", "education", "healthcare", "utilities", "relocation", "other"]).default("other").notNull(),
  titleEn: varchar("titleEn", { length: 255 }).notNull(),
  titleAr: varchar("titleAr", { length: 255 }),
  descriptionEn: text("descriptionEn"),
  descriptionAr: text("descriptionAr"),
  providerId: int("providerId"),
  actionLabelEn: varchar("actionLabelEn", { length: 120 }),
  actionLabelAr: varchar("actionLabelAr", { length: 120 }),
  actionType: mysqlEnum("actionType", ["phone", "whatsapp", "email", "website", "none"]).default("none").notNull(),
  actionValue: varchar("actionValue", { length: 1024 }),
  displayOrder: int("displayOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  activeDisplayOrder: index("public_after_settlement_services_active_order_idx").on(table.isActive, table.displayOrder),
  provider: index("public_after_settlement_services_provider_idx").on(table.providerId),
}));
export type PublicAfterSettlementService = typeof publicAfterSettlementServices.$inferSelect;
export type InsertPublicAfterSettlementService = typeof publicAfterSettlementServices.$inferInsert;

export const publicContentSyncRuns = mysqlTable("public_content_sync_runs", {
  id: int("id").autoincrement().primaryKey(),
  triggerType: mysqlEnum("triggerType", ["scheduled", "manual"]).notNull(),
  status: mysqlEnum("status", ["running", "success", "failed"]).notNull(),
  programsFound: int("programsFound").default(0).notNull(),
  programsCreated: int("programsCreated").default(0).notNull(),
  programsUpdated: int("programsUpdated").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type PublicContentSyncRun = typeof publicContentSyncRuns.$inferSelect;

export const publicContentSyncSettings = mysqlTable("public_content_sync_settings", {
  id: int("id").autoincrement().primaryKey(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastSuccessfulAt: timestamp("lastSuccessfulAt"),
  lastAttemptAt: timestamp("lastAttemptAt"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── ELEVAY Client public News ────────────────────────────────────────────────
export const publicNewsArticles = mysqlTable("public_news_articles", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  canonicalUrlHash: varchar("canonicalUrlHash", { length: 64 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  sourceName: varchar("sourceName", { length: 255 }),
  sourceMailbox: varchar("sourceMailbox", { length: 320 }).notNull(),
  sourceMessageId: varchar("sourceMessageId", { length: 255 }).notNull(),
  digestReceivedAt: timestamp("digestReceivedAt").notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  canonicalUrl: uniqueIndex("public_news_articles_canonical_url_hash_uq").on(table.canonicalUrlHash),
  newestFirst: index("public_news_articles_newest_idx").on(table.digestReceivedAt, table.id),
}));
export type PublicNewsArticle = typeof publicNewsArticles.$inferSelect;
export type InsertPublicNewsArticle = typeof publicNewsArticles.$inferInsert;

export const newsDigestImports = mysqlTable("news_digest_imports", {
  id: int("id").autoincrement().primaryKey(),
  sourceMessageId: varchar("sourceMessageId", { length: 255 }).notNull(),
  sourceMailbox: varchar("sourceMailbox", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  receivedAt: timestamp("receivedAt").notNull(),
  status: mysqlEnum("status", ["processing", "success", "failed"]).default("processing").notNull(),
  articlesFound: int("articlesFound").default(0).notNull(),
  articlesInserted: int("articlesInserted").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  message: uniqueIndex("news_digest_imports_message_uq").on(table.sourceMailbox, table.sourceMessageId),
  statusDate: index("news_digest_imports_status_date_idx").on(table.status, table.startedAt),
}));
export type NewsDigestImport = typeof newsDigestImports.$inferSelect;

export const newsDigestSettings = mysqlTable("news_digest_settings", {
  id: int("id").primaryKey(),
  sourceMailbox: varchar("sourceMailbox", { length: 320 }).default("mahmoud.saberelevay@gmail.com").notNull(),
  subjectTrigger: varchar("subjectTrigger", { length: 255 }).default("Daily Digest").notNull(),
  gmailRefreshTokenEncrypted: text("gmailRefreshTokenEncrypted"),
  gmailConnectedEmail: varchar("gmailConnectedEmail", { length: 320 }),
  gmailConnectedAt: timestamp("gmailConnectedAt"),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  maxArticles: int("maxArticles").default(200).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  lastSuccessfulAt: timestamp("lastSuccessfulAt"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const publicNewsPushSubscriptions = mysqlTable("public_news_push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 36 }).notNull().unique(),
  pushToken: varchar("pushToken", { length: 255 }).notNull(),
  locale: mysqlEnum("locale", ["en", "ar"]).default("en").notNull(),
  platform: varchar("platform", { length: 32 }),
  appVersion: varchar("appVersion", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  token: uniqueIndex("public_news_push_subscriptions_token_uq").on(table.pushToken),
  activeSeen: index("public_news_push_subscriptions_active_seen_idx").on(table.isActive, table.lastSeenAt),
}));
export type PublicNewsPushSubscription = typeof publicNewsPushSubscriptions.$inferSelect;
export const laylaConversations = mysqlTable("layla_conversations", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique(),
  locale: mysqlEnum("locale", ["en", "ar"]).default("en").notNull(),
  goal: varchar("goal", { length: 32 }),
  budget: varchar("budget", { length: 32 }),
  familySize: int("familySize"),
  employmentStatus: varchar("employmentStatus", { length: 120 }),
  destinationPreference: varchar("destinationPreference", { length: 120 }),
  contactName: varchar("contactName", { length: 80 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  timezone: varchar("timezone", { length: 80 }),
  leadScore: mysqlEnum("leadScore", ["hot", "warm", "cold"]).default("cold").notNull(),
  messages: mediumtext("messages").notNull(),
  handedOff: boolean("handedOff").default(false).notNull(),
  notified: boolean("notified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  scoreUpdated: index("layla_conversations_score_updated_idx").on(table.leadScore, table.updatedAt),
}));
export type LaylaConversation = typeof laylaConversations.$inferSelect;
export type InsertLaylaConversation = typeof laylaConversations.$inferInsert;
// ─── LEADS REPORT PRESETS ─────────────────────────────────────────────────────
// Shared filter presets for the Leads Reporting page — visible to all users
export const leadsReportPresets = mysqlTable("leads_report_presets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // JSON-encoded filter object: { activityTypes: string[], userId?: number, datePreset?: string }
  filterJson: text("filterJson").notNull(),
  createdByEmail: varchar("createdByEmail", { length: 320 }),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type LeadsReportPreset = typeof leadsReportPresets.$inferSelect;
export type InsertLeadsReportPreset = typeof leadsReportPresets.$inferInsert;

// ─── MARKETING SUMMARIES ──────────────────────────────────────────────────────
export const marketingSummaries = mysqlTable("marketing_summaries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  programType: varchar("programType", { length: 100 }).notNull(),
  programSubtype: varchar("programSubtype", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  documentJson: text("documentJson").notNull(),
  colorsJson: text("colorsJson"),
  typographyJson: text("typographyJson"),
  lastUpdated: varchar("lastUpdated", { length: 20 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type MarketingSummary = typeof marketingSummaries.$inferSelect;
export type InsertMarketingSummary = typeof marketingSummaries.$inferInsert;

// ─── AGENTIC MARKETING SYSTEM / BRAND STUDIO ───────────────────────────────────
// These records are deliberately separate from legacy marketing plans and summaries.
// No provider secrets, lead PII, or client documents are stored in this subsystem.
export const marketingSystemRoleAssignments = mysqlTable("marketing_system_role_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: varchar("role", { length: 48 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  assignedByUserId: int("assignedByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_system_role_user_unique").on(table.userId),
  index("marketing_system_role_active_role_idx").on(table.isActive, table.role),
]);
export type MarketingSystemRoleAssignment = typeof marketingSystemRoleAssignments.$inferSelect;
export type InsertMarketingSystemRoleAssignment = typeof marketingSystemRoleAssignments.$inferInsert;

// Provider profiles keep aliases, model versions, readiness and kill-switch state only.
// Authentication material remains server-side in the configured provider integration.
export const marketingProviderProfiles = mysqlTable("marketing_provider_profiles", {
  id: int("id").autoincrement().primaryKey(),
  alias: varchar("alias", { length: 96 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  modelId: varchar("modelId", { length: 160 }),
  purpose: varchar("purpose", { length: 160 }).notNull(),
  status: varchar("status", { length: 32 }).default("not_configured").notNull(),
  isEnabled: boolean("isEnabled").default(false).notNull(),
  killSwitchEnabled: boolean("killSwitchEnabled").default(true).notNull(),
  configuredByUserId: int("configuredByUserId"),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_provider_alias_unique").on(table.alias),
  index("marketing_provider_status_idx").on(table.status, table.isEnabled),
]);
export type MarketingProviderProfile = typeof marketingProviderProfiles.$inferSelect;
export type InsertMarketingProviderProfile = typeof marketingProviderProfiles.$inferInsert;

export const marketingBrandDiscoverySessions = mysqlTable("marketing_brand_discovery_sessions", {
  id: int("id").autoincrement().primaryKey(),
  version: int("version").notNull(),
  status: varchar("status", { length: 32 }).default("in_progress").notNull(),
  resetScope: varchar("resetScope", { length: 96 }),
  currentQuestionNumber: int("currentQuestionNumber").default(1).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  proposedAt: bigint("proposedAt", { mode: "number" }),
  approvedAt: bigint("approvedAt", { mode: "number" }),
  approvedByUserId: int("approvedByUserId"),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_brand_session_version_unique").on(table.version),
  index("marketing_brand_session_status_idx").on(table.status, table.updatedAt),
]);
export type MarketingBrandDiscoverySession = typeof marketingBrandDiscoverySessions.$inferSelect;
export type InsertMarketingBrandDiscoverySession = typeof marketingBrandDiscoverySessions.$inferInsert;

export const marketingBrandDiscoveryAnswers = mysqlTable("marketing_brand_discovery_answers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  questionNumber: int("questionNumber").notNull(),
  answerText: mediumtext("answerText").notNull(),
  interpretedJson: mediumtext("interpretedJson"),
  attachmentsJson: mediumtext("attachmentsJson"),
  decisionStatus: varchar("decisionStatus", { length: 32 }).default("answered").notNull(),
  answeredByUserId: int("answeredByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_brand_answer_session_question_unique").on(table.sessionId, table.questionNumber),
  index("marketing_brand_answer_session_idx").on(table.sessionId, table.questionNumber),
]);
export type MarketingBrandDiscoveryAnswer = typeof marketingBrandDiscoveryAnswers.$inferSelect;
export type InsertMarketingBrandDiscoveryAnswer = typeof marketingBrandDiscoveryAnswers.$inferInsert;

// A Brand Book becomes immutable after approval. New material must create a new version.
export const marketingBrandBooks = mysqlTable("marketing_brand_books", {
  id: int("id").autoincrement().primaryKey(),
  version: int("version").notNull(),
  sessionId: int("sessionId").notNull(),
  status: varchar("status", { length: 32 }).default("proposed").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  brandPayloadJson: mediumtext("brandPayloadJson").notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  approvedByUserId: int("approvedByUserId"),
  approvedAt: bigint("approvedAt", { mode: "number" }),
  activatedAt: bigint("activatedAt", { mode: "number" }),
  supersededAt: bigint("supersededAt", { mode: "number" }),
}, table => [
  uniqueIndex("marketing_brand_book_version_unique").on(table.version),
  uniqueIndex("marketing_brand_book_session_unique").on(table.sessionId),
  index("marketing_brand_book_status_idx").on(table.status, table.activatedAt),
]);
export type MarketingBrandBook = typeof marketingBrandBooks.$inferSelect;
export type InsertMarketingBrandBook = typeof marketingBrandBooks.$inferInsert;

// ─── AGENTIC MARKETING SYSTEM / OFFICIAL KNOWLEDGE LIBRARY ────────────────────
// Sources and claims stay separate from program summaries. Nothing in these tables
// is publishable until an explicit owner review; no client or Lead data belongs here.
export const marketingKnowledgeSources = mysqlTable("marketing_knowledge_sources", {
  id: int("id").autoincrement().primaryKey(),
  programKey: varchar("programKey", { length: 96 }).notNull(),
  programLabel: varchar("programLabel", { length: 160 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  authorityName: varchar("authorityName", { length: 255 }).notNull(),
  sourceType: varchar("sourceType", { length: 48 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 2_000 }).notNull(),
  sourceDomain: varchar("sourceDomain", { length: 255 }).notNull(),
  trustTier: int("trustTier").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull().default("candidate"),
  snapshotText: mediumtext("snapshotText"),
  snapshotHash: varchar("snapshotHash", { length: 64 }),
  snapshotRetrievedAt: bigint("snapshotRetrievedAt", { mode: "number" }),
  sourcePublishedAt: bigint("sourcePublishedAt", { mode: "number" }),
  sourceEffectiveAt: bigint("sourceEffectiveAt", { mode: "number" }),
  changeState: varchar("changeState", { length: 48 }).notNull().default("untracked"),
  changeSummary: text("changeSummary"),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_knowledge_source_url_unique").on(table.sourceUrl),
  index("marketing_knowledge_source_program_status_idx").on(table.programKey, table.status, table.updatedAt),
  index("marketing_knowledge_source_domain_idx").on(table.sourceDomain, table.status),
]);
export type MarketingKnowledgeSource = typeof marketingKnowledgeSources.$inferSelect;
export type InsertMarketingKnowledgeSource = typeof marketingKnowledgeSources.$inferInsert;

// Every claim references one approved source snapshot. A source change demotes the
// claim to needs_review; approved wording is never silently rewritten or republished.
export const marketingKnowledgeClaims = mysqlTable("marketing_knowledge_claims", {
  id: int("id").autoincrement().primaryKey(),
  programKey: varchar("programKey", { length: 96 }).notNull(),
  claimType: varchar("claimType", { length: 48 }).notNull(),
  claimText: mediumtext("claimText").notNull(),
  sourceId: int("sourceId").notNull(),
  sourceSnapshotHash: varchar("sourceSnapshotHash", { length: 64 }).notNull(),
  riskLevel: varchar("riskLevel", { length: 24 }).notNull().default("medium"),
  status: varchar("status", { length: 32 }).notNull().default("proposed"),
  reviewerNote: text("reviewerNote"),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  proposedByUserId: int("proposedByUserId").notNull(),
  proposedAt: bigint("proposedAt", { mode: "number" }).notNull(),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  retiredAt: bigint("retiredAt", { mode: "number" }),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  index("marketing_knowledge_claim_program_status_idx").on(table.programKey, table.status, table.updatedAt),
  index("marketing_knowledge_claim_source_idx").on(table.sourceId, table.status),
  uniqueIndex("marketing_knowledge_claim_content_hash_unique").on(table.contentHash),
]);
export type MarketingKnowledgeClaim = typeof marketingKnowledgeClaims.$inferSelect;
export type InsertMarketingKnowledgeClaim = typeof marketingKnowledgeClaims.$inferInsert;

// ─── AGENTIC MARKETING SYSTEM / CONTROLLED WORK ORDERS ───────────────────────
// Work orders coordinate internal planning only in Phase 3. They are intentionally
// separate from CRM records and cannot publish, contact clients, modify Meta/CAPI,
// reserve paid-media spend, or contain client/Lead identity data.
export const marketingWorkOrders = mysqlTable("marketing_work_orders", {
  id: int("id").autoincrement().primaryKey(),
  workOrderKey: varchar("workOrderKey", { length: 96 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  workType: varchar("workType", { length: 48 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  programKey: varchar("programKey", { length: 96 }),
  objective: varchar("objective", { length: 500 }).notNull(),
  brief: mediumtext("brief").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  requestedProviderAlias: varchar("requestedProviderAlias", { length: 96 }).notNull(),
  providerModelId: varchar("providerModelId", { length: 160 }),
  brandBookId: int("brandBookId"),
  brandBookVersion: int("brandBookVersion"),
  knowledgeClaimIdsJson: mediumtext("knowledgeClaimIdsJson").notNull(),
  inputArtifactIdsJson: mediumtext("inputArtifactIdsJson").notNull(),
  outputSchemaJson: mediumtext("outputSchemaJson").notNull(),
  allowedNextStatesJson: mediumtext("allowedNextStatesJson").notNull(),
  costCeilingUsd: decimal("costCeilingUsd", { precision: 12, scale: 2 }).notNull().default("0.00"),
  estimatedCostUsd: decimal("estimatedCostUsd", { precision: 12, scale: 2 }).notNull().default("0.00"),
  actualCostUsd: decimal("actualCostUsd", { precision: 12, scale: 2 }).notNull().default("0.00"),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  maxIterations: int("maxIterations").notNull().default(1),
  iterationCount: int("iterationCount").notNull().default(0),
  createdByUserId: int("createdByUserId").notNull(),
  submittedAt: bigint("submittedAt", { mode: "number" }),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  reviewNote: text("reviewNote"),
  lastDryRunAt: bigint("lastDryRunAt", { mode: "number" }),
  cancelledByUserId: int("cancelledByUserId"),
  cancelledAt: bigint("cancelledAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_work_order_key_unique").on(table.workOrderKey),
  uniqueIndex("marketing_work_order_idempotency_unique").on(table.idempotencyKey),
  index("marketing_work_order_status_updated_idx").on(table.status, table.updatedAt),
  index("marketing_work_order_creator_status_idx").on(table.createdByUserId, table.status, table.updatedAt),
  index("marketing_work_order_program_idx").on(table.programKey, table.updatedAt),
]);
export type MarketingWorkOrder = typeof marketingWorkOrders.$inferSelect;
export type InsertMarketingWorkOrder = typeof marketingWorkOrders.$inferInsert;

// Immutable artifacts carry only model-ready workflow metadata in this phase. A
// generated model response or media byte is deliberately not produced by Phase 3.
export const marketingWorkOrderArtifacts = mysqlTable("marketing_work_order_artifacts", {
  id: int("id").autoincrement().primaryKey(),
  workOrderId: int("workOrderId").notNull(),
  artifactType: varchar("artifactType", { length: 64 }).notNull(),
  state: varchar("state", { length: 32 }).notNull().default("dry_run"),
  label: varchar("label", { length: 300 }).notNull(),
  artifactPayloadJson: mediumtext("artifactPayloadJson").notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  providerAlias: varchar("providerAlias", { length: 96 }),
  providerModelId: varchar("providerModelId", { length: 160 }),
  promptTemplateVersion: varchar("promptTemplateVersion", { length: 64 }).notNull(),
  sourceClaimIdsJson: mediumtext("sourceClaimIdsJson").notNull(),
  sourceSnapshotHashesJson: mediumtext("sourceSnapshotHashesJson").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  estimatedCostUsd: decimal("estimatedCostUsd", { precision: 12, scale: 2 }).notNull().default("0.00"),
  actualCostUsd: decimal("actualCostUsd", { precision: 12, scale: 2 }).notNull().default("0.00"),
  errorSummary: text("errorSummary"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_work_order_artifact_hash_unique").on(table.contentHash),
  index("marketing_work_order_artifact_order_idx").on(table.workOrderId, table.createdAt),
  index("marketing_work_order_artifact_state_idx").on(table.state, table.createdAt),
]);
export type MarketingWorkOrderArtifact = typeof marketingWorkOrderArtifacts.$inferSelect;
export type InsertMarketingWorkOrderArtifact = typeof marketingWorkOrderArtifacts.$inferInsert;

// Append-only review and transition history provides human-inspectable lineage.
export const marketingWorkOrderEvents = mysqlTable("marketing_work_order_events", {
  id: int("id").autoincrement().primaryKey(),
  workOrderId: int("workOrderId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 32 }),
  toStatus: varchar("toStatus", { length: 32 }),
  reason: text("reason"),
  payloadJson: mediumtext("payloadJson").notNull(),
  actorUserId: int("actorUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [
  index("marketing_work_order_event_order_idx").on(table.workOrderId, table.createdAt),
  index("marketing_work_order_event_action_idx").on(table.action, table.createdAt),
]);
export type MarketingWorkOrderEvent = typeof marketingWorkOrderEvents.$inferSelect;
export type InsertMarketingWorkOrderEvent = typeof marketingWorkOrderEvents.$inferInsert;

// A ledger distinguishes a ceiling and estimate from actual spend. Phase 3 writes
// only caps, estimates and zero-cost dry-run entries; it never records provider spend.
export const marketingWorkOrderCostLedger = mysqlTable("marketing_work_order_cost_ledger", {
  id: int("id").autoincrement().primaryKey(),
  workOrderId: int("workOrderId").notNull(),
  entryKey: varchar("entryKey", { length: 128 }).notNull(),
  entryType: varchar("entryType", { length: 32 }).notNull(),
  amountUsd: decimal("amountUsd", { precision: 12, scale: 2 }).notNull().default("0.00"),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  providerAlias: varchar("providerAlias", { length: 96 }),
  note: text("note"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_work_order_cost_entry_unique").on(table.entryKey),
  index("marketing_work_order_cost_order_idx").on(table.workOrderId, table.createdAt),
  index("marketing_work_order_cost_type_idx").on(table.entryType, table.createdAt),
]);
export type MarketingWorkOrderCostLedgerEntry = typeof marketingWorkOrderCostLedger.$inferSelect;
export type InsertMarketingWorkOrderCostLedgerEntry = typeof marketingWorkOrderCostLedger.$inferInsert;

// ─── AGENTIC MARKETING SYSTEM / CONTENT STUDIO & APPROVAL INBOX ──────────────
// A packet is a human-authored/reviewed versioned content proposal. Phase 4 adds
// no model invocation, media rendering, publishing, campaign operation or spend.
// Personal data, client records and Lead records must never enter these tables.
export const marketingContentPackets = mysqlTable("marketing_content_packets", {
  id: int("id").autoincrement().primaryKey(),
  rootPacketKey: varchar("rootPacketKey", { length: 96 }).notNull(),
  versionNumber: int("versionNumber").notNull().default(1),
  previousPacketId: int("previousPacketId"),
  workOrderId: int("workOrderId").notNull(),
  workOrderKey: varchar("workOrderKey", { length: 96 }).notNull(),
  contentType: varchar("contentType", { length: 48 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  programKey: varchar("programKey", { length: 96 }).notNull(),
  platformJson: mediumtext("platformJson").notNull(),
  funnelStage: varchar("funnelStage", { length: 64 }).notNull(),
  audience: varchar("audience", { length: 500 }).notNull(),
  objective: varchar("objective", { length: 500 }).notNull(),
  arabicCopy: mediumtext("arabicCopy").notNull(),
  englishCopy: mediumtext("englishCopy"),
  caption: mediumtext("caption"),
  cta: varchar("cta", { length: 500 }).notNull(),
  landingDestination: varchar("landingDestination", { length: 2_000 }),
  scheduledFor: bigint("scheduledFor", { mode: "number" }),
  claimIdsJson: mediumtext("claimIdsJson").notNull(),
  sourceSnapshotHashesJson: mediumtext("sourceSnapshotHashesJson").notNull(),
  visualBrief: mediumtext("visualBrief"),
  payloadJson: mediumtext("payloadJson").notNull(),
  outputSchemaJson: mediumtext("outputSchemaJson").notNull(),
  previewUrl: varchar("previewUrl", { length: 2_000 }),
  previewHash: varchar("previewHash", { length: 64 }),
  qaResultsJson: mediumtext("qaResultsJson").notNull(),
  exceptionalClaim: boolean("exceptionalClaim").notNull().default(false),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  changeSummary: text("changeSummary"),
  blockedReason: text("blockedReason"),
  createdByUserId: int("createdByUserId").notNull(),
  lastEditedByUserId: int("lastEditedByUserId").notNull(),
  approvedByUserId: int("approvedByUserId"),
  approvedAt: bigint("approvedAt", { mode: "number" }),
  stoppedByUserId: int("stoppedByUserId"),
  stoppedAt: bigint("stoppedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_content_packet_root_version_unique").on(table.rootPacketKey, table.versionNumber),
  uniqueIndex("marketing_content_packet_content_hash_unique").on(table.contentHash),
  index("marketing_content_packet_status_updated_idx").on(table.status, table.updatedAt),
  index("marketing_content_packet_work_order_idx").on(table.workOrderId, table.updatedAt),
  index("marketing_content_packet_program_status_idx").on(table.programKey, table.status, table.updatedAt),
]);
export type MarketingContentPacket = typeof marketingContentPackets.$inferSelect;
export type InsertMarketingContentPacket = typeof marketingContentPackets.$inferInsert;

// Append-only review and decision history ensures human feedback and stop actions
// remain inspectable even when a new packet revision supersedes an earlier draft.
export const marketingContentReviewEvents = mysqlTable("marketing_content_review_events", {
  id: int("id").autoincrement().primaryKey(),
  packetId: int("packetId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 32 }),
  toStatus: varchar("toStatus", { length: 32 }),
  feedback: mediumtext("feedback"),
  annotationsJson: mediumtext("annotationsJson").notNull(),
  payloadJson: mediumtext("payloadJson").notNull(),
  actorUserId: int("actorUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [
  index("marketing_content_review_event_packet_idx").on(table.packetId, table.createdAt),
  index("marketing_content_review_event_action_idx").on(table.action, table.createdAt),
]);
export type MarketingContentReviewEvent = typeof marketingContentReviewEvents.$inferSelect;
export type InsertMarketingContentReviewEvent = typeof marketingContentReviewEvents.$inferInsert;

// Approval batches record an explicit owner decision for multiple fully reviewed
// routine packets; exceptional-claim packets cannot enter a bulk approval batch.
export const marketingContentApprovalBatches = mysqlTable("marketing_content_approval_batches", {
  id: int("id").autoincrement().primaryKey(),
  batchKey: varchar("batchKey", { length: 96 }).notNull(),
  packetIdsJson: mediumtext("packetIdsJson").notNull(),
  packetContentHashesJson: mediumtext("packetContentHashesJson").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("approved"),
  ownerNote: mediumtext("ownerNote").notNull(),
  approvedByUserId: int("approvedByUserId").notNull(),
  approvedAt: bigint("approvedAt", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_content_approval_batch_key_unique").on(table.batchKey),
  index("marketing_content_approval_batch_status_idx").on(table.status, table.approvedAt),
]);
export type MarketingContentApprovalBatch = typeof marketingContentApprovalBatches.$inferSelect;
export type InsertMarketingContentApprovalBatch = typeof marketingContentApprovalBatches.$inferInsert;

// ─── AGENTIC MARKETING SYSTEM / META ADS STRATEGY INTAKE ─────────────────────
// This is an owner-controlled planning interview only. It stores no Meta token,
// ad account credential, campaign object, media byte, payment instruction or spend.
export const marketingMetaAdsStrategySessions = mysqlTable("marketing_meta_ads_strategy_sessions", {
  id: int("id").autoincrement().primaryKey(),
  version: int("version").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("in_progress"),
  resetScope: varchar("resetScope", { length: 96 }),
  currentQuestionNumber: int("currentQuestionNumber").notNull().default(1),
  createdByUserId: int("createdByUserId").notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  proposedAt: bigint("proposedAt", { mode: "number" }),
  approvedAt: bigint("approvedAt", { mode: "number" }),
  approvedByUserId: int("approvedByUserId"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_meta_ads_strategy_session_version_unique").on(table.version),
  index("marketing_meta_ads_strategy_session_status_idx").on(table.status, table.updatedAt),
]);
export type MarketingMetaAdsStrategySession = typeof marketingMetaAdsStrategySessions.$inferSelect;
export type InsertMarketingMetaAdsStrategySession = typeof marketingMetaAdsStrategySessions.$inferInsert;

export const marketingMetaAdsStrategyAnswers = mysqlTable("marketing_meta_ads_strategy_answers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  questionNumber: int("questionNumber").notNull(),
  scopeType: varchar("scopeType", { length: 24 }).notNull().default("company"),
  programKey: varchar("programKey", { length: 96 }),
  answerText: mediumtext("answerText").notNull(),
  normalizedJson: mediumtext("normalizedJson"),
  attachmentsJson: mediumtext("attachmentsJson"),
  decisionStatus: varchar("decisionStatus", { length: 32 }).notNull().default("answered"),
  gapOwnerUserId: int("gapOwnerUserId"),
  gapDueAt: bigint("gapDueAt", { mode: "number" }),
  answeredByUserId: int("answeredByUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_meta_ads_strategy_answer_unique").on(table.sessionId, table.questionNumber, table.scopeType, table.programKey),
  index("marketing_meta_ads_strategy_answer_session_idx").on(table.sessionId, table.questionNumber),
  index("marketing_meta_ads_strategy_gap_idx").on(table.decisionStatus, table.gapDueAt),
]);
export type MarketingMetaAdsStrategyAnswer = typeof marketingMetaAdsStrategyAnswers.$inferSelect;
export type InsertMarketingMetaAdsStrategyAnswer = typeof marketingMetaAdsStrategyAnswers.$inferInsert;

// A strategy packet is a human-reviewed snapshot of a completed intake and approved
// Brand Book. It is deliberately not a Meta campaign, budget, ad account or payment record.
export const marketingMetaAdsStrategyApprovalPackets = mysqlTable("marketing_meta_ads_strategy_approval_packets", {
  id: int("id").autoincrement().primaryKey(),
  packetKey: varchar("packetKey", { length: 96 }).notNull(),
  version: int("version").notNull(),
  strategySessionId: int("strategySessionId").notNull(),
  brandBookId: int("brandBookId").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("proposed"),
  packetPayloadJson: mediumtext("packetPayloadJson").notNull(),
  packetHash: varchar("packetHash", { length: 64 }).notNull(),
  sourceAnswerHash: varchar("sourceAnswerHash", { length: 64 }).notNull(),
  ownerNote: mediumtext("ownerNote"),
  createdByUserId: int("createdByUserId").notNull(),
  proposedAt: bigint("proposedAt", { mode: "number" }).notNull(),
  decidedByUserId: int("decidedByUserId"),
  decidedAt: bigint("decidedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_meta_ads_strategy_packet_key_unique").on(table.packetKey),
  uniqueIndex("marketing_meta_ads_strategy_packet_version_unique").on(table.version),
  index("marketing_meta_ads_strategy_packet_session_idx").on(table.strategySessionId, table.status),
  index("marketing_meta_ads_strategy_packet_status_idx").on(table.status, table.updatedAt),
]);
export type MarketingMetaAdsStrategyApprovalPacket = typeof marketingMetaAdsStrategyApprovalPackets.$inferSelect;
export type InsertMarketingMetaAdsStrategyApprovalPacket = typeof marketingMetaAdsStrategyApprovalPackets.$inferInsert;

// A reviewed, internal-only measurement-pilot proposal. It is intentionally not a
// Meta campaign, account, audience, budget reservation, spend, payment or credential record.
export const marketingMetaCampaignPilotProposals = mysqlTable("marketing_meta_campaign_pilot_proposals", {
  id: int("id").autoincrement().primaryKey(),
  proposalKey: varchar("proposalKey", { length: 96 }).notNull(),
  version: int("version").notNull(),
  strategyPacketId: int("strategyPacketId").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("proposed"),
  title: varchar("title", { length: 300 }).notNull(),
  programKeysJson: mediumtext("programKeysJson").notNull(),
  requestedPermissionsJson: mediumtext("requestedPermissionsJson").notNull(),
  budgetPlanJson: mediumtext("budgetPlanJson").notNull(),
  measurementPlanJson: mediumtext("measurementPlanJson").notNull(),
  monitoringPlanJson: mediumtext("monitoringPlanJson").notNull(),
  rollbackPlanJson: mediumtext("rollbackPlanJson").notNull(),
  proposalPayloadJson: mediumtext("proposalPayloadJson").notNull(),
  proposalHash: varchar("proposalHash", { length: 64 }).notNull(),
  strategyPacketHash: varchar("strategyPacketHash", { length: 64 }).notNull(),
  ownerNote: mediumtext("ownerNote"),
  createdByUserId: int("createdByUserId").notNull(),
  proposedAt: bigint("proposedAt", { mode: "number" }).notNull(),
  decidedByUserId: int("decidedByUserId"),
  decidedAt: bigint("decidedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_meta_campaign_pilot_proposal_key_unique").on(table.proposalKey),
  uniqueIndex("marketing_meta_campaign_pilot_proposal_version_unique").on(table.version),
  index("marketing_meta_campaign_pilot_proposal_packet_idx").on(table.strategyPacketId, table.status),
  index("marketing_meta_campaign_pilot_proposal_status_idx").on(table.status, table.updatedAt),
]);
export type MarketingMetaCampaignPilotProposal = typeof marketingMetaCampaignPilotProposals.$inferSelect;
export type InsertMarketingMetaCampaignPilotProposal = typeof marketingMetaCampaignPilotProposals.$inferInsert;

// Versioned aggregate-only executive snapshots and owner decisions. These records
// do not contain client, Lead, campaign, spend, or provider-operating data.
export const marketingWeeklyExecutiveBriefs = mysqlTable("marketing_weekly_executive_briefs", {
  id: int("id").autoincrement().primaryKey(),
  briefKey: varchar("briefKey", { length: 96 }).notNull(),
  periodStart: varchar("periodStart", { length: 10 }).notNull(),
  version: int("version").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("captured"),
  snapshotJson: mediumtext("snapshotJson").notNull(),
  snapshotHash: varchar("snapshotHash", { length: 64 }).notNull(),
  contextNote: mediumtext("contextNote"),
  decision: varchar("decision", { length: 48 }),
  decisionNote: mediumtext("decisionNote"),
  capturedByUserId: int("capturedByUserId").notNull(),
  capturedAt: bigint("capturedAt", { mode: "number" }).notNull(),
  decidedByUserId: int("decidedByUserId"),
  decidedAt: bigint("decidedAt", { mode: "number" }),
  stoppedByUserId: int("stoppedByUserId"),
  stoppedAt: bigint("stoppedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, table => [
  uniqueIndex("marketing_weekly_executive_brief_key_unique").on(table.briefKey),
  uniqueIndex("marketing_weekly_executive_brief_period_version_unique").on(table.periodStart, table.version),
  index("marketing_weekly_executive_brief_status_period_idx").on(table.status, table.periodStart),
  index("marketing_weekly_executive_brief_captured_idx").on(table.capturedAt),
]);
export type MarketingWeeklyExecutiveBrief = typeof marketingWeeklyExecutiveBriefs.$inferSelect;
export type InsertMarketingWeeklyExecutiveBrief = typeof marketingWeeklyExecutiveBriefs.$inferInsert;

export const marketingWeeklyExecutiveBriefEvents = mysqlTable("marketing_weekly_executive_brief_events", {
  id: int("id").autoincrement().primaryKey(),
  briefId: int("briefId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 32 }),
  toStatus: varchar("toStatus", { length: 32 }),
  decision: varchar("decision", { length: 48 }),
  note: mediumtext("note"),
  payloadJson: mediumtext("payloadJson").notNull(),
  actorUserId: int("actorUserId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, table => [
  index("marketing_weekly_executive_brief_event_brief_idx").on(table.briefId, table.createdAt),
  index("marketing_weekly_executive_brief_event_action_idx").on(table.action, table.createdAt),
]);
export type MarketingWeeklyExecutiveBriefEvent = typeof marketingWeeklyExecutiveBriefEvents.$inferSelect;
export type InsertMarketingWeeklyExecutiveBriefEvent = typeof marketingWeeklyExecutiveBriefEvents.$inferInsert;

// ─── MARKETING READY SUMMARIES ─────────────────────────────────────────────────
export const marketingReadySummaries = mysqlTable("marketing_ready_summaries", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  originalFileName: varchar("originalFileName", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 768 }).notNull(),
  fileSizeBytes: bigint("fileSizeBytes", { mode: "number" }).notNull(),
  pageCount: int("pageCount"),
  sha256Digest: varchar("sha256Digest", { length: 64 }).notNull(),
  uploadedByUserId: int("uploadedByUserId").notNull(),
  uploadedByEmail: varchar("uploadedByEmail", { length: 320 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByUserId: int("deletedByUserId"),
}, table => [
  uniqueIndex("marketing_ready_summaries_sha256_unique").on(table.sha256Digest),
  index("marketing_ready_summaries_active_category_idx").on(table.deletedAt, table.category, table.title),
]);
export type MarketingReadySummary = typeof marketingReadySummaries.$inferSelect;
export type InsertMarketingReadySummary = typeof marketingReadySummaries.$inferInsert;

// ─── MARKETING PLANS ─────────────────────────────────────────────────────────
// NOTE: This table was created in a previous session with camelCase columns and bigint timestamps.
// Schema matches the actual DB: userId(int), startDate(varchar20), planJson(mediumtext), createdAt/updatedAt(bigint)
export const marketingPlans = mysqlTable("marketing_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  startDate: varchar("startDate", { length: 20 }).notNull(),
  contentRatio: text("contentRatio"),
  pillarFocus: text("pillarFocus"),
  featuredPrograms: text("featuredPrograms"),
  planJson: mediumtext("planJson").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type MarketingPlan = typeof marketingPlans.$inferSelect;
export type InsertMarketingPlan = typeof marketingPlans.$inferInsert;

export const marketingWeekMedia = mysqlTable("marketing_week_media", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId"),
  weekLabel: varchar("weekLabel", { length: 100 }).notNull(),
  weekFocus: varchar("weekFocus", { length: 255 }),
  resultJson: mediumtext("resultJson"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type MarketingWeekMedia = typeof marketingWeekMedia.$inferSelect;
export type InsertMarketingWeekMedia = typeof marketingWeekMedia.$inferInsert;


// ─── Daily Reports Tables ─────────────────────────────────────────────────────
export const dailyQualificationReports = mysqlTable("dailyQualificationReports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: date("reportDate").notNull(),
  totalLeads: int("totalLeads").notNull().default(0),
  totalQualified: int("totalQualified").notNull().default(0),
  notQualified: int("notQualified").notNull().default(0),
  noAnswer: int("noAnswer").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyQualificationReport = typeof dailyQualificationReports.$inferSelect;
export type InsertDailyQualificationReport = typeof dailyQualificationReports.$inferInsert;

export const paralegalClientRecords = mysqlTable("paralegalClientRecords", {
  id: int("id").autoincrement().primaryKey(),
  recordDate: date("recordDate").notNull(),
  finClientId: int("finClientId").notNull(), // Reference to finClients table
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientCode: varchar("clientCode", { length: 50 }),
  stage: mysqlEnum("stage", ["Submitted", "Approved"]).notNull(),
  fileType: mysqlEnum("fileType", ["Family", "Single"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ParalegalClientRecord = typeof paralegalClientRecords.$inferSelect;
export type InsertParalegalClientRecord = typeof paralegalClientRecords.$inferInsert;

export const dailyParalegalReports = mysqlTable("dailyParalegalReports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: date("reportDate").notNull(),
  documentsReceived: int("documentsReceived").notNull().default(0),
  documentsReviewed: int("documentsReviewed").notNull().default(0),
  issuesFound: int("issuesFound").notNull().default(0),
  clientsContacted: int("clientsContacted").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyParalegalReport = typeof dailyParalegalReports.$inferSelect;
export type InsertDailyParalegalReport = typeof dailyParalegalReports.$inferInsert;

export const dailyFinancialReports = mysqlTable("dailyFinancialReports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: date("reportDate").notNull(),
  invoicesCreated: int("invoicesCreated").notNull().default(0),
  invoiceAmount: decimal("invoiceAmount", { precision: 12, scale: 2 }).default("0"),
  paymentsReceived: int("paymentsReceived").notNull().default(0),
  paymentAmount: decimal("paymentAmount", { precision: 12, scale: 2 }).default("0"),
  expensesRecorded: int("expensesRecorded").notNull().default(0),
  expenseAmount: decimal("expenseAmount", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyFinancialReport = typeof dailyFinancialReports.$inferSelect;
export type InsertDailyFinancialReport = typeof dailyFinancialReports.$inferInsert;

export const dailyVisasReports = mysqlTable("dailyVisasReports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: date("reportDate").notNull(),
  applicationsSubmitted: int("applicationsSubmitted").notNull().default(0),
  applicationsApproved: int("applicationsApproved").notNull().default(0),
  applicationsRejected: int("applicationsRejected").notNull().default(0),
  visasIssued: int("visasIssued").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyVisasReport = typeof dailyVisasReports.$inferSelect;
export type InsertDailyVisasReport = typeof dailyVisasReports.$inferInsert;

export const dailyAttestationReports = mysqlTable("dailyAttestationReports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: date("reportDate").notNull(),
  documentsSubmitted: int("documentsSubmitted").notNull().default(0),
  documentsAttested: int("documentsAttested").notNull().default(0),
  attestationsPending: int("attestationsPending").notNull().default(0),
  attestationsCompleted: int("attestationsCompleted").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyAttestationReport = typeof dailyAttestationReports.$inferSelect;
export type InsertDailyAttestationReport = typeof dailyAttestationReports.$inferInsert;

// ─── App Store Compliance Tables ─────────────────────────────────────────────

export const deletionRequests = mysqlTable("deletionRequests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // null if submitted via public form
  fullName: varchar("fullName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  reason: text("reason"),
  status: mysqlEnum("status", [
    "new", "identity_verification", "under_review", "approved", "processing", "completed", "rejected", "cancelled"
  ]).default("new").notNull(),
  adminNotes: text("adminNotes"),
  deletedData: text("deletedData"),
  retainedData: text("retainedData"),
  retainedReason: text("retainedReason"),
  processedBy: int("processedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type DeletionRequest = typeof deletionRequests.$inferSelect;
export type InsertDeletionRequest = typeof deletionRequests.$inferInsert;

export const supportTickets = mysqlTable("supportTickets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  category: mysqlEnum("category", [
    "login_issue", "technical_bug", "account_deletion", "feature_request", "billing", "general", "other"
  ]).default("general").notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  description: text("description").notNull(),
  attachmentUrl: text("attachmentUrl"),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

export const consentRecords = mysqlTable("consentRecords", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  privacyPolicyVersion: varchar("privacyPolicyVersion", { length: 50 }).notNull(),
  termsVersion: varchar("termsVersion", { length: 50 }).notNull(),
  consentTimestamp: timestamp("consentTimestamp").defaultNow().notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
});
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type InsertConsentRecord = typeof consentRecords.$inferInsert;

// auditLogs table already defined above (line ~1005)

// ─── Administrative AI Council ───────────────────────────────────────────────
// Cases, specialist opinions, and decisions are stored separately so provider
// outputs remain attributable and a finalized chairperson decision is preserved.
export const aiCouncilCases = mysqlTable("aiCouncilCases", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  brief: mediumtext("brief").notNull(),
  language: varchar("language", { length: 12 }).default("en").notNull(),
  financialAssumptions: mediumtext("financialAssumptions"),
  status: mysqlEnum("status", [
    "draft", "running", "awaiting_manus", "ready_for_decision", "finalized", "failed"
  ]).default("draft").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  startedAt: timestamp("startedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiCouncilCase = typeof aiCouncilCases.$inferSelect;
export type InsertAiCouncilCase = typeof aiCouncilCases.$inferInsert;

export const aiCouncilOpinions = mysqlTable("aiCouncilOpinions", {
  id: int("id").autoincrement().primaryKey(),
  councilCaseId: int("councilCaseId").notNull(),
  role: mysqlEnum("role", [
    "strategy", "critical_review", "research_execution", "financial", "opposition", "chairperson"
  ]).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["queued", "running", "completed", "needs_input", "failed", "unavailable"])
    .default("queued").notNull(),
  attempt: int("attempt").default(1).notNull(),
  externalTaskId: varchar("externalTaskId", { length: 255 }),
  externalTaskUrl: text("externalTaskUrl"),
  content: mediumtext("content"),
  structuredContent: json("structuredContent"),
  sourceLinks: json("sourceLinks"),
  errorCode: varchar("errorCode", { length: 100 }),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AiCouncilOpinion = typeof aiCouncilOpinions.$inferSelect;
export type InsertAiCouncilOpinion = typeof aiCouncilOpinions.$inferInsert;

export const aiCouncilDecisions = mysqlTable("aiCouncilDecisions", {
  id: int("id").autoincrement().primaryKey(),
  councilCaseId: int("councilCaseId").notNull().unique(),
  chairOpinionId: int("chairOpinionId"),
  decision: mysqlEnum("decision", ["proceed", "proceed_with_conditions", "defer", "do_not_proceed"]).notNull(),
  confidence: int("confidence").notNull(),
  summary: mediumtext("summary").notNull(),
  rationale: mediumtext("rationale").notNull(),
  conditions: json("conditions"),
  nextSteps: json("nextSteps"),
  unresolvedConflicts: mediumtext("unresolvedConflicts"),
  finalizedByUserId: int("finalizedByUserId").notNull(),
  finalizedAt: timestamp("finalizedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiCouncilDecision = typeof aiCouncilDecisions.$inferSelect;
export type InsertAiCouncilDecision = typeof aiCouncilDecisions.$inferInsert;

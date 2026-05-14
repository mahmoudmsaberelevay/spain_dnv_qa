import {
  int,
  bigint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
  decimal,
  date,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
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
  consultantName: varchar("consultantName", { length: 128 }),
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
  status: mysqlEnum("status", ["unpaid", "paid"]).default("unpaid").notNull(),
  pdfUrl: text("pdfUrl"),
  driveFileId: varchar("driveFileId", { length: 255 }),
  driveLink: text("driveLink"),
  notes: text("notes"),
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
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientCode: varchar("clientCode", { length: 64 }).notNull(),
  applicationType: mysqlEnum("applicationType", ["freelancer", "business_owner"]).notNull(),
  maritalStatus: mysqlEnum("maritalStatus", ["single", "family"]).notNull(),
  paralegal: mysqlEnum("paralegal", ["Madonna", "Monica", "Marina"]),
  consultant: mysqlEnum("consultant", ["Mahmoud", "Ziad", "Fouad", "Kirolos"]).notNull(),
  schengenDate: timestamp("schengenDate"),
  embassyAppointmentDate: timestamp("embassyAppointmentDate"),
  expectedSubmissionDate: timestamp("expectedSubmissionDate"),
  // Schengen visa tracking
  schengenVisaValid: boolean("schengenVisaValid").default(false),
  schengenExpiryDate: date("schengenExpiryDate"),
  // Embassy attestation email date (for 15-day reminder)
  embassyEmailDate: date("embassyEmailDate"),
  // Google Drive link for client documents folder
  driveLink: text("driveLink"),
  // Children data: JSON array of { name: string; age: number } (exact name + age per child)
  childrenData: json("childrenData"),
  // Spouse / wife name
  spouseName: varchar("spouseName", { length: 255 }),
  // 3-stage workflow
  stage: mysqlEnum("stage", ["preparation", "submission", "approved"]).default("preparation").notNull(),
  // Submission stage fields
  submissionDate: timestamp("submissionDate"),
  expectedApprovalDate: timestamp("expectedApprovalDate"),
  translationDate: timestamp("translationDate"),
  // Approved stage fields
  approvalDate: timestamp("approvalDate"),
  settlementFeeAmount: decimal("settlementFeeAmount", { precision: 12, scale: 2 }),
  settlementFeeDate: timestamp("settlementFeeDate"),
  biometricsDate: timestamp("biometricsDate"),
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
  mofaAttested: boolean("mofaAttested").default(false).notNull(),
  mofaAttestedDate: timestamp("mofaAttestedDate"),
  embassyAttested: boolean("embassyAttested").default(false).notNull(),
  embassyAttestedDate: timestamp("embassyAttestedDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type InsertClientDocument = typeof clientDocuments.$inferInsert;

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
// One row per user per module. accessLevel: 'none' | 'viewer' | 'full'
// Modules: contracting, clientDocs, appAnalysis, financial
// 'full' = can view + create + edit + delete
// 'viewer' = can only view (no create/edit/delete)
// 'none' = blocked (PageGuard shows 403)
export const modulePermissions = mysqlTable("modulePermissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  module: varchar("module", { length: 50 }).notNull(), // 'contracting' | 'clientDocs' | 'appAnalysis' | 'financial'
  accessLevel: mysqlEnum("accessLevel", ["none", "viewer", "full"]).default("none").notNull(),
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
    "sticker", "location", "reaction", "contacts", "unknown",
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
});
export type WaMediaFile = typeof waMediaFiles.$inferSelect;
export type InsertWaMediaFile = typeof waMediaFiles.$inferInsert;

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

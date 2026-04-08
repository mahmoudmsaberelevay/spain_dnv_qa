import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
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

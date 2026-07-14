import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  dailyQualificationReports, dailyParalegalReports, dailyFinancialReports,
  dailyVisasReports, dailyAttestationReports,
  InsertDailyQualificationReport, InsertDailyParalegalReport, InsertDailyFinancialReport,
  InsertDailyVisasReport, InsertDailyAttestationReport,
} from "../drizzle/schema";

// ─── Qualification Reports ────────────────────────────────────────────────────
export async function listQualificationReports(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (opts?.dateFrom) conditions.push(gte(dailyQualificationReports.reportDate, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(dailyQualificationReports.reportDate, opts.dateTo));
  
  const query = db.select().from(dailyQualificationReports);
  if (conditions.length > 0) query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return await query.orderBy(desc(dailyQualificationReports.reportDate));
}

export async function getQualificationReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  const result = await db.select().from(dailyQualificationReports)
    .where(eq(dailyQualificationReports.reportDate, reportDate));
  return result[0] || null;
}

export async function createQualificationReport(data: InsertDailyQualificationReport) {
  const db = await getDb(); if (!db) return null;
  const result = await db.insert(dailyQualificationReports).values(data);
  return result;
}

export async function updateQualificationReport(reportDate: Date, data: Partial<InsertDailyQualificationReport>) {
  const db = await getDb(); if (!db) return null;
  return await db.update(dailyQualificationReports)
    .set(data)
    .where(eq(dailyQualificationReports.reportDate, reportDate));
}

export async function deleteQualificationReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  return await db.delete(dailyQualificationReports)
    .where(eq(dailyQualificationReports.reportDate, reportDate));
}

// ─── Paralegal Reports ────────────────────────────────────────────────────────
export async function listParalegalReports(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (opts?.dateFrom) conditions.push(gte(dailyParalegalReports.reportDate, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(dailyParalegalReports.reportDate, opts.dateTo));
  
  const query = db.select().from(dailyParalegalReports);
  if (conditions.length > 0) query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return await query.orderBy(desc(dailyParalegalReports.reportDate));
}

export async function getParalegalReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  const result = await db.select().from(dailyParalegalReports)
    .where(eq(dailyParalegalReports.reportDate, reportDate));
  return result[0] || null;
}

export async function createParalegalReport(data: InsertDailyParalegalReport) {
  const db = await getDb(); if (!db) return null;
  return await db.insert(dailyParalegalReports).values(data);
}

export async function updateParalegalReport(reportDate: Date, data: Partial<InsertDailyParalegalReport>) {
  const db = await getDb(); if (!db) return null;
  return await db.update(dailyParalegalReports)
    .set(data)
    .where(eq(dailyParalegalReports.reportDate, reportDate));
}

export async function deleteParalegalReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  return await db.delete(dailyParalegalReports)
    .where(eq(dailyParalegalReports.reportDate, reportDate));
}

// ─── Financial Reports ────────────────────────────────────────────────────────
export async function listFinancialReports(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (opts?.dateFrom) conditions.push(gte(dailyFinancialReports.reportDate, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(dailyFinancialReports.reportDate, opts.dateTo));
  
  const query = db.select().from(dailyFinancialReports);
  if (conditions.length > 0) query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return await query.orderBy(desc(dailyFinancialReports.reportDate));
}

export async function getFinancialReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  const result = await db.select().from(dailyFinancialReports)
    .where(eq(dailyFinancialReports.reportDate, reportDate));
  return result[0] || null;
}

export async function createFinancialReport(data: InsertDailyFinancialReport) {
  const db = await getDb(); if (!db) return null;
  return await db.insert(dailyFinancialReports).values(data);
}

export async function updateFinancialReport(reportDate: Date, data: Partial<InsertDailyFinancialReport>) {
  const db = await getDb(); if (!db) return null;
  return await db.update(dailyFinancialReports)
    .set(data)
    .where(eq(dailyFinancialReports.reportDate, reportDate));
}

export async function deleteFinancialReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  return await db.delete(dailyFinancialReports)
    .where(eq(dailyFinancialReports.reportDate, reportDate));
}

// ─── Visas Reports ────────────────────────────────────────────────────────────
export async function listVisasReports(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (opts?.dateFrom) conditions.push(gte(dailyVisasReports.reportDate, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(dailyVisasReports.reportDate, opts.dateTo));
  
  const query = db.select().from(dailyVisasReports);
  if (conditions.length > 0) query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return await query.orderBy(desc(dailyVisasReports.reportDate));
}

export async function getVisasReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  const result = await db.select().from(dailyVisasReports)
    .where(eq(dailyVisasReports.reportDate, reportDate));
  return result[0] || null;
}

export async function createVisasReport(data: InsertDailyVisasReport) {
  const db = await getDb(); if (!db) return null;
  return await db.insert(dailyVisasReports).values(data);
}

export async function updateVisasReport(reportDate: Date, data: Partial<InsertDailyVisasReport>) {
  const db = await getDb(); if (!db) return null;
  return await db.update(dailyVisasReports)
    .set(data)
    .where(eq(dailyVisasReports.reportDate, reportDate));
}

export async function deleteVisasReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  return await db.delete(dailyVisasReports)
    .where(eq(dailyVisasReports.reportDate, reportDate));
}

// ─── Attestation Reports ──────────────────────────────────────────────────────
export async function listAttestationReports(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (opts?.dateFrom) conditions.push(gte(dailyAttestationReports.reportDate, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(dailyAttestationReports.reportDate, opts.dateTo));
  
  const query = db.select().from(dailyAttestationReports);
  if (conditions.length > 0) query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return await query.orderBy(desc(dailyAttestationReports.reportDate));
}

export async function getAttestationReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  const result = await db.select().from(dailyAttestationReports)
    .where(eq(dailyAttestationReports.reportDate, reportDate));
  return result[0] || null;
}

export async function createAttestationReport(data: InsertDailyAttestationReport) {
  const db = await getDb(); if (!db) return null;
  return await db.insert(dailyAttestationReports).values(data);
}

export async function updateAttestationReport(reportDate: Date, data: Partial<InsertDailyAttestationReport>) {
  const db = await getDb(); if (!db) return null;
  return await db.update(dailyAttestationReports)
    .set(data)
    .where(eq(dailyAttestationReports.reportDate, reportDate));
}

export async function deleteAttestationReport(reportDate: Date) {
  const db = await getDb(); if (!db) return null;
  return await db.delete(dailyAttestationReports)
    .where(eq(dailyAttestationReports.reportDate, reportDate));
}

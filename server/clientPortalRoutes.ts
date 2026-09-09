import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { createHash, randomBytes, randomUUID } from "crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { createNotification, getDb } from "./db";
import { storageGet, storagePut } from "./storage";
import {
  clientApplicationActivities,
  clientCases,
  clientDocumentationPayments,
  clientDocuments,
  clientPortalApplications,
  clientPortalApplicants,
  clientPortalDeliveryOutbox,
  clientPortalDocuments,
  clientPortalMessages,
  clientPortalNotifications,
  clientPortalSessions,
  clientPortalUsers,
  publicAfterSettlementServices,
  publicServiceProviders,
} from "../drizzle/schema";
import {
  authenticatePortalRequest,
  createPortalSession,
  hashPortalPassword,
  hashPortalToken,
  rotatePortalSession,
  verifyPortalPassword,
  writePortalAudit,
  type PortalRequestContext,
} from "./clientPortalAuth";
import { projectClientProcessTimeline } from "./clientProcessTimeline";
import { getClientNotificationAttachment } from "./clientNotificationAttachments";
import { sendClientPortalActivityEmail, sendClientPortalPasswordResetEmail } from "./emailService";
import { mergeSystemNotificationRecipients } from "./systemNotificationRecipients";
import { replaceClientPortalAssignments } from "./clientPortalAssignmentService";
import { isStrongClientPortalPassword } from "../shared/clientPortalPasswordPolicy";
import { decodeProviderCoverUpload, providerCoverStorageKey, type ProviderCoverUpload } from "./clientPortalProviderMedia";
import { comparePrograms, PROGRAM_COMPARISON_OPTIONS } from "./programComparisonService";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const APP_REVIEW_CLIENT_CODE = "APP-REVIEW-001";
const APP_REVIEW_PROVIDER = {
  publicId: "app-review-demo-provider",
  providerType: "lawyer" as const,
  name: "Demo Immigration Counsel",
  country: "Spain",
  city: "Madrid",
  logoUrl: null,
  coverImageUrl: null,
  description: "Fictional service-provider record for App Review testing only.",
  services: ["Document review", "Application guidance"],
  price: null,
  currency: null,
  phone: null,
  whatsapp: null,
  email: "review-provider@example.invalid",
  website: null,
  languages: ["English"],
  availability: "By appointment",
  displayOrder: 1,
  isActive: true,
};
const APP_REVIEW_AFTER_SETTLEMENT_SERVICE = {
  publicId: "app-review-after-settlement-service",
  category: "banking",
  titleEn: "Bank account assistance",
  titleAr: "المساعدة في فتح حساب بنكي",
  descriptionEn: "Fictional after-settlement service for App Review testing only.",
  descriptionAr: "خدمة تجريبية للمراجعة فقط.",
  providerPublicId: APP_REVIEW_PROVIDER.publicId,
  providerName: APP_REVIEW_PROVIDER.name,
  actionLabelEn: "Contact provider",
  actionLabelAr: "تواصل مع مقدم الخدمة",
  actionType: "email",
  actionValue: APP_REVIEW_PROVIDER.email,
  displayOrder: 1,
  isActive: true,
};
const ALLOWED_MIME = new Map([
  ["application/pdf", ["pdf"]],
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/heic", ["heic"]],
  ["image/heif", ["heif", "heic"]],
]);

type PortalRequest = Request & { portal?: PortalRequestContext };

function error(res: Response, status: number, code: string, message?: string) {
  return res.status(status).json({ error: code, message: message ?? code });
}

function safeBody<T extends object>(req: Request): Partial<T> {
  return req.body && typeof req.body === "object" ? req.body as Partial<T> : {};
}

function requireString(value: unknown, field: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`invalid_${field}`);
  return value.trim();
}

function validNewPassword(value: unknown): value is string {
  return typeof value === "string" && isStrongClientPortalPassword(value);
}

function normalizeFileName(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[\\/\0\r\n\t]/g, "_").replace(/[^A-Za-z0-9\u0600-\u06FF._ -]/g, "_").replace(/\.{2,}/g, ".").trim();
  return (cleaned || "document").slice(0, 180);
}

function validateFile(buffer: Buffer, mimeType: string, fileName: string, declaredSize?: number) {
  if (!ALLOWED_MIME.has(mimeType)) throw new Error("unsupported_file_type");
  if (buffer.length < 8 || buffer.length > MAX_FILE_SIZE || (declaredSize && declaredSize !== buffer.length)) throw new Error("invalid_file_size");
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_MIME.get(mimeType)?.includes(extension)) throw new Error("file_extension_mismatch");
  const isPdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const brand = buffer.subarray(4, 12).toString("ascii");
  const isHeic = brand.includes("ftyp") && /(heic|heix|hevc|hevx|mif1|msf1)/i.test(buffer.subarray(8, 16).toString("ascii"));
  if ((mimeType === "application/pdf" && !isPdf) || (mimeType === "image/jpeg" && !isJpeg) || (mimeType === "image/png" && !isPng) || ((mimeType === "image/heic" || mimeType === "image/heif") && !isHeic)) throw new Error("file_content_mismatch");
  if (buffer.subarray(0, 2).toString("ascii") === "MZ" || buffer.subarray(0, 4).toString("hex") === "7f454c46") throw new Error("unsafe_file");
}

async function portalAuth(req: PortalRequest, res: Response, next: NextFunction) {
  const portal = await authenticatePortalRequest(req);
  if (!portal) return error(res, 401, "authentication_required");
  req.portal = portal;
  if (portal.user.mustChangePassword && !["/auth/change-password", "/auth/logout", "/me"].includes(req.path)) {
    return error(res, 403, "password_change_required", "Change the temporary password before continuing");
  }
  next();
}

function portalAdmin(req: PortalRequest, res: Response, next: NextFunction) {
  if (req.portal?.user.accountType !== "admin") return error(res, 403, "admin_access_required");
  next();
}

async function ownedApplication(portalUserId: number, applicationPublicId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ application: clientPortalApplications, clientCase: clientCases })
    .from(clientPortalApplications)
    .innerJoin(clientCases, eq(clientPortalApplications.clientCaseId, clientCases.id))
    .where(and(eq(clientPortalApplications.publicId, applicationPublicId), eq(clientPortalApplications.portalUserId, portalUserId), isNull(clientPortalApplications.accessRevokedAt)))
    .limit(1);
  return row ?? null;
}

function workflowProjection(clientCase: typeof clientCases.$inferSelect, receivedCount: number, totalDocuments: number) {
  const spainTeamReceived = clientCase.stage === "spain_team_received" || clientCase.stage === "submission" || clientCase.stage === "approved";
  const submitted = clientCase.stage === "submission" || clientCase.stage === "approved";
  const approved = clientCase.stage === "approved";
  const documentsReceived = totalDocuments > 0 && receivedCount > 0;
  const documentsComplete = totalDocuments > 0 && receivedCount === totalDocuments;
  const stages = [
    { key: "contract_signed", titleEn: "Contract Signed", titleAr: "تم توقيع العقد", status: "completed", date: clientCase.createdAt },
    { key: "initial_documents", titleEn: "Initial Documents Received", titleAr: "تم استلام المستندات الأولية", status: documentsReceived ? "completed" : "active", date: null },
    { key: "documents_review", titleEn: "Documents Under Review", titleAr: "المستندات قيد المراجعة", status: documentsComplete ? "completed" : documentsReceived ? "active" : "pending", date: null },
    { key: "preparing", titleEn: "Preparing Application", titleAr: "إعداد الطلب", status: spainTeamReceived ? "completed" : "active", date: clientCase.expectedSubmissionDate },
    { key: "spain_team_received", titleEn: "Spain Team Received", titleAr: "استلام فريق إسبانيا", status: spainTeamReceived ? "completed" : "pending", date: clientCase.spainTeamReceivedDate },
    { key: "submitted", titleEn: "Application Submitted", titleAr: "تم تقديم الطلب", status: submitted ? "completed" : "pending", date: clientCase.submissionDate },
    { key: "authority_review", titleEn: "Authority Review", titleAr: "مراجعة الجهة المختصة", status: approved ? "completed" : submitted ? "active" : "pending", date: clientCase.expectedApprovalDate },
    { key: "approval", titleEn: "Approval", titleAr: "الموافقة", status: approved ? "completed" : "pending", date: clientCase.approvalDate },
    { key: "biometrics", titleEn: "Biometrics", titleAr: "البيانات البيومترية", status: clientCase.biometricsDate ? "completed" : clientCase.biometricsAppointmentDate ? "active" : "pending", date: clientCase.biometricsDate || clientCase.biometricsAppointmentDate },
    { key: "residence_card", titleEn: "Residence Card", titleAr: "بطاقة الإقامة", status: clientCase.residencyCardReadyDate ? "completed" : clientCase.biometricsDate ? "active" : "pending", date: clientCase.residencyCardReadyDate },
  ] as const;
  const completed = stages.filter(stage => stage.status === "completed").length;
  return { stages, progressPercent: Math.round((completed / stages.length) * 100), currentStage: stages.find(stage => stage.status === "active") ?? stages[stages.length - 1] };
}

async function queueStaffEmail(input: { eventType: string; recipients: string[]; subject: string; html: string }) {
  const db = await getDb();
  if (!db || input.recipients.length === 0) return;
  const recipients = mergeSystemNotificationRecipients(input.recipients);
  const [result] = await db.insert(clientPortalDeliveryOutbox).values({ eventType: input.eventType, channel: "email", recipient: recipients.join(","), payload: { subject: input.subject, html: input.html } });
  const outboxId = Number((result as { insertId?: number }).insertId || 0);
  try {
    const sent = await sendClientPortalActivityEmail(recipients, input.subject, input.html);
    if (!sent) throw new Error("email_provider_rejected");
    if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "sent", attempts: 1, processedAt: new Date() }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
  } catch (sendError) {
    if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "failed", attempts: 1, lastError: String(sendError).slice(0, 4000) }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
  }
}

export async function pushClientNotification(portalUserId: number, title: string, body: string, data: Record<string, string>) {
  const db = await getDb();
  if (!db) return;
  const [portalUser] = await db.select({ preferences: clientPortalUsers.notificationPreferences }).from(clientPortalUsers).where(eq(clientPortalUsers.id, portalUserId)).limit(1);
  const preferences = portalUser?.preferences && typeof portalUser.preferences === "object" ? portalUser.preferences as Record<string, boolean> : {};
  const type = data.type || "";
  const category = type.includes("message") ? "messages" : type.includes("payment") ? "payments" : type.includes("document") || type.includes("attestation") || type.includes("translator") || type.includes("receipt") || type.includes("letter") ? "documents" : "workflow";
  if (preferences.push === false || (category && preferences[category] === false)) return;
  const sessions = await db.select({ token: clientPortalSessions.pushToken }).from(clientPortalSessions).where(and(eq(clientPortalSessions.portalUserId, portalUserId), isNull(clientPortalSessions.revokedAt), gt(clientPortalSessions.expiresAt, new Date())));
  const tokens = sessions.map(row => row.token).filter((token): token is string => Boolean(token && token.startsWith("ExponentPushToken[")));
  for (const token of tokens) {
    const [result] = await db.insert(clientPortalDeliveryOutbox).values({ eventType: data.type || "portal_notification", channel: "push", recipient: token, payload: { title, body, data } });
    const outboxId = Number((result as { insertId?: number }).insertId || 0);
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ to: token, title, body, data, sound: "default" }) });
      if (!response.ok) throw new Error(`push_${response.status}`);
      if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "sent", attempts: 1, processedAt: new Date() }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
    } catch (pushError) {
      if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "failed", attempts: 1, lastError: String(pushError).slice(0, 4000) }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
    }
  }
}

export async function notifyPortalUsersForClientCase(input: { clientCaseId: number; type: string; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string }) {
  const db = await getDb();
  if (!db) return { notified: 0 };
  const linked = await db.select({ portalUserId: clientPortalApplications.portalUserId, applicationPublicId: clientPortalApplications.publicId }).from(clientPortalApplications).where(and(eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt)));
  const unique = Array.from(new Map(linked.map(item => [item.portalUserId, item])).values());
  for (const item of unique) {
    const notificationPublicId = randomUUID();
    await db.insert(clientPortalNotifications).values({ publicId: notificationPublicId, portalUserId: item.portalUserId, type: input.type, titleEn: input.titleEn, titleAr: input.titleAr, bodyEn: input.bodyEn, bodyAr: input.bodyAr, entityType: "application", entityPublicId: item.applicationPublicId, createdAt: Date.now() });
    await pushClientNotification(item.portalUserId, input.titleEn, input.bodyEn.slice(0, 180), { type: input.type, applicationPublicId: item.applicationPublicId, entityPublicId: notificationPublicId });
  }
  return { notified: unique.length };
}

function staffRecipients(consultant?: string | null, paralegal?: string | null) {
  const map: Record<string, string> = {
    Mahmoud: "mahmoud.saber@elevay.com", "Mahmoud Saber": "mahmoud.saber@elevay.com",
    Ziad: "ziad.elshurafa@elevay.com", "Ziad Elshurafa": "ziad.elshurafa@elevay.com",
    Fouad: "fouad.abdo@elevay.com", "Fouad Abdo": "fouad.abdo@elevay.com",
    Kirolos: "kirlos.nabil@elevay.com", "Kirolos Nabil": "kirlos.nabil@elevay.com",
    Madonna: "madonna.adel@elevay.com", "Madonna Adel": "madonna.adel@elevay.com",
    Monica: "monica.sobhy@elevay.com", "Monica Sobhy": "monica.sobhy@elevay.com",
    Marina: "marina.kamel@elevay.com", "Marina Kamel": "marina.kamel@elevay.com",
  };
  return mergeSystemNotificationRecipients([consultant && map[consultant], paralegal && map[paralegal], "mahmoud.saber@elevay.com"].filter((value): value is string => Boolean(value)));
}

export function registerClientPortalRoutes(app: Express) {
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "too_many_attempts" } });
  const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "too_many_requests" } });
  const comparisonLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: "comparison_rate_limit", message: "Please wait before generating another comparison." } });

  app.post("/client-api/auth/login", authLimiter, async (req, res) => {
    const body = safeBody<{ identifier: string; password: string; deviceName: string; platform: string; osVersion: string; appVersion: string }>(req);
    const identifier = typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const db = await getDb();
    if (!db || !identifier || !password || password.length > 128) return error(res, 400, "invalid_credentials");
    const [user] = await db.select().from(clientPortalUsers).where(or(eq(clientPortalUsers.username, identifier), eq(clientPortalUsers.email, identifier))).limit(1);
    const valid = user && user.status === "active" && (!user.lockedUntil || user.lockedUntil <= new Date()) && await verifyPortalPassword(password, user.passwordHash);
    if (!valid) {
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        await db.update(clientPortalUsers).set({ failedLoginAttempts: attempts >= 5 ? 0 : attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null }).where(eq(clientPortalUsers.id, user.id));
        await writePortalAudit({ req, portalUserId: user.id, clientCaseId: user.primaryClientCaseId, action: "login", outcome: "denied" });
      }
      return error(res, 401, "invalid_credentials");
    }
    await db.update(clientPortalUsers).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(clientPortalUsers.id, user.id));
    const session = await createPortalSession({ user, req, deviceName: body.deviceName, platform: body.platform, osVersion: body.osVersion, appVersion: body.appVersion });
    await writePortalAudit({ req, portalUserId: user.id, clientCaseId: user.primaryClientCaseId, action: "login", recordType: "session", recordPublicId: session.sessionId });
    return res.json({ ...session, mustChangePassword: user.mustChangePassword, user: { publicId: user.publicId, username: user.username, email: user.email, mobile: user.mobile, locale: user.locale, consultant: user.consultant, paralegal: user.paralegal, accountType: user.accountType } });
  });

  app.post("/client-api/auth/refresh", authLimiter, async (req, res) => {
    const body = safeBody<{ sessionId: string; refreshToken: string }>(req);
    if (typeof body.sessionId !== "string" || typeof body.refreshToken !== "string") return error(res, 400, "invalid_refresh_request");
    const rotated = await rotatePortalSession({ sessionId: body.sessionId, refreshToken: body.refreshToken, req });
    if (!rotated) return error(res, 401, "session_expired");
    return res.json({ accessToken: rotated.accessToken, accessTokenExpiresIn: rotated.accessTokenExpiresIn, refreshToken: rotated.refreshToken, refreshTokenExpiresAt: rotated.refreshTokenExpiresAt, sessionId: rotated.sessionId, mustChangePassword: rotated.user.mustChangePassword, accountType: rotated.user.accountType });
  });

  app.post("/client-api/auth/forgot-password", authLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const db = await getDb();
    if (db && email) {
      const [user] = await db.select().from(clientPortalUsers).where(and(eq(clientPortalUsers.email, email), eq(clientPortalUsers.status, "active"))).limit(1);
      if (user) {
        const rawToken = randomBytes(32).toString("base64url");
        await db.update(clientPortalUsers).set({ passwordResetTokenHash: hashPortalToken(rawToken), passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000) }).where(eq(clientPortalUsers.id, user.id));
        await sendClientPortalPasswordResetEmail(user.email, rawToken);
        await writePortalAudit({ req, portalUserId: user.id, clientCaseId: user.primaryClientCaseId, action: "password_reset_requested" });
      }
    }
    return res.json({ ok: true });
  });

  app.post("/client-api/auth/reset-password", authLimiter, async (req, res) => {
    const body = safeBody<{ email: string; token: string; newPassword: string }>(req);
    if (typeof body.email !== "string" || typeof body.token !== "string" || !validNewPassword(body.newPassword)) return error(res, 400, "invalid_reset_request");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [user] = await db.select().from(clientPortalUsers).where(and(eq(clientPortalUsers.email, body.email.trim().toLowerCase()), eq(clientPortalUsers.passwordResetTokenHash, hashPortalToken(body.token)), gt(clientPortalUsers.passwordResetExpiresAt, new Date()), eq(clientPortalUsers.status, "active"))).limit(1);
    if (!user) return error(res, 400, "invalid_or_expired_reset_token");
    await db.update(clientPortalUsers).set({ passwordHash: await hashPortalPassword(body.newPassword), passwordResetTokenHash: null, passwordResetExpiresAt: null, mustChangePassword: false }).where(eq(clientPortalUsers.id, user.id));
    await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, user.id), isNull(clientPortalSessions.revokedAt)));
    await writePortalAudit({ req, portalUserId: user.id, clientCaseId: user.primaryClientCaseId, action: "password_reset_completed" });
    return res.json({ ok: true });
  });

  app.use("/client-api", portalAuth);

  app.get("/client-api/program-comparisons/options", (_req: PortalRequest, res) => {
    return res.json(PROGRAM_COMPARISON_OPTIONS);
  });

  app.post("/client-api/program-comparisons", comparisonLimiter, async (req: PortalRequest, res) => {
    const body = safeBody<{ programKeys: string[]; locale: "en" | "ar" }>(req);
    try {
      const result = await comparePrograms({
        programKeys: body.programKeys,
        locale: body.locale === "ar" ? "ar" : req.portal!.user.locale,
      });
      await writePortalAudit({
        req,
        portalUserId: req.portal!.user.id,
        clientCaseId: req.portal!.user.primaryClientCaseId,
        action: "program_comparison_generated",
        recordType: "program_comparison",
        details: `Programs: ${result.programs.join(", ")}; locale: ${result.locale}; model: ${result.model}`,
      });
      return res.json(result);
    } catch (caught) {
      if (caught instanceof ZodError || (caught instanceof Error && caught.message === "duplicate_programs")) {
        return error(res, 400, "invalid_program_selection", "Select 2 to 6 unique supported programs.");
      }
      console.error("[ClientPortal] Program comparison failed", caught);
      return error(res, 502, "comparison_generation_failed", "The comparison could not be generated. Please try again.");
    }
  });

  app.use("/client-api/admin", portalAdmin);

  app.get("/client-api/admin/client-cases", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const baseQuery = db.select({ id: clientCases.id, clientCode: clientCases.clientCode, clientName: clientCases.clientName, applicationType: clientCases.applicationType, stage: clientCases.stage }).from(clientCases);
    const rows = req.portal!.user.isReviewAccount
      ? await baseQuery.where(eq(clientCases.clientCode, APP_REVIEW_CLIENT_CODE)).orderBy(asc(clientCases.clientName)).limit(1)
      : await baseQuery.orderBy(asc(clientCases.clientName)).limit(1000);
    return res.json(rows);
  });

  app.get("/client-api/admin/accounts", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const baseQuery = db.select({ publicId: clientPortalUsers.publicId, username: clientPortalUsers.username, email: clientPortalUsers.email, status: clientPortalUsers.status, createdAt: clientPortalUsers.createdAt, clientName: clientCases.clientName, clientCode: clientCases.clientCode, applicationType: clientCases.applicationType }).from(clientPortalUsers).innerJoin(clientCases, eq(clientPortalUsers.primaryClientCaseId, clientCases.id));
    const rows = req.portal!.user.isReviewAccount
      ? await baseQuery.where(and(eq(clientPortalUsers.accountType, "client"), eq(clientCases.clientCode, APP_REVIEW_CLIENT_CODE))).orderBy(desc(clientPortalUsers.createdAt)).limit(50)
      : await baseQuery.where(eq(clientPortalUsers.accountType, "client")).orderBy(desc(clientPortalUsers.createdAt)).limit(250);
    return res.json(rows);
  });

  app.post("/client-api/admin/accounts", writeLimiter, async (req: PortalRequest, res) => {
    const body = safeBody<{ clientCaseId: number; username: string; email: string; mobile: string; password: string; locale: "en" | "ar" }>(req);
    const clientCaseId = Number(body.clientCaseId);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const mobile = typeof body.mobile === "string" ? body.mobile.trim().slice(0, 64) : "";
    if (!Number.isInteger(clientCaseId) || clientCaseId <= 0 || !/^[a-z0-9._-]{4,100}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 || !validNewPassword(body.password)) return error(res, 400, "invalid_account_details");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
    if (!clientCase) return error(res, 404, "documentation_folder_not_found");
    if (req.portal!.user.isReviewAccount && clientCase.clientCode !== APP_REVIEW_CLIENT_CODE) return error(res, 403, "review_scope_restricted");
    const publicId = randomUUID();
    try {
      await db.insert(clientPortalUsers).values({ publicId, primaryClientCaseId: clientCase.id, username, email, mobile: mobile || null, passwordHash: await hashPortalPassword(body.password), accountType: "client", consultant: clientCase.consultant, paralegal: clientCase.paralegal, locale: body.locale === "ar" ? "ar" : "en", mustChangePassword: false, notificationPreferences: { push: true, email: true, messages: true, documents: true, payments: true, workflow: true }, createdBy: req.portal!.user.id });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (/duplicate/i.test(message)) return error(res, 409, "account_exists", "Username or email already has client access");
      throw caught;
    }
    const [portalUser] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, publicId)).limit(1);
    if (!portalUser) return error(res, 500, "account_creation_failed");
    const applicationPublicId = randomUUID();
    await db.insert(clientPortalApplications).values({ publicId: applicationPublicId, portalUserId: portalUser.id, clientCaseId: clientCase.id, label: `${clientCase.applicationType} – ${clientCase.clientName}`, isPrimary: true });
    const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, applicationPublicId)).limit(1);
    if (application) await db.insert(clientPortalApplicants).values({ publicId: randomUUID(), portalApplicationId: application.id, relation: "main", fullName: clientCase.clientName });
    const { recordClientLifecycleEvent } = await import("./clientLifecycleNotificationService");
    await recordClientLifecycleEvent({ clientCaseId: clientCase.id, eventType: "portal_access_linked", idempotencyKey: `portal-user:${portalUser.id}:access-linked`, actor: { type: "staff", portalUserId: req.portal!.user.id, name: req.portal!.user.username }, titleEn: "Welcome to your ELEVAY application", titleAr: "مرحباً بك في طلب إليفاي", bodyEn: "Your secure client access is active. Review your document checklist and application activity here.", bodyAr: "تم تفعيل وصولك الآمن. يمكنك مراجعة قائمة المستندات ونشاط الطلب من هنا.", entityType: "application", entityPublicId: applicationPublicId, occurredAt: new Date() });
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_client_account_created", recordType: "client_portal_account", recordPublicId: portalUser.publicId, details: `Assigned case ${clientCase.clientCode}` });
    return res.status(201).json({ publicId: portalUser.publicId, username: portalUser.username, email: portalUser.email, clientName: clientCase.clientName, clientCode: clientCase.clientCode });
  });

  app.put("/client-api/admin/accounts/:publicId/applications", writeLimiter, async (req: PortalRequest, res) => {
    const body = safeBody<{ clientCaseIds: number[]; primaryClientCaseId: number }>(req);
    const clientCaseIds = Array.isArray(body.clientCaseIds) ? Array.from(new Set(body.clientCaseIds.map(Number).filter(value => Number.isInteger(value) && value > 0))) : [];
    const primaryClientCaseId = Number(body.primaryClientCaseId);
    if (!clientCaseIds.length || clientCaseIds.length > 10 || !clientCaseIds.includes(primaryClientCaseId)) return error(res, 400, "invalid_documentation_assignments");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    if (req.portal!.user.isReviewAccount) {
      const scopedCases = await db.select({ id: clientCases.id }).from(clientCases).where(and(inArray(clientCases.id, clientCaseIds), eq(clientCases.clientCode, APP_REVIEW_CLIENT_CODE)));
      if (scopedCases.length !== clientCaseIds.length) return error(res, 403, "review_scope_restricted");
    }
    const result = await replaceClientPortalAssignments({ portalUserPublicId: req.params.publicId, caseIds: clientCaseIds, primaryCaseId: primaryClientCaseId, actorUserId: req.portal!.user.id, actorName: req.portal!.user.username });
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_documentation_assignments_updated", recordType: "client_portal_account", recordPublicId: req.params.publicId, details: `Selected ${result.selectedCount}; added ${result.addedCount}; restored ${result.restoredCount}; removed ${result.removedCount}; active sessions revoked` });
    return res.json({ ok: true, selectedCount: result.selectedCount, addedCount: result.addedCount, restoredCount: result.restoredCount, removedCount: result.removedCount });
  });

  const setAdminClientPassword = async (req: PortalRequest, res: Response) => {
    const body = safeBody<{ password: string }>(req);
    if (!validNewPassword(body.password)) return error(res, 400, "invalid_password", "Password must include uppercase, lowercase, number, and symbol with no spaces");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [client] = await db.select({ user: clientPortalUsers, clientCode: clientCases.clientCode }).from(clientPortalUsers).innerJoin(clientCases, eq(clientPortalUsers.primaryClientCaseId, clientCases.id)).where(and(eq(clientPortalUsers.publicId, req.params.publicId), eq(clientPortalUsers.accountType, "client"))).limit(1);
    if (!client) return error(res, 404, "client_account_not_found");
    if (req.portal!.user.isReviewAccount && client.clientCode !== APP_REVIEW_CLIENT_CODE) return error(res, 403, "review_scope_restricted");
    await db.update(clientPortalUsers).set({ passwordHash: await hashPortalPassword(body.password), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, passwordResetTokenHash: null, passwordResetExpiresAt: null }).where(eq(clientPortalUsers.id, client.user.id));
    await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, client.user.id), isNull(clientPortalSessions.revokedAt)));
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_client_password_updated", recordType: "client_portal_account", recordPublicId: client.user.publicId, details: "Custom password set; active sessions revoked" });
    return res.json({ ok: true, publicId: client.user.publicId, username: client.user.username, email: client.user.email });
  };

  app.put("/client-api/admin/accounts/:publicId/password", writeLimiter, setAdminClientPassword);
  app.post("/client-api/admin/accounts/:publicId/reset-password", writeLimiter, setAdminClientPassword);

  app.get("/client-api/admin/providers", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    if (req.portal!.user.isReviewAccount) return res.json([APP_REVIEW_PROVIDER]);
    return res.json(await db.select().from(publicServiceProviders).orderBy(asc(publicServiceProviders.displayOrder), asc(publicServiceProviders.name)));
  });

  const saveAdminProvider = async (req: PortalRequest, res: Response) => {
    const body = safeBody<{ providerType: "lawyer" | "accountant" | "service_facilitator"; name: string; country: string; city: string; logoUrl: string; description: string; services: string[]; price: string; currency: string; phone: string; whatsapp: string; email: string; website: string; languages: string[]; availability: string; displayOrder: number; isActive: boolean; coverPhotoUpload: ProviderCoverUpload; removeCoverPhoto: boolean }>(req);
    const providerType = body.providerType;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 255) : "";
    const country = typeof body.country === "string" ? body.country.trim().slice(0, 128) : "";
    if (!providerType || !["lawyer", "accountant", "service_facilitator"].includes(providerType) || !name || !country) return error(res, 400, "invalid_provider");
    if (req.portal!.user.isReviewAccount) {
      await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: req.params.publicId ? "admin_provider_updated" : "admin_provider_created", recordType: "review_service_provider", recordPublicId: req.params.publicId || "app-review-simulated-provider", details: "App Review sandbox: no production provider data changed" });
      return res.status(req.params.publicId ? 200 : 201).json({ publicId: req.params.publicId || "app-review-simulated-provider", updated: Boolean(req.params.publicId), simulated: true });
    }
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const publicId = req.params.publicId;
    const [existing] = publicId ? await db.select().from(publicServiceProviders).where(eq(publicServiceProviders.publicId, publicId)).limit(1) : [];
    if (publicId && !existing) return error(res, 404, "provider_not_found");
    const resolvedPublicId = existing?.publicId ?? randomUUID();
    let coverImageKey = body.removeCoverPhoto ? null : existing?.coverImageKey ?? null;
    let coverImageUrl = body.removeCoverPhoto ? null : existing?.coverImageUrl ?? null;
    if (body.coverPhotoUpload) {
      try {
        const decoded = decodeProviderCoverUpload(body.coverPhotoUpload);
        const stored = await storagePut(providerCoverStorageKey(resolvedPublicId, decoded.extension), decoded.buffer, decoded.mimeType);
        coverImageKey = stored.key;
        coverImageUrl = stored.url;
      } catch (uploadError) {
        return error(res, 400, uploadError instanceof Error ? uploadError.message : "invalid_cover_photo");
      }
    }
    const values = { providerType, name, country, city: typeof body.city === "string" ? body.city.trim().slice(0, 128) || null : null, logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim().slice(0, 1024) || null : null, coverImageKey, coverImageUrl, description: typeof body.description === "string" ? body.description.trim().slice(0, 5000) || null : null, services: Array.isArray(body.services) ? body.services.filter(item => typeof item === "string" && item.trim()).slice(0, 50).map(item => item.trim().slice(0, 255)) : [], price: typeof body.price === "string" && /^\d+(\.\d{1,2})?$/.test(body.price) ? body.price : null, currency: typeof body.currency === "string" ? body.currency.trim().slice(0, 10) || null : null, phone: typeof body.phone === "string" ? body.phone.trim().slice(0, 64) || null : null, whatsapp: typeof body.whatsapp === "string" ? body.whatsapp.trim().slice(0, 64) || null : null, email: typeof body.email === "string" ? body.email.trim().slice(0, 320) || null : null, website: typeof body.website === "string" ? body.website.trim().slice(0, 1024) || null : null, languages: Array.isArray(body.languages) ? body.languages.filter(item => typeof item === "string" && item.trim()).slice(0, 30).map(item => item.trim().slice(0, 80)) : [], availability: typeof body.availability === "string" ? body.availability.trim().slice(0, 255) || null : null, displayOrder: Number.isInteger(body.displayOrder) ? Math.max(0, Math.min(10000, Number(body.displayOrder))) : 0, isActive: body.isActive !== false };
    if (existing) {
      await db.update(publicServiceProviders).set(values).where(eq(publicServiceProviders.id, existing.id));
      await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_provider_updated", recordType: "service_provider", recordPublicId: resolvedPublicId });
      return res.json({ publicId: resolvedPublicId, updated: true, coverImageUrl });
    }
    await db.insert(publicServiceProviders).values({ publicId: resolvedPublicId, ...values });
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_provider_created", recordType: "service_provider", recordPublicId: resolvedPublicId });
    return res.status(201).json({ publicId: resolvedPublicId, updated: false, coverImageUrl });
  };

  app.post("/client-api/admin/providers", writeLimiter, saveAdminProvider);
  app.put("/client-api/admin/providers/:publicId", writeLimiter, saveAdminProvider);
  app.delete("/client-api/admin/providers/:publicId", writeLimiter, async (req: PortalRequest, res) => {
    if (req.portal!.user.isReviewAccount) return res.json({ ok: true, simulated: true });
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [existing] = await db.select().from(publicServiceProviders).where(eq(publicServiceProviders.publicId, req.params.publicId)).limit(1);
    if (!existing) return error(res, 404, "provider_not_found");
    await db.transaction(async tx => {
      await tx.update(publicAfterSettlementServices).set({ providerId: null }).where(eq(publicAfterSettlementServices.providerId, existing.id));
      await tx.delete(publicServiceProviders).where(eq(publicServiceProviders.id, existing.id));
    });
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_provider_deleted", recordType: "service_provider", recordPublicId: existing.publicId, details: "Linked after-settlement services retained without provider association" });
    return res.json({ ok: true });
  });

  app.get("/client-api/admin/after-settlement-services", async (req: PortalRequest, res) => {
    if (req.portal!.user.isReviewAccount) return res.json([APP_REVIEW_AFTER_SETTLEMENT_SERVICE]);
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select({ service: publicAfterSettlementServices, providerPublicId: publicServiceProviders.publicId, providerName: publicServiceProviders.name }).from(publicAfterSettlementServices).leftJoin(publicServiceProviders, eq(publicAfterSettlementServices.providerId, publicServiceProviders.id)).orderBy(asc(publicAfterSettlementServices.displayOrder), asc(publicAfterSettlementServices.titleEn));
    return res.json(rows.map(row => ({ ...row.service, providerPublicId: row.providerPublicId ?? null, providerName: row.providerName ?? null })));
  });

  const saveAdminAfterSettlementService = async (req: PortalRequest, res: Response) => {
    const body = safeBody<{ category: string; titleEn: string; titleAr: string; descriptionEn: string; descriptionAr: string; providerPublicId: string; actionLabelEn: string; actionLabelAr: string; actionType: string; actionValue: string; displayOrder: number; isActive: boolean }>(req);
    const categories = ["housing", "banking", "insurance", "tax", "legal", "education", "healthcare", "utilities", "relocation", "other"];
    const actionTypes = ["phone", "whatsapp", "email", "website", "none"];
    const category = typeof body.category === "string" && categories.includes(body.category) ? body.category as typeof publicAfterSettlementServices.$inferInsert["category"] : "other";
    const actionType = typeof body.actionType === "string" && actionTypes.includes(body.actionType) ? body.actionType as typeof publicAfterSettlementServices.$inferInsert["actionType"] : "none";
    const titleEn = typeof body.titleEn === "string" ? body.titleEn.trim().slice(0, 255) : "";
    const actionValue = typeof body.actionValue === "string" ? body.actionValue.trim().slice(0, 1024) : "";
    if (!titleEn || (actionType !== "none" && !actionValue)) return error(res, 400, "invalid_after_settlement_service");
    if (req.portal!.user.isReviewAccount) return res.status(req.params.publicId ? 200 : 201).json({ publicId: req.params.publicId || "app-review-after-settlement-service", simulated: true });
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    let providerId: number | null = null;
    if (body.providerPublicId) {
      const [provider] = await db.select({ id: publicServiceProviders.id }).from(publicServiceProviders).where(eq(publicServiceProviders.publicId, body.providerPublicId)).limit(1);
      if (!provider) return error(res, 400, "provider_not_found");
      providerId = provider.id;
    }
    const values = { category, titleEn, titleAr: typeof body.titleAr === "string" ? body.titleAr.trim().slice(0, 255) || null : null, descriptionEn: typeof body.descriptionEn === "string" ? body.descriptionEn.trim().slice(0, 5000) || null : null, descriptionAr: typeof body.descriptionAr === "string" ? body.descriptionAr.trim().slice(0, 5000) || null : null, providerId, actionLabelEn: typeof body.actionLabelEn === "string" ? body.actionLabelEn.trim().slice(0, 120) || null : null, actionLabelAr: typeof body.actionLabelAr === "string" ? body.actionLabelAr.trim().slice(0, 120) || null : null, actionType, actionValue: actionType === "none" ? null : actionValue, displayOrder: Number.isInteger(body.displayOrder) ? Math.max(0, Math.min(10000, Number(body.displayOrder))) : 0, isActive: body.isActive !== false };
    if (req.params.publicId) {
      const [existing] = await db.select().from(publicAfterSettlementServices).where(eq(publicAfterSettlementServices.publicId, req.params.publicId)).limit(1);
      if (!existing) return error(res, 404, "after_settlement_service_not_found");
      await db.update(publicAfterSettlementServices).set(values).where(eq(publicAfterSettlementServices.id, existing.id));
      await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_after_settlement_service_updated", recordType: "after_settlement_service", recordPublicId: existing.publicId });
      return res.json({ publicId: existing.publicId, updated: true });
    }
    const publicId = randomUUID();
    await db.insert(publicAfterSettlementServices).values({ publicId, ...values });
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_after_settlement_service_created", recordType: "after_settlement_service", recordPublicId: publicId });
    return res.status(201).json({ publicId, updated: false });
  };

  app.post("/client-api/admin/after-settlement-services", writeLimiter, saveAdminAfterSettlementService);
  app.put("/client-api/admin/after-settlement-services/:publicId", writeLimiter, saveAdminAfterSettlementService);
  app.delete("/client-api/admin/after-settlement-services/:publicId", writeLimiter, async (req: PortalRequest, res) => {
    if (req.portal!.user.isReviewAccount) return res.json({ ok: true, simulated: true });
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [existing] = await db.select().from(publicAfterSettlementServices).where(eq(publicAfterSettlementServices.publicId, req.params.publicId)).limit(1);
    if (!existing) return error(res, 404, "after_settlement_service_not_found");
    await db.delete(publicAfterSettlementServices).where(eq(publicAfterSettlementServices.id, existing.id));
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, action: "admin_after_settlement_service_deleted", recordType: "after_settlement_service", recordPublicId: existing.publicId });
    return res.json({ ok: true });
  });

  app.post("/client-api/auth/logout", async (req: PortalRequest, res) => {
    const portal = req.portal!;
    const db = await getDb();
    if (db) await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(eq(clientPortalSessions.id, portal.session.id));
    await writePortalAudit({ req, portalUserId: portal.user.id, clientCaseId: portal.user.primaryClientCaseId, action: "logout", recordType: "session", recordPublicId: portal.session.publicId, correlationId: portal.correlationId });
    return res.json({ ok: true });
  });

  app.post("/client-api/auth/change-password", writeLimiter, async (req: PortalRequest, res) => {
    const body = safeBody<{ currentPassword: string; newPassword: string }>(req);
    if (typeof body.currentPassword !== "string" || body.currentPassword.length > 128 || !validNewPassword(body.newPassword)) return error(res, 400, "invalid_password");
    const portal = req.portal!;
    if (!await verifyPortalPassword(body.currentPassword, portal.user.passwordHash)) return error(res, 401, "invalid_current_password");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    await db.update(clientPortalUsers).set({ passwordHash: await hashPortalPassword(body.newPassword), mustChangePassword: false }).where(eq(clientPortalUsers.id, portal.user.id));
    await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, portal.user.id), isNull(clientPortalSessions.revokedAt)));
    await writePortalAudit({ req, portalUserId: portal.user.id, clientCaseId: portal.user.primaryClientCaseId, action: "password_changed", correlationId: portal.correlationId });
    return res.json({ ok: true, requiresLogin: true });
  });

  app.get("/client-api/me", async (req: PortalRequest, res) => {
    const user = req.portal!.user;
    return res.json({ publicId: user.publicId, username: user.username, email: user.email, mobile: user.mobile, locale: user.locale, consultant: user.consultant, paralegal: user.paralegal, mustChangePassword: user.mustChangePassword, notificationPreferences: user.notificationPreferences, accountType: user.accountType, deletionRequestedAt: user.deletionRequestedAt });
  });

  app.patch("/client-api/me/preferences", writeLimiter, async (req: PortalRequest, res) => {
    const body = safeBody<{ locale: "en" | "ar"; notifications: Record<string, boolean> }>(req);
    const locale = body.locale === "ar" ? "ar" : "en";
    const notifications = body.notifications && typeof body.notifications === "object" ? body.notifications : {};
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    await db.update(clientPortalUsers).set({ locale, notificationPreferences: notifications }).where(eq(clientPortalUsers.id, req.portal!.user.id));
    return res.json({ ok: true });
  });

  app.post("/client-api/me/account-deletion-request", writeLimiter, async (req: PortalRequest, res) => {
    const portal = req.portal!;
    if (portal.user.accountType !== "client") return error(res, 403, "client_account_required");
    if (portal.user.deletionRequestedAt) return res.json({ ok: true, requestedAt: portal.user.deletionRequestedAt.toISOString(), alreadyRequested: true });
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const requestedAt = new Date().toISOString();
    await db.update(clientPortalUsers).set({ deletionRequestedAt: new Date(requestedAt) }).where(eq(clientPortalUsers.id, portal.user.id));
    if (!portal.user.isReviewAccount) {
      await Promise.all([
        createNotification({ type: "client_account_deletion_requested", title: "Client account deletion request", body: `${portal.user.username} (${portal.user.email}) requested client-app account deletion.`, entityId: portal.user.primaryClientCaseId ?? undefined, entityType: "client_case" }),
        queueStaffEmail({ eventType: "client_account_deletion_requested", recipients: staffRecipients(portal.user.consultant, portal.user.paralegal), subject: `Client Account Deletion Request – ${portal.user.username}`, html: `<h2>Client Account Deletion Request</h2><p><strong>Client account:</strong> ${portal.user.username}</p><p><strong>Email:</strong> ${portal.user.email}</p><p><strong>Requested:</strong> ${requestedAt}</p><p>Review the client record and applicable retention obligations before completing the request.</p><p><a href="https://elevay.vip/admin/client-portal">Open Client Portal Administration</a></p>` }),
      ]);
    }
    await writePortalAudit({ req, portalUserId: portal.user.id, clientCaseId: portal.user.primaryClientCaseId, action: "account_deletion_requested", recordType: "client_portal_account", recordPublicId: portal.user.publicId, correlationId: portal.correlationId });
    return res.status(202).json({ ok: true, requestedAt, alreadyRequested: false });
  });

  app.get("/client-api/me/applications", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select({ application: clientPortalApplications, clientCase: clientCases }).from(clientPortalApplications).innerJoin(clientCases, eq(clientPortalApplications.clientCaseId, clientCases.id)).where(and(eq(clientPortalApplications.portalUserId, req.portal!.user.id), isNull(clientPortalApplications.accessRevokedAt))).orderBy(desc(clientPortalApplications.isPrimary), desc(clientPortalApplications.createdAt));
    return res.json(rows.map(({ application, clientCase }) => ({ publicId: application.publicId, label: application.label || clientCase.clientName, clientCode: clientCase.clientCode, applicationType: clientCase.applicationType, stage: clientCase.stage, consultant: clientCase.consultant, paralegal: clientCase.paralegal, isPrimary: application.isPrimary, updatedAt: clientCase.updatedAt })));
  });

  app.get("/client-api/applications/:applicationId", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const applicants = await db.select({ publicId: clientPortalApplicants.publicId, relation: clientPortalApplicants.relation, fullName: clientPortalApplicants.fullName, birthDate: clientPortalApplicants.birthDate }).from(clientPortalApplicants).where(eq(clientPortalApplicants.portalApplicationId, owned.application.id)).orderBy(asc(clientPortalApplicants.id));
    const folderItems = await db.select({ docKey: clientDocuments.docKey, docName: clientDocuments.docName, category: clientDocuments.category, received: clientDocuments.received, receivedDate: clientDocuments.receivedDate, documentLink: clientDocuments.documentLink, requiresMofa: clientDocuments.requiresMofa, mofaSubmitted: clientDocuments.mofaSubmitted, mofaSubmittedDate: clientDocuments.mofaSubmittedDate, mofaReceived: clientDocuments.mofaReceived, mofaReceivedDate: clientDocuments.mofaReceivedDate, requiresEmbassy: clientDocuments.requiresEmbassy, embassySubmitted: clientDocuments.embassySubmitted, embassySubmittedDate: clientDocuments.embassySubmittedDate, embassyReceived: clientDocuments.embassyReceived, embassyReceivedDate: clientDocuments.embassyReceivedDate }).from(clientDocuments).where(eq(clientDocuments.clientCaseId, owned.clientCase.id)).orderBy(asc(clientDocuments.category), asc(clientDocuments.id));
    const folder = { name: `${owned.clientCase.clientName} – Documentation`, clientCode: owned.clientCase.clientCode, total: folderItems.length, received: folderItems.filter(item => item.received).length, items: folderItems };
    return res.json({ publicId: owned.application.publicId, label: owned.application.label || owned.clientCase.clientName, clientCode: owned.clientCase.clientCode, applicationType: owned.clientCase.applicationType, stage: owned.clientCase.stage, consultant: owned.clientCase.consultant, paralegal: owned.clientCase.paralegal, dates: { expectedSubmissionDate: owned.clientCase.expectedSubmissionDate, spainTeamReceivedDate: owned.clientCase.spainTeamReceivedDate, translatorSubmittedDate: owned.clientCase.translationDate, submissionDate: owned.clientCase.submissionDate, expectedApprovalDate: owned.clientCase.expectedApprovalDate, approvalDate: owned.clientCase.approvalDate, travelDate: owned.clientCase.travelDate, arrivalConfirmedDate: owned.clientCase.arrivalConfirmedDate, biometricsAppointmentDate: owned.clientCase.biometricsAppointmentDate, biometricsCompletedDate: owned.clientCase.biometricsDate, bankAccountCompletedDate: owned.clientCase.bankAccountCompletedDate, residencyCardReadyDate: owned.clientCase.residencyCardReadyDate }, links: { submissionReceipt: owned.clientCase.submissionReceiptLink, approvalLetter: owned.clientCase.approvalLetterLink, ticket: owned.clientCase.ticketLink, hotel: owned.clientCase.hotelLink }, applicants, documentationFolder: folder });
  });

  app.get("/client-api/applications/:applicationId/workflow", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const checklist = await db.select().from(clientDocuments).where(eq(clientDocuments.clientCaseId, owned.clientCase.id));
    return res.json(workflowProjection(owned.clientCase, checklist.filter(item => item.received).length, checklist.length));
  });

  app.get("/client-api/applications/:applicationId/process-timeline", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [documents, payments] = await Promise.all([
      db.select({
        received: clientDocuments.received,
        receivedDate: clientDocuments.receivedDate,
        mofaSubmitted: clientDocuments.mofaSubmitted,
        mofaSubmittedDate: clientDocuments.mofaSubmittedDate,
        embassySubmitted: clientDocuments.embassySubmitted,
        embassySubmittedDate: clientDocuments.embassySubmittedDate,
      }).from(clientDocuments).where(eq(clientDocuments.clientCaseId, owned.clientCase.id)),
      db.select({
        paymentName: clientDocumentationPayments.paymentName,
        paidDate: clientDocumentationPayments.paidDate,
        sortOrder: clientDocumentationPayments.sortOrder,
      }).from(clientDocumentationPayments).where(and(
        eq(clientDocumentationPayments.clientCaseId, owned.clientCase.id),
        isNull(clientDocumentationPayments.archivedAt),
      )).orderBy(asc(clientDocumentationPayments.sortOrder), asc(clientDocumentationPayments.id)),
    ]);
    return res.json(projectClientProcessTimeline({
      clientCase: owned.clientCase,
      documents,
      payments,
      applicationCreatedAt: owned.application.createdAt,
    }));
  });

  app.get("/client-api/applications/:applicationId/activity", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select({ publicId: clientApplicationActivities.publicId, actorType: clientApplicationActivities.actorType, actorName: clientApplicationActivities.actorName, eventType: clientApplicationActivities.eventType, titleEn: clientApplicationActivities.titleEn, titleAr: clientApplicationActivities.titleAr, bodyEn: clientApplicationActivities.bodyEn, bodyAr: clientApplicationActivities.bodyAr, entityType: clientApplicationActivities.entityType, entityPublicId: clientApplicationActivities.entityPublicId, metadata: clientApplicationActivities.metadata, occurredAt: clientApplicationActivities.occurredAt }).from(clientApplicationActivities).where(and(eq(clientApplicationActivities.clientCaseId, owned.clientCase.id), eq(clientApplicationActivities.visibleToClient, true))).orderBy(desc(clientApplicationActivities.occurredAt)).limit(200);
    return res.json(rows);
  });

  app.get("/client-api/applications/:applicationId/documents", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const folderItems = await db.select({ internalId: clientDocuments.id, docKey: clientDocuments.docKey, docName: clientDocuments.docName, category: clientDocuments.category, received: clientDocuments.received, receivedDate: clientDocuments.receivedDate, documentLink: clientDocuments.documentLink, requiresMofa: clientDocuments.requiresMofa, mofaSubmitted: clientDocuments.mofaSubmitted, mofaSubmittedDate: clientDocuments.mofaSubmittedDate, mofaReceived: clientDocuments.mofaReceived, mofaReceivedDate: clientDocuments.mofaReceivedDate, requiresEmbassy: clientDocuments.requiresEmbassy, embassySubmitted: clientDocuments.embassySubmitted, embassySubmittedDate: clientDocuments.embassySubmittedDate, embassyReceived: clientDocuments.embassyReceived, embassyReceivedDate: clientDocuments.embassyReceivedDate }).from(clientDocuments).where(eq(clientDocuments.clientCaseId, owned.clientCase.id)).orderBy(asc(clientDocuments.category), asc(clientDocuments.id));
    const rows = await db.select({ document: clientPortalDocuments, applicantName: clientPortalApplicants.fullName }).from(clientPortalDocuments).leftJoin(clientPortalApplicants, eq(clientPortalDocuments.applicantId, clientPortalApplicants.id)).where(and(eq(clientPortalDocuments.portalApplicationId, owned.application.id), eq(clientPortalDocuments.visibleToClient, true))).orderBy(desc(clientPortalDocuments.createdAt));
    const uploads = rows.map(({ document, applicantName }) => ({ publicId: document.publicId, checklistDocumentKey: folderItems.find(item => item.internalId === document.clientDocumentId)?.docKey ?? null, documentType: document.documentType, fileName: document.fileName, mimeType: document.mimeType, fileSize: document.fileSize, source: document.source, reviewStatus: document.reviewStatus, clientComment: document.clientComment, applicantName, createdAt: document.createdAt }));
    const items = folderItems.map(({ internalId: _internalId, ...item }) => ({ ...item, linkedUploads: uploads.filter(upload => upload.checklistDocumentKey === item.docKey) }));
    return res.json({ folder: { name: `${owned.clientCase.clientName} – Documentation`, clientCode: owned.clientCase.clientCode, total: folderItems.length, received: folderItems.filter(item => item.received).length, items }, uploads });
  });

  app.get("/client-api/documents/:documentId/access", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [row] = await db.select({ document: clientPortalDocuments, application: clientPortalApplications }).from(clientPortalDocuments).innerJoin(clientPortalApplications, eq(clientPortalDocuments.portalApplicationId, clientPortalApplications.id)).where(and(eq(clientPortalDocuments.publicId, req.params.documentId), eq(clientPortalDocuments.visibleToClient, true), eq(clientPortalApplications.portalUserId, req.portal!.user.id), isNull(clientPortalApplications.accessRevokedAt))).limit(1);
    if (!row) return error(res, 404, "document_not_found");
    const file = await storageGet(row.document.fileKey);
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, clientCaseId: req.portal!.user.primaryClientCaseId, action: "document_viewed", recordType: "document", recordPublicId: row.document.publicId, correlationId: req.portal!.correlationId });
    return res.json({ url: file.url, expiresSoon: true });
  });

  app.post("/client-api/applications/:applicationId/documents", writeLimiter, async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const body = safeBody<{ checklistDocumentKey: string; documentType: string; applicantPublicId: string; fileName: string; mimeType: string; fileSize: number; base64: string; comment: string; source: "client_upload" | "client_scan" }>(req);
    try {
      const mimeType = requireString(body.mimeType, "mime_type", 128).toLowerCase();
      const fileName = normalizeFileName(requireString(body.fileName, "file_name", 255));
      const base64 = requireString(body.base64, "file", 40 * 1024 * 1024);
      const buffer = Buffer.from(base64, "base64");
      validateFile(buffer, mimeType, fileName, typeof body.fileSize === "number" ? body.fileSize : undefined);
      const db = await getDb();
      if (!db) return error(res, 503, "service_unavailable");
      const checklistDocumentKey = requireString(body.checklistDocumentKey, "checklist_document_key", 128);
      const [checklistDocument] = await db.select().from(clientDocuments).where(and(eq(clientDocuments.clientCaseId, owned.clientCase.id), eq(clientDocuments.docKey, checklistDocumentKey))).limit(1);
      if (!checklistDocument) return error(res, 400, "invalid_checklist_document");
      const documentType = checklistDocument.docName;
      let applicantId: number | null = null;
      if (body.applicantPublicId) {
        const [applicant] = await db.select().from(clientPortalApplicants).where(and(eq(clientPortalApplicants.publicId, body.applicantPublicId), eq(clientPortalApplicants.portalApplicationId, owned.application.id))).limit(1);
        if (!applicant) return error(res, 400, "invalid_applicant");
        applicantId = applicant.id;
      }
      const publicId = randomUUID();
      const fileHash = createHash("sha256").update(buffer).digest("hex").slice(0, 20);
      const extension = fileName.split(".").pop()!.toLowerCase();
      const key = `client-portal/${owned.clientCase.id}/clients-uploaded-documents/${publicId}-${fileHash}.${extension}`;
      await storagePut(key, buffer, mimeType);
      await db.insert(clientPortalDocuments).values({ publicId, portalApplicationId: owned.application.id, applicantId, clientDocumentId: checklistDocument.id, documentType: checklistDocument.docName, fileName, fileKey: key, mimeType, fileSize: buffer.length, source: body.source === "client_scan" ? "client_scan" : "client_upload", visibleToClient: true, clientComment: typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) || null : null, uploadedByPortalUserId: req.portal!.user.id });
      const { recordClientLifecycleEvent } = await import("./clientLifecycleNotificationService");
      await recordClientLifecycleEvent({ clientCaseId: owned.clientCase.id, eventType: "document_submitted", idempotencyKey: `client-upload:${publicId}`, actor: { type: "client", portalUserId: req.portal!.user.id, name: req.portal!.user.username }, titleEn: "Document submitted", titleAr: "تم إرسال المستند", bodyEn: `${checklistDocument.docName} was securely submitted to ELEVAY for review.`, bodyAr: `تم إرسال مستند ${checklistDocument.docName} بأمان إلى إليفاي للمراجعة.`, entityType: "document", entityPublicId: publicId, metadata: { checklistDocumentKey: checklistDocument.docKey, source: body.source === "client_scan" ? "client_scan" : "client_upload" } });
      const recipients = staffRecipients(owned.clientCase.consultant, owned.clientCase.paralegal);
      await Promise.all([
        queueStaffEmail({ eventType: "client_document_uploaded", recipients, subject: `New Client Document – ${owned.clientCase.clientName} – ${documentType}`, html: `<h2>New Client Document</h2><p>A new document was uploaded through the Elevay Client App.</p><p><strong>Client:</strong> ${owned.clientCase.clientName}</p><p><strong>Application:</strong> ${owned.application.label || owned.clientCase.applicationType}</p><p><strong>Document:</strong> ${documentType}</p><p><strong>Uploaded:</strong> ${new Date().toLocaleString()}</p>${body.comment ? `<p><strong>Comment:</strong> ${String(body.comment).replace(/[<>]/g, "")}</p>` : ""}<p><a href="https://elevay.vip/admin/client-portal">Open Client Portal Administration</a></p><p>The sensitive document is not attached to this email.</p>` }),
        createNotification({ type: "client_document_uploaded", title: "New client document", body: `${owned.clientCase.clientName} uploaded ${documentType} through the client app.`, entityId: owned.clientCase.id, entityType: "client_case" }),
      ]);
      await writePortalAudit({ req, portalUserId: req.portal!.user.id, clientCaseId: owned.clientCase.id, action: body.source === "client_scan" ? "document_scanned" : "document_uploaded", recordType: "document", recordPublicId: publicId, correlationId: req.portal!.correlationId });
      return res.status(201).json({ publicId, status: "submitted" });
    } catch (uploadError) {
      const code = uploadError instanceof Error ? uploadError.message : "upload_failed";
      await writePortalAudit({ req, portalUserId: req.portal!.user.id, clientCaseId: owned.clientCase.id, action: "document_upload", outcome: "failure", details: code, correlationId: req.portal!.correlationId });
      return error(res, 400, code);
    }
  });

  app.get("/client-api/applications/:applicationId/messages", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select({ publicId: clientPortalMessages.publicId, senderType: clientPortalMessages.senderType, body: clientPortalMessages.body, attachmentDocumentId: clientPortalMessages.attachmentDocumentId, createdAt: clientPortalMessages.createdAt }).from(clientPortalMessages).where(and(eq(clientPortalMessages.portalApplicationId, owned.application.id), eq(clientPortalMessages.visibility, "client"))).orderBy(asc(clientPortalMessages.createdAt));
    return res.json(rows);
  });

  app.post("/client-api/applications/:applicationId/messages", writeLimiter, async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    let bodyText: string;
    try { bodyText = requireString(req.body?.body, "message", 5000); } catch { return error(res, 400, "invalid_message"); }
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const publicId = randomUUID();
    await db.insert(clientPortalMessages).values({ publicId, portalApplicationId: owned.application.id, senderType: "client", senderPortalUserId: req.portal!.user.id, visibility: "client", body: bodyText });
    await db.insert(clientPortalNotifications).values({ publicId: randomUUID(), portalUserId: req.portal!.user.id, type: "message_sent", titleEn: "Message sent", titleAr: "تم إرسال الرسالة", bodyEn: "Your message was sent securely to your Elevay team.", bodyAr: "تم إرسال رسالتك بأمان إلى فريق إليفاي.", entityType: "message", entityPublicId: publicId, createdAt: Date.now() });
    const recipients = staffRecipients(owned.clientCase.consultant, owned.clientCase.paralegal);
    await Promise.all([
      queueStaffEmail({ eventType: "client_message", recipients, subject: `New Client Message – ${owned.clientCase.clientName}`, html: `<h2>New Client Message</h2><p><strong>Client:</strong> ${owned.clientCase.clientName}</p><p><strong>Application:</strong> ${owned.application.label || owned.clientCase.applicationType}</p><p><strong>Message:</strong> ${bodyText.replace(/[<>]/g, "").slice(0, 500)}</p><p><a href="https://elevay.vip/admin/client-portal">Open Client Portal Administration</a></p>` }),
      createNotification({ type: "client_message", title: "New client message", body: `${owned.clientCase.clientName}: ${bodyText.slice(0, 180)}`, entityId: owned.clientCase.id, entityType: "client_case" }),
    ]);
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, clientCaseId: owned.clientCase.id, action: "message_sent", recordType: "message", recordPublicId: publicId, correlationId: req.portal!.correlationId });
    return res.status(201).json({ publicId, createdAt: new Date().toISOString() });
  });

  app.get("/client-api/notifications", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select().from(clientPortalNotifications).where(eq(clientPortalNotifications.portalUserId, req.portal!.user.id)).orderBy(desc(clientPortalNotifications.createdAt)).limit(100);
    return res.json(rows.map(row => {
      const attachment = row.entityType === "notification_attachment" && row.entityPublicId
        ? getClientNotificationAttachment(row.entityPublicId)
        : null;
      return {
        publicId: row.publicId,
        type: row.type,
        title: { en: row.titleEn, ar: row.titleAr },
        body: { en: row.bodyEn, ar: row.bodyAr },
        entityType: row.entityType,
        entityPublicId: row.entityPublicId,
        attachment: attachment ? {
          publicId: attachment.publicId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          label: { en: attachment.labelEn, ar: attachment.labelAr },
        } : null,
        isRead: row.isRead,
        readAt: row.readAt,
        createdAt: row.createdAt,
      };
    }));
  });

  app.get("/client-api/notification-attachments/:attachmentId/access", async (req: PortalRequest, res) => {
    const attachment = getClientNotificationAttachment(req.params.attachmentId);
    if (!attachment) return error(res, 404, "attachment_not_found");
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, clientCaseId: req.portal!.user.primaryClientCaseId, action: "notification_attachment_viewed", recordType: "notification_attachment", recordPublicId: attachment.publicId, correlationId: req.portal!.correlationId });
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      url: `https://elevay.vip${attachment.storagePath}`,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    });
  });

  app.patch("/client-api/notifications/:notificationId/read", writeLimiter, async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [notification] = await db.select().from(clientPortalNotifications).where(and(eq(clientPortalNotifications.publicId, req.params.notificationId), eq(clientPortalNotifications.portalUserId, req.portal!.user.id))).limit(1);
    if (!notification) return error(res, 404, "notification_not_found");
    await db.update(clientPortalNotifications).set({ isRead: true, readAt: new Date() }).where(eq(clientPortalNotifications.id, notification.id));
    return res.json({ ok: true });
  });

  app.post("/client-api/devices/push-token", writeLimiter, async (req: PortalRequest, res) => {
    const token = typeof req.body?.pushToken === "string" ? req.body.pushToken.trim() : "";
    if (!/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(token)) return error(res, 400, "invalid_push_token");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    await db.update(clientPortalSessions).set({ pushToken: token, lastSeenAt: new Date() }).where(eq(clientPortalSessions.id, req.portal!.session.id));
    return res.json({ ok: true });
  });

  app.get("/client-api/devices", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select({ publicId: clientPortalSessions.publicId, deviceName: clientPortalSessions.deviceName, platform: clientPortalSessions.platform, osVersion: clientPortalSessions.osVersion, appVersion: clientPortalSessions.appVersion, lastSeenAt: clientPortalSessions.lastSeenAt, createdAt: clientPortalSessions.createdAt }).from(clientPortalSessions).where(and(eq(clientPortalSessions.portalUserId, req.portal!.user.id), isNull(clientPortalSessions.revokedAt), gt(clientPortalSessions.expiresAt, new Date()))).orderBy(desc(clientPortalSessions.lastSeenAt));
    return res.json(rows.map(row => ({ ...row, current: row.publicId === req.portal!.session.publicId })));
  });

  app.delete("/client-api/devices/:sessionId", writeLimiter, async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [session] = await db.select().from(clientPortalSessions).where(and(eq(clientPortalSessions.publicId, req.params.sessionId), eq(clientPortalSessions.portalUserId, req.portal!.user.id), isNull(clientPortalSessions.revokedAt))).limit(1);
    if (!session) return error(res, 404, "device_not_found");
    await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(eq(clientPortalSessions.id, session.id));
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, clientCaseId: req.portal!.user.primaryClientCaseId, action: "device_revoked", recordType: "session", recordPublicId: session.publicId, correlationId: req.portal!.correlationId });
    return res.json({ ok: true, currentSessionRevoked: session.id === req.portal!.session.id });
  });
}

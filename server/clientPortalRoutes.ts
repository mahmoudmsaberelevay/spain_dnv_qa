import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { createHash, randomBytes, randomUUID } from "crypto";
import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { createNotification, getDb } from "./db";
import { storageGet, storagePut } from "./storage";
import {
  clientCases,
  clientDocuments,
  clientPortalApplications,
  clientPortalApplicants,
  clientPortalDeliveryOutbox,
  clientPortalDocuments,
  clientPortalMessages,
  clientPortalNotifications,
  clientPortalSessions,
  clientPortalUsers,
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
import { sendClientPortalActivityEmail, sendClientPortalPasswordResetEmail } from "./emailService";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
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
  return typeof value === "string" && value.length >= 10 && Buffer.byteLength(value, "utf8") <= 72;
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

async function ownedApplication(portalUserId: number, applicationPublicId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ application: clientPortalApplications, clientCase: clientCases })
    .from(clientPortalApplications)
    .innerJoin(clientCases, eq(clientPortalApplications.clientCaseId, clientCases.id))
    .where(and(eq(clientPortalApplications.publicId, applicationPublicId), eq(clientPortalApplications.portalUserId, portalUserId)))
    .limit(1);
  return row ?? null;
}

function workflowProjection(clientCase: typeof clientCases.$inferSelect, receivedCount: number, totalDocuments: number) {
  const submitted = clientCase.stage === "submission" || clientCase.stage === "approved";
  const approved = clientCase.stage === "approved";
  const documentsReceived = totalDocuments > 0 && receivedCount > 0;
  const documentsComplete = totalDocuments > 0 && receivedCount === totalDocuments;
  const stages = [
    { key: "contract_signed", titleEn: "Contract Signed", titleAr: "تم توقيع العقد", status: "completed", date: clientCase.createdAt },
    { key: "initial_documents", titleEn: "Initial Documents Received", titleAr: "تم استلام المستندات الأولية", status: documentsReceived ? "completed" : "active", date: null },
    { key: "documents_review", titleEn: "Documents Under Review", titleAr: "المستندات قيد المراجعة", status: documentsComplete ? "completed" : documentsReceived ? "active" : "pending", date: null },
    { key: "preparing", titleEn: "Preparing Application", titleAr: "إعداد الطلب", status: submitted ? "completed" : clientCase.stage === "preparation" ? "active" : "pending", date: clientCase.expectedSubmissionDate },
    { key: "submitted", titleEn: "Application Submitted", titleAr: "تم تقديم الطلب", status: submitted ? "completed" : "pending", date: clientCase.submissionDate },
    { key: "authority_review", titleEn: "Authority Review", titleAr: "مراجعة الجهة المختصة", status: approved ? "completed" : submitted ? "active" : "pending", date: clientCase.expectedApprovalDate },
    { key: "approval", titleEn: "Approval", titleAr: "الموافقة", status: approved ? "completed" : "pending", date: clientCase.approvalDate },
    { key: "biometrics", titleEn: "Biometrics", titleAr: "البيانات البيومترية", status: clientCase.biometricsDate ? "completed" : approved ? "active" : "pending", date: clientCase.biometricsDate },
    { key: "residence_card", titleEn: "Residence Card", titleAr: "بطاقة الإقامة", status: clientCase.biometricsDate ? "active" : "pending", date: null },
  ] as const;
  const completed = stages.filter(stage => stage.status === "completed").length;
  return { stages, progressPercent: Math.round((completed / stages.length) * 100), currentStage: stages.find(stage => stage.status === "active") ?? stages[stages.length - 1] };
}

async function queueStaffEmail(input: { eventType: string; recipients: string[]; subject: string; html: string }) {
  const db = await getDb();
  if (!db || input.recipients.length === 0) return;
  const [result] = await db.insert(clientPortalDeliveryOutbox).values({ eventType: input.eventType, channel: "email", recipient: input.recipients.join(","), payload: { subject: input.subject, html: input.html } });
  const outboxId = Number((result as { insertId?: number }).insertId || 0);
  try {
    const sent = await sendClientPortalActivityEmail(input.recipients, input.subject, input.html);
    if (!sent) throw new Error("email_provider_rejected");
    if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "sent", attempts: 1, processedAt: new Date() }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
  } catch (sendError) {
    if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "failed", attempts: 1, lastError: String(sendError).slice(0, 4000) }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
  }
}

async function pushClientNotification(portalUserId: number, title: string, body: string, data: Record<string, string>) {
  const db = await getDb();
  if (!db) return;
  const [portalUser] = await db.select({ preferences: clientPortalUsers.notificationPreferences }).from(clientPortalUsers).where(eq(clientPortalUsers.id, portalUserId)).limit(1);
  const preferences = portalUser?.preferences && typeof portalUser.preferences === "object" ? portalUser.preferences as Record<string, boolean> : {};
  const category = data.type?.includes("message") ? "messages" : data.type?.includes("document") ? "documents" : data.type?.includes("workflow") || data.type?.includes("stage") ? "workflow" : null;
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
  const linked = await db.select({ portalUserId: clientPortalApplications.portalUserId, applicationPublicId: clientPortalApplications.publicId }).from(clientPortalApplications).where(eq(clientPortalApplications.clientCaseId, input.clientCaseId));
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
  return Array.from(new Set([consultant && map[consultant], paralegal && map[paralegal], "mahmoud.saber@elevay.com"].filter((value): value is string => Boolean(value))));
}

export function registerClientPortalRoutes(app: Express) {
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "too_many_attempts" } });
  const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "too_many_requests" } });

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
    return res.json({ ...session, mustChangePassword: user.mustChangePassword, user: { publicId: user.publicId, username: user.username, email: user.email, mobile: user.mobile, locale: user.locale, consultant: user.consultant, paralegal: user.paralegal } });
  });

  app.post("/client-api/auth/refresh", authLimiter, async (req, res) => {
    const body = safeBody<{ sessionId: string; refreshToken: string }>(req);
    if (typeof body.sessionId !== "string" || typeof body.refreshToken !== "string") return error(res, 400, "invalid_refresh_request");
    const rotated = await rotatePortalSession({ sessionId: body.sessionId, refreshToken: body.refreshToken, req });
    if (!rotated) return error(res, 401, "session_expired");
    return res.json({ accessToken: rotated.accessToken, accessTokenExpiresIn: rotated.accessTokenExpiresIn, refreshToken: rotated.refreshToken, refreshTokenExpiresAt: rotated.refreshTokenExpiresAt, sessionId: rotated.sessionId, mustChangePassword: rotated.user.mustChangePassword });
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
    return res.json({ publicId: user.publicId, username: user.username, email: user.email, mobile: user.mobile, locale: user.locale, consultant: user.consultant, paralegal: user.paralegal, mustChangePassword: user.mustChangePassword, notificationPreferences: user.notificationPreferences });
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
    const requestedAt = new Date().toISOString();
    await Promise.all([
      createNotification({ type: "client_account_deletion_requested", title: "Client account deletion request", body: `${portal.user.username} (${portal.user.email}) requested client-app account deletion.`, entityId: portal.user.primaryClientCaseId, entityType: "client_case" }),
      queueStaffEmail({ eventType: "client_account_deletion_requested", recipients: staffRecipients(portal.user.consultant, portal.user.paralegal), subject: `Client Account Deletion Request – ${portal.user.username}`, html: `<h2>Client Account Deletion Request</h2><p><strong>Client account:</strong> ${portal.user.username}</p><p><strong>Email:</strong> ${portal.user.email}</p><p><strong>Requested:</strong> ${requestedAt}</p><p>Review the client record and applicable retention obligations before completing the request.</p><p><a href="https://elevay.vip/admin/client-portal">Open Client Portal Administration</a></p>` }),
    ]);
    await writePortalAudit({ req, portalUserId: portal.user.id, clientCaseId: portal.user.primaryClientCaseId, action: "account_deletion_requested", recordType: "client_portal_account", recordPublicId: portal.user.publicId, correlationId: portal.correlationId });
    return res.status(202).json({ ok: true, requestedAt });
  });

  app.get("/client-api/me/applications", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select({ application: clientPortalApplications, clientCase: clientCases }).from(clientPortalApplications).innerJoin(clientCases, eq(clientPortalApplications.clientCaseId, clientCases.id)).where(eq(clientPortalApplications.portalUserId, req.portal!.user.id)).orderBy(desc(clientPortalApplications.isPrimary), desc(clientPortalApplications.createdAt));
    return res.json(rows.map(({ application, clientCase }) => ({ publicId: application.publicId, label: application.label || clientCase.clientName, clientCode: clientCase.clientCode, applicationType: clientCase.applicationType, stage: clientCase.stage, consultant: clientCase.consultant, paralegal: clientCase.paralegal, isPrimary: application.isPrimary, updatedAt: clientCase.updatedAt })));
  });

  app.get("/client-api/applications/:applicationId", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const applicants = await db.select({ publicId: clientPortalApplicants.publicId, relation: clientPortalApplicants.relation, fullName: clientPortalApplicants.fullName, birthDate: clientPortalApplicants.birthDate }).from(clientPortalApplicants).where(eq(clientPortalApplicants.portalApplicationId, owned.application.id)).orderBy(asc(clientPortalApplicants.id));
    return res.json({ publicId: owned.application.publicId, label: owned.application.label || owned.clientCase.clientName, clientCode: owned.clientCase.clientCode, applicationType: owned.clientCase.applicationType, stage: owned.clientCase.stage, consultant: owned.clientCase.consultant, paralegal: owned.clientCase.paralegal, dates: { expectedSubmissionDate: owned.clientCase.expectedSubmissionDate, submissionDate: owned.clientCase.submissionDate, expectedApprovalDate: owned.clientCase.expectedApprovalDate, approvalDate: owned.clientCase.approvalDate, biometricsDate: owned.clientCase.biometricsDate }, applicants });
  });

  app.get("/client-api/applications/:applicationId/workflow", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const checklist = await db.select().from(clientDocuments).where(eq(clientDocuments.clientCaseId, owned.clientCase.id));
    return res.json(workflowProjection(owned.clientCase, checklist.filter(item => item.received).length, checklist.length));
  });

  app.get("/client-api/applications/:applicationId/documents", async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const rows = await db.select({ document: clientPortalDocuments, applicantName: clientPortalApplicants.fullName }).from(clientPortalDocuments).leftJoin(clientPortalApplicants, eq(clientPortalDocuments.applicantId, clientPortalApplicants.id)).where(and(eq(clientPortalDocuments.portalApplicationId, owned.application.id), eq(clientPortalDocuments.visibleToClient, true))).orderBy(desc(clientPortalDocuments.createdAt));
    return res.json(rows.map(({ document, applicantName }) => ({ publicId: document.publicId, documentType: document.documentType, fileName: document.fileName, mimeType: document.mimeType, fileSize: document.fileSize, source: document.source, reviewStatus: document.reviewStatus, clientComment: document.clientComment, applicantName, createdAt: document.createdAt })));
  });

  app.get("/client-api/documents/:documentId/access", async (req: PortalRequest, res) => {
    const db = await getDb();
    if (!db) return error(res, 503, "service_unavailable");
    const [row] = await db.select({ document: clientPortalDocuments, application: clientPortalApplications }).from(clientPortalDocuments).innerJoin(clientPortalApplications, eq(clientPortalDocuments.portalApplicationId, clientPortalApplications.id)).where(and(eq(clientPortalDocuments.publicId, req.params.documentId), eq(clientPortalDocuments.visibleToClient, true), eq(clientPortalApplications.portalUserId, req.portal!.user.id))).limit(1);
    if (!row) return error(res, 404, "document_not_found");
    const file = await storageGet(row.document.fileKey);
    await writePortalAudit({ req, portalUserId: req.portal!.user.id, clientCaseId: req.portal!.user.primaryClientCaseId, action: "document_viewed", recordType: "document", recordPublicId: row.document.publicId, correlationId: req.portal!.correlationId });
    return res.json({ url: file.url, expiresSoon: true });
  });

  app.post("/client-api/applications/:applicationId/documents", writeLimiter, async (req: PortalRequest, res) => {
    const owned = await ownedApplication(req.portal!.user.id, req.params.applicationId);
    if (!owned) return error(res, 404, "application_not_found");
    const body = safeBody<{ documentType: string; applicantPublicId: string; fileName: string; mimeType: string; fileSize: number; base64: string; comment: string; source: "client_upload" | "client_scan" }>(req);
    try {
      const documentType = requireString(body.documentType, "document_type", 128);
      const mimeType = requireString(body.mimeType, "mime_type", 128).toLowerCase();
      const fileName = normalizeFileName(requireString(body.fileName, "file_name", 255));
      const base64 = requireString(body.base64, "file", 40 * 1024 * 1024);
      const buffer = Buffer.from(base64, "base64");
      validateFile(buffer, mimeType, fileName, typeof body.fileSize === "number" ? body.fileSize : undefined);
      const db = await getDb();
      if (!db) return error(res, 503, "service_unavailable");
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
      await db.insert(clientPortalDocuments).values({ publicId, portalApplicationId: owned.application.id, applicantId, documentType, fileName, fileKey: key, mimeType, fileSize: buffer.length, source: body.source === "client_scan" ? "client_scan" : "client_upload", visibleToClient: true, clientComment: typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) || null : null, uploadedByPortalUserId: req.portal!.user.id });
      await db.insert(clientPortalNotifications).values({ publicId: randomUUID(), portalUserId: req.portal!.user.id, type: "document_submitted", titleEn: "Document received", titleAr: "تم استلام المستند", bodyEn: "Your document was securely submitted to Elevay for review.", bodyAr: "تم إرسال مستندك بأمان إلى إليفاي للمراجعة.", entityType: "document", entityPublicId: publicId, createdAt: Date.now() });
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
    return res.json(rows.map(row => ({ publicId: row.publicId, type: row.type, titleEn: row.titleEn, titleAr: row.titleAr, bodyEn: row.bodyEn, bodyAr: row.bodyAr, entityType: row.entityType, entityPublicId: row.entityPublicId, isRead: row.isRead, createdAt: row.createdAt })));
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

export { pushClientNotification };

import { randomUUID } from "crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  clientApplicationActivities,
  clientCases,
  clientDocumentationPayments,
  clientDocuments,
  clientPortalApplications,
  clientPortalNotifications,
  clientPortalUsers,
  clientReminderDeliveries,
  clientReminderSettings,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getTeamNotificationEmail, sendClientPortalActivityEmail } from "./emailService";

export type LifecycleActor = {
  type: "staff" | "client" | "system";
  staffUserId?: number | null;
  portalUserId?: number | null;
  name: string;
};

export type LifecycleEventInput = {
  clientCaseId: number;
  eventType: string;
  idempotencyKey: string;
  actor: LifecycleActor;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  entityType?: string | null;
  entityPublicId?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
  notifyStaff?: boolean;
};

type ReminderTemplate = Omit<LifecycleEventInput, "clientCaseId" | "idempotencyKey" | "actor"> & {
  ruleKey: string;
  idempotencyKey: string;
};

function affectedRows(result: unknown): number {
  const metadata = Array.isArray(result) ? result[0] : result;
  return Number((metadata as { affectedRows?: number } | undefined)?.affectedRows || 0);
}

function keyPart(value: unknown) {
  return String(value ?? "none").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
}

function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function dateKeyInTimezone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

function utcDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function addDays(value: string, days: number): string {
  const next = utcDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function calendarDaysBetween(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000);
}

function formatDate(value: string) {
  return utcDate(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatDateAr(value: string) {
  return utcDate(value).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function paymentByOrdinal(payments: Array<typeof clientDocumentationPayments.$inferSelect>, ordinal: number) {
  const explicit = payments.find(payment => {
    const normalized = payment.paymentName.toLowerCase();
    return ordinal === 2 ? /(^|\s)(second|2nd|payment\s*2)(\s|$)/.test(normalized) : /(^|\s)(third|3rd|payment\s*3)(\s|$)/.test(normalized);
  });
  return explicit ?? payments[ordinal - 1] ?? null;
}

async function sendResponsibleStaffNotice(input: { clientCaseId: number; idempotencyKey: string; subject: string; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [clientCase] = await db.select({ clientName: clientCases.clientName, paralegal: clientCases.paralegal, consultant: clientCases.consultant }).from(clientCases).where(eq(clientCases.id, input.clientCaseId)).limit(1);
  if (!clientCase) return false;
  const [application] = await db.select({ portalUserId: clientPortalApplications.portalUserId }).from(clientPortalApplications).where(and(eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt))).limit(1);
  if (!application) return false;
  const recipients = Array.from(new Set([getTeamNotificationEmail(clientCase.paralegal), getTeamNotificationEmail(clientCase.consultant)].filter((email): email is string => Boolean(email))));
  if (!recipients.length) return false;
  const key = `${input.idempotencyKey}:staff`.slice(0, 191);
  await db.insert(clientReminderDeliveries).values({ idempotencyKey: key, clientCaseId: input.clientCaseId, portalUserId: application.portalUserId, ruleKey: "staff_lifecycle_notice", scheduledFor: new Date() }).onDuplicateKeyUpdate({ set: { idempotencyKey: key } });
  const [delivery] = await db.select().from(clientReminderDeliveries).where(eq(clientReminderDeliveries.idempotencyKey, key)).limit(1);
  if (!delivery || delivery.status === "sent" || delivery.attempts >= 3) return delivery?.status === "sent";
  const claim = await db.update(clientReminderDeliveries).set({ status: "pending", attempts: delivery.attempts + 1, lastError: null }).where(and(eq(clientReminderDeliveries.id, delivery.id), eq(clientReminderDeliveries.status, delivery.status), eq(clientReminderDeliveries.attempts, delivery.attempts)));
  if (affectedRows(claim) !== 1) return false;
  const html = `<h2>${input.subject}</h2><p><strong>Client:</strong> ${clientCase.clientName}</p><p>${input.body}</p><p>Open the protected Client Documentation module in ELEVAY CRM for details.</p>`;
  const sent = await sendClientPortalActivityEmail(recipients, `[ELEVAY Client] ${input.subject}`, html);
  await db.update(clientReminderDeliveries).set(sent ? { status: "sent", sentAt: new Date(), lastError: null } : { status: "failed", lastError: "EMAIL_DELIVERY_FAILED" }).where(eq(clientReminderDeliveries.id, delivery.id));
  return sent;
}

export async function recordClientLifecycleEvent(input: LifecycleEventInput) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const normalizedKey = input.idempotencyKey.slice(0, 191);
  const publicId = randomUUID();
  const insertResult = await db.insert(clientApplicationActivities).values({
    publicId,
    clientCaseId: input.clientCaseId,
    actorType: input.actor.type,
    actorStaffUserId: input.actor.staffUserId ?? null,
    actorPortalUserId: input.actor.portalUserId ?? null,
    actorName: input.actor.name.slice(0, 255),
    eventType: input.eventType.slice(0, 80),
    titleEn: input.titleEn.slice(0, 255),
    titleAr: input.titleAr.slice(0, 255),
    bodyEn: input.bodyEn,
    bodyAr: input.bodyAr,
    entityType: input.entityType?.slice(0, 64) ?? null,
    entityPublicId: input.entityPublicId?.slice(0, 64) ?? null,
    metadata: input.metadata ?? null,
    idempotencyKey: normalizedKey,
    occurredAt: input.occurredAt ?? new Date(),
  }).onDuplicateKeyUpdate({ set: { idempotencyKey: normalizedKey } });

  if (affectedRows(insertResult) !== 1) {
    if (input.notifyStaff) await sendResponsibleStaffNotice({ clientCaseId: input.clientCaseId, idempotencyKey: normalizedKey, subject: input.titleEn, body: input.bodyEn });
    return { created: false, publicId: null, notified: 0 };
  }

  const linked = await db.select({
    portalUserId: clientPortalApplications.portalUserId,
    applicationPublicId: clientPortalApplications.publicId,
    locale: clientPortalUsers.locale,
  }).from(clientPortalApplications)
    .innerJoin(clientPortalUsers, eq(clientPortalApplications.portalUserId, clientPortalUsers.id))
    .where(and(eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt), eq(clientPortalUsers.status, "active")));
  const unique = Array.from(new Map(linked.map(item => [item.portalUserId, item])).values());

  for (const item of unique) {
    const notificationKey = `${normalizedKey}:u:${item.portalUserId}`.slice(0, 191);
    const notificationPublicId = randomUUID();
    const notificationResult = await db.insert(clientPortalNotifications).values({
      publicId: notificationPublicId,
      portalUserId: item.portalUserId,
      idempotencyKey: notificationKey,
      type: input.eventType.slice(0, 64),
      titleEn: input.titleEn.slice(0, 255),
      titleAr: input.titleAr.slice(0, 255),
      bodyEn: input.bodyEn,
      bodyAr: input.bodyAr,
      entityType: input.entityType ?? "application",
      entityPublicId: input.entityPublicId ?? item.applicationPublicId,
      createdAt: Date.now(),
    }).onDuplicateKeyUpdate({ set: { idempotencyKey: notificationKey } });
    if (affectedRows(notificationResult) !== 1) continue;
    const title = item.locale === "ar" ? input.titleAr : input.titleEn;
    const body = item.locale === "ar" ? input.bodyAr : input.bodyEn;
    const { pushClientNotification } = await import("./clientPortalRoutes");
    await pushClientNotification(item.portalUserId, title, body.slice(0, 180), {
      type: input.eventType,
      applicationPublicId: item.applicationPublicId,
      entityPublicId: input.entityPublicId ?? notificationPublicId,
    });
  }
  if (input.notifyStaff) await sendResponsibleStaffNotice({ clientCaseId: input.clientCaseId, idempotencyKey: normalizedKey, subject: input.titleEn, body: input.bodyEn });
  return { created: true, publicId, notified: unique.length };
}

async function claimAndSendReminder(input: {
  clientCaseId: number;
  portalUserId: number;
  scheduledFor: Date;
  template: ReminderTemplate;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const idempotencyKey = input.template.idempotencyKey.slice(0, 191);
  await db.insert(clientReminderDeliveries).values({
    idempotencyKey,
    clientCaseId: input.clientCaseId,
    portalUserId: input.portalUserId,
    ruleKey: input.template.ruleKey,
    scheduledFor: input.scheduledFor,
  }).onDuplicateKeyUpdate({ set: { idempotencyKey } });
  const [delivery] = await db.select().from(clientReminderDeliveries).where(eq(clientReminderDeliveries.idempotencyKey, idempotencyKey)).limit(1);
  if (!delivery || delivery.status === "sent" || delivery.status === "skipped" || delivery.attempts >= 3) return false;
  const claim = await db.update(clientReminderDeliveries).set({ status: "pending", attempts: delivery.attempts + 1, lastError: null }).where(and(
    eq(clientReminderDeliveries.id, delivery.id),
    eq(clientReminderDeliveries.status, delivery.status),
    eq(clientReminderDeliveries.attempts, delivery.attempts),
  ));
  if (affectedRows(claim) !== 1) return false;
  try {
    await recordClientLifecycleEvent({
      clientCaseId: input.clientCaseId,
      idempotencyKey,
      actor: { type: "system", name: "ELEVAY" },
      eventType: input.template.eventType,
      titleEn: input.template.titleEn,
      titleAr: input.template.titleAr,
      bodyEn: input.template.bodyEn,
      bodyAr: input.template.bodyAr,
      entityType: input.template.entityType,
      entityPublicId: input.template.entityPublicId,
      metadata: input.template.metadata,
      occurredAt: new Date(),
      notifyStaff: input.template.notifyStaff,
    });
    await db.update(clientReminderDeliveries).set({ status: "sent", sentAt: new Date() }).where(eq(clientReminderDeliveries.id, delivery.id));
    return true;
  } catch (error) {
    await db.update(clientReminderDeliveries).set({ status: "failed", lastError: String(error).slice(0, 4000) }).where(eq(clientReminderDeliveries.id, delivery.id));
    return false;
  }
}

export async function runClientLifecycleReminders(now = new Date(), dependencies: {
  claimAndSend?: typeof claimAndSendReminder;
} = {}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [settings] = await db.select().from(clientReminderSettings).where(eq(clientReminderSettings.id, 1)).limit(1);
  if (settings?.enabled === false) return { evaluated: 0, sent: 0, skipped: "disabled" as const };

  const rows = await db.select({
    clientCase: clientCases,
    portalUserId: clientPortalApplications.portalUserId,
    applicationPublicId: clientPortalApplications.publicId,
  }).from(clientPortalApplications)
    .innerJoin(clientCases, eq(clientPortalApplications.clientCaseId, clientCases.id))
    .innerJoin(clientPortalUsers, eq(clientPortalApplications.portalUserId, clientPortalUsers.id))
    .where(and(isNull(clientPortalApplications.accessRevokedAt), eq(clientPortalUsers.status, "active"), eq(clientPortalUsers.accountType, "client")));
  const unique = Array.from(new Map(rows.map(row => [`${row.clientCase.id}:${row.portalUserId}`, row])).values());
  const docs = await db.select().from(clientDocuments).orderBy(asc(clientDocuments.id));
  const payments = await db.select().from(clientDocumentationPayments).where(isNull(clientDocumentationPayments.archivedAt)).orderBy(asc(clientDocumentationPayments.sortOrder), asc(clientDocumentationPayments.id));
  const docsByCase = new Map<number, Array<typeof clientDocuments.$inferSelect>>();
  const paymentsByCase = new Map<number, Array<typeof clientDocumentationPayments.$inferSelect>>();
  const claimAndSend = dependencies.claimAndSend ?? claimAndSendReminder;
  docs.forEach(doc => docsByCase.set(doc.clientCaseId, [...(docsByCase.get(doc.clientCaseId) ?? []), doc]));
  payments.forEach(payment => paymentsByCase.set(payment.clientCaseId, [...(paymentsByCase.get(payment.clientCaseId) ?? []), payment]));

  let sent = 0;
  let evaluated = 0;
  for (const row of unique) {
    const c = row.clientCase;
    const timeZone = c.applicationTimezone || "Africa/Cairo";
    const today = dateKeyInTimezone(now, timeZone);
    const caseDocs = docsByCase.get(c.id) ?? [];
    const casePayments = paymentsByCase.get(c.id) ?? [];
    const reminders: ReminderTemplate[] = [];
    const signed = dateKey(c.clientPortalSignedAt);
    const embassyEmail = dateKey(c.embassyEmailDate);
    const appointment = dateKey(c.embassyAppointmentDate);
    const submission = dateKey(c.expectedSubmissionDate);
    const approval = dateKey(c.approvalDate);
    const travel = dateKey(c.travelDate);
    const biometrics = dateKey(c.biometricsAppointmentDate);

    if (signed && calendarDaysBetween(signed, today) >= 2 && !c.appointmentBookingSubmittedAt && !appointment) {
      reminders.push({ ruleKey: "appointment_booking_d2", idempotencyKey: `case:${c.id}:appointment-booking:${signed}:d2`, eventType: "appointment_booking_reminder", titleEn: "Embassy appointment booking reminder", titleAr: "تذكير بحجز موعد السفارة", bodyEn: "Please send your Spanish Consulate appointment booking confirmation for attestation. Contact your consultant if you need help.", bodyAr: "يرجى إرسال تأكيد حجز موعد القنصلية الإسبانية للتصديق. تواصل مع مستشارك إذا احتجت إلى مساعدة." });
    }
    if (embassyEmail && !appointment && !c.embassyReplyConfirmedAt) {
      const elapsed = calendarDaysBetween(embassyEmail, today);
      const cycle = Math.floor(elapsed / 3);
      if (cycle >= 1) reminders.push({ ruleKey: "embassy_inbox_cycle", idempotencyKey: `case:${c.id}:embassy-inbox:${embassyEmail}:c${cycle}`, eventType: "embassy_inbox_reminder", titleEn: "Check your Embassy email", titleAr: "تحقق من بريد السفارة", bodyEn: "Please check your email inbox and junk folder for an Embassy reply. This reminder stops when the appointment is confirmed.", bodyAr: "يرجى التحقق من صندوق الوارد والبريد غير المرغوب فيه بحثاً عن رد السفارة. سيتوقف التذكير عند تأكيد الموعد." });
    }
    if (appointment) {
      const remaining = calendarDaysBetween(today, appointment);
      const appointmentTrigger = remaining >= 0 && remaining <= 1 ? 1 : remaining > 1 && remaining <= 3 ? 3 : null;
      if (appointmentTrigger) reminders.push({ ruleKey: `embassy_appointment_d${appointmentTrigger}`, idempotencyKey: `case:${c.id}:embassy-appointment:${appointment}:d${appointmentTrigger}`, eventType: "embassy_appointment_reminder", titleEn: "Embassy appointment reminder", titleAr: "تذكير بموعد السفارة", bodyEn: `Your Embassy appointment is on ${formatDate(appointment)} (${appointmentTrigger === 1 ? "tomorrow" : "in 3 days"}).`, bodyAr: `موعدك في السفارة يوم ${formatDateAr(appointment)} (${appointmentTrigger === 1 ? "غداً" : "بعد 3 أيام"}).` });
    }
    const schengenExpiry = dateKey(c.schengenExpiryDate);
    if (c.schengenVisaValid && schengenExpiry) {
      const remaining = calendarDaysBetween(today, schengenExpiry);
      const schengenTrigger = remaining >= 0 && remaining <= 20 ? 20 : remaining > 20 && remaining <= 30 ? 30 : null;
      if (schengenTrigger) reminders.push({ ruleKey: `schengen_expiry_d${schengenTrigger}`, idempotencyKey: `case:${c.id}:schengen:${schengenExpiry}:d${schengenTrigger}`, eventType: "schengen_expiry_reminder", titleEn: schengenTrigger === 20 ? "Urgent: Schengen visa expires in 20 days" : "Schengen visa expires in 30 days", titleAr: schengenTrigger === 20 ? "عاجل: تأشيرة شنغن تنتهي خلال 20 يوماً" : "تأشيرة شنغن تنتهي خلال 30 يوماً", bodyEn: `Your Schengen visa expires on ${formatDate(schengenExpiry)}. Please review your travel plan with ELEVAY.`, bodyAr: `تنتهي تأشيرة شنغن الخاصة بك في ${formatDateAr(schengenExpiry)}. يرجى مراجعة خطة السفر مع إليفاي.` });
    }
    if (embassyEmail && !c.embassyReplyConfirmedAt && calendarDaysBetween(embassyEmail, today) >= 15) {
      reminders.push({ ruleKey: "embassy_attestation_followup_d15", notifyStaff: true, idempotencyKey: `case:${c.id}:embassy-followup:${embassyEmail}:d15`, eventType: "embassy_attestation_followup", titleEn: "Embassy attestation follow-up", titleAr: "متابعة تصديق السفارة", bodyEn: "No Embassy attestation reply has been confirmed after 15 days. Please contact your ELEVAY consultant for the latest update.", bodyAr: "لم يتم تأكيد رد السفارة بشأن التصديق بعد 15 يوماً. يرجى التواصل مع مستشار إليفاي لمعرفة آخر المستجدات." });
    }
    if (submission) {
      const remaining = calendarDaysBetween(today, submission);
      const second = paymentByOrdinal(casePayments, 2);
      const secondPaymentTrigger = remaining >= 0 && remaining <= 7 ? 7 : remaining > 7 && remaining <= 12 ? 12 : null;
      if (second && !second.paidDate && secondPaymentTrigger) reminders.push({ ruleKey: `second_payment_d${secondPaymentTrigger}`, notifyStaff: true, idempotencyKey: `case:${c.id}:second-payment:${submission}:d${secondPaymentTrigger}`, eventType: "payment_reminder", titleEn: secondPaymentTrigger === 7 ? "Second payment overdue" : "Second payment reminder", titleAr: secondPaymentTrigger === 7 ? "الدفعة الثانية متأخرة" : "تذكير بالدفعة الثانية", bodyEn: secondPaymentTrigger === 7 ? `Your second payment of ${second.amountEur} EUR is already due and the critical payment time has passed. Please contact ELEVAY promptly.` : `Your second payment of ${second.amountEur} EUR will be due within 2 days, ahead of your confirmed submission date ${formatDate(submission)}.`, bodyAr: secondPaymentTrigger === 7 ? `الدفعة الثانية بقيمة ${second.amountEur} يورو مستحقة بالفعل وقد تجاوزنا المهلة الحرجة. يرجى التواصل مع إليفاي فوراً.` : `الدفعة الثانية بقيمة ${second.amountEur} يورو ستستحق خلال يومين قبل موعد التقديم المؤكد ${formatDateAr(submission)}.` });
      if (remaining >= 0 && remaining <= 3 && !c.ticketLink) reminders.push({ ruleKey: "flight_ticket_d3", idempotencyKey: `case:${c.id}:flight-ticket:${submission}:d3`, eventType: "flight_ticket_reminder", titleEn: "Flight ticket reminder", titleAr: "تذكير بتذكرة الطيران", bodyEn: "Your application submission is in 3 days. Please upload or share your Spain flight ticket securely through your application.", bodyAr: "موعد تقديم طلبك بعد 3 أيام. يرجى رفع أو مشاركة تذكرة السفر إلى إسبانيا بأمان من خلال طلبك." });
    }
    if (signed) {
      const missing = caseDocs.filter(doc => !doc.received).map(doc => doc.docName).sort();
      const elapsed = calendarDaysBetween(signed, today);
      const cycle = Math.floor(elapsed / 3);
      if (missing.length && cycle >= 1) reminders.push({ ruleKey: "missing_documents_cycle", idempotencyKey: `case:${c.id}:missing-documents:${keyPart(missing.join("|"))}:c${cycle}`, eventType: "missing_documents_reminder", titleEn: "Missing documents reminder", titleAr: "تذكير بالمستندات الناقصة", bodyEn: `Please submit these missing documents: ${missing.join(", ")}.`, bodyAr: `يرجى تقديم المستندات الناقصة التالية: ${missing.join("، ")}.` });
    }
    if (travel && !c.arrivalConfirmedDate && calendarDaysBetween(travel, today) >= 1) reminders.push({ ruleKey: "arrival_confirmation_d1", notifyStaff: true, idempotencyKey: `case:${c.id}:arrival:${travel}:d1`, eventType: "arrival_confirmation_reminder", titleEn: "Arrival confirmation", titleAr: "تأكيد الوصول", bodyEn: "We hope your journey to Spain went well. Please confirm your arrival through your ELEVAY application.", bodyAr: "نتمنى أن تكون رحلتك إلى إسبانيا قد تمت بخير. يرجى تأكيد وصولك من خلال تطبيق إليفاي." });
    if (approval) {
      const elapsed = calendarDaysBetween(approval, today);
      const third = paymentByOrdinal(casePayments, 3);
      if (elapsed >= 1 && third && !third.paidDate) reminders.push({ ruleKey: "third_payment_d1", notifyStaff: true, idempotencyKey: `case:${c.id}:third-payment:${approval}:d1`, eventType: "payment_reminder", titleEn: "Third payment due", titleAr: "استحقاق الدفعة الثالثة", bodyEn: `Your third payment of ${third.amountEur} EUR is due by ${formatDate(third.dueDate)}.`, bodyAr: `الدفعة الثالثة بقيمة ${third.amountEur} يورو مستحقة في ${formatDateAr(third.dueDate)}.` });
      if (elapsed >= 3) {
        const travelBy = dateKey(c.travelByDate) ?? addDays(approval, 30);
        reminders.push({ ruleKey: "travel_deadline_d3", notifyStaff: true, idempotencyKey: `case:${c.id}:travel-deadline:${approval}:d3`, eventType: "travel_deadline_reminder", titleEn: "Travel deadline after approval", titleAr: "موعد السفر بعد الموافقة", bodyEn: `Please plan to travel to Spain by ${formatDate(travelBy)} to complete biometrics and the remaining legal process.`, bodyAr: `يرجى التخطيط للسفر إلى إسبانيا بحلول ${formatDateAr(travelBy)} لاستكمال البصمات والإجراءات القانونية المتبقية.` });
      }
    }
    if (biometrics && c.biometricsStatus === "confirmed" && calendarDaysBetween(today, biometrics) >= 0 && calendarDaysBetween(today, biometrics) <= 2) reminders.push({ ruleKey: "biometrics_48h", idempotencyKey: `case:${c.id}:biometrics:${biometrics}:${c.biometricsAppointmentTime || "0900"}:48h`, eventType: "biometrics_reminder", titleEn: "Biometrics appointment reminder", titleAr: "تذكير بموعد البصمات", bodyEn: `Reminder: your biometrics appointment is in 48 hours on ${formatDate(biometrics)}${c.biometricsAppointmentTime ? ` at ${c.biometricsAppointmentTime}` : ""}${c.biometricsLocation ? ` at ${c.biometricsLocation}` : ""}.`, bodyAr: `تذكير: موعد البصمات بعد 48 ساعة يوم ${formatDateAr(biometrics)}${c.biometricsAppointmentTime ? ` الساعة ${c.biometricsAppointmentTime}` : ""}${c.biometricsLocation ? ` في ${c.biometricsLocation}` : ""}.` });

    evaluated += reminders.length;
    for (const template of reminders) {
      if (await claimAndSend({ clientCaseId: c.id, portalUserId: row.portalUserId, scheduledFor: now, template })) sent += 1;
    }
  }
  await db.insert(clientReminderSettings).values({ id: 1, enabled: true, lastRunAt: now }).onDuplicateKeyUpdate({ set: { lastRunAt: now } });
  return { evaluated, sent, linkedApplications: unique.length };
}

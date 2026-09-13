import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { leadActivities, leads, spainLandingInquiries } from "../drizzle/schema";
import { normalizeMetaEmail, normalizeMetaPhone } from "./metaLeadsService";
import { findLeadContactMatch } from "./leadContactMatcher";
import { isLeadContactUniqueViolation } from "./leadContactIdentity";

export const SPAIN_LANDING_SOURCE = "Spain_landing page";
export const SPAIN_LANDING_PROGRAM = "Spain DNV";
export const SPAIN_LANDING_PULL_URL =
  "https://elevayconsult-yttdaxru.manus.space/api/trpc/integrations/spain-dnv-leads/pull";
export const SPAIN_LANDING_PULL_FALLBACK_URL =
  "https://elevayconsult-yttdaxru.manus.space/api/integrations/spain-dnv-leads/pull";

const requestSchema = z.object({
  submissionId: z.number().int().positive().max(2_147_483_647),
  pullToken: z.string().min(32).max(256),
}).strict();

export const landingPayloadSchema = z.object({
  submissionId: z.number().int().positive().max(2_147_483_647),
  fullName: z.string().trim().min(2).max(256),
  email: z.union([z.string().trim().email().max(320), z.literal(""), z.null()]).optional(),
  phoneE164: z.string().trim().min(6).max(40).regex(/^\+[1-9]\d{5,14}$/),
  phoneCountry: z.enum(["AE", "SA", "KW", "QA", "OM", "EG"]),
  language: z.enum(["en", "ar"]),
  lookingFor: z.literal("residency_investment_business_financial"),
  jobPosition: z.enum(["freelancer_or_business_owner", "employee_high_salary"]),
  feeCommitment: z.literal("yes"),
  consentConfirmed: z.literal(true),
  program: z.literal("Spain Digital Nomad Residency"),
  source: z.literal("Spain DNV qualification landing page"),
  submittedAt: z.string().datetime(),
}).strict();

type LandingPayload = z.infer<typeof landingPayloadSchema>;
type DbLike = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type QueryExecutor = { select: DbLike["select"] };

const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function allowRequest(req: Request) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = attemptsByIp.get(key);
  if (!current || current.resetAt <= now) {
    attemptsByIp.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 60;
}

function fingerprint(payload: LandingPayload) {
  return crypto.createHash("sha256").update(JSON.stringify({
    submissionId: payload.submissionId,
    fullName: payload.fullName.trim(),
    normalizedPhone: normalizeMetaPhone(payload.phoneE164),
    normalizedEmail: normalizeMetaEmail(payload.email || undefined),
    language: payload.language,
    lookingFor: payload.lookingFor,
    jobPosition: payload.jobPosition,
    feeCommitment: payload.feeCommitment,
  })).digest("hex");
}

export function resolveSpainLandingContactMatch(phoneIds: number[], emailIds: number[]) {
  if (phoneIds.length > 1 || emailIds.length > 1) {
    return { leadId: null, matchMethod: "manual_review" as const };
  }
  if (phoneIds.length === 1) {
    if (emailIds.length === 1 && emailIds[0] !== phoneIds[0]) {
      return { leadId: null, matchMethod: "manual_review" as const };
    }
    return { leadId: phoneIds[0], matchMethod: "phone" as const };
  }
  if (emailIds.length === 1) {
    return { leadId: emailIds[0], matchMethod: "email" as const };
  }
  return { leadId: null, matchMethod: "new" as const };
}

export async function pullLandingPayloadFromAliases(
  submissionId: number,
  pullToken: string,
  fetcher: typeof fetch = fetch,
) {
  const urls = [SPAIN_LANDING_PULL_URL, SPAIN_LANDING_PULL_FALLBACK_URL];
  let lastError: unknown = new Error("LANDING_PULL_UNAVAILABLE");

  for (let index = 0; index < urls.length; index += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetcher(urls[index], {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ submissionId, pullToken }),
        signal: controller.signal,
        redirect: "error",
      });
      if (response.ok) return landingPayloadSchema.parse(await response.json());

      const responseError = new Error(`LANDING_PULL_${response.status}`);
      lastError = responseError;
      if (index === 0 && [401, 403, 404, 405].includes(response.status)) continue;
      throw responseError;
    } catch (error) {
      lastError = error;
      const isTransportFailure = error instanceof TypeError
        || (error instanceof Error && error.name === "AbortError");
      if (index === 0 && isTransportFailure) continue;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function pullLandingPayload(submissionId: number, pullToken: string) {
  return pullLandingPayloadFromAliases(submissionId, pullToken);
}

async function findUniqueRealLead(db: QueryExecutor, payload: LandingPayload) {
  const match = await findLeadContactMatch({
    phone: payload.phoneE164,
    email: payload.email || undefined,
    isMetaTestLead: false,
  }, db);
  if (match.status === "ambiguous") return { leadId: null, matchMethod: "manual_review" as const };
  if (match.status === "new") return { leadId: null, matchMethod: "new" as const };
  return { leadId: match.lead.id, matchMethod: match.method };
}

export async function ingestSpainLandingSubmission(
  submissionId: number,
  pullToken: string,
  puller = pullLandingPayload,
) {
  const db = await getDb();
  if (!db) throw new Error("DB_UNAVAILABLE");

  const [existing] = await db.select().from(spainLandingInquiries)
    .where(eq(spainLandingInquiries.externalSubmissionId, submissionId)).limit(1);
  if (existing && existing.status !== "failed") {
    return {
      success: true as const,
      outcome: existing.status,
      leadId: existing.leadId,
      duplicate: true,
    };
  }

  const payload = await puller(submissionId, pullToken);
  if (payload.submissionId !== submissionId) throw new Error("SUBMISSION_ID_MISMATCH");
  const payloadFingerprint = fingerprint(payload);
  const now = Date.now();
  const processingToken = crypto.randomBytes(24).toString("hex");

  await db.insert(spainLandingInquiries).values({
    externalSubmissionId: submissionId,
    leadId: null,
    source: SPAIN_LANDING_SOURCE,
    program: SPAIN_LANDING_PROGRAM,
    language: payload.language,
    jobPosition: payload.jobPosition,
    matchMethod: "new",
    status: "processing",
    processingToken,
    payloadFingerprint,
    lastErrorCode: null,
    firstReceivedAt: now,
    processedAt: null,
    createdAt: now,
    updatedAt: now,
  }).onDuplicateKeyUpdate({
    set: { externalSubmissionId: sql`${spainLandingInquiries.externalSubmissionId}` },
  });

  let [claimed] = await db.select().from(spainLandingInquiries)
    .where(eq(spainLandingInquiries.externalSubmissionId, submissionId)).limit(1);
  if (!claimed) throw new Error("LANDING_CLAIM_FAILED");
  if (claimed.status !== "failed" && claimed.processingToken !== processingToken) {
    return { success: true as const, outcome: claimed.status, leadId: claimed.leadId, duplicate: true };
  }
  if (claimed.status === "failed") {
    await db.update(spainLandingInquiries).set({
      status: "processing",
      processingToken,
      payloadFingerprint,
      lastErrorCode: null,
      updatedAt: now,
    }).where(and(
      eq(spainLandingInquiries.id, claimed.id),
      eq(spainLandingInquiries.status, "failed"),
    ));
    [claimed] = await db.select().from(spainLandingInquiries)
      .where(eq(spainLandingInquiries.externalSubmissionId, submissionId)).limit(1);
    if (!claimed || claimed.processingToken !== processingToken) {
      return { success: true as const, outcome: "processing" as const, leadId: null, duplicate: true };
    }
  }

  try {
    return await db.transaction(async tx => {
      const [claim] = await tx.select().from(spainLandingInquiries)
        .where(eq(spainLandingInquiries.externalSubmissionId, submissionId)).limit(1);
      if (!claim || claim.processingToken !== processingToken) {
        return {
          success: true as const,
          outcome: claim?.status || "processing",
          leadId: claim?.leadId || null,
          duplicate: true,
        };
      }

      const match = await findUniqueRealLead(tx, payload);
      if (match.matchMethod === "manual_review") {
        await tx.update(spainLandingInquiries).set({
          leadId: null,
          matchMethod: "manual_review",
          status: "manual_review",
          processingToken: null,
          payloadFingerprint,
          lastErrorCode: "AMBIGUOUS_CONTACT_MATCH",
          processedAt: now,
          updatedAt: now,
        }).where(eq(spainLandingInquiries.id, claim.id));
        return { success: true as const, outcome: "manual_review" as const, leadId: null, duplicate: false };
      }

      let leadId = match.leadId;
      let outcome: "created" | "matched" = "matched";
      if (!leadId) {
        const [created] = await tx.insert(leads).values({
          fullName: payload.fullName.trim(),
          phone: payload.phoneE164,
          email: payload.email?.trim() || null,
          preferredLanguage: payload.language === "ar" ? "Arabic" : "English",
          interestedProgram: SPAIN_LANDING_PROGRAM,
          interestedCountry: "Spain",
          occupation: payload.jobPosition,
          leadSource: SPAIN_LANDING_SOURCE,
          utmSource: SPAIN_LANDING_SOURCE,
          utmMedium: "landing_page",
          utmCampaign: "spain_digital_nomad",
          normalizedPhone: normalizeMetaPhone(payload.phoneE164),
          normalizedEmail: normalizeMetaEmail(payload.email || undefined) || null,
          firstReceivedAt: now,
          gdprConsent: true,
          consentTimestamp: Date.parse(payload.submittedAt),
          dataSharingConsent: true,
          marketingOptIn: false,
          isMetaTestLead: false,
          metaSyncStatus: null,
          metaAssignmentStatus: "not_applicable",
          stage: "fresh",
          leadScore: 0,
          createdAt: now,
          updatedAt: now,
        });
        leadId = Number((created as { insertId?: number }).insertId);
        outcome = "created";
      }

      await tx.update(spainLandingInquiries).set({
        leadId,
        matchMethod: match.matchMethod,
        status: outcome,
        processingToken: null,
        payloadFingerprint,
        lastErrorCode: null,
        processedAt: now,
        updatedAt: now,
      }).where(eq(spainLandingInquiries.id, claim.id));

      await tx.insert(leadActivities).values({
        leadId,
        userId: null,
        activityType: outcome === "created" ? "created" : "other",
        description: outcome === "created"
          ? `Lead created from ${SPAIN_LANDING_SOURCE} (${payload.language.toUpperCase()}, ${payload.jobPosition})`
          : `New inquiry received from ${SPAIN_LANDING_SOURCE} (${payload.language.toUpperCase()}, ${payload.jobPosition}); existing Lead preserved`,
        score: 0,
        createdAt: now,
      });

      return { success: true as const, outcome, leadId, duplicate: false };
    });
  } catch (error) {
    if (isLeadContactUniqueViolation(error)) {
      const raceMatch = await findUniqueRealLead(db, payload);
      if (raceMatch.matchMethod === "phone" || raceMatch.matchMethod === "email") {
        return db.transaction(async tx => {
          const [claim] = await tx.select().from(spainLandingInquiries)
            .where(eq(spainLandingInquiries.externalSubmissionId, submissionId)).limit(1);
          if (!claim || claim.processingToken !== processingToken) {
            return { success: true as const, outcome: claim?.status || "processing", leadId: claim?.leadId || null, duplicate: true };
          }
          await tx.update(spainLandingInquiries).set({
            leadId: raceMatch.leadId,
            matchMethod: raceMatch.matchMethod,
            status: "matched",
            processingToken: null,
            payloadFingerprint,
            lastErrorCode: null,
            processedAt: now,
            updatedAt: now,
          }).where(eq(spainLandingInquiries.id, claim.id));
          await tx.insert(leadActivities).values({
            leadId: raceMatch.leadId!,
            userId: null,
            activityType: "other",
            description: `New inquiry received from ${SPAIN_LANDING_SOURCE}; concurrent duplicate creation prevented and existing Lead preserved`,
            score: 0,
            createdAt: now,
          });
          return { success: true as const, outcome: "matched" as const, leadId: raceMatch.leadId, duplicate: false };
        });
      }
    }
    await db.update(spainLandingInquiries).set({
      status: "failed",
      processingToken: null,
      lastErrorCode: "LANDING_PROCESSING_FAILED",
      updatedAt: Date.now(),
    }).where(and(
      eq(spainLandingInquiries.externalSubmissionId, submissionId),
      eq(spainLandingInquiries.processingToken, processingToken),
    ));
    throw error;
  }
}

export function registerSpainLandingLeadRoutes(app: Express) {
  app.post("/api/integrations/spain-landing", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, private");
    if (!allowRequest(req)) return res.status(429).json({ error: "Too many requests" });
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > 4_096) return res.status(413).json({ error: "Payload too large" });

    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid submission reference" });

    try {
      const result = await ingestSpainLandingSubmission(parsed.data.submissionId, parsed.data.pullToken);
      return res.status(result.outcome === "manual_review" ? 202 : 200).json(result);
    } catch (error) {
      const code = error instanceof Error && /^(LANDING_PULL_|SUBMISSION_ID_MISMATCH)/.test(error.message)
        ? error.message
        : "LANDING_INGESTION_FAILED";
      console.warn(`[Spain Landing Ingestion] ${code}`);
      return res.status(code.startsWith("LANDING_PULL_4") ? 401 : 503).json({ error: "Submission could not be synchronized" });
    }
  });
}

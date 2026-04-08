import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import {
  createCase, getCasesByUserId, getCaseById, updateCase, deleteCase,
  createDocument, getDocumentsByCaseId, getDocumentById, updateDocument, deleteDocument,
  upsertAnalysisResult, getAnalysisResultByCaseId,
} from "./db";

const MOFA_STAMP_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/mofa_stamp_a1afffba.png";
const SPAIN_EMBASSY_STAMP_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/spain_embassy_stamp_cf83213b.png";

// ─── Cases Router ─────────────────────────────────────────────────────────────
const casesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getCasesByUserId(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const c = await getCaseById(input.id);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      return c;
    }),

  create: protectedProcedure
    .input(z.object({
      clientName: z.string().min(1),
      clientEmail: z.string().email().optional(),
      clientNationality: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await createCase({ ...input, userId: ctx.user.id });
      const caseId = (result as any).insertId as number;
      return getCaseById(caseId);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      clientName: z.string().min(1).optional(),
      clientEmail: z.string().email().optional(),
      clientNationality: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(["draft", "in_progress", "complete", "issues_found"]).optional(),
      wizardStep: z.number().optional(),
      passportFullName: z.string().optional(),
      passportNumber: z.string().optional(),
      passportDob: z.string().optional(),
      passportPob: z.string().optional(),
      passportExpiry: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const c = await getCaseById(id);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updateCase(id, data);
      return getCaseById(id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const c = await getCaseById(input.id);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteCase(input.id);
      return { success: true };
    }),
});

// ─── Documents Router ─────────────────────────────────────────────────────────
const documentsRouter = router({
  list: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const c = await getCaseById(input.caseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      return getDocumentsByCaseId(input.caseId);
    }),

  upload: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      docType: z.enum([
        "passport_main", "passport_family", "company_owned", "client_company",
        "recommendation_letter", "freelancing_contract", "birth_certificate",
        "marriage_certificate", "police_clearance", "education_certificate", "other"
      ]),
      fileName: z.string(),
      fileBase64: z.string(),
      mimeType: z.string(),
      fileSize: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getCaseById(input.caseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "bin";
      const fileKey = `cases/${input.caseId}/${input.docType}-${nanoid(8)}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      const result = await createDocument({
        caseId: input.caseId,
        userId: ctx.user.id,
        docType: input.docType,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
      });

      const docId = (result as any).insertId as number;
      // Update case status to in_progress
      await updateCase(input.caseId, { status: "in_progress" });
      return getDocumentById(docId);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.id);
      if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteDocument(input.id);
      return { success: true };
    }),
});

// ─── Analysis Router ──────────────────────────────────────────────────────────
const analysisRouter = router({
  extractPassportData: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await getDocumentById(input.documentId);
      if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an expert passport OCR system. Extract passport data from the provided image with extreme precision. 
The passport may be in Arabic or English. Extract the EXACT spelling as it appears on the passport - do not translate or modify names.
Return a JSON object with these fields:
- fullName: exact full name as printed on passport (preserve exact spelling, capitalization, and spacing)
- dateOfBirth: in format DD/MM/YYYY
- placeOfBirth: city/country of birth
- passportNumber: exact passport number
- expiryDate: in format DD/MM/YYYY
- nationality: nationality as stated
- gender: M or F
- issuingCountry: country that issued the passport
If a field cannot be read clearly, use null.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all passport data from this passport scan with exact precision:" },
              { type: "image_url", image_url: { url: doc.fileUrl, detail: "high" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "passport_data",
            strict: true,
            schema: {
              type: "object",
              properties: {
                fullName: { type: ["string", "null"] },
                dateOfBirth: { type: ["string", "null"] },
                placeOfBirth: { type: ["string", "null"] },
                passportNumber: { type: ["string", "null"] },
                expiryDate: { type: ["string", "null"] },
                nationality: { type: ["string", "null"] },
                gender: { type: ["string", "null"] },
                issuingCountry: { type: ["string", "null"] },
              },
              required: ["fullName", "dateOfBirth", "placeOfBirth", "passportNumber", "expiryDate", "nationality", "gender", "issuingCountry"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      const data = typeof content === "string" ? JSON.parse(content) : content;

      // Update document with analysis
      await updateDocument(input.documentId, {
        analysisStatus: "pass",
        analysisResult: data,
      });

      // Update case with passport data
      if (doc.docType === "passport_main" && data.fullName) {
        await updateCase(doc.caseId, {
          passportFullName: data.fullName,
          passportNumber: data.passportNumber,
          passportDob: data.dateOfBirth,
          passportPob: data.placeOfBirth,
          passportExpiry: data.expiryDate,
        });
      }

      return data;
    }),

  runFullAnalysis: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const c = await getCaseById(input.caseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      const docs = await getDocumentsByCaseId(input.caseId);
      if (docs.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No documents uploaded" });

      // Build document list for analysis
      const docSummary = docs.map(d => ({
        id: d.id,
        type: d.docType,
        fileName: d.fileName,
        url: d.fileUrl,
        mimeType: d.mimeType,
      }));

      const passportFullName = c.passportFullName || "Unknown";

      // Build image content for all documents
      const imageContents: any[] = [];
      for (const doc of docs) {
        if (doc.mimeType?.startsWith("image/") || doc.mimeType === "application/pdf") {
          imageContents.push({
            type: "text",
            text: `\n--- Document: ${doc.docType} (${doc.fileName}) ---`,
          });
          imageContents.push({
            type: "image_url",
            image_url: { url: doc.fileUrl, detail: "high" },
          });
        }
      }

      const systemPrompt = `You are an expert immigration lawyer specializing in Spain's Digital Nomad Visa (DNV). 
You are analyzing a complete application package for quality assurance.

REFERENCE STAMPS:
- MOFA Stamp (Egypt Ministry of Foreign Affairs): ${MOFA_STAMP_URL}
- Spain Embassy Stamp: ${SPAIN_EMBASSY_STAMP_URL}

The MOFA stamp is a rectangular blue stamp in Arabic from "وزارة خارجية جمهورية مصر العربية" (Ministry of Foreign Affairs of the Arab Republic of Egypt) with "مكتب التصديقات والخدمات القنصلية للمواطنين" text.
The Spain Embassy stamp is a circular blue stamp with "EMBAJADA DE ESPAÑA SECCIÓN CONSULAR" text and contains "Visto Bueno" text.

APPLICANT: ${passportFullName}

ANALYSIS REQUIREMENTS:
1. STAMP VERIFICATION: Check for MOFA + Spain Embassy stamps on: education certificate, police clearance, company details, client company details, birth certificates, marriage certificate
2. COMPANY OWNERSHIP: Check if applicant owns ≥50% or is sole owner
3. FREELANCING ELIGIBILITY: Verify services are remote, location-independent, and DNV-eligible
4. RECOMMENDATION LETTER: Verify (a) applicant's full name matches passport exactly, (b) service description present, (c) yearly income amount stated, (d) no-objection clause for working from Spain
5. OVERALL ASSESSMENT: Score each document 0-100 and provide actionable recommendations

Return a comprehensive JSON analysis.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Please analyze all documents for this Spain DNV application. Documents uploaded: ${docSummary.map(d => d.type).join(", ")}`,
              },
              ...imageContents,
              {
                type: "text",
                text: "Provide a complete analysis in the required JSON format.",
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "analysis_report",
            strict: true,
            schema: {
              type: "object",
              properties: {
                overallScore: { type: "number", description: "0-100 overall score" },
                overallStatus: { type: "string", enum: ["pass", "fail", "needs_review"] },
                stampVerification: {
                  type: "object",
                  properties: {
                    mofaStampFound: { type: "boolean" },
                    embassyStampFound: { type: "boolean" },
                    documentsWithStamps: { type: "array", items: { type: "string" } },
                    documentsWithoutStamps: { type: "array", items: { type: "string" } },
                    details: { type: "string" },
                    score: { type: "number" },
                    status: { type: "string", enum: ["pass", "fail", "warning"] },
                  },
                  required: ["mofaStampFound", "embassyStampFound", "documentsWithStamps", "documentsWithoutStamps", "details", "score", "status"],
                  additionalProperties: false,
                },
                companyOwnership: {
                  type: "object",
                  properties: {
                    ownershipPercentage: { type: ["number", "null"] },
                    isSoleOwner: { type: "boolean" },
                    ownershipMeetsThreshold: { type: "boolean" },
                    applicantNameInDocument: { type: ["string", "null"] },
                    details: { type: "string" },
                    score: { type: "number" },
                    status: { type: "string", enum: ["pass", "fail", "warning"] },
                  },
                  required: ["ownershipPercentage", "isSoleOwner", "ownershipMeetsThreshold", "applicantNameInDocument", "details", "score", "status"],
                  additionalProperties: false,
                },
                freelancingEligibility: {
                  type: "object",
                  properties: {
                    servicesAreRemote: { type: "boolean" },
                    servicesAreLocationIndependent: { type: "boolean" },
                    servicesQualifyForDNV: { type: "boolean" },
                    serviceTypes: { type: "array", items: { type: "string" } },
                    details: { type: "string" },
                    score: { type: "number" },
                    status: { type: "string", enum: ["pass", "fail", "warning"] },
                  },
                  required: ["servicesAreRemote", "servicesAreLocationIndependent", "servicesQualifyForDNV", "serviceTypes", "details", "score", "status"],
                  additionalProperties: false,
                },
                recommendationLetter: {
                  type: "object",
                  properties: {
                    nameMatchesPassport: { type: "boolean" },
                    nameInLetter: { type: ["string", "null"] },
                    serviceDescriptionPresent: { type: "boolean" },
                    yearlyIncomeStated: { type: "boolean" },
                    yearlyIncomeAmount: { type: ["string", "null"] },
                    noObjectionClausePresent: { type: "boolean" },
                    allFourElementsPresent: { type: "boolean" },
                    details: { type: "string" },
                    score: { type: "number" },
                    status: { type: "string", enum: ["pass", "fail", "warning"] },
                  },
                  required: ["nameMatchesPassport", "nameInLetter", "serviceDescriptionPresent", "yearlyIncomeStated", "yearlyIncomeAmount", "noObjectionClausePresent", "allFourElementsPresent", "details", "score", "status"],
                  additionalProperties: false,
                },
                flaggedIssues: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      severity: { type: "string", enum: ["critical", "warning", "info"] },
                      document: { type: "string" },
                      issue: { type: "string" },
                      action: { type: "string" },
                    },
                    required: ["severity", "document", "issue", "action"],
                    additionalProperties: false,
                  },
                },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      category: { type: "string" },
                      recommendation: { type: "string" },
                    },
                    required: ["priority", "category", "recommendation"],
                    additionalProperties: false,
                  },
                },
                documentScores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      docType: { type: "string" },
                      score: { type: "number" },
                      status: { type: "string", enum: ["pass", "fail", "warning", "not_uploaded"] },
                      notes: { type: "string" },
                    },
                    required: ["docType", "score", "status", "notes"],
                    additionalProperties: false,
                  },
                },
                executiveSummary: { type: "string" },
              },
              required: [
                "overallScore", "overallStatus", "stampVerification", "companyOwnership",
                "freelancingEligibility", "recommendationLetter", "flaggedIssues",
                "recommendations", "documentScores", "executiveSummary"
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      const analysisData = typeof content === "string" ? JSON.parse(content) : content;

      // Save analysis result
      await upsertAnalysisResult({
        caseId: input.caseId,
        overallScore: analysisData.overallScore,
        overallStatus: analysisData.overallStatus,
        stampVerification: analysisData.stampVerification,
        companyOwnership: analysisData.companyOwnership,
        freelancingEligibility: analysisData.freelancingEligibility,
        recommendationLetter: analysisData.recommendationLetter,
        flaggedIssues: analysisData.flaggedIssues,
        recommendations: analysisData.recommendations,
        fullReport: JSON.stringify(analysisData),
      });

      // Update case status
      const newStatus = analysisData.overallStatus === "pass" ? "complete"
        : analysisData.overallStatus === "fail" ? "issues_found" : "in_progress";
      await updateCase(input.caseId, { status: newStatus, analysisCompleted: true });

      return analysisData;
    }),

  getResult: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const c = await getCaseById(input.caseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      return getAnalysisResultByCaseId(input.caseId);
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  cases: casesRouter,
  documents: documentsRouter,
  analysis: analysisRouter,
});

export type AppRouter = typeof appRouter;

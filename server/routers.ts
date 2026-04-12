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
  createContract, getAllContracts, getContractById, updateContractStatus, updateContractDocUrl, createInvoice, getAllInvoices, getInvoicesByContractId,
  getInvoiceById, markInvoicePaid, updateInvoicePdfUrl, createPayment,
  getTotalPaidByContractId, getContractStats, getFamilyMemberDistribution,
  getRecentContracts, getPaymentsByContractId, getNextContractSequence, getNextContractSequenceForYear,
  getConsultantStats,
} from "./db";
import { generateContractDoc, uploadContractToStorage, calculateContractValue } from "./contractGenerator";
import { getEurToEgpRate, convertEurToEgp } from "./exchangeRate";
import { generateAndUploadInvoicePdf } from "./invoiceGenerator";
import { notifyNewContract, notifyContractStatusChange, notifyReceiptPaid, sendReceiptToClient } from "./emailService";
import { generateInvoicePdfBuffer } from "./invoiceGenerator";
import {
  createClientCase, listClientCases, getClientCase, updateClientCase,
  createClientDocuments, getClientDocuments, updateClientDocument, updateClientDocumentsByIds,
} from "./db";
import { getDocChecklist } from "../shared/clientDocDefs";
import { financialRouter } from "./finRouter";
import { chatRouter, broadcastRouter } from "./chatRouter";
import { permissionsRouter } from "./permissionsRouter";

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
      // Supported: images, PDFs, Word docs (Word docs sent as file_url with correct mime)
      const imageContents: any[] = [];
      for (const doc of docs) {
        const isImage = doc.mimeType?.startsWith("image/");
        const isPdf = doc.mimeType === "application/pdf";
        const isWord = doc.mimeType === "application/msword" ||
          doc.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        imageContents.push({
          type: "text",
          text: `\n--- Document: ${doc.docType} (${doc.fileName}) ---`,
        });

        if (isImage) {
          imageContents.push({
            type: "image_url",
            image_url: { url: doc.fileUrl, detail: "high" },
          });
        } else if (isPdf) {
          imageContents.push({
            type: "file_url",
            file_url: { url: doc.fileUrl, mime_type: "application/pdf" },
          });
        } else if (isWord) {
          // For Word docs, include as file_url with correct mime type
          imageContents.push({
            type: "file_url",
            file_url: { url: doc.fileUrl, mime_type: doc.mimeType },
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

ANALYSIS RULES — FOLLOW EXACTLY:

1. STAMP VERIFICATION:
   - Check for MOFA stamp AND Spain Embassy stamp ONLY on: education certificate, police clearance, company owned by applicant, client company details, birth certificates, marriage certificate.
   - Both stamps must be present on each of these applicable documents.
   - IMPORTANT: The freelancing contract (freelancing_contract) and the recommendation letter (recommendation_letter) do NOT require any stamps. Do NOT flag missing stamps on these two documents — they are exempt from stamp requirements entirely.

2. COMPANY OWNED BY APPLICANT (company_owned):
   - If the ownership percentage is explicitly stated: check if it is ≥50%. If yes → pass. If no → fail.
   - IMPORTANT: If the ownership percentage is NOT mentioned anywhere in the document, assume the applicant is 100% sole owner → mark as PASS.
   - Additionally, check if the company has been operating/registered for MORE than 1 year. If the company is less than 1 year old → flag as a critical issue.
   - Do NOT apply ownership checks to the client company document.

3. CLIENT COMPANY (client_company):
   - Do NOT check ownership percentage for the client company.
   - CRITICAL CHECK: Search the entire client company document for the applicant's name ("${passportFullName}"). If the applicant's name appears anywhere in the client company document → this is a CRITICAL FAIL (the applicant must not be named in the client company docs).
   - Check if the client company has been operating/registered for 3 YEARS OR MORE. If less than 3 years → flag as a critical issue.

4. FREELANCING ELIGIBILITY:
   - The service qualifies if it can be performed remotely or from any location in the world without needing to be physically present in a specific place.
   - This includes (but is not limited to): software development, design, consulting, marketing, writing, translation, accounting, legal services, engineering, education, media production, data analysis, customer support, research, or any other knowledge/digital work.
   - The service does NOT qualify only if it explicitly requires physical presence at a fixed location (e.g., on-site construction, in-person medical procedures, local retail).
   - Be generous in your assessment — if in doubt, mark as eligible.

5. RECOMMENDATION LETTER:
   - Verify ALL FOUR elements are present:
     (a) Applicant's full name matches passport exactly: "${passportFullName}"
     (b) Service description is present
     (c) A specific yearly income amount is stated (e.g., "USD 60,000 per year")
     (d) A no-objection clause explicitly allowing the applicant to work from Spain
   - Only mark as PASS if all four elements are present.

6. OVERALL ASSESSMENT: Score each document 0-100 and provide actionable recommendations.

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
                    companyOperatingMoreThanOneYear: { type: "boolean" },
                    details: { type: "string" },
                    score: { type: "number" },
                    status: { type: "string", enum: ["pass", "fail", "warning"] },
                  },
                  required: ["ownershipPercentage", "isSoleOwner", "ownershipMeetsThreshold", "applicantNameInDocument", "companyOperatingMoreThanOneYear", "details", "score", "status"],
                  additionalProperties: false,
                },
                clientCompany: {
                  type: "object",
                  properties: {
                    applicantNameAbsent: { type: "boolean", description: "true if applicant name is NOT found in client company docs (good)" },
                    applicantNameFound: { type: ["string", "null"], description: "The exact text found if applicant name appears in client company docs" },
                    operatingThreeYearsOrMore: { type: "boolean", description: "true if client company has been operating for 3+ years" },
                    details: { type: "string" },
                    score: { type: "number" },
                    status: { type: "string", enum: ["pass", "fail", "warning"] },
                  },
                  required: ["applicantNameAbsent", "applicantNameFound", "operatingThreeYearsOrMore", "details", "score", "status"],
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
                "clientCompany", "freelancingEligibility", "recommendationLetter", "flaggedIssues",
                "recommendations", "documentScores", "executiveSummary"
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      const analysisData = typeof content === "string" ? JSON.parse(content) : content;

      // ─── Deterministic post-LLM validation ───────────────────────────────────
      // These rules override LLM output to guarantee business logic correctness.

      // 1. Company ownership: if % not stated, force 100% sole owner pass
      if (analysisData.companyOwnership) {
        const co = analysisData.companyOwnership;
        if (co.ownershipPercentage === null || co.ownershipPercentage === undefined) {
          co.ownershipPercentage = null; // keep null to display "assumed 100%"
          co.isSoleOwner = true;
          co.ownershipMeetsThreshold = true;
          // Only fail if company age check fails
          if (co.companyOperatingMoreThanOneYear === false) {
            co.status = "fail";
          } else {
            co.status = co.status === "fail" ? "warning" : co.status;
          }
        } else if (co.ownershipPercentage < 50) {
          co.ownershipMeetsThreshold = false;
          co.status = "fail";
        } else {
          co.ownershipMeetsThreshold = true;
        }
        // Company age check: <1 year is critical
        if (co.companyOperatingMoreThanOneYear === false) {
          co.status = "fail";
          const ageIssue = {
            severity: "critical",
            document: "company_owned",
            issue: "The applicant's company has been operating for less than 1 year.",
            action: "The company must be at least 1 year old to qualify for Spain DNV. Provide evidence of longer operation or use a different company.",
          };
          if (!analysisData.flaggedIssues) analysisData.flaggedIssues = [];
          const alreadyFlagged = analysisData.flaggedIssues.some((f: any) => f.document === "company_owned" && f.issue.includes("1 year"));
          if (!alreadyFlagged) analysisData.flaggedIssues.push(ageIssue);
        }
      }

      // 2. Client company: deterministic applicant name detection
      if (analysisData.clientCompany) {
        const cc = analysisData.clientCompany;
        // Normalize name for matching (remove diacritics, lowercase)
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
        const applicantNormalized = normalize(passportFullName);
        // Check if LLM found the name; also enforce status
        if (cc.applicantNameFound) {
          cc.applicantNameAbsent = false;
          cc.status = "fail";
          const nameIssue = {
            severity: "critical",
            document: "client_company",
            issue: `Applicant's name ("${passportFullName}") was found in the client company document.`,
            action: "The applicant must not appear in the client company's documents. This is a critical disqualifying issue for Spain DNV.",
          };
          if (!analysisData.flaggedIssues) analysisData.flaggedIssues = [];
          const alreadyFlagged = analysisData.flaggedIssues.some((f: any) => f.document === "client_company" && f.issue.includes("name"));
          if (!alreadyFlagged) analysisData.flaggedIssues.push(nameIssue);
        } else {
          cc.applicantNameAbsent = true;
        }
        // Client company age: <3 years is critical
        if (cc.operatingThreeYearsOrMore === false) {
          cc.status = "fail";
          const ageIssue = {
            severity: "critical",
            document: "client_company",
            issue: "The client company has been operating for less than 3 years.",
            action: "Spain DNV requires the client company to have at least 3 years of operation. Provide a different client company or additional evidence.",
          };
          if (!analysisData.flaggedIssues) analysisData.flaggedIssues = [];
          const alreadyFlagged = analysisData.flaggedIssues.some((f: any) => f.document === "client_company" && f.issue.includes("3 year"));
          if (!alreadyFlagged) analysisData.flaggedIssues.push(ageIssue);
        }
      }

      // 3. Recalculate overall status based on any critical fails
      const hasCriticalFail = (analysisData.flaggedIssues || []).some((f: any) => f.severity === "critical");
      if (hasCriticalFail && analysisData.overallStatus === "pass") {
        analysisData.overallStatus = "fail";
        analysisData.overallScore = Math.min(analysisData.overallScore, 59);
      }

      // Save analysis result
      await upsertAnalysisResult({
        caseId: input.caseId,
        overallScore: analysisData.overallScore,
        overallStatus: analysisData.overallStatus,
        stampVerification: analysisData.stampVerification,
        companyOwnership: analysisData.companyOwnership,
        clientCompany: analysisData.clientCompany,
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

  exportReport: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const c = await getCaseById(input.caseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await getAnalysisResultByCaseId(input.caseId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "No analysis result found. Run analysis first." });
      const report = result.fullReport ? JSON.parse(result.fullReport as string) : {};

      // Build a clean text report for PDF
      const sections: string[] = [];
      sections.push(`SPAIN DIGITAL NOMAD VISA — ANALYSIS REPORT`);
      sections.push(`Client: ${c.clientName}`);
      if (c.passportFullName) sections.push(`Passport Name: ${c.passportFullName}`);
      if (c.passportNumber) sections.push(`Passport No: ${c.passportNumber}`);
      sections.push(`Generated: ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}`);
      sections.push(`Overall Status: ${(result.overallStatus ?? "pending").toUpperCase()} | Score: ${result.overallScore ?? "N/A"}/100`);
      sections.push("");

      const addSection = (title: string, data: any) => {
        if (!data) return;
        sections.push(`--- ${title} ---`);
        if (typeof data === "object" && !Array.isArray(data)) {
          for (const [k, v] of Object.entries(data)) {
            if (v !== null && v !== undefined) sections.push(`  ${k}: ${JSON.stringify(v)}`);
          }
        } else if (Array.isArray(data)) {
          data.forEach((item: any, i: number) => {
            if (typeof item === "object") {
              sections.push(`  [${i + 1}] ${item.issue ?? item.recommendation ?? JSON.stringify(item)}`);
              if (item.action) sections.push(`      Action: ${item.action}`);
            } else {
              sections.push(`  - ${item}`);
            }
          });
        }
        sections.push("");
      };

      addSection("Stamp Verification", report.stampVerification);
      addSection("Company Ownership", report.companyOwnership);
      addSection("Client Company", report.clientCompany);
      addSection("Freelancing Eligibility", report.freelancingEligibility);
      addSection("Recommendation Letter", report.recommendationLetter);
      addSection("Flagged Issues", report.flaggedIssues);
      addSection("Recommendations", report.recommendations);

      // Generate PDF using PDFKit
      const PDFDocument = (await import("pdfkit")).default;
      const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const headerGrey = "#1e3a5f";
        const white = "#FFFFFF";
        const darkText = "#1A1A1A";
        const midGrey = "#5E6A71";

        // Header
        doc.rect(0, 0, doc.page.width, 80).fill(headerGrey);
        doc.fontSize(18).fillColor(white).font("Helvetica-Bold")
          .text("ELEVAY", 50, 18, { lineBreak: false });
        doc.fontSize(9).fillColor(white).font("Helvetica")
          .text("RESIDENCY BY INVESTMENT", 50, 40, { lineBreak: false });
        doc.fontSize(12).fillColor(white).font("Helvetica-Bold")
          .text("Spain DNV Analysis Report", 0, 28, { align: "right", width: doc.page.width - 50, lineBreak: false });

        let y = 100;
        // Client info block
        doc.fontSize(16).fillColor(darkText).font("Helvetica-Bold")
          .text(c.clientName, 50, y);
        y += 22;
        if (c.passportFullName) {
          doc.fontSize(10).fillColor(midGrey).font("Helvetica")
            .text(`Passport: ${c.passportFullName}`, 50, y);
          y += 16;
        }
        doc.fontSize(10).fillColor(midGrey).font("Helvetica")
          .text(`Generated: ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}`, 50, y);
        y += 24;

        // Status badge
        const statusColor = result.overallStatus === "pass" ? "#16a34a" : result.overallStatus === "fail" ? "#dc2626" : "#d97706";
        doc.rect(50, y, 180, 28).fill(statusColor);
        doc.fontSize(12).fillColor(white).font("Helvetica-Bold")
          .text(`${(result.overallStatus ?? "pending").toUpperCase()} — Score: ${result.overallScore ?? "N/A"}/100`, 50, y + 7, { width: 180, align: "center", lineBreak: false });
        y += 44;

        // Sections
        const renderSection = (title: string, data: any) => {
          if (!data) return;
          if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
          doc.fontSize(11).fillColor(headerGrey).font("Helvetica-Bold").text(title, 50, y);
          y += 4;
          doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).strokeColor("#e2e8f0").stroke();
          y += 10;
          if (typeof data === "object" && !Array.isArray(data)) {
            for (const [k, v] of Object.entries(data)) {
              if (v === null || v === undefined) continue;
              if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
              const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
              const val = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
              doc.fontSize(9).fillColor(midGrey).font("Helvetica-Bold").text(`${label}: `, 60, y, { continued: true, lineBreak: false });
              doc.fontSize(9).fillColor(darkText).font("Helvetica").text(val, { lineBreak: false });
              y += 14;
            }
          } else if (Array.isArray(data)) {
            data.forEach((item: any) => {
              if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
              if (typeof item === "object") {
                const text = item.issue ?? item.recommendation ?? JSON.stringify(item);
                const severity = item.severity ? ` [${item.severity.toUpperCase()}]` : "";
                doc.fontSize(9).fillColor(item.severity === "critical" ? "#dc2626" : darkText).font("Helvetica-Bold")
                  .text(`• ${text}${severity}`, 60, y, { width: doc.page.width - 120 });
                y += doc.heightOfString(`• ${text}${severity}`, { width: doc.page.width - 120 }) + 4;
                if (item.action) {
                  if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
                  doc.fontSize(8).fillColor(midGrey).font("Helvetica")
                    .text(`  Action: ${item.action}`, 70, y, { width: doc.page.width - 130 });
                  y += doc.heightOfString(`  Action: ${item.action}`, { width: doc.page.width - 130 }) + 4;
                }
              } else {
                doc.fontSize(9).fillColor(darkText).font("Helvetica").text(`• ${item}`, 60, y, { width: doc.page.width - 120 });
                y += 14;
              }
            });
          }
          y += 12;
        };

        renderSection("Stamp Verification", report.stampVerification);
        renderSection("Company Ownership", report.companyOwnership);
        renderSection("Client Company", report.clientCompany);
        renderSection("Freelancing Eligibility", report.freelancingEligibility);
        renderSection("Recommendation Letter", report.recommendationLetter);
        renderSection("Flagged Issues", report.flaggedIssues);
        renderSection("Recommendations", report.recommendations);

        // Footer
        const pageH = doc.page.height;
        doc.fontSize(8).fillColor(midGrey).font("Helvetica")
          .text("ELEVAY — Residency by Investment | Cairo, Egypt & Dubai, UAE", 50, pageH - 40, { width: doc.page.width - 100, align: "center" });

        doc.end();
      });

      const filename = `analysis_${c.clientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
      const { url } = await storagePut(`reports/${filename}`, pdfBuffer, "application/pdf");
      return { url, filename };
    }),
});

// ─── Contracting Helpers ─────────────────────────────────────────────────────
async function generateContractCode(): Promise<string> {
  const yearPrefix = new Date().getFullYear() % 100; // 26 for 2026, 27 for 2027, etc.
  const seq = await getNextContractSequenceForYear(yearPrefix);
  // Format: YY + 4-digit sequence (e.g. 260001, 260002, ... 269999)
  return `${yearPrefix}${String(seq).padStart(4, '0')}`;
}
function generateInvoiceCode(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV${year}${month}${random}`;
}

// ─── Contracting Router ───────────────────────────────────────────────────────
const contractingRouter = router({
  contracts: router({
    list: protectedProcedure.query(async () => getAllContracts()),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const contract = await getContractById(input.id);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
        return contract;
      }),
    create: protectedProcedure
      .input(z.object({
        clientName: z.string().min(2),
        invoicingName: z.string().min(2),
        clientMobile: z.string().min(5),
        familyMembers: z.number().int().min(1),
        consultantName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const contractCode = await generateContractCode();
        const contractValue = calculateContractValue(input.familyMembers);
        const { buffer, filename } = await generateContractDoc(input.clientName, input.familyMembers, contractCode);
        const docUrl = await uploadContractToStorage(buffer, contractCode, input.clientName);
        const contract = await createContract({
          contractCode, clientName: input.clientName, invoicingName: input.invoicingName,
          clientMobile: input.clientMobile, familyMembers: input.familyMembers,
          contractValue: contractValue.toString(), currency: "EUR", status: "pending",
          docUrl, consultantName: input.consultantName ?? null,
        });
        await notifyNewContract(contractCode, input.clientName, input.familyMembers, contractValue);
        return { contract, docUrl, filename };
      }),
    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pending", "signed", "cancelled"]) }))
      .mutation(async ({ input }) => {
        const contract = await getContractById(input.id);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
        await updateContractStatus(input.id, input.status);
        await notifyContractStatusChange(contract.contractCode, contract.clientName, input.status);
        // Auto-sync: when contract is signed, create financial client + commission
        if (input.status === "signed") {
          try {
            const { createFinClient, getFinClientByContractId, createCommission } = await import("./finDb");
            const existing = await getFinClientByContractId(contract.id);
            if (!existing) {
              // Extract client code from contractCode (e.g. "26027" from "26027-001")
              const codeMatch = contract.contractCode?.match(/^(\d+)/);
              const extractedCode = codeMatch ? codeMatch[1] : undefined;
              // Contract value is in EUR; new clients start with 0 paid
              const cvEur = Number(contract.contractValue ?? 0);
              const finClient = await createFinClient({
                name: contract.clientName,
                contractId: contract.id,
                contractValue: contract.contractValue,
                familyMembers: contract.familyMembers,
                consultant: contract.consultantName ?? undefined,
                clientCode: extractedCode,
                phone: contract.clientMobile ?? undefined,
                program: "Spain Nomad",
                signingDate: new Date(),
                contractValueEur: cvEur.toFixed(2),
                paidAmountEur: "0.00",
                remainingAmountEur: cvEur.toFixed(2),
                isLegacy: false,
              });
              // Auto-create commission record
              if (finClient) {
                const { countCommissions } = await import("./finDb");
                const existingCount = await countCommissions();
                await createCommission({
                  finClientId: finClient.id,
                  clientName: contract.clientName,
                  consultant: contract.consultantName ?? null,
                  contractValue: contract.contractValue,
                  seqNumber: existingCount + 1,
                  status: "Pending",
                  signingDate: new Date(),
                  leaderName: "Mahmoud Saber",
                });
              }
            }
          } catch (e) {
            console.error("[AutoSync] Failed to create financial client/commission:", e);
          }
        }
        return getContractById(input.id);
      }),
    regenerateDoc: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const contract = await getContractById(input.id);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
        const { buffer, filename } = await generateContractDoc(contract.clientName, contract.familyMembers, contract.contractCode);
        const docUrl = await uploadContractToStorage(buffer, contract.contractCode, contract.clientName);
        await updateContractDocUrl(contract.id, docUrl);
        return { docUrl, filename };
      }),
    getPaymentSummary: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .query(async ({ input }) => {
        const contract = await getContractById(input.contractId);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
        const totalPaid = await getTotalPaidByContractId(input.contractId);
        const contractValue = Number(contract.contractValue);
        return { contractValue, totalPaid, remainingBalance: contractValue - totalPaid };
      }),
  }),
  invoices: router({
    list: protectedProcedure.query(async () => getAllInvoices()),
    listByContract: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .query(async ({ input }) => getInvoicesByContractId(input.contractId)),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        return invoice;
      }),
    create: protectedProcedure
      .input(z.object({
        contractId: z.number(),
        amountEur: z.number().positive(),
        notes: z.string().min(1, "Payment notes are required"),
      }))
      .mutation(async ({ input }) => {
        const contract = await getContractById(input.contractId);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
        if (contract.status !== "signed") throw new TRPCError({ code: "BAD_REQUEST", message: "Can only create invoices for signed contracts" });
        const rateInfo = await getEurToEgpRate();
        const amountEgp = convertEurToEgp(input.amountEur, rateInfo.rate);
        const invoiceCode = generateInvoiceCode();
        const totalPaid = await getTotalPaidByContractId(input.contractId);
        const contractValue = Number(contract.contractValue);
        const remainingBalance = contractValue - totalPaid - input.amountEur;
        const billingName = contract.invoicingName || contract.clientName;
        const clientMobile = contract.clientMobile || "";
        const pdfUrl = await generateAndUploadInvoicePdf({
          invoiceCode, contractCode: contract.contractCode, clientName: billingName, clientMobile,
          amountEur: input.amountEur, amountEgp, exchangeRate: rateInfo.rate,
          contractValue, totalPaid: totalPaid + input.amountEur, remainingBalance,
          createdAt: new Date(), notes: input.notes,
        });
        const invoice = await createInvoice({
          invoiceCode, contractId: input.contractId, contractCode: contract.contractCode,
          clientName: billingName, amountEur: input.amountEur.toString(),
          amountEgp: amountEgp.toString(), exchangeRate: rateInfo.rate.toString(),
          status: "unpaid", pdfUrl, notes: input.notes,
        });
        return invoice;
      }),
    markPaid: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        if (invoice.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice already paid" });
        await markInvoicePaid(input.id);
        await createPayment({
          contractId: invoice.contractId, invoiceId: invoice.id,
          amountEur: invoice.amountEur, amountEgp: invoice.amountEgp ?? undefined,
          exchangeRate: invoice.exchangeRate ?? undefined, paidAt: new Date(),
        });
        const totalPaid = await getTotalPaidByContractId(invoice.contractId);
        const contract = await getContractById(invoice.contractId);
        const remainingBalance = Number(contract?.contractValue ?? 0) - totalPaid;
        // Auto-create Finance client if not already present for this contract
        if (contract) {
          const { createFinClient, getFinClientByContractId } = await import("./finDb");
          const existing = await getFinClientByContractId(contract.id);
          if (!existing) {
            const contractValueEur = Number(contract.contractValue ?? 0);
            const paidEur = Number(invoice.amountEur ?? 0);
            await createFinClient({
              contractId: contract.id,
              clientCode: invoice.contractCode ?? undefined,
              name: invoice.clientName,
              phone: contract.clientMobile ?? undefined,
              signingDate: contract.createdAt ? new Date(contract.createdAt) : undefined,
              consultant: contract.consultantName ?? undefined,
              salesPerson: contract.consultantName ?? undefined,
              contractValueEur: contractValueEur.toFixed(2),
              paidAmountEur: paidEur.toFixed(2),
              remainingAmountEur: (contractValueEur - paidEur).toFixed(2),
              familyMembers: contract.familyMembers ?? 0,
              isLegacy: false,
            });
          }
        }
        await notifyReceiptPaid(invoice.invoiceCode, invoice.contractCode, invoice.clientName, Number(invoice.amountEur), remainingBalance);
        return getInvoiceById(input.id);
      }),
    sendReceiptByEmail: protectedProcedure
      .input(z.object({ invoiceId: z.number(), clientEmail: z.string().email() }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        if (!invoice.pdfUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No PDF available" });
        const result = await sendReceiptToClient(input.clientEmail, invoice.clientName, invoice.invoiceCode, invoice.pdfUrl);
        if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.message });
        return result;
      }),
    regeneratePdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        const contract = await getContractById(invoice.contractId);
        const totalPaid = await getTotalPaidByContractId(invoice.contractId);
        const contractValue = Number(contract?.contractValue ?? 0);
        const rateInfo = await getEurToEgpRate();
        const amountEgp = convertEurToEgp(Number(invoice.amountEur), rateInfo.rate);
        const pdfUrl = await generateAndUploadInvoicePdf({
          invoiceCode: invoice.invoiceCode, contractCode: invoice.contractCode,
          clientName: invoice.clientName, amountEur: Number(invoice.amountEur),
          amountEgp, exchangeRate: rateInfo.rate, contractValue, totalPaid,
          remainingBalance: contractValue - totalPaid, createdAt: new Date(invoice.createdAt),
          notes: invoice.notes ?? undefined,
        });
        await updateInvoicePdfUrl(input.id, pdfUrl);
        return { pdfUrl };
      }),
  }),
  exchangeRate: router({
    current: publicProcedure.query(async () => getEurToEgpRate()),
  }),
  analytics: router({
    stats: protectedProcedure.query(async () => getContractStats()),
    familyDistribution: protectedProcedure.query(async () => getFamilyMemberDistribution()),
    recentContracts: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => getRecentContracts(input.limit ?? 10)),
    consultantStats: protectedProcedure.query(async () => getConsultantStats()),
  }),
});

/// ─── Client Documentation Router ───────────────────────────────────────────
const clientDocsRouter = router({
  // Create a new client case and auto-generate the document checklist
  create: protectedProcedure
    .input(z.object({
      clientName: z.string().min(1),
      clientCode: z.string().min(1),
      applicationType: z.enum(["freelancer", "business_owner"]),
      maritalStatus: z.enum(["single", "family"]),
      paralegal: z.enum(["Madonna", "Monica", "Marina"]),
      consultant: z.enum(["Mahmoud", "Ziad", "Fouad", "Kirolos"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await createClientCase({ ...input, userId: ctx.user.id });
      const insertId = (result as any).insertId as number;
      const checklist = getDocChecklist(input.applicationType, input.maritalStatus);
      const docs = checklist.map(d => ({
        clientCaseId: insertId,
        docKey: d.docKey,
        docName: d.docName,
        category: d.category,
        expirationMonths: d.expirationMonths,
        requiresMofa: d.requiresMofa,
        requiresEmbassy: d.requiresEmbassy,
      }));
      await createClientDocuments(docs);
      return { id: insertId };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return listClientCases(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const c = await getClientCase(input.id);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const docs = await getClientDocuments(input.id);
      return { ...c, documents: docs };
    }),

  // Mark selected documents as received with their issue date
  receiveDocuments: protectedProcedure
    .input(z.object({
      clientCaseId: z.number(),
      items: z.array(z.object({
        docId: z.number(),
        receivedDate: z.string(), // ISO date string
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.clientCaseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      for (const item of input.items) {
        await updateClientDocument(item.docId, {
          received: true,
          receivedDate: new Date(item.receivedDate),
        });
      }
      return { success: true };
    }),

  // Mark selected received documents as MOFA attested
  markMofa: protectedProcedure
    .input(z.object({
      clientCaseId: z.number(),
      docIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.clientCaseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updateClientDocumentsByIds(input.docIds, {
        mofaAttested: true,
        mofaAttestedDate: new Date(),
      });
      return { success: true };
    }),

  // Mark selected received documents as Embassy attested
  markEmbassy: protectedProcedure
    .input(z.object({
      clientCaseId: z.number(),
      docIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.clientCaseId);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updateClientDocumentsByIds(input.docIds, {
        embassyAttested: true,
        embassyAttestedDate: new Date(),
      });
      return { success: true };
    }),

  // Set appointment / submission dates
  setDates: protectedProcedure
    .input(z.object({
      id: z.number(),
      schengenDate: z.string().nullable().optional(),
      embassyAppointmentDate: z.string().nullable().optional(),
      expectedSubmissionDate: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.id);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const update: Record<string, Date | null> = {};
      if (input.schengenDate !== undefined)
        update.schengenDate = input.schengenDate ? new Date(input.schengenDate) : null;
      if (input.embassyAppointmentDate !== undefined)
        update.embassyAppointmentDate = input.embassyAppointmentDate ? new Date(input.embassyAppointmentDate) : null;
      if (input.expectedSubmissionDate !== undefined)
        update.expectedSubmissionDate = input.expectedSubmissionDate ? new Date(input.expectedSubmissionDate) : null;
      await updateClientCase(input.id, update as any);
      return { success: true };
    }),

  // Full client report: remaining docs + pending procedures
  report: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const c = await getClientCase(input.id);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const docs = await getClientDocuments(input.id);

      const notReceived = docs.filter(d => !d.received);
      const receivedNotMofa = docs.filter(d => d.received && d.requiresMofa && !d.mofaAttested);
      const receivedNotEmbassy = docs.filter(d => d.received && d.requiresEmbassy && !d.embassyAttested);

      // Compute expiry warnings for received docs
      const expiryWarnings = docs
        .filter(d => d.received && d.receivedDate && d.expirationMonths)
        .map(d => {
          const expiryDate = new Date(d.receivedDate!);
          expiryDate.setMonth(expiryDate.getMonth() + d.expirationMonths!);
          const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return { ...d, expiryDate: expiryDate.toISOString(), daysLeft };
        })
        .filter(d => d.daysLeft <= 30)
        .sort((a, b) => a.daysLeft - b.daysLeft);

      const totalDocs = docs.length;
      const receivedCount = docs.filter(d => d.received).length;
      const mofaComplete = docs.filter(d => !d.requiresMofa || d.mofaAttested).length;
      const embassyComplete = docs.filter(d => !d.requiresEmbassy || d.embassyAttested).length;

      return {
        clientCase: c,
        summary: { totalDocs, receivedCount, mofaComplete, embassyComplete },
        notReceived,
        receivedNotMofa,
        receivedNotEmbassy,
        expiryWarnings,
        allDocuments: docs,
      };
    }),

  // Update client stage and stage-specific fields
  updateStage: protectedProcedure
    .input(z.object({
      id: z.number(),
      stage: z.enum(["preparation", "submission", "approved"]),
      // Submission stage fields
      submissionDate: z.string().nullable().optional(),
      translationDate: z.string().nullable().optional(),
      // Approved stage fields
      approvalDate: z.string().nullable().optional(),
      settlementFeeAmount: z.string().nullable().optional(),
      settlementFeeDate: z.string().nullable().optional(),
      biometricsDate: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.id);
      if (!c || c.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      const update: Record<string, any> = { stage: input.stage };

      if (input.stage === "submission") {
        if (input.submissionDate !== undefined)
          update.submissionDate = input.submissionDate ? new Date(input.submissionDate) : null;
        if (input.translationDate !== undefined)
          update.translationDate = input.translationDate ? new Date(input.translationDate) : null;
        // Auto-calculate expectedApprovalDate = submissionDate + 25 working days
        if (input.submissionDate) {
          const start = new Date(input.submissionDate);
          let workingDays = 0;
          const cursor = new Date(start);
          while (workingDays < 25) {
            cursor.setDate(cursor.getDate() + 1);
            const dow = cursor.getDay();
            if (dow !== 0 && dow !== 6) workingDays++; // skip Sat/Sun
          }
          update.expectedApprovalDate = cursor;
        }
      }

      if (input.stage === "approved") {
        if (input.approvalDate !== undefined)
          update.approvalDate = input.approvalDate ? new Date(input.approvalDate) : null;
        if (input.settlementFeeAmount !== undefined)
          update.settlementFeeAmount = input.settlementFeeAmount ?? null;
        if (input.settlementFeeDate !== undefined)
          update.settlementFeeDate = input.settlementFeeDate ? new Date(input.settlementFeeDate) : null;
        if (input.biometricsDate !== undefined)
          update.biometricsDate = input.biometricsDate ? new Date(input.biometricsDate) : null;
      }

      await updateClientCase(input.id, update as any);
      return { success: true };
    }),

  // Dashboard: per-client completion overview
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const cases = await listClientCases(ctx.user.id);
    const results = await Promise.all(
      cases.map(async (c) => {
        const docs = await getClientDocuments(c.id);
        const total = docs.length;
        const received = docs.filter(d => d.received).length;
        const mofaDone = docs.filter(d => !d.requiresMofa || d.mofaAttested).length;
        const embassyDone = docs.filter(d => !d.requiresEmbassy || d.embassyAttested).length;
        // Overall completion: average of receive%, mofa%, embassy%
        const receiveP = total > 0 ? Math.round((received / total) * 100) : 0;
        const mofaP = total > 0 ? Math.round((mofaDone / total) * 100) : 0;
        const embassyP = total > 0 ? Math.round((embassyDone / total) * 100) : 0;
        const overallP = Math.round((receiveP + mofaP + embassyP) / 3);
        // Upcoming deadlines
        const today = new Date();
        const daysUntil = (d: Date | null) => d ? Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
        // On-time approval check
        let approvedOnTime: boolean | null = null;
        if (c.stage === "approved" && c.approvalDate && c.expectedApprovalDate) {
          approvedOnTime = new Date(c.approvalDate) <= new Date(c.expectedApprovalDate);
        }
        return {
          id: c.id,
          clientName: c.clientName,
          clientCode: c.clientCode,
          applicationType: c.applicationType,
          maritalStatus: c.maritalStatus,
          paralegal: c.paralegal,
          consultant: c.consultant,
          stage: c.stage,
          totalDocs: total,
          receivedDocs: received,
          receivePercent: receiveP,
          mofaPercent: mofaP,
          embassyPercent: embassyP,
          overallPercent: overallP,
          schengenDate: c.schengenDate,
          embassyAppointmentDate: c.embassyAppointmentDate,
          expectedSubmissionDate: c.expectedSubmissionDate,
          submissionDate: c.submissionDate,
          expectedApprovalDate: c.expectedApprovalDate,
          approvalDate: c.approvalDate,
          daysToSchengen: daysUntil(c.schengenDate),
          daysToSubmission: daysUntil(c.expectedSubmissionDate),
          approvedOnTime,
        };
      })
    );
    // Approval stats
    const approvedCases = results.filter(r => r.stage === "approved");
    const onTimeCount = approvedCases.filter(r => r.approvedOnTime === true).length;
    const onTimePercent = approvedCases.length > 0 ? Math.round((onTimeCount / approvedCases.length) * 100) : null;
    return {
      clients: results,
      stats: {
        total: results.length,
        preparation: results.filter(r => r.stage === "preparation").length,
        submission: results.filter(r => r.stage === "submission").length,
        approved: approvedCases.length,
        onTimePercent,
      },
    };
  }),
});
// ─── App Routerr ─────────────────────────────────────────────────────────────
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
  contracting: contractingRouter,
  clientDocs: clientDocsRouter,
  financial: financialRouter,
  chat: chatRouter,
  broadcast: broadcastRouter,
  permissions: permissionsRouter,
});
export type AppRouter = typeof appRouter;

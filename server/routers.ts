import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { leadsRouter } from "./routers/leads";
import { leadsSettingsRouter } from "./routers/leadsSettings";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import {
  createCase, getCasesByUserId, getCaseById, updateCase, deleteCase,
  createDocument, getDocumentsByCaseId, getDocumentById, updateDocument, deleteDocument,
  upsertAnalysisResult, getAnalysisResultByCaseId,
  createContract, getAllContracts, getContractById, updateContractStatus, updateContractConsultant, updateContractDocUrl, applyContractDiscount, createInvoice, getAllInvoices, getInvoicesByContractId,
  getInvoiceById, markInvoicePaid, updateInvoiceReceiptDate, updateInvoicePdfUrl, deleteInvoice, createPayment,
  getTotalPaidByContractId, getContractStats, getFamilyMemberDistribution,
  getRecentContracts, getPaymentsByContractId, getNextContractSequence, getNextContractSequenceForYear,
  getConsultantStats,
  getMonthlyRevenue,
  getFilteredContracts,
  createProformaInvoice, getAllProformaInvoices, getProformaInvoiceById, markProformaInvoicePaid, updateProformaInvoicePdfUrl,
  deleteContract, deleteProformaInvoice,
  recalcClientPaidFromReceipts, recalcLegacyClientPaidFromReceipts,
} from "./db";
import { generateContractDoc, uploadContractToStorage, calculateContractValue, CONTRACT_COUNTRIES } from "./contractGenerator";
import { getEurToEgpRate, convertEurToEgp } from "./exchangeRate";
import { generateAndUploadInvoicePdf } from "./invoiceGenerator";
import { generateAndUploadProformaPdf } from "./proformaGenerator";
import { notifyNewContract, notifyContractStatusChange, notifyReceiptPaid, sendReceiptToClient, notifyNewInvoice, notifyFinClientAdded, notifyNewClientAssigned } from "./emailService";
import { sendEmail } from "./backupEmailService";
import { generateInvoicePdfBuffer } from "./invoiceGenerator";
import {
  createClientCase, listClientCases, getClientCase, updateClientCase, deleteClientCase,
  createClientDocuments, getClientDocuments, updateClientDocument, updateClientDocumentsByIds,
  createClientWorkflow, listClientWorkflows, getClientWorkflowById, deleteClientWorkflow, updateClientWorkflow,
} from "./db";
import { getDocChecklist, ChildEntry, getArabicDocName } from "../shared/clientDocDefs";
import { generateChecklistDocx } from "./checklistDocxGenerator";
import { generateWorkflowDocx } from "./workflowDocxGenerator";
import { financialRouter } from "./finRouter";
import { settlementRouter } from "./settlementRouter";
import { chatRouter, broadcastRouter } from "./chatRouter";
import { permissionsRouter } from "./permissionsRouter";
import { adminRouter } from "./routers/admin";
import { waQcRouter } from "./waQcRouter";
import { marketingRouter } from "./marketingRouter";
import { reportsRouter } from "./routers/reports";
import { backupsRouter } from "./routers/backups";
import { backupDownloadRouter } from "./routers/backupDownload";
import { aiCouncilRouter } from "./aiCouncilRouter";
import { clientPortalAdminRouter } from "./clientPortalAdminRouter";
import {
  addClientDocumentationPayment,
  archiveClientDocumentationPayment,
  createClientDocumentationBundle,
  getClientDocumentationPaymentSchedule,
  markClientDocumentationPaymentPaid,
  setClientDocumentationContractDriveLink,
  updateClientDocumentationPayment,
} from "./clientDocumentationPaymentsService";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import {
  recordClientDocumentAuthorityMilestone,
  recordSpainCaseMilestone,
  setClientDocumentEvidenceLink,
  updateSpainCaseStage,
} from "./clientDocumentationSpainWorkflow";

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
  // Format: YY + 3-digit sequence (e.g. 26001, 26002, ... 26999)
  return `${yearPrefix}${String(seq).padStart(3, '0')}`;
}
function generateInvoiceCode(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV${year}${month}${random}`;
}

function parseReceiptDate(value: string): Date {
  const receiptDate = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(receiptDate.getTime()) || receiptDate.toISOString().slice(0, 10) !== value) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid receipt date" });
  }
  return receiptDate;
}

type StoredInvoice = NonNullable<Awaited<ReturnType<typeof getInvoiceById>>>;

async function regenerateStoredReceiptPdf(invoice: StoredInvoice): Promise<string> {
  const rateInfo = await getEurToEgpRate();
  const amountEgp = invoice.amountEgp
    ? Number(invoice.amountEgp)
    : convertEurToEgp(Number(invoice.amountEur), rateInfo.rate);
  const exchangeRate = invoice.exchangeRate ? Number(invoice.exchangeRate) : rateInfo.rate;
  let contractValue = 0;
  let totalPaid = 0;
  let remainingBalance = 0;
  let clientMobile: string | undefined;

  if (invoice.contractId != null) {
    const contract = await getContractById(invoice.contractId);
    contractValue = Number(contract?.contractValue ?? 0);
    totalPaid = await getTotalPaidByContractId(invoice.contractId);
    remainingBalance = Math.max(0, contractValue - totalPaid);
    clientMobile = contract?.clientMobile ?? undefined;
  } else if (invoice.legacyFinClientId != null) {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (db) {
      const { finClients } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [client] = await db.select().from(finClients).where(eq(finClients.id, invoice.legacyFinClientId)).limit(1);
      if (client) {
        contractValue = Number(client.contractValueEur ?? 0);
        totalPaid = Number(client.paidAmountEur ?? 0);
        remainingBalance = Math.max(0, contractValue - totalPaid);
      }
    }
  }

  return generateAndUploadInvoicePdf({
    invoiceCode: invoice.invoiceCode,
    contractCode: invoice.contractCode ?? undefined,
    clientName: invoice.clientName,
    clientMobile,
    amountEur: Number(invoice.amountEur),
    amountEgp,
    exchangeRate,
    contractValue,
    totalPaid,
    remainingBalance,
    createdAt: new Date(invoice.receiptDate ?? invoice.createdAt),
    notes: invoice.notes ?? undefined,
    actualPaidAmountEgp: invoice.actualPaidAmountEgp ? Number(invoice.actualPaidAmountEgp) : undefined,
    remainingAmountEgp: invoice.remainingAmountEgp ? Number(invoice.remainingAmountEgp) : undefined,
  });
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
        country: z.string().default("spain"),
        contractValueOverride: z.number().optional(),
        currency: z.enum(["EUR", "USD"]).default("EUR"),
      }))
      .mutation(async ({ input }) => {
        const contractCode = await generateContractCode();
        const contractValue = input.contractValueOverride !== undefined
          ? input.contractValueOverride
          : calculateContractValue(input.familyMembers, input.country);
        const { buffer, filename } = await generateContractDoc(
          input.clientName, input.familyMembers, contractCode,
          input.country, input.contractValueOverride
        );
        const docUrl = await uploadContractToStorage(buffer, contractCode, input.clientName);
        const contract = await createContract({
          contractCode, clientName: input.clientName, invoicingName: input.invoicingName,
          clientMobile: input.clientMobile, familyMembers: input.familyMembers,
          contractValue: contractValue.toString(), currency: input.currency, status: "pending",
          country: input.country,
          docUrl, consultantName: input.consultantName ?? null,
        });
        await notifyNewContract(contractCode, input.clientName, input.familyMembers, contractValue);
        const { createNotification } = await import("./db");
        await createNotification({ type: "contract_created", title: "📄 عقد جديد", body: `تم إنشاء عقد جديد لـ ${input.clientName} (كود: ${contractCode})`, entityId: contract.id, entityType: "contract" });
        return { contract, docUrl, filename };
      }),
    getCountries: protectedProcedure.query(() => CONTRACT_COUNTRIES),
    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pending", "signed", "cancelled"]) }))
      .mutation(async ({ input }) => {
        const contract = await getContractById(input.id);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
        await updateContractStatus(input.id, input.status);
        await notifyContractStatusChange(contract.contractCode, contract.clientName, input.status);
        if (input.status === "signed") {
          const { createNotification: cn } = await import("./db");
          await cn({ type: "contract_signed", title: "✅ عقد موقّع", body: `تم توقيع عقد ${contract.clientName} (كود: ${contract.contractCode})`, entityId: contract.id, entityType: "contract" });
        } else if (input.status === "cancelled") {
          const { createNotification: cn } = await import("./db");
          await cn({ type: "contract_cancelled", title: "❌ عقد ملغي", body: `تم إلغاء عقد ${contract.clientName} (كود: ${contract.contractCode})`, entityId: contract.id, entityType: "contract" });
        }
        // Auto-sync: when contract is signed, create financial client + commission
        if (input.status === "signed") {
          try {
            const { createFinClient, getFinClientByContractId, createCommission } = await import("./finDb");
            const existing = await getFinClientByContractId(contract.id);
            if (!existing) {
              // Extract client code from contractCode (e.g. "26027" from "26027-001")
              const codeMatch = contract.contractCode?.match(/^(\d+)/);
              const extractedCode = codeMatch ? codeMatch[1] : undefined;
              // contractValue is already the net value (applyContractDiscount reduces it in-place)
              const netCvEur = Number(contract.contractValue ?? 0);
              const finClient = await createFinClient({
                name: contract.invoicingName ?? contract.clientName,
                contractId: contract.id,
                contractValue: netCvEur.toFixed(2),
                familyMembers: contract.familyMembers,
                consultant: contract.consultantName ?? undefined,
                clientCode: extractedCode,
                phone: contract.clientMobile ?? undefined,
                program: "Spain Nomad",
                signingDate: undefined, // Will be set when first receipt is marked as paid
                contractValueEur: netCvEur.toFixed(2),
                paidAmountEur: "0.00",
                remainingAmountEur: netCvEur.toFixed(2),
                isLegacy: false,
              });
              // Auto-create commission record
              if (finClient) {
                const { countCommissions } = await import("./finDb");
                const existingCount = await countCommissions();
                await createCommission({
                  finClientId: finClient.id,
                  clientName: contract.invoicingName ?? contract.clientName,
                  consultant: contract.consultantName ?? null,
                  contractValue: contract.contractValue,
                  seqNumber: existingCount + 1,
                  status: "Pending",
                  signingDate: undefined, // Will be set when first receipt is marked as paid
                  leaderName: "Mahmoud Saber",
                });
              }
            }
          } catch (e) {
            console.error("[AutoSync] Failed to create financial client/commission:", e);
          }
          try {
            const { enqueueMetaConvertedForSignedContract, shouldEnqueueMetaConverted } = await import("./metaLeadsService");
            if (shouldEnqueueMetaConverted(contract.status, input.status)) {
              await enqueueMetaConvertedForSignedContract({
                contractId: contract.id,
                clientName: contract.clientName,
                clientPhone: contract.clientMobile,
                contractValue: Number(contract.contractValue || 0),
                currency: contract.currency,
                signedAt: Date.now(),
              });
            }
          } catch (e) {
            console.error("[MetaCRM] Failed to enqueue signed-contract conversion:", e);
          }
        }
        return getContractById(input.id);
      }),
    updateConsultant: protectedProcedure
      .input(z.object({
        id: z.number(),
        consultantName: z.enum(["Mahmoud Saber", "Fouad Abdo", "Ziad El Shurafa", "Kirolos Nabil"]),
      }))
      .mutation(async ({ input }) => {
        const contract = await getContractById(input.id);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

        await updateContractConsultant(input.id, input.consultantName);
        const { syncConsultantForContract } = await import("./finDb");
        const sync = await syncConsultantForContract(input.id, input.consultantName);

        return {
          contract: await getContractById(input.id),
          sync,
        };
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
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const contract = await getContractById(input.id);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
        await deleteContract(input.id);
        return { success: true };
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
        discountValue: z.number().min(0).optional(),
        actualPaidAmountEgp: z.number().min(0).optional(),
        receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .mutation(async ({ input }) => {
        const contract = await getContractById(input.contractId);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
        // Invoices are allowed for contracts in any status to support legacy clients
        // Apply one-time discount if provided (permanently reduces contract value)
        if (input.discountValue && input.discountValue > 0) {
          if (Number(contract.discountValue ?? 0) > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "A discount has already been applied to this contract and cannot be changed." });
          }
          await applyContractDiscount(input.contractId, input.discountValue);
          // Re-fetch contract to get updated value
          const updated = await getContractById(input.contractId);
          if (updated) Object.assign(contract, updated);
        }
        const rateInfo = await getEurToEgpRate();
        const amountEgp = convertEurToEgp(input.amountEur, rateInfo.rate);
        const invoiceCode = generateInvoiceCode();
        const receiptDate = input.receiptDate ? parseReceiptDate(input.receiptDate) : new Date();
        const totalPaid = await getTotalPaidByContractId(input.contractId);
        // contractValue is already net (applyContractDiscount reduces it in-place — do NOT subtract discountValue again)
        const contractValue = Number(contract.contractValue);
        // Calculate the EUR equivalent of this payment (if partial EGP payment, use that)
        const actualPaidEgp = input.actualPaidAmountEgp ?? undefined;
        const remainingEgp = actualPaidEgp != null ? Math.max(0, amountEgp - actualPaidEgp) : undefined;
        const thisPaymentEur = (actualPaidEgp != null && rateInfo.rate > 0)
          ? Math.round((actualPaidEgp / rateInfo.rate) * 100) / 100
          : input.amountEur;
        const remainingBalance = contractValue - totalPaid - thisPaymentEur;
        const billingName = contract.invoicingName || contract.clientName;
        const clientMobile = contract.clientMobile || "";
        const pdfUrl = await generateAndUploadInvoicePdf({
          invoiceCode, contractCode: contract.contractCode, clientName: billingName, clientMobile,
          amountEur: input.amountEur, amountEgp, exchangeRate: rateInfo.rate,
          contractValue, totalPaid: totalPaid + thisPaymentEur, remainingBalance,
          createdAt: receiptDate, notes: input.notes,
          actualPaidAmountEgp: actualPaidEgp,
          remainingAmountEgp: remainingEgp,
        });
        const invoice = await createInvoice({
          invoiceCode, contractId: input.contractId, contractCode: contract.contractCode,
          clientName: billingName, amountEur: input.amountEur.toString(),
          amountEgp: amountEgp.toString(), exchangeRate: rateInfo.rate.toString(),
          status: "unpaid", pdfUrl, notes: input.notes,
          receiptDate,
          actualPaidAmountEgp: actualPaidEgp != null ? actualPaidEgp.toString() : undefined,
          remainingAmountEgp: remainingEgp != null ? remainingEgp.toString() : undefined,
        });
        // Notify team that a new invoice was created
        notifyNewInvoice(
          invoiceCode,
          contract.contractCode,
          billingName,
          input.amountEur,
          remainingBalance
        ).catch(() => {});
        const { createNotification: cnInv } = await import("./db");
        await cnInv({ type: "receipt_created", title: "🧳 إيصال جديد", body: `تم إنشاء إيصال ${invoiceCode} لـ ${billingName} بمبلغ €${input.amountEur}`, entityId: invoice.id, entityType: "invoice" });
        return invoice;
      }),
    markPaid: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        if (invoice.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice already paid" });
        await markInvoicePaid(input.id);
        // Calculate actual paid EUR: if client paid partial EGP, convert to EUR equivalent
        const invoiceExchangeRate = Number(invoice.exchangeRate ?? 0);
        const actualPaidEgp = invoice.actualPaidAmountEgp ? Number(invoice.actualPaidAmountEgp) : null;
        let actualPaidEur: number;
        if (actualPaidEgp != null && invoiceExchangeRate > 0) {
          // Client paid partial EGP → convert to EUR equivalent
          actualPaidEur = Math.round((actualPaidEgp / invoiceExchangeRate) * 100) / 100;
        } else {
          // No partial payment → full receipt EUR amount was paid
          actualPaidEur = Number(invoice.amountEur ?? 0);
        }
        // For legacy receipts: skip contract-based logic
        if (!invoice.isLegacyReceipt && invoice.contractId != null) {
          await createPayment({
            contractId: invoice.contractId, invoiceId: invoice.id,
            amountEur: actualPaidEur.toFixed(2), amountEgp: actualPaidEgp != null ? actualPaidEgp.toString() : (invoice.amountEgp ?? undefined),
            exchangeRate: invoice.exchangeRate ?? undefined, paidAt: new Date(),
          });
        }
        const totalPaid = invoice.contractId != null ? await getTotalPaidByContractId(invoice.contractId) : 0;
        const contract = invoice.contractId != null ? await getContractById(invoice.contractId) : null;
        const remainingBalance = Number(contract?.contractValue ?? 0) - totalPaid;
        // Auto-create Finance client if not already present for this contract (skip for legacy receipts)
        if (!invoice.isLegacyReceipt && contract) {
          const { createFinClient, getFinClientByContractId } = await import("./finDb");
          const existing = await getFinClientByContractId(contract.id);
          if (!existing) {
            const contractValueEur = Number(contract.contractValue ?? 0);
            const paidEur = actualPaidEur;
            await createFinClient({
              contractId: contract.id,
              clientCode: invoice.contractCode ?? undefined,
              name: invoice.clientName,
              phone: contract.clientMobile ?? undefined,
              signingDate: new Date(), // Signing date = date first receipt is marked as paid
              consultant: contract.consultantName ?? undefined,
              salesPerson: contract.consultantName ?? undefined,
              contractValueEur: contractValueEur.toFixed(2),
              paidAmountEur: paidEur.toFixed(2),
              remainingAmountEur: (contractValueEur - paidEur).toFixed(2),
              familyMembers: contract.familyMembers ?? 0,
              isLegacy: false,
            });
            // Notify team that a Finance client was auto-created from paid receipt
            notifyFinClientAdded(
              invoice.clientName,
              invoice.contractCode ?? undefined,
              contract.consultantName ?? undefined,
              contractValueEur,
              "auto"
            ).catch(() => {});
          } else if (existing && !existing.signingDate) {
            // If finClient exists but has no signing date, set it now (first receipt paid)
            const { updateFinClient } = await import("./finDb");
            await updateFinClient(existing.id, { signingDate: new Date() });
          }
        }
        await notifyReceiptPaid(invoice.invoiceCode, invoice.contractCode ?? "—", invoice.clientName, Number(invoice.amountEur), remainingBalance);
        const { createNotification: cnPaid } = await import("./db");
        await cnPaid({ type: "receipt_paid", title: "✅ إيصال مدفوع", body: `تم تسجيل دفع الإيصال ${invoice.invoiceCode} لـ ${invoice.clientName} بمبلغ €${Number(invoice.amountEur).toFixed(2)}`, entityId: invoice.id, entityType: "invoice" });
        // Recalculate client paid amount from all paid receipts (single source of truth)
        if (!invoice.isLegacyReceipt && invoice.contractId != null) {
          await recalcClientPaidFromReceipts(invoice.contractId);
        }
        return getInvoiceById(input.id);
      }),
    createLegacy: protectedProcedure
      .input(z.object({
        legacyFinClientId: z.number(),
        amountEur: z.number().positive(),
        amountEgp: z.number().positive().optional(),
        notes: z.string().optional(),
        actualPaidAmountEgp: z.number().min(0).optional(),
        receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .mutation(async ({ input }) => {
        const { listFinClients } = await import("./finDb");
        const clients = await listFinClients({ limit: 1, offset: 0 });
        // Fetch the specific client
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { finClients } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [client] = await db.select().from(finClients).where(eq(finClients.id, input.legacyFinClientId)).limit(1);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Finance client not found" });
        const rateInfo = await getEurToEgpRate();
        const amountEgp = input.amountEgp ?? convertEurToEgp(input.amountEur, rateInfo.rate);
        const invoiceCode = generateInvoiceCode();
        const receiptDate = input.receiptDate ? parseReceiptDate(input.receiptDate) : new Date();
        const actualPaidEgp = input.actualPaidAmountEgp ?? undefined;
        const remainingEgp = actualPaidEgp != null ? Math.max(0, amountEgp - actualPaidEgp) : undefined;
        // Use finClient financial data for the PDF summary table
        const finContractValue = Number(client.contractValueEur ?? 0);
        // Total paid = existing paidAmountEur + actual EUR equivalent of this payment
        const thisPaymentEur = (actualPaidEgp != null && rateInfo.rate > 0)
          ? Math.round((actualPaidEgp / rateInfo.rate) * 100) / 100
          : input.amountEur;
        const finTotalPaid = Number(client.paidAmountEur ?? 0) + thisPaymentEur;
        const finRemainingBalance = Math.max(0, finContractValue - finTotalPaid);
        const pdfUrl = await generateAndUploadInvoicePdf({
          invoiceCode,
          clientName: client.name,
          amountEur: input.amountEur,
          amountEgp,
          exchangeRate: rateInfo.rate,
          contractValue: finContractValue,
          totalPaid: finTotalPaid,
          remainingBalance: finRemainingBalance,
          createdAt: receiptDate,
          notes: input.notes,
          actualPaidAmountEgp: actualPaidEgp,
          remainingAmountEgp: remainingEgp,
        });
        const invoice = await createInvoice({
          invoiceCode,
          contractId: undefined,
          contractCode: undefined,
          clientName: client.name,
          amountEur: input.amountEur.toString(),
          amountEgp: amountEgp.toString(),
          exchangeRate: rateInfo.rate.toString(),
          status: "unpaid",
          pdfUrl,
          notes: input.notes,
          receiptDate,
          isLegacyReceipt: true,
          legacyFinClientId: input.legacyFinClientId,
          actualPaidAmountEgp: actualPaidEgp != null ? actualPaidEgp.toString() : undefined,
          remainingAmountEgp: remainingEgp != null ? remainingEgp.toString() : undefined,
        });
        notifyNewInvoice(
          invoiceCode,
          `Legacy — ${client.clientCode ?? client.name}`,
          client.name,
          input.amountEur,
          0
        ).catch(() => {});
        return invoice;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        const contractId = invoice.contractId;
        const legacyFinClientId = invoice.legacyFinClientId;
        // If this was a paid invoice, also delete its payment record
        if (invoice.status === "paid" && contractId != null) {
          const { getDb } = await import("./db");
          const db2 = await getDb();
          if (db2) {
            const { payments } = await import("../drizzle/schema");
            const { eq: eqOp } = await import("drizzle-orm");
            await db2.delete(payments).where(eqOp(payments.invoiceId, input.id));
          }
        }
        await deleteInvoice(input.id);
        // Recalculate client paid amount after deletion
        if (contractId != null) {
          await recalcClientPaidFromReceipts(contractId);
        } else if (legacyFinClientId != null) {
          await recalcLegacyClientPaidFromReceipts(legacyFinClientId);
        }
        return { success: true };
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
    updateDate: protectedProcedure
      .input(z.object({
        id: z.number(),
        receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        const receiptDate = parseReceiptDate(input.receiptDate);
        await updateInvoiceReceiptDate(input.id, receiptDate);
        const updatedInvoice = await getInvoiceById(input.id);
        if (!updatedInvoice) throw new TRPCError({ code: "NOT_FOUND" });
        const pdfUrl = await regenerateStoredReceiptPdf(updatedInvoice);
        await updateInvoicePdfUrl(input.id, pdfUrl);
        return getInvoiceById(input.id);
      }),
    regeneratePdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        const pdfUrl = await regenerateStoredReceiptPdf(invoice);
        await updateInvoicePdfUrl(input.id, pdfUrl);
        return { pdfUrl };
      }),
  }),
  proformaInvoices: router({
    list: protectedProcedure.query(async () => getAllProformaInvoices()),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const inv = await getProformaInvoiceById(input.id);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
        return inv;
      }),
    create: protectedProcedure
      .input(z.object({
        contractId: z.number().optional(),
        amountEur: z.number().positive(),
        notes: z.string().optional(),
        legacyFinClientId: z.number().optional(),
        isLegacy: z.boolean().optional(),
        legacyAmountEgp: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const rateInfo = await getEurToEgpRate();
        let clientName = "Unknown";
        let contractCode: string | undefined;
        if (input.contractId) {
          const contract = await getContractById(input.contractId);
          if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
          // Prefer the English invoicing name; fall back to clientName if not set
          clientName = (contract.invoicingName && contract.invoicingName.trim()) ? contract.invoicingName.trim() : contract.clientName;
          contractCode = contract.contractCode;
        } else if (input.legacyFinClientId) {
          // Look up the financial client name so the PDF shows the real name
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { finClients } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const [fc] = await db.select({ name: finClients.name })
              .from(finClients)
              .where(eq(finClients.id, input.legacyFinClientId))
              .limit(1);
            if (fc) clientName = fc.name;
          }
        }
        const proformaCode = `PF-${Date.now().toString(36).toUpperCase()}`;
        const amountEgp = convertEurToEgp(input.amountEur, rateInfo.rate);
        const inv = await createProformaInvoice({
          proformaCode,
          contractId: input.contractId ?? null,
          contractCode: contractCode ?? null,
          clientName,
          isLegacy: input.isLegacy ?? false,
          legacyFinClientId: input.legacyFinClientId ?? null,
          amountEur: String(input.amountEur),
          amountEgp: String(input.legacyAmountEgp ?? amountEgp),
          exchangeRate: String(rateInfo.rate),
          notes: input.notes ?? "",
        });
        const pdfUrl = await generateAndUploadProformaPdf({
          proformaCode,
          contractCode,
          clientName,
          amountEur: input.amountEur,
          amountEgp: input.legacyAmountEgp ?? amountEgp,
          exchangeRate: rateInfo.rate,
          notes: input.notes,
          createdAt: new Date(),
        });
        await updateProformaInvoicePdfUrl(inv.id, pdfUrl);
        return { ...inv, pdfUrl };
      }),
    markPaid: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await markProformaInvoicePaid(input.id);
        return { success: true };
      }),
    sendByEmail: protectedProcedure
      .input(z.object({ id: z.number(), clientEmail: z.string().email() }))
      .mutation(async ({ input }) => {
        const inv = await getProformaInvoiceById(input.id);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
        if (!inv.pdfUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No PDF available" });
        const result = await sendReceiptToClient(input.clientEmail, inv.clientName, inv.proformaCode, inv.pdfUrl);
        return result;
      }),
    regeneratePdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const inv = await getProformaInvoiceById(input.id);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
        const rateInfo = await getEurToEgpRate();
        const pdfUrl = await generateAndUploadProformaPdf({
          proformaCode: inv.proformaCode,
          contractCode: inv.contractCode ?? undefined,
          clientName: inv.clientName,
          amountEur: Number(inv.amountEur),
          amountEgp: Number(inv.amountEgp ?? 0),
          exchangeRate: Number(inv.exchangeRate ?? rateInfo.rate),
          notes: inv.notes ?? undefined,
          createdAt: new Date(inv.createdAt),
        });
        await updateProformaInvoicePdfUrl(input.id, pdfUrl);
        return { pdfUrl };
      }),
    convertToReceipt: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const inv = await getProformaInvoiceById(input.id);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Proforma invoice not found" });
        if (!inv.contractId) throw new TRPCError({ code: "BAD_REQUEST", message: "Legacy proforma invoices cannot be converted. Please create a receipt manually." });
        const contract = await getContractById(inv.contractId);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
        // Receipts are allowed for contracts in any status to support legacy clients
        const rateInfo = await getEurToEgpRate();
        const amountEur = Number(inv.amountEur);
        const amountEgp = convertEurToEgp(amountEur, rateInfo.rate);
        const invoiceCode = generateInvoiceCode();
        const totalPaid = await getTotalPaidByContractId(inv.contractId);
        const contractValue = Number(contract.contractValue);
        const remainingBalance = contractValue - totalPaid - amountEur;
        const billingName = contract.invoicingName || contract.clientName;
        const clientMobile = contract.clientMobile || "";
        const notes = inv.notes ?? `Converted from Proforma Invoice ${inv.proformaCode}`;
        const pdfUrl = await generateAndUploadInvoicePdf({
          invoiceCode, contractCode: contract.contractCode, clientName: billingName, clientMobile,
          amountEur, amountEgp, exchangeRate: rateInfo.rate,
          contractValue, totalPaid: totalPaid + amountEur, remainingBalance,
          createdAt: new Date(), notes,
        });
        const invoice = await createInvoice({
          invoiceCode, contractId: inv.contractId, contractCode: contract.contractCode,
          clientName: billingName, amountEur: amountEur.toString(),
          amountEgp: amountEgp.toString(), exchangeRate: rateInfo.rate.toString(),
          status: "unpaid", pdfUrl, notes,
        });
        notifyNewInvoice(invoiceCode, contract.contractCode, billingName, amountEur, remainingBalance).catch(() => {});
        return { invoiceCode, invoiceId: invoice.id, pdfUrl };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const inv = await getProformaInvoiceById(input.id);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Proforma invoice not found" });
        await deleteProformaInvoice(input.id);
        return { success: true };
      }),
  }),
  exchangeRate: router({
    current: publicProcedure.query(async () => getEurToEgpRate()),
  }),
  analytics: router({
    stats: protectedProcedure
      .input(z.object({ consultantName: z.string().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional() }))
      .query(async ({ input }) => getContractStats(input.consultantName, input.dateFrom, input.dateTo)),
    familyDistribution: protectedProcedure.query(async () => getFamilyMemberDistribution()),
    recentContracts: protectedProcedure
      .input(z.object({ limit: z.number().optional(), consultantName: z.string().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional() }))
      .query(async ({ input }) => getRecentContracts(input.limit ?? 10, input.consultantName, input.dateFrom, input.dateTo)),
    consultantStats: protectedProcedure.query(async () => getConsultantStats()),
    monthlyRevenue: protectedProcedure
      .input(z.object({ year: z.number(), consultantName: z.string().optional() }))
      .query(async ({ input }) => getMonthlyRevenue(input.year, input.consultantName)),
    exportContracts: protectedProcedure
      .input(z.object({ consultantName: z.string().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional() }))
      .query(async ({ input }) => getFilteredContracts(input.consultantName, input.dateFrom, input.dateTo)),
  }),
  // Client search for invoice/proforma creation — accessible to all logged-in users
  searchClients: protectedProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ input }) => {
      const contracts = await getAllContracts();
      const search = (input.search ?? "").toLowerCase();
      const seen = new Set<string>();
      const results: { id: number; name: string; contractCode: string; mobile: string }[] = [];
      for (const c of contracts) {
        const key = `${c.clientName}-${c.contractCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!search || c.clientName.toLowerCase().includes(search) || c.contractCode.toLowerCase().includes(search)) {
          results.push({ id: c.id, name: c.clientName, contractCode: c.contractCode, mobile: c.clientMobile || "" });
        }
      }
      return results.slice(0, 50);
    }),
  // Financial client search — accessible to all logged-in users (so Fouad can pick legacy clients)
  searchFinClients: protectedProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return [];
      const { finClients } = await import("../drizzle/schema");
      const search = (input.search ?? "").toLowerCase();
      let rows;
      if (search) {
        const { like, or } = await import("drizzle-orm");
        rows = await db.select({ id: finClients.id, name: finClients.name, clientCode: finClients.clientCode })
          .from(finClients)
          .where(or(like(finClients.name, `%${search}%`), like(finClients.clientCode, `%${search}%`)))
          .limit(50);
      } else {
        rows = await db.select({ id: finClients.id, name: finClients.name, clientCode: finClients.clientCode })
          .from(finClients)
          .limit(100);
      }
      return rows;
    }),
});

/// ─── Client Documentation Router ───────────────────────────────────────────
const clientDocumentationHttpUrl = z.string().trim().url().max(2048).refine(value => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, "Enter a valid HTTP or HTTPS link");

const clientDocumentationIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid date");

function clientDocumentationWorkflowError(error: unknown): TRPCError {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const messages: Record<string, string> = {
    CLIENT_NOT_FOUND: "Client not found",
    DOCUMENT_NOT_FOUND: "Document not found",
    DOCUMENT_NOT_RECEIVED: "Mark the document as received first",
    MOFA_NOT_REQUIRED: "This document does not require MOFA processing",
    MOFA_NOT_SUBMITTED: "Mark the document as submitted to MOFA first",
    MOFA_NOT_RECEIVED: "Receive the document from MOFA before submitting it to the Embassy",
    EMBASSY_NOT_REQUIRED: "This document does not require Embassy processing",
    EMBASSY_NOT_SUBMITTED: "Mark the document as submitted to the Embassy first",
    DATE_BEFORE_DOCUMENT_RECEIVED: "The authority date cannot be before the document receipt date",
    MOFA_RECEIVED_BEFORE_SUBMITTED: "MOFA receipt cannot be before MOFA submission",
    EMBASSY_RECEIVED_BEFORE_SUBMITTED: "Embassy receipt cannot be before Embassy submission",
    STAGE_DATE_REQUIRED: "A date is required for this stage",
    EVIDENCE_LINK_REQUIRED: "An evidence link is required for this stage",
    SPAIN_TEAM_NOT_RECEIVED: "Move the case to Spain Team Received first",
    SUBMISSION_BEFORE_SPAIN_TEAM_RECEIVED: "Submission cannot be before the Spain Team received date",
    APPLICATION_NOT_SUBMITTED: "The application must be submitted before approval",
    APPROVAL_BEFORE_SUBMISSION: "Approval cannot be before submission",
    APPLICATION_NOT_APPROVED: "The application must be approved first",
    TRAVEL_LINKS_REQUIRED: "Ticket and hotel links are required with the travel date",
    TRAVEL_BEFORE_APPROVAL: "Travel cannot be before approval",
    TRAVEL_NOT_RECORDED: "Record the Spain travel date first",
    ARRIVAL_BEFORE_TRAVEL: "Arrival confirmation cannot be before the travel date",
    BIOMETRICS_BEFORE_APPROVAL: "The biometrics appointment cannot be before approval",
    BIOMETRICS_APPOINTMENT_NOT_RECORDED: "Record the biometrics appointment first",
    BIOMETRICS_COMPLETED_BEFORE_APPOINTMENT: "Biometrics completion cannot be before the appointment",
    BANK_ACCOUNT_BEFORE_APPROVAL: "Bank-account completion cannot be before approval",
    BIOMETRICS_NOT_COMPLETED: "Confirm biometrics completion first",
    BANK_ACCOUNT_NOT_COMPLETED: "Confirm bank-account completion first",
    CARD_READY_BEFORE_BIOMETRICS: "The residency card cannot be ready before biometrics completion",
    CARD_READY_BEFORE_BANK_ACCOUNT: "The residency card cannot be ready before bank-account completion",
    INVALID_LINK: "Enter a valid HTTP or HTTPS link",
    INVALID_DATE: "Enter a valid date",
  };
  const trpcCode = code.endsWith("NOT_FOUND") ? "NOT_FOUND" : "BAD_REQUEST";
  return new TRPCError({ code: trpcCode, message: messages[code] ?? "Unable to update the documentation workflow" });
}

const clientDocsRouter = router({
  // Create a new client case and auto-generate the document checklist
  create: protectedProcedure
    .input(z.object({
      clientName: z.string().min(1),
      clientCode: z.string().min(1),
      applicationType: z.enum(["freelancer", "business_owner"]),
      maritalStatus: z.enum(["single", "family"]),
      paralegal: z.enum(["Madonna", "Monica", "Marina"]).optional(),
      consultant: z.enum(["Mahmoud", "Ziad", "Fouad", "Kirolos"]),
      children: z.array(z.object({ name: z.string().optional().default(""), age: z.number().int().min(0) })).optional().default([]),
      spouseName: z.string().optional(),
      schengenVisaValid: z.boolean().optional().default(false),
      schengenExpiryDate: z.string().optional(),
      finClientId: z.number().int().positive().nullable().optional(),
      contractDriveLink: clientDocumentationHttpUrl,
      payments: z.array(z.object({
        paymentName: z.string().trim().min(2).max(160),
        amountEur: z.number().positive().max(100000000),
        dueDate: clientDocumentationIsoDate,
      })).min(1).max(30).superRefine((payments, ctx) => {
        const names = new Set<string>();
        payments.forEach((payment, index) => {
          const key = payment.paymentName.trim().replace(/\s+/g, " ").toLowerCase();
          if (names.has(key)) ctx.addIssue({ code: "custom", path: [index, "paymentName"], message: "Payment names must be unique" });
          names.add(key);
        });
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const childrenData: ChildEntry[] = input.children.map(c => ({ name: c.name ?? "", age: c.age, ageRange: c.age < 18 ? "0-17" as const : "18-26" as const }));
      const checklist = getDocChecklist(input.applicationType, input.maritalStatus, childrenData);
      const documents = checklist.map(d => ({
        docKey: d.docKey,
        docName: d.docName,
        category: d.category,
        expirationMonths: d.expirationMonths,
        requiresMofa: d.requiresMofa,
        requiresEmbassy: d.requiresEmbassy,
      }));
      let insertId: number;
      try {
        const result = await createClientDocumentationBundle({
          clientCase: {
            clientName: input.clientName.trim(),
            clientCode: input.clientCode.trim(),
            applicationType: input.applicationType,
            maritalStatus: input.maritalStatus,
            paralegal: input.paralegal ?? null,
            consultant: input.consultant,
            userId: ctx.user.id,
            finClientId: input.finClientId ?? null,
            contractDriveLink: input.contractDriveLink,
            childrenData: childrenData as any,
            spouseName: input.spouseName?.trim() || null,
            schengenVisaValid: input.schengenVisaValid ?? false,
            schengenExpiryDate: (input.schengenExpiryDate || null) as any,
          },
          documents,
          payments: input.payments,
          userId: ctx.user.id,
        });
        insertId = result.clientCaseId;
      } catch (error) {
        if (error instanceof Error && error.message === "FIN_CLIENT_MISMATCH") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The selected Finance client does not match this client code" });
        }
        throw error;
      }
      await writeAuditLog(auditCtxFromTrpc(ctx), "create", "client_documentation_case", insertId, `Created case with ${input.payments.length} payment schedule item(s)`);
      // Send assignment notification email to paralegal + consultant
      notifyNewClientAssigned(
        input.clientName,
        input.clientCode,
        input.applicationType,
        input.maritalStatus,
        input.paralegal ?? null,
        input.consultant,
      ).catch(err => console.error('[clientDocs.create] email error:', err));
      return { id: insertId };
    }),
  // Update children data and re-generate per-child documents
  updateChildren: protectedProcedure
    .input(z.object({
      id: z.number(),
      children: z.array(z.object({ name: z.string().optional().default(""), age: z.number().int().min(0) })),
    }))
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const childrenData: ChildEntry[] = input.children.map(ch => ({ name: ch.name ?? "", age: ch.age, ageRange: ch.age < 18 ? "0-17" as const : "18-26" as const }));
      await updateClientCase(input.id, { childrenData: childrenData as any });
      // Remove old per-child docs
      const { getDb } = await import("./db");
      const db = await getDb();
      if (db) {
        const { clientDocuments: cdTable } = await import("../drizzle/schema");
        const { and, eq, like } = await import("drizzle-orm");
        await db.delete(cdTable).where(
          and(eq(cdTable.clientCaseId, input.id), like(cdTable.docKey, "child_%"))
        );
      }
      // Re-generate child-specific docs
      const checklist = getDocChecklist(c.applicationType, c.maritalStatus, childrenData);
      const childDocs = checklist.filter(d => d.docKey.startsWith("child_"));
      if (childDocs.length > 0) {
        await createClientDocuments(childDocs.map(d => ({
          clientCaseId: input.id,
          docKey: d.docKey,
          docName: d.docName,
          category: d.category,
          expirationMonths: d.expirationMonths,
          requiresMofa: d.requiresMofa,
          requiresEmbassy: d.requiresEmbassy,
        })));
      }
      return { success: true };
    }),

  list: protectedProcedure.query(async () => {
    return listClientCases();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const docs = await getClientDocuments(input.id);
      return { ...c, documents: docs };
    }),

  paymentSchedule: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const c = await getClientCase(input.clientCaseId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      return getClientDocumentationPaymentSchedule(input.clientCaseId);
    }),

  addPayment: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      paymentName: z.string().trim().min(2).max(160),
      amountEur: z.number().positive().max(100000000),
      dueDate: clientDocumentationIsoDate,
      receiptName: z.string().trim().max(255).nullable().optional(),
      receiptDriveLink: clientDocumentationHttpUrl.nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.clientCaseId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      try {
        const paymentId = await addClientDocumentationPayment(input.clientCaseId, input, ctx.user.id);
        await writeAuditLog(auditCtxFromTrpc(ctx), "create", "client_documentation_payment", paymentId, `Added payment schedule item to client case ${input.clientCaseId}`);
        return { success: true, paymentId };
      } catch (error) {
        if (error instanceof Error && error.message === "PAYMENT_NAME_EXISTS") throw new TRPCError({ code: "CONFLICT", message: "A payment with this name already exists" });
        throw error;
      }
    }),

  updatePayment: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      clientCaseId: z.number().int().positive(),
      paymentName: z.string().trim().min(2).max(160),
      amountEur: z.number().positive().max(100000000),
      dueDate: clientDocumentationIsoDate,
      receiptName: z.string().trim().max(255).nullable().optional(),
      receiptDriveLink: clientDocumentationHttpUrl.nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.clientCaseId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      try {
        await updateClientDocumentationPayment(input, ctx.user.id);
        await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_documentation_payment", input.id, `Updated payment schedule item for client case ${input.clientCaseId}`);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
        if (error instanceof Error && error.message === "PAYMENT_NAME_EXISTS") throw new TRPCError({ code: "CONFLICT", message: "A payment with this name already exists" });
        if (error instanceof Error && error.message === "PAYMENT_HISTORY_PROTECTED") throw new TRPCError({ code: "BAD_REQUEST", message: "Paid payment names, amounts, and due dates are protected; receipt details and notes can still be updated" });
        if (error instanceof Error && error.message === "PAYMENT_RECEIPT_PROTECTED") throw new TRPCError({ code: "BAD_REQUEST", message: "An existing receipt link cannot be removed; replace it with the corrected link if needed" });
        throw error;
      }
    }),

  markPaymentPaid: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      clientCaseId: z.number().int().positive(),
      paidDate: clientDocumentationIsoDate,
      receiptName: z.string().trim().max(255).nullable().optional(),
      receiptDriveLink: clientDocumentationHttpUrl.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await markClientDocumentationPaymentPaid(input, ctx.user.id);
        await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_documentation_payment", input.id, `Marked payment paid for client case ${input.clientCaseId}`);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
        if (error instanceof Error && error.message === "PAYMENT_ALREADY_PAID") throw new TRPCError({ code: "CONFLICT", message: "This payment is already marked as paid" });
        throw error;
      }
    }),

  archivePayment: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), clientCaseId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await archiveClientDocumentationPayment(input.id, input.clientCaseId, ctx.user.id);
        await writeAuditLog(auditCtxFromTrpc(ctx), "delete", "client_documentation_payment", input.id, `Archived unpaid payment schedule item for client case ${input.clientCaseId}`);
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
        if (error instanceof Error && error.message === "PAYMENT_HISTORY_PROTECTED") throw new TRPCError({ code: "BAD_REQUEST", message: "Paid payments and payments with receipt evidence cannot be removed" });
        throw error;
      }
    }),

  setContractDriveLink: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), contractDriveLink: clientDocumentationHttpUrl, finClientId: z.number().int().positive().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      try {
        await setClientDocumentationContractDriveLink(input.id, input.contractDriveLink, input.finClientId);
        await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_documentation_case", input.id, "Updated contract Drive link");
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "FIN_CLIENT_MISMATCH") throw new TRPCError({ code: "BAD_REQUEST", message: "The Finance client does not match this client code" });
        throw error;
      }
    }),

  setDocumentLink: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      documentId: z.number().int().positive(),
      documentLink: clientDocumentationHttpUrl,
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await setClientDocumentEvidenceLink(input);
        await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_document", input.documentId, `Updated document evidence link for client case ${input.clientCaseId}`);
        return { success: true };
      } catch (error) {
        throw clientDocumentationWorkflowError(error);
      }
    }),

  recordDocumentAuthorityMilestone: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      documentId: z.number().int().positive(),
      milestone: z.enum(["mofa_submitted", "mofa_received", "embassy_submitted", "embassy_received"]),
      date: clientDocumentationIsoDate,
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await recordClientDocumentAuthorityMilestone(input);
        await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_document", input.documentId, `Recorded ${input.milestone} on ${input.date} for client case ${input.clientCaseId}`);
        const { notifyPortalUsersForClientCase } = await import("./clientPortalRoutes");
        await notifyPortalUsersForClientCase({
          clientCaseId: input.clientCaseId,
          type: "document_attestation",
          titleEn: "Document processing updated",
          titleAr: "تم تحديث معالجة المستند",
          bodyEn: "Your ELEVAY team updated the official processing status of a required document.",
          bodyAr: "قام فريق إليفاي بتحديث حالة المعالجة الرسمية لأحد المستندات المطلوبة.",
        });
        return { success: true };
      } catch (error) {
        throw clientDocumentationWorkflowError(error);
      }
    }),

  recordSpainMilestone: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      milestone: z.enum(["translator_submitted", "travel_booked", "arrival_confirmed", "biometrics_appointment", "biometrics_completed", "bank_account_completed", "residency_card_ready"]),
      date: clientDocumentationIsoDate,
      ticketLink: clientDocumentationHttpUrl.nullable().optional(),
      hotelLink: clientDocumentationHttpUrl.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await recordSpainCaseMilestone(input);
        await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_documentation_case", input.clientCaseId, `Recorded ${input.milestone} on ${input.date}`);
        const { notifyPortalUsersForClientCase } = await import("./clientPortalRoutes");
        const notifyMilestones = new Set(["travel_booked", "arrival_confirmed", "biometrics_appointment", "biometrics_completed", "residency_card_ready"]);
        if (notifyMilestones.has(input.milestone)) {
          await notifyPortalUsersForClientCase({
            clientCaseId: input.clientCaseId,
            type: "workflow_dates_updated",
            titleEn: "Application milestone updated",
            titleAr: "تم تحديث مرحلة في الطلب",
            bodyEn: "Your ELEVAY team recorded an important application milestone.",
            bodyAr: "قام فريق إليفاي بتسجيل مرحلة مهمة في طلبك.",
          });
        }
        return { success: true };
      } catch (error) {
        throw clientDocumentationWorkflowError(error);
      }
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
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.clientCaseId);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      for (const item of input.items) {
        await updateClientDocument(item.docId, {
          received: true,
          receivedDate: new Date(item.receivedDate),
        });
      }
      const { notifyPortalUsersForClientCase } = await import("./clientPortalRoutes");
      await notifyPortalUsersForClientCase({ clientCaseId: input.clientCaseId, type: "document_received", titleEn: "Documents received", titleAr: "تم استلام المستندات", bodyEn: `Your ELEVAY team marked ${input.items.length} document${input.items.length === 1 ? "" : "s"} as received.`, bodyAr: `قام فريق إليفاي بتسجيل استلام ${input.items.length} مستند.` });
      return { success: true };
    }),

  // Deprecated bulk shortcut. Authority milestones must be recorded separately with dates.
  markMofa: protectedProcedure
    .input(z.object({
      clientCaseId: z.number(),
      docIds: z.array(z.number()),
    }))
    .mutation(async () => {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Record Submitted to MOFA and Received from MOFA separately for each document" });
    }),

  // Deprecated bulk shortcut. Authority milestones must be recorded separately with dates.
  markEmbassy: protectedProcedure
    .input(z.object({
      clientCaseId: z.number(),
      docIds: z.array(z.number()),
    }))
    .mutation(async () => {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Record Submitted to Embassy and Received from Embassy separately for each document" });
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
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const update: Record<string, Date | null> = {};
      if (input.schengenDate !== undefined)
        update.schengenDate = input.schengenDate ? new Date(input.schengenDate) : null;
      if (input.embassyAppointmentDate !== undefined)
        update.embassyAppointmentDate = input.embassyAppointmentDate ? new Date(input.embassyAppointmentDate) : null;
      if (input.expectedSubmissionDate !== undefined)
        update.expectedSubmissionDate = input.expectedSubmissionDate ? new Date(input.expectedSubmissionDate) : null;
      await updateClientCase(input.id, update as any);
      const { notifyPortalUsersForClientCase } = await import("./clientPortalRoutes");
      await notifyPortalUsersForClientCase({ clientCaseId: input.id, type: "workflow_dates_updated", titleEn: "Application dates updated", titleAr: "تم تحديث مواعيد الطلب", bodyEn: "Your ELEVAY team updated an important date in your application.", bodyAr: "قام فريق إليفاي بتحديث موعد مهم في طلبك." });
      return { success: true };
    }),

  // Full client report: remaining docs + pending procedures
  report: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const docs = await getClientDocuments(input.id);

      const notReceived = docs.filter(d => !d.received);
      const receivedNotMofa = docs.filter(d => d.received && d.requiresMofa && !(d.mofaReceived || d.mofaAttested));
      const receivedNotEmbassy = docs.filter(d => d.received && d.requiresEmbassy && !(d.embassyReceived || d.embassyAttested));

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
      const mofaSubmitted = docs.filter(d => !d.requiresMofa || d.mofaSubmitted || d.mofaAttested).length;
      const mofaComplete = docs.filter(d => !d.requiresMofa || d.mofaReceived || d.mofaAttested).length;
      const embassySubmitted = docs.filter(d => !d.requiresEmbassy || d.embassySubmitted || d.embassyAttested).length;
      const embassyComplete = docs.filter(d => !d.requiresEmbassy || d.embassyReceived || d.embassyAttested).length;

      return {
        clientCase: c,
        summary: { totalDocs, receivedCount, mofaSubmitted, mofaComplete, embassySubmitted, embassyComplete },
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
      stage: z.enum(["preparation", "spain_team_received", "submission", "approved"]),
      spainTeamReceivedDate: clientDocumentationIsoDate.nullable().optional(),
      // Submission stage fields
      submissionDate: z.string().nullable().optional(),
      submissionReceiptLink: clientDocumentationHttpUrl.nullable().optional(),
      translationDate: z.string().nullable().optional(),
      // Approved stage fields
      approvalDate: z.string().nullable().optional(),
      approvalLetterLink: clientDocumentationHttpUrl.nullable().optional(),
      settlementFeeAmount: z.string().nullable().optional(),
      settlementFeeDate: z.string().nullable().optional(),
      biometricsDate: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        await updateSpainCaseStage({
          clientCaseId: input.id,
          stage: input.stage,
          stageDate: input.stage === "spain_team_received" ? input.spainTeamReceivedDate : input.stage === "submission" ? input.submissionDate : input.stage === "approved" ? input.approvalDate : null,
          evidenceLink: input.stage === "submission" ? input.submissionReceiptLink : input.stage === "approved" ? input.approvalLetterLink : null,
        });
        const supplementary: Record<string, any> = {};
        if (input.translationDate !== undefined) supplementary.translationDate = input.translationDate ? new Date(input.translationDate) : null;
        if (input.settlementFeeAmount !== undefined) supplementary.settlementFeeAmount = input.settlementFeeAmount ?? null;
        if (input.settlementFeeDate !== undefined) supplementary.settlementFeeDate = input.settlementFeeDate ? new Date(input.settlementFeeDate) : null;
        if (input.biometricsDate !== undefined) supplementary.biometricsDate = input.biometricsDate ? new Date(input.biometricsDate) : null;
        if (Object.keys(supplementary).length > 0) await updateClientCase(input.id, supplementary as any);
      } catch (error) {
        throw clientDocumentationWorkflowError(error);
      }
      await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_documentation_case", input.id, `Changed stage from ${c.stage} to ${input.stage}`);
      if (c.stage !== input.stage) {
        const { notifyPortalUsersForClientCase } = await import("./clientPortalRoutes");
        const labels = { preparation: { en: "Preparation", ar: "الإعداد" }, spain_team_received: { en: "Spain Team Received", ar: "استلام فريق إسبانيا" }, submission: { en: "Submission", ar: "التقديم" }, approved: { en: "Approved", ar: "الموافقة" } } as const;
        await notifyPortalUsersForClientCase({ clientCaseId: input.id, type: "workflow_stage_updated", titleEn: "Application stage updated", titleAr: "تم تحديث مرحلة الطلب", bodyEn: `Your application moved to ${labels[input.stage].en}.`, bodyAr: `انتقل طلبك إلى مرحلة ${labels[input.stage].ar}.` });
      }
      return { success: true };
    }),

  // Export pending document checklist as an Arabic Word document
  exportChecklist: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const docs = await getClientDocuments(input.id);
      const docxBuffer = await generateChecklistDocx(
        c.clientName,
        docs.map(d => ({
          docKey: d.docKey,
          docName: d.docName,
          category: d.category,
          received: d.received,
        }))
      );
      return { base64: docxBuffer.toString("base64"), clientName: c.clientName };
    }),
  // Dashboard: per-client completion overview
  dashboard: protectedProcedure.query(async () => {
    const cases = await listClientCases();
    const results = await Promise.all(
      cases.map(async (c) => {
        const docs = await getClientDocuments(c.id);
        const total = docs.length;
        const received = docs.filter(d => d.received).length;
        const mofaDone = docs.filter(d => !d.requiresMofa || d.mofaReceived || d.mofaAttested).length;
        const embassyDone = docs.filter(d => !d.requiresEmbassy || d.embassyReceived || d.embassyAttested).length;
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
          spainTeamReceivedDate: c.spainTeamReceivedDate,
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
          biometricsAppointmentDate: c.biometricsAppointmentDate,
          biometricsDate: c.biometricsDate,
          travelDate: c.travelDate,
          residencyCardReadyDate: c.residencyCardReadyDate,
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
        spainTeamReceived: results.filter(r => r.stage === "spain_team_received").length,
        submission: results.filter(r => r.stage === "submission").length,
        approved: approvedCases.length,
        onTimePercent,
      },
    };
  }),

  deleteClient: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const existing = await getClientCase(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      await deleteClientCase(input.id);
      return { success: true };
    }),

  // Assign or change the paralegal on an existing client case
  updateParalegal: protectedProcedure
    .input(z.object({
      id: z.number(),
      paralegal: z.enum(["Madonna", "Monica", "Marina"]).nullable(),
    }))
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await updateClientCase(input.id, { paralegal: input.paralegal } as any);
      // Notify the newly assigned paralegal (and consultant) about this client
      if (input.paralegal) {
        notifyNewClientAssigned(
          c.clientName,
          c.clientCode,
          c.applicationType,
          c.maritalStatus,
          input.paralegal,
          c.consultant,
        ).catch(err => console.error('[clientDocs.updateParalegal] email error:', err));
      }
      return { success: true };
    }),

  // Set or update the Embassy Attestation Email Date
  setEmbassyEmailDate: protectedProcedure
    .input(z.object({
      id: z.number(),
      embassyEmailDate: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await updateClientCase(input.id, { embassyEmailDate: input.embassyEmailDate ?? null } as any);
      return { success: true };
    }),

  // Set or update the Google Drive link
  setDriveLink: protectedProcedure
    .input(z.object({
      id: z.number(),
      driveLink: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await updateClientCase(input.id, { driveLink: input.driveLink ?? null } as any);
      return { success: true };
    }),

  // Set or update the Schengen visa status and expiry date
  setSchengenVisa: protectedProcedure
    .input(z.object({
      id: z.number(),
      schengenVisaValid: z.boolean(),
      schengenExpiryDate: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await updateClientCase(input.id, {
        schengenVisaValid: input.schengenVisaValid,
        schengenExpiryDate: (input.schengenExpiryDate ? new Date(input.schengenExpiryDate) : null) as any,
      } as any);
      return { success: true };
    }),

  setSpouseName: protectedProcedure
    .input(z.object({
      id: z.number(),
      spouseName: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const c = await getClientCase(input.id);
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await updateClientCase(input.id, { spouseName: input.spouseName ?? null } as any);
      return { success: true };
    }),
});
// ─── Workflow Router ─────────────────────────────────────────────────────────
const workflowRouter = router({
  list: protectedProcedure.query(async () => {
    return listClientWorkflows();
  }),

  create: protectedProcedure
    .input(z.object({
      clientCaseId: z.number(),
      submissionStage: z.enum(["one", "two"]),
      submissionDate: z.string(),
      schengenStatus: z.string().optional(),
      schengenExpiry: z.string().optional(),
      yearlyIncome: z.number().int().min(0),
      incomeFrequency: z.enum(["monthly", "quarterly", "biannual", "yearly", "task"]),
      incomePayments: z.array(z.object({ date: z.string(), amount: z.number() })),
      childrenNamesData: z.array(z.object({ name: z.string(), ageRange: z.enum(["0-17", "18-26"]) })).optional(),
    }))
    .mutation(async ({ input }) => {
      const clientCase = await getClientCase(input.clientCaseId);
      if (!clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      const children: ChildEntry[] = Array.isArray(clientCase.childrenData)
        ? (clientCase.childrenData as ChildEntry[])
        : [];
      const familyMembersCount = clientCase.maritalStatus === "family" ? 1 + children.length : 0;
      const wf = await createClientWorkflow({
        clientCaseId: input.clientCaseId,
        clientName: clientCase.clientName,
        submissionStage: input.submissionStage,
        submissionDate: input.submissionDate,
        schengenStatus: input.schengenStatus ?? null,
        schengenExpiry: input.schengenExpiry ?? null,
        yearlyIncome: input.yearlyIncome,
        incomeFrequency: input.incomeFrequency,
        incomePayments: JSON.stringify(input.incomePayments),
        familyMembersCount,
        applicationType: clientCase.applicationType,
        childrenData: JSON.stringify(children),
        childrenNamesData: input.childrenNamesData ? JSON.stringify(input.childrenNamesData) : null,
      });
      // Auto-sync submission date to client Stage Dates
      await updateClientCase(input.clientCaseId, {
        submissionDate: new Date(input.submissionDate),
      });
      return wf;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      submissionStage: z.enum(["one", "two"]).optional(),
      submissionDate: z.string().optional(),
      schengenStatus: z.string().optional(),
      schengenExpiry: z.string().optional(),
      childrenNamesData: z.array(z.object({ name: z.string(), ageRange: z.enum(["0-17", "18-26"]) })).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, childrenNamesData, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (childrenNamesData !== undefined) {
        updateData.childrenNamesData = JSON.stringify(childrenNamesData);
      }
      const updated = await updateClientWorkflow(id, updateData as any);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      // Auto-sync submission date to client Stage Dates if provided
      if (input.submissionDate) {
        await updateClientCase(updated.clientCaseId, {
          submissionDate: new Date(input.submissionDate),
        });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteClientWorkflow(input.id);
      return { success: true };
    }),

  generateDoc: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const wf = await getClientWorkflowById(input.id);
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      // Get remaining documents for this client
      const clientCase = await getClientCase(wf.clientCaseId);
      if (!clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client case not found" });
      const children: ChildEntry[] = wf.childrenData ? JSON.parse(wf.childrenData as string) : [];
      const childrenNames: Array<{ name: string; ageRange: string }> = wf.childrenNamesData
        ? JSON.parse(wf.childrenNamesData as string)
        : [];
      const checklist = getDocChecklist(clientCase.applicationType, clientCase.maritalStatus, children);
      const allDocs = await getClientDocuments(wf.clientCaseId);
      const receivedKeys = new Set(allDocs.filter(d => d.received).map(d => d.docKey));
      // Build pending doc lists
      const mainApplicantDocs: string[] = [];
      const familyDocs: string[] = [];
      checklist.forEach(item => {
        if (!receivedKeys.has(item.docKey)) {
          const arabicName = getArabicDocName(item.docKey, item.docName);
          if (item.category === "main") mainApplicantDocs.push(arabicName);
          else familyDocs.push(arabicName);
        }
      });
      const payments: Array<{ date: string; amount: number }> = wf.incomePayments
        ? JSON.parse(wf.incomePayments as string)
        : [];
      // Use workflow schengenExpiry if set, otherwise fall back to client case schengenExpiryDate (set in Round 62)
      const resolvedSchengenExpiry = wf.schengenExpiry ?? (clientCase as any).schengenExpiryDate ?? undefined;
      const buf = await generateWorkflowDocx({
        clientName: wf.clientName,
        applicationType: wf.applicationType as "freelancer" | "business_owner",
        familyMembersCount: wf.familyMembersCount,
        childrenData: children,
        childrenNamesData: childrenNames,
        schengenStatus: wf.schengenStatus ?? undefined,
        schengenExpiry: resolvedSchengenExpiry,
        submissionStage: wf.submissionStage as "one" | "two",
        submissionDate: wf.submissionDate,
        yearlyIncome: wf.yearlyIncome,
        incomeFrequency: wf.incomeFrequency as any,
        incomePayments: payments,
        mainApplicantDocs,
        familyDocs,
      });
      return { base64: buf.toString("base64"), clientName: wf.clientName };
    }),
});


// ─── National Visa Router ─────────────────────────────────────────────────────
import {
  createNationalVisaWorkflow,
  listNationalVisaWorkflows,
  getNationalVisaWorkflowById,
  updateNationalVisaWorkflow,
  deleteNationalVisaWorkflow,
} from "./db";
import { generateNationalVisaDocx } from "./nationalVisaDocxGenerator";

const nationalVisaRouter = router({
  list: protectedProcedure.query(async () => {
    return listNationalVisaWorkflows();
  }),

  create: protectedProcedure
    .input(z.object({
      clientCaseId: z.number(),
      wifeName: z.string().optional(),
      children: z.array(z.object({ name: z.string(), age: z.number().int().min(0) })).optional(),
      followUpEmail: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(["in_progress", "completed", "submitted"]).optional().default("in_progress"),
    }))
    .mutation(async ({ input }) => {
      const clientCase = await getClientCase(input.clientCaseId);
      if (!clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      // Auto-use spouseName from client record if wifeName not provided
      const resolvedWifeName = input.wifeName || (clientCase as any).spouseName || null;
      return createNationalVisaWorkflow({
        clientCaseId: input.clientCaseId,
        clientName: clientCase.clientName,
        wifeName: resolvedWifeName,
        childrenData: input.children ? JSON.stringify(input.children) : null,
        followUpEmail: input.followUpEmail ?? null,
        notes: input.notes ?? null,
        status: input.status ?? "in_progress",
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      wifeName: z.string().optional(),
      children: z.array(z.object({ name: z.string(), age: z.number().int().min(0) })).optional(),
      followUpEmail: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(["in_progress", "completed", "submitted"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, children, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (children !== undefined) updateData.childrenData = JSON.stringify(children);
      const updated = await updateNationalVisaWorkflow(id, updateData as any);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      return updated;
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["in_progress", "completed", "submitted"]),
    }))
    .mutation(async ({ input }) => {
      const updated = await updateNationalVisaWorkflow(input.id, { status: input.status } as any);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteNationalVisaWorkflow(input.id);
      return { success: true };
    }),

  generateDoc: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const wf = await getNationalVisaWorkflowById(input.id);
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      const children: Array<{ name: string; age: number }> = wf.childrenData
        ? JSON.parse(wf.childrenData as string)
        : [];
      const buf = await generateNationalVisaDocx({
        clientName: wf.clientName,
        wifeName: wf.wifeName ?? undefined,
        children,
        followUpEmail: wf.followUpEmail ?? undefined,
        notes: wf.notes ?? undefined,
      });
      return { base64: buf.toString("base64"), clientName: wf.clientName };
    }),
});

// ─── App Routerr ─────────────────────────────────────────────────────────────

// ─── Notifications Router ─────────────────────────────────────────────────────
const notificationsRouter = router({
  list: protectedProcedure.query(async () => {
    const { getRecentNotifications } = await import("./db");
    const rows = await getRecentNotifications(40);
    // Return newest first
    return rows.slice().sort((a: any, b: any) => b.createdAt - a.createdAt);
  }),
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const { markNotificationRead } = await import("./db");
      await markNotificationRead(input.id);
      return { ok: true };
    }),
  markAllRead: protectedProcedure.mutation(async () => {
    const { markAllNotificationsRead } = await import("./db");
    await markAllNotificationsRead();
    return { ok: true };
  }),
});

import { supportRouter } from "./supportRouter";

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
  settlement: settlementRouter,
  chat: chatRouter,
  broadcast: broadcastRouter,
  permissions: permissionsRouter,
  waQc: waQcRouter,
  workflow: workflowRouter,
  nationalVisa: nationalVisaRouter,
  notifications: notificationsRouter,
  leads: leadsRouter,
  leadsSettings: leadsSettingsRouter,
  marketing: marketingRouter,
  reports: reportsRouter,
  backups: backupsRouter,
  backupDownload: backupDownloadRouter,
  aiCouncil: aiCouncilRouter,
  admin: adminRouter,
  clientPortalAdmin: clientPortalAdminRouter,
  support: supportRouter,
});
export type AppRouter = typeof appRouter;

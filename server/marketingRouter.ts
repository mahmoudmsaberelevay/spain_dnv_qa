import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { marketingSummaries, marketingPlans, marketingWeekMedia } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { invokeLLM } from "./_core/llm";

export const marketingRouter = router({
  // List all summaries for the current user
  listSummaries: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db
      .select({
        id: marketingSummaries.id,
        title: marketingSummaries.title,
        country: marketingSummaries.country,
        programType: marketingSummaries.programType,
        programSubtype: marketingSummaries.programSubtype,
        status: marketingSummaries.status,
        updatedAt: marketingSummaries.updatedAt,
        createdAt: marketingSummaries.createdAt,
      })
      .from(marketingSummaries)
      .where(eq(marketingSummaries.userId, ctx.user.id))
      .orderBy(desc(marketingSummaries.updatedAt));
    return rows;
  }),

  // Get a single summary by ID
  getSummary: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select()
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });
      return row;
    }),

  // Create a new summary
  createSummary: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      country: z.string(),
      programType: z.string(),
      programSubtype: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const defaultDoc = JSON.stringify({
        country: input.country,
        programType: input.programType,
        programSubtype: input.programSubtype || "RESIDENCY",
        createdAt: now,
        pages: [
          {
            id: "cover-" + now,
            template: "cover",
            photoUrl: null,
            content: {
              countryName: input.country.toUpperCase(),
              programLabel: input.programType,
              programSubtype: (input.programSubtype || "RESIDENCY").toUpperCase(),
              summaryLabel: "PROGRAM SUMMARY",
            },
          },
          {
            id: "overview-" + now,
            template: "overview",
            photoUrl: null,
            content: {
              sectionLabel: "PROGRAMME OVERVIEW",
              heading: input.country + " " + input.programType,
              intro: "",
              infoRows: [],
            },
          },
          {
            id: "eligibility-" + now,
            template: "eligibility",
            photoUrl: null,
            content: {
              requirements: [],
              idealCandidateHeading: "Ideal Candidate",
              idealCandidateIntro: "",
              idealCandidateBullets: [],
            },
          },
          {
            id: "process-" + now,
            template: "process",
            photoUrl: null,
            content: {
              stages: [],
              feesHeading: "Programme Fees",
              feeRows: [],
            },
          },
          {
            id: "about-" + now,
            template: "about",
            photoUrl: null,
            content: {
              heading: "About " + input.country,
              paragraphs: [],
              infoRows: [],
              rankingsHeading: "Global Rankings",
              rankings: [],
              membershipsHeading: "International Memberships",
              memberships: [],
            },
          },
        ],
      });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(marketingSummaries).values({
        userId: ctx.user.id,
        title: input.title,
        country: input.country,
        programType: input.programType,
        programSubtype: input.programSubtype || null,
        status: "draft",
        documentJson: defaultDoc,
        createdAt: now,
        updatedAt: now,
      });

      return { id: (result as { insertId: number }).insertId };
    }),

  // Save/update a summary's document JSON
  saveSummary: protectedProcedure
    .input(z.object({
      id: z.number(),
      documentJson: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db
        .select({ id: marketingSummaries.id })
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });

      await db
        .update(marketingSummaries)
        .set({ documentJson: input.documentJson, updatedAt: Date.now() })
        .where(eq(marketingSummaries.id, input.id));

      return { success: true };
    }),

  // Upload a photo for a summary page
  uploadPagePhoto: protectedProcedure
    .input(z.object({
      summaryId: z.number(),
      pageId: z.string(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db
        .select({ id: marketingSummaries.id })
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.summaryId), eq(marketingSummaries.userId, ctx.user.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });

      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const fileKey = "marketing/summaries/" + input.summaryId + "/" + input.pageId + "-" + nanoid(8) + "." + ext;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      return { url };
    }),

  // Delete a summary
  deleteSummary: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .delete(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      return { success: true };
    }),

  // Export summary as PDF
  exportSummaryPdf: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select()
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });
      return { url: "#", message: "Use the Export PDF button in the editor" };
    }),

  // AI-powered program comparison
  comparePrograms: protectedProcedure
    .input(z.object({ programKeys: z.array(z.string()).min(2).max(10) }))
    .mutation(async ({ input }) => {
      type Fees = { governmentFeePerApplicant?: number; governmentFeePerFamily?: number; governmentFeeNote?: string; dueDiligenceFeeMain?: number };
      type Investment = { name: string; type: string; costSingle: number; costFamily4?: number; holdPeriodYears?: number };
      type ProgramEntry = { country: string; processingTime: string; visaFreeCountries: string; residencyRequirement: string; familyIncluded: string; dualCitizenship: boolean; investmentOptions: Investment[]; applicationFees: Fees; routeToCitizenship: string; routeToPermanentResidency: string; renewalMethod: string; specialFeatures: string[] };

      const CDATA: Record<string, ProgramEntry> = {
        dominica: { country: "Dominica", processingTime: "3-6 months", visaFreeCountries: "140+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "EDF Donation", type: "donation", costSingle: 100000, costFamily4: 175000 }, { name: "Real Estate", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1000, dueDiligenceFeeMain: 7500 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years; no investment renewal required", specialFeatures: ["One of the most affordable CBI programs globally"] },
        grenada: { country: "Grenada", processingTime: "3-6 months", visaFreeCountries: "144+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "NTF Donation", type: "donation", costSingle: 150000, costFamily4: 200000 }, { name: "Real Estate", type: "real_estate", costSingle: 220000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1500, dueDiligenceFeeMain: 5000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["E-2 Treaty with USA", "Access to China visa-free"] },
        egypt: { country: "Egypt", processingTime: "6-9 months", visaFreeCountries: "66+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children of any age", dualCitizenship: true, investmentOptions: [{ name: "Central Bank Deposit", type: "donation", costSingle: 250000 }, { name: "Real Estate", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 10000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["Multiple investment pathways", "Strategic location bridging Africa, Middle East, Europe"] },
        st_kitts: { country: "Saint Kitts & Nevis", processingTime: "45-60 days (Accelerated)", visaFreeCountries: "157+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, grandparents", dualCitizenship: true, investmentOptions: [{ name: "SISC Donation", type: "donation", costSingle: 250000, costFamily4: 300000 }, { name: "Real Estate", type: "real_estate", costSingle: 400000, holdPeriodYears: 7 }], applicationFees: { governmentFeePerApplicant: 7500, dueDiligenceFeeMain: 10000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["Oldest CBI program in the world (since 1984)", "Fastest processing globally"] },
        st_lucia: { country: "Saint Lucia", processingTime: "3-6 months", visaFreeCountries: "145+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "NEF Donation", type: "donation", costSingle: 100000, costFamily4: 165000 }, { name: "Real Estate", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 2000, dueDiligenceFeeMain: 7500 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["One of the most affordable Caribbean CBI programs"] },
        antigua: { country: "Antigua & Barbuda", processingTime: "3-6 months", visaFreeCountries: "150+", residencyRequirement: "Must spend 5 days in Antigua within first 5 years", familyIncluded: "Spouse, dependent children, parents, siblings", dualCitizenship: true, investmentOptions: [{ name: "NDF Donation", type: "donation", costSingle: 100000, costFamily4: 100000 }, { name: "Real Estate", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerFamily: 30000, dueDiligenceFeeMain: 7500 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal every 5-10 years", specialFeatures: ["UWI Fund option includes 1 year of tuition"] },
        vanuatu: { country: "Vanuatu", processingTime: "30-60 days", visaFreeCountries: "130+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children under 18", dualCitizenship: true, investmentOptions: [{ name: "DSP Donation", type: "donation", costSingle: 130000, costFamily4: 200000 }], applicationFees: { governmentFeePerApplicant: 5000, dueDiligenceFeeMain: 5000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["One of the fastest CBI programs globally", "No income tax, capital gains tax, or inheritance tax"] },
        nauru: { country: "Nauru", processingTime: "3-6 months", visaFreeCountries: "88+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children", dualCitizenship: true, investmentOptions: [{ name: "Government Fund Contribution", type: "donation", costSingle: 105000 }], applicationFees: { governmentFeeNote: "Included in contribution", dueDiligenceFeeMain: 5000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["No income tax in Nauru", "Emerging CBI program with low entry cost"] },
        sao_tome: { country: "Sao Tome & Principe", processingTime: "3-6 months", visaFreeCountries: "70+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children", dualCitizenship: true, investmentOptions: [{ name: "Government Fund Contribution", type: "donation", costSingle: 50000 }], applicationFees: { governmentFeeNote: "Included in contribution", dueDiligenceFeeMain: 3000 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["Most affordable CBI program globally", "Favourable tax environment"] },
        turkey: { country: "Turkey", processingTime: "3-6 months", visaFreeCountries: "110+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children under 18", dualCitizenship: true, investmentOptions: [{ name: "Real Estate", type: "real_estate", costSingle: 400000, holdPeriodYears: 3 }], applicationFees: { governmentFeePerApplicant: 535 }, routeToCitizenship: "Direct citizenship by qualifying investment", routeToPermanentResidency: "Citizenship granted directly; no separate PR step", renewalMethod: "Passport renewal; no investment renewal required", specialFeatures: ["Access to Japan, Singapore, South Korea visa-free", "No Turkish taxes unless residing in Turkey"] },
      };

      const programs = input.programKeys.map((k) => CDATA[k]).filter(Boolean);
      if (programs.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "At least 2 valid programs required" });

      const programDataLines: string[] = [];
      for (const p of programs) {
        const govFee = p.applicationFees.governmentFeePerApplicant
          ? "$" + p.applicationFees.governmentFeePerApplicant + "/applicant"
          : p.applicationFees.governmentFeePerFamily
          ? "$" + p.applicationFees.governmentFeePerFamily + "/family"
          : p.applicationFees.governmentFeeNote || "Included";
        const ddFee = p.applicationFees.dueDiligenceFeeMain
          ? "$" + p.applicationFees.dueDiligenceFeeMain + " main applicant"
          : "N/A";
        const investments = p.investmentOptions.map((o) => {
          let s = o.name + " ($" + o.costSingle.toLocaleString() + " single";
          if (o.costFamily4) s += ", $" + o.costFamily4.toLocaleString() + " family of 4";
          if (o.holdPeriodYears) s += ", hold " + o.holdPeriodYears + " years";
          return s + ")";
        }).join("; ");
        programDataLines.push(
          "--- " + p.country + " ---\n" +
          "Processing Time: " + p.processingTime + "\n" +
          "Visa-Free Countries: " + p.visaFreeCountries + "\n" +
          "Residency Requirement: " + p.residencyRequirement + "\n" +
          "Family Included: " + p.familyIncluded + "\n" +
          "Dual Citizenship: " + (p.dualCitizenship ? "Yes" : "No") + "\n" +
          "Investment Options: " + investments + "\n" +
          "Government Fee: " + govFee + "\n" +
          "Due Diligence Fee: " + ddFee + "\n" +
          "Route to Citizenship: " + p.routeToCitizenship + "\n" +
          "Route to PR: " + p.routeToPermanentResidency + "\n" +
          "Renewal: " + p.renewalMethod + "\n" +
          "Special Features: " + p.specialFeatures.join(", ")
        );
      }
      const programDataStr = programDataLines.join("\n\n");

      const comparisonShape = input.programKeys
        .map((k) => '"' + k + '": { "governmentCost": "...", "processingTime": "...", "familyIncluded": "...", "investmentType": "...", "qualification": "...", "routeToCitizenship": "...", "routeToPR": "...", "renewal": "..." }')
        .join(", ");

      const userPrompt =
        "Compare these citizenship by investment programs across 8 criteria. Return JSON with this exact structure:\n" +
        '{ "programs": ' + JSON.stringify(input.programKeys) + ', "comparison": { ' + comparisonShape + ' }, ' +
        '"summary": "3-4 paragraph professional analysis comparing the programs, highlighting key differences, best use cases, and ELEVAY recommendation for different client profiles.", ' +
        '"generatedAt": "' + new Date().toISOString() + '" }\n\n' +
        "Program Data:\n" + programDataStr + "\n\n" +
        "Be specific with dollar amounts and timeframes. Use the exact program keys provided.";

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert citizenship and residency by investment advisor at ELEVAY. Compare programs factually and professionally for high-net-worth clients." },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response empty" });
      const parsed = JSON.parse(content as string);
      parsed.generatedAt = new Date().toISOString();
      return parsed;
    }),

  // AI-powered program proposal with cost calculation
  generateProposal: protectedProcedure
    .input(z.object({
      programKey: z.string(),
      investmentType: z.enum(["donation", "real_estate"]),
      familyMembers: z.number().min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      type ProposalFees = { governmentFeePerApplicant?: number; governmentFeePerFamily?: number; governmentFeeNote?: string; dueDiligenceFeeMain?: number; dueDiligenceFeeDependents?: number; processingFeePerApplicant?: number };
      type ProposalInvestment = { name: string; type: string; costSingle: number; costCouple?: number; costFamily4?: number; costFamily5plus?: number; holdPeriodYears?: number };
      type ProposalEntry = { country: string; processingTime: string; visaFreeCountries: string; residencyRequirement: string; familyIncluded: string; investmentOptions: ProposalInvestment[]; applicationFees: ProposalFees; specialFeatures: string[] };

      const PDATA: Record<string, ProposalEntry> = {
        dominica: { country: "Dominica", processingTime: "3-6 months", visaFreeCountries: "140+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "Economic Diversification Fund (EDF)", type: "donation", costSingle: 100000, costFamily4: 175000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1000, dueDiligenceFeeMain: 7500, dueDiligenceFeeDependents: 4000, processingFeePerApplicant: 2000 }, specialFeatures: ["One of the most affordable CBI programs globally", "140+ visa-free countries"] },
        grenada: { country: "Grenada", processingTime: "3-6 months", visaFreeCountries: "144+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "National Transformation Fund (NTF)", type: "donation", costSingle: 150000, costFamily4: 200000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 220000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 1500, dueDiligenceFeeMain: 5000, dueDiligenceFeeDependents: 2500, processingFeePerApplicant: 1500 }, specialFeatures: ["E-2 Treaty with USA", "Access to China visa-free"] },
        egypt: { country: "Egypt", processingTime: "6-9 months", visaFreeCountries: "66+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children of any age", investmentOptions: [{ name: "Central Bank of Egypt Deposit", type: "donation", costSingle: 250000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 10000 }, specialFeatures: ["Multiple investment pathways", "Strategic location bridging Africa, Middle East, Europe"] },
        st_kitts: { country: "Saint Kitts & Nevis", processingTime: "45-60 days (Accelerated)", visaFreeCountries: "157+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, grandparents", investmentOptions: [{ name: "Sustainable Island State Contribution (SISC)", type: "donation", costSingle: 250000, costFamily4: 300000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 400000, holdPeriodYears: 7 }], applicationFees: { governmentFeePerApplicant: 7500, dueDiligenceFeeMain: 10000, dueDiligenceFeeDependents: 7500, processingFeePerApplicant: 4000 }, specialFeatures: ["Oldest CBI program in the world (since 1984)", "157+ visa-free countries"] },
        st_lucia: { country: "Saint Lucia", processingTime: "3-6 months", visaFreeCountries: "145+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "National Economic Fund (NEF)", type: "donation", costSingle: 100000, costFamily4: 165000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 300000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerApplicant: 2000, dueDiligenceFeeMain: 7500, dueDiligenceFeeDependents: 5000, processingFeePerApplicant: 2000 }, specialFeatures: ["One of the most affordable Caribbean CBI programs"] },
        antigua: { country: "Antigua & Barbuda", processingTime: "3-6 months", visaFreeCountries: "150+", residencyRequirement: "Must spend 5 days in Antigua within first 5 years", familyIncluded: "Spouse, dependent children, parents, siblings", investmentOptions: [{ name: "National Development Fund (NDF)", type: "donation", costSingle: 100000, costFamily4: 100000, costFamily5plus: 125000 }, { name: "Real Estate Investment", type: "real_estate", costSingle: 200000, holdPeriodYears: 5 }], applicationFees: { governmentFeePerFamily: 30000, dueDiligenceFeeMain: 7500, dueDiligenceFeeDependents: 2000, processingFeePerApplicant: 1500 }, specialFeatures: ["UWI Fund option includes 1 year of tuition"] },
        sao_tome: { country: "Sao Tome & Principe", processingTime: "3-6 months", visaFreeCountries: "70+", residencyRequirement: "No residency requirement", familyIncluded: "Spouse and dependent children", investmentOptions: [{ name: "Government Fund Contribution", type: "donation", costSingle: 50000 }], applicationFees: { governmentFeeNote: "Included in contribution", dueDiligenceFeeMain: 3000, processingFeePerApplicant: 1500 }, specialFeatures: ["Most affordable CBI program globally", "Favourable tax environment"] },
      };

      const program = PDATA[input.programKey];
      if (!program) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown program" });

      const option = program.investmentOptions.find((o) => o.type === input.investmentType);
      if (!option) throw new TRPCError({ code: "BAD_REQUEST", message: input.investmentType + " not available for " + program.country });

      const fm = input.familyMembers;
      let investmentCost = option.costSingle;
      if (fm >= 5 && option.costFamily5plus) investmentCost = option.costFamily5plus;
      else if (fm >= 3 && option.costFamily4) investmentCost = option.costFamily4;
      else if (fm === 2 && option.costCouple) investmentCost = option.costCouple;

      const fees = program.applicationFees;
      const dependents = Math.max(0, fm - 1);
      const governmentFee = fees.governmentFeePerApplicant
        ? fees.governmentFeePerApplicant * fm
        : fees.governmentFeePerFamily
        ? fees.governmentFeePerFamily
        : 0;
      const dueDiligenceFee = (fees.dueDiligenceFeeMain || 0) + (fees.dueDiligenceFeeDependents || 0) * dependents;
      const processingFee = (fees.processingFeePerApplicant || 0) * fm;
      const totalCost = investmentCost + governmentFee + dueDiligenceFee + processingFee;

      const notes: string[] = [];
      if (option.holdPeriodYears) {
        notes.push("The " + (input.investmentType === "real_estate" ? "property" : "investment") + " must be held for a minimum of " + option.holdPeriodYears + " years.");
      }
      if (program.residencyRequirement !== "No residency requirement") {
        notes.push("Residency requirement: " + program.residencyRequirement);
      }
      notes.push("Legal fees and ELEVAY service fees are not included in this estimate. Please contact your consultant for a full quote.");

      const proposalPrompt =
        "Write a professional program proposal for a client interested in " + program.country + " Citizenship by Investment.\n\n" +
        "Details:\n" +
        "- Investment Type: " + (input.investmentType === "donation" ? "Donation/Contribution" : "Real Estate") + "\n" +
        "- Investment Amount: $" + investmentCost.toLocaleString() + "\n" +
        "- Total Estimated Cost: $" + totalCost.toLocaleString() + " for " + fm + " family member" + (fm > 1 ? "s" : "") + "\n" +
        "- Processing Time: " + program.processingTime + "\n" +
        "- Visa-Free Countries: " + program.visaFreeCountries + "\n" +
        "- Family Included: " + program.familyIncluded + "\n" +
        "- Special Features: " + program.specialFeatures.join(", ") + "\n\n" +
        'Return JSON: { "programSummary": "2-paragraph overview of the program and its key benefits", "recommendation": "2-paragraph ELEVAY recommendation explaining why this is a good choice and what the client should consider" }';

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert citizenship and residency by investment advisor at ELEVAY. Write professional, persuasive, and factual proposals for high-net-worth clients." },
          { role: "user", content: proposalPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response empty" });
      const aiContent = JSON.parse(content as string);

      return {
        country: program.country,
        investmentType: input.investmentType,
        familyMembers: fm,
        breakdown: {
          investmentCost,
          governmentFee,
          dueDiligenceFee,
          processingFee,
          otherFees: 0,
          totalCost,
          notes,
        },
        programSummary: aiContent.programSummary || "",
        recommendation: aiContent.recommendation || "",
        generatedAt: new Date().toISOString(),
      };
    }),

  generateMarketingPlan: protectedProcedure
    .input(z.object({
      contentRatio: z.string().optional(),
      pillarFocus: z.string().optional(),
      featuredPrograms: z.array(z.string()).optional(),
      startDate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const start = input.startDate ? new Date(input.startDate) : new Date();
      const programs = input.featuredPrograms?.join(", ") || "Spain DNV, Dominica, Grenada, Saint Kitts, Greece Golden Visa";
      const contentRatio = input.contentRatio || "40% EU Residency, 40% Caribbean, 20% Brand";
      const pillarFocus = input.pillarFocus || "ROI, Lifestyle, Family, Mobility";
      const systemPrompt = "ELEVAY marketing expert. Programs: Spain DNV, Portugal D7/D8/D2, Greece Golden Visa, Malta PR, Caribbean (Dominica, Grenada, Saint Kitts, Saint Lucia, Antigua, Vanuatu). HNWI MENA audience. Arabic captions.";

      // Generate strategy + hashtags first (small call)
      const strategyStart = start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const strategyResp = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `ELEVAY 3-month strategy starting ${strategyStart}. Content: ${contentRatio}. Focus: ${pillarFocus}. Programs: ${programs}. Return JSON: { planTitle, dateRange:{start,end}, strategy:{overview,contentPillars:[{name,percentage,description}],targetAudience,tone}, hashtagLibrary:{brand,residency,citizenship,arabic}, engagementStrategy:{bestPostingTimes,communityManagement,paidAmplification}, kpis:[{metric,target,measurement}] }` },
        ],
        response_format: { type: "json_object" },
      });
      const strategyContent = strategyResp.choices?.[0]?.message?.content;
      if (!strategyContent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Strategy generation failed" });
      const strategy = JSON.parse(strategyContent as string);

      // Generate each month separately (3 smaller calls)
      const months = [];
      const programList = programs.split(",").map(p => p.trim());
      for (let m = 0; m < 3; m++) {
        const monthStart = new Date(start);
        monthStart.setMonth(monthStart.getMonth() + m);
        const monthName = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        const monthNumber = m + 1;
        // Rotate programs for each month to ensure variety
        const monthPrograms = [...programList.slice(m % programList.length), ...programList.slice(0, m % programList.length)];
        const monthResp = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate Month ${monthNumber} (${monthName}) for ELEVAY social media plan. Programs to feature: ${monthPrograms.slice(0, 5).join(", ")}. Content: ${contentRatio}.

RULES: Each week has exactly 4 weeks. Each week has 10 posts: 5 days (Sunday,Monday,Tuesday,Wednesday,Thursday) × 2 posts. Each day: post 1 type "Static Design", post 2 type "Reel". Each day features a different program. Topic includes program name. Captions in Arabic. Hashtags as array.

Return JSON: { monthNumber:${monthNumber}, monthName:"${monthName}", theme, objective, weeks:[{weekNumber,weekLabel,focus,posts:[{day,type,topic,caption,hashtags:[]}]}] }` },
          ],
          response_format: { type: "json_object" },
        });
        const monthContent = monthResp.choices?.[0]?.message?.content;
        if (!monthContent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Month ${monthNumber} generation failed` });
        const monthData = JSON.parse(monthContent as string);
        months.push(monthData);
      }

      // Merge all parts into final plan
      return {
        planTitle: strategy.planTitle || `ELEVAY 3-Month Marketing Plan`,
        dateRange: strategy.dateRange || { start: start.toISOString(), end: new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString() },
        strategy: strategy.strategy || {},
        months,
        hashtagLibrary: strategy.hashtagLibrary || {},
        engagementStrategy: strategy.engagementStrategy || {},
        kpis: strategy.kpis || [],
      };
    }),

  generateWeekMedia: protectedProcedure
    .input(z.object({
      weekLabel: z.string(),
      weekFocus: z.string(),
      planId: z.number().optional(),
      posts: z.array(z.object({
        day: z.string(),
        type: z.string(),
        topic: z.string(),
        caption: z.string(),
        // Accept both array and string (AI sometimes returns comma-separated string)
        hashtags: z.union([z.array(z.string()), z.string()]).transform(v =>
          Array.isArray(v) ? v : v.split(/[,\s]+/).map(h => h.replace(/^#/, "").trim()).filter(Boolean)
        ),
      })),
    }))
    .mutation(async ({ input }) => {
      const { generateImage } = await import("./_core/imageGeneration");
      const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = await import("docx");
      const { storagePut: s3put } = await import("./storage");

      // Get only the unique days and their topics for prompts (keep it small)
      const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
      const staticPosts = input.posts.filter(p => p.type === "Static Design");
      const dayTopics = WEEK_DAYS.map(d => {
        const sp = staticPosts.find(p => p.day === d);
        return sp ? { day: d, topic: sp.topic } : null;
      }).filter(Boolean) as Array<{ day: string; topic: string }>;

      // Generate image prompts (split into 2 calls: static + reels)
      const staticPromptsResp = await invokeLLM({
        messages: [
          { role: "system", content: "ELEVAY Creative Director. Brand: Navy (#1A3A5C), Teal (#5BA3B8). Premium destination photography. No people, no passports." },
          { role: "user", content: `Generate 1:1 square static design image prompts for these ELEVAY posts. Each must include the program name as elegant text overlay. Return JSON: { staticPrompts: [{day, topic, imagePrompt}] }\n\nPosts: ${JSON.stringify(dayTopics)}` },
        ],
        response_format: { type: "json_object" },
      });
      const reelPromptsResp = await invokeLLM({
        messages: [
          { role: "system", content: "ELEVAY Creative Director. Brand: Navy (#1A3A5C), Teal (#5BA3B8). Cinematic 9:16 vertical reels. No people, no text in visuals." },
          { role: "user", content: `Generate reel production packages for these ELEVAY posts. Each reel: EXACTLY 5 keyframe scenes, 9:16 vertical, NO text in any frame. Return JSON: { reelKeyframes: [{day, topic, mergeInstructions, scenes:[{sceneNumber,duration,keyframePrompt,videoPrompt}], voiceOverScript, backgroundMusicSuggestion}] }\n\nPosts: ${JSON.stringify(dayTopics)}` },
        ],
        response_format: { type: "json_object" },
      });

      const staticPromptsContent = staticPromptsResp.choices?.[0]?.message?.content;
      const reelPromptsContent = reelPromptsResp.choices?.[0]?.message?.content;
      if (!staticPromptsContent || !reelPromptsContent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI prompts generation failed" });

      const staticPromptsData = JSON.parse(staticPromptsContent as string) as { staticPrompts: Array<{ day: string; topic: string; imagePrompt: string }> };
      const reelPromptsData = JSON.parse(reelPromptsContent as string) as { reelKeyframes: Array<{ day: string; topic: string; mergeInstructions: string; scenes: Array<{ sceneNumber: number; duration: string; keyframePrompt: string; videoPrompt: string }>; voiceOverScript: string; backgroundMusicSuggestion: string }> };

      // Generate static images sequentially (one per day) to avoid timeout
      const staticImageUrls: Array<{ day: string; topic: string; url: string }> = [];
      for (const sp of (staticPromptsData.staticPrompts || [])) {
        try {
          const staticPrompt = sp.imagePrompt + ", 1:1 square format, ELEVAY brand, navy blue and teal, program name '" + sp.topic.split(":")[0].trim() + "' as text overlay, no people, no passports";
          const result = await generateImage({ prompt: staticPrompt });
          if (result.url) staticImageUrls.push({ day: sp.day, topic: sp.topic, url: result.url });
        } catch (e) { console.error("Static image failed for " + sp.day, e); }
      }

      // Generate reel keyframes sequentially (one reel at a time, scenes in parallel)
      const reelData: Array<{ day: string; topic: string; mergeInstructions: string; voiceOverScript: string; backgroundMusicSuggestion: string; scenes: Array<{ sceneNumber: number; duration: string; videoPrompt: string; keyframeUrl: string }> }> = [];
      for (const reel of (reelPromptsData.reelKeyframes || [])) {
        const sceneResults: Array<{ sceneNumber: number; duration: string; videoPrompt: string; keyframeUrl: string }> = [];
        // Generate all 5 scenes for this reel in parallel (only 5 at a time)
        await Promise.all((reel.scenes || []).map(async (scene) => {
          try {
            const reelPrompt = scene.keyframePrompt + ", 9:16 vertical portrait, cinematic, destination photography, no people, no faces, NO text, NO captions, NO words, no passports, ultra-realistic";
            const result = await generateImage({ prompt: reelPrompt });
            sceneResults.push({ sceneNumber: scene.sceneNumber, duration: scene.duration, videoPrompt: scene.videoPrompt, keyframeUrl: result.url || "" });
          } catch (e) {
            sceneResults.push({ sceneNumber: scene.sceneNumber, duration: scene.duration, videoPrompt: scene.videoPrompt, keyframeUrl: "" });
          }
        }));
        sceneResults.sort((a, b) => a.sceneNumber - b.sceneNumber);
        reelData.push({ day: reel.day, topic: reel.topic, mergeInstructions: reel.mergeInstructions, voiceOverScript: reel.voiceOverScript, backgroundMusicSuggestion: reel.backgroundMusicSuggestion, scenes: sceneResults });
      }
      const docChildren: InstanceType<typeof Paragraph>[] = [];
      docChildren.push(new Paragraph({ text: "ELEVAY Weekly Content Package", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
      docChildren.push(new Paragraph({ text: input.weekLabel + " — " + input.weekFocus, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }));
      docChildren.push(new Paragraph({ text: "" }));
      docChildren.push(new Paragraph({ text: "SECTION 1: POST CAPTIONS", heading: HeadingLevel.HEADING_1 }));
      input.posts.forEach((post, idx) => {
        docChildren.push(new Paragraph({ text: "Post " + (idx + 1) + ": " + post.day + " — " + post.type, heading: HeadingLevel.HEADING_2 }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "Topic: ", bold: true }), new TextRun(post.topic)] }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "Caption (Arabic):", bold: true })] }));
        docChildren.push(new Paragraph({ text: post.caption, alignment: AlignmentType.RIGHT }));
        if (post.hashtags.length > 0) docChildren.push(new Paragraph({ children: [new TextRun({ text: "Hashtags: ", bold: true }), new TextRun(post.hashtags.join(" "))] }));
        docChildren.push(new Paragraph({ text: "" }));
      });
      docChildren.push(new Paragraph({ text: "SECTION 2: REEL PRODUCTION PACKAGES", heading: HeadingLevel.HEADING_1 }));
      reelData.forEach((reel, reelIdx) => {
        docChildren.push(new Paragraph({ text: "Reel " + (reelIdx + 1) + ": " + reel.day + " — " + reel.topic, heading: HeadingLevel.HEADING_2 }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "VIDEO PROMPTS:", bold: true, underline: {} })] }));
        reel.scenes.forEach((scene) => {
          docChildren.push(new Paragraph({ children: [new TextRun({ text: "Scene " + scene.sceneNumber + " (" + scene.duration + "): ", bold: true }), new TextRun(scene.videoPrompt)] }));
        });
        docChildren.push(new Paragraph({ text: "" }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "MERGE & MUSIC INSTRUCTIONS:", bold: true, underline: {} })] }));
        docChildren.push(new Paragraph({ text: reel.mergeInstructions }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "Background Music: ", bold: true }), new TextRun(reel.backgroundMusicSuggestion)] }));
        docChildren.push(new Paragraph({ text: "" }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "ARABIC VOICE-OVER SCRIPT:", bold: true, underline: {} })] }));
        docChildren.push(new Paragraph({ text: reel.voiceOverScript, alignment: AlignmentType.RIGHT }));
        docChildren.push(new Paragraph({ text: "" }));
      });
      const doc = new Document({ sections: [{ children: docChildren }] });
      const docBuffer = await Packer.toBuffer(doc);
      const docKey = "marketing/week-packages/" + nanoid() + "-content-package.docx";
      const { url: docUrl } = await s3put(docKey, docBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      const result = {
        weekLabel: input.weekLabel,
        weekFocus: input.weekFocus,
        generatedAt: new Date().toISOString(),
        staticImages: staticImageUrls,
        reels: reelData,
        wordDocUrl: docUrl,
      };
      // Save to DB so it persists
      if (input.planId) {
        const db = await getDb();
        if (db) {
          await db.insert(marketingWeekMedia).values({
            planId: input.planId,
            weekLabel: input.weekLabel.slice(0, 100),
            weekFocus: (input.weekFocus || "").slice(0, 255),
            resultJson: JSON.stringify(result),
            createdAt: Date.now(),
          });
        }
      }
      return result;
    }),

  // ── Plan persistence ──────────────────────────────────────────────────────
  savePlan: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      title: z.string(),
      startDate: z.string(),
      contentRatio: z.string().optional(),
      pillarFocus: z.string().optional(),
      featuredPrograms: z.string().optional(),
      planJson: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const now = Date.now();
      const uid = Number(ctx.user.id);
      if (input.id) {
        await db.update(marketingPlans)
          .set({
            title: input.title,
            startDate: input.startDate.slice(0, 20),
            contentRatio: input.contentRatio,
            pillarFocus: input.pillarFocus,
            featuredPrograms: input.featuredPrograms,
            planJson: input.planJson,
            updatedAt: now,
          })
          .where(and(eq(marketingPlans.id, input.id), eq(marketingPlans.userId, uid)));
        return { id: input.id };
      } else {
        const [result] = await db.insert(marketingPlans).values({
          userId: uid,
          title: input.title,
          startDate: input.startDate.slice(0, 20),
          contentRatio: input.contentRatio,
          pillarFocus: input.pillarFocus,
          featuredPrograms: input.featuredPrograms,
          planJson: input.planJson,
          createdAt: now,
          updatedAt: now,
        });
        return { id: (result as any).insertId as number };
      }
    }),

  listPlans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const uid = Number(ctx.user.id);
    const rows = await db
      .select({ id: marketingPlans.id, title: marketingPlans.title, startDate: marketingPlans.startDate, createdAt: marketingPlans.createdAt, planJson: marketingPlans.planJson })
      .from(marketingPlans)
      .where(eq(marketingPlans.userId, uid))
      .orderBy(desc(marketingPlans.createdAt));
    return rows;
  }),

  getPlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const uid = Number(ctx.user.id);
      const [row] = await db
        .select()
        .from(marketingPlans)
        .where(and(eq(marketingPlans.id, input.id), eq(marketingPlans.userId, uid)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  deletePlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const uid = Number(ctx.user.id);
      await db.delete(marketingPlans)
        .where(and(eq(marketingPlans.id, input.id), eq(marketingPlans.userId, uid)));
      return { success: true };
    }),
});

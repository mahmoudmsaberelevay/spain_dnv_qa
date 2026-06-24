import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { marketingSummaries, marketingPlans, marketingWeekMedia } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { invokeLLM } from "./_core/llm";
import { generatePlanRuleBased, generateWeekMediaPrompts } from "./marketingTemplates";

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
            style: {},
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
              headlines: [],
            },
            style: {},
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
      startDate: z.union([z.string(), z.date()]).optional(),
    }))
    .mutation(async ({ input }) => {
      // Robustly parse startDate regardless of format (string, Date object, or undefined)
      let start: Date;
      if (!input.startDate) {
        start = new Date();
      } else if (input.startDate instanceof Date) {
        start = input.startDate;
      } else {
        // Try YYYY-MM-DD first, then fallback to direct parse, then today
        const s = String(input.startDate);
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          start = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        } else {
          const parsed = new Date(s);
          start = isNaN(parsed.getTime()) ? new Date() : parsed;
        }
      }
      const programs = input.featuredPrograms || ["Spain DNV", "Dominica", "Grenada", "Saint Kitts & Nevis", "Greece Golden Visa"];
      const contentRatio = input.contentRatio || "40% EU Residency, 40% Caribbean, 20% Brand";
      const pillarFocus = input.pillarFocus || "ROI, Lifestyle, Family, Mobility";
      // Rule-based plan generation — zero LLM calls, no quota usage
      const plan = generatePlanRuleBased({ startDate: start, programs, contentRatio, pillarFocus });
      return plan;
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
      // Rule-based media prompts — zero LLM calls, no quota usage
      const { staticPrompts: staticPromptsArr, reelKeyframes: reelKeyframesArr } = generateWeekMediaPrompts(
        input.posts.map(p => ({ day: p.day, type: p.type, topic: p.topic }))
      );
      const staticPromptsData = { staticPrompts: staticPromptsArr };
      const reelPromptsData = { reelKeyframes: reelKeyframesArr.map(r => ({ ...r, mergeInstructions: `Merge all 5 keyframes sequentially. Each scene: ${r.scenes[0]?.duration || "3s"}. Add smooth transitions. 9:16 vertical format. Background music: ${r.backgroundMusicSuggestion}` })) };
      // Generate static images sequentially (one per day) to avoid timeout
      const staticImageUrls: Array<{ day: string; topic: string; url: string }> = [];
      for (const sp of (staticPromptsData.staticPrompts || [])) {
        try {
          const rawProgramKey = sp.topic.split(":")[0].trim();
          // Map short keys to full correct spelling
          const PROGRAM_NAME_MAP: Record<string, string> = {
            "Spain DNV": "Spain Digital Nomad Visa",
            "Greece Golden Visa": "Greece Golden Visa",
            "Malta PR": "Malta Permanent Residency",
            "Portugal D7": "Portugal D7 Residency",
            "Portugal D8": "Portugal Digital Nomad Visa",
            "Portugal D2": "Portugal D2 Entrepreneur Visa",
            "Dominica": "Dominica Citizenship",
            "Grenada": "Grenada Citizenship",
            "Saint Kitts & Nevis": "Saint Kitts & Nevis Citizenship",
            "Saint Lucia": "Saint Lucia Citizenship",
            "Antigua & Barbuda": "Antigua & Barbuda Citizenship",
            "Vanuatu": "Vanuatu Citizenship",
            "Nauru": "Nauru Residency",
            "Sao Tome": "Sao Tome Residency",
            "Turkey": "Turkey Citizenship",
            "Egypt": "Egypt Golden Visa",
            "Canada Skilled Migration": "Canada Skilled Migration",
            "UK Expansion Worker": "UK Expansion Worker Visa",
            "ELEVAY": "Since 1998",
          };
          const programName = PROGRAM_NAME_MAP[rawProgramKey] || rawProgramKey;
          const staticPrompt = sp.imagePrompt + ", 1:1 square format, navy blue (#1A3A5C) and baby blue (#5BA3B8) color scheme, program name '" + programName + "' as elegant white text overlay at the bottom, small geometric origami bird icon in baby blue color (#5BA3B8) in bottom-right corner, NO text saying ELEVAY, NO word ELEVAY anywhere in the image, no people, no passports, ultra premium social media post";
          const result = await generateImage({
            prompt: staticPrompt,
            originalImages: [{ url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663524211981/lREaBIOduQHCnBME.png", mimeType: "image/png" }]
          });
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
      startDate: z.union([z.string(), z.date()]).transform(v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 20)),
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
            startDate: input.startDate,
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
          startDate: input.startDate,
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

  // Fetch all week media packages for a given plan
  getWeekMedia: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const uid = Number(ctx.user.id);
      // Verify the plan belongs to this user
      const [plan] = await db
        .select({ id: marketingPlans.id })
        .from(marketingPlans)
        .where(and(eq(marketingPlans.id, input.planId), eq(marketingPlans.userId, uid)));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      const rows = await db
        .select()
        .from(marketingWeekMedia)
        .where(eq(marketingWeekMedia.planId, input.planId))
        .orderBy(marketingWeekMedia.createdAt);
      return rows.map(r => ({
        id: r.id,
        weekLabel: r.weekLabel,
        weekFocus: r.weekFocus,
        createdAt: r.createdAt,
        result: r.resultJson ? JSON.parse(r.resultJson) : null,
      }));
    }),
});

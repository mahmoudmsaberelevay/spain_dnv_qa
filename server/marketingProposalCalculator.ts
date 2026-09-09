import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MARKETING_PROPOSAL_PROGRAM_MAP,
  type ProposalCriterionValue,
  type ProposalProgram,
  visibleProposalCriteria,
} from "../shared/marketingProposalCatalog";

export const proposalInputSchema = z.object({
  programKey: z.string().min(1),
  routeKey: z.string().min(1),
  criteria: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type ProgramProposalInput = z.infer<typeof proposalInputSchema>;
export type ProposalCostCategory = "Investment" | "Government" | "Due diligence" | "Processing" | "Other" | "Recurring" | "Unresolved";
export type ProposalCostLine = {
  key: string;
  label: string;
  category: ProposalCostCategory;
  amount: number | null;
  includedInTotal: boolean;
  formula: string;
};

const asNumber = (value: ProposalCriterionValue | undefined) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const asInteger = (value: ProposalCriterionValue | undefined) => Math.max(0, Math.trunc(asNumber(value)));
const asBoolean = (value: ProposalCriterionValue | undefined) => value === true;
const asString = (value: ProposalCriterionValue | undefined) => typeof value === "string" ? value : "";

function validateCriteria(program: ProposalProgram, routeKey: string, criteria: Record<string, ProposalCriterionValue>) {
  for (const definition of visibleProposalCriteria(program, routeKey)) {
    const value = criteria[definition.key] ?? definition.defaultValue;
    if (definition.type === "boolean") {
      if (typeof value !== "boolean") throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.label} must be yes or no` });
      continue;
    }
    if (definition.type === "select") {
      if (typeof value !== "string" || !definition.options?.some((option) => option.value === value)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Select a valid ${definition.label}` });
      }
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || (definition.type === "integer" && !Number.isInteger(value))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.label} must be a valid number` });
    }
    if (definition.min != null && value < definition.min) throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.label} must be at least ${definition.min}` });
    if (definition.max != null && value > definition.max) throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.label} must not exceed ${definition.max}` });
  }
}

function requirePackageAllocation(totalFamily: number, includedFamily: number, under18: number, adults: number) {
  const required = Math.max(0, totalFamily - includedFamily);
  if (under18 + adults !== required) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: required === 0
        ? "Additional package members must be zero for this family size"
        : `Allocate all ${required} family member${required === 1 ? "" : "s"} beyond the included package by age`,
    });
  }
}

export function calculateProgramProposal(rawInput: ProgramProposalInput) {
  const input = proposalInputSchema.parse(rawInput);
  const program = MARKETING_PROPOSAL_PROGRAM_MAP[input.programKey];
  if (!program) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown programme" });
  const selectedRoute = program.routes.find((route) => route.key === input.routeKey);
  if (!selectedRoute) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected route is not available for this programme" });

  const criteria = Object.fromEntries(program.criteria.map((criterion) => [criterion.key, input.criteria[criterion.key] ?? criterion.defaultValue]));
  validateCriteria(program, input.routeKey, criteria);
  const lines: ProposalCostLine[] = [];
  const assumptions: string[] = [...selectedRoute.rules];
  const unresolvedCosts: string[] = [...program.disclosures];
  let familyMembers = 1;

  const add = (key: string, label: string, category: ProposalCostCategory, amount: number | null, formula: string, includedInTotal = true) => {
    if (amount === 0 && category !== "Investment") return;
    lines.push({ key, label, category, amount, formula, includedInTotal: includedInTotal && amount != null });
  };
  const spouse = () => asBoolean(criteria.spouse) ? 1 : 0;

  if (program.key === "antigua") {
    const child0 = asInteger(criteria.children0To11);
    const child12 = asInteger(criteria.children12To17);
    const adults = asInteger(criteria.adultDependents);
    const parents = asInteger(criteria.parents55Plus);
    familyMembers = 1 + spouse() + child0 + child12 + adults + parents;
    const investments: Record<string, number> = { ndf: familyMembers <= 4 ? 230000 : 245000, higher_education: 260000, real_estate: 300000, business_establishment: 1500000 };
    add("investment", selectedRoute.label, "Investment", investments[input.routeKey], selectedRoute.minimumLabel);
    const processing = input.routeKey === "higher_education"
      ? Math.max(0, familyMembers - 6) * 10000
      : familyMembers === 1 ? 10000 : 20000 + Math.max(0, familyMembers - 4) * 10000;
    add("processing", "Processing fees", "Processing", processing, input.routeKey === "higher_education" ? "Included for six applicants; USD 10,000 per additional member" : "USD 10,000 single / USD 20,000 family up to four / USD 10,000 per additional member");
    add("due_diligence", "Due-diligence fees", "Due diligence", 8500 + spouse() * 5000 + child12 * 2000 + (adults + parents) * 4000, "USD 8,500 main + USD 5,000 spouse + age-based dependant fees");
    add("passport", "Passport fees", "Other", familyMembers * 300, `${familyMembers} × USD 300`);
    add("interview", "Interview fee", "Other", 1500, "USD 1,500 per application");
    if (input.routeKey === "higher_education" && familyMembers < 6) unresolvedCosts.push("The supplied Higher Education price is stated only for a family of six or more; confirm availability and price for this smaller family.");
  }

  if (program.key === "dominica") {
    const child0 = asInteger(criteria.children0To11);
    const child12 = asInteger(criteria.children12To15);
    const child16 = asInteger(criteria.children16To17);
    const adults = asInteger(criteria.adultDependents);
    const parents = asInteger(criteria.parents65Plus);
    familyMembers = 1 + spouse() + child0 + child12 + child16 + adults + parents;
    const extraUnder18 = asInteger(criteria.additionalBeyond4Under18);
    const extraAdults = asInteger(criteria.additionalBeyond4Adults);
    if (familyMembers > 4) requirePackageAllocation(familyMembers, 4, extraUnder18, extraAdults);
    if (familyMembers <= 4 && extraUnder18 + extraAdults > 0) requirePackageAllocation(familyMembers, 4, extraUnder18, extraAdults);
    let investment: number | null = null;
    if (input.routeKey === "contribution") {
      if (familyMembers === 1) investment = 200000;
      else if (familyMembers >= 4) investment = 250000 + extraUnder18 * 25000 + extraAdults * 40000;
      else unresolvedCosts.push("The supplied contribution source lists prices for a single applicant and a family of four, but not for a family of two or three.");
    } else investment = asNumber(criteria.propertyValue);
    add("investment", selectedRoute.label, "Investment", investment, investment == null ? "Price confirmation required" : selectedRoute.minimumLabel);
    if (input.routeKey === "real_estate") {
      const government = familyMembers === 1 ? 75000 : 100000 + extraUnder18 * 25000 + extraAdults * 40000;
      add("government", "Government fees", "Government", government, "USD 75,000 single / USD 100,000 family up to four + age-based additional members");
      add("share_registration", "Share-registration fee", "Unresolved", null, "4% — calculation base not stated", false);
    }
    const profile = asString(criteria.applicantProfile);
    const aged16Plus = child16 + adults + parents;
    const dueDiligence = profile === "iranian"
      ? 25000 + spouse() * 15000 + aged16Plus * 15000 + child12 * 10000
      : 7500 + spouse() * 4000 + aged16Plus * 4000;
    add("due_diligence", "Due-diligence fees", "Due diligence", dueDiligence, `${profile === "iranian" ? "Iranian" : "Standard"} age-based schedule`);
    if (profile === "standard") add("interviews", "Mandatory interviews for applicants aged 16+", "Other", (1 + spouse() + aged16Plus) * 1000, `${1 + spouse() + aged16Plus} × USD 1,000`);
    add("passport", "Passport fees", "Other", familyMembers * 60, `${familyMembers} × USD 60`);
    if (asBoolean(criteria.expeditedPassport)) add("passport_expedited", "Expedited passport service", "Other", familyMembers * 1200, `${familyMembers} × USD 1,200`);
    add("processing", "Processing fee", "Processing", 1000, "Per application");
    add("naturalization", "Naturalization fee", "Government", 500, "Per application");
    add("bank", "Bank fee", "Other", 250, "Per application");
  }

  if (program.key === "egypt") {
    const routeAmounts: Record<string, number> = {
      real_estate_5_year: asNumber(criteria.propertyValue5), real_estate_3_year: asNumber(criteria.propertyValue3), real_estate_1_year: asNumber(criteria.propertyValue1), bank_deposit_3_year: 100000, bank_deposit_1_year: 50000,
    };
    add("investment", selectedRoute.label, "Investment", routeAmounts[input.routeKey], selectedRoute.minimumLabel);
  }

  if (program.key === "hungary") {
    const investment = input.routeKey === "property_fund" ? 250000 : input.routeKey === "public_donation" ? 1000000 : asNumber(criteria.propertyValue);
    add("investment", selectedRoute.label, "Investment", investment, selectedRoute.minimumLabel);
    if (input.routeKey === "real_estate") {
      add("transfer_tax", "Property-transfer tax", "Government", investment * 0.04, "4% of selected property value");
      const rentalIncome = asNumber(criteria.annualRentalIncome);
      if (rentalIncome > 0) add("rental_income_tax", "Indicative annual rental-income tax", "Recurring", rentalIncome * 0.15, "15% of expected annual rental income", false);
    }
  }

  if (program.key === "latvia") {
    const children = asInteger(criteria.children);
    familyMembers = 1 + spouse() + children;
    const investments: Record<string, number> = { capital_investment: 50000, financial_investment: 280000, government_bonds: 250000, real_estate: asNumber(criteria.propertyValue) };
    add("investment", selectedRoute.label, "Investment", investments[input.routeKey], selectedRoute.minimumLabel);
    const government: Record<string, number> = { capital_investment: 10000, financial_investment: 25000, government_bonds: 38000, real_estate: Math.max(12500, investments[input.routeKey] * 0.05) };
    add("government", input.routeKey === "real_estate" ? "Property tax" : "Government fee", "Government", government[input.routeKey], input.routeKey === "real_estate" ? "5% of property value; minimum EUR 12,500" : "Fixed route fee");
    add("residence_permits", "Residence permits", "Government", familyMembers * 35, `${familyMembers} × EUR 35`);
    const maintenance = (spouse() ? 15000 : 7500) + children * 2300;
    add("maintenance_funds", "Required maintenance funds", "Unresolved", maintenance, "Required funds; period not specified", false);
  }

  if (program.key === "malta") {
    const children = asInteger(criteria.children);
    const dependentSpouses = asInteger(criteria.dependentSpouses);
    const parents = asInteger(criteria.parents);
    const grandparents = asInteger(criteria.grandparents);
    const dependants = spouse() + children + dependentSpouses + parents + grandparents;
    familyMembers = 1 + dependants;
    if (input.routeKey === "property_purchase") add("investment", "Property purchase", "Investment", asNumber(criteria.propertyValue), selectedRoute.minimumLabel);
    else add("annual_rent", "Annual property rent", "Recurring", asNumber(criteria.annualRent), "Recurring annual rent", false);
    add("administration", "Government administration fee", "Government", 60000, "Fixed");
    add("contribution", "Government contribution", "Government", 37000, "Fixed");
    add("philanthropic", "Philanthropic contribution", "Other", 2000, "Fixed");
    add("dependant_contributions", "Additional dependant contributions", "Government", dependants * 7500, `${dependants} × EUR 7,500`);
    add("dependant_spouse_pr", "Dependent-spouse permanent-residency fees", "Government", dependentSpouses * 10000, `${dependentSpouses} × EUR 10,000`);
  }

  if (program.key === "nauru") {
    familyMembers = asInteger(criteria.familyMembers);
    const passportsCount = asInteger(criteria.passportCount);
    const siblings = asInteger(criteria.siblings);
    const adultDependants = asInteger(criteria.dependents16Plus);
    if (siblings > familyMembers - 1 || adultDependants > familyMembers - 1 || passportsCount > familyMembers) throw new TRPCError({ code: "BAD_REQUEST", message: "Nauru dependant and passport counts cannot exceed the total family size" });
    const base = familyMembers === 1 ? 105000 : familyMembers <= 4 ? 110000 : 115000;
    add("investment", selectedRoute.label, "Investment", base + siblings * 15000, `Family tier ${familyMembers}; USD 15,000 per included sibling`);
    add("application", "Application fee", "Government", 25000, "Per application");
    add("due_diligence", "Due-diligence fees", "Due diligence", 10000 + adultDependants * 7500, `USD 10,000 main + ${adultDependants} × USD 7,500`);
    add("passports", "Passport fees", "Other", passportsCount * 500, `${passportsCount} × USD 500`);
  }

  if (program.key === "sao_tome") {
    familyMembers = asInteger(criteria.familyMembers);
    const adults = asInteger(criteria.adultApplicants);
    const passportsCount = asInteger(criteria.passportCount);
    if (adults > familyMembers || passportsCount > familyMembers) throw new TRPCError({ code: "BAD_REQUEST", message: "Adult and passport counts cannot exceed the total family size" });
    const base = familyMembers === 1 ? 90000 : familyMembers <= 4 ? 95000 : 95000 + (familyMembers - 4) * 10000;
    add("investment", selectedRoute.label, "Investment", base, familyMembers <= 4 ? "Supplied family tier" : `USD 95,000 family package + ${familyMembers - 4} × USD 10,000`);
    add("submission", "Submission fee", "Processing", 5000, "Per application");
    add("registration", "Certificates of registration", "Government", familyMembers * 250, `${familyMembers} × USD 250`);
    add("national_ids", "National ID cards", "Government", familyMembers * 150, `${familyMembers} × USD 150`);
    add("due_diligence", "Due-diligence fees", "Due diligence", adults * 5000, `${adults} adult applicant${adults === 1 ? "" : "s"} × USD 5,000`);
    add("passports", "Passport issuance", "Other", passportsCount * 350, `${passportsCount} × USD 350`);
  }

  if (program.key === "st_kitts") {
    const under16 = asInteger(criteria.dependentsUnder16);
    const age16To17 = asInteger(criteria.dependents16To17);
    const adults = asInteger(criteria.adultDependents);
    const parents = asInteger(criteria.parents55Plus);
    familyMembers = 1 + spouse() + under16 + age16To17 + adults + parents;
    const extraUnder18 = asInteger(criteria.additionalBeyond4Under18);
    const extraAdults = asInteger(criteria.additionalBeyond4Adults);
    requirePackageAllocation(familyMembers, 4, extraUnder18, extraAdults);
    const propertyValue = input.routeKey === "private_real_estate" ? asNumber(criteria.propertyValue) : 325000;
    const investment = input.routeKey === "sisc"
      ? 250000 + extraUnder18 * 25000 + extraAdults * 50000
      : input.routeKey === "public_benefit" ? 250000 : propertyValue;
    add("investment", selectedRoute.label, "Investment", investment, selectedRoute.minimumLabel);
    add("application", "Application fees", "Processing", familyMembers * 250, `${familyMembers} × USD 250`);
    add("passports", "Passport fees", "Other", familyMembers * 500, `${familyMembers} × USD 500`);
    add("registration", "Certificates of registration", "Government", familyMembers * 50, `${familyMembers} × USD 50`);
    add("due_diligence", "Due-diligence fees", "Due diligence", 10000 + spouse() * 7500 + (age16To17 + adults + parents) * 7500, "USD 10,000 main + USD 7,500 spouse and each applicant aged 16+ / parent 55+");
    if (["developer_real_estate", "private_real_estate"].includes(input.routeKey)) {
      add("government", "Government fees", "Government", 25000 + spouse() * 15000 + (under16 + age16To17) * 10000 + (adults + parents) * 15000, "Route-specific applicant and dependant schedule");
      add("closing", "Real-estate closing costs", "Other", propertyValue * 0.015, "1.5% of property value");
    }
    if (input.routeKey === "public_benefit") add("government", "Government fees", "Government", spouse() * 15000 + (under16 + age16To17) * 10000 + (adults + parents) * 15000, "Public-benefit dependant schedule");
    if (asBoolean(criteria.acceleratedProcess)) {
      const accelerated = 42500 + spouse() * 32500 + (under16 + age16To17) * 22500 + (adults + parents) * 37500;
      add("accelerated", "60-day accelerated-process schedule", "Unresolved", accelerated, "Shown separately pending confirmation that it replaces rather than supplements standard fees", false);
    }
  }

  if (program.key === "st_lucia") {
    const under16 = asInteger(criteria.dependentsUnder16);
    const age16To17 = asInteger(criteria.dependents16To17);
    const age18To21 = asInteger(criteria.dependents18To21);
    const age22To29 = asInteger(criteria.dependents22To29);
    const parents = asInteger(criteria.parents55Plus);
    const siblings = asInteger(criteria.siblingsUnder18);
    const under18 = under16 + age16To17 + siblings;
    const adults = age18To21 + age22To29 + parents;
    familyMembers = 1 + spouse() + under18 + adults;
    const extraUnder18 = asInteger(criteria.additionalBeyond3Under18);
    const extraAdults = asInteger(criteria.additionalBeyond3Adults);
    requirePackageAllocation(familyMembers, 4, extraUnder18, extraAdults);
    const investments: Record<string, number> = { national_economic_fund: 240000 + extraUnder18 * 10000 + extraAdults * 20000, real_estate: 300000, government_bonds: 300000, enterprise_project: 250000 };
    add("investment", selectedRoute.label, "Investment", investments[input.routeKey], selectedRoute.minimumLabel);
    add("due_diligence", "Due-diligence fees", "Due diligence", 7500 + spouse() * 5000 + (age16To17 + adults) * 5000, "USD 7,500 main + USD 5,000 spouse and each dependant aged 16+ / parent 55+");
    add("interview", "Main-applicant interview", "Other", 500, "USD 500");
    add("processing", "Processing fees", "Processing", 2000 + Math.max(0, familyMembers - 1) * 1000, `USD 2,000 main + ${Math.max(0, familyMembers - 1)} × USD 1,000`);
    add("passports", "Passport fees", "Other", familyMembers * 300, `${familyMembers} × USD 300`);
    if (["real_estate", "enterprise_project"].includes(input.routeKey)) {
      add("administration", "Administration fees", "Government", (spouse() ? 45000 : 30000) + under18 * 5000 + adults * 10000, "Main/spouse route fee + age-based dependant administration fees");
      if (familyMembers >= 6 && spouse()) unresolvedCosts.push("The source lists an additional USD 10,000 administration amount for an applicant with a spouse and more than four dependants; confirm whether it is flat or per dependant.");
    }
    if (input.routeKey === "government_bonds") add("bond_administration", "Government-bond administration fee", "Government", 50000, "Fixed USD 50,000; treated as the route administration fee");
    add("newborn", "Newborn additions", "Other", asInteger(criteria.newborns) * 5000, `${asInteger(criteria.newborns)} × USD 5,000`);
    add("citizen_spouse", "Spouse added to existing citizen", "Other", asInteger(criteria.citizenSpouse) * 35000, `${asInteger(criteria.citizenSpouse)} × USD 35,000`);
    add("citizen_dependants", "Dependants added to existing citizen", "Other", asInteger(criteria.citizenDependents) * 25000, `${asInteger(criteria.citizenDependents)} × USD 25,000`);
  }

  if (program.key === "turkey") {
    if (input.routeKey === "real_estate") {
      const propertyValue = asNumber(criteria.propertyValue);
      const transferTaxRate = asNumber(criteria.transferTaxRate);
      add("investment", selectedRoute.label, "Investment", propertyValue, selectedRoute.minimumLabel);
      add("transfer_tax", "Land-transfer tax", "Government", propertyValue * transferTaxRate / 100, `${transferTaxRate}% of property value`);
      if (asBoolean(criteria.includeAnnualPropertyCosts)) {
        add("annual_property_tax", "Annual property tax", "Recurring", propertyValue * 0.01, "1% of property value", false);
        add("annual_insurance", "Annual home insurance", "Recurring", 200, "USD 200", false);
      }
    } else if (input.routeKey === "capital_investment") {
      add("investment", selectedRoute.label, "Investment", 500000, selectedRoute.minimumLabel);
    } else {
      add("investment", selectedRoute.label, "Investment", null, "No source-supported monetary amount", false);
    }
  }

  if (program.key === "vanuatu") {
    const children = asInteger(criteria.childrenUnder18);
    const adults = asInteger(criteria.adultDependents);
    familyMembers = 1 + spouse() + children + adults;
    const tiers: Record<number, number> = { 1: 130000, 2: 150000, 3: 165000, 4: 180000 };
    const base = familyMembers <= 4 ? tiers[familyMembers] : 180000 + (familyMembers - 4) * 10000;
    add("investment", selectedRoute.label, "Investment", base, familyMembers <= 4 ? `Family tier for ${familyMembers}` : `USD 180,000 family of four + ${familyMembers - 4} × USD 10,000`);
    add("passport_delivery", "Passport delivery", "Other", 5000, "Per application");
    add("due_diligence", "Due-diligence fee", "Due diligence", 5000, "Per application");
    if (asBoolean(criteria.restrictedNationality)) assumptions.push("Eligibility depends on proof of more than five years of residence outside the restricted country of origin.");
  }

  return finalizeCalculation(program, selectedRoute.label, selectedRoute.investmentKind, criteria, familyMembers, lines, assumptions, unresolvedCosts);
}

function finalizeCalculation(
  program: ProposalProgram,
  routeLabel: string,
  investmentType: string,
  criteria: Record<string, ProposalCriterionValue>,
  familyMembers: number,
  lines: ProposalCostLine[],
  assumptions: string[],
  unresolvedCosts: string[],
) {
  const included = lines.filter((line) => line.includedInTotal && line.amount != null);
  const sum = (category: ProposalCostCategory) => included.filter((line) => line.category === category).reduce((total, line) => total + (line.amount ?? 0), 0);
  const totalKnownCost = included.reduce((total, line) => total + (line.amount ?? 0), 0);
  const investmentMissing = lines.some((line) => line.category === "Investment" && line.amount == null);
  const quoteStatus = investmentMissing ? "not_calculable" : unresolvedCosts.length > 0 || lines.some((line) => !line.includedInTotal) ? "partial" : "complete";
  const visibleCriteria = visibleProposalCriteria(program, program.routes.find((candidate) => candidate.label === routeLabel)?.key ?? "");
  return {
    country: program.shortLabel,
    programName: program.label,
    programType: program.programType,
    currency: program.currency,
    sourceLabel: program.sourceLabel,
    routeLabel,
    investmentType,
    familyMembers,
    criteriaSnapshot: visibleCriteria.map((definition) => ({ label: definition.label, value: criteria[definition.key] ?? definition.defaultValue })),
    lineItems: lines,
    totalKnownCost,
    quoteStatus,
    assumptions,
    unresolvedCosts,
    breakdown: {
      investmentCost: sum("Investment"),
      governmentFee: sum("Government"),
      dueDiligenceFee: sum("Due diligence"),
      processingFee: sum("Processing"),
      otherFees: sum("Other"),
      totalCost: totalKnownCost,
      notes: [...assumptions, ...unresolvedCosts],
    },
  };
}

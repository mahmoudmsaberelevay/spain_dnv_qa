export type ProposalProgramType = "Citizenship" | "Residency";
export type ProposalCurrency = "USD" | "EUR";
export type ProposalCriterionValue = string | number | boolean;

export type ProposalCriterion = {
  key: string;
  label: string;
  type: "integer" | "amount" | "boolean" | "select";
  defaultValue: ProposalCriterionValue;
  min?: number;
  max?: number;
  step?: number;
  helpText?: string;
  showForRoutes?: string[];
  options?: Array<{ value: string; label: string }>;
};

export type ProposalRoute = {
  key: string;
  label: string;
  investmentKind: "donation" | "real_estate" | "capital_investment" | "bank_deposit" | "government_bonds" | "enterprise" | "job_creation";
  minimumLabel: string;
  rules: string[];
};

export type ProposalProgram = {
  key: string;
  label: string;
  shortLabel: string;
  flag: string;
  programType: ProposalProgramType;
  currency: ProposalCurrency;
  sourceLabel: string;
  routes: ProposalRoute[];
  criteria: ProposalCriterion[];
  disclosures: string[];
};

const integer = (key: string, label: string, helpText?: string): ProposalCriterion => ({ key, label, type: "integer", defaultValue: 0, min: 0, max: 20, step: 1, helpText });
const yesNo = (key: string, label: string, helpText?: string, showForRoutes?: string[]): ProposalCriterion => ({ key, label, type: "boolean", defaultValue: false, helpText, showForRoutes });
const money = (key: string, label: string, minimum: number, showForRoutes: string[], helpText?: string): ProposalCriterion => ({ key, label, type: "amount", defaultValue: minimum, min: minimum, max: 100_000_000, step: 1, showForRoutes, helpText });
const totalFamily = (): ProposalCriterion => ({ key: "familyMembers", label: "Total family members", type: "integer", defaultValue: 1, min: 1, max: 20, step: 1 });
const passports = (): ProposalCriterion => ({ key: "passportCount", label: "Passports required", type: "integer", defaultValue: 1, min: 1, max: 20, step: 1 });
const route = (key: string, label: string, investmentKind: ProposalRoute["investmentKind"], minimumLabel: string, rules: string[] = []): ProposalRoute => ({ key, label, investmentKind, minimumLabel, rules });

export const MARKETING_PROPOSAL_PROGRAMS: ProposalProgram[] = [
  {
    key: "antigua", label: "Antigua and Barbuda Citizenship by Investment Programme", shortLabel: "Antigua & Barbuda", flag: "🇦🇬", programType: "Citizenship", currency: "USD", sourceLabel: "Antigua.pdf",
    routes: [
      route("ndf", "National Development Fund (NDF)", "donation", "From USD 230,000"),
      route("higher_education", "Higher Education Contribution", "donation", "USD 260,000", ["Source pricing is stated for a family of six or more."]),
      route("real_estate", "Approved Real Estate Investment", "real_estate", "USD 300,000", ["Five-year holding period."]),
      route("business_establishment", "Business Establishment", "capital_investment", "USD 1,500,000"),
    ],
    criteria: [yesNo("spouse", "Include spouse"), integer("children0To11", "Dependent children aged 0–11"), integer("children12To17", "Dependent children aged 12–17"), integer("adultDependents", "Other adult dependants aged 18+ (excluding parents)"), integer("parents55Plus", "Dependent parents aged 55+")],
    disclosures: ["Professional fees and undefined benefactor due-diligence charges are not included."],
  },
  {
    key: "dominica", label: "Dominica Citizenship by Investment Programme", shortLabel: "Dominica", flag: "🇩🇲", programType: "Citizenship", currency: "USD", sourceLabel: "Dominica.webp",
    routes: [
      route("contribution", "Non-Refundable Contribution", "donation", "From USD 200,000", ["The source lists USD 250,000 for a family package of four."]),
      route("real_estate", "Approved Real Estate", "real_estate", "From USD 200,000", ["Minimum three-year holding period before resale to another programme applicant."]),
    ],
    criteria: [
      { key: "applicantProfile", label: "Due-diligence profile", type: "select", defaultValue: "standard", options: [{ value: "standard", label: "Standard / non-Iranian" }, { value: "iranian", label: "Iranian fee schedule" }], helpText: "Controls the due-diligence schedule in the supplied programme data." },
      yesNo("spouse", "Include spouse"), integer("children0To11", "Dependent children aged 0–11"), integer("children12To15", "Dependent children aged 12–15"), integer("children16To17", "Dependent children aged 16–17"), integer("adultDependents", "Other adult dependants aged 18+ (excluding parents)"), integer("parents65Plus", "Dependent parents aged 65+"), integer("additionalBeyond4Under18", "Additional members beyond the four-person package — under 18", "Use only when the total family exceeds four."), integer("additionalBeyond4Adults", "Additional members beyond the four-person package — aged 18+", "Use only when the total family exceeds four."),
      yesNo("expeditedPassport", "Include expedited passport service", "Adds USD 1,200 per passport."), money("propertyValue", "Property value", 200000, ["real_estate"]),
    ],
    disclosures: ["Professional fees are provided on request.", "The 4% share-registration charge is shown separately because its calculation base is not identified in the supplied source."],
  },
  {
    key: "egypt", label: "Egypt Residency by Investment Programme", shortLabel: "Egypt Residency", flag: "🇪🇬", programType: "Residency", currency: "USD", sourceLabel: "Egypt.webp",
    routes: [
      route("real_estate_5_year", "Real Estate — 5-Year Residency", "real_estate", "USD 200,000"), route("real_estate_3_year", "Real Estate — 3-Year Residency", "real_estate", "USD 100,000"), route("real_estate_1_year", "Real Estate — 1-Year Residency", "real_estate", "USD 50,000"), route("bank_deposit_3_year", "Bank Deposit — 3-Year Residency", "bank_deposit", "USD 100,000"), route("bank_deposit_1_year", "Bank Deposit — 1-Year Residency", "bank_deposit", "USD 50,000"),
    ],
    criteria: [money("propertyValue5", "Property value", 200000, ["real_estate_5_year"]), money("propertyValue3", "Property value", 100000, ["real_estate_3_year"]), money("propertyValue1", "Property value", 50000, ["real_estate_1_year"])],
    disclosures: ["The supplied source does not specify government, processing, due-diligence, dependant, or professional fees; those amounts are excluded."],
  },
  {
    key: "hungary", label: "Hungary Guest Investor Residency Programme", shortLabel: "Hungary Guest Investor", flag: "🇭🇺", programType: "Residency", currency: "EUR", sourceLabel: "Hungary.webp",
    routes: [route("property_fund", "Property Fund", "capital_investment", "EUR 250,000", ["Five-year holding period."]), route("real_estate", "Residential Real Estate", "real_estate", "From EUR 500,000", ["Five-year sale and encumbrance restriction."]), route("public_donation", "Public Donation", "donation", "EUR 1,000,000")],
    criteria: [money("propertyValue", "Property value", 500000, ["real_estate"]), money("annualRentalIncome", "Expected annual rental income", 0, ["real_estate"], "Used only to show the indicative annual 15% rental-income tax; it is not added to the upfront total.")],
    disclosures: ["Government processing, due-diligence, professional, and family-related fees are not specified in the supplied source."],
  },
  {
    key: "latvia", label: "Latvia Residency by Investment Programme", shortLabel: "Latvia Residency", flag: "🇱🇻", programType: "Residency", currency: "EUR", sourceLabel: "Latvia.pdf",
    routes: [route("capital_investment", "Capital Investment", "capital_investment", "EUR 50,000", ["Five-year holding period."]), route("financial_investment", "Financial Investment", "bank_deposit", "EUR 280,000", ["Five-year holding period."]), route("government_bonds", "Government Bonds", "government_bonds", "EUR 250,000", ["Non-interest-bearing; five-year holding period."]), route("real_estate", "Real Estate Investment", "real_estate", "From EUR 250,000", ["Five-year holding period."])],
    criteria: [yesNo("spouse", "Include spouse"), integer("children", "Dependent children"), money("propertyValue", "Property value", 250000, ["real_estate"])],
    disclosures: ["Maintenance funds, health insurance, and professional/legal fees are not included because the supplied source does not define their charging period or exact amount."],
  },
  {
    key: "malta", label: "Malta Permanent Residency Programme", shortLabel: "Malta Permanent Residency", flag: "🇲🇹", programType: "Residency", currency: "EUR", sourceLabel: "Malta.pdf",
    routes: [route("property_purchase", "Property Purchase", "real_estate", "From EUR 375,000"), route("property_rental", "Property Rental", "real_estate", "From EUR 14,000 per year", ["Property rent is recurring and is shown separately from the one-time total."])],
    criteria: [yesNo("spouse", "Include spouse"), integer("children", "Dependent children"), integer("dependentSpouses", "Spouses of dependent children"), integer("parents", "Dependent parents"), integer("grandparents", "Dependent grandparents"), money("propertyValue", "Property purchase value", 375000, ["property_purchase"]), money("annualRent", "Annual property rent", 14000, ["property_rental"])],
    disclosures: ["Professional fees are provided on request.", "The supplied source has overlapping EUR 7,500 dependant-fee descriptions; the calculator applies one EUR 7,500 contribution per listed dependant and does not double count it."],
  },
  {
    key: "nauru", label: "Nauru Economic and Climate Resilience Citizenship Programme", shortLabel: "Nauru", flag: "🇳🇷", programType: "Citizenship", currency: "USD", sourceLabel: "Naru.webp",
    routes: [route("treasury_fund", "Treasury Fund Contribution (ECRCP)", "donation", "From USD 105,000")],
    criteria: [totalFamily(), integer("siblings", "Siblings included"), integer("dependents16Plus", "Dependants aged 16+ (excluding main applicant)"), passports()],
    disclosures: ["Bank due-diligence/processing charges are approximately USD 1,200 for a single applicant but are higher for families; the exact charge and professional fees are excluded pending confirmation."],
  },
  {
    key: "sao_tome", label: "São Tomé and Príncipe Citizenship by Investment Programme", shortLabel: "São Tomé & Príncipe", flag: "🇸🇹", programType: "Citizenship", currency: "USD", sourceLabel: "saotome.webp",
    routes: [route("national_development_fund", "National Development Fund Contribution", "donation", "From USD 90,000")],
    criteria: [totalFamily(), { key: "adultApplicants", label: "Adult applicants", type: "integer", defaultValue: 1, min: 1, max: 20, step: 1, helpText: "Used for the USD 5,000 due-diligence charge per adult." }, passports()],
    disclosures: ["Professional fees are provided on request.", "The supplied family package for two to four applicants is stated as starting from USD 95,000."],
  },
  {
    key: "st_kitts", label: "Saint Kitts and Nevis Citizenship by Investment Programme", shortLabel: "St. Kitts & Nevis", flag: "🇰🇳", programType: "Citizenship", currency: "USD", sourceLabel: "St.Kitts.pdf",
    routes: [route("sisc", "Sustainable Island State Contribution", "donation", "USD 250,000"), route("developer_real_estate", "Developer Real Estate", "real_estate", "USD 325,000"), route("private_real_estate", "Private Real Estate", "real_estate", "From USD 325,000"), route("public_benefit", "Approved Public Benefit Project", "donation", "USD 250,000")],
    criteria: [yesNo("spouse", "Include spouse"), integer("dependentsUnder16", "Dependants under 16"), integer("dependents16To17", "Dependants aged 16–17"), integer("adultDependents", "Other adult dependants aged 18+ (excluding parents)"), integer("parents55Plus", "Dependent parents aged 55+"), integer("additionalBeyond4Under18", "Additional members beyond the four-person package — under 18", "Use only when the total family exceeds four."), integer("additionalBeyond4Adults", "Additional members beyond the four-person package — aged 18+", "Use only when the total family exceeds four."), money("propertyValue", "Property value", 325000, ["private_real_estate"]), yesNo("acceleratedProcess", "Request 60-day accelerated processing", "The accelerated schedule is shown separately pending confirmation of whether it replaces standard fees.")],
    disclosures: ["Professional, fingerprinting, and identity-verification costs are not included.", "Accelerated-process charges are shown but excluded from the total because the supplied source does not clarify whether they replace standard government and due-diligence fees."],
  },
  {
    key: "st_lucia", label: "Saint Lucia Citizenship by Investment Programme", shortLabel: "St. Lucia", flag: "🇱🇨", programType: "Citizenship", currency: "USD", sourceLabel: "st.lucia.pdf",
    routes: [route("national_economic_fund", "National Economic Fund", "donation", "USD 240,000"), route("real_estate", "Approved Real Estate Project", "real_estate", "USD 300,000"), route("government_bonds", "Government Bonds", "government_bonds", "USD 300,000"), route("enterprise_project", "Enterprise Project", "enterprise", "USD 250,000")],
    criteria: [yesNo("spouse", "Include spouse"), integer("dependentsUnder16", "Dependants under 16"), integer("dependents16To17", "Dependants aged 16–17"), integer("dependents18To21", "Dependants aged 18–21"), integer("dependents22To29", "Dependants aged 22–29"), integer("parents55Plus", "Dependent parents aged 55+"), integer("siblingsUnder18", "Dependent siblings under 18"), integer("additionalBeyond3Under18", "Additional dependants beyond the included three — under 18", "Use only when the standard application has more than three dependants."), integer("additionalBeyond3Adults", "Additional dependants beyond the included three — aged 18+", "Use only when the standard application has more than three dependants."), integer("newborns", "Newborn additions", "Use only for the separate post-approval newborn fee; do not also count them in the standard dependant groups."), integer("citizenSpouse", "Spouse added to an existing citizen", "Use only for the separate post-approval citizen-family fee."), integer("citizenDependents", "Dependants added to an existing citizen", "Use only for the separate post-approval citizen-family fee.")],
    disclosures: ["Professional fees are provided on request.", "The supplied administration-fee wording for very large families and government bonds is ambiguous; the calculator applies the clearly stated route schedule and flags the assumption."],
  },
  {
    key: "turkey", label: "Türkiye Citizenship by Investment Programme", shortLabel: "Türkiye", flag: "🇹🇷", programType: "Citizenship", currency: "USD", sourceLabel: "Turkey.webp",
    routes: [route("real_estate", "Real Estate", "real_estate", "From USD 400,000", ["Three-year resale restriction."]), route("capital_investment", "Capital Investment", "capital_investment", "USD 500,000", ["Three-year holding period."]), route("job_creation", "Job Creation", "job_creation", "Create at least 50 jobs")],
    criteria: [money("propertyValue", "Property value", 400000, ["real_estate"]), { key: "transferTaxRate", label: "Land-transfer tax rate (%)", type: "amount", defaultValue: 4, min: 1, max: 6, step: 0.1, showForRoutes: ["real_estate"], helpText: "The supplied source states 4–6% in most cases and notes that some cases can be as low as 1%." }, yesNo("includeAnnualPropertyCosts", "Show annual property tax and insurance", "Shows annual 1% property tax and USD 200 insurance separately from the upfront total.", ["real_estate"])],
    disclosures: ["Professional, legal, government, and additional ELEVAY service fees are provided on request.", "The job-creation route has no source-supported investment amount, so it cannot produce a complete quoted total."],
  },
  {
    key: "vanuatu", label: "Vanuatu Citizenship by Investment Programme", shortLabel: "Vanuatu", flag: "🇻🇺", programType: "Citizenship", currency: "USD", sourceLabel: "vanuatu.webp",
    routes: [route("development_support", "Development Support Programme Donation", "donation", "From USD 130,000")],
    criteria: [yesNo("spouse", "Include spouse"), integer("childrenUnder18", "Dependent children under 18"), integer("adultDependents", "Additional adult dependants"), yesNo("restrictedNationality", "Restricted-nationality applicant meeting the five-year external-residency rule", "Eligibility note only; it does not change the supplied fees.")],
    disclosures: ["Professional fees are provided on request."],
  },
];

export const MARKETING_PROPOSAL_PROGRAM_MAP = Object.fromEntries(
  MARKETING_PROPOSAL_PROGRAMS.map((program) => [program.key, program]),
) as Record<string, ProposalProgram>;

export function defaultProposalCriteria(program: ProposalProgram): Record<string, ProposalCriterionValue> {
  return Object.fromEntries(program.criteria.map((criterion) => [criterion.key, criterion.defaultValue]));
}

export function visibleProposalCriteria(program: ProposalProgram, routeKey: string): ProposalCriterion[] {
  return program.criteria.filter((criterion) => !criterion.showForRoutes || criterion.showForRoutes.includes(routeKey));
}

export const proposalCriterionBuilders = { integer, yesNo, money, totalFamily, passports, route };

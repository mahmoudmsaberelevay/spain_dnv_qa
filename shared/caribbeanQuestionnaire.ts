import { questionnaireArabic } from "./caribbeanQuestionnaireArabic";

export const CARIBBEAN_QUESTIONNAIRE_VERSION = "2026-09-21-v1";

export type QuestionnaireFieldType =
  | "text"
  | "textarea"
  | "date"
  | "month"
  | "email"
  | "tel"
  | "number"
  | "select"
  | "yes_no"
  | "acknowledgement"
  | "signature"
  | "repeatable";

export type QuestionnaireRowField = {
  key: string;
  label: string;
  labelAr?: string;
  type?: Exclude<QuestionnaireFieldType, "repeatable" | "signature" | "acknowledgement">;
  options?: string[];
  optionsAr?: string[];
};

export type QuestionnaireStep = {
  key: string;
  section: string;
  sectionAr?: string;
  title: string;
  titleAr?: string;
  prompt: string;
  promptAr?: string;
  type: QuestionnaireFieldType;
  options?: string[];
  optionsAr?: string[];
  optional?: boolean;
  help?: string;
  helpAr?: string;
  fields?: QuestionnaireRowField[];
  addRowLabel?: string;
  addRowLabelAr?: string;
  detailRequiredWhenYes?: boolean;
  confirmationRequired?: boolean;
  appliesWhen?: { key: string; equals: string };
};

const q = (
  key: string,
  section: string,
  prompt: string,
  type: QuestionnaireFieldType = "text",
  extra: Partial<QuestionnaireStep> = {},
): QuestionnaireStep => ({
  key,
  section,
  sectionAr: questionnaireArabic(section),
  title: prompt,
  titleAr: questionnaireArabic(prompt),
  prompt,
  promptAr: questionnaireArabic(prompt),
  type,
  ...extra,
  helpAr: extra.help ? questionnaireArabic(extra.help) : undefined,
  optionsAr: extra.options?.map(questionnaireArabic),
  fields: extra.fields?.map(field => ({
    ...field,
    labelAr: questionnaireArabic(field.label),
    optionsAr: field.options?.map(questionnaireArabic),
  })),
  addRowLabelAr: extra.addRowLabel ? questionnaireArabic(extra.addRowLabel) : undefined,
});

const mainPersonal: QuestionnaireStep[] = [
  q("main.surname", "Main Applicant · Personal Information", "Surname / Family Name"),
  q("main.firstName", "Main Applicant · Personal Information", "First / Given Name"),
  q("main.otherNames", "Main Applicant · Personal Information", "Other names or aliases", "text", { help: "Enter N/A when not applicable." }),
  q("main.dateOfBirth", "Main Applicant · Personal Information", "Date of birth", "date"),
  q("main.placeCountryBirth", "Main Applicant · Personal Information", "Place and country of birth"),
  q("main.citizenshipAtBirth", "Main Applicant · Personal Information", "Citizenship at birth"),
  q("main.presentCitizenship", "Main Applicant · Personal Information", "Present citizenship"),
  q("main.otherCitizenship", "Main Applicant · Personal Information", "Other citizenship", "text", { help: "Enter N/A when not applicable." }),
  q("main.languages", "Main Applicant · Personal Information", "Languages you speak and write, including level (Native, Fluent, or Basic)", "textarea"),
  q("main.identityCard", "Main Applicant · Personal Information", "Identity card number and issuing country"),
  q("main.socialSecurity", "Main Applicant · Personal Information", "Social Security number and issuing country", "text", { help: "Enter N/A when not applicable." }),
  q("main.drivingLicense", "Main Applicant · Personal Information", "Driving licence number and issuing country", "text", { help: "Enter N/A when not applicable." }),
  q("main.drivingLicenseExpiry", "Main Applicant · Personal Information", "Driving licence expiry date", "text", { help: "Enter N/A when not applicable." }),
  q("main.height", "Main Applicant · Personal Information", "Height"),
  q("main.weight", "Main Applicant · Personal Information", "Weight"),
  q("main.hairColor", "Main Applicant · Personal Information", "Hair colour"),
  q("main.eyeColor", "Main Applicant · Personal Information", "Eye colour"),
  q("main.distinguishingMarks", "Main Applicant · Personal Information", "Distinguishing marks", "text", { help: "Enter N/A when not applicable." }),
];

const mainContact: QuestionnaireStep[] = [
  q("main.currentAddress", "Main Applicant · Address and Contact", "Current residential address", "textarea"),
  q("main.currentAddressSince", "Main Applicant · Address and Contact", "Date since residing at the current address", "date"),
  q("main.permanentAddress", "Main Applicant · Address and Contact", "Permanent residential address", "textarea"),
  q("main.permanentAddressSince", "Main Applicant · Address and Contact", "Date since residing at the permanent address", "date"),
  q("main.homePhone", "Main Applicant · Address and Contact", "Permanent telephone number / home landline", "tel"),
  q("main.mobile", "Main Applicant · Address and Contact", "Mobile number", "tel"),
  q("main.otherPhone", "Main Applicant · Address and Contact", "Other telephone number", "tel", { help: "Enter N/A when not applicable." }),
  q("main.fax", "Main Applicant · Address and Contact", "Fax number", "text", { help: "Enter N/A when not applicable." }),
  q("main.email", "Main Applicant · Address and Contact", "Email address", "email"),
];

const mainEmploymentBusinessIncome: QuestionnaireStep[] = [
  q("main.currentOccupation", "Main Applicant · Employment", "Current occupation"),
  q("main.occupationTraining", "Main Applicant · Employment", "Occupation by training"),
  q("main.companyName", "Main Applicant · Employment", "Name of company"),
  q("main.companyAddress", "Main Applicant · Employment", "Company address", "textarea"),
  q("main.companyPhone", "Main Applicant · Employment", "Company telephone number", "tel"),
  q("main.companyFax", "Main Applicant · Employment", "Company fax number", "text", { help: "Enter N/A when not applicable." }),
  q("main.companyCounterparties", "Main Applicant · Employment", "Most important persons or companies with whom you do business", "textarea"),
  q("main.businessName", "Main Applicant · Business", "Name of business", "text", { help: "Enter N/A when not applicable." }),
  q("main.businessAddress", "Main Applicant · Business", "Business address", "textarea", { help: "Enter N/A when not applicable." }),
  q("main.businessNature", "Main Applicant · Business", "Nature of business", "textarea", { help: "Enter N/A when not applicable." }),
  q("main.businessPhone", "Main Applicant · Business", "Business telephone number", "tel", { help: "Enter N/A when not applicable." }),
  q("main.businessFax", "Main Applicant · Business", "Business fax number", "text", { help: "Enter N/A when not applicable." }),
  q("main.businessCounterparties", "Main Applicant · Business", "Most important persons or companies with whom the business trades", "textarea", { help: "Enter N/A when not applicable." }),
  q("main.mainIncomeSources", "Main Applicant · Source of Income", "Main sources of income", "textarea"),
  q("main.annualIncomeBand", "Main Applicant · Source of Income", "Average annual net income in US dollars during the past three years", "select", { options: ["More than USD 100,000", "More than USD 500,000", "More than USD 1,000,000"] }),
  q("main.totalAssetsBand", "Main Applicant · Source of Income", "Current total personal net assets in US dollars", "select", { options: ["More than USD 500,000", "More than USD 2,000,000", "More than USD 10,000,000"] }),
  q("main.estimatedNetWorth", "Main Applicant · Source of Income", "Estimated net worth (assets minus liabilities in USD)"),
  q("main.businessJurisdictions", "Main Applicant · Source of Income", "Main geographical jurisdictions in which your business is conducted", "textarea", { help: "Enter N/A when not applicable." }),
  q("main.wealthHistory", "Main Applicant · Source of Income", "Summarise how you accumulated your total net worth, including main acquisitions, disposals, and events", "textarea"),
  q("main.fixedAssets", "Main Applicant · Source of Income", "Fixed assets (USD)"),
  q("main.savingsDeposits", "Main Applicant · Source of Income", "Savings and deposits (USD)"),
  q("main.investments", "Main Applicant · Source of Income", "Investments such as stocks, shares, bonds, and debentures (USD)"),
  q("main.realEstate", "Main Applicant · Source of Income", "Real estate holdings (USD)"),
  q("main.businessAssets", "Main Applicant · Source of Income", "Business assets (USD)"),
  q("main.liabilities", "Main Applicant · Source of Income", "Total liabilities (USD)"),
  q("main.longTermLoans", "Main Applicant · Source of Income", "Outstanding long-term loans, including mortgage, car, or personal loans"),
  q("main.shortTermLiabilities", "Main Applicant · Source of Income", "Outstanding short-term liabilities, including credit cards or tax liability"),
];

const relationshipFields: QuestionnaireRowField[] = [
  { key: "surname", label: "Surname / Family Name" },
  { key: "firstName", label: "First / Given Name" },
  { key: "otherNames", label: "Other names / known as" },
  { key: "gender", label: "Gender" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "placeCountryBirth", label: "Place and country of birth" },
  { key: "citizenship", label: "Citizenship" },
  { key: "address", label: "Complete residential address", type: "textarea" },
  { key: "maritalStatus", label: "Marital status" },
  { key: "occupation", label: "Current occupation" },
  { key: "passportNumber", label: "Passport number" },
  { key: "issuingCountry", label: "Issuing country" },
];

const childrenFields: QuestionnaireRowField[] = [
  { key: "surname", label: "Surname / Family Name" },
  { key: "firstName", label: "First / Given Name" },
  { key: "gender", label: "Gender" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "placeCountryBirth", label: "Place and country of birth" },
  { key: "citizenship", label: "Citizenship" },
  { key: "countryOfResidence", label: "Country of residence" },
  { key: "homePhone", label: "Home telephone number", type: "tel" },
  { key: "mobile", label: "Mobile number", type: "tel" },
  { key: "passportNumber", label: "Passport number" },
  { key: "issuingCountry", label: "Issuing country" },
  { key: "email", label: "Email address", type: "email" },
  { key: "height", label: "Height" },
  { key: "weight", label: "Weight" },
  { key: "hairColor", label: "Hair colour" },
  { key: "eyeColor", label: "Eye colour" },
  { key: "distinguishingMarks", label: "Distinguishing marks" },
];

const addressHistoryFields: QuestionnaireRowField[] = [
  { key: "from", label: "From", type: "month" },
  { key: "to", label: "To", type: "month" },
  { key: "address", label: "Street, building/villa, town/city, postal code, and country", type: "textarea" },
];

const educationFields: QuestionnaireRowField[] = [
  { key: "from", label: "From", type: "month" },
  { key: "to", label: "To", type: "month" },
  { key: "school", label: "Name of school" },
  { key: "location", label: "City and country" },
  { key: "qualification", label: "Qualification / diploma obtained" },
];

const employmentHistoryFields: QuestionnaireRowField[] = [
  { key: "from", label: "From", type: "month" },
  { key: "to", label: "To", type: "month" },
  { key: "occupation", label: "Occupation" },
  { key: "employer", label: "Employer / company" },
  { key: "address", label: "Complete address", type: "textarea" },
  { key: "businessType", label: "Type of business" },
];

const licenseFields: QuestionnaireRowField[] = [
  { key: "licenseName", label: "Licence name" },
  { key: "licenseNumber", label: "Licence number" },
  { key: "licensingBody", label: "Licensing body" },
  { key: "dateHeld", label: "Date held / validity period" },
];

const parentQuestions = (prefix: "main" | "spouse", sectionPrefix: string): QuestionnaireStep[] => [
  q(`${prefix}.fatherSurname`, `${sectionPrefix} · Parents`, "Father's surname / family name"),
  q(`${prefix}.fatherFirstName`, `${sectionPrefix} · Parents`, "Father's first / given name"),
  q(`${prefix}.fatherDateOfBirth`, `${sectionPrefix} · Parents`, "Father's date of birth", "date"),
  q(`${prefix}.fatherPlaceCountryBirth`, `${sectionPrefix} · Parents`, "Father's place and country of birth"),
  q(`${prefix}.fatherCitizenship`, `${sectionPrefix} · Parents`, "Father's citizenship"),
  q(`${prefix}.fatherLifeStatus`, `${sectionPrefix} · Parents`, "Is the father alive or deceased?", "select", { options: ["Alive", "Deceased"] }),
  q(`${prefix}.fatherOccupation`, `${sectionPrefix} · Parents`, "Father's current occupation"),
  q(`${prefix}.fatherHomePhone`, `${sectionPrefix} · Parents`, "Father's home telephone number", "tel"),
  q(`${prefix}.fatherMobile`, `${sectionPrefix} · Parents`, "Father's mobile number", "tel"),
  q(`${prefix}.fatherAddress`, `${sectionPrefix} · Parents`, "Father's complete residential address", "textarea"),
  q(`${prefix}.fatherAddressSince`, `${sectionPrefix} · Parents`, "Date since father has resided at the current address", "date"),
  q(`${prefix}.fatherPassport`, `${sectionPrefix} · Parents`, "Father's passport number"),
  q(`${prefix}.fatherPassportCountry`, `${sectionPrefix} · Parents`, "Father's passport issuing country"),
  q(`${prefix}.fatherMarriageDate`, `${sectionPrefix} · Parents`, "Father's date of marriage", "date"),
  q(`${prefix}.fatherMarriagePlace`, `${sectionPrefix} · Parents`, "Father's place and country of marriage"),
  q(`${prefix}.motherSurname`, `${sectionPrefix} · Parents`, "Mother's surname / family name"),
  q(`${prefix}.motherFirstName`, `${sectionPrefix} · Parents`, "Mother's first / given name"),
  q(`${prefix}.motherDateOfBirth`, `${sectionPrefix} · Parents`, "Mother's date of birth", "date"),
  q(`${prefix}.motherPlaceCountryBirth`, `${sectionPrefix} · Parents`, "Mother's place and country of birth"),
  q(`${prefix}.motherCitizenship`, `${sectionPrefix} · Parents`, "Mother's citizenship"),
  q(`${prefix}.motherOccupation`, `${sectionPrefix} · Parents`, "Mother's current occupation"),
  q(`${prefix}.motherAddress`, `${sectionPrefix} · Parents`, "Mother's complete residential address", "textarea"),
  q(`${prefix}.motherAddressSince`, `${sectionPrefix} · Parents`, "Date since mother has resided at the current address", "date"),
  q(`${prefix}.motherPassport`, `${sectionPrefix} · Parents`, "Mother's passport number"),
  q(`${prefix}.motherPassportCountry`, `${sectionPrefix} · Parents`, "Mother's passport issuing country"),
  q(`${prefix}.paternalGrandfatherSurname`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandfather's surname / family name"),
  q(`${prefix}.paternalGrandfatherFirstName`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandfather's first / given name"),
  q(`${prefix}.paternalGrandfatherDateOfBirth`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandfather's date of birth", "date"),
  q(`${prefix}.paternalGrandfatherBirthPlace`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandfather's place and country of birth"),
  q(`${prefix}.paternalGrandmotherSurname`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandmother's surname / family name"),
  q(`${prefix}.paternalGrandmotherFirstName`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandmother's first / given name"),
  q(`${prefix}.paternalGrandmotherDateOfBirth`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandmother's date of birth", "date"),
  q(`${prefix}.paternalGrandmotherBirthPlace`, `${sectionPrefix} · Paternal Grandparents`, "Paternal grandmother's place and country of birth"),
];

const spouseWhen = { key: "application.spouseIncluded", equals: "yes" } as const;

const spousePersonal: QuestionnaireStep[] = [
  q("application.spouseIncluded", "Family Included in Application", "Is a spouse included in this citizenship application?", "yes_no"),
  q("application.dependentsIncluded", "Family Included in Application", "Are any children or other dependants included in this application?", "yes_no"),
  ...[
    q("spouse.surname", "Spouse · Personal Information", "Spouse surname / family name"),
    q("spouse.firstName", "Spouse · Personal Information", "Spouse first / given name"),
    q("spouse.otherNames", "Spouse · Personal Information", "Spouse other names or aliases"),
    q("spouse.dateOfBirth", "Spouse · Personal Information", "Spouse date of birth", "date"),
    q("spouse.placeCountryBirth", "Spouse · Personal Information", "Spouse place and country of birth"),
    q("spouse.citizenshipAtBirth", "Spouse · Personal Information", "Spouse citizenship at birth"),
    q("spouse.presentCitizenship", "Spouse · Personal Information", "Spouse present citizenship"),
    q("spouse.otherCitizenship", "Spouse · Personal Information", "Spouse other citizenship"),
    q("spouse.languages", "Spouse · Personal Information", "Languages the spouse speaks and writes", "textarea"),
    q("spouse.identityCard", "Spouse · Personal Information", "Spouse identity card number and issuing country"),
    q("spouse.socialSecurity", "Spouse · Personal Information", "Spouse Social Security number and issuing country"),
    q("spouse.drivingLicense", "Spouse · Personal Information", "Spouse driving licence number and issuing country"),
    q("spouse.drivingLicenseExpiry", "Spouse · Personal Information", "Spouse driving licence expiry date"),
    q("spouse.height", "Spouse · Personal Information", "Spouse height"),
    q("spouse.weight", "Spouse · Personal Information", "Spouse weight"),
    q("spouse.hairColor", "Spouse · Personal Information", "Spouse hair colour"),
    q("spouse.eyeColor", "Spouse · Personal Information", "Spouse eye colour"),
    q("spouse.distinguishingMarks", "Spouse · Personal Information", "Spouse distinguishing marks"),
    q("spouse.currentAddress", "Spouse · Address and Contact", "Spouse current residential address", "textarea"),
    q("spouse.currentAddressSince", "Spouse · Address and Contact", "Date since spouse has resided at the current address", "date"),
    q("spouse.permanentAddress", "Spouse · Address and Contact", "Spouse permanent residential address", "textarea"),
    q("spouse.permanentAddressSince", "Spouse · Address and Contact", "Date since spouse has resided at the permanent address", "date"),
    q("spouse.homePhone", "Spouse · Address and Contact", "Spouse home telephone number", "tel"),
    q("spouse.mobile", "Spouse · Address and Contact", "Spouse mobile number", "tel"),
    q("spouse.otherPhone", "Spouse · Address and Contact", "Spouse other telephone number", "tel"),
    q("spouse.fax", "Spouse · Address and Contact", "Spouse fax number"),
    q("spouse.email", "Spouse · Address and Contact", "Spouse email address", "email"),
    q("spouse.currentOccupation", "Spouse · Employment", "Spouse current occupation"),
    q("spouse.occupationTraining", "Spouse · Employment", "Spouse occupation by training"),
    q("spouse.companyName", "Spouse · Employment", "Spouse company name"),
    q("spouse.companyAddress", "Spouse · Employment", "Spouse company address", "textarea"),
    q("spouse.companyPhone", "Spouse · Employment", "Spouse company telephone number", "tel"),
    q("spouse.companyFax", "Spouse · Employment", "Spouse company fax number"),
    q("spouse.companyCounterparties", "Spouse · Employment", "Most important persons or companies with whom the spouse does business", "textarea"),
    q("spouse.businessName", "Spouse · Business", "Spouse business name"),
    q("spouse.businessAddress", "Spouse · Business", "Spouse business address", "textarea"),
    q("spouse.businessNature", "Spouse · Business", "Nature of the spouse's business", "textarea"),
    q("spouse.businessPhone", "Spouse · Business", "Spouse business telephone number", "tel"),
    q("spouse.businessFax", "Spouse · Business", "Spouse business fax number"),
    q("spouse.businessCounterparties", "Spouse · Business", "Most important persons or companies with whom the spouse's business trades", "textarea"),
    q("spouse.mainIncomeSources", "Spouse · Source of Income", "Spouse main sources of income", "textarea"),
    q("spouse.annualIncome", "Spouse · Source of Income", "Spouse average annual net income in USD during the past three years"),
    q("spouse.totalAssets", "Spouse · Source of Income", "Spouse current total personal net assets in USD"),
    q("spouse.estimatedNetWorth", "Spouse · Source of Income", "Spouse estimated net worth in USD"),
    q("spouse.businessJurisdictions", "Spouse · Source of Income", "Main jurisdictions in which the spouse's business is conducted", "textarea"),
    q("spouse.wealthHistory", "Spouse · Source of Income", "Summarise how the spouse accumulated total net worth", "textarea"),
    q("spouse.fixedAssets", "Spouse · Source of Income", "Spouse fixed assets (USD)"),
    q("spouse.savingsDeposits", "Spouse · Source of Income", "Spouse savings and deposits (USD)"),
    q("spouse.investments", "Spouse · Source of Income", "Spouse investments (USD)"),
    q("spouse.realEstate", "Spouse · Source of Income", "Spouse real estate holdings (USD)"),
    q("spouse.businessAssets", "Spouse · Source of Income", "Spouse business assets (USD)"),
    q("spouse.liabilities", "Spouse · Source of Income", "Spouse total liabilities (USD)"),
    q("spouse.longTermLoans", "Spouse · Source of Income", "Spouse outstanding long-term loans"),
    q("spouse.shortTermLiabilities", "Spouse · Source of Income", "Spouse outstanding short-term liabilities"),
  ].map(step => ({ ...step, appliesWhen: spouseWhen })),
];

const declarations = [
  "Have you ever been arrested, charged, convicted, found guilty, or had an offence expunged in any country, except minor traffic citations?",
  "Have you ever been denied a visa to a country with which the country you are applying for has visa-free access, without later successfully obtaining that visa?",
  "Have you ever had a visa cancelled?",
  "Have you ever been declared bankrupt by a court?",
  "Have you ever been involved personally, or as a director, in bankruptcy, insolvency, or liquidation proceedings?",
  "Have you ever testified before a grand jury, investigative hearing, or probe?",
  "Have any charges or accusations of illegal activity of any nature been made against you in any country?",
  "Have you ever been the subject of a criminal investigation?",
  "Have you ever been considered a potential national security risk in any country?",
  "Have you ever been sentenced to detention or been on probation?",
  "Have you ever received a pardon for any criminal offence?",
  "Have you ever had a civil or criminal record expunged or sealed by court order?",
  "Have you ever been subpoenaed to testify before a federal, state, or county grand jury, board, or commission?",
  "Has a criminal indictment, information, or complaint ever been returned against you without arrest, or named you as an unindicted co-party?",
  "Have you, as an individual, owner, partner, director, or officer, ever been party to a lawsuit as plaintiff or defendant, other than divorce?",
  "Have you ever been involved directly or indirectly in financing terrorism or in any terrorist or criminal organisation?",
  "Have you ever been unlawfully present in, deported from, or assisted others to enter or remain unlawfully in any country?",
  "Have you ever applied for citizenship in any country where citizenship was not granted?",
  "Have you ever been subject to an order, judgment, or decree limiting your right to engage in a professional or business practice?",
  "Are you a Politically Exposed Person (PEP), a family member, or a close associate of a PEP?",
  "Have you ever been declared mentally incapacitated by a court or qualified health practitioner?",
  "Are there any other business activities in which you are engaged that have not already been disclosed in this form?",
  "To the best of your knowledge, have you ever been under investigation by a law-enforcement agency or tax authority in any country?",
  "I confirm that my wealth has been obtained from completely legitimate sources and is not directly or indirectly the proceeds of criminal activity.",
  "I confirm that I am fully compliant with my national, regional, and global tax obligations.",
];

const declarationSteps: QuestionnaireStep[] = declarations.map((prompt, index) => q(
  `declaration.${index + 1}`,
  "Declarations",
  `${index + 1}. ${prompt}`,
  "yes_no",
  {
    detailRequiredWhenYes: index < 23,
    confirmationRequired: index >= 23,
    help: index < 23 ? "If Yes, provide the full date, place, authority, outcome, and explanation." : "Select Yes to confirm this declaration.",
  },
));

export const CARIBBEAN_QUESTIONNAIRE_STEPS: QuestionnaireStep[] = [
  ...mainPersonal,
  ...mainContact,
  ...mainEmploymentBusinessIncome,
  q("main.licenses", "Main Applicant · Professional Licences", "List all valid and expired professional licences", "repeatable", { fields: licenseFields, addRowLabel: "Add another licence", optional: true }),
  q("main.licenseDiscipline", "Main Applicant · Professional Licences", "Have any disciplinary actions ever been taken against you in relation to a professional licence?", "yes_no", { detailRequiredWhenYes: true }),
  q("main.currentSpouseNameAfterMarriage", "Main Applicant · Spouse Details", "Current spouse full name after marriage"),
  q("main.currentSpouseNameBeforeMarriage", "Main Applicant · Spouse Details", "Current spouse full name before marriage"),
  q("main.currentSpouseDateOfBirth", "Main Applicant · Spouse Details", "Current spouse date of birth", "date"),
  q("main.currentSpousePlaceBirth", "Main Applicant · Spouse Details", "Current spouse place of birth"),
  q("main.currentSpouseMarriagePlace", "Main Applicant · Spouse Details", "Place of current marriage"),
  q("main.currentSpouseMarriageDate", "Main Applicant · Spouse Details", "Date of current marriage", "date"),
  q("main.previousSpouses", "Main Applicant · Previous Spouse", "Previous spouse details", "repeatable", { optional: true, addRowLabel: "Add another previous spouse", fields: [
    { key: "nameAfterMarriage", label: "Full name after marriage" },
    { key: "nameBeforeMarriage", label: "Full name before marriage" },
    { key: "dateOfBirth", label: "Date of birth", type: "date" },
    { key: "placeOfBirth", label: "Place of birth" },
    { key: "placeOfMarriage", label: "Place of marriage" },
    { key: "dateOfMarriage", label: "Date of marriage", type: "date" },
    { key: "dateOfDivorce", label: "Date of divorce", type: "date" },
    { key: "marriagePeriod", label: "Period of marriage in years and months" },
  ] }),
  ...parentQuestions("main", "Main Applicant · Family Information"),
  q("main.siblings", "Main Applicant · Family Information", "Brothers and sisters, including half, step, and adopted siblings", "repeatable", { optional: true, fields: relationshipFields, addRowLabel: "Add another brother or sister" }),
  q("main.children", "Main Applicant · Family Information", "Children", "repeatable", { optional: true, fields: childrenFields, addRowLabel: "Add another child" }),
  q("main.addressHistory", "Main Applicant · Address History", "Addresses where you have lived during the past 10 years, starting with your current residence", "repeatable", { fields: addressHistoryFields, addRowLabel: "Add another address" }),
  q("main.educationHistory", "Main Applicant · Education", "All education and qualifications obtained", "repeatable", { fields: educationFields, addRowLabel: "Add another education record" }),
  q("main.employmentHistory", "Main Applicant · Employment History", "All employment history, unemployment periods, and active or inactive self-employed companies", "repeatable", { fields: employmentHistoryFields, addRowLabel: "Add another employment record" }),
  q("emergency.fullName", "Emergency Contact", "Emergency contact full name"),
  q("emergency.address", "Emergency Contact", "Emergency contact complete address", "textarea"),
  q("emergency.phone", "Emergency Contact", "Emergency contact telephone or mobile number", "tel"),
  q("emergency.email", "Emergency Contact", "Emergency contact email", "email"),
  q("emergency.relationship", "Emergency Contact", "Emergency contact relationship to you"),
  q("application.alternativeCitizenshipReason", "Application", "Explain in detail why you are seeking an alternative citizenship", "textarea"),
  ...spousePersonal,
  q("spouse.licenses", "Spouse · Professional Licences", "List the spouse's valid and expired professional licences", "repeatable", { fields: licenseFields, addRowLabel: "Add another licence", optional: true, appliesWhen: spouseWhen }),
  q("spouse.licenseDiscipline", "Spouse · Professional Licences", "Has the spouse ever had disciplinary action related to a professional licence?", "yes_no", { detailRequiredWhenYes: true, appliesWhen: spouseWhen }),
  q("spouse.previousSpouses", "Spouse · Previous Spouse", "Spouse's previous spouse details", "repeatable", { optional: true, addRowLabel: "Add another previous spouse", appliesWhen: spouseWhen, fields: [
    { key: "nameAfterMarriage", label: "Full name after marriage" },
    { key: "nameBeforeMarriage", label: "Full name before marriage" },
    { key: "dateOfBirth", label: "Date of birth", type: "date" },
    { key: "placeOfBirth", label: "Place of birth" },
    { key: "placeOfMarriage", label: "Place of marriage" },
    { key: "dateOfMarriage", label: "Date of marriage", type: "date" },
    { key: "dateOfDivorce", label: "Date of divorce", type: "date" },
    { key: "marriagePeriod", label: "Period of marriage in years and months" },
  ] }),
  ...parentQuestions("spouse", "Spouse · Family Information").map(step => ({ ...step, appliesWhen: spouseWhen })),
  q("spouse.siblings", "Spouse · Family Information", "Spouse's brothers and sisters, including half, step, and adopted siblings", "repeatable", { optional: true, fields: relationshipFields, addRowLabel: "Add another brother or sister", appliesWhen: spouseWhen }),
  q("spouse.addressHistory", "Spouse · Address History", "Spouse addresses during the past 10 years, starting with the current residence", "repeatable", { fields: addressHistoryFields, addRowLabel: "Add another address", appliesWhen: spouseWhen }),
  q("family.educationHistory", "Spouse and Dependants · Education", "Education history for the spouse and every included dependant", "repeatable", { optional: true, addRowLabel: "Add another education record", fields: [
    { key: "personName", label: "Person's full name" },
    { key: "relationship", label: "Relationship", type: "select", options: ["Spouse", "Child", "Other dependant"] },
    { key: "educationLevel", label: "Education level", type: "select", options: ["Elementary", "High School", "College / University", "Masters / PhD"] },
    { key: "school", label: "Name of school" },
    { key: "from", label: "From", type: "month" },
    { key: "to", label: "To", type: "month" },
    { key: "location", label: "City and country" },
  ] }),
  q("spouse.employmentHistory", "Spouse · Employment History", "All spouse employment history, unemployment periods, and active or inactive self-employed companies", "repeatable", { fields: employmentHistoryFields, addRowLabel: "Add another employment record", appliesWhen: spouseWhen }),
  ...declarationSteps,
  q("undertakings.accepted", "Undertakings and Pledges", "I acknowledge the visa-refusal, compatible-visa, full-disclosure, adverse-history, company-document, and professional-licence undertakings stated in this questionnaire.", "acknowledgement", { confirmationRequired: true }),
  q("signature", "Declaration and Signature", "I declare that the information provided is true and correct, and I undertake to inform ELEVAY immediately of any change.", "signature", { confirmationRequired: true }),
];

export type CaribbeanQuestionnaireAnswers = Record<string, unknown>;

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

export function normalizeCaribbeanQuestionnaireAnswers(input: unknown): CaribbeanQuestionnaireAnswers {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const normalized: CaribbeanQuestionnaireAnswers = {};
  for (const step of CARIBBEAN_QUESTIONNAIRE_STEPS) {
    const value = source[step.key];
    if (step.type === "repeatable") {
      normalized[step.key] = (Array.isArray(value) ? value : []).slice(0, 50).map(row => {
        const rowSource = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
        return Object.fromEntries((step.fields ?? []).map(field => [field.key, boundedText(rowSource[field.key], field.type === "textarea" ? 10_000 : 1_000)]));
      });
    } else if (step.type === "signature") {
      const signature = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      normalized[step.key] = {
        fullName: boundedText(signature.fullName, 500),
        date: boundedText(signature.date, 32),
        confirmed: signature.confirmed === true,
      };
    } else if (step.type === "acknowledgement") {
      normalized[step.key] = value === true || value === "yes";
    } else if (step.type === "yes_no") {
      normalized[step.key] = value === "yes" || value === "no" ? value : "";
      if (step.detailRequiredWhenYes) normalized[`${step.key}.details`] = boundedText(source[`${step.key}.details`], 10_000);
    } else {
      normalized[step.key] = boundedText(value, step.type === "textarea" ? 10_000 : 1_000);
    }
  }
  return normalized;
}

export function visibleCaribbeanQuestionnaireSteps(answers: CaribbeanQuestionnaireAnswers) {
  return CARIBBEAN_QUESTIONNAIRE_STEPS.filter(step => {
    if (!step.appliesWhen) return true;
    return answers[step.appliesWhen.key] === step.appliesWhen.equals;
  });
}

function hasValue(value: unknown) {
  return typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined;
}

function rowHasAnyValue(row: unknown, fields: QuestionnaireRowField[]) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  return fields.some(field => hasValue((row as Record<string, unknown>)[field.key]));
}

export function validateCaribbeanQuestionnaire(answers: CaribbeanQuestionnaireAnswers) {
  const missing: string[] = [];
  for (const step of visibleCaribbeanQuestionnaireSteps(answers)) {
    const value = answers[step.key];
    if (step.type === "repeatable") {
      const rows = Array.isArray(value) ? value.filter(row => rowHasAnyValue(row, step.fields ?? [])) : [];
      if (!step.optional && rows.length === 0) missing.push(step.key);
      rows.forEach((row, rowIndex) => {
        for (const field of step.fields ?? []) {
          if (!hasValue((row as Record<string, unknown>)[field.key])) missing.push(`${step.key}.${rowIndex}.${field.key}`);
        }
      });
      continue;
    }
    if (step.type === "yes_no") {
      if (value !== "yes" && value !== "no") missing.push(step.key);
      if (step.confirmationRequired && value !== "yes") missing.push(`${step.key}.confirmation`);
      if (step.detailRequiredWhenYes && value === "yes" && !hasValue(answers[`${step.key}.details`])) missing.push(`${step.key}.details`);
      continue;
    }
    if (step.type === "acknowledgement") {
      if (value !== true && value !== "yes") missing.push(step.key);
      continue;
    }
    if (step.type === "signature") {
      const signature = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      if (!hasValue(signature.fullName)) missing.push(`${step.key}.fullName`);
      if (!hasValue(signature.date)) missing.push(`${step.key}.date`);
      if (signature.confirmed !== true) missing.push(`${step.key}.confirmed`);
      continue;
    }
    if (!step.optional && !hasValue(value)) missing.push(step.key);
  }
  return { valid: missing.length === 0, missing };
}

export function questionnaireStepSummary(step: QuestionnaireStep, value: unknown, answers: CaribbeanQuestionnaireAnswers) {
  if (step.type === "yes_no") {
    const response = value === "yes" ? "Yes" : value === "no" ? "No" : "Not answered";
    const details = answers[`${step.key}.details`];
    return hasValue(details) ? `${response} — ${String(details)}` : response;
  }
  if (step.type === "acknowledgement") return value === true || value === "yes" ? "Acknowledged" : "Not acknowledged";
  if (step.type === "signature") {
    const signature = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return [signature.fullName, signature.date].filter(hasValue).join(" · ") || "Not signed";
  }
  if (step.type === "repeatable") {
    const rows = Array.isArray(value) ? value.filter(row => rowHasAnyValue(row, step.fields ?? [])) : [];
    return `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`;
  }
  return hasValue(value) ? String(value) : "Not answered";
}

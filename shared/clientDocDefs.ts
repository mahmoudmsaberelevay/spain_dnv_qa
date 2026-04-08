// Document checklist definitions for the Client Documentation module.
// Each entry defines a document's key, display name, category, expiration, and attestation requirements.

export type DocDef = {
  docKey: string;
  docName: string;
  category: "main" | "family";
  expirationMonths: number | null; // null = no expiry
  requiresMofa: boolean;
  requiresEmbassy: boolean;
};

// ─── Freelancer — Main Applicant ──────────────────────────────────────────────
export const FREELANCER_MAIN_DOCS: DocDef[] = [
  { docKey: "passport_main",              docName: "Main Applicant Passport",             category: "main", expirationMonths: null, requiresMofa: false, requiresEmbassy: false },
  { docKey: "education_certificate",      docName: "Education Certificate",               category: "main", expirationMonths: null, requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "experience_letter",          docName: "Experience Letter",                   category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "social_insurance",           docName: "Social Insurance",                    category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "client_company_doc",         docName: "Client Company Document",             category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "police_clearance",           docName: "Police Clearance",                    category: "main", expirationMonths: 3,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "bank_statement",             docName: "Bank Statement",                      category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "completion_agreement",       docName: "Completion of Agreement",             category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "completion_invoices",        docName: "Completion of Invoices",              category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "recommendation_letter",      docName: "Completion of Recommendation Letter", category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "declaration_none_practice",  docName: "Declaration None of Practice",        category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
];

// ─── Business Owner — Main Applicant ─────────────────────────────────────────
export const BUSINESS_OWNER_MAIN_DOCS: DocDef[] = [
  { docKey: "passport_main",              docName: "Main Applicant Passport",             category: "main", expirationMonths: null, requiresMofa: false, requiresEmbassy: false },
  { docKey: "education_certificate",      docName: "Education Certificate",               category: "main", expirationMonths: null, requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "social_insurance_him",       docName: "Social Insurance — For Him",          category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "social_insurance_emp",       docName: "Social Insurance — For Employees",    category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "owns_company_doc",           docName: "Owns Company Document",               category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "client_company_doc",         docName: "Client Company Document",             category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "police_clearance",           docName: "Police Clearance",                    category: "main", expirationMonths: 3,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "bank_statement",             docName: "Bank Statement",                      category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "completion_agreement",       docName: "Completion of Agreement",             category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "completion_invoices",        docName: "Completion of Invoices",              category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "recommendation_letter",      docName: "Completion of Recommendation Letter", category: "main", expirationMonths: 6,    requiresMofa: false, requiresEmbassy: false },
  { docKey: "annual_tax_report",          docName: "Annual Tax Report",                   category: "main", expirationMonths: 12,   requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "tax_card",                   docName: "Tax Card",                            category: "main", expirationMonths: 12,   requiresMofa: false, requiresEmbassy: false },
  { docKey: "vat_cert",                   docName: "VAT Certificate",                     category: "main", expirationMonths: 12,   requiresMofa: false, requiresEmbassy: false },
  { docKey: "tax_details",                docName: "Tax Details",                         category: "main", expirationMonths: 12,   requiresMofa: true,  requiresEmbassy: true  },
];

// ─── Family Documents (added when maritalStatus = 'family') ──────────────────
export const FAMILY_DOCS: DocDef[] = [
  { docKey: "family_passports",               docName: "Family Passports",                    category: "family", expirationMonths: null, requiresMofa: false, requiresEmbassy: false },
  { docKey: "dependent_enrollment_cert",      docName: "Dependent Enrollment Certificate",    category: "family", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "police_certificates_family",     docName: "Police Certificates (Family)",        category: "family", expirationMonths: 3,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "single_record",                  docName: "Single Record",                       category: "family", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "birth_certificates",             docName: "Birth Certificates",                  category: "family", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "marriage_certificates",          docName: "Marriage Certificates",               category: "family", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "dependent_social_insurance",     docName: "Dependent Social Insurance",          category: "family", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
];

export function getDocChecklist(
  applicationType: "freelancer" | "business_owner",
  maritalStatus: "single" | "family"
): DocDef[] {
  const mainDocs = applicationType === "freelancer" ? FREELANCER_MAIN_DOCS : BUSINESS_OWNER_MAIN_DOCS;
  const familyDocs = maritalStatus === "family" ? FAMILY_DOCS : [];
  return [...mainDocs, ...familyDocs];
}

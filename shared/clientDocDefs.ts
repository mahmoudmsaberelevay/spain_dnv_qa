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

export type ChildEntry = {
  ageRange: "0-17" | "18-26";
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
  { docKey: "admission_not_practice",      docName: "Admission of Not Practice the Job",     category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "power_of_attorney",           docName: "Power of Attorney for Document Attestation", category: "main", expirationMonths: null, requiresMofa: false, requiresEmbassy: false },
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
  { docKey: "company_memorandum",          docName: "Company Memorandum of Association",    category: "main", expirationMonths: null, requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "admission_not_practice",      docName: "Admission of Not Practice the Job",    category: "main", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "power_of_attorney",           docName: "Power of Attorney for Document Attestation", category: "main", expirationMonths: null, requiresMofa: false, requiresEmbassy: false },
];

// ─── Family Base Documents (always added when maritalStatus = 'family') ───────
export const FAMILY_BASE_DOCS: DocDef[] = [
  { docKey: "family_passports",               docName: "Family Passports",                    category: "family", expirationMonths: null, requiresMofa: false, requiresEmbassy: false },
  { docKey: "marriage_certificates",          docName: "Marriage Certificates",               category: "family", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
  { docKey: "dependent_social_insurance",     docName: "Dependent Social Insurance",          category: "family", expirationMonths: 6,    requiresMofa: true,  requiresEmbassy: true  },
];

// ─── Per-child documents ──────────────────────────────────────────────────────
// For a child aged 0–17: Birth Certificate is required
function childDocs_0_17(childIndex: number): DocDef[] {
  const n = childIndex + 1;
  return [
    {
      docKey: `child_${n}_birth_certificate`,
      docName: `Child ${n} — Birth Certificate`,
      category: "family",
      expirationMonths: 6,
      requiresMofa: true,
      requiresEmbassy: true,
    },
  ];
}

// For a child aged 18–26: Police Certificate + Education Enrollment + Single Record
function childDocs_18_26(childIndex: number): DocDef[] {
  const n = childIndex + 1;
  return [
    {
      docKey: `child_${n}_police_certificate`,
      docName: `Child ${n} — Police Certificate`,
      category: "family",
      expirationMonths: 3,
      requiresMofa: true,
      requiresEmbassy: true,
    },
    {
      docKey: `child_${n}_education_enrollment`,
      docName: `Child ${n} — Education Enrollment`,
      category: "family",
      expirationMonths: 6,
      requiresMofa: true,
      requiresEmbassy: true,
    },
    {
      docKey: `child_${n}_single_record`,
      docName: `Child ${n} — Single Record`,
      category: "family",
      expirationMonths: 6,
      requiresMofa: true,
      requiresEmbassy: true,
    },
  ];
}

// ─── Main checklist generator ─────────────────────────────────────────────────
export function getDocChecklist(
  applicationType: "freelancer" | "business_owner",
  maritalStatus: "single" | "family",
  children: ChildEntry[] = []
): DocDef[] {
  const mainDocs = applicationType === "freelancer" ? FREELANCER_MAIN_DOCS : BUSINESS_OWNER_MAIN_DOCS;

  if (maritalStatus === "single") {
    return [...mainDocs];
  }

  // Family: add base family docs + per-child docs
  const perChildDocs: DocDef[] = [];
  children.forEach((child, idx) => {
    if (child.ageRange === "0-17") {
      perChildDocs.push(...childDocs_0_17(idx));
    } else {
      perChildDocs.push(...childDocs_18_26(idx));
    }
  });

  return [...mainDocs, ...FAMILY_BASE_DOCS, ...perChildDocs];
}

// ─── Arabic document name map ─────────────────────────────────────────────────
// Used when generating the Arabic Word export
export const ARABIC_DOC_NAMES: Record<string, string> = {
  // Main applicant docs — Freelancer
  passport_main:             "جواز سفر مقدم الطلب الرئيسي",
  education_certificate:     "شهادة التعليم",
  experience_letter:         "شهادة التسجيل بالتأمين الاجتماعي — له",
  social_insurance:          "شهادة التسجيل بالتأمين الاجتماعي — له",
  client_company_doc:        "صورة سجل وثيقة شركة العميل",
  police_clearance:          "شهادة حسن السيرة والسلوك ( الفيش والتشبية)",
  bank_statement:            "كشف حساب بنكي",
  completion_agreement:      "عقد عمل الاستشارات",
  completion_invoices:       "فواتير الدفعات المستقبلة",
  recommendation_letter:     "خطاب التوصية",
  declaration_none_practice: "إقرار عدم الممارسة",
  // Main applicant docs — Business Owner
  social_insurance_him:      "شهادة التسجيل بالتأمين الاجتماعي — له",
  social_insurance_emp:      "شهادة التأمين الاجتماعي — للموظفين",
  owns_company_doc:          "صورة سجل الشركة المملوكة",
  annual_tax_report:         "التقرير الضريبي السنوي",
  tax_card:                  "صورة البطاقة الضريبية",
  vat_cert:                  "صورة شهادة ضريبة القيمة المضافة",
  tax_details:               "شهادة البيانات الضريبة",
  // New documents
  company_memorandum:         "عقد تأسيس الشركة (تحتاج الي ختم هيئة الاستثمار وختم وزارة الخارجية)",
  admission_not_practice:     "إقرار عدم مزاولة المهنة",
  power_of_attorney:          "توكيل رسمي لتوثيق المستندات",
  // Family base docs
  family_passports:              "جوازات سفر أفراد الأسرة",
  marriage_certificates:         "شهادات الزواج",
  dependent_social_insurance:    "التأمين الاجتماعي للمعالين",
};

export function getArabicDocName(docKey: string, docName: string): string {
  // Check static map first
  if (ARABIC_DOC_NAMES[docKey]) return ARABIC_DOC_NAMES[docKey];

  // Dynamic per-child keys
  const childBirthMatch = docKey.match(/^child_(\d+)_birth_certificate$/);
  if (childBirthMatch) return `الطفل ${childBirthMatch[1]} — شهادة الميلاد`;

  const childPoliceMatch = docKey.match(/^child_(\d+)_police_certificate$/);
  if (childPoliceMatch) return `الطفل ${childPoliceMatch[1]} — شهادة حسن السيرة والسلوك ( الفيش والتشبية)`;

  const childEduMatch = docKey.match(/^child_(\d+)_education_enrollment$/);
  if (childEduMatch) return `الطفل ${childEduMatch[1]} — قيد التعليم`;

  const childSingleMatch = docKey.match(/^child_(\d+)_single_record$/);
  if (childSingleMatch) return `الطفل ${childSingleMatch[1]} — وثيقة العزوبية`;

  // Fallback: return original English name
  return docName;
}

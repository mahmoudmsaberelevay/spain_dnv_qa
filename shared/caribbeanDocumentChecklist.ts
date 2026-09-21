import type { DocDef } from "./clientDocDefs";

export type CaribbeanDependent = {
  name?: string;
  age: number;
  relationship?: "child" | "dependent_parent" | "other";
};

const doc = (docKey: string, docName: string, category: "main" | "family", expirationMonths: number | null = null): DocDef => ({
  docKey,
  docName,
  category,
  expirationMonths,
  requiresMofa: false,
  requiresEmbassy: false,
});

const mainApplicantDocuments = (): DocDef[] => [
  doc("car_main_01_passport", "Main Applicant — Certified current passport, all pages", "main"),
  doc("car_main_02_old_passport", "Main Applicant — Old passport identity/current visa pages (if applicable)", "main"),
  doc("car_main_03_cv", "Main Applicant — Detailed curriculum vitae (CV)", "main"),
  doc("car_main_04_birth", "Main Applicant — Certified birth certificate", "main"),
  doc("car_main_05_national_id", "Main Applicant — Certified national ID", "main"),
  doc("car_main_06_driver", "Main Applicant — Certified driving licence (if held)", "main"),
  doc("car_main_07_marriage_divorce", "Main Applicant — Marriage and/or divorce certificate (if applicable)", "main"),
  doc("car_main_08_death_certificate", "Main Applicant — Deceased spouse death certificate (if widowed)", "main"),
  doc("car_main_09_education", "Main Applicant — Certified education certificate", "main"),
  doc("car_main_10_university", "Main Applicant — University enrolment letter (if currently studying)", "main"),
  doc("car_main_11_address", "Main Applicant — Certified proof of address issued within 3 months", "main", 3),
  doc("car_main_12_prof_reference", "Main Applicant — Original professional reference letter", "main"),
  doc("car_main_13_bank_reference", "Main Applicant — Original bank reference letter", "main"),
  doc("car_main_14_employment", "Main Applicant — Original employment letter (if employed)", "main"),
  doc("car_main_15_business", "Main Applicant — Certified business licence or company documents (if applicable)", "main"),
  doc("car_main_16_bank_statements", "Main Applicant — Bank statements for the program-required period", "main"),
  doc("car_main_17_photographs", "Main Applicant — Recent passport photographs meeting program specifications", "main", 6),
  doc("car_main_18_police", "Main Applicant — Original police-clearance certificates from all qualifying countries", "main", 3),
  doc("car_main_19_blood_urine", "Main Applicant — Original blood and urine test results not older than 3 months", "main", 3),
  doc("car_main_20_hiv", "Main Applicant — Original HIV test result not older than 3 months", "main", 3),
  doc("car_main_21_immunisation", "Main Applicant — Certified immunisation schedule", "main"),
  doc("car_main_22_adult_support", "Main Applicant — Sworn affidavit of support for each adult dependant over 18 (if applicable)", "main"),
  doc("car_main_23_sponsor_support", "Main Applicant — Affidavit of support and sponsor evidence (if externally sponsored)", "main"),
  doc("car_main_24_minister_letter", "Main Applicant — Original signed letter to the Minister", "main"),
  doc("car_main_25_military", "Main Applicant — Certified military certificate (if applicable)", "main"),
  doc("car_main_26_other_citizenship", "Main Applicant — Certified other citizenship/naturalisation certificates (if applicable)", "main"),
  doc("car_main_27_foreign_residence", "Main Applicant — Certified foreign permanent-residence card/certificate (if applicable)", "main"),
];

const spouseDocuments = (): DocDef[] => [
  doc("car_sp_01_passport", "Spouse — Certified current passport, all pages", "family"),
  doc("car_sp_02_birth", "Spouse — Certified birth certificate", "family"),
  doc("car_sp_03_national_id", "Spouse — Certified national ID", "family"),
  doc("car_sp_04_marriage", "Spouse — Certified marriage certificate", "family"),
  doc("car_sp_05_education", "Spouse — Certified education certificate", "family"),
  doc("car_sp_06_address", "Spouse — Certified proof of address issued within 3 months", "family", 3),
  doc("car_sp_07_cv", "Spouse — Detailed curriculum vitae (CV)", "family"),
  doc("car_sp_08_photographs", "Spouse — Recent passport photographs meeting program specifications", "family", 6),
  doc("car_sp_09_police", "Spouse — Original police-clearance certificates from all qualifying countries", "family", 3),
  doc("car_sp_10_blood_urine", "Spouse — Original blood and urine test results not older than 3 months", "family", 3),
  doc("car_sp_11_hiv", "Spouse — Original HIV test result not older than 3 months", "family", 3),
  doc("car_sp_12_immunisation", "Spouse — Certified immunisation schedule", "family"),
  doc("car_sp_13_other_citizenship", "Spouse — Other citizenship/naturalisation certificates (if applicable)", "family"),
  doc("car_sp_14_foreign_residence", "Spouse — Foreign permanent-residence card/certificate (if applicable)", "family"),
];

function dependentLabel(dependent: CaribbeanDependent, index: number) {
  const relationship = dependent.relationship === "dependent_parent" ? "Dependent Parent" : dependent.relationship === "other" ? "Dependant" : "Child";
  return `${relationship} ${index + 1}${dependent.name?.trim() ? ` (${dependent.name.trim()})` : ""} · Age ${dependent.age}`;
}

function dependentDocuments(dependent: CaribbeanDependent, index: number): DocDef[] {
  const prefix = `car_d${index + 1}`;
  const label = dependentLabel(dependent, index);
  const isParent = dependent.relationship === "dependent_parent";
  const documents = [
    doc(`${prefix}_01_passport`, `${label} — Certified current passport, all pages`, "family"),
    doc(`${prefix}_02_birth`, `${label} — Certified birth certificate`, "family"),
    doc(`${prefix}_03_national_id`, `${label} — Certified national ID, if issued`, "family"),
    doc(`${prefix}_04_photographs`, `${label} — Recent passport photographs meeting program specifications`, "family", 6),
  ];
  if (dependent.age >= 5 || isParent) {
    documents.push(
      doc(`${prefix}_05_blood_urine`, `${label} — Original blood and urine test results not older than 3 months`, "family", 3),
      doc(`${prefix}_06_hiv`, `${label} — Original HIV test result not older than 3 months`, "family", 3),
      doc(`${prefix}_07_immunisation`, `${label} — Certified immunisation schedule`, "family"),
    );
  }
  if (dependent.age >= 5 && dependent.age < 18 && !isParent) {
    documents.push(doc(`${prefix}_08_education`, `${label} — Education/school certificate`, "family"));
  }
  if (dependent.age >= 16 || isParent) {
    documents.push(doc(`${prefix}_09_police`, `${label} — Original police-clearance certificates from all qualifying countries`, "family", 3));
  }
  if (dependent.age >= 18 || isParent) {
    documents.push(
      doc(`${prefix}_10_cv`, `${label} — Detailed curriculum vitae (CV)`, "family"),
      doc(`${prefix}_11_address`, `${label} — Separate proof of address, if living elsewhere`, "family", 3),
      doc(`${prefix}_12_education`, `${label} — Certified education certificate`, "family"),
      doc(`${prefix}_13_university`, `${label} — University enrolment letter, if studying`, "family"),
      doc(`${prefix}_14_support`, `${label} — Sworn affidavit of support (adult dependant; exclude spouse)`, "family"),
    );
  }
  if (isParent) {
    documents.push(
      doc(`${prefix}_15_marital`, `${label} — Marriage, divorce, or deceased-spouse certificate as applicable`, "family"),
      doc(`${prefix}_16_citizenship`, `${label} — Citizenship/naturalisation certificates (if applicable)`, "family"),
      doc(`${prefix}_17_residence`, `${label} — Foreign permanent-residence card/certificate (if applicable)`, "family"),
    );
  }
  return documents;
}

export function getCaribbeanDocumentChecklist(input: {
  maritalStatus: "single" | "family";
  spouseName?: string | null;
  dependents: CaribbeanDependent[];
}) {
  const documents = mainApplicantDocuments();
  if (input.maritalStatus === "family" || input.spouseName?.trim()) documents.push(...spouseDocuments());
  input.dependents.forEach((dependent, index) => documents.push(...dependentDocuments(dependent, index)));
  return documents;
}

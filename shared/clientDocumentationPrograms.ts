export const CLIENT_DOCUMENTATION_PROGRAMS = [
  "spain",
  "grenada",
  "dominica",
  "st_kitts",
  "st_lucia",
  "antigua",
] as const;

export type ClientDocumentationProgram = typeof CLIENT_DOCUMENTATION_PROGRAMS[number];

export const CLIENT_DOCUMENTATION_PROGRAM_LABELS: Record<ClientDocumentationProgram, string> = {
  spain: "Spain",
  grenada: "Grenada",
  dominica: "Dominica",
  st_kitts: "St. Kitts",
  st_lucia: "St. Lucia",
  antigua: "Antigua",
};

export const CARIBBEAN_CLIENT_DOCUMENTATION_PROGRAMS = CLIENT_DOCUMENTATION_PROGRAMS.filter(
  (program): program is Exclude<ClientDocumentationProgram, "spain"> => program !== "spain",
);

export function isCaribbeanDocumentationProgram(
  program: string | null | undefined,
): program is Exclude<ClientDocumentationProgram, "spain"> {
  return CARIBBEAN_CLIENT_DOCUMENTATION_PROGRAMS.includes(
    program as Exclude<ClientDocumentationProgram, "spain">,
  );
}

export function clientDocumentationProgramLabel(program: string | null | undefined) {
  return CLIENT_DOCUMENTATION_PROGRAM_LABELS[program as ClientDocumentationProgram] ?? "Spain";
}

export const CARIBBEAN_JOURNEY_STAGES = [
  "questionnaire",
  "document_collection",
  "legalization",
  "in_process",
  "submitted",
  "approved",
  "naturalization_issuing",
  "naturalization_issued",
  "passports_issuing",
  "passports_issued",
] as const;

export type CaribbeanJourneyStage = typeof CARIBBEAN_JOURNEY_STAGES[number];

export const CARIBBEAN_JOURNEY_LABELS: Record<CaribbeanJourneyStage, string> = {
  questionnaire: "Filling the Questionnaire Form",
  document_collection: "Document Collection",
  legalization: "In the Legalization Process",
  in_process: "In Process",
  submitted: "Submitted",
  approved: "Approved",
  naturalization_issuing: "Issuing Naturalization Certificate",
  naturalization_issued: "Naturalization Certificate Issued",
  passports_issuing: "Issuing of Passports",
  passports_issued: "Passports Issued",
};

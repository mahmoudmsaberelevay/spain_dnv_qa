import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCaribbeanDocumentChecklist } from "../shared/caribbeanDocumentChecklist";
import {
  CARIBBEAN_QUESTIONNAIRE_STEPS,
  normalizeCaribbeanQuestionnaireAnswers,
  validateCaribbeanQuestionnaire,
  visibleCaribbeanQuestionnaireSteps,
  type CaribbeanQuestionnaireAnswers,
} from "../shared/caribbeanQuestionnaire";
import { CARIBBEAN_JOURNEY_STAGES, CLIENT_DOCUMENTATION_PROGRAMS } from "../shared/clientDocumentationPrograms";
import { projectCaribbeanTimeline } from "../shared/caribbeanTimeline";
import { resolveCaribbeanStageAfterDateUpdate } from "./caribbeanDocumentationWorkflow";

function completeAnswers(): CaribbeanQuestionnaireAnswers {
  const answers: CaribbeanQuestionnaireAnswers = {
    "application.spouseIncluded": "no",
    "application.dependentsIncluded": "no",
  };
  for (const step of visibleCaribbeanQuestionnaireSteps(answers)) {
    if (step.type === "repeatable") {
      answers[step.key] = step.optional ? [] : [Object.fromEntries((step.fields ?? []).map(field => [field.key, field.type === "date" ? "2026-01-01" : "Complete answer"]))];
    } else if (step.type === "yes_no") {
      answers[step.key] = step.confirmationRequired ? "yes" : "no";
    } else if (step.type === "acknowledgement") {
      answers[step.key] = true;
    } else if (step.type === "signature") {
      answers[step.key] = { fullName: "Applicant", date: "2026-09-21", confirmed: true };
    } else if (step.type === "select") {
      answers[step.key] = step.options?.[0] ?? "Complete answer";
    } else if (!step.optional) {
      answers[step.key] = step.type === "date" ? "2026-01-01" : "Complete answer";
    }
  }
  return answers;
}

describe("Caribbean Client Documentation programs and questionnaire", () => {
  it("offers Spain plus the five requested Caribbean programs", () => {
    expect([...CLIENT_DOCUMENTATION_PROGRAMS]).toEqual(["spain", "grenada", "dominica", "st_kitts", "st_lucia", "antigua"]);
  });

  it("models the full attached questionnaire as sequential steps with repeatable tables", () => {
    expect(CARIBBEAN_QUESTIONNAIRE_STEPS.length).toBeGreaterThan(150);
    expect(CARIBBEAN_QUESTIONNAIRE_STEPS.filter(step => step.type === "repeatable").length).toBeGreaterThan(10);
    expect(CARIBBEAN_QUESTIONNAIRE_STEPS.some(step => step.key === "signature")).toBe(true);
  });

  it("hides spouse questions when no spouse is included", () => {
    const visible = visibleCaribbeanQuestionnaireSteps({ "application.spouseIncluded": "no" });
    expect(visible.some(step => step.key.startsWith("spouse."))).toBe(false);
    expect(visible.some(step => step.key === "application.spouseIncluded")).toBe(true);
  });

  it("rejects incomplete submission and accepts a complete normalized questionnaire", () => {
    expect(validateCaribbeanQuestionnaire({}).valid).toBe(false);
    const normalized = normalizeCaribbeanQuestionnaireAnswers(completeAnswers());
    const validation = validateCaribbeanQuestionnaire(normalized);
    expect(validation.valid, validation.missing.join(", ")).toBe(true);
  });

  it("keeps repeatable table input bounded and strips unknown fields", () => {
    const normalized = normalizeCaribbeanQuestionnaireAnswers({
      "main.addressHistory": [{ from: "2020-01", to: "2021-01", address: "Address", malicious: "discard" }],
      unknown: "discard",
    });
    expect(normalized.unknown).toBeUndefined();
    expect((normalized["main.addressHistory"] as Array<Record<string, unknown>>)[0]).not.toHaveProperty("malicious");
  });
});

describe("conditional Caribbean document checklist", () => {
  const checklist = getCaribbeanDocumentChecklist({
    maritalStatus: "family",
    spouseName: "Spouse",
    dependents: [
      { name: "Toddler", age: 4, relationship: "child" },
      { name: "Student", age: 10, relationship: "child" },
      { name: "Teen", age: 16, relationship: "child" },
      { name: "Adult", age: 20, relationship: "child" },
      { name: "Parent", age: 67, relationship: "dependent_parent" },
    ],
  });

  it("includes the 27-item master applicant checklist and spouse documents", () => {
    expect(checklist.filter(document => document.docKey.startsWith("car_main_")).length).toBe(27);
    expect(checklist.some(document => document.docKey.startsWith("car_sp_"))).toBe(true);
  });

  it("uses exact dependant ages for medical, police, education, and adult support rules", () => {
    const keys = new Set(checklist.map(document => document.docKey));
    expect(keys.has("car_d1_05_blood_urine")).toBe(false);
    expect(keys.has("car_d2_08_education")).toBe(true);
    expect(keys.has("car_d2_09_police")).toBe(false);
    expect(keys.has("car_d3_09_police")).toBe(true);
    expect(keys.has("car_d4_14_support")).toBe(true);
    expect(keys.has("car_d5_15_marital")).toBe(true);
  });

  it("keeps every generated document key inside the database limit", () => {
    expect(Math.max(...checklist.map(document => document.docKey.length))).toBeLessThanOrEqual(64);
    expect(new Set(checklist.map(document => document.docKey)).size).toBe(checklist.length);
  });
});

describe("13-step Caribbean timeline", () => {
  it("defines every staff-controlled stage and all requested displayed steps", () => {
    expect(CARIBBEAN_JOURNEY_STAGES).toHaveLength(10);
    const timeline = projectCaribbeanTimeline({
      clientCase: {
        caribbeanJourneyStage: "approved",
        questionnaireSubmittedAt: "2026-09-01T10:00:00Z",
        caribbeanLegalizationStartedAt: "2026-09-04T10:00:00Z",
        expectedSubmissionDate: "2026-09-20T12:00:00Z",
        submissionDate: "2026-09-20T12:00:00Z",
        approvalDate: "2026-10-20T12:00:00Z",
        naturalizationIssuingDate: null,
        naturalizationIssuedDate: null,
        passportsIssuingDate: null,
        passportsIssuedDate: null,
      },
      receivedDocuments: 45,
      totalDocuments: 45,
      payments: [
        { paymentName: "Second payment", paymentMilestone: "submission", paidDate: null, amountEur: "5000" },
        { paymentName: "Third payment", paymentMilestone: "approval", paidDate: null, amountEur: "2000" },
      ],
    });
    expect(timeline.stages).toHaveLength(13);
    expect(timeline.stages.map(step => step.titleEn)).toContain("Passports Issued");
    expect(timeline.paymentDueDates.submission).toBe("2026-09-08");
    expect(timeline.paymentDueDates.approval).toBe("2026-10-21");
  });

  it("moves to In Process directly after a planned submission date is set", () => {
    expect(resolveCaribbeanStageAfterDateUpdate("legalization", "2026-09-20")).toBe("in_process");
    expect(resolveCaribbeanStageAfterDateUpdate("submitted", "2026-09-20")).toBe("submitted");
    expect(resolveCaribbeanStageAfterDateUpdate("legalization", null)).toBe("legalization");
  });
});

describe("integration wiring", () => {
  const portalRoutes = readFileSync(new URL("./clientPortalRoutes.ts", import.meta.url), "utf8");
  const crmPage = readFileSync(new URL("../client/src/components/CaribbeanClientDocumentationPanel.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../client/src/pages/ClientQuestionnaire.tsx", import.meta.url), "utf8");
  const lifecycle = readFileSync(new URL("./clientLifecycleNotificationService.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0085_caribbean_client_questionnaire.sql", import.meta.url), "utf8");

  it("uses protected Client Portal ownership for draft, submit, and journey endpoints", () => {
    expect(portalRoutes).toContain("ownedApplication(req.portal!.user.id, req.params.applicationId)");
    expect(portalRoutes).toContain("/questionnaire/draft");
    expect(portalRoutes).toContain("/questionnaire/submit");
    expect(portalRoutes).toContain("projectCaribbeanTimeline");
  });

  it("shows one question and one repeatable row at a time in the client interface", () => {
    expect(clientPage).toContain("One question at a time");
    expect(clientPage).toContain("Row {rowIndex + 1} of {activeRows.length}");
    expect(clientPage).toContain("Add another row");
  });

  it("gives staff questionnaire review and timeline controls", () => {
    expect(crmPage).toContain("Stage and Timeline Control");
    expect(crmPage).toContain("Client Questionnaire");
    expect(crmPage).toContain("updateCaribbeanTimeline");
  });

  it("prevents Spain-only reminders from running for Caribbean cases", () => {
    expect(lifecycle).toContain("const isCaribbean = isCaribbeanDocumentationProgram(c.program)");
    expect(lifecycle).toContain("if (!isCaribbean && signed");
    expect(lifecycle).toContain("if (!isCaribbean && biometrics");
  });

  it("uses an additive TiDB-safe migration", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `program`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `caribbeanQuestionnaires`");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeQuestionnaireAnswersForDefinition,
  resolveQuestionnaireDefinition,
  validateQuestionnaireForDefinition,
  type QuestionnaireStep,
} from "../shared/caribbeanQuestionnaire";
import { generateQuestionnairePdf } from "./questionnairePdfGenerator";

const futureDefinition: QuestionnaireStep[] = [
  {
    key: "future_reference",
    section: "Future Section",
    title: "Future questionnaire reference",
    prompt: "Future questionnaire reference",
    promptAr: "مرجع الاستبيان المستقبلي",
    type: "text",
  },
  {
    key: "future_family_rows",
    section: "Future Section",
    title: "Future family records",
    prompt: "Future family records",
    type: "repeatable",
    optional: true,
    fields: [
      { key: "name", label: "Name", labelAr: "الاسم", type: "text" },
      { key: "age", label: "Age", labelAr: "العمر", type: "number" },
    ],
  },
];

describe("questionnaire definition snapshots", () => {
  it("normalizes and validates answers against the questionnaire's stored definition", () => {
    const definition = resolveQuestionnaireDefinition(futureDefinition);
    const answers = normalizeQuestionnaireAnswersForDefinition({
      future_reference: "Q-2027-001",
      future_family_rows: [{ name: "Applicant", age: "42", ignored: "not persisted" }],
      unrelated: "not persisted",
    }, definition);
    expect(answers).toEqual({
      future_reference: "Q-2027-001",
      future_family_rows: [{ name: "Applicant", age: "42" }],
    });
    expect(validateQuestionnaireForDefinition(answers, definition)).toEqual({ valid: true, missing: [] });
  });

  it("uses the safe current definition when a legacy snapshot is absent or malformed", () => {
    expect(resolveQuestionnaireDefinition(null).length).toBeGreaterThan(200);
    expect(resolveQuestionnaireDefinition([{ bad: true }])).toHaveLength(resolveQuestionnaireDefinition(null).length);
  });
});

describe("questionnaire PDF generation", () => {
  it("produces a branded PDF for draft or submitted answers without storage side effects", async () => {
    const result = await generateQuestionnairePdf({
      client: { name: "Fictional Client", code: "QA-26001", programLabel: "Grenada" },
      questionnaire: {
        publicId: "00000000-0000-4000-8000-000000000001",
        version: "2027-01-test",
        status: "draft",
        answers: {
          future_reference: "Q-2027-001",
          future_family_rows: [{ name: "Applicant", age: "42" }, { name: "Dependent", age: "12" }],
        },
        startedAt: "2027-01-01T09:00:00Z",
        lastSavedAt: "2027-01-02T09:00:00Z",
        submittedAt: null,
        steps: futureDefinition,
      },
      generatedAt: new Date("2027-01-03T09:00:00Z"),
      generatedBy: "ELEVAY QA",
    });
    expect(result.buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(result.buffer.length).toBeGreaterThan(20_000);
    expect(result.fileName).toMatch(/^ELEVAY_Questionnaire_QA-26001_Grenada_2027-01-test\.pdf$/);
    expect(result.questionCount).toBe(2);
    expect(result.answeredCount).toBe(2);
  });
});

describe("Client Documentation questionnaire PDF integration", () => {
  const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("./caribbeanQuestionnaireService.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../client/src/components/CaribbeanClientDocumentationPanel.tsx", import.meta.url), "utf8");
  const generator = readFileSync(new URL("./questionnairePdfGenerator.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0088_questionnaire_definition_snapshot.sql", import.meta.url), "utf8");

  it("stores definitions on every new draft and submission and preserves existing versions", () => {
    expect(service.match(/questionnaireDefinition: definition/g)?.length).toBeGreaterThanOrEqual(2);
    expect(service).toContain("existing.questionnaireDefinition ?? definition");
    expect(service).toContain("existing?.questionnaireVersion ?? CARIBBEAN_QUESTIONNAIRE_VERSION");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `definitionJson` JSON NULL");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("exports through an authenticated, module-authorized, audited CRM procedure", () => {
    expect(router).toContain("exportQuestionnairePdf: protectedProcedure");
    expect(router).toContain("access.clientDocs === \"none\"");
    expect(router).toContain("generateQuestionnairePdf");
    expect(router).toContain('"client_questionnaire_pdf"');
    expect(router).toContain("dataBase64: result.buffer.toString(\"base64\")");
  });

  it("shows a responsive direct PDF export button for started questionnaires", () => {
    expect(panel).toContain("Export Questionnaire PDF");
    expect(panel).toContain("exportQuestionnairePdf.mutate");
    expect(panel).toContain("questionnaire.status === \"not_started\"");
    expect(panel).toContain("new Blob([bytes], { type: result.mimeType })");
    expect(panel).toContain("questionnaire?.steps ?? CARIBBEAN_QUESTIONNAIRE_STEPS");
  });

  it("renders all defined questions, repeatable rows, and any additional stored answer keys", () => {
    expect(generator).toContain("for (const step of steps)");
    expect(generator).toContain("answer.forEach((row, index)");
    expect(generator).toContain("Additional Stored Answers");
    expect(generator).toContain("!definitionKeys.has(key) && hasStoredValue(value)");
    expect(generator).toContain("input.questionnaire.version");
    expect(generator).toContain("input.questionnaire.status");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  affectedQuestionnaireLaunchRows,
  isValidQuestionnaireLaunchToken,
  PERMANENT_QUESTIONNAIRE_URL,
  questionnaireLaunchRecordIsEligible,
  questionnaireLaunchTokenHash,
} from "./clientQuestionnaireLaunch";
import { serializeClientQuestionnaireSteps } from "./caribbeanQuestionnaireService";
import {
  CARIBBEAN_QUESTIONNAIRE_STEPS,
  normalizeCaribbeanQuestionnaireAnswers,
  validateCaribbeanQuestionnaire,
} from "../shared/caribbeanQuestionnaire";
import { CARIBBEAN_QUESTIONNAIRE_ARABIC } from "../shared/caribbeanQuestionnaireArabic";

const routes = readFileSync(resolve(process.cwd(), "server/clientPortalRoutes.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "client/src/pages/ClientQuestionnaire.tsx"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "drizzle/0086_client_questionnaire_launch_tokens.sql"), "utf8");
const launchService = readFileSync(resolve(process.cwd(), "server/clientQuestionnaireLaunch.ts"), "utf8");
const serverEntry = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
const appleAssociation = readFileSync(resolve(process.cwd(), "client/public/.well-known/apple-app-site-association"), "utf8");

function validLaunchRecord() {
  const now = new Date("2026-09-21T10:00:00.000Z");
  return {
    now,
    expiresAt: new Date(now.getTime() + 60_000),
    usedAt: null,
    program: "grenada",
    portalUserStatus: "active",
    launchPortalUserId: 10,
    applicationPortalUserId: 10,
    launchClientCaseId: 20,
    applicationClientCaseId: 20,
    launchSourceSessionId: 30,
    sourceSessionId: 30,
    sourceSessionPortalUserId: 10,
    sourceSessionExpiresAt: new Date(now.getTime() + 60_000),
    sourceSessionRevokedAt: null,
    applicationAccessRevokedAt: null,
  };
}

describe("Client Questionnaire virtual document link", () => {
  it("adds the virtual item only inside the authorized Caribbean document response", () => {
    const documentRoute = routes.slice(
      routes.indexOf('app.get("/client-api/applications/:applicationId/documents"'),
      routes.indexOf('app.get("/client-api/documents/:documentId/access"'),
    );
    expect(documentRoute).toContain("ownedApplication(req.portal!.user.id, req.params.applicationId)");
    expect(documentRoute).toContain("isCaribbeanDocumentationProgram(owned.clientCase.program)");
    expect(documentRoute).toContain('docKey: "client_questionnaire"');
    expect(documentRoute).toContain('docName: "Client Questionnaire"');
    expect(documentRoute).toContain("documentLink: PERMANENT_QUESTIONNAIRE_URL");
    expect(PERMANENT_QUESTIONNAIRE_URL).toBe("https://elevay.vip/client-questionnaire");
    expect(documentRoute).toContain("items = persistedItems");
    expect(documentRoute).toContain('res.setHeader("Cache-Control", "no-store")');
  });

  it("registers the one-time token exchange before protected Client Portal routes", () => {
    const launchRoute = routes.indexOf('app.post("/client-api/questionnaire/launch"');
    const authBoundary = routes.indexOf('app.use("/client-api", portalAuth)');
    expect(launchRoute).toBeGreaterThan(0);
    expect(launchRoute).toBeLessThan(authBoundary);
    expect(routes.slice(launchRoute, authBoundary)).toContain("consumeQuestionnaireLaunch");
  });

  it("keeps the HTTPS questionnaire in the browser instead of the legacy unmatched native route", () => {
    for (const association of [serverEntry, appleAssociation]) {
      expect(association).toMatch(/"\/": "\/client-questionnaire",\s*"?exclude"?: true/);
      expect(association).toContain('"/": "/*"');
    }
    expect(launchService).toContain("https://www.elevay.vip/client-questionnaire#launch=");
    expect(launchService).not.toContain("manuselevaymobile://client-questionnaire");
    expect(launchService).toContain('PERMANENT_QUESTIONNAIRE_URL = "https://elevay.vip/client-questionnaire"');
  });
});

describe("one-time questionnaire launch security", () => {
  it("accepts only fixed-length opaque tokens and stores only their hash", () => {
    const token = "A".repeat(43);
    expect(isValidQuestionnaireLaunchToken(token)).toBe(true);
    expect(isValidQuestionnaireLaunchToken("short")).toBe(false);
    expect(questionnaireLaunchTokenHash(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(questionnaireLaunchTokenHash(token)).not.toContain(token);
    expect(migration).toContain("`tokenHash` varchar(64) NOT NULL");
    expect(migration).not.toContain("rawToken");
    expect(launchService).toContain("/client-questionnaire#launch=${encodeURIComponent(token)}");
    expect(launchService).toContain('redirectPath: "/client-questionnaire"');
    expect(launchService).not.toContain("?application=${");
  });

  it("accepts one active matching Caribbean record", () => {
    expect(questionnaireLaunchRecordIsEligible(validLaunchRecord())).toBe(true);
  });

  it.each([
    ["expired", { expiresAt: new Date("2026-09-21T09:59:59.000Z") }],
    ["reused", { usedAt: new Date("2026-09-21T09:59:00.000Z") }],
    ["Spain", { program: "spain" }],
    ["disabled user", { portalUserStatus: "disabled" }],
    ["mismatched user", { applicationPortalUserId: 11 }],
    ["mismatched case", { applicationClientCaseId: 21 }],
    ["mismatched session", { sourceSessionId: 31 }],
    ["revoked source session", { sourceSessionRevokedAt: new Date("2026-09-21T09:59:00.000Z") }],
    ["expired source session", { sourceSessionExpiresAt: new Date("2026-09-21T09:59:59.000Z") }],
    ["revoked application", { applicationAccessRevokedAt: new Date("2026-09-21T09:59:00.000Z") }],
  ])("rejects %s records", (_label, override) => {
    expect(questionnaireLaunchRecordIsEligible({ ...validLaunchRecord(), ...override })).toBe(false);
  });

  it("requires exactly one affected row for atomic one-time consumption", () => {
    expect(affectedQuestionnaireLaunchRows([{ affectedRows: 1 }])).toBe(1);
    expect(affectedQuestionnaireLaunchRows({ affectedRows: 0 })).toBe(0);
    expect(affectedQuestionnaireLaunchRows(undefined)).toBe(0);
  });
});

describe("responsive questionnaire contract", () => {
  it("publishes every question with bilingual labels, explicit required state, and typed row fields", () => {
    const serialized = serializeClientQuestionnaireSteps();
    expect(serialized).toHaveLength(CARIBBEAN_QUESTIONNAIRE_STEPS.length);
    expect(Object.keys(CARIBBEAN_QUESTIONNAIRE_ARABIC)).toHaveLength(287);
    for (const step of serialized) {
      expect(step.promptAr).toMatch(/[\u0600-\u06ff]/);
      expect(step.sectionAr).toMatch(/[\u0600-\u06ff]/);
      expect(step.required).toBe(step.optional !== true);
      for (const field of step.fields ?? []) {
        expect(field.required).toBe(true);
        expect(field.labelAr).toMatch(/[\u0600-\u06ff]/);
      }
    }
  });

  it("preserves every repeatable row during normalization", () => {
    const answers = normalizeCaribbeanQuestionnaireAnswers({
      "main.children": [
        { fullName: "First", dateOfBirth: "2010-01-01", relationship: "Child" },
        { fullName: "Second", dateOfBirth: "2012-01-01", relationship: "Child" },
      ],
    });
    expect(answers["main.children"]).toHaveLength(2);
  });

  it("blocks final submission while required answers are missing", () => {
    const validation = validateCaribbeanQuestionnaire({});
    expect(validation.valid).toBe(false);
    expect(validation.missing.length).toBeGreaterThan(0);
  });

  it("autosaves edits and navigation, resumes by currentStepKey, supports optional skip and row removal, and requires final review", () => {
    expect(page).toContain("window.setTimeout");
    expect(page).toContain("window.setInterval");
    expect(page).toContain("DRAFT_SAVE_MAX_ATTEMPTS = 3");
    expect(page).toContain("saveDraftWithRetry");
    expect(page).toContain("response.status !== 429 && response.status < 500");
    expect(page).toContain("LOCAL_DRAFT_KEY_PREFIX");
    expect(page).toContain("writeLocalDraft");
    expect(page).toContain("readLocalDraft");
    expect(page).toContain("Saved on this device; ELEVAY will retry automatically.");
    expect(page).toContain('window.addEventListener("online", retryPendingDraft)');
    expect(page).toContain("Answer kept safely on this device. ELEVAY will sync it automatically.");
    expect(page).toContain("All answers are retained on this device. Reconnect to ELEVAY before final submission.");
    expect(page).toContain("persistDraft(answers, currentStep.key, true)");
    expect(page).toContain("effectiveData.currentStepKey");
    expect(page).toContain("await persistDraft(answers, previousStep.key, true)");
    expect(page).toContain("await saveDraft(nextStep.key, true)");
    expect(page).toContain("Skip optional question");
    expect(page).toContain("const removeRow = () =>");
    expect(page).toContain("Review your questionnaire");
    expect(page).toContain("Submit questionnaire securely");
  });

  it("uses a scoped per-user allowance for frequent authenticated questionnaire autosaves", () => {
    const draftRoute = routes.slice(routes.indexOf('app.put("/client-api/applications/:applicationId/questionnaire/draft"'), routes.indexOf('app.post("/client-api/applications/:applicationId/questionnaire/submit"'));
    expect(routes).toContain("const questionnaireDraftLimiter = rateLimit");
    expect(routes).toContain("max: 90");
    expect(routes).toContain("portal-questionnaire:");
    expect(draftRoute).toContain("questionnaireDraftLimiter");
    expect(draftRoute).not.toContain("writeLimiter");
  });
});

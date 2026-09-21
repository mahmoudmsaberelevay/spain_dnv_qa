import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { projectClientProcessTimeline } from "./clientProcessTimeline";
import { normalizeMobileProcessTimeline, safeMobileTimelineDate } from "./mobileProcessTimeline";

const root = resolve(process.cwd());
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

function spainTimeline() {
  return projectClientProcessTimeline({
    clientCase: { stage: "preparation", applicationTimezone: "Africa/Cairo" },
    documents: [],
    payments: [],
    applicationCreatedAt: "2026-09-21T10:00:00.000Z",
    now: new Date("2026-09-21T12:00:00.000Z"),
  });
}

describe("mobile process timeline response contract", () => {
  it("preserves the existing Spain process timeline as a plain array", () => {
    const timeline = spainTimeline();
    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline[0]).toEqual({
      key: "contract_signed",
      position: 1,
      titleEn: "Contract Signed",
      titleAr: "تم توقيع العقد",
      status: "current",
      occurredAt: "2026-09-21T10:00:00.000Z",
    });
  });

  it("converts a rich Caribbean workflow object into the exact mobile-safe array shape", () => {
    const timeline = normalizeMobileProcessTimeline({
      stages: [
        {
          key: "questionnaire",
          order: 1,
          titleEn: "Sending the Questionnaire Form",
          titleAr: "إرسال نموذج الاستبيان",
          status: "completed",
          date: "2026-09-21T10:00:00.000Z",
          detailEn: "CRM-only detail",
          customField: { ignored: true },
        },
      ],
      progressPercent: 8,
      currentStage: { key: "document_collection" },
    });

    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline).toEqual([{
      key: "questionnaire",
      position: 1,
      titleEn: "Sending the Questionnaire Form",
      titleAr: "إرسال نموذج الاستبيان",
      status: "completed",
      occurredAt: "2026-09-21T10:00:00.000Z",
    }]);
    expect(timeline[0]).not.toHaveProperty("order");
    expect(timeline[0]).not.toHaveProperty("date");
    expect(timeline[0]).not.toHaveProperty("detailEn");
  });

  it("maps active to current, pending to upcoming, and unexpected statuses to upcoming", () => {
    const timeline = normalizeMobileProcessTimeline({ stages: [
      { key: "active", order: 1, titleEn: "Active", titleAr: "نشط", status: "active", date: null },
      { key: "pending", order: 2, titleEn: "Pending", titleAr: "قادم", status: "pending" },
      { key: "custom", order: 3, titleEn: "Custom", titleAr: "مخصص", status: "unexpected" },
    ] });

    expect(timeline.map(stage => stage.status)).toEqual(["current", "upcoming", "upcoming"]);
    expect(timeline.map(stage => stage.occurredAt)).toEqual([null, null, null]);
  });

  it("maps valid dates to occurredAt and converts missing or invalid dates to null", () => {
    expect(safeMobileTimelineDate("2026-09-21T10:00:00.000Z")).toBe("2026-09-21T10:00:00.000Z");
    expect(safeMobileTimelineDate("2026-09-21")).toBe("2026-09-21T12:00:00.000Z");
    expect(safeMobileTimelineDate(new Date("2026-09-21T10:00:00.000Z"))).toBe("2026-09-21T10:00:00.000Z");
    expect(safeMobileTimelineDate("not-a-date")).toBeNull();
    expect(safeMobileTimelineDate(new Date(Number.NaN))).toBeNull();
    expect(safeMobileTimelineDate(undefined)).toBeNull();
  });

  it("never throws for null, empty, malformed, or extended workflow values", () => {
    expect(normalizeMobileProcessTimeline(null)).toEqual([]);
    expect(normalizeMobileProcessTimeline({})).toEqual([]);
    expect(normalizeMobileProcessTimeline({ stages: null })).toEqual([]);
    expect(normalizeMobileProcessTimeline({ stages: [] })).toEqual([]);
    expect(normalizeMobileProcessTimeline({ stages: [null, undefined, "custom"] })).toEqual([
      { key: "stage_1", position: 1, titleEn: "stage_1", titleAr: "stage_1", status: "upcoming", occurredAt: null },
      { key: "stage_2", position: 2, titleEn: "stage_2", titleAr: "stage_2", status: "upcoming", occurredAt: null },
      { key: "stage_3", position: 3, titleEn: "stage_3", titleAr: "stage_3", status: "upcoming", occurredAt: null },
    ]);
  });

  it("uses the same normalizer for client and employee mobile endpoints but not the rich workflow endpoint", () => {
    const routes = read("server/clientPortalRoutes.ts");
    const employeeService = read("server/clientEmployeeDocuments.ts");
    const workflowBlock = routes.slice(
      routes.indexOf('app.get("/client-api/applications/:applicationId/workflow"'),
      routes.indexOf('app.get("/client-api/applications/:applicationId/process-timeline"'),
    );
    const clientTimelineBlock = routes.slice(
      routes.indexOf('app.get("/client-api/applications/:applicationId/process-timeline"'),
      routes.indexOf('app.get("/client-api/applications/:applicationId/activity"'),
    );
    const employeeTimelineBlock = employeeService.slice(
      employeeService.indexOf("export async function getEmployeeFolderTimeline"),
      employeeService.indexOf("export async function getEmployeeFolderActivity"),
    );

    expect(workflowBlock).toContain("workflowProjection(");
    expect(workflowBlock).not.toContain("normalizeMobileProcessTimeline");
    expect(clientTimelineBlock).toContain("normalizeMobileProcessTimeline(projectCaribbeanTimeline(");
    expect(clientTimelineBlock).toContain("return res.json(projectClientProcessTimeline(");
    expect(clientTimelineBlock.indexOf("if (!owned) return error(res, 404")).toBeLessThan(clientTimelineBlock.indexOf("const db = await getDb()"));
    expect(employeeTimelineBlock).toContain("isCaribbeanDocumentationProgram(clientCase.program)");
    expect(employeeTimelineBlock).toContain("normalizeMobileProcessTimeline(projectCaribbeanTimeline(");
    expect(employeeTimelineBlock).toContain("applications[0]?.createdAt ?? clientCase.createdAt");
  });
});

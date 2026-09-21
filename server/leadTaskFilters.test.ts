import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyLeadTaskLifecycle,
  getLeadTaskDayBounds,
} from "../shared/leadTaskLifecycle";

const pageSource = readFileSync(
  new URL("../client/src/pages/leads/TasksPage.tsx", import.meta.url),
  "utf8",
);
const routerSource = readFileSync(new URL("./routers/leads.ts", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./leadsDb.ts", import.meta.url), "utf8");

describe("Leads Tasks lifecycle semantics", () => {
  const now = new Date("2026-09-21T12:00:00+03:00");
  const { start, end } = getLeadTaskDayBounds(now);

  it("uses the Cairo calendar day with inclusive pending boundaries", () => {
    expect(classifyLeadTaskLifecycle({ completed: false, dueDate: start }, now)).toBe("pending");
    expect(classifyLeadTaskLifecycle({ completed: false, dueDate: end }, now)).toBe("pending");
  });

  it("keeps overdue and coming statuses non-overlapping", () => {
    expect(classifyLeadTaskLifecycle({ completed: false, dueDate: start - 1 }, now)).toBe("overdue");
    expect(classifyLeadTaskLifecycle({ completed: false, dueDate: end + 1 }, now)).toBe("coming");
  });

  it("gives completed status priority over the due date", () => {
    expect(classifyLeadTaskLifecycle({ completed: true, dueDate: start - 1000 }, now)).toBe("completed");
    expect(classifyLeadTaskLifecycle({ completed: true, dueDate: end + 1000 }, now)).toBe("completed");
  });

  it("resolves the business date in Africa/Cairo", () => {
    const cairoAfterMidnight = new Date("2026-09-20T22:30:00.000Z");
    expect(getLeadTaskDayBounds(cairoAfterMidnight).dateOnly).toBe("2026-09-21");
  });
});

describe("Leads Tasks server filters", () => {
  it("validates lifecycle, task type, selected leads, search, and pagination", () => {
    expect(routerSource).toContain("getTaskFilterOptions: protectedProcedure");
    expect(routerSource).toContain('lifecycle: z.enum(["all", "completed", "pending", "coming", "overdue"])');
    expect(routerSource).toContain("taskType: z.enum(TASK_TYPES)");
    expect(routerSource).toContain("leadIds: z.array(z.number().int().positive()).max(300)");
    expect(routerSource).toContain("pageSize: z.number().int().min(25).max(200)");
  });

  it("filters task rows and counts from the same base conditions", () => {
    expect(dbSource).toContain("buildLeadTaskLifecycleCondition");
    expect(dbSource).toContain("inArray(leadTasks.leadId, filters.leadIds)");
    expect(dbSource).toContain("eq(leadTasks.taskType, filters.taskType as any)");
    expect(dbSource).toContain("const lifecycleCountsQuery");
    expect(dbSource).toContain("lifecycleCounts");
  });

  it("excludes Meta Test Leads from the operational task selector and results", () => {
    expect(dbSource).toContain("const baseConditions: any[] = [operationalLeadCondition]");
    expect(dbSource.match(/\.where\(operationalLeadCondition\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Leads Tasks interface", () => {
  it("shows all requested lifecycle choices", () => {
    for (const label of ["All Tasks", "Completed", "Pending", "Coming", "Overdue"]) {
      expect(pageSource).toContain(`label: "${label}"`);
    }
    expect(pageSource).toContain('description: "Due today"');
    expect(pageSource).toContain('description: "Due after today"');
  });

  it("supports a specific task across all leads or selected leads", () => {
    expect(pageSource).toContain("All Task Types");
    expect(pageSource).toContain("All Leads");
    expect(pageSource).toContain("Selected Leads");
    expect(pageSource).toContain("Choose Leads");
    expect(pageSource).toContain("Search lead name or ID");
    expect(pageSource).toContain("Search task notes or lead");
  });

  it("protects large completed-task histories with pagination", () => {
    expect(pageSource).toContain("50 per page");
    expect(pageSource).toContain("100 per page");
    expect(pageSource).toContain("200 per page");
    expect(pageSource).toContain("Previous");
    expect(pageSource).toContain("Next");
  });
});

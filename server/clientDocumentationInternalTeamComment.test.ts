import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Client Documentation internal team comment", () => {
  const schema = read("drizzle/schema.ts");
  const router = read("server/routers.ts");
  const createPage = read("client/src/pages/ClientDocs.tsx");
  const detailPage = read("client/src/pages/ClientDocDetail.tsx");
  const portalRoutes = read("server/clientPortalRoutes.ts");
  const migration = read("drizzle/0113_client_documentation_internal_team_comment.sql");

  it("accepts a bounded optional comment in the protected staff case-creation flow", () => {
    expect(router).toContain('internalTeamComment: z.string().trim().max(4000).optional()');
    expect(router).toContain('internalTeamComment: input.internalTeamComment?.trim() || null');
    expect(createPage).toContain('id="internal-team-comment"');
    expect(createPage).toContain("Visible to the ELEVAY team only. This comment is not shown in the client portal.");
  });

  it("persists the comment with an additive nullable column and shows it only in the staff detail view", () => {
    expect(schema).toContain('internalTeamComment: text("internalTeamComment")');
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS `internalTeamComment` text NULL");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    expect(detailPage).toContain('aria-label="Internal ELEVAY team comment"');
    expect(detailPage).toContain("never shown in the client portal");
  });

  it("never includes the staff-only field in client portal application projections", () => {
    const applicationsResponse = portalRoutes.slice(
      portalRoutes.indexOf('app.get("/client-api/me/applications"'),
      portalRoutes.indexOf('app.get("/client-api/applications/:applicationId/questionnaire"'),
    );
    expect(applicationsResponse).not.toContain("internalTeamComment");
    expect(applicationsResponse).toContain("clientSummary");
    expect(applicationsResponse).toContain("documentationFolder");
  });
});

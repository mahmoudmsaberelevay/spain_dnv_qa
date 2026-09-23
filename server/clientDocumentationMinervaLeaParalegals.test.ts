import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0089_client_documentation_minerva_lea_paralegals.sql", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../client/src/pages/ClientDocDetail.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../client/src/pages/ClientDocsDashboard.tsx", import.meta.url), "utf8");
const emailService = readFileSync(new URL("./emailService.ts", import.meta.url), "utf8");
const portalRoutes = readFileSync(new URL("./clientPortalRoutes.ts", import.meta.url), "utf8");
const permissionsRouter = readFileSync(new URL("./permissionsRouter.ts", import.meta.url), "utf8");

const roster = '["Madonna", "Monica", "Marina", "Marwa", "Minerva", "Lea"]';

describe("Minerva and Lea Client Documentation paralegal access", () => {
  it("expands storage additively while preserving every existing paralegal value", () => {
    expect(schema).toContain(`mysqlEnum("paralegal", ${roster})`);
    expect(migration).toContain("ENUM('Madonna','Monica','Marina','Marwa','Minerva','Lea') NULL");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE|UPDATE)\b/im);
  });

  it("accepts both names when creating or reassigning a documentation case", () => {
    expect(router.match(new RegExp(`z\\.enum\\(${roster.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "g"))).toHaveLength(2);
  });

  it("shows both names in the assignment dialog and dashboard filter", () => {
    expect(detail).toContain(`${roster}.map`);
    expect(dashboard).toContain(`const PARALEGALS = ["All", "Madonna", "Monica", "Marina", "Marwa", "Minerva", "Lea"]`);
  });

  it("routes assigned-case and Client Portal staff notifications to both addresses", () => {
    expect(emailService).toContain('"Minerva Aguilar": "minerva.aguilar@elevay.com"');
    expect(emailService).toContain('"Lea Guerrero": "lea.guerrero@elevay.com"');
    expect(portalRoutes).toContain('Minerva: "minerva.aguilar@elevay.com"');
    expect(portalRoutes).toContain('Lea: "lea.guerrero@elevay.com"');
  });

  it("maps full Client Documentation module access to view, create, and edit authority", () => {
    expect(permissionsRouter).toContain('clientDocs: ["client_docs"]');
    expect(permissionsRouter).toContain('canAccess: level !== "none"');
    expect(permissionsRouter).toContain('canEdit: level === "full"');
    expect(permissionsRouter).toContain('canCreate: level === "full"');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0082_client_documentation_marwa_paralegal.sql", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../client/src/pages/ClientDocDetail.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../client/src/pages/ClientDocsDashboard.tsx", import.meta.url), "utf8");
const emailService = readFileSync(new URL("./emailService.ts", import.meta.url), "utf8");
const portalRoutes = readFileSync(new URL("./clientPortalRoutes.ts", import.meta.url), "utf8");
const permissionsRouter = readFileSync(new URL("./permissionsRouter.ts", import.meta.url), "utf8");

describe("Marwa Client Documentation paralegal access", () => {
  it("allows Marwa in the stored Client Documentation paralegal enum", () => {
    expect(schema).toContain('mysqlEnum("paralegal", ["Madonna", "Monica", "Marina", "Marwa"])');
    expect(migration).toContain("ENUM('Madonna','Monica','Marina','Marwa') NULL");
  });

  it("accepts Marwa when creating or reassigning a documentation case", () => {
    expect(router.match(/z\.enum\(\["Madonna", "Monica", "Marina", "Marwa"\]\)/g)).toHaveLength(2);
  });

  it("shows Marwa in the assignment dialog and dashboard filter", () => {
    expect(detail).toContain('["Madonna", "Monica", "Marina", "Marwa"].map');
    expect(dashboard).toContain('const PARALEGALS = ["All", "Madonna", "Monica", "Marina", "Marwa"]');
  });

  it("routes assignment and portal notifications to Marwa", () => {
    expect(emailService).toContain('"Marwa Abdallah": "marwa.abdallah@elevay.com"');
    expect(portalRoutes).toContain('Marwa: "marwa.abdallah@elevay.com"');
    expect(portalRoutes).toContain('"Marwa Abdallah": "marwa.abdallah@elevay.com"');
  });

  it("maps full Client Documentation module access to the protected client_docs page", () => {
    expect(permissionsRouter).toContain('clientDocs: ["client_docs"]');
    expect(permissionsRouter).toContain('canEdit: level === "full"');
    expect(permissionsRouter).toContain('canCreate: level === "full"');
  });
});

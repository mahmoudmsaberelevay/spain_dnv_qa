import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedEmployeeEmail, normalizeEmployeeEmail } from "./clientEmployeeAuth";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("CRM employee access in ELEVAY Client", () => {
  it("accepts only the established ELEVAY employee email scope", () => {
    expect(normalizeEmployeeEmail(" Mahmoud.Saber@ELEVAY.com ")).toBe("mahmoud.saber@elevay.com");
    expect(isAllowedEmployeeEmail("employee@elevay.com")).toBe(true);
    expect(isAllowedEmployeeEmail("mahmoud.saberelevay@gmail.com")).toBe(true);
    expect(isAllowedEmployeeEmail("walid.mammdouh@gmail.com")).toBe(true);
    expect(isAllowedEmployeeEmail("client@example.com")).toBe(false);
    expect(isAllowedEmployeeEmail("attacker@elevay.com.example.org")).toBe(false);
  });

  it("verifies the existing CRM password hash instead of copying or resetting employee passwords", () => {
    const routes = read("server/clientPortalRoutes.ts");
    const login = routes.slice(routes.indexOf('app.post("/client-api/auth/login"'), routes.indexOf('app.post("/client-api/auth/refresh"'));
    expect(login).toContain("verifyEmployeePassword(password, employee.password)");
    expect(login).toContain("hasFullClientDocsAccess(employee)");
    expect(login).toContain("isAllowedEmployeeEmail(employee.email)");
    expect(login).not.toContain("hashPassword(password)");
    expect(login).not.toContain("update(users)");
  });

  it("uses an isolated, revocable session table and never turns employees into client portal users", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read("drizzle/0076_client_employee_mobile_access.sql");
    const auth = read("server/clientEmployeeAuth.ts");
    expect(schema).toContain('mysqlTable("client_employee_sessions"');
    expect(migration).toContain("CREATE TABLE `client_employee_sessions`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    expect(auth).toContain('tokenType: "client_employee_access"');
    expect(auth).toContain('`${ENV.cookieSecret}:elevay-client-employee:v1`');
    expect(auth).toContain("revokedAt: now");
    expect(auth).not.toContain("clientPortalUsers");
  });

  it("requires full Client Documentation permission on login, refresh, and every employee API request", () => {
    const auth = read("server/clientEmployeeAuth.ts");
    const routes = read("server/clientPortalRoutes.ts");
    expect(auth.match(/hasFullClientDocsAccess/g)?.length).toBeGreaterThanOrEqual(3);
    expect(auth).toContain('(permission?.accessLevel ?? "full") === "full"');
    expect(routes).toContain('app.use("/client-api/employee", employeeAuth)');
    expect(routes).toContain('return error(res, 401, "employee_authentication_required")');
  });

  it("lists every folder with server-side search and pagination and uses signed opaque folder IDs", () => {
    const folders = read("server/clientEmployeeDocuments.ts");
    expect(folders).toContain("encodeEmployeeFolderId(clientCase.id)");
    expect(folders).toContain("createHmac(\"sha256\"");
    expect(folders).toContain(".limit(pageSize).offset((page - 1) * pageSize)");
    expect(folders).toContain("like(clientCases.clientName");
    expect(folders).toContain("like(clientCases.clientCode");
    expect(folders).toContain("hasMore: page * pageSize < total");
  });

  it("binds employee document downloads to the selected client case and keeps client ownership checks unchanged", () => {
    const folders = read("server/clientEmployeeDocuments.ts");
    const routes = read("server/clientPortalRoutes.ts");
    expect(folders).toContain("eq(clientPortalApplications.clientCaseId, clientCase.id)");
    expect(folders).toContain('writeAuditLog(auditCtxFromReq(input.req, input.context.user), "download"');
    expect(routes).toContain("eq(clientPortalApplications.portalUserId, portalUserId)");
    expect(routes).toContain("isNull(clientPortalApplications.accessRevokedAt)");
  });

  it("keeps employee mobile access read-only", () => {
    const routes = read("server/clientPortalRoutes.ts");
    const employeeBlock = routes.slice(routes.indexOf('app.use("/client-api/employee"'), routes.indexOf('app.use("/client-api", portalAuth)'));
    expect(employeeBlock).toContain('app.get("/client-api/employee/folders"');
    expect(employeeBlock).toContain('app.get("/client-api/employee/folders/:folderId/documents"');
    expect(employeeBlock).not.toContain('app.post("/client-api/employee/folders');
    expect(employeeBlock).not.toContain('app.put("/client-api/employee/folders');
    expect(employeeBlock).not.toContain('app.delete("/client-api/employee/folders');
  });
});

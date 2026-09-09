import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Client Portal manual password and documentation assignment integration", () => {
  it("requires a strong administrator-entered password and never returns it from account creation", () => {
    const router = read("server/clientPortalAdminRouter.ts");
    const createBlock = router.slice(router.indexOf("createAccount:"), router.indexOf("replaceDocumentationAssignments:"));
    expect(router).toContain('password: z.string().min(10).max(72).refine(isStrongClientPortalPassword');
    expect(createBlock).toContain("const password = input.password");
    expect(createBlock).toContain("hashPortalPassword(password)");
    expect(createBlock).toContain("mustChangePassword: false");
    expect(createBlock).not.toContain("generateTemporaryPassword");
    expect(createBlock).not.toContain("temporaryPassword");

    const rest = read("server/clientPortalRoutes.ts");
    const restCreateBlock = rest.slice(rest.indexOf('app.post("/client-api/admin/accounts"'), rest.indexOf('app.put("/client-api/admin/accounts/:publicId/applications"'));
    expect(restCreateBlock).toContain("password: string");
    expect(restCreateBlock).toContain("hashPortalPassword(body.password)");
    expect(restCreateBlock).toContain("mustChangePassword: false");
    expect(restCreateBlock).not.toContain("temporaryPassword");
  });

  it("keeps account creation atomic and leaves administrators actionable validation guidance", () => {
    const router = read("server/clientPortalAdminRouter.ts");
    const createBlock = router.slice(router.indexOf("createAccount:"), router.indexOf("replaceDocumentationAssignments:"));
    expect(createBlock).toContain("await db.transaction(async tx =>");
    expect(createBlock).toContain("No partial account was saved");
    expect(createBlock).toContain("Welcome lifecycle notification failed after account creation");

    const page = read("client/src/pages/ClientPortalAdmin.tsx");
    expect(page).toContain("validateClientPortalUsername");
    expect(page).toContain('role="alert"');
    expect(page).toContain("This username already has Client Portal access");
    expect(page).toContain("Select at least one Client Documentation folder; the first checked folder becomes primary");
    expect(page).toContain('<Button disabled={mutation.isPending} onClick={submit}>');
  });

  it("provides searchable confirmed assignment replacement and never shows a generated password after creation", () => {
    const page = read("client/src/pages/ClientPortalAdmin.tsx");
    expect(page).toContain("Edit Assigned Documentation");
    expect(page).toContain("Search by client name, code, or programme");
    expect(page).toContain("Save documentation access");
    expect(page).toContain("checkClientPortalPassword(password)");
    expect(page).toContain("Password confirmation does not match");
    expect(page).toContain('data-lpignore="true"');
    expect(page).not.toContain("setCredentials(data)");
    expect(page).not.toContain("CredentialsDialog");
    expect(page).not.toContain("temporaryPassword");
  });

  it("requires an administrator-entered custom password for existing accounts without disclosing it", () => {
    const router = read("server/clientPortalAdminRouter.ts");
    const setPasswordBlock = router.slice(router.indexOf("setCustomPassword:"), router.indexOf("forceLogout:"));
    expect(router).toContain("clientPortalSetPasswordInput");
    expect(setPasswordBlock).toContain("hashPortalPassword(input.password)");
    expect(setPasswordBlock).toContain("mustChangePassword: false");
    expect(setPasswordBlock).toContain("revokedAt: new Date()");
    expect(setPasswordBlock).toContain("return { ok: true }");
    expect(setPasswordBlock).not.toContain("generateTemporaryPassword");
    expect(setPasswordBlock).not.toContain("temporaryPassword");

    const rest = read("server/clientPortalRoutes.ts");
    const restPasswordBlock = rest.slice(rest.indexOf("const setAdminClientPassword"), rest.indexOf('app.get("/client-api/admin/providers"'));
    expect(restPasswordBlock).toContain("validNewPassword(body.password)");
    expect(restPasswordBlock).toContain("hashPortalPassword(body.password)");
    expect(restPasswordBlock).toContain("mustChangePassword: false");
    expect(restPasswordBlock).not.toContain("generateTemporaryPassword");
    expect(restPasswordBlock).not.toContain("temporaryPassword");

    const page = read("client/src/pages/ClientPortalAdmin.tsx");
    expect(page).toContain("Edit password");
    expect(page).toContain("Set custom password");
    expect(page).toContain("checkClientPortalPassword(password)");
    expect(page).toContain("Passwords do not match.");
  });

  it("preserves assignment history, revokes sessions, and blocks revoked folder access everywhere", () => {
    const service = read("server/clientPortalAssignmentService.ts");
    const routes = read("server/clientPortalRoutes.ts");
    const lifecycle = read("server/clientLifecycleNotificationService.ts");
    const review = read("server/clientPortalDocumentReviewRouter.ts");
    expect(service).toContain("accessRevokedAt");
    expect(service).toContain("revokedAt: now");
    expect(service).toContain("primaryClientCaseId: primary.id");
    expect(routes).toContain("isNull(clientPortalApplications.accessRevokedAt)");
    expect(lifecycle).toContain("isNull(clientPortalApplications.accessRevokedAt)");
    expect(review).toContain("isNull(clientPortalApplications.accessRevokedAt)");
  });

  it("keeps the assignment migration additive and reuses the existing unique user-case constraint", () => {
    const migration = read("drizzle/0069_client_portal_assignment_management.sql");
    expect(migration).toContain("accessRevokedAt");
    expect(migration).toContain("client_portal_applications_active_access_idx");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    expect(migration).not.toContain("uq_client_portal_user_case");
  });
});

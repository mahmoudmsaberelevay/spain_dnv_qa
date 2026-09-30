import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth routes database access", () => {
  const source = readFileSync(resolve(process.cwd(), "server/_core/auth-routes.ts"), "utf8");

  it("uses the existing getDb helper and Drizzle table contracts for reset routes", () => {
    expect(source).toContain('import { getDb } from "../db";');
    expect(source).not.toContain("db.db");
    expect(source).not.toContain("db.users");
    expect(source).toContain("database.select().from(users).where(eq(users.email, email)).limit(1)");
    expect(source).toContain("database.select().from(users).where(eq(users.passwordResetToken, token)).limit(1)");
  });

  it("preserves the existing authentication implementation boundaries", () => {
    expect(source).toContain('app.post("/api/auth/login"');
    expect(source).toContain("sdk.createSessionToken");
    expect(source).toContain("res.cookie(COOKIE_NAME, sessionToken");
    expect(source).toContain("hashPassword(newPassword)");
    expect(source).toContain("verifyPassword(password, user.password)");
  });
});

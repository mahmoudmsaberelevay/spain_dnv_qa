import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { hashPassword, verifyPassword, generateResetToken, getResetTokenExpiry, isResetTokenValid } from "./auth-email";
import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";

function getQueryParam(req: any, key: string): string | undefined {
  const value = req?.query?.[key];
  return typeof value === "string" ? value : undefined;
}

export function registerAuthRoutes(app: Express) {
  /**
   * POST /api/auth/login - Email/password login
   */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    // Never allow browsers, proxies, or shared caches to store authentication responses.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      // Find user by email
      const database = await getDb();
      if (!database) {
        res.status(500).json({ error: "Database connection failed" });
        return;
      }
      // Find user by email
      const userResults = await database
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const user = userResults.length > 0 ? userResults[0] : null;

      if (!user || !user.password) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Verify password
      console.log("[Auth] Verifying password for user:", user.email);
      const isPasswordValid = await verifyPassword(password, user.password);
      console.log("[Auth] Password valid:", isPasswordValid);
      if (!isPasswordValid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Create session token
      console.log("[Auth] Creating session token for user:", user.id);
      const sessionToken = await sdk.createSessionToken(String(user.id), {
        name: user.name || user.email || "",
        expiresInMs: SESSION_EXPIRY_MS,
      });
      console.log("[Auth] Session token created:", !!sessionToken);

      // Browser sessions end when the browser session ends, requiring a fresh
      // password on the next launch. The returned sessionToken remains valid
      // for eight hours so the React Native app can use its explicit Cookie header.
      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));

      // Update last signed in
      await database
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));

      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, sessionToken });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : "";
      console.error("[Auth] Login failed:", errMsg);
      console.error("[Auth] Stack:", stack);
      res.status(500).json({ error: "Login failed", details: errMsg });
    }
  });

  /**
   * POST /api/auth/logout - Logout
   */
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
  });

  /**
   * POST /api/auth/request-password-reset - Request password reset
   */
  app.post("/api/auth/request-password-reset", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const database = await getDb();
      if (!database) {
        res.status(500).json({ error: "Database connection failed" });
        return;
      }
      const [user] = await database.select().from(users).where(eq(users.email, email)).limit(1);

      if (!user) {
        // Don't reveal if email exists (security best practice)
        res.json({ success: true, message: "If email exists, reset link has been sent" });
        return;
      }

      // Generate reset token
      const resetToken = generateResetToken();
      const resetExpiry = getResetTokenExpiry();

      // Save reset token to database
      await database
        .update(users)
        .set({ passwordResetToken: resetToken, passwordResetExpiry: resetExpiry })
        .where(eq(users.id, user.id));

      // TODO: Send email with reset link
      // For now, just return the token (in production, send via email)
      res.json({
        success: true,
        message: "Password reset link sent to email",
        resetToken, // Remove in production - only for testing
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[Auth] Password reset request failed:", errMsg);
      res.status(500).json({ error: "Password reset request failed" });
    }
  });

  /**
   * POST /api/auth/reset-password - Reset password with token
   */
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        res.status(400).json({ error: "Token and new password are required" });
        return;
      }

      // Find user by reset token
      const database = await getDb();
      if (!database) {
        res.status(500).json({ error: "Database connection failed" });
        return;
      }
      const [user] = await database.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);

      if (!user || !isResetTokenValid(user.passwordResetExpiry)) {
        res.status(401).json({ error: "Invalid or expired reset token" });
        return;
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Update password and clear reset token
      await database
        .update(users)
        .set({
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiry: null,
        })
        .where(eq(users.id, user.id));

      res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[Auth] Password reset failed:", errMsg);
      res.status(500).json({ error: "Password reset failed" });
    }
  });
}

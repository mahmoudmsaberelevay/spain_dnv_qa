import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { hashPassword, verifyPassword, generateResetToken, getResetTokenExpiry, isResetTokenValid } from "./auth-email";
import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerAuthRoutes(app: Express) {
  /**
   * POST /api/auth/login - Email/password login
   */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      // Find user by email
      const user = await db.db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, email),
      });

      if (!user || !user.password) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Verify password
      const isPasswordValid = await verifyPassword(password, user.password);
      if (!isPasswordValid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Create session token
      const sessionToken = await sdk.createSessionToken(String(user.id), {
        name: user.name || user.email || "",
        expiresInMs: SESSION_EXPIRY_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

      // Update last signed in
      await db.db
        .update(db.users)
        .set({ lastSignedIn: new Date() })
        .where((users) => db.eq(users.id, user.id));

      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[Auth] Login failed:", errMsg);
      res.status(500).json({ error: "Login failed" });
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

      const user = await db.db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, email),
      });

      if (!user) {
        // Don't reveal if email exists (security best practice)
        res.json({ success: true, message: "If email exists, reset link has been sent" });
        return;
      }

      // Generate reset token
      const resetToken = generateResetToken();
      const resetExpiry = getResetTokenExpiry();

      // Save reset token to database
      await db.db
        .update(db.users)
        .set({ passwordResetToken: resetToken, passwordResetExpiry: resetExpiry })
        .where((users) => db.eq(users.id, user.id));

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
      const user = await db.db.query.users.findFirst({
        where: (users, { eq }) => eq(users.passwordResetToken, token),
      });

      if (!user || !isResetTokenValid(user.passwordResetExpiry)) {
        res.status(401).json({ error: "Invalid or expired reset token" });
        return;
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Update password and clear reset token
      await db.db
        .update(db.users)
        .set({
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiry: null,
        })
        .where((users) => db.eq(users.id, user.id));

      res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[Auth] Password reset failed:", errMsg);
      res.status(500).json({ error: "Password reset failed" });
    }
  });
}

import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Verify session token and return user
async function verifySessionToken(token: string): Promise<User | null> {
  try {
    // Decode the JWT token to get user ID
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('[Auth] Invalid token format');
      return null;
    }
    
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const userId = decoded.userId || decoded.openId;
    console.log('[Auth] Token decoded, userId:', userId, 'type:', typeof userId);
    
    if (!userId) {
      console.log('[Auth] No userId in token');
      return null;
    }
    
    const db = await getDb();
    if (!db) {
      console.log('[Auth] DB connection failed');
      return null;
    }
    
    let userResults;
    
    // Check if userId is numeric (from email/password auth) or string (from OAuth)
    if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
      // Numeric ID - query by users.id
      const numericId = typeof userId === 'number' ? userId : parseInt(userId, 10);
      console.log('[Auth] Querying by numeric ID:', numericId);
      userResults = await db
        .select()
        .from(users)
        .where(eq(users.id, numericId))
        .limit(1);
    } else {
      // String openId - query by users.openId
      console.log('[Auth] Querying by openId:', userId);
      userResults = await db
        .select()
        .from(users)
        .where(eq(users.openId, userId))
        .limit(1);
    }
    
    console.log('[Auth] User query result:', userResults.length > 0 ? 'found' : 'not found');
    return userResults.length > 0 ? userResults[0] : null;
  } catch (error) {
    console.log('[Auth] Error in verifySessionToken:', error);
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // First try session cookie (email/password auth)
    const sessionToken = opts.req.cookies?.[COOKIE_NAME];
    console.log('[Auth] Session cookie present:', !!sessionToken);
    
    if (sessionToken) {
      user = await verifySessionToken(sessionToken);
      console.log('[Auth] Session user loaded:', !!user);
    }
    
    // Fallback to OAuth if no session cookie
    if (!user) {
      console.log('[Auth] Trying OAuth fallback');
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    console.log('[Auth] Context creation error:', error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

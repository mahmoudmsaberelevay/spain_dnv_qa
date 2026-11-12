import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { plaudConnections, plaudOauthStates } from "../drizzle/schema";
import { PlaudError } from "./plaudConnectionCrypto";

export type PlaudConnectionRow = typeof plaudConnections.$inferSelect;
export type PlaudOauthStateRow = typeof plaudOauthStates.$inferSelect;
export interface PlaudConnectionStore {
  read(userId: number): Promise<PlaudConnectionRow | undefined>;
  beginAuthorization(
    userId: number,
    sealedEmpty: string,
    now: number
  ): Promise<number>;
  saveState(
    row: PlaudOauthStateRow,
    connectionVersion: number
  ): Promise<boolean>;
  consumeState(
    userId: number,
    sessionHash: string,
    stateHash: string,
    now: number
  ): Promise<PlaudOauthStateRow | undefined>;
  replace(
    userId: number,
    version: number,
    sealedCredentials: string,
    now: number
  ): Promise<boolean>;
  disconnect(userId: number, sealedEmpty: string, now: number): Promise<void>;
  acquireLease(
    userId: number,
    version: number,
    token: string,
    now: number,
    until: number
  ): Promise<boolean>;
  saveLease(
    userId: number,
    version: number,
    token: string,
    sealedCredentials: string,
    now: number
  ): Promise<boolean>;
  releaseLease(userId: number, version: number, token: string): Promise<void>;
}

/** No provider/network I/O is performed inside these transactions. Tombstones are intentional:
 * deleting a connection would let an old callback reuse a newly inserted version (ABA). */
export class PlaudConnectionDb implements PlaudConnectionStore {
  private async db() {
    // Lazy import avoids opening any DB or reading application configuration during module loading.
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new PlaudError("PLAUD_STORAGE_UNAVAILABLE");
    return db;
  }
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      throw new PlaudError("PLAUD_STORAGE_UNAVAILABLE");
    }
  }
  async read(userId: number): Promise<PlaudConnectionRow | undefined> {
    return this.guarded(async () => {
      const db = await this.db();
      return (
        await db
          .select()
          .from(plaudConnections)
          .where(eq(plaudConnections.userId, userId))
          .limit(1)
      )[0];
    });
  }
  async beginAuthorization(
    userId: number,
    sealedEmpty: string,
    now: number
  ): Promise<number> {
    return this.guarded(async () => {
      const db = await this.db();
      return db.transaction(async tx => {
        await tx
          .insert(plaudConnections)
          .values({
            userId,
            sealedCredentials: sealedEmpty,
            version: 1,
            createdAt: now,
            updatedAt: now,
          })
          .onDuplicateKeyUpdate({
            set: { userId: sql`${plaudConnections.userId}` },
          });
        const row = (
          await tx
            .select()
            .from(plaudConnections)
            .where(eq(plaudConnections.userId, userId))
            .for("update")
        )[0];
        if (!row || row.version >= 2_000_000_000) throw new Error();
        const version = row.version + 1;
        await tx
          .update(plaudConnections)
          .set({
            // The new generation must not allow another read to refresh the old token.
            sealedCredentials: sealedEmpty,
            version,
            leaseToken: null,
            leaseUntil: null,
            updatedAt: now,
          })
          .where(eq(plaudConnections.userId, userId));
        // Remove private pending verifiers from superseded flows, including consumed rows.
        await tx
          .delete(plaudOauthStates)
          .where(eq(plaudOauthStates.userId, userId));
        return version;
      });
    });
  }
  async saveState(
    row: PlaudOauthStateRow,
    connectionVersion: number
  ): Promise<boolean> {
    return this.guarded(async () => {
      const db = await this.db();
      return db.transaction(async tx => {
        const current = (
          await tx
            .select()
            .from(plaudConnections)
            .where(eq(plaudConnections.userId, row.userId))
            .for("update")
        )[0];
        if (!current || current.version !== connectionVersion) return false;
        await tx.insert(plaudOauthStates).values(row);
        return true;
      });
    });
  }
  async consumeState(
    userId: number,
    sessionHash: string,
    stateHash: string,
    now: number
  ): Promise<PlaudOauthStateRow | undefined> {
    return this.guarded(async () => {
      const db = await this.db();
      return db.transaction(async tx => {
        const match = and(
          eq(plaudOauthStates.stateHash, stateHash),
          eq(plaudOauthStates.userId, userId),
          eq(plaudOauthStates.sessionHash, sessionHash),
          isNull(plaudOauthStates.consumedAt),
          gt(plaudOauthStates.expiresAt, now)
        );
        const state = (
          await tx.select().from(plaudOauthStates).where(match).for("update")
        )[0];
        if (!state) return undefined;
        // Retain only the hashed replay marker, not PKCE/client details after use.
        await tx
          .update(plaudOauthStates)
          .set({ consumedAt: now, sealedState: "consumed" })
          .where(match);
        return state;
      });
    });
  }
  async replace(
    userId: number,
    version: number,
    sealedCredentials: string,
    now: number
  ): Promise<boolean> {
    return this.guarded(async () => {
      const db = await this.db();
      const [result] = await db
        .update(plaudConnections)
        .set({
          sealedCredentials,
          version: version + 1,
          updatedAt: now,
          leaseToken: null,
          leaseUntil: null,
        })
        .where(
          and(
            eq(plaudConnections.userId, userId),
            eq(plaudConnections.version, version)
          )
        );
      return result.affectedRows === 1;
    });
  }
  async disconnect(
    userId: number,
    sealedEmpty: string,
    now: number
  ): Promise<void> {
    return this.guarded(async () => {
      const db = await this.db();
      await db.transaction(async tx => {
        await tx
          .insert(plaudConnections)
          .values({
            userId,
            sealedCredentials: sealedEmpty,
            version: 1,
            createdAt: now,
            updatedAt: now,
          })
          .onDuplicateKeyUpdate({
            set: {
              sealedCredentials: sealedEmpty,
              version: sql`${plaudConnections.version} + 1`,
              leaseToken: null,
              leaseUntil: null,
              updatedAt: now,
            },
          });
        await tx
          .delete(plaudOauthStates)
          .where(eq(plaudOauthStates.userId, userId));
      });
    });
  }
  async acquireLease(
    userId: number,
    version: number,
    token: string,
    now: number,
    until: number
  ): Promise<boolean> {
    return this.guarded(async () => {
      const db = await this.db();
      const [result] = await db
        .update(plaudConnections)
        .set({ leaseToken: token, leaseUntil: until })
        .where(
          and(
            eq(plaudConnections.userId, userId),
            eq(plaudConnections.version, version),
            or(
              isNull(plaudConnections.leaseUntil),
              lte(plaudConnections.leaseUntil, now)
            )
          )
        );
      return result.affectedRows === 1;
    });
  }
  async saveLease(
    userId: number,
    version: number,
    token: string,
    sealedCredentials: string,
    now: number
  ): Promise<boolean> {
    return this.guarded(async () => {
      const db = await this.db();
      const [result] = await db
        .update(plaudConnections)
        .set({
          sealedCredentials,
          version: version + 1,
          updatedAt: now,
          leaseToken: null,
          leaseUntil: null,
        })
        .where(
          and(
            eq(plaudConnections.userId, userId),
            eq(plaudConnections.version, version),
            eq(plaudConnections.leaseToken, token),
            gt(plaudConnections.leaseUntil, now)
          )
        );
      return result.affectedRows === 1;
    });
  }
  async releaseLease(
    userId: number,
    version: number,
    token: string
  ): Promise<void> {
    return this.guarded(async () => {
      const db = await this.db();
      await db
        .update(plaudConnections)
        .set({ leaseToken: null, leaseUntil: null })
        .where(
          and(
            eq(plaudConnections.userId, userId),
            eq(plaudConnections.version, version),
            eq(plaudConnections.leaseToken, token)
          )
        );
    });
  }
}

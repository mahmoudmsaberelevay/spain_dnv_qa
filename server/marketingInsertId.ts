/** Drizzle/mysql2 returns [ResultSetHeader, fields] in this deployment.
 * Some supported adapters return ResultSetHeader directly; never coerce an
 * absent ID to NaN or attach a child row to an unverifiable parent.
 */
export function requireMarketingInsertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const raw = header && typeof header === "object" && "insertId" in header ? (header as { insertId: unknown }).insertId : undefined;
  const id = typeof raw === "bigint" || typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("The database did not return a valid new Marketing record ID; the operation cannot continue.");
  return id;
}

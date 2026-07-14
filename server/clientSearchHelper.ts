import { eq, like, or, sql, and } from "drizzle-orm";
import { getDb } from "./db";
import { finClients } from "../drizzle/schema";

/**
 * Search for clients by name or code - returns simple list for dropdown
 * Used by Reports module (Paralegal, Attestation, Visas tabs)
 */
export async function searchFinClientsForDropdown(query?: string) {
  const db = await getDb();
  if (!db) return [];

  if (!query || query.trim().length === 0) {
    // Return top 20 clients if no search query
    return await db
      .select({
        id: finClients.id,
        name: finClients.name,
        clientCode: finClients.clientCode,
        phone: finClients.phone,
        email: finClients.email,
      })
      .from(finClients)
      .limit(20)
      .orderBy(finClients.name);
  }

  const searchTerm = `%${query}%`;
  const codeSearchTerm = /^\d/.test(query) ? `${query}%` : `%${query}%`;

  return await db
    .select({
      id: finClients.id,
      name: finClients.name,
      clientCode: finClients.clientCode,
      phone: finClients.phone,
      email: finClients.email,
    })
    .from(finClients)
    .where(
      or(
        like(finClients.name, searchTerm),
        like(finClients.clientCode, codeSearchTerm),
        like(finClients.phone, searchTerm),
        like(finClients.email, searchTerm)
      )
    )
    .limit(50)
    .orderBy(finClients.name);
}

/**
 * Get a single client by ID for display
 */
export async function getFinClientForDisplay(clientId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      id: finClients.id,
      name: finClients.name,
      clientCode: finClients.clientCode,
      phone: finClients.phone,
      email: finClients.email,
      program: finClients.program,
      consultant: finClients.consultant,
    })
    .from(finClients)
    .where(eq(finClients.id, clientId));

  return result[0] || null;
}

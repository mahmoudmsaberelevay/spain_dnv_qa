import { eq, desc, and, gte, lte, or, like } from "drizzle-orm";
import { getDb } from "./db";
import { finClients } from "../drizzle/schema";

// ─── Attestation Client Records ──────────────────────────────────────────────
export async function listAttestationClientRecords(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  
  // Direct SQL query since we don't have the table in schema yet
  const query = `
    SELECT * FROM attestationClientRecords 
    WHERE 1=1 
    ${opts?.dateFrom ? `AND recordDate >= '${opts.dateFrom.toISOString().split('T')[0]}'` : ''}
    ${opts?.dateTo ? `AND recordDate <= '${opts.dateTo.toISOString().split('T')[0]}'` : ''}
    ORDER BY recordDate DESC
  `;
  
  try {
    const result = await db.execute(query as any);
    return (result as any)[0] as any[];
  } catch (error) {
    console.error("Error fetching attestation records:", error);
    return [];
  }
}

export async function getAttestationClientRecord(id: number) {
  const db = await getDb(); if (!db) return null;
  
  const query = `SELECT * FROM attestationClientRecords WHERE id = ${id}`;
  try {
    const result = await db.execute(query as any);
    const rows = (result as any)[0] as any[];
    return rows[0] || null;
  } catch (error) {
    console.error("Error fetching attestation record:", error);
    return null;
  }
}

export async function createAttestationClientRecord(data: {
  recordDate: Date;
  finClientId: number;
  clientName: string;
  clientCode?: string;
  type: "Submitted" | "Finished";
  provider: string;
}) {
  const db = await getDb(); if (!db) return null;
  
  const recordDate = data.recordDate.toISOString().split('T')[0];
  const clientCode = data.clientCode ? `'${data.clientCode}'` : 'NULL';
  
  const query = `
    INSERT INTO attestationClientRecords (recordDate, finClientId, clientName, clientCode, type, provider)
    VALUES ('${recordDate}', ${data.finClientId}, '${data.clientName.replace(/'/g, "''")}', ${clientCode}, '${data.type}', '${data.provider.replace(/'/g, "''")}')
  `;
  
  try {
    const result = await db.execute(query as any);
    return result;
  } catch (error) {
    console.error("Error creating attestation record:", error);
    return null;
  }
}

export async function updateAttestationClientRecord(id: number, data: Partial<{
  recordDate: Date;
  type: "Submitted" | "Finished";
  provider: string;
}>) {
  const db = await getDb(); if (!db) return null;
  
  const updates: string[] = [];
  if (data.recordDate) {
    const recordDate = data.recordDate.toISOString().split('T')[0];
    updates.push(`recordDate = '${recordDate}'`);
  }
  if (data.type) updates.push(`type = '${data.type}'`);
  if (data.provider) updates.push(`provider = '${data.provider.replace(/'/g, "''")}'`);
  
  if (updates.length === 0) return null;
  
  const query = `UPDATE attestationClientRecords SET ${updates.join(', ')} WHERE id = ${id}`;
  
  try {
    return await db.execute(query as any);
  } catch (error) {
    console.error("Error updating attestation record:", error);
    return null;
  }
}

export async function deleteAttestationClientRecord(id: number) {
  const db = await getDb(); if (!db) return null;
  
  const query = `DELETE FROM attestationClientRecords WHERE id = ${id}`;
  
  try {
    return await db.execute(query as any);
  } catch (error) {
    console.error("Error deleting attestation record:", error);
    return null;
  }
}

// ─── Fetch Clients from Financial Module ─────────────────────────────────────
export async function listFinancialClientsForAttestation(searchTerm?: string) {
  const db = await getDb(); if (!db) return [];
  
  const query = db.select({
    id: finClients.id,
    clientName: finClients.clientName,
    clientCode: finClients.clientCode,
  }).from(finClients);

  if (searchTerm) {
    query.where(
      or(
        like(finClients.clientName, `%${searchTerm}%`),
        like(finClients.clientCode, `%${searchTerm}%`)
      )
    );
  }

  return await query.limit(100);
}

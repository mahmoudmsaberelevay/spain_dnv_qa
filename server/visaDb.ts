import { eq, desc, and, gte, lte, or, like } from "drizzle-orm";
import { getDb } from "./db";
import { finClients } from "../drizzle/schema";

// ─── Visa Client Records ──────────────────────────────────────────────────────
export async function listVisaClientRecords(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  
  // Direct SQL query since we don't have the table in schema yet
  const query = `
    SELECT * FROM visaClientRecords 
    WHERE 1=1 
    ${opts?.dateFrom ? `AND recordDate >= '${opts.dateFrom.toISOString().split('T')[0]}'` : ''}
    ${opts?.dateTo ? `AND recordDate <= '${opts.dateTo.toISOString().split('T')[0]}'` : ''}
    ORDER BY recordDate DESC
  `;
  
  try {
    const result = await db.execute(query as any);
    return result as any[];
  } catch (error) {
    console.error("Error fetching visa records:", error);
    return [];
  }
}

export async function getVisaClientRecord(id: number) {
  const db = await getDb(); if (!db) return null;
  
  const query = `SELECT * FROM visaClientRecords WHERE id = ${id}`;
  try {
    const result = await db.execute(query as any);
    return (result as any[])[0] || null;
  } catch (error) {
    console.error("Error fetching visa record:", error);
    return null;
  }
}

export async function createVisaClientRecord(data: {
  recordDate: Date;
  finClientId: number;
  clientName: string;
  clientCode?: string;
  visaType: "Schengen" | "National";
  status: "Submitted" | "Finished";
  provider: string;
}) {
  const db = await getDb(); if (!db) return null;
  
  const recordDate = data.recordDate.toISOString().split('T')[0];
  const clientCode = data.clientCode ? `'${data.clientCode}'` : 'NULL';
  
  const query = `
    INSERT INTO visaClientRecords (recordDate, finClientId, clientName, clientCode, visaType, status, provider)
    VALUES ('${recordDate}', ${data.finClientId}, '${data.clientName.replace(/'/g, "''")}', ${clientCode}, '${data.visaType}', '${data.status}', '${data.provider.replace(/'/g, "''")}')
  `;
  
  try {
    const result = await db.execute(query as any);
    return result;
  } catch (error) {
    console.error("Error creating visa record:", error);
    return null;
  }
}

export async function updateVisaClientRecord(id: number, data: Partial<{
  recordDate: Date;
  visaType: "Schengen" | "National";
  status: "Submitted" | "Finished";
  provider: string;
}>) {
  const db = await getDb(); if (!db) return null;
  
  const updates: string[] = [];
  if (data.recordDate) {
    const recordDate = data.recordDate.toISOString().split('T')[0];
    updates.push(`recordDate = '${recordDate}'`);
  }
  if (data.visaType) updates.push(`visaType = '${data.visaType}'`);
  if (data.status) updates.push(`status = '${data.status}'`);
  if (data.provider) updates.push(`provider = '${data.provider.replace(/'/g, "''")}'`);
  
  if (updates.length === 0) return null;
  
  const query = `UPDATE visaClientRecords SET ${updates.join(', ')} WHERE id = ${id}`;
  
  try {
    return await db.execute(query as any);
  } catch (error) {
    console.error("Error updating visa record:", error);
    return null;
  }
}

export async function deleteVisaClientRecord(id: number) {
  const db = await getDb(); if (!db) return null;
  
  const query = `DELETE FROM visaClientRecords WHERE id = ${id}`;
  
  try {
    return await db.execute(query as any);
  } catch (error) {
    console.error("Error deleting visa record:", error);
    return null;
  }
}

// ─── Fetch Clients from Financial Module ─────────────────────────────────────
export async function listFinancialClientsForVisa(searchTerm?: string) {
  const db = await getDb(); if (!db) return [];
  
  const query = db.select({
    id: finClients.id,
    clientName: finClients.name,
    clientCode: finClients.clientCode,
  }).from(finClients);

  if (searchTerm) {
    query.where(
      or(
        like(finClients.name, `%${searchTerm}%`),
        like(finClients.clientCode, `%${searchTerm}%`)
      )
    );
  }

  return await query.limit(100);
}

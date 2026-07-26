import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";

/**
 * Export financial data (income, expenses, salaries, commissions, receipts) as JSON
 */
export async function exportFinancialBackup(): Promise<{ success: boolean; message: string; fileUrl?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // Fetch all financial data
    const [income] = await db.query("SELECT * FROM income ORDER BY createdAt DESC");
    const [expenses] = await db.query("SELECT * FROM expenses ORDER BY createdAt DESC");
    const [salaries] = await db.query("SELECT * FROM salaries ORDER BY createdAt DESC");
    const [commissions] = await db.query("SELECT * FROM commissions ORDER BY createdAt DESC");
    const [receipts] = await db.query("SELECT * FROM receipts ORDER BY createdAt DESC");

    const backup = {
      exportedAt: new Date().toISOString(),
      dataType: "ELEVAY Financial Backup",
      summary: {
        incomeRecords: (income as any[]).length,
        expenseRecords: (expenses as any[]).length,
        salaryRecords: (salaries as any[]).length,
        commissionRecords: (commissions as any[]).length,
        receiptRecords: (receipts as any[]).length,
      },
      data: { income, expenses, salaries, commissions, receipts },
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `elevay-financial-backup-${timestamp}.json`;

    // Upload to S3
    const { url } = await storagePut(`backups/financial/${fileName}`, jsonStr, "application/json");

    // Notify owner
    await notifyOwner({
      title: "📊 Weekly Financial Backup Complete",
      content: `Financial data backup completed successfully.\n\nRecords: ${(income as any[]).length} income, ${(expenses as any[]).length} expenses, ${(salaries as any[]).length} salaries, ${(commissions as any[]).length} commissions, ${(receipts as any[]).length} receipts.\n\nFile: ${fileName}\nDownload: ${url}`,
    });

    return { success: true, message: "Financial backup exported successfully", fileUrl: url };
  } catch (err) {
    const msg = String(err);
    console.error("[FinancialBackup] Error:", msg);
    await notifyOwner({
      title: "❌ Financial Backup Failed",
      content: `Error: ${msg}`,
    });
    return { success: false, message: msg };
  }
}

/**
 * Export contracts data (contracts, receipts, templates) as JSON
 */
export async function exportContractsBackup(): Promise<{ success: boolean; message: string; fileUrl?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [contracts] = await db.query("SELECT * FROM contracts ORDER BY createdAt DESC");
    const [contractReceipts] = await db.query("SELECT * FROM contractReceipts ORDER BY createdAt DESC");
    const [contractTemplates] = await db.query("SELECT * FROM contractTemplates ORDER BY createdAt DESC");

    const backup = {
      exportedAt: new Date().toISOString(),
      dataType: "ELEVAY Contracts Backup",
      summary: {
        contractRecords: (contracts as any[]).length,
        receiptRecords: (contractReceipts as any[]).length,
        templateRecords: (contractTemplates as any[]).length,
      },
      data: { contracts, contractReceipts, contractTemplates },
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `elevay-contracts-backup-${timestamp}.json`;

    const { url } = await storagePut(`backups/contracts/${fileName}`, jsonStr, "application/json");

    await notifyOwner({
      title: "📋 Weekly Contracts Backup Complete",
      content: `Contracts data backup completed successfully.\n\nRecords: ${(contracts as any[]).length} contracts, ${(contractReceipts as any[]).length} receipts, ${(contractTemplates as any[]).length} templates.\n\nFile: ${fileName}\nDownload: ${url}`,
    });

    return { success: true, message: "Contracts backup exported successfully", fileUrl: url };
  } catch (err) {
    const msg = String(err);
    console.error("[ContractsBackup] Error:", msg);
    await notifyOwner({
      title: "❌ Contracts Backup Failed",
      content: `Error: ${msg}`,
    });
    return { success: false, message: msg };
  }
}

/**
 * Export leads data (leads, activities, stage changes) as JSON
 */
export async function exportLeadsBackup(): Promise<{ success: boolean; message: string; fileUrl?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [leads] = await db.query("SELECT * FROM leads ORDER BY createdAt DESC");
    const [activities] = await db.query("SELECT * FROM leadActivities ORDER BY createdAt DESC");
    const [stageChanges] = await db.query("SELECT * FROM leadActivities WHERE activityType = 'stage_changed' ORDER BY createdAt DESC");

    const backup = {
      exportedAt: new Date().toISOString(),
      dataType: "ELEVAY Leads Backup",
      summary: {
        leadRecords: (leads as any[]).length,
        activityRecords: (activities as any[]).length,
        stageChangeRecords: (stageChanges as any[]).length,
      },
      data: { leads, activities, stageChanges },
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `elevay-leads-backup-${timestamp}.json`;

    const { url } = await storagePut(`backups/leads/${fileName}`, jsonStr, "application/json");

    await notifyOwner({
      title: "👥 Weekly Leads Backup Complete",
      content: `Leads data backup completed successfully.\n\nRecords: ${(leads as any[]).length} leads, ${(activities as any[]).length} activities, ${(stageChanges as any[]).length} stage changes.\n\nFile: ${fileName}\nDownload: ${url}`,
    });

    return { success: true, message: "Leads backup exported successfully", fileUrl: url };
  } catch (err) {
    const msg = String(err);
    console.error("[LeadsBackup] Error:", msg);
    await notifyOwner({
      title: "❌ Leads Backup Failed",
      content: `Error: ${msg}`,
    });
    return { success: false, message: msg };
  }
}

/**
 * Export full database backup (all tables) as JSON
 */
export async function exportDatabaseBackup(): Promise<{ success: boolean; message: string; fileUrl?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // Get all table names
    const [tables] = await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()");
    const tableNames = (tables as any[]).map(t => t.TABLE_NAME);

    const backup: Record<string, any> = {
      exportedAt: new Date().toISOString(),
      dataType: "ELEVAY Full Database Backup",
      databaseName: process.env.DATABASE_URL?.split("/").pop() || "elevay",
      tableCount: tableNames.length,
      tables: {},
    };

    // Fetch all data from each table
    for (const tableName of tableNames) {
      try {
        const [rows] = await db.query(`SELECT * FROM \`${tableName}\` ORDER BY createdAt DESC LIMIT 10000`);
        backup.tables[tableName] = {
          recordCount: (rows as any[]).length,
          data: rows,
        };
      } catch (err) {
        console.warn(`[DatabaseBackup] Could not export table ${tableName}:`, String(err));
        backup.tables[tableName] = { recordCount: 0, error: String(err) };
      }
    }

    const jsonStr = JSON.stringify(backup, null, 2);
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `elevay-database-backup-${timestamp}.json`;

    const { url } = await storagePut(`backups/database/${fileName}`, jsonStr, "application/json");

    await notifyOwner({
      title: "💾 Weekly Database Backup Complete",
      content: `Full database backup completed successfully.\n\nTables: ${tableNames.length}\nFile: ${fileName}\nDownload: ${url}`,
    });

    return { success: true, message: "Database backup exported successfully", fileUrl: url };
  } catch (err) {
    const msg = String(err);
    console.error("[DatabaseBackup] Error:", msg);
    await notifyOwner({
      title: "❌ Database Backup Failed",
      content: `Error: ${msg}`,
    });
    return { success: false, message: msg };
  }
}

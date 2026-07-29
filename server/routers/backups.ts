import { router, protectedProcedure } from "../_core/trpc";
import { exportFinancialBackup, exportContractsBackup, exportLeadsBackup, exportDatabaseBackup } from "../backupHandlers";
import { sendEmail } from "../backupEmailService";

export const backupsRouter = router({
  /**
   * Trigger financial backup and send download link to owner's email
   */
  triggerFinancialBackup: protectedProcedure.mutation(async ({ ctx }) => {
    if (String(ctx.user.id) !== process.env.OWNER_OPEN_ID && ctx.user.role !== "admin") {
      throw new Error("Only owner can trigger backups");
    }
    const result = await exportFinancialBackup();
    if (result.success && result.fileUrl) {
      await sendEmail({
        to: "mahmoud.saberelevay@gmail.com",
        subject: "📊 ELEVAY Financial Backup - " + new Date().toLocaleDateString(),
        html: `
          <h2>Financial Data Backup</h2>
          <p>Your weekly financial backup has been completed successfully.</p>
          <p><strong>Records:</strong> Income, Expenses, Salaries, Commissions, Receipts</p>
          <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
          <p><a href="${result.fileUrl}" style="background: #1A3A5C; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Backup</a></p>
          <p><small>This file will be available for 7 days.</small></p>
        `,
      });
    }
    return result;
  }),

  /**
   * Trigger contracts backup and send download link to owner's email
   */
  triggerContractsBackup: protectedProcedure.mutation(async ({ ctx }) => {
    if (String(ctx.user.id) !== process.env.OWNER_OPEN_ID && ctx.user.role !== "admin") {
      throw new Error("Only owner can trigger backups");
    }
    const result = await exportContractsBackup();
    if (result.success && result.fileUrl) {
      await sendEmail({
        to: "mahmoud.saberelevay@gmail.com",
        subject: "📋 ELEVAY Contracts Backup - " + new Date().toLocaleDateString(),
        html: `
          <h2>Contracts Data Backup</h2>
          <p>Your weekly contracts backup has been completed successfully.</p>
          <p><strong>Records:</strong> Contracts, Receipts, Templates</p>
          <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
          <p><a href="${result.fileUrl}" style="background: #1A3A5C; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Backup</a></p>
          <p><small>This file will be available for 7 days.</small></p>
        `,
      });
    }
    return result;
  }),

  /**
   * Trigger leads backup and send download link to owner's email
   */
  triggerLeadsBackup: protectedProcedure.mutation(async ({ ctx }) => {
    if (String(ctx.user.id) !== process.env.OWNER_OPEN_ID && ctx.user.role !== "admin") {
      throw new Error("Only owner can trigger backups");
    }
    const result = await exportLeadsBackup();
    if (result.success && result.fileUrl) {
      await sendEmail({
        to: "mahmoud.saberelevay@gmail.com",
        subject: "👥 ELEVAY Leads Backup - " + new Date().toLocaleDateString(),
        html: `
          <h2>Leads Data Backup</h2>
          <p>Your weekly leads backup has been completed successfully.</p>
          <p><strong>Records:</strong> Leads, Activities, Stage Changes</p>
          <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
          <p><a href="${result.fileUrl}" style="background: #1A3A5C; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Backup</a></p>
          <p><small>This file will be available for 7 days.</small></p>
        `,
      });
    }
    return result;
  }),

  /**
   * Trigger full database backup and send download link to owner's email
   */
  triggerDatabaseBackup: protectedProcedure.mutation(async ({ ctx }) => {
    if (String(ctx.user.id) !== process.env.OWNER_OPEN_ID && ctx.user.role !== "admin") {
      throw new Error("Only owner can trigger backups");
    }
    const result = await exportDatabaseBackup();
    if (result.success && result.fileUrl) {
      await sendEmail({
        to: "mahmoud.saberelevay@gmail.com",
        subject: "💾 ELEVAY Database Backup - " + new Date().toLocaleDateString(),
        html: `
          <h2>Full Database Backup</h2>
          <p>Your weekly full database backup has been completed successfully.</p>
          <p><strong>Includes:</strong> All system tables and data</p>
          <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
          <p><a href="${result.fileUrl}" style="background: #1A3A5C; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Backup</a></p>
          <p><small>This file will be available for 7 days.</small></p>
        `,
      });
    }
    return result;
  }),

  /**
   * Trigger all backups at once
   */
  triggerAllBackups: protectedProcedure.mutation(async ({ ctx }) => {
    if (String(ctx.user.id) !== process.env.OWNER_OPEN_ID && ctx.user.role !== "admin") {
      throw new Error("Only owner can trigger backups");
    }
    const results = {
      financial: await exportFinancialBackup(),
      contracts: await exportContractsBackup(),
      leads: await exportLeadsBackup(),
      database: await exportDatabaseBackup(),
    };

    // Send combined email
    const backupLinks = Object.entries(results)
      .filter(([_, r]) => r.success && r.fileUrl)
      .map(([type, r]) => `<li><strong>${type.toUpperCase()}:</strong> <a href="${r.fileUrl}">Download</a></li>`)
      .join("");

    await sendEmail({
      to: "mahmoud.saberelevay@gmail.com",
      subject: "📦 ELEVAY Complete System Backup - " + new Date().toLocaleDateString(),
      html: `
        <h2>Complete System Backup</h2>
        <p>All weekly backups have been completed successfully.</p>
        <h3>Available Downloads:</h3>
        <ul>${backupLinks}</ul>
        <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
        <p><small>All files will be available for 7 days.</small></p>
      `,
    });

    return results;
  }),
});

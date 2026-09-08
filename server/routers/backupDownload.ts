import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import fs from "fs";
import path from "path";

const BACKUP_DIR = "/home/ubuntu/backups";

const backupAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access required" });
  return next({ ctx });
});

export const backupDownloadRouter = router({
  /**
   * List all available backups
   */
  listBackups: backupAdminProcedure.query(async () => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        return { success: false, backups: [], error: "Backup directory not found" };
      }

      const files = fs.readdirSync(BACKUP_DIR);
      const backups = files
        .filter((file) => file.endsWith(".sql.gz.enc"))
        .map((file) => {
          const filePath = path.join(BACKUP_DIR, file);
          const stats = fs.statSync(filePath);
          const manifestPath = `${filePath}.manifest`;
          let manifest = null;

          if (fs.existsSync(manifestPath)) {
            manifest = fs.readFileSync(manifestPath, "utf-8");
          }

          return {
            filename: file,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            createdAt: stats.mtime,
            createdAtFormatted: stats.mtime.toLocaleString(),
            hasManifest: fs.existsSync(manifestPath),
            downloadUrl: `/api/backup/download/${encodeURIComponent(file)}`,
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        success: true,
        backups,
        totalCount: backups.length,
        totalSize: backups.reduce((sum, b) => sum + b.size, 0),
        totalSizeFormatted: formatBytes(backups.reduce((sum, b) => sum + b.size, 0)),
      };
    } catch (error) {
      return {
        success: false,
        backups: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }),

  /**
   * Get backup manifest/info
   */
  getBackupInfo: backupAdminProcedure
    .input((data: unknown) => {
      if (typeof data !== "object" || data === null || !("filename" in data)) {
        throw new Error("Invalid input");
      }
      return { filename: (data as any).filename };
    })
    .query(async ({ input }) => {
      try {
        const filePath = path.join(BACKUP_DIR, input.filename);

        // Validate path to prevent directory traversal
        if (!filePath.startsWith(BACKUP_DIR)) {
          return { success: false, error: "Invalid file path" };
        }

        if (!fs.existsSync(filePath)) {
          return { success: false, error: "Backup file not found" };
        }

        const stats = fs.statSync(filePath);
        const manifestPath = `${filePath}.manifest`;
        let manifest = null;

        if (fs.existsSync(manifestPath)) {
          manifest = fs.readFileSync(manifestPath, "utf-8");
        }

        return {
          success: true,
          filename: input.filename,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.mtime,
          createdAtFormatted: stats.mtime.toLocaleString(),
          manifest,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get backup statistics
   */
  getBackupStats: backupAdminProcedure.query(async () => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        return {
          success: false,
          stats: null,
          error: "Backup directory not found",
        };
      }

      const files = fs.readdirSync(BACKUP_DIR);
      const backupFiles = files.filter((file) => file.endsWith(".sql.gz.enc"));
      const backupMetadata = backupFiles.map((file) => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return { file, mtime: stats.mtime, size: stats.size };
      }).sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
      const totalSize = backupMetadata.reduce((sum, backup) => sum + backup.size, 0);
      const oldestBackup = backupMetadata[0] ?? null;
      const newestBackup = backupMetadata[backupMetadata.length - 1] ?? null;

      return {
        success: true,
        stats: {
          totalBackups: backupFiles.length,
          totalSize,
          totalSizeFormatted: formatBytes(totalSize),
          averageSize: backupFiles.length > 0 ? totalSize / backupFiles.length : 0,
          averageSizeFormatted:
            backupFiles.length > 0
              ? formatBytes(totalSize / backupFiles.length)
              : "0 B",
          oldestBackup: oldestBackup
            ? {
                filename: oldestBackup.file,
                date: oldestBackup.mtime,
                dateFormatted: oldestBackup.mtime.toLocaleString(),
              }
            : null,
          newestBackup: newestBackup
            ? {
                filename: newestBackup.file,
                date: newestBackup.mtime,
                dateFormatted: newestBackup.mtime.toLocaleString(),
              }
            : null,
          encryption: "AES-256-GCM",
          credentialStorage: "server-side secret",
          retention: "10 days",
          schedule: "Mon-Thu 18:00 Cairo Time",
        },
      };
    } catch (error) {
      return {
        success: false,
        stats: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }),
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

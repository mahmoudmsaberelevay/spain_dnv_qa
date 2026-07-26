import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function registerBackupRoutes(app: Express) {
  // Backup list endpoint
  app.get("/api/backup/list", (req, res) => {
    try {
      const BACKUP_DIR = "/home/ubuntu/backups";

      if (!fs.existsSync(BACKUP_DIR)) {
        return res.json({ success: true, backups: [] });
      }

      const files = fs.readdirSync(BACKUP_DIR)
        .filter((f: string) => f.endsWith(".sql.gz.enc"))
        .sort()
        .reverse();

      const backups = files.map((filename: string) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        const createdAt = stats.mtime.getTime();
        
        return {
          filename,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt,
          createdAtFormatted: new Date(createdAt).toLocaleString(),
          hasManifest: fs.existsSync(path.join(BACKUP_DIR, filename + ".manifest")),
          downloadUrl: `/api/backup/download/${encodeURIComponent(filename)}`,
        };
      });

      res.json({ success: true, backups });
    } catch (error) {
      console.error("Backup list error:", error);
      res.status(500).json({ success: false, error: "Failed to list backups" });
    }
  });

  // Backup stats endpoint
  app.get("/api/backup/stats", (req, res) => {
    try {
      const BACKUP_DIR = "/home/ubuntu/backups";

      if (!fs.existsSync(BACKUP_DIR)) {
        return res.json({
          success: true,
          stats: {
            totalBackups: 0,
            totalSize: 0,
            totalSizeFormatted: "0 B",
            averageSize: 0,
            averageSizeFormatted: "0 B",
            oldestBackup: null,
            newestBackup: null,
            encryption: "AES-256-CBC",
            password: "3488",
            retention: "10 days",
            schedule: "Mon-Thu 18:00 Cairo",
          },
        });
      }

      const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith(".sql.gz.enc"))
        .sort()
        .reverse();

      let totalSize = 0;
      const backupDates = [];

      files.forEach((filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        backupDates.push(stats.mtime.getTime());
      });

      const oldestDate = backupDates.length > 0 ? Math.min(...backupDates) : null;
      const newestDate = backupDates.length > 0 ? Math.max(...backupDates) : null;

      res.json({
        success: true,
        stats: {
          totalBackups: files.length,
          totalSize,
          totalSizeFormatted: formatBytes(totalSize),
          averageSize: files.length > 0 ? totalSize / files.length : 0,
          averageSizeFormatted: files.length > 0 ? formatBytes(totalSize / files.length) : "0 B",
          oldestBackup: oldestDate ? { filename: files[files.length - 1], date: oldestDate, dateFormatted: new Date(oldestDate).toLocaleString() } : null,
          newestBackup: newestDate ? { filename: files[0], date: newestDate, dateFormatted: new Date(newestDate).toLocaleString() } : null,
          encryption: "AES-256-CBC",
          password: "3488",
          retention: "10 days",
          schedule: "Mon-Thu 18:00 Cairo",
        },
      });
    } catch (error) {
      console.error("Backup stats error:", error);
      res.status(500).json({ success: false, error: "Failed to get stats" });
    }
  });
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

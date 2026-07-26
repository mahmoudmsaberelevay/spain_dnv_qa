import { Request, Response } from "express";
import fs from "fs";
import path from "path";

const BACKUP_DIR = "/home/ubuntu/backups";

export function setupBackupDownloadMiddleware(app: any) {
  // Download backup file
  app.get("/api/backup/download/:filename", (req: Request, res: Response) => {
    try {
      const filename = decodeURIComponent(req.params.filename);

      // Validate filename to prevent directory traversal
      if (!filename.endsWith(".sql.gz.enc")) {
        return res.status(400).json({ error: "Invalid file type" });
      }

      if (filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const filePath = path.join(BACKUP_DIR, filename);

      // Verify path is within backup directory
      if (!filePath.startsWith(BACKUP_DIR)) {
        return res.status(400).json({ error: "Invalid path" });
      }

      // Check file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      // Get file stats
      const stats = fs.statSync(filePath);

      // Set response headers
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", stats.size);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      // Stream file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (err) => {
        console.error("File stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Download failed" });
        }
      });
    } catch (error) {
      console.error("Download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // List backups (public endpoint)
  app.get("/api/backup/list", (req: Request, res: Response) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        return res.json({ success: false, backups: [] });
      }

      const files = fs.readdirSync(BACKUP_DIR);
      const backups = files
        .filter((file) => file.endsWith(".sql.gz.enc"))
        .map((file) => {
          const filePath = path.join(BACKUP_DIR, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            size: stats.size,
            createdAt: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ success: true, backups });
    } catch (error) {
      console.error("List error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  });
}

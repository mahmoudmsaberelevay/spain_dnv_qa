import fs from "fs";
import path from "path";

export function getBackupDownloadHTML(): string {
  const BACKUP_DIR = "/home/ubuntu/backups";
  let backupsHTML = "";
  let totalSize = 0;

  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith(".sql.gz.enc"))
        .sort()
        .reverse();

      files.forEach((filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        const createdAt = new Date(stats.mtime).toLocaleString();
        totalSize += stats.size;

        backupsHTML += `
          <div class="backup-item">
            <div class="backup-header">
              <span class="backup-name">${filename}</span>
              <span class="backup-date">${createdAt}</span>
            </div>
            <div class="backup-details">
              <span class="backup-size">📦 ${sizeInMB} MB</span>
              <span class="backup-encryption">🔐 AES-256</span>
            </div>
            <div class="backup-actions">
              <a href="/api/backup/download/${encodeURIComponent(filename)}" class="btn btn-primary">
                ⬇️ Download
              </a>
            </div>
          </div>
        `;
      });
    }
  } catch (error) {
    console.error("Error reading backups:", error);
  }

  const totalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ELEVAY Database Backups</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    .header {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    }

    .header h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 28px;
    }

    .header p {
      color: #666;
      font-size: 14px;
      line-height: 1.6;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .stat-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .stat-value {
      font-size: 20px;
      color: #333;
      font-weight: bold;
    }

    .backups-list {
      display: grid;
      gap: 15px;
    }

    .backup-item {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .backup-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
    }

    .backup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 10px;
    }

    .backup-name {
      font-weight: 600;
      color: #333;
      font-size: 14px;
      font-family: 'Courier New', monospace;
    }

    .backup-date {
      font-size: 12px;
      color: #999;
    }

    .backup-details {
      display: flex;
      gap: 20px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }

    .backup-size,
    .backup-encryption {
      font-size: 13px;
      color: #666;
    }

    .backup-actions {
      display: flex;
      gap: 10px;
    }

    .btn {
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-block;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }

    .empty-state {
      background: white;
      border-radius: 12px;
      padding: 60px 20px;
      text-align: center;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 15px;
    }

    .empty-state h2 {
      color: #333;
      margin-bottom: 10px;
    }

    .empty-state p {
      color: #999;
    }

    .info-box {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 15px;
      border-radius: 6px;
      margin-top: 20px;
      font-size: 13px;
      color: #1565c0;
      line-height: 1.6;
    }

    @media (max-width: 600px) {
      .header {
        padding: 20px;
      }

      .header h1 {
        font-size: 22px;
      }

      .stats {
        grid-template-columns: 1fr;
      }

      .backup-header {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🗄️ ELEVAY Database Backups</h1>
      <p>Manage and download encrypted database backups. All backups are encrypted with AES-256 and automatically retained for 10 days.</p>
      
      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">Total Backups</div>
          <div class="stat-value">${backupsHTML.match(/<div class="backup-item">/g)?.length || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Storage</div>
          <div class="stat-value">${totalSizeInMB} MB</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Encryption</div>
          <div class="stat-value">AES-256</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Retention</div>
          <div class="stat-value">10 Days</div>
        </div>
      </div>

      <div class="info-box">
        <strong>ℹ️ Restoration key:</strong> Stored securely outside the application<br>
        <strong>Schedule:</strong> Mon-Thu 18:00 Cairo Time<br>
        <strong>Encryption:</strong> AES-256-GCM authenticated encryption
      </div>
    </div>

    <div class="backups-list">
      ${
        backupsHTML
          ? backupsHTML
          : `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h2>No Backups Found</h2>
          <p>Backups will appear here when they are created. Check back later or run a manual backup.</p>
        </div>
      `
      }
    </div>
  </div>

  <script>
    // Add download tracking
    document.querySelectorAll('a[href*="/api/backup/download/"]').forEach(link => {
      link.addEventListener('click', function(e) {
        console.log('Downloading:', this.href);
      });
    });
  </script>
</body>
</html>
  `;
}

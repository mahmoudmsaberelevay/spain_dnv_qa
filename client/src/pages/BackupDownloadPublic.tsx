import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Lock, Calendar, HardDrive, AlertCircle } from "lucide-react";

interface Backup {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  createdAtFormatted: string;
  hasManifest: boolean;
  downloadUrl: string;
}

interface BackupStats {
  totalBackups: number;
  totalSize: number;
  totalSizeFormatted: string;
  averageSize: number;
  averageSizeFormatted: string;
  oldestBackup: { filename: string; date: string; dateFormatted: string } | null;
  newestBackup: { filename: string; date: string; dateFormatted: string } | null;
  encryption: string;
  credentialStorage: string;
  retention: string;
  schedule: string;
}

export function BackupDownloadPublic() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBackups = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/backup/list");
        if (!response.ok) throw new Error("Failed to fetch backups");
        const data = await response.json();
        
        if (data.success && data.backups) {
          setBackups(data.backups);
          if (data.backups.length > 0) {
            setSelectedBackup(data.backups[0]);
          }
        }

        // Fetch stats
        const statsResponse = await fetch("/api/backup/stats");
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          if (statsData.success) {
            setStats(statsData.stats);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchBackups();
  }, []);

  const handleDownload = (filename: string) => {
    const link = document.createElement("a");
    link.href = `/api/backup/download/${encodeURIComponent(filename)}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Database Backups</h1>
          <p className="text-slate-600">Download and manage your encrypted database backups</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Backups</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.totalBackups}</p>
                </div>
                <HardDrive className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Size</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.totalSizeFormatted}</p>
                </div>
                <HardDrive className="w-8 h-8 text-green-500" />
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Encryption</p>
                  <p className="text-sm font-bold text-slate-900">{stats.encryption}</p>
                </div>
                <Lock className="w-8 h-8 text-amber-500" />
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Retention</p>
                  <p className="text-sm font-bold text-slate-900">{stats.retention}</p>
                </div>
                <Calendar className="w-8 h-8 text-purple-500" />
              </div>
            </Card>
          </div>
        )}

        {/* Info Box */}
        <Card className="p-4 bg-blue-50 border-blue-200 mb-8 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-blue-900">Backup Information</p>
            <p className="text-sm text-blue-800 mt-1">
              New backups use authenticated AES-256-GCM encryption. Restoration credentials are never exposed in this page.
            </p>
            <p className="text-sm text-blue-800 mt-1">
              Schedule: <strong>Monday-Thursday at 18:00 Cairo Time</strong>
            </p>
          </div>
        </Card>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Loading backups...</p>
          </div>
        ) : error ? (
          <Card className="p-6 bg-red-50 border-red-200">
            <p className="text-red-800">Error: {error}</p>
          </Card>
        ) : backups.length === 0 ? (
          <Card className="p-6 text-center bg-white border-slate-200">
            <p className="text-slate-600">No backups found</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Backups List */}
            <div className="lg:col-span-2">
              <Card className="bg-white border-slate-200">
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900">Available Backups</h2>
                </div>

                <div className="divide-y divide-slate-200">
                  {backups.map((backup) => (
                    <div
                      key={backup.filename}
                      onClick={() => setSelectedBackup(backup)}
                      className={`p-4 cursor-pointer transition-colors ${
                        selectedBackup?.filename === backup.filename
                          ? "bg-blue-50 border-l-4 border-blue-500"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-mono text-sm text-slate-900 break-all">
                            {backup.filename}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {backup.createdAtFormatted}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-600 whitespace-nowrap ml-4">
                          {backup.sizeFormatted}
                        </span>
                      </div>

                      {selectedBackup?.filename === backup.filename && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(backup.filename);
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download Backup
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Details Panel */}
            <div>
              <Card className="bg-white border-slate-200 sticky top-6">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="font-bold text-slate-900">Backup Details</h3>
                </div>

                {selectedBackup ? (
                  <div className="p-6 space-y-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">File Name</p>
                      <p className="font-mono text-sm text-slate-900 break-all">
                        {selectedBackup.filename}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">File Size</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedBackup.sizeFormatted}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Created</p>
                      <p className="text-sm text-slate-900">
                        {selectedBackup.createdAtFormatted}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Encryption</p>
                      <p className="text-sm text-slate-900">AES-256-GCM</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Restoration key</p>
                      <p className="text-sm text-slate-900">Server-managed and not displayed</p>
                    </div>

                    <Button
                      onClick={() => handleDownload(selectedBackup.filename)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500">
                    Select a backup to view details
                  </div>
                )}
              </Card>

              {/* Instructions */}
              <Card className="bg-slate-50 border-slate-200 mt-6">
                <div className="p-4">
                  <h4 className="font-semibold text-slate-900 mb-3 text-sm">Restore Instructions</h4>
                  <ol className="text-xs text-slate-700 space-y-2 list-decimal list-inside">
                    <li>Download the backup file</li>
                    <li>Administrator authentication is required for backup access.</li>
                    <li>Validate and decrypt with the server-side recovery workflow.</li>
                    <li>Restore into an isolated recovery database before any production action.</li>
                  </ol>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

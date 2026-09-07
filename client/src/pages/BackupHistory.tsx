import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, RefreshCw, Calendar, HardDrive, AlertCircle, CheckCircle2, Lock, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface BackupFile {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  createdAtFormatted: string;
  hasManifest: boolean;
  downloadUrl: string;
}

export default function BackupHistory() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<BackupFile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBackups = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/backup/list');
      if (!response.ok) throw new Error('Failed to fetch backups');
      const data = await response.json();
      
      if (data.success && data.backups) {
        setBackups(data.backups);
        if (data.backups.length > 0 && !selectedBackup) {
          setSelectedBackup(data.backups[0]);
        }
        setError(null);
      } else {
        setError(data.error || 'Failed to load backups');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch backups');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleDownload = (backup: BackupFile) => {
    const link = document.createElement('a');
    link.href = backup.downloadUrl;
    link.download = backup.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Backup History</h1>
          <p className="text-muted-foreground">
            View and download all encrypted database backups
          </p>
        </div>
        <Button
          onClick={fetchBackups}
          disabled={refreshing}
          variant="outline"
          className="gap-2"
        >
          {refreshing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading backups...</p>
          </div>
        </div>
      )}

      {/* Backups List */}
      {!loading && backups.length > 0 && (
        <>
          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Backup Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Backups</p>
                <p className="text-2xl font-bold">{backups.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Size</p>
                <p className="text-2xl font-bold">
                  {(backups.reduce((sum, b) => sum + b.size, 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Encryption</p>
                <p className="text-2xl font-bold flex items-center gap-1">
                  <Lock className="w-4 h-4" />
                  AES-256
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Retention</p>
                <p className="text-2xl font-bold">10 days</p>
              </div>
            </CardContent>
          </Card>

          {/* Backups Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Backup Files
              </CardTitle>
              <CardDescription>
                {backups.length} backup(s) available • Sorted by newest first
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold">Filename</th>
                      <th className="text-left py-3 px-4 font-semibold">Created</th>
                      <th className="text-right py-3 px-4 font-semibold">Size</th>
                      <th className="text-center py-3 px-4 font-semibold">Manifest</th>
                      <th className="text-right py-3 px-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup, idx) => (
                      <tr
                        key={idx}
                        className={`border-b hover:bg-muted/50 transition-colors cursor-pointer ${
                          selectedBackup?.filename === backup.filename ? 'bg-muted' : ''
                        }`}
                        onClick={() => setSelectedBackup(backup)}
                      >
                        <td className="py-3 px-4 font-mono text-xs">{backup.filename}</td>
                        <td className="py-3 px-4 text-xs">{formatDate(backup.createdAt)}</td>
                        <td className="py-3 px-4 text-right text-xs font-semibold">
                          {backup.sizeFormatted}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {backup.hasManifest ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-amber-600 mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(backup);
                            }}
                            className="gap-1"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Selected Backup Details */}
          {selectedBackup && (
            <Card>
              <CardHeader>
                <CardTitle>Backup Details</CardTitle>
                <CardDescription>{selectedBackup.filename}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Filename</p>
                    <p className="font-mono text-sm break-all">{selectedBackup.filename}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">File Size</p>
                    <p className="font-semibold">{selectedBackup.sizeFormatted}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Created</p>
                    <p className="font-semibold">{formatDate(selectedBackup.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Encryption</p>
                    <p className="font-semibold flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      AES-256-GCM · server-managed restoration key
                    </p>
                  </div>
                </div>

                {/* Restore Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-3">Restore Instructions</h3>
                  <ol className="space-y-2 text-sm text-blue-800">
                    <li>
                      <strong>1. Download</strong> the backup file from the table above
                    </li>
                    <li>
                      <strong>2. Validate and decrypt</strong> with the documented server-side recovery utility. The restoration key is never displayed in the browser.
                    </li>
                    <li>
                      <strong>3. Decompress the validated output:</strong>
                      <code className="block bg-white border border-blue-200 rounded px-2 py-1 mt-1 font-mono text-xs">
                        gunzip backup.sql.gz
                      </code>
                    </li>
                    <li>
                      <strong>4. Restore:</strong>
                      <code className="block bg-white border border-blue-200 rounded px-2 py-1 mt-1 font-mono text-xs">
                        mysql -u username -p database_name &lt; backup.sql
                      </code>
                    </li>
                  </ol>
                </div>

                {/* Download Button */}
                <Button
                  onClick={() => handleDownload(selectedBackup)}
                  className="w-full gap-2"
                  size="lg"
                >
                  <Download className="w-4 h-4" />
                  Download Backup
                </Button>

                <p className="text-xs text-muted-foreground">
                  ⚠️ Restoration will overwrite all current data. Ensure you have proper backups and authorization before proceeding.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && backups.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <HardDrive className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Backups Found</h3>
            <p className="text-muted-foreground mb-4">
              Backups will appear here once they are created by the scheduled cron job.
            </p>
            <p className="text-sm text-muted-foreground">
              Scheduled: Monday-Thursday at 18:00 Cairo Time
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, Eye, AlertCircle, CheckCircle2, Table2, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface BackupData {
  tables: {
    name: string;
    rowCount: number;
    columns: string[];
    sampleData: any[];
  }[];
  totalSize: string;
  backupDate: string;
  fileName: string;
}

export default function BackupPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<BackupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Accept any .enc file - backend will validate
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/backup/preview/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setPreviewData(data);
      setSelectedTable(data.tables[0]?.name || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const selectedTableData = previewData?.tables.find(t => t.name === selectedTable);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Backup Preview & Restore</h1>
        <p className="text-muted-foreground">
          Upload an encrypted backup file to preview its contents before restoring to production.
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Backup File
          </CardTitle>
          <CardDescription>
            Select a current ELEVAY .sql.gz.enc backup. Decryption uses the server-managed restoration key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4">
            <input
              type="file"
              onChange={handleFileSelect}
              disabled={loading}
              className="flex-1 file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
            <Button
              onClick={handleUpload}
              disabled={!file || loading}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Preview
                </>
              )}
            </Button>
          </div>

          {file && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Selected: {file.name}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Section */}
      {previewData && (
        <>
          {/* Backup Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Backup Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Filename</p>
                <p className="font-semibold">{previewData.fileName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Backup Date</p>
                <p className="font-semibold">{previewData.backupDate}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Size</p>
                <p className="font-semibold">{previewData.totalSize}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tables</p>
                <p className="font-semibold">{previewData.tables.length}</p>
              </div>
            </CardContent>
          </Card>

          {/* Tables List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table2 className="w-5 h-5" />
                Database Tables
              </CardTitle>
              <CardDescription>
                Click on a table to view its structure and sample data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {previewData.tables.map(table => (
                  <button
                    key={table.name}
                    onClick={() => setSelectedTable(table.name)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      selectedTable === table.name
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-semibold text-sm">{table.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {table.rowCount.toLocaleString()} rows
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Table Details */}
          {selectedTableData && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedTableData.name}</CardTitle>
                <CardDescription>
                  {selectedTableData.rowCount.toLocaleString()} total rows • {selectedTableData.columns.length} columns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Columns */}
                <div>
                  <h3 className="font-semibold mb-3">Columns</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {selectedTableData.columns.map(col => (
                      <div key={col} className="px-3 py-2 bg-gray-100 rounded text-sm font-mono">
                        {col}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sample Data */}
                {selectedTableData.sampleData.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">Sample Data (First 5 Rows)</h3>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 border-b">
                          <tr>
                            {selectedTableData.columns.map(col => (
                              <th key={col} className="px-4 py-2 text-left font-semibold">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTableData.sampleData.map((row, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              {selectedTableData.columns.map(col => (
                                <td key={`${idx}-${col}`} className="px-4 py-2 font-mono text-xs">
                                  {String(row[col] ?? '—').substring(0, 50)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Restore Action */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-blue-900">Ready to Restore?</CardTitle>
              <CardDescription className="text-blue-800">
                This page validates and previews the encrypted backup. Production restoration requires the documented controlled recovery procedure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="gap-2" size="lg" disabled>
                <Download className="w-4 h-4" />
                Production restore requires controlled recovery
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                ⚠️ Restoration will overwrite all current data. This action cannot be undone.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Settings, Webhook, Key, Copy, CheckCircle, AlertCircle, Loader2, Send, Trash2, CloudUpload, Calendar } from "lucide-react";
import { toast } from "sonner";

function BackupSection() {
  const backupMutation = trpc.waQc.runBackup.useMutation({
    onSuccess: (data: { ok?: boolean; fileName?: string; messageCount?: number; webViewLink?: string; skipped?: string }) => {
      if (data.skipped) {
        toast.warning(`Backup skipped: ${data.skipped}`);
      } else {
        toast.success(`Backup complete! ${data.messageCount} messages saved to Google Drive`);
      }
    },
    onError: (e: { message: string }) => toast.error(`Backup failed: ${e.message}`),
  });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CloudUpload className="h-4 w-4 text-blue-400" />
          Google Drive Backup
        </CardTitle>
        <CardDescription className="text-xs">All WhatsApp messages, voice transcripts, and document text are backed up automatically</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/20 border border-border/30">
          <Calendar className="h-4 w-4 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Automatic Schedule</p>
            <p className="text-xs text-muted-foreground">Every Thursday at 5:00 PM Cairo time — uploads to "ELEVAY WhatsApp Backups" folder in Google Drive</p>
          </div>
        </div>
        <Button
          onClick={() => backupMutation.mutate()}
          disabled={backupMutation.isPending}
          variant="outline"
          className="w-full"
        >
          {backupMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running backup...</>
          ) : (
            <><CloudUpload className="h-4 w-4 mr-2" />Run Backup Now</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function WaQcSettings() {
  const { data: configs, isLoading } = trpc.waQc.config.list.useQuery();
  const { data: webhookData } = trpc.waQc.config.getWebhookUrl.useQuery();
  const saveMutation = trpc.waQc.config.save.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      utils.waQc.config.list.invalidate();
    },
    onError: (e: { message: string }) => { toast.error(`Failed to save: ${e.message}`); },
  });
  const deleteMutation = trpc.waQc.config.delete.useMutation({
    onSuccess: () => {
      toast.success("Configuration deleted");
      utils.waQc.config.list.invalidate();
    },
  });
  const testMutation = trpc.waQc.config.sendTestMessage.useMutation({
    onSuccess: () => toast.success("Test message sent!"),
    onError: (e: { message: string }) => toast.error(`Test failed: ${e.message}`),
  });
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    phoneNumberId: "",
    displayName: "",
    accessToken: "",
    webhookVerifyToken: "",
    isActive: true,
  });
  const [testPhone, setTestPhone] = useState("");

  const activeConfig = configs?.find((c) => c.isActive);

  useEffect(() => {
    if (activeConfig) {
      setForm({
        phoneNumberId: activeConfig.phoneNumberId || "",
        displayName: activeConfig.displayName || "",
        accessToken: "",
        webhookVerifyToken: activeConfig.webhookVerifyToken || "",
        isActive: activeConfig.isActive,
      });
    }
  }, [activeConfig]);

  const webhookUrl = webhookData?.webhookUrl || `${window.location.origin}/api/webhook/whatsapp`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleSave = () => {
    if (!form.phoneNumberId.trim()) {
      toast.error("Phone Number ID is required");
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-400" />
          WA Monitor Settings
        </h1>
        <p className="text-sm text-muted-foreground">Configure WhatsApp Business API credentials</p>
      </div>

      {/* Webhook URL */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-4 w-4 text-green-400" />
            Webhook URL
          </CardTitle>
          <CardDescription className="text-xs">Use this URL in your WhatsApp Business API settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-accent/30 border border-border/50 rounded-lg px-3 py-2 font-mono text-foreground break-all">
              {webhookUrl}
            </code>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">GET — Verification</Badge>
            <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-400/30">POST — Messages</Badge>
          </div>
        </CardContent>
      </Card>

      {/* API Credentials */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4 text-yellow-400" />
            API Credentials
          </CardTitle>
          <CardDescription className="text-xs">From your Meta Business Developer account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone Number ID *</Label>
                <Input
                  value={form.phoneNumberId}
                  onChange={(e) => setForm(f => ({ ...f, phoneNumberId: e.target.value }))}
                  placeholder="Enter Phone Number ID"
                  className="bg-card border-border/50 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Display Name</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="e.g. Elevay WhatsApp"
                  className="bg-card border-border/50 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Access Token</Label>
                <Input
                  type="password"
                  value={form.accessToken}
                  onChange={(e) => setForm(f => ({ ...f, accessToken: e.target.value }))}
                  placeholder="Enter Access Token (leave blank to keep existing)"
                  className="bg-card border-border/50 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Webhook Verify Token</Label>
                <Input
                  value={form.webhookVerifyToken}
                  onChange={(e) => setForm(f => ({ ...f, webhookVerifyToken: e.target.value }))}
                  placeholder="Enter Verify Token (any string you choose)"
                  className="bg-card border-border/50 font-mono text-sm"
                />
              </div>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="w-full"
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" />Save Settings</>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Existing Configurations */}
      {configs && configs.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saved Configurations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {configs.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/20 border border-border/30">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.displayName || c.phoneNumberId}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.phoneNumberId}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.isActive && <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-400/30">Active</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate({ id: c.id })}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Test Message */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-purple-400" />
            Send Test Message
          </CardTitle>
          <CardDescription className="text-xs">Send a test WhatsApp message to verify the connection</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Phone number (e.g. 201234567890)"
              className="bg-card border-border/50 font-mono text-sm"
            />
            <Button
              onClick={() => testMutation.mutate({ toPhone: testPhone })}
              disabled={!testPhone.trim() || testMutation.isPending}
              variant="outline"
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Google Drive Backup */}
      <BackupSection />

      {/* Status */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {activeConfig?.phoneNumberId ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">API Configured</p>
                  <p className="text-xs text-muted-foreground">Phone ID: {activeConfig.phoneNumberId}</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Not Configured</p>
                  <p className="text-xs text-muted-foreground">Enter your WhatsApp Business API credentials above</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

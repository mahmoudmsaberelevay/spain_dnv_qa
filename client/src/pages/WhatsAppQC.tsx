import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { MessageSquare, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const WA_MONITOR_URL = "https://whatsmonit-nehmjowe.manus.space";

export default function WhatsAppQC() {
  const { user } = useAuth();
  const { data: perms, isLoading } = trpc.permissions.getMyPermissions.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" />
      </div>
    );
  }

  const hasAccess = perms?.isOwner || perms?.permissions?.["wa_qc"] === true;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center px-4">
        <MessageSquare className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          You don't have access to the WhatsApp Quality Control module. Contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/40 bg-background shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground leading-tight">WhatsApp Quality Control</h1>
            <p className="text-xs text-muted-foreground">WA Group Monitoring Agent</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={() => window.open(WA_MONITOR_URL, "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in new tab
        </Button>
      </div>

      {/* Embedded iframe */}
      <div className="flex-1 relative">
        <iframe
          src={WA_MONITOR_URL}
          title="WhatsApp Quality Control"
          className="absolute inset-0 w-full h-full border-0"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        />
      </div>
    </div>
  );
}

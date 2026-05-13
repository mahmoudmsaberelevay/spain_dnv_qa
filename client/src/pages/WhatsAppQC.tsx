/**
 * WhatsApp Quality Control — embeds WhatsMonit with automatic SSO.
 *
 * Both Elevay and WhatsMonit use Manus OAuth (same identity provider).
 * Strategy:
 *  1. Load the iframe pointing at WhatsMonit.
 *  2. After a short delay, check if the iframe ended up on the login page
 *     by listening for a postMessage from the iframe (if WhatsMonit sends one),
 *     OR by providing a direct "Auto-login" button that opens the Manus OAuth
 *     flow for WhatsMonit in the same window, which completes silently since
 *     the user is already authenticated with Manus, then returns to Elevay.
 *
 * The cleanest approach for cross-origin iframes (no postMessage support):
 *  - Provide an "Auto-login" button that navigates to WhatsMonit's Manus OAuth URL.
 *  - Manus OAuth detects the existing session and redirects back to WhatsMonit
 *    without showing any login screen.
 *  - After WhatsMonit sets its session cookie, the user navigates back to /wa-qc
 *    and the iframe loads the authenticated dashboard.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { MessageSquare, ExternalLink, LogIn, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";

const WA_MONITOR_URL = "https://whatsmonit-nehmjowe.manus.space";
const WA_MONITOR_APP_ID = "NEHmJowEZiFno7tHU4bpEv";

// Build the Manus OAuth URL for WhatsMonit — since the user is already logged
// into Manus, this will complete instantly and redirect to WhatsMonit dashboard.
function buildWhatsMonitLoginUrl() {
  const redirectUri = encodeURIComponent(`${WA_MONITOR_URL}/api/oauth/callback`);
  // state = base64(returnUrl) — WhatsMonit's OAuth handler decodes this
  const state = btoa(`${WA_MONITOR_URL}/api/oauth/callback`);
  return `https://manus.im/app-auth?appId=${WA_MONITOR_APP_ID}&redirectUri=${redirectUri}&state=${state}&type=signIn`;
}

export default function WhatsAppQC() {
  const { user } = useAuth();
  const { data: perms, isLoading } = trpc.permissions.getMyPermissions.useQuery();
  const [iframeKey, setIframeKey] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const handleAutoLogin = useCallback(() => {
    // Open WhatsMonit OAuth in a popup — Manus detects existing session and
    // completes instantly, setting the WhatsMonit session cookie.
    const popup = window.open(
      buildWhatsMonitLoginUrl(),
      "whatsmonit-auth",
      "width=600,height=700,scrollbars=yes,resizable=yes"
    );

    // Poll for popup close, then reload the iframe
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        setIframeKey(k => k + 1); // force iframe reload
        setShowLoginPrompt(false);
      }
    }, 500);
  }, []);

  const handleOpenNewTab = useCallback(() => {
    window.open(WA_MONITOR_URL, "_blank");
  }, []);

  const handleReload = useCallback(() => {
    setIframeKey(k => k + 1);
    setShowLoginPrompt(false);
  }, []);

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
        <div className="flex items-center gap-2">
          {/* Auto-login button — appears if user sees a login screen in the iframe */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20"
            onClick={handleAutoLogin}
            title="If you see a login screen below, click this to sign in automatically"
          >
            <LogIn className="h-3.5 w-3.5" />
            Auto-login
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={handleReload}
            title="Reload the monitor"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={handleOpenNewTab}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            New tab
          </Button>
        </div>
      </div>

      {/* Login prompt banner — shown after auto-login completes */}
      {showLoginPrompt && (
        <div className="px-6 py-3 bg-green-500/10 border-b border-green-500/20 text-green-700 text-sm flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Completing login… the monitor will reload automatically.
        </div>
      )}

      {/* Embedded iframe */}
      <div className="flex-1 relative">
        <iframe
          key={iframeKey}
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

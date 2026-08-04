/**
 * MobileLayout — Bottom tab navigation layout for mobile devices.
 * Shows a native-feeling bottom tab bar with 5 main modules.
 * Only renders on mobile screens (< 768px).
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  FileText,
  Wallet,
  Target,
  FolderCheck,
  MoreHorizontal,
  Home,
  Search,
  Megaphone,
  BarChart3,
  MessageSquare,
  Shield,
  HardDrive,
  User,
  LogOut,
  Bell,
  ChevronRight,
  X,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

// Tab definitions
const TABS = [
  { id: "home", label: "Home", icon: Home, path: "/" },
  { id: "finance", label: "Finance", icon: Wallet, path: "/finance" },
  { id: "leads", label: "Leads", icon: Target, path: "/leads/dashboard" },
  { id: "contracts", label: "Contracts", icon: FileText, path: "/contracting" },
  { id: "more", label: "More", icon: MoreHorizontal, path: "__more__" },
] as const;

// "More" menu items
const MORE_ITEMS = [
  { id: "docs", label: "Client Documentation", icon: FolderCheck, path: "/docs/dashboard" },
  { id: "analysis", label: "Application Analysis", icon: Search, path: "/analysis/dashboard" },
  { id: "marketing", label: "Marketing", icon: Megaphone, path: "/marketing" },
  { id: "reports", label: "Reports", icon: BarChart3, path: "/reports" },
  { id: "wa-qc", label: "WhatsApp QC", icon: MessageSquare, path: "/wa-qc" },
  { id: "backup", label: "Backup", icon: HardDrive, path: "/backup" },
  { id: "admin", label: "Admin & Security", icon: Shield, path: "/admin/permissions" },
  { id: "profile", label: "Profile", icon: User, path: "/profile" },
];

function getActiveTab(location: string): string {
  if (location === "/") return "home";
  if (location.startsWith("/finance")) return "finance";
  if (location.startsWith("/leads")) return "leads";
  if (location.startsWith("/contracting")) return "contracts";
  return "more";
}

interface MobileLayoutProps {
  children: React.ReactNode;
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const logoutMut = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  const activeTab = getActiveTab(location);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-6">
        <img src="/manus-storage/elevay-logo_2c219cd3.png" alt="Elevay" className="h-20 w-auto object-contain mb-8" />
        <h2 className="text-xl font-semibold text-white mb-2">Sign in to continue</h2>
        <p className="text-sm text-white/50 text-center mb-8">Access to the Elevay platform requires authentication.</p>
        <Button
          onClick={() => { window.location.href = getLoginUrl(); }}
          size="lg"
          className="w-full max-w-xs"
        >
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
        <div className="flex items-center gap-2">
          <img src="/manus-storage/elevay-logo_2c219cd3.png" alt="Elevay" className="h-8 w-auto object-contain" />
          <span className="text-sm font-semibold text-foreground">ELEVAY</span>
        </div>
        <div className="flex items-center gap-2">
          <MobileNotificationBell />
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{user.name?.charAt(0).toUpperCase() ?? "U"}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* More Menu Overlay */}
      {showMore && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => setShowMore(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl border-t max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-lg font-semibold">More Modules</h3>
              <button onClick={() => setShowMore(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setLocation(item.path); setShowMore(false); }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-accent transition-colors"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })}
              {/* Logout */}
              <button
                onClick={() => logoutMut.mutate()}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-destructive/10 transition-colors mt-2 border-t pt-4"
              >
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <LogOut className="h-5 w-5 text-destructive" />
                </div>
                <span className="flex-1 text-left text-sm font-medium text-destructive">Sign Out</span>
              </button>
            </div>
            {/* Safe area padding for bottom */}
            <div className="h-6" />
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const handlePress = () => {
              if (tab.path === "__more__") {
                setShowMore(true);
              } else {
                setLocation(tab.path);
                setShowMore(false);
              }
            };
            return (
              <button
                key={tab.id}
                onClick={handlePress}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-xl transition-all",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={cn("text-[10px] font-medium", isActive && "font-semibold")}>{tab.label}</span>
                {isActive && <div className="h-0.5 w-4 rounded-full bg-primary mt-0.5" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ─── Mobile Notification Bell ─────────────────────────────────────────────────
function MobileNotificationBell() {
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const unread = (notifications as any[]).filter((n: any) => !n.isRead).length;

  return (
    <button
      onClick={() => { /* TODO: open notifications panel */ }}
      className="relative h-9 w-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
    >
      <Bell className="h-5 w-5 text-muted-foreground" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

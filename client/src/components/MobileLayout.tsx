/**
 * MobileLayout — Bottom tab navigation layout for mobile devices.
 * Shows a native-feeling bottom tab bar with 5 main modules.
 * Includes a slide-out sidebar accessible from every page via the header toggle.
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
  Scale,
  PanelLeft,
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

// All navigation items for the sidebar
const SIDEBAR_ITEMS = [
  { id: "home", label: "Home", icon: Home, path: "/" },
  { id: "finance", label: "Financial", icon: Wallet, path: "/finance" },
  { id: "leads", label: "Leads", icon: Target, path: "/leads/dashboard" },
  { id: "contracts", label: "Contracting", icon: FileText, path: "/contracting" },
  { id: "docs", label: "Client Docs", icon: FolderCheck, path: "/docs/dashboard" },
  { id: "analysis", label: "Analysis", icon: Search, path: "/analysis/dashboard" },
  { id: "marketing", label: "Marketing", icon: Megaphone, path: "/marketing" },
  { id: "reports", label: "Reports", icon: BarChart3, path: "/reports" },
  { id: "wa-qc", label: "WhatsApp QC", icon: MessageSquare, path: "/wa-qc" },
  { id: "backup", label: "Backup", icon: HardDrive, path: "/backup" },
  { id: "admin", label: "Admin", icon: Shield, path: "/admin/permissions" },
  { id: "profile", label: "Profile", icon: User, path: "/profile" },
];

function getActiveTab(location: string): string {
  if (location === "/") return "home";
  if (location.startsWith("/finance")) return "finance";
  if (location.startsWith("/leads")) return "leads";
  if (location.startsWith("/contracting")) return "contracts";
  return "more";
}

function getPageName(location: string): string {
  if (location === "/") return "Dashboard";
  if (location.startsWith("/finance")) return "Financial";
  if (location.startsWith("/leads")) return "Leads";
  if (location.startsWith("/contracting")) return "Contracting";
  if (location.startsWith("/docs")) return "Client Docs";
  if (location.startsWith("/analysis")) return "Analysis";
  if (location.startsWith("/marketing")) return "Marketing";
  if (location.startsWith("/reports")) return "Reports";
  if (location.startsWith("/wa-qc")) return "WhatsApp QC";
  if (location.startsWith("/backup")) return "Backup";
  if (location.startsWith("/admin")) return "Admin";
  if (location.startsWith("/profile")) return "Profile";
  if (location.startsWith("/privacy")) return "Privacy Policy";
  if (location.startsWith("/terms")) return "Terms";
  if (location.startsWith("/support")) return "Support";
  if (location.startsWith("/account-deletion")) return "Account Deletion";
  return "Dashboard";
}

interface MobileLayoutProps {
  children: React.ReactNode;
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const logoutMut = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  const activeTab = getActiveTab(location);

  // Public paths that don't require authentication
  const PUBLIC_PATHS = ["/", "/privacy-policy", "/terms", "/support", "/account-deletion"];
  const isPublicPage = PUBLIC_PATHS.includes(location);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  // Only block unauthenticated access on non-public pages
  if (!user && !isPublicPage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-6">
        <img src="/manus-storage/elevay-logo_2c219cd3.png" alt="Elevay" className="h-20 w-auto object-contain mb-8" />
        <h2 className="text-xl font-semibold text-white mb-2">Sign in to continue</h2>
        <p className="text-sm text-white/50 text-center mb-8">Access to the Elevay platform requires authentication.</p>
        <Button
          onClick={() => { window.location.href = getLoginUrl(location); }}
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
      {/* Slide-out Sidebar */}
      {showSidebar && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={() => setShowSidebar(false)}>
          <div
            className="absolute top-0 left-0 bottom-0 w-72 bg-background border-r shadow-2xl animate-in slide-in-from-left duration-200 overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sidebar Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <img src="/manus-storage/elevay-logo_2c219cd3.png" alt="Elevay" className="h-9 w-auto object-contain" />
              <div>
                <p className="text-sm font-bold text-foreground">ELEVAY</p>
                <p className="text-[11px] text-muted-foreground">CRM System</p>
              </div>
              <button onClick={() => setShowSidebar(false)} className="ml-auto h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Sidebar Navigation */}
            <div className="flex-1 p-3 overflow-y-auto">
              {SIDEBAR_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path.split("/").slice(0, 2).join("/")));
                return (
                  <button
                    key={item.id}
                    onClick={() => { setLocation(item.path); setShowSidebar(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isActive && "text-primary")} strokeWidth={isActive ? 2.5 : 1.5} />
                    <span className={cn("text-sm", isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Sidebar Footer */}
            {user && (
              <div className="border-t p-3">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{user.name?.charAt(0).toUpperCase() ?? "U"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => logoutMut.mutate()}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(true)}
            className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors -ml-1"
          >
            <PanelLeft className="h-5 w-5 text-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground">{getPageName(location)}</span>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <MobileNotificationBell />
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{user.name?.charAt(0).toUpperCase() ?? "U"}</span>
              </div>
            </>
          ) : (
            <a
              href={getLoginUrl("/")}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
            >
              Sign In
            </a>
          )}
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
              {SIDEBAR_ITEMS.filter(i => !["home","finance","leads","contracts"].includes(i.id)).map((item) => {
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
              {/* Legal / Public Pages */}
              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="px-4 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Legal</p>
                {[
                  { id: "privacy", label: "Privacy Policy", icon: Scale, path: "/privacy-policy" },
                  { id: "terms", label: "Terms & Conditions", icon: FileText, path: "/terms" },
                  { id: "support", label: "Support", icon: MessageSquare, path: "/support" },
                  { id: "deletion", label: "Account Deletion", icon: User, path: "/account-deletion" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setLocation(item.path); setShowMore(false); }}
                      className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-accent transition-colors"
                    >
                      <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="flex-1 text-left text-sm font-medium text-muted-foreground">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </button>
                  );
                })}
              </div>
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

      {/* Bottom Tab Bar — only show for authenticated users */}
      {user && <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t safe-area-bottom">
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
      </nav>}
    </div>
  );
}

// ─── Mobile Notification Bell ─────────────────────────────────────────────────
function MobileNotificationBell() {
  const { user } = useAuth();
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: !!user,
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

/**
 * MobileLayout — Bottom tab navigation layout for mobile devices.
 * Shows a native-feeling bottom tab bar with 5 main modules.
 * Includes a full slide-out sidebar with all modules and subpages.
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
  ChevronDown,
  X,
  Scale,
  PanelLeft,
  LayoutDashboard,
  Receipt,
  FolderOpen,
  Users,
  GitBranch,
  Globe,
  PiggyBank,
  TrendingUp,
  ArrowLeftRight,
  Layers,
  UserCheck,
  DollarSign,
  Database,
  Upload,
  Landmark,
  CalendarClock,
  Filter,
  KanbanSquare,
  BarChart2,
  CheckSquare,
  Settings as SettingsIcon,
  Sparkles,
  GitCompare,
  FileSignature,
  Calendar,
  Mic2,
  MessagesSquare,
  Bot,
  Image,
} from "lucide-react";
import { useState, useEffect } from "react";
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

// Full sidebar modules with subpages (mirrors DashboardLayout)
export const MOBILE_SIDEBAR_MODULES = [
  {
    id: "contracting",
    label: "Contracting",
    icon: FileText,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/contracting" },
      { icon: FileText, label: "Contracts", path: "/contracting/contracts" },
      { icon: Receipt, label: "Receipts", path: "/contracting/invoices" },
      { icon: Receipt, label: "Proforma Invoice", path: "/contracting/proforma" },
      { icon: BarChart3, label: "Analytics", path: "/contracting/analytics" },
    ],
  },
  {
    id: "analysis",
    label: "Application Analysis",
    icon: Search,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/analysis/dashboard" },
      { icon: FolderOpen, label: "Cases", path: "/analysis" },
    ],
  },
  {
    id: "docs",
    label: "Client Documentation",
    icon: FolderCheck,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/docs/dashboard" },
      { icon: Users, label: "Clients", path: "/docs" },
      { icon: GitBranch, label: "Workflow", path: "/docs/workflow" },
      { icon: Globe, label: "National Visa", path: "/docs/national-visa" },
    ],
  },
  {
    id: "financial",
    label: "Financial",
    icon: Wallet,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/finance" },
      { icon: PiggyBank, label: "Accounts", path: "/finance/accounts" },
      { icon: TrendingUp, label: "Income", path: "/finance/income" },
      { icon: ArrowLeftRight, label: "Expenses", path: "/finance/expenses" },
      { icon: Layers, label: "Transfers", path: "/finance/transfers" },
      { icon: BarChart3, label: "Reports", path: "/finance/reports" },
      { icon: UserCheck, label: "Employees", path: "/finance/employees" },
      { icon: Layers, label: "Categories", path: "/finance/categories" },
      { icon: DollarSign, label: "Commission DB", path: "/finance/commissions" },
      { icon: Database, label: "Clients", path: "/finance/clients" },
      { icon: Upload, label: "Bulk Upload", path: "/finance/bulk-upload" },
      { icon: Landmark, label: "After Settlement", path: "/finance/settlement" },
      { icon: CalendarClock, label: "Upcoming Payments", path: "/finance/upcoming" },
      { icon: Receipt, label: "Salary Receipts", path: "/finance/salary-receipts" },
      { icon: Receipt, label: "Commission Receipts", path: "/finance/commission-receipts" },
    ],
  },
  {
    id: "leads",
    label: "ELEVAY LEADS",
    icon: Target,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/leads/dashboard" },
      { icon: Filter, label: "All Leads", path: "/leads" },
      { icon: KanbanSquare, label: "Pipeline", path: "/leads/pipeline" },
      { icon: BarChart2, label: "Meta Export", path: "/leads/meta-export" },
      { icon: BarChart3, label: "Reporting", path: "/leads/reporting" },
      { icon: CheckSquare, label: "Tasks", path: "/leads/tasks" },
      { icon: SettingsIcon, label: "Settings", path: "/leads/settings" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { icon: Sparkles, label: "Summary Generator", path: "/marketing/summary-generator" },
      { icon: Mic2, label: "Arabic Voice-over", path: "/marketing/voice-over" },
      { icon: GitCompare, label: "Program Comparison", path: "/marketing/program-comparison" },
      { icon: FileSignature, label: "Program Proposal", path: "/marketing/program-proposal" },
      { icon: Calendar, label: "Marketing Plan", path: "/marketing/marketing-plan" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/reports" },
    ],
  },
  {
    id: "waQc",
    label: "WhatsApp QC",
    icon: MessageSquare,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/wa-qc" },
      { icon: MessagesSquare, label: "Conversations", path: "/wa-qc/conversations" },
      { icon: Bot, label: "AI Query", path: "/wa-qc/ai-query" },
      { icon: Image, label: "Media", path: "/wa-qc/media" },
      { icon: SettingsIcon, label: "Settings", path: "/wa-qc/settings" },
    ],
  },
  {
    id: "aiCouncil",
    label: "CEO AI Council",
    icon: Bot,
    items: [
      { icon: Bot, label: "Council Cases", path: "/ai-council" },
    ],
  },
  {
    id: "backup",
    label: "Backup & Recovery",
    icon: HardDrive,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/backup" },
      { icon: Upload, label: "Preview & Restore", path: "/backup-preview" },
      { icon: Database, label: "Backup History", path: "/backup-history" },
    ],
  },
];

export function getVisibleMobileSidebarModules(moduleAccess?: Record<string, string>, isOwner = false) {
  return MOBILE_SIDEBAR_MODULES.filter((module) =>
    module.id !== "aiCouncil" || isOwner || moduleAccess?.aiCouncil !== "none"
  );
}

function getActiveTab(location: string): string {
  if (location === "/") return "home";
  if (location.startsWith("/finance")) return "finance";
  if (location.startsWith("/leads")) return "leads";
  if (location.startsWith("/contracting")) return "contracts";
  return "more";
}

function getActiveModuleId(location: string): string {
  if (location.startsWith("/analysis")) return "analysis";
  if (location.startsWith("/docs")) return "docs";
  if (location.startsWith("/finance")) return "financial";
  if (location.startsWith("/wa-qc")) return "waQc";
  if (location.startsWith("/leads")) return "leads";
  if (location.startsWith("/marketing")) return "marketing";
  if (location.startsWith("/reports")) return "reports";
  if (location.startsWith("/backup")) return "backup";
  if (location.startsWith("/ai-council")) return "aiCouncil";
  if (location.startsWith("/contracting")) return "contracting";
  return "";
}

function getPageName(location: string): string {
  if (location === "/") return "Dashboard";
  // Find the matching subpage label
  for (const mod of MOBILE_SIDEBAR_MODULES) {
    for (const item of mod.items) {
      if (item.path === location) return item.label;
    }
  }
  // Fallback to module name
  if (location.startsWith("/finance")) return "Financial";
  if (location.startsWith("/leads")) return "Leads";
  if (location.startsWith("/contracting")) return "Contracting";
  if (location.startsWith("/docs")) return "Client Docs";
  if (location.startsWith("/analysis")) return "Analysis";
  if (location.startsWith("/marketing")) return "Marketing";
  if (location.startsWith("/reports")) return "Reports";
  if (location.startsWith("/wa-qc")) return "WhatsApp QC";
  if (location.startsWith("/backup")) return "Backup";
  if (location.startsWith("/ai-council")) return "CEO AI Council";
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
  const [expandedModule, setExpandedModule] = useState<string>(getActiveModuleId(location));
  const { data: myPermissions } = trpc.permissions.getMyPermissions.useQuery(undefined, { enabled: !!user });
  const logoutMut = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  const activeTab = getActiveTab(location);
  const visibleSidebarModules = getVisibleMobileSidebarModules(
    myPermissions?.moduleAccess,
    Boolean(myPermissions?.isOwner)
  );

  // Sync expanded module with navigation
  useEffect(() => {
    setExpandedModule(getActiveModuleId(location));
  }, [location]);

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
      {/* Full Slide-out Sidebar with all modules and subpages */}
      {showSidebar && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={() => setShowSidebar(false)}>
          <div
            className="absolute top-0 left-0 bottom-0 w-[280px] bg-background border-r shadow-2xl animate-in slide-in-from-left duration-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sidebar Header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0">
              <img src="/manus-storage/elevay-logo_2c219cd3.png" alt="Elevay" className="h-9 w-auto object-contain" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">ELEVAY</p>
                <p className="text-[11px] text-muted-foreground">CRM System</p>
              </div>
              <button onClick={() => setShowSidebar(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sidebar Navigation — Scrollable */}
            <div className="flex-1 overflow-y-auto py-2">
              {visibleSidebarModules.map((mod) => {
                const ModIcon = mod.icon;
                const isExpanded = expandedModule === mod.id;
                const isActiveModule = getActiveModuleId(location) === mod.id;

                return (
                  <div key={mod.id} className="px-2 mb-0.5">
                    {/* Module Header */}
                    <button
                      onClick={() => setExpandedModule(isExpanded ? "" : mod.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                        isActiveModule ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground"
                      )}
                    >
                      <ModIcon className={cn("h-4.5 w-4.5 shrink-0", isActiveModule && "text-primary")} strokeWidth={isActiveModule ? 2.5 : 1.5} />
                      <span className={cn("flex-1 text-left text-[13px]", isActiveModule ? "font-semibold" : "font-medium")}>{mod.label}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                    </button>

                    {/* Subpages */}
                    {isExpanded && (
                      <div className="ml-4 pl-3 border-l border-border/50 mt-0.5 mb-1">
                        {mod.items.map((item) => {
                          const ItemIcon = item.icon;
                          const isActive = location === item.path;
                          return (
                            <button
                              key={item.path}
                              onClick={() => { setLocation(item.path); setShowSidebar(false); }}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors text-left",
                                isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <ItemIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={isActive ? 2.5 : 1.5} />
                              <span className="text-[12px]">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Extra links */}
              <div className="px-2 mt-3 pt-3 border-t border-border/50">
                <button
                  onClick={() => { setLocation("/admin/permissions"); setShowSidebar(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    location.startsWith("/admin") ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground"
                  )}
                >
                  <Shield className="h-4.5 w-4.5 shrink-0" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium">Admin & Security</span>
                </button>
                <button
                  onClick={() => { setLocation("/profile"); setShowSidebar(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    location.startsWith("/profile") ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground"
                  )}
                >
                  <User className="h-4.5 w-4.5 shrink-0" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium">Profile</span>
                </button>
              </div>
            </div>

            {/* Sidebar Footer */}
            {user && (
              <div className="border-t p-3 shrink-0">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{user.name?.charAt(0).toUpperCase() ?? "U"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => logoutMut.mutate()}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-destructive/10 transition-colors mt-1"
                >
                  <LogOut className="h-4 w-4 text-destructive" />
                  <span className="text-[13px] font-medium text-destructive">Sign Out</span>
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

      {/* More Menu Overlay (bottom sheet) */}
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
              {visibleSidebarModules.filter(i => !["contracting","financial","leads"].includes(i.id)).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setLocation(item.items[0].path); setShowMore(false); }}
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

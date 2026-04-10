import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  FileText,
  FolderOpen,
  FolderCheck,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Receipt,
  Search,
  ChevronRight,
  Stamp,
  Users,
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  TrendingUp,
  UserCheck,
  Layers,
  Upload,
  Database,
  DollarSign,
  MessageSquare,
  Home,
  Megaphone,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useMessaging } from "@/contexts/MessagingContext";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import BroadcastBanner from "./BroadcastBanner";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

// ─── Module colour map ───────────────────────────────────────────────────────
const MODULE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  contracting:  { bg: "bg-blue-500/20",   text: "text-blue-300",   dot: "bg-blue-400" },
  analysis:     { bg: "bg-purple-500/20", text: "text-purple-300", dot: "bg-purple-400" },
  docs:         { bg: "bg-emerald-500/20",text: "text-emerald-300",dot: "bg-emerald-400" },
  financial:    { bg: "bg-amber-500/20",  text: "text-amber-300",  dot: "bg-amber-400" },
};

// ─── Module Definitions ────────────────────────────────────────────────────────
const modules = [
  {
    id: "contracting",
    label: "Contracting",
    icon: FileText,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/contracting" },
      { icon: FileText, label: "Contracts", path: "/contracting/contracts" },
      { icon: Receipt, label: "Receipts", path: "/contracting/invoices" },
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
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 220;
const MAX_WIDTH = 400;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-3xl font-bold tracking-tight text-foreground font-serif">Elevay</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-center">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to the Elevay platform requires authentication.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { unreadMessages, activeBroadcasts } = useMessaging();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Determine active module from current path
  const activeModuleId = location.startsWith("/analysis") ? "analysis" : location.startsWith("/docs") ? "docs" : location.startsWith("/finance") ? "financial" : "contracting";
  const [expandedModule, setExpandedModule] = useState<string>(activeModuleId);

  // Sync expanded module with navigation
  useEffect(() => {
    setExpandedModule(activeModuleId);
  }, [activeModuleId]);

  // Active page label for mobile header
  const allItems = modules.flatMap(m => m.items);
  const activeItem = allItems.find(item => item.path === location) ?? allItems.find(item => location.startsWith(item.path) && item.path !== "/contracting");

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-border/50" disableTransition={isResizing}>
          {/* Header — Elevay branding */}
          <SidebarHeader className="h-16 justify-center border-b border-border/40">
            <div className="flex items-center gap-2 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/elevay-logo_9749d369.png"
                  alt="Elevay"
                  className="h-16 w-auto object-contain"
                />
              )}
              {isCollapsed && (
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663524211981/CjqhSqoCBRNxigxoNR3Jk2/elevay-logo_9749d369.png"
                  alt="Elevay"
                  className="h-12 w-12 object-contain"
                />
              )}
            </div>
          </SidebarHeader>

          {/* Navigation — grouped by module */}
          <SidebarContent className="gap-0 py-3">
            {modules.map((mod) => {
              const isExpanded = expandedModule === mod.id || isCollapsed;
              return (
                <div key={mod.id} className="mb-1">
                  {/* Module header (collapsible) */}
                  {!isCollapsed && (
                    <button
                      onClick={() => setExpandedModule(isExpanded && expandedModule === mod.id ? "" : mod.id)}
                      className={cn(
                        "flex items-center justify-between w-full px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
                        activeModuleId === mod.id
                          ? "text-white"
                          : "text-white/60 hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <mod.icon className="h-3.5 w-3.5" />
                        <span>{mod.label}</span>
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          isExpanded ? "rotate-90" : ""
                        )}
                      />
                    </button>
                  )}

                  {/* Module items */}
                  {(isExpanded || isCollapsed) && (
                    <SidebarMenu className="px-2">
                      {mod.items.map((item) => {
                        const isActive = location === item.path ||
                          (item.path !== "/contracting" && item.path !== "/analysis" && location.startsWith(item.path));
                        return (
                          <SidebarMenuItem key={item.path}>
                            <SidebarMenuButton
                              isActive={isActive}
                              onClick={() => setLocation(item.path)}
                              tooltip={item.label}
                              className={cn(
                                "h-9 transition-all",
                                isActive
                                  ? "bg-white/10 text-white font-bold"
                                  : "text-white/70 font-normal hover:text-white hover:bg-white/5"
                              )}
                            >
                              <item.icon className={cn("h-4 w-4", isActive ? "text-white" : "text-white/60")} />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  )}

                  {/* Separator between modules */}
                  {!isCollapsed && mod.id !== modules[modules.length - 1].id && (
                    <div className="mx-4 my-2 border-t border-border/30" />
                  )}
                </div>
              );
            })}
          </SidebarContent>

          {/* Footer — user profile */}
          <SidebarFooter className="p-3 border-t border-border/40">
            {/* Quick links: Home + Team Chat */}
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setLocation("/")}
                className={cn(
                  "flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                  location === "/"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )}
                title="Home"
              >
                <Home className="h-3.5 w-3.5 shrink-0" />
                {!isCollapsed && <span>Home</span>}
              </button>
              <button
                onClick={() => setLocation("/chat")}
                className={cn(
                  "flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                  location === "/chat"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )}
                title="Team Chat"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                {!isCollapsed && <span>Team Chat</span>}
                {unreadMessages > 0 && (
                  <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold shrink-0">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </button>
            </div>
            {/* Broadcast Center — admin only */}
            {user?.role === "admin" && (
              <button
                onClick={() => setLocation("/broadcast")}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors mb-2",
                  location === "/broadcast"
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-white/50 hover:text-amber-300 hover:bg-amber-500/10"
                )}
                title="Broadcast Center"
              >
                <Megaphone className="h-3.5 w-3.5 shrink-0" />
                {!isCollapsed && <span>Broadcast Center</span>}
              </button>
            )}
            {/* Active module badge (collapsed: dot only; expanded: full label) */}
            {(() => {
              const colors = MODULE_COLORS[activeModuleId] ?? MODULE_COLORS.contracting;
              const activeModule = modules.find(m => m.id === activeModuleId);
              return isCollapsed ? (
                <div className="flex justify-center mb-2">
                  <div className={cn("h-2 w-2 rounded-full", colors.dot)} title={activeModule?.label} />
                </div>
              ) : (
                <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 mb-2", colors.bg)}>
                  {activeModule && <activeModule.icon className={cn("h-3.5 w-3.5 shrink-0", colors.text)} />}
                  <span className={cn("text-xs font-semibold truncate", colors.text)}>{activeModule?.label}</span>
                </div>
              );
            })()}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="relative shrink-0">
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                        {user?.name?.charAt(0).toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    {/* Online indicator dot */}
                    <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar", MODULE_COLORS[activeModuleId]?.dot ?? "bg-green-400")} />
                  </div>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-none text-white">{user?.name || "—"}</p>
                      <p className="text-xs text-white/50 truncate mt-0.5">{user?.email || "—"}</p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={cn(
            "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors",
            isCollapsed && "hidden"
          )}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="font-medium text-sm">{activeItem?.label ?? "Elevay"}</span>
            </div>
            <span className="font-bold text-base font-serif text-primary">Elevay</span>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">
          <BroadcastBanner />
          {children}
        </main>
      </SidebarInset>
    </>
  );
}

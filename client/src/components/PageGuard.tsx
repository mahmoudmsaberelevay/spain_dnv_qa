/**
 * PageGuard — wraps a page and checks if the current user has permission.
 * Shows a 403 screen if access is denied, or a spinner while loading.
 */
import { usePermissions } from "@/contexts/PermissionsContext";
import { ShieldOff } from "lucide-react";
import { ReactNode } from "react";
import DashboardLayout from "./DashboardLayout";

interface PageGuardProps {
  pageKey: string;
  children: ReactNode;
}

export default function PageGuard({ pageKey, children }: PageGuardProps) {
  const { canAccess, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canAccess(pageKey)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-5 px-4">
          <div className="h-20 w-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <ShieldOff className="h-10 w-10 text-red-400" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
            <p className="text-white/50 text-sm leading-relaxed">
              You don't have permission to view this page. Please contact the platform owner to request access.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return <>{children}</>;
}

/**
 * MobileWrapper — Detects mobile viewport and wraps children with MobileLayout.
 * On desktop, renders children as-is (existing DashboardLayout handles desktop).
 * On mobile, wraps with MobileLayout (bottom tab bar + mobile header).
 */
import { useIsMobile } from "@/hooks/useMobile";
import MobileLayout from "./MobileLayout";

interface MobileWrapperProps {
  children: React.ReactNode;
  /** If true, skip the mobile layout wrapper (for pages that handle their own mobile UI) */
  skipMobileLayout?: boolean;
}

export default function MobileWrapper({ children, skipMobileLayout }: MobileWrapperProps) {
  const isMobile = useIsMobile();

  if (!isMobile || skipMobileLayout) {
    return <>{children}</>;
  }

  return <MobileLayout>{children}</MobileLayout>;
}

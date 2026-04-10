/**
 * PermissionsContext — loads the current user's page-level access map
 * and exposes a `canAccess(pageKey)` helper used by route guards.
 *
 * The owner always gets full access (isOwner = true from the backend).
 */
import { createContext, useContext, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

type PermissionsContextValue = {
  permissions: Record<string, boolean>;
  isOwner: boolean;
  isLoading: boolean;
  canAccess: (pageKey: string) => boolean;
};

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: {},
  isOwner: false,
  isLoading: true,
  canAccess: () => false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = trpc.permissions.getMyPermissions.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const permissions = data?.permissions ?? {};
  const isOwner = data?.isOwner ?? false;

  const canAccess = (pageKey: string): boolean => {
    if (isOwner) return true;
    return permissions[pageKey] === true;
  };

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        isOwner,
        isLoading: authLoading || isLoading,
        canAccess,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

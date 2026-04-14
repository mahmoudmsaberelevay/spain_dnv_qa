/**
 * PermissionsContext — loads the current user's page-level access map
 * and exposes canAccess / canEdit / canCreate helpers used by route guards and UI.
 *
 * The owner (super-admin) always gets full access + full edit.
 */
import { createContext, useContext, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

type PermissionsContextValue = {
  permissions: Record<string, boolean>;
  editPermissions: Record<string, boolean>;
  createPermissions: Record<string, boolean>;
  isOwner: boolean;
  isLoading: boolean;
  /** Can the user view this page at all? */
  canAccess: (pageKey: string) => boolean;
  /** Can the user edit/delete records on this page? */
  canEdit: (pageKey: string) => boolean;
  /** Can the user create new records on this page? */
  canCreate: (pageKey: string) => boolean;
};

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: {},
  editPermissions: {},
  createPermissions: {},
  isOwner: false,
  isLoading: true,
  canAccess: () => false,
  canEdit: () => false,
  canCreate: () => false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = trpc.permissions.getMyPermissions.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const permissions = data?.permissions ?? {};
  const editPermissions = data?.editPermissions ?? {};
  const createPermissions = data?.createPermissions ?? {};
  const isOwner = data?.isOwner ?? false;

  const canAccess = (pageKey: string): boolean => {
    if (isOwner) return true;
    return permissions[pageKey] === true;
  };

  const canEdit = (pageKey: string): boolean => {
    if (isOwner) return true;
    return editPermissions[pageKey] === true;
  };

  const canCreate = (pageKey: string): boolean => {
    if (isOwner) return true;
    return createPermissions[pageKey] === true;
  };

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        editPermissions,
        createPermissions,
        isOwner,
        isLoading: authLoading || isLoading,
        canAccess,
        canEdit,
        canCreate,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

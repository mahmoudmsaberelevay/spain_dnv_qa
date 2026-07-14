import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ModuleType = "contracting" | "clientDocs" | "appAnalysis" | "financial" | "marketing" | "leads" | "waQc" | "reports";
type AccessLevel = "none" | "level1" | "full";

const MODULES: { id: ModuleType; label: string; description: string }[] = [
  { id: "contracting", label: "Contracting", description: "Manage contracts and receipts" },
  { id: "clientDocs", label: "Client Documentation", description: "Track documents and submissions" },
  { id: "appAnalysis", label: "Application Analysis", description: "AI-powered visa application QA" },
  { id: "financial", label: "Financial", description: "Income, expenses, and accounting" },
  { id: "reports", label: "Reports", description: "Financial, attestation, visa, and paralegal reports" },
  { id: "marketing", label: "Marketing", description: "Program summaries and content" },
  { id: "leads", label: "Leads", description: "Lead management and pipeline" },
  { id: "waQc", label: "WhatsApp QC", description: "WhatsApp message monitoring" },
];

export function AdminPermissionsPanel() {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [permissions, setPermissions] = useState<Record<ModuleType, AccessLevel>>({
    contracting: "none",
    clientDocs: "none",
    appAnalysis: "none",
    financial: "none",
    marketing: "none",
    leads: "none",
    waQc: "none",
    reports: "none",
  });
  const [newPassword, setNewPassword] = useState<string>("");
  const [showPasswordReset, setShowPasswordReset] = useState<boolean>(false);

  const { data: users } = trpc.system.getAllUsers.useQuery();
  const { data: currentPermissions } = trpc.system.getUserPermissions.useQuery(
    { userId: parseInt(selectedUserId) },
    { enabled: !!selectedUserId }
  );
  const updatePermissions = trpc.system.updateUserPermissions.useMutation();
  const resetPassword = trpc.system.resetUserPassword.useMutation();

  // Load permissions when user is selected
  useEffect(() => {
    if (currentPermissions) {
      const perms: Record<ModuleType, AccessLevel> = {
        contracting: "none",
        clientDocs: "none",
        appAnalysis: "none",
        financial: "none",
        marketing: "none",
        leads: "none",
        waQc: "none",
        reports: "none",
      };
      currentPermissions.forEach((p) => {
        perms[p.module as ModuleType] = p.accessLevel as AccessLevel;
      });
      setPermissions(perms);
    }
  }, [currentPermissions]);

  const handlePermissionChange = (module: ModuleType, level: AccessLevel) => {
    setPermissions((prev) => ({ ...prev, [module]: level }));
  };

  const handleSave = async () => {
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }

    try {
      await updatePermissions.mutateAsync({
        userId: parseInt(selectedUserId),
        permissions: Object.entries(permissions).map(([module, accessLevel]) => ({
          module: module as ModuleType,
          accessLevel: accessLevel as AccessLevel,
        })),
      });
      toast.success("Permissions updated successfully");
    } catch (error) {
      toast.error("Failed to update permissions");
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      await resetPassword.mutateAsync({
        userId: parseInt(selectedUserId),
        newPassword,
      });
      toast.success("Password reset successfully");
      setNewPassword("");
      setShowPasswordReset(false);
    } catch (error) {
      toast.error("Failed to reset password");
    }
  };

  const selectedUser = users?.find((u) => u.id === parseInt(selectedUserId));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Permissions Manager</CardTitle>
          <CardDescription>Manage access levels for each user and module</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User Selection */}
          <div className="space-y-2">
            <Label htmlFor="user-select">Select User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="user-select">
                <SelectValue placeholder="Choose a user..." />
              </SelectTrigger>
              <SelectContent>
                {users?.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUserId && (
            <>
              {/* Permissions Grid */}
              <div className="space-y-4">
                <h3 className="font-semibold">Module Access Levels</h3>
                <div className="grid gap-4">
                  {MODULES.map((module) => (
                    <Card key={module.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{module.label}</h4>
                          <p className="text-sm text-gray-500">{module.description}</p>
                        </div>
                        <div className="flex gap-2">
                          {module.id === "waQc" ? (
                            // WhatsApp QC: only Full or None
                            <>
                              <Button
                                variant={permissions[module.id] === "none" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePermissionChange(module.id, "none")}
                              >
                                None
                              </Button>
                              <Button
                                variant={permissions[module.id] === "full" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePermissionChange(module.id, "full")}
                              >
                                Full
                              </Button>
                            </>
                          ) : module.id === "financial" ? (
                            // Financial: None, Level 1, Full
                            <>
                              <Button
                                variant={permissions[module.id] === "none" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePermissionChange(module.id, "none")}
                              >
                                None
                              </Button>
                              <Button
                                variant={permissions[module.id] === "level1" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePermissionChange(module.id, "level1")}
                              >
                                Level 1
                              </Button>
                              <Button
                                variant={permissions[module.id] === "full" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePermissionChange(module.id, "full")}
                              >
                                Full
                              </Button>
                            </>
                          ) : (
                            // Other modules: Full or None
                            <>
                              <Button
                                variant={permissions[module.id] === "none" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePermissionChange(module.id, "none")}
                              >
                                None
                              </Button>
                              <Button
                                variant={permissions[module.id] === "full" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePermissionChange(module.id, "full")}
                              >
                                Full
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {module.id === "financial" && permissions[module.id] === "level1" && (
                        <div className="mt-2 text-xs text-gray-600 bg-blue-50 p-2 rounded">
                          ✓ Can create expense/income, view accounts, expenses, income, upcoming payments, client database
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>

              {/* Save Permissions Button */}
              <Button
                onClick={handleSave}
                disabled={updatePermissions.isPending}
                className="w-full"
              >
                {updatePermissions.isPending ? "Saving..." : "Save Permissions"}
              </Button>

              {/* Password Reset Section */}
              <div className="border-t pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Reset Password</h3>
                      <p className="text-sm text-gray-500">Set a new password for {selectedUser?.name}</p>
                    </div>
                    <Button
                      variant={showPasswordReset ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => {
                        setShowPasswordReset(!showPasswordReset);
                        setNewPassword("");
                      }}
                    >
                      {showPasswordReset ? "Cancel" : "Reset Password"}
                    </Button>
                  </div>

                  {showPasswordReset && (
                    <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New Password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          placeholder="Enter new password (min 6 characters)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={handleResetPassword}
                        disabled={resetPassword.isPending || !newPassword || newPassword.length < 6}
                        className="w-full"
                        variant="destructive"
                      >
                        {resetPassword.isPending ? "Resetting..." : "Confirm Reset Password"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

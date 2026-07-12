import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { User, Lock, Mail, Shield } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  const changePasswordMutation = trpc.system.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to change password");
    },
  });

  const handleChangePassword = () => {
    if (!oldPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (oldPassword === newPassword) {
      toast.error("New password must be different from current password");
      return;
    }

    changePasswordMutation.mutate({
      oldPassword,
      newPassword,
    });
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
            <p className="text-sm text-muted-foreground">Manage your account settings</p>
          </div>
        </div>

        {/* User Information Card */}
        <div className="p-6 bg-card rounded-lg border border-border space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Account Information
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Full Name</Label>
              <div className="p-3 bg-muted/40 rounded-lg border border-border">
                <p className="text-sm font-medium text-foreground">{user.name || "Not set"}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Email Address</Label>
              <div className="p-3 bg-muted/40 rounded-lg border border-border flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{user.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">User Role</Label>
              <div className="p-3 bg-muted/40 rounded-lg border border-border">
                <p className="text-sm font-medium text-foreground capitalize">{user.role || "User"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="p-6 bg-card rounded-lg border border-border space-y-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Change Password
          </h2>

          <div className="space-y-4">
            {/* Current Password */}
            <div className="space-y-2">
              <Label htmlFor="current-password" className="text-sm font-medium">Current Password</Label>
              <Input
                id="current-password"
                type={showPasswords ? "text" : "password"}
                placeholder="Enter your current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                className="text-sm"
              />
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium">New Password</Label>
              <Input
                id="new-password"
                type={showPasswords ? "text" : "password"}
                placeholder="Enter new password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                className="text-sm"
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type={showPasswords ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                className="text-sm"
              />
            </div>

            {/* Show Passwords Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="show-passwords"
                checked={showPasswords}
                onChange={(e) => setShowPasswords(e.target.checked)}
                className="rounded border border-input"
              />
              <Label htmlFor="show-passwords" className="text-xs font-medium cursor-pointer">Show passwords</Label>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
            <p className="text-xs font-semibold text-foreground">Password Requirements:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>✓ At least 6 characters long</li>
              <li>✓ Different from your current password</li>
              <li>✓ Passwords must match</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setOldPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              disabled={changePasswordMutation.isPending}
            >
              Clear
            </Button>
            <Button
              className="flex-1"
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending || !oldPassword || !newPassword || !confirmPassword}
            >
              {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </div>

        {/* Security Tips */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">🔒 Security Tips:</p>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Use a strong password with a mix of letters, numbers, and symbols</li>
            <li>• Never share your password with anyone</li>
            <li>• Change your password regularly for better security</li>
            <li>• If you suspect unauthorized access, change your password immediately</li>
          </ul>
        </div>
      </div>
    );
  }

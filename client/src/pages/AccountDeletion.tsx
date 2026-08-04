/**
 * AccountDeletion — Public account deletion request page.
 * Accessible without login for Apple App Store compliance.
 */
import { Link } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, Trash2 } from "lucide-react";

export default function AccountDeletion() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitDeletion = trpc.support.submitDeletionRequest.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Deletion request submitted successfully.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email) {
      toast.error("Please fill in your name and email address.");
      return;
    }
    if (!confirmed) {
      toast.error("Please confirm that you understand the consequences of account deletion.");
      return;
    }
    submitDeletion.mutate({ fullName, email, phone, reason });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <img src="/manus-storage/elevay-logo_2c219cd3.png" alt="ELEVAY" className="h-8" />
              <span className="font-semibold text-[#1A3A5C] text-lg">ELEVAY</span>
            </div>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link href="/privacy-policy" className="hover:text-[#1A3A5C]">Privacy</Link>
            <Link href="/support" className="hover:text-[#1A3A5C]">Support</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="w-8 h-8 text-red-500" />
          <h1 className="text-3xl font-bold text-[#1A3A5C]">Account Deletion</h1>
        </div>
        <p className="text-gray-600 mb-8">Request permanent deletion of your ELEVAY account and personal data.</p>

        {/* What happens section */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-800 mb-2">What happens when you delete your account</h3>
              <div className="text-sm text-amber-700 space-y-2">
                <p><strong>Permanently deleted:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Your login credentials and profile information</li>
                  <li>Your personal preferences and settings</li>
                  <li>Your notification history</li>
                  <li>Your session data and access tokens</li>
                </ul>
                <p className="mt-3"><strong>May be retained for legal/business purposes (up to 7 years):</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Financial transaction records (required by accounting regulations)</li>
                  <li>Contract records you created (business continuity)</li>
                  <li>Audit logs of your actions (security compliance)</li>
                  <li>Client records you managed (business operations)</li>
                </ul>
                <p className="mt-3 text-xs">
                  Retained data will be anonymized where possible. For full details, see our{" "}
                  <Link href="/privacy-policy" className="underline">Privacy Policy</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-8">
          <h3 className="font-semibold text-[#1A3A5C] mb-3">Deletion Process Timeline</h3>
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex items-start gap-3">
              <span className="bg-[#5BA3B8] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">1</span>
              <span>Submit your deletion request (this form)</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-[#5BA3B8] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">2</span>
              <span>Identity verification via email confirmation (within 24 hours)</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-[#5BA3B8] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">3</span>
              <span>Review and processing by our team (within 7 business days)</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-[#5BA3B8] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">4</span>
              <span>Deletion completed and confirmation email sent (within 30 days)</span>
            </div>
          </div>
        </div>

        {/* Form */}
        {submitted ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">Deletion Request Received</h3>
            <p className="text-green-700 mb-2">
              We've received your account deletion request. You will receive a verification email at{" "}
              <strong>{email}</strong> within 24 hours.
            </p>
            <p className="text-sm text-green-600">
              If you change your mind, you can cancel the request by contacting{" "}
              <a href="mailto:support@elevay.com" className="underline">support@elevay.com</a>{" "}
              before processing begins.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 bg-gray-50 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-2">Deletion Request Form</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please provide the information associated with your ELEVAY account. We will verify your identity before processing.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name as registered" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email associated with your account" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number (optional)</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="For verification purposes" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Deletion (optional)</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Help us understand why you're leaving..."
                rows={3}
              />
            </div>

            <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4">
              <input
                type="checkbox"
                id="confirm-deletion"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-300"
              />
              <label htmlFor="confirm-deletion" className="text-sm text-gray-700 cursor-pointer">
                I understand that account deletion is permanent and that my personal data will be removed. 
                I acknowledge that certain business and legal records may be retained as described above.
              </label>
            </div>

            <Button
              type="submit"
              disabled={submitDeletion.isPending || !confirmed}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {submitDeletion.isPending ? "Submitting..." : "Submit Deletion Request"}
            </Button>

            <p className="text-xs text-gray-500 text-center">
              Alternatively, if you are logged in, you can delete your account from Profile → Account Settings → Delete Account.
            </p>
          </form>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} ELEVAY. All rights reserved.</p>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/privacy-policy" className="hover:text-[#1A3A5C]">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[#1A3A5C]">Terms & Conditions</Link>
            <Link href="/support" className="hover:text-[#1A3A5C]">Support</Link>
            <Link href="/account-deletion" className="hover:text-[#1A3A5C] font-medium">Account Deletion</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

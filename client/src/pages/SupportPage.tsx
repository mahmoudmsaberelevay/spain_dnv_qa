/**
 * SupportPage — Public support page with contact form and FAQ.
 * Accessible without login for Apple App Store compliance.
 */
import { Link } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Mail, MessageSquare, Shield } from "lucide-react";

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-800">{question}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {open && <div className="px-4 pb-4 text-gray-600 text-sm leading-relaxed">{answer}</div>}
    </div>
  );
}

export default function SupportPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitTicket = trpc.support.submitTicket.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Support request submitted successfully!");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !subject || !description) {
      toast.error("Please fill in all required fields.");
      return;
    }
    submitTicket.mutate({ name, email, category, subject, description });
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
            <Link href="/terms" className="hover:text-[#1A3A5C]">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-[#1A3A5C] mb-2">Support Center</h1>
        <p className="text-gray-600 mb-10">Get help with your ELEVAY account or report an issue.</p>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-blue-50 rounded-lg p-5 text-center">
            <Mail className="w-8 h-8 text-[#5BA3B8] mx-auto mb-3" />
            <h3 className="font-semibold text-[#1A3A5C] mb-1">Email Support</h3>
            <p className="text-sm text-gray-600">support@elevay.com</p>
          </div>
          <div className="bg-green-50 rounded-lg p-5 text-center">
            <MessageSquare className="w-8 h-8 text-green-600 mx-auto mb-3" />
            <h3 className="font-semibold text-[#1A3A5C] mb-1">Response Time</h3>
            <p className="text-sm text-gray-600">Within 48 hours</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-5 text-center">
            <Shield className="w-8 h-8 text-purple-600 mx-auto mb-3" />
            <h3 className="font-semibold text-[#1A3A5C] mb-1">Data Requests</h3>
            <p className="text-sm text-gray-600">
              <Link href="/account-deletion" className="underline">Account Deletion</Link>
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[#1A3A5C] mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            <FAQItem
              question="How do I reset my password?"
              answer="Click 'Forgot Password' on the login page and enter your registered email address. You'll receive a password reset link within a few minutes. If you don't receive it, check your spam folder or contact support."
            />
            <FAQItem
              question="How do I delete my account?"
              answer="You can delete your account from within the app (Profile → Account Settings → Delete Account) or by submitting a request through our Account Deletion page. Your personal data will be permanently removed within 30 days."
            />
            <FAQItem
              question="What data do you collect?"
              answer="We collect account information (name, email), business data you enter (clients, contracts, documents), and technical data (IP address, device info). See our Privacy Policy for full details."
            />
            <FAQItem
              question="Can I export my data?"
              answer="Yes. You can request a copy of your personal data by contacting support@elevay.com. We will provide your data in a portable format within 30 days."
            />
            <FAQItem
              question="Who has access to my information?"
              answer="Only authorized ELEVAY team members with appropriate permissions can access data within the system. Access is controlled through role-based permissions managed by administrators."
            />
            <FAQItem
              question="Is my data secure?"
              answer="Yes. We use HTTPS encryption for all data in transit, AES-256 encryption for backups, secure password hashing, and role-based access controls. See our Privacy Policy for more details."
            />
          </div>
        </section>

        {/* Contact Form */}
        <section>
          <h2 className="text-2xl font-semibold text-[#1A3A5C] mb-4">Submit a Support Request</h2>
          
          {submitted ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <div className="text-green-600 text-4xl mb-3">✓</div>
              <h3 className="text-lg font-semibold text-green-800 mb-2">Request Submitted</h3>
              <p className="text-green-700">
                Thank you! We've received your support request and will respond within 48 hours to the email address you provided.
              </p>
              <Button
                onClick={() => { setSubmitted(false); setName(""); setEmail(""); setSubject(""); setDescription(""); }}
                variant="outline"
                className="mt-4"
              >
                Submit Another Request
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 bg-gray-50 rounded-lg p-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="login_issue">Login Issue</SelectItem>
                    <SelectItem value="technical_bug">Technical Bug</SelectItem>
                    <SelectItem value="account_deletion">Account Deletion</SelectItem>
                    <SelectItem value="feature_request">Feature Request</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="general">General Inquiry</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief description of your issue" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please describe your issue in detail..."
                  rows={5}
                  required
                />
              </div>
              <Button type="submit" disabled={submitTicket.isPending} className="w-full sm:w-auto bg-[#1A3A5C] hover:bg-[#1A3A5C]/90">
                {submitTicket.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} ELEVAY. All rights reserved.</p>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/privacy-policy" className="hover:text-[#1A3A5C]">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[#1A3A5C]">Terms & Conditions</Link>
            <Link href="/support" className="hover:text-[#1A3A5C] font-medium">Support</Link>
            <Link href="/account-deletion" className="hover:text-[#1A3A5C]">Account Deletion</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

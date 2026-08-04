/**
 * TermsConditions — Public Terms & Conditions page accessible without login.
 */
import { Link } from "wouter";

export default function TermsConditions() {
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

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-[#1A3A5C] mb-2">Terms and Conditions</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: August 4, 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              By accessing or using the ELEVAY application and services ("Service"), you agree to be bound by these 
              Terms and Conditions. If you do not agree to these terms, you may not access or use the Service. 
              These terms apply to all users, including team members, administrators, and any person who accesses 
              the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">2. User Eligibility</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is intended for use by authorized employees and team members of ELEVAY and its affiliated 
              organizations. You must be at least 18 years of age to use this Service. By using the Service, you 
              represent that you have the legal capacity to enter into a binding agreement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">3. Account Responsibilities</h2>
            <p className="text-gray-700 leading-relaxed">
              You are responsible for maintaining the confidentiality of your account credentials and for all 
              activities that occur under your account. You must immediately notify ELEVAY of any unauthorized 
              use of your account or any other breach of security. ELEVAY will not be liable for any loss arising 
              from unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">4. Acceptable Use</h2>
            <p className="text-gray-700 leading-relaxed mb-3">You agree to use the Service only for its intended business purposes. You shall not:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Upload malicious code, viruses, or harmful content</li>
              <li>Share your login credentials with unauthorized persons</li>
              <li>Use the Service to collect or store personal data in violation of applicable laws</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">5. Prohibited Activities</h2>
            <p className="text-gray-700 leading-relaxed">
              Users are prohibited from using the Service to engage in fraudulent activities, money laundering, 
              identity theft, or any activity that violates applicable laws and regulations. Any violation may 
              result in immediate termination of access and potential legal action.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">6. User-Provided Content</h2>
            <p className="text-gray-700 leading-relaxed">
              You retain ownership of any content, documents, and data you upload to the Service. By uploading 
              content, you grant ELEVAY a limited license to store, process, and display the content as necessary 
              to provide the Service. You are responsible for ensuring that any content you upload does not 
              infringe on third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">7. Company Workspace Ownership</h2>
            <p className="text-gray-700 leading-relaxed">
              The ELEVAY workspace and all business data within it are owned by ELEVAY. Individual user accounts 
              provide access to the workspace but do not confer ownership of business data. Administrators may 
              manage user access, roles, and permissions within the workspace.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">8. Intellectual Property Rights</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service, including its design, code, features, and documentation, is the intellectual property 
              of ELEVAY. You may not copy, modify, distribute, or create derivative works based on the Service 
              without prior written consent. The ELEVAY name, logo, and branding are trademarks of ELEVAY.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">9. Service Availability</h2>
            <p className="text-gray-700 leading-relaxed">
              We strive to maintain high availability of the Service but do not guarantee uninterrupted access. 
              The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond 
              our control. We will make reasonable efforts to notify users of planned downtime.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">10. Account Suspension and Termination</h2>
            <p className="text-gray-700 leading-relaxed">
              ELEVAY reserves the right to suspend or terminate your account if you violate these Terms, 
              engage in prohibited activities, or if your employment or authorization is revoked. Upon 
              termination, your access to the Service will be immediately revoked.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">11. Account Deletion</h2>
            <p className="text-gray-700 leading-relaxed">
              You may request deletion of your personal account at any time through the application or via 
              our <Link href="/account-deletion" className="text-[#5BA3B8] underline">account deletion page</Link>. 
              Upon deletion, your personal profile and access will be removed. Business records associated 
              with your activities may be retained for legal and accounting purposes as described in our{" "}
              <Link href="/privacy-policy" className="text-[#5BA3B8] underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">12. Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Your use of the Service is also governed by our{" "}
              <Link href="/privacy-policy" className="text-[#5BA3B8] underline">Privacy Policy</Link>, 
              which describes how we collect, use, and protect your information. By using the Service, 
              you consent to the collection and use of information as described in the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">13. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed">
              To the maximum extent permitted by law, ELEVAY shall not be liable for any indirect, incidental, 
              special, consequential, or punitive damages arising from your use of the Service. Our total 
              liability shall not exceed the amount paid by you, if any, for access to the Service during 
              the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">14. Changes to Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify these Terms at any time. Changes will be posted on this page 
              with an updated effective date. Continued use of the Service after changes constitutes 
              acceptance of the modified Terms. We will notify users of material changes via email or 
              in-app notification.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">15. Governing Law</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the Arab Republic 
              of Egypt. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction 
              of the courts of Cairo, Egypt.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">16. Contact Information</h2>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 text-gray-700">
              <p><strong>ELEVAY</strong></p>
              <p>Citizenship & Residency Consultation</p>
              <p>Email: <a href="mailto:support@elevay.com" className="text-[#5BA3B8] underline">support@elevay.com</a></p>
              <p>Website: <a href="https://elevay.vip" className="text-[#5BA3B8] underline">elevay.vip</a></p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} ELEVAY. All rights reserved.</p>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/privacy-policy" className="hover:text-[#1A3A5C]">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[#1A3A5C] font-medium">Terms & Conditions</Link>
            <Link href="/support" className="hover:text-[#1A3A5C]">Support</Link>
            <Link href="/account-deletion" className="hover:text-[#1A3A5C]">Account Deletion</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

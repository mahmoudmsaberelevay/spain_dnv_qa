/**
 * PrivacyPolicy — Public page accessible without login.
 * Meets Apple App Store requirements for user privacy disclosure.
 */
import { Link } from "wouter";

export default function PrivacyPolicy() {
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
            <Link href="/terms" className="hover:text-[#1A3A5C]">Terms</Link>
            <Link href="/support" className="hover:text-[#1A3A5C]">Support</Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-[#1A3A5C] mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: August 4, 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              ELEVAY ("we," "us," or "our") operates the ELEVAY CRM application and website at elevay.vip. 
              This Privacy Policy explains how we collect, use, store, and protect your personal information 
              when you use our services. ELEVAY provides citizenship and residency consultation services, 
              and our CRM system is used internally by our team to manage client relationships, documentation, 
              contracts, and financial records.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">2. Information We Collect</h2>
            
            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.1 Account Information</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Full name</li>
              <li>Email address</li>
              <li>Username and login credentials (passwords are securely hashed)</li>
              <li>User role and account permissions</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.2 Business Information</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Customer and client records (names, contact details, application details)</li>
              <li>Uploaded documents and files (passports, contracts, certificates)</li>
              <li>Notes, secure client-folder chat messages, message attachments, tasks, and activity records</li>
              <li>Voice notes and automated transcripts when a user chooses to record audio in Client Documentation Chat</li>
              <li>Chat delivery, read, listened, typing, mute, and notification-preference metadata</li>
              <li>Sales and financial information entered by users</li>
              <li>Contract and invoice data</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.3 Technical Information</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Device information (device type, operating system)</li>
              <li>IP address</li>
              <li>Browser and operating system information</li>
              <li>Login history and timestamps</li>
              <li>Usage and activity logs</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">2.4 Communication Data</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Notification preferences</li>
              <li>Device push tokens used to deliver privacy-safe service alerts; chat notification previews do not include message content</li>
              <li>Support requests and correspondence</li>
            </ul>
          </section>

          {/* Purpose of Collection */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">3. Why We Collect Information</h2>
            <p className="text-gray-700 leading-relaxed mb-3">We collect and process your information for the following purposes:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>To provide and maintain our CRM services</li>
              <li>To authenticate users and manage access permissions</li>
              <li>To process and manage client applications for citizenship and residency programs</li>
              <li>To generate contracts, invoices, and financial reports</li>
              <li>To send notifications, reminders, and service communications</li>
              <li>To synchronize secure two-way communication between a client and authorized ELEVAY employees inside the assigned Client Documentation folder</li>
              <li>To transcribe voice notes and provide bilingual transcript assistance when that feature is used</li>
              <li>To improve our services and user experience</li>
              <li>To comply with legal and regulatory obligations</li>
              <li>To detect and prevent security threats</li>
            </ul>
          </section>

          {/* How We Use Information */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">4. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed">
              Your information is used solely for the operation of the ELEVAY CRM system. We use it to 
              manage client documentation workflows, generate contracts and invoices, track application 
              progress, manage financial records, and facilitate secure communication between clients and authorized team members. We do not
              sell, rent, or trade your personal information to third parties for marketing purposes.
            </p>
          </section>

          {/* Data Storage and Security */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">5. Data Storage and Security</h2>
            <p className="text-gray-700 leading-relaxed mb-3">We implement industry-standard security measures to protect your data:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>All data is transmitted over encrypted HTTPS connections</li>
              <li>Passwords are securely hashed using industry-standard algorithms</li>
              <li>Database backups are encrypted with AES-256 encryption</li>
              <li>Role-based access control restricts data access to authorized personnel</li>
              <li>Files are stored in secure cloud storage (Amazon S3) with access controls</li>
              <li>Client chat access is bound to the assigned documentation folder and authorized employee participation, with audit logging</li>
              <li>Regular security audits and activity logging are maintained</li>
              <li>Session management with secure, HTTP-only cookies</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">6. Third-Party Services</h2>
            <p className="text-gray-700 leading-relaxed mb-3">We use the following third-party services in the operation of our platform:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li><strong>Google Drive</strong> — for document storage and synchronization</li>
              <li><strong>Amazon S3</strong> — for secure file storage</li>
              <li><strong>Email services (Gmail SMTP)</strong> — for sending notifications and reminders</li>
              <li><strong>WhatsApp Business API</strong> — for client communication</li>
              <li><strong>Analytics services</strong> — for understanding platform usage (anonymized)</li>
              <li><strong>Speech transcription and translation services</strong> — only when a user sends a voice note and a transcript is generated</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              Each third-party service processes data in accordance with their own privacy policies. 
              We only share the minimum information necessary for each service to function.
            </p>
          </section>

          {/* Cookies and Analytics */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">7. Cookies and Analytics</h2>
            <p className="text-gray-700 leading-relaxed">
              We use essential cookies to maintain your login session and preferences. These cookies are 
              necessary for the application to function and cannot be disabled. We use analytics tools 
              to understand how our platform is used, which helps us improve the service. Analytics data 
              is collected in an anonymized form and does not identify individual users.
            </p>
          </section>

          {/* User Rights */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">8. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-3">You have the following rights regarding your personal data:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li><strong>Access</strong> — Request a copy of the personal data we hold about you</li>
              <li><strong>Correction</strong> — Request correction of inaccurate or incomplete data</li>
              <li><strong>Export</strong> — Request your data in a portable format</li>
              <li><strong>Deletion</strong> — Request deletion of your personal account data</li>
              <li><strong>Restriction</strong> — Request restriction of processing in certain circumstances</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-3">
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:support@elevay.com" className="text-[#5BA3B8] underline">support@elevay.com</a>{" "}
              or use the account deletion feature within the application.
            </p>
          </section>

          {/* Account Deletion */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">9. Account Deletion</h2>
            <p className="text-gray-700 leading-relaxed">
              You may delete your account at any time through the application (Profile → Account Settings → Delete Account) 
              or by submitting a request through our{" "}
              <Link href="/account-deletion" className="text-[#5BA3B8] underline">account deletion page</Link>.
              Upon deletion, your personal profile data and access will be permanently removed. 
              Certain business, transaction, security, accounting, or legal records may be retained 
              where required by law or for legitimate business purposes, as detailed in the deletion process.
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">10. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed">
              We retain your personal data for as long as your account is active or as needed to provide 
              our services. After account deletion, we may retain certain records for up to 7 years where 
              required for legal, accounting, or regulatory compliance purposes. Anonymized usage data may 
              be retained indefinitely for analytical purposes.
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">11. Children's Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Our services are not directed to individuals under the age of 18. We do not knowingly 
              collect personal information from children. If we become aware that we have collected 
              personal data from a child, we will take steps to delete that information.
            </p>
          </section>

          {/* Changes to Policy */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">12. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify users of any material 
              changes by posting the new policy on this page and updating the "Last updated" date. 
              Continued use of our services after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-semibold text-[#1A3A5C] mb-3">13. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:
            </p>
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
            <Link href="/privacy-policy" className="hover:text-[#1A3A5C] font-medium">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-[#1A3A5C]">Terms & Conditions</Link>
            <Link href="/support" className="hover:text-[#1A3A5C]">Support</Link>
            <Link href="/account-deletion" className="hover:text-[#1A3A5C]">Account Deletion</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

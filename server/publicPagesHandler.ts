/**
 * Server-rendered public pages (Privacy Policy, Terms, Support, Account Deletion)
 * These pages are rendered as full HTML by the server so they work regardless
 * of client-side JS bundle caching. No authentication required.
 */
import { Express, Request, Response } from "express";

const LOGO_URL = "https://manus-storage.oss-cn-beijing.aliyuncs.com/elevay-logo_2c219cd3.png";

function pageShell(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ELEVAY</title>
  <meta name="description" content="${title} for ELEVAY Citizenship & Residency Consultation">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a2a3a; line-height: 1.7; background: #f8fafb; }
    .header { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 16px 24px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 10; }
    .header img { height: 32px; }
    .header .brand { font-size: 18px; font-weight: 700; color: #1A3A5C; text-decoration: none; }
    .header nav { margin-left: auto; display: flex; gap: 16px; }
    .header nav a { color: #5BA3B8; text-decoration: none; font-size: 14px; font-weight: 500; }
    .header nav a:hover { text-decoration: underline; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 24px 80px; }
    h1 { font-size: 28px; font-weight: 700; color: #1A3A5C; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 600; color: #1A3A5C; margin-top: 32px; margin-bottom: 12px; }
    h3 { font-size: 16px; font-weight: 600; color: #2a4a6a; margin-top: 20px; margin-bottom: 8px; }
    p { margin-bottom: 12px; color: #374151; }
    ul { margin: 8px 0 16px 24px; }
    li { margin-bottom: 6px; color: #374151; }
    .updated { font-size: 14px; color: #6b7280; margin-bottom: 24px; }
    a { color: #5BA3B8; }
    .footer { background: #1A3A5C; color: #fff; padding: 32px 24px; text-align: center; margin-top: 60px; }
    .footer a { color: #5BA3B8; margin: 0 12px; text-decoration: none; font-size: 14px; }
    .footer p { color: #94a3b8; font-size: 13px; margin-top: 12px; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 6px; color: #1A3A5C; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; font-family: inherit; }
    .form-group textarea { min-height: 120px; resize: vertical; }
    .btn { background: #5BA3B8; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; display: inline-block; text-decoration: none; }
    .btn:hover { background: #4a8fa1; }
    .btn-danger { background: #dc2626; }
    .btn-danger:hover { background: #b91c1c; }
    .info-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .warning-box { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .faq { margin-top: 32px; }
    .faq details { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; padding: 12px 16px; background: #fff; }
    .faq summary { font-weight: 500; cursor: pointer; color: #1A3A5C; }
    .faq details p { margin-top: 8px; }
    @media (max-width: 640px) { .container { padding: 24px 16px 60px; } h1 { font-size: 24px; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${LOGO_URL}" alt="ELEVAY Logo">
    <a href="/" class="brand">ELEVAY</a>
    <nav>
      <a href="/terms">Terms</a>
      <a href="/support">Support</a>
    </nav>
  </div>
  <div class="container">
    ${content}
  </div>
  <div class="footer">
    <a href="/privacy-policy">Privacy Policy</a>
    <a href="/terms">Terms & Conditions</a>
    <a href="/support">Support</a>
    <a href="/account-deletion">Account Deletion</a>
    <p>&copy; ${new Date().getFullYear()} ELEVAY. All rights reserved.</p>
  </div>
</body>
</html>`;
}

const privacyContent = `
<h1>Privacy Policy</h1>
<p class="updated">Last updated: August 4, 2026</p>

<h2>1. Introduction</h2>
<p>ELEVAY ("we," "us," or "our") operates the ELEVAY CRM application and website at elevay.vip. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our services. ELEVAY provides citizenship and residency consultation services, and our CRM system is used internally by our team to manage client relationships, documentation, contracts, and financial records.</p>

<h2>2. Information We Collect</h2>
<h3>2.1 Account Information</h3>
<ul>
  <li>Full name</li>
  <li>Email address</li>
  <li>Username and login credentials (passwords are securely hashed)</li>
  <li>User role and account permissions</li>
</ul>
<h3>2.2 Business Information</h3>
<ul>
  <li>Customer and client records (names, contact details, application details)</li>
  <li>Uploaded documents and files (passports, contracts, certificates)</li>
  <li>Notes, messages, tasks, and activity records</li>
  <li>Sales and financial information entered by users</li>
  <li>Contract and invoice data</li>
</ul>
<h3>2.3 Technical Information</h3>
<ul>
  <li>Device information (device type, operating system)</li>
  <li>IP address</li>
  <li>Browser and operating system information</li>
  <li>Login history and timestamps</li>
  <li>Usage and activity logs</li>
</ul>
<h3>2.4 Communication Data</h3>
<ul>
  <li>Notification preferences</li>
  <li>Support requests and correspondence</li>
</ul>

<h2>3. Why We Collect Information</h2>
<p>We collect and process your information for the following purposes:</p>
<ul>
  <li>To provide and maintain our CRM services</li>
  <li>To authenticate users and manage access permissions</li>
  <li>To process and manage client applications for citizenship and residency programs</li>
  <li>To generate contracts, invoices, and financial reports</li>
  <li>To send notifications, reminders, and service communications</li>
  <li>To improve our services and user experience</li>
  <li>To comply with legal and regulatory obligations</li>
  <li>To detect and prevent security threats</li>
</ul>

<h2>4. How We Use Your Information</h2>
<p>Your information is used solely for the operation of the ELEVAY CRM system. We use it to manage client documentation workflows, generate contracts and invoices, track application progress, manage financial records, and facilitate internal team communication. We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>

<h2>5. Data Storage and Security</h2>
<p>We implement industry-standard security measures to protect your data:</p>
<ul>
  <li>All data is transmitted over encrypted HTTPS connections</li>
  <li>Passwords are securely hashed using industry-standard algorithms</li>
  <li>Database backups are encrypted with AES-256 encryption</li>
  <li>Role-based access control restricts data access to authorized personnel</li>
  <li>Files are stored in secure cloud storage (Amazon S3) with access controls</li>
  <li>Regular security audits and activity logging are maintained</li>
  <li>Session management with secure, HTTP-only cookies</li>
</ul>

<h2>6. Third-Party Services</h2>
<p>We use the following third-party services in the operation of our platform:</p>
<ul>
  <li><strong>Google Drive</strong> — for document storage and synchronization</li>
  <li><strong>Amazon S3</strong> — for secure file storage</li>
  <li><strong>Email services (Gmail SMTP)</strong> — for sending notifications and reminders</li>
  <li><strong>WhatsApp Business API</strong> — for client communication</li>
  <li><strong>Analytics services</strong> — for understanding platform usage (anonymized)</li>
</ul>
<p>Each third-party service processes data in accordance with their own privacy policies. We only share the minimum information necessary for each service to function.</p>

<h2>7. Cookies and Analytics</h2>
<p>We use essential cookies to maintain your login session and preferences. These cookies are necessary for the application to function and cannot be disabled. We use analytics tools to understand how our platform is used, which helps us improve the service. Analytics data is collected in an anonymized form and does not identify individual users.</p>

<h2>8. Your Rights</h2>
<p>You have the following rights regarding your personal data:</p>
<ul>
  <li><strong>Access</strong> — Request a copy of the personal data we hold about you</li>
  <li><strong>Correction</strong> — Request correction of inaccurate or incomplete data</li>
  <li><strong>Export</strong> — Request your data in a portable format</li>
  <li><strong>Deletion</strong> — Request deletion of your personal account data</li>
  <li><strong>Restriction</strong> — Request restriction of processing in certain circumstances</li>
</ul>
<p>To exercise any of these rights, please contact us at <a href="mailto:support@elevay.com">support@elevay.com</a> or use the account deletion feature within the application.</p>

<h2>9. Account Deletion</h2>
<p>You may delete your account at any time through the application (Profile → Account Settings → Delete Account) or by submitting a request through our <a href="/account-deletion">account deletion page</a>. Upon deletion, your personal profile data and access will be permanently removed. Certain business, transaction, security, accounting, or legal records may be retained where required by law or for legitimate business purposes, as detailed in our Account Deletion page.</p>

<h2>10. Data Retention</h2>
<p>We retain your personal data only for as long as necessary to fulfill the purposes described in this policy. Account data is retained while your account is active. Upon account deletion or termination, personal data is removed within 30 days, except where retention is required by law (e.g., financial records for tax/audit compliance).</p>

<h2>11. Children's Privacy</h2>
<p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child, we will take steps to delete it promptly.</p>

<h2>12. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify users of any material changes by posting the new policy on this page and updating the "Last updated" date. Your continued use of the service after changes constitutes acceptance of the updated policy.</p>

<h2>13. Contact Us</h2>
<p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
<ul>
  <li><strong>Email:</strong> <a href="mailto:support@elevay.com">support@elevay.com</a></li>
  <li><strong>Website:</strong> <a href="https://elevay.vip">elevay.vip</a></li>
  <li><strong>Company:</strong> ELEVAY — Citizenship & Residency Consultation</li>
</ul>
`;

const termsContent = `
<h1>Terms & Conditions</h1>
<p class="updated">Last updated: August 4, 2026</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing or using the ELEVAY CRM application ("Service"), you agree to be bound by these Terms & Conditions. If you do not agree to these terms, you may not use the Service. The Service is provided by ELEVAY, a citizenship and residency consultation company established in 1998.</p>

<h2>2. Description of Service</h2>
<p>ELEVAY provides a CRM (Customer Relationship Management) application used internally by our team to manage client relationships, documentation, contracts, financial records, and application workflows for citizenship and residency programs. The Service is intended for authorized team members only.</p>

<h2>3. User Accounts</h2>
<ul>
  <li>You must be an authorized team member to create an account</li>
  <li>You are responsible for maintaining the confidentiality of your login credentials</li>
  <li>You must notify us immediately of any unauthorized use of your account</li>
  <li>You may not share your account credentials with others</li>
  <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
</ul>

<h2>4. Acceptable Use</h2>
<p>You agree to use the Service only for its intended purpose and in compliance with all applicable laws. You may not:</p>
<ul>
  <li>Use the Service for any unlawful purpose</li>
  <li>Attempt to gain unauthorized access to any part of the Service</li>
  <li>Interfere with or disrupt the Service or its infrastructure</li>
  <li>Upload malicious code, viruses, or harmful content</li>
  <li>Share confidential client data outside the platform without authorization</li>
  <li>Use the Service to harass, abuse, or harm others</li>
</ul>

<h2>5. Data and Content</h2>
<p>All client data, documents, contracts, and business records entered into the Service remain the property of ELEVAY. Users acknowledge that data entered into the system is business data belonging to the company. Personal account data (profile, credentials) belongs to the individual user and can be deleted upon request.</p>

<h2>6. Confidentiality</h2>
<p>All information accessed through the Service is confidential. Users must not disclose client information, business data, or internal communications to unauthorized parties. This obligation survives termination of your account.</p>

<h2>7. Intellectual Property</h2>
<p>The Service, including its design, code, features, and branding, is the intellectual property of ELEVAY. Users may not copy, modify, distribute, or create derivative works based on the Service without written permission.</p>

<h2>8. Service Availability</h2>
<p>We strive to maintain high availability but do not guarantee uninterrupted access. We may perform maintenance, updates, or modifications that temporarily affect availability. We are not liable for any loss resulting from service interruptions.</p>

<h2>9. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, ELEVAY shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. Our total liability shall not exceed the amount paid by you (if any) for access to the Service in the 12 months preceding the claim.</p>

<h2>10. Termination</h2>
<p>We may terminate or suspend your access to the Service at any time, with or without cause, with or without notice. Upon termination, your right to use the Service ceases immediately. You may request deletion of your personal account data as described in our Privacy Policy.</p>

<h2>11. Changes to Terms</h2>
<p>We reserve the right to modify these Terms at any time. We will notify users of material changes by posting the updated terms on this page. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

<h2>12. Governing Law</h2>
<p>These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising from these Terms or the Service shall be resolved through good-faith negotiation first, and if necessary, through binding arbitration.</p>

<h2>13. Contact</h2>
<p>For questions about these Terms, please contact us at <a href="mailto:support@elevay.com">support@elevay.com</a>.</p>
`;

const supportContent = `
<h1>Support</h1>
<p>Need help? We're here to assist you. Choose from the options below or submit a support request.</p>

<div class="info-box">
  <p><strong>Email:</strong> <a href="mailto:support@elevay.com">support@elevay.com</a></p>
  <p><strong>Response Time:</strong> Within 24-48 business hours</p>
</div>

<h2>Submit a Support Request</h2>
<form action="/api/trpc/support.submitTicket" method="POST" id="supportForm" onsubmit="submitSupport(event)">
  <div class="form-group">
    <label for="name">Your Name *</label>
    <input type="text" id="name" name="name" required>
  </div>
  <div class="form-group">
    <label for="email">Email Address *</label>
    <input type="email" id="email" name="email" required>
  </div>
  <div class="form-group">
    <label for="category">Category *</label>
    <select id="category" name="category" required>
      <option value="">Select a category...</option>
      <option value="account">Account & Login Issues</option>
      <option value="technical">Technical Problem</option>
      <option value="data">Data & Privacy</option>
      <option value="feature">Feature Request</option>
      <option value="billing">Billing & Payments</option>
      <option value="other">Other</option>
    </select>
  </div>
  <div class="form-group">
    <label for="subject">Subject *</label>
    <input type="text" id="subject" name="subject" required>
  </div>
  <div class="form-group">
    <label for="description">Description *</label>
    <textarea id="description" name="description" placeholder="Please describe your issue in detail..." required></textarea>
  </div>
  <button type="submit" class="btn">Submit Request</button>
</form>
<div id="successMsg" style="display:none; margin-top:16px;" class="info-box">
  <p><strong>Thank you!</strong> Your support request has been submitted. We'll respond within 24-48 business hours.</p>
</div>

<div class="faq">
  <h2>Frequently Asked Questions</h2>
  <details>
    <summary>How do I reset my password?</summary>
    <p>Go to the login page and click "Forgot Password". Enter your email address and follow the instructions sent to your inbox.</p>
  </details>
  <details>
    <summary>How do I delete my account?</summary>
    <p>You can request account deletion through our <a href="/account-deletion">Account Deletion page</a> or from within the app (Profile → Account Settings → Delete Account).</p>
  </details>
  <details>
    <summary>How do I export my data?</summary>
    <p>Contact us at support@elevay.com to request a data export. We'll provide your personal data in a portable format within 30 days.</p>
  </details>
  <details>
    <summary>I can't access a module. What should I do?</summary>
    <p>Module access is managed by your administrator. Contact your team leader or submit a support request to have your permissions updated.</p>
  </details>
  <details>
    <summary>How long does account deletion take?</summary>
    <p>Account deletion requests are processed within 30 days. You'll receive email confirmation once completed.</p>
  </details>
</div>

<script>
function submitSupport(e) {
  e.preventDefault();
  const form = document.getElementById('supportForm');
  const data = {
    name: form.name.value,
    email: form.email.value,
    category: form.category.value,
    subject: form.subject.value,
    description: form.description.value
  };
  fetch('/api/trpc/support.submitTicket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: data })
  }).then(r => {
    if (r.ok) {
      form.style.display = 'none';
      document.getElementById('successMsg').style.display = 'block';
    } else {
      alert('Failed to submit. Please email support@elevay.com directly.');
    }
  }).catch(() => {
    alert('Failed to submit. Please email support@elevay.com directly.');
  });
}
</script>
`;

const accountDeletionContent = `
<h1>Account Deletion</h1>
<p>You can request permanent deletion of your ELEVAY account and associated personal data using the form below or from within the application.</p>

<div class="warning-box">
  <p><strong>Important:</strong> Account deletion is permanent and cannot be undone. Please read the information below carefully before submitting your request.</p>
</div>

<h2>What Gets Deleted</h2>
<ul>
  <li>Your user profile and login credentials</li>
  <li>Your personal preferences and settings</li>
  <li>Your notification history</li>
  <li>Your session and authentication data</li>
</ul>

<h2>What May Be Retained</h2>
<p>Certain records may be retained where required by law or for legitimate business purposes:</p>
<ul>
  <li><strong>Financial records</strong> — invoices, receipts, and transaction records (required for tax/audit compliance, retained for 7 years)</li>
  <li><strong>Contract records</strong> — signed contracts and agreements (retained for legal compliance)</li>
  <li><strong>Audit logs</strong> — security and access logs (retained for 1 year)</li>
  <li><strong>Client application records</strong> — where you processed client applications, anonymized records may be retained</li>
</ul>

<h2>Deletion Timeline</h2>
<div class="info-box">
  <p><strong>Processing:</strong> Within 30 days of request submission</p>
  <p><strong>Verification:</strong> We may contact you to verify your identity</p>
  <p><strong>Confirmation:</strong> You'll receive email confirmation once deletion is complete</p>
</div>

<h2>Request Account Deletion</h2>
<form id="deletionForm" onsubmit="submitDeletion(event)">
  <div class="form-group">
    <label for="fullName">Full Name (as registered) *</label>
    <input type="text" id="fullName" name="fullName" required>
  </div>
  <div class="form-group">
    <label for="delEmail">Email Address (account email) *</label>
    <input type="email" id="delEmail" name="email" required>
  </div>
  <div class="form-group">
    <label for="phone">Phone Number (for verification)</label>
    <input type="tel" id="phone" name="phone">
  </div>
  <div class="form-group">
    <label for="reason">Reason for Deletion</label>
    <select id="reason" name="reason">
      <option value="">Select a reason (optional)...</option>
      <option value="no_longer_needed">No longer need the account</option>
      <option value="privacy_concerns">Privacy concerns</option>
      <option value="leaving_company">Leaving the company</option>
      <option value="other">Other</option>
    </select>
  </div>
  <div class="form-group">
    <label>
      <input type="checkbox" id="confirm" required>
      I understand that account deletion is permanent and cannot be undone
    </label>
  </div>
  <button type="submit" class="btn btn-danger">Request Account Deletion</button>
</form>
<div id="delSuccessMsg" style="display:none; margin-top:16px;" class="info-box">
  <p><strong>Request Submitted.</strong> Your account deletion request has been received. We'll process it within 30 days and send confirmation to your email.</p>
</div>

<script>
function submitDeletion(e) {
  e.preventDefault();
  const form = document.getElementById('deletionForm');
  const data = {
    fullName: form.fullName.value,
    email: form.delEmail.value,
    phone: form.phone.value || null,
    reason: form.reason.value || 'not_specified'
  };
  fetch('/api/trpc/support.requestDeletion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: data })
  }).then(r => {
    if (r.ok) {
      form.style.display = 'none';
      document.getElementById('delSuccessMsg').style.display = 'block';
    } else {
      alert('Failed to submit. Please email support@elevay.com with your deletion request.');
    }
  }).catch(() => {
    alert('Failed to submit. Please email support@elevay.com with your deletion request.');
  });
}
</script>

<h2>Alternative Methods</h2>
<p>You can also request account deletion by:</p>
<ul>
  <li><strong>In-app:</strong> Profile → Account Settings → Delete Account</li>
  <li><strong>Email:</strong> Send a request to <a href="mailto:support@elevay.com">support@elevay.com</a> with subject "Account Deletion Request"</li>
</ul>
`;

export function registerPublicPages(app: Express) {
  // These routes return full server-rendered HTML — no JS bundle needed
  app.get("/privacy-policy", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(pageShell("Privacy Policy", privacyContent));
  });

  app.get("/terms", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(pageShell("Terms & Conditions", termsContent));
  });

  app.get("/support", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(pageShell("Support", supportContent));
  });

  app.get("/account-deletion", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(pageShell("Account Deletion", accountDeletionContent));
  });
}

import type { Express, Request, Response } from "express";

const UPDATED = "7 September 2026";
const SUPPORT_EMAIL = "support@elevay.com";
const COMPANY = "ELEVAY — Citizenship & Residency Consultation";

function shell(title: string, description: string, content: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — ELEVAY Client</title>
  <meta name="description" content="${description}" />
  <style>
    :root{--navy:#1A3A5C;--teal:#5BA3B8;--ink:#24384A;--muted:#66788A;--line:#DCE6EC;--pale:#EAF5F7;--white:#fff;--red:#B52A2A}
    *{box-sizing:border-box}body{margin:0;background:#F6FAFC;color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    header{position:sticky;top:0;z-index:2;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);padding:14px 22px}
    .bar{max-width:880px;margin:auto;display:flex;align-items:center;gap:14px}.brand{color:var(--navy);font-weight:900;text-decoration:none}.tag{color:var(--teal);font-size:13px;font-weight:700}
    nav{margin-left:auto;display:flex;gap:14px;flex-wrap:wrap}nav a{font-size:13px;color:var(--navy);font-weight:700;text-decoration:none}
    main{max-width:880px;margin:0 auto;padding:44px 22px 70px}.hero{background:linear-gradient(135deg,var(--navy),#244F70);color:white;padding:30px;border-radius:24px;margin-bottom:28px}
    .hero h1{color:white;margin:0 0 7px}.hero p{color:#D8EBF0;margin:0}.updated{font-size:13px;color:var(--muted);margin-bottom:22px}
    h1{font-size:32px;line-height:1.2;color:var(--navy)}h2{font-size:21px;color:var(--navy);margin-top:34px}h3{font-size:16px;color:var(--navy);margin-top:22px}
    p,li{color:var(--ink)}a{color:#347F94}.card{background:white;border:1px solid var(--line);border-radius:18px;padding:20px;margin:18px 0}.note{background:var(--pale);border-left:4px solid var(--teal);padding:16px 18px;border-radius:12px}.warning{background:#FFF4F2;border-left:4px solid var(--red);padding:16px 18px;border-radius:12px}
    .button{display:inline-block;background:var(--navy);color:white;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:12px;margin:6px 8px 6px 0}.button.alt{background:var(--teal)}
    footer{background:var(--navy);color:white;padding:28px 22px;text-align:center}footer a{color:#BFE1E8;margin:0 8px;font-size:13px}footer p{color:#C8D6E0;font-size:12px}
    @media(max-width:660px){nav{display:none}main{padding-top:24px}.hero{padding:22px}h1{font-size:27px}}
  </style>
</head>
<body>
<header><div class="bar"><a class="brand" href="https://elevay.com">ELEVAY Client</a><span class="tag">Your clear path to global mobility</span><nav><a href="/client-app/privacy">Privacy</a><a href="/client-app/terms">Terms</a><a href="/client-app/support">Support</a><a href="/client-app/account-deletion">Delete account</a></nav></div></header>
<main>${content}</main>
<footer><a href="/client-app/privacy">Privacy Policy</a><a href="/client-app/terms">Terms of Use</a><a href="/client-app/support">Support</a><a href="/client-app/account-deletion">Account Deletion</a><p>© ${new Date().getFullYear()} ${COMPANY}. All rights reserved.</p></footer>
</body></html>`;
}

const privacy = `
<section class="hero"><h1>ELEVAY Client Privacy Policy</h1><p>How we collect, use, protect, retain, and delete information in the ELEVAY Client mobile application.</p></section>
<p class="updated">Last updated: ${UPDATED}</p>
<div class="note"><strong>Plain-language summary.</strong> Guests can browse program and service-provider information without an account. Signed ELEVAY clients use an account created by our team to view only their assigned application folders and submit documents. We do not sell personal information, show advertising, or track users for advertising.</div>
<h2>1. Scope and controller</h2>
<p>This policy applies to the ELEVAY Client iOS and Android application and its client-facing services at elevay.vip. ${COMPANY} controls the information described here. The internal ELEVAY CRM is used by authorized staff to provide client services and is not available to ordinary client accounts.</p>
<h2>2. Information we collect</h2>
<h3>Guest access</h3><ul><li>Public program and service-provider content requested by the app.</li><li>Limited technical request data, such as IP address, operating system, app version, and security logs needed to deliver and protect the service.</li></ul>
<h3>Client account and application data</h3><ul><li>Name, username, email address, optional mobile number, language, account identifiers, and assigned ELEVAY team members.</li><li>Application identifiers, program/folder name, status, milestones, dates, checklist status, and applicant or authorized family-member names connected to the case.</li><li>Documents and content that the client intentionally submits, including scans, photographs, PDFs, filenames, document type, comments, and review status. Immigration records may contain government identifiers, nationality, date of birth, address, family information, financial information, or other sensitive information.</li><li>Authentication and security information, including a one-way password hash, session identifiers, device/platform details, sign-in history, failed login attempts, push token if notifications are enabled, and audit records.</li><li>Support, password-recovery, and account-deletion requests.</li></ul>
<h2>3. How information is collected</h2><p>Information is provided by ELEVAY staff when they create and connect a client account, by the client when they sign in or submit a document, and automatically in limited security and operational logs. The camera opens only after the client chooses <strong>Scan to PDF</strong>. A system file picker is available as an alternative. Notification permission is requested only when the client chooses to enable application alerts.</p>
<h2>4. Why we use information</h2><ul><li>Authenticate the client and restrict access to folders assigned to that account.</li><li>Display application progress and documentation requirements.</li><li>Receive, store, review, and respond to client-submitted documents.</li><li>Send requested service and status notifications.</li><li>Provide support, investigate problems, prevent unauthorized access, and maintain auditability.</li><li>Meet contractual, legal, regulatory, accounting, and security obligations.</li></ul>
<h2>5. Sharing and service providers</h2><p>Authorized ELEVAY staff and consultants may access information only as needed to provide the client’s service. We use contracted infrastructure providers for application hosting, databases, encrypted document storage, transactional email, and optional push delivery. These providers process information on ELEVAY’s instructions and for the service purposes described here. We may disclose information where required by law, to protect rights or security, or with the client’s direction or consent.</p><p>We do not sell personal information, share it with data brokers, or use client documents for third-party advertising, cross-app tracking, or marketing profiles.</p>
<h2>6. Camera, files, and notifications</h2><p>Camera access is used only for the document-scanning action initiated by the client. The app does not require broad access to the photo library to browse public content. The system Files picker lets the client choose a specific file. Push notifications are optional, are not required to use the application, and should contain only a minimal service alert rather than confidential document content.</p>
<h2>7. Security</h2><p>We use encrypted HTTPS transport, one-way password hashing, rotating and revocable sessions, role and folder ownership checks, rate limits, audit logging, restricted document access, and time-limited document links. No security method can eliminate every risk; clients should protect their credentials and report suspected unauthorized access promptly.</p>
<h2>8. Retention</h2><p>Account and case information is kept only as long as necessary to provide the service and meet legal, contractual, regulatory, security, and dispute-resolution obligations. Active sessions expire or can be revoked. Submitted immigration and contractual records may need to be retained after portal access ends where law, a contract, or a legitimate legal claim requires it. Access remains restricted during any retention period.</p>
<h2>9. Account deletion and privacy choices</h2><p>A signed-in client can initiate deletion inside the app: open <strong>Home or My Applications → person icon → Account &amp; Legal → Request account deletion</strong>. ELEVAY may verify identity, will process the request within 30 days, and will confirm completion. Portal credentials, sessions, notification tokens, and personal account preferences will be removed or anonymized. Client-submitted content will be deleted unless a documented legal, contractual, regulatory, security, or dispute-related obligation requires limited retention. The client may also use the public <a href="/client-app/account-deletion">account deletion page</a> or email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
<h2>10. Rights</h2><p>Subject to applicable law, clients may request access, correction, export, restriction, objection, or deletion of personal information. Contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. We may verify identity before acting on a request.</p>
<h2>11. Children and dependants</h2><p>The app is intended for adults and is not directed to children. A client may submit documents for a child or dependent only when legally authorized to do so as part of an immigration application.</p>
<h2>12. Changes and contact</h2><p>We may update this policy when the service or legal requirements change. The current version and update date will remain available at this URL.</p><div class="card"><strong>Privacy contact</strong><br><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a><br><a href="https://elevay.com">https://elevay.com</a><br>${COMPANY}</div>`;

const terms = `
<section class="hero"><h1>ELEVAY Client Terms of Use</h1><p>Terms for public guests and clients using the ELEVAY Client application.</p></section>
<p class="updated">Last updated: ${UPDATED}</p>
<h2>1. Acceptance</h2><p>By using ELEVAY Client, you agree to these Terms and the <a href="/client-app/privacy">Privacy Policy</a>. If you do not agree, do not use the application.</p>
<h2>2. The service</h2><p>Guests can read general information about residence- and citizenship-by-investment programs and browse service-provider listings. Signed ELEVAY clients can access folders assigned to their account, review application and checklist status, and submit documents for ELEVAY’s review. The application does not sell digital subscriptions or accept payments.</p>
<h2>3. No government affiliation or guarantee</h2><p>ELEVAY is an independent consultancy and is not a government agency. Program information is general and may change. It is not a government decision, legal guarantee, or promise of approval. Immigration authorities and other third parties make all final decisions. Clients should rely on their signed engagement terms and current advice from their assigned ELEVAY team.</p>
<h2>4. Accounts and authorization</h2><ul><li>Client accounts are created and assigned by authorized ELEVAY staff; public guest browsing does not require an account.</li><li>You must provide accurate information, protect your credentials, and notify ELEVAY of suspected unauthorized access.</li><li>You may access only applications and folders assigned to you.</li><li>You may submit another person’s or a dependent’s documents only when you have lawful authority and any required consent.</li><li>ELEVAY may suspend access to protect the client, the service, or other users.</li></ul>
<h2>5. Documents and permitted use</h2><p>You retain rights you hold in content you submit. You authorize ELEVAY and its contracted processors to store, review, transmit, and use that content only to provide the requested service, protect the platform, and meet legal obligations. Do not submit malicious, unlawful, infringing, misleading, or unauthorized content.</p>
<h2>6. Independent service providers</h2><p>Provider listings are informational. Unless expressly stated in a signed agreement, listed lawyers, accountants, or other providers are independent from ELEVAY. You are responsible for evaluating and agreeing to any separate provider engagement.</p>
<h2>7. Availability and updates</h2><p>We work to keep the service available and accurate, but maintenance, internet conditions, government changes, or third-party services may affect availability or timing. Application status in the app is an operational update and may not represent a final official authority decision until confirmed by ELEVAY.</p>
<h2>8. Privacy and deletion</h2><p>Our <a href="/client-app/privacy">Privacy Policy</a> explains data handling. A signed-in client can initiate account deletion through Account &amp; Legal. Deletion and any lawful retention are described on the <a href="/client-app/account-deletion">Account Deletion</a> page.</p>
<h2>9. Intellectual property</h2><p>The application, ELEVAY branding, and ELEVAY-created content are protected by applicable intellectual-property laws. You may use the app only for personal access to the service and may not copy, reverse engineer, disrupt, or misuse it except where applicable law expressly permits.</p>
<h2>10. Liability and mandatory rights</h2><p>To the extent permitted by applicable law, ELEVAY is not liable for indirect or consequential loss caused by service interruption, unauthorized use outside our reasonable control, or decisions made by governments or independent providers. Nothing in these Terms excludes rights or liability that cannot legally be excluded.</p>
<h2>11. Contact</h2><div class="card"><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a><br><a href="https://elevay.com">https://elevay.com</a><br>${COMPANY}</div>`;

const support = `
<section class="hero"><h1>ELEVAY Client Support</h1><p>Help with client access, applications, document uploads, scanning, and privacy requests.</p></section>
<div class="card"><h2 style="margin-top:0">Contact ELEVAY</h2><p>Email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p><p>Website: <a href="https://elevay.com/contact-us/">https://elevay.com/contact-us/</a></p><p>Target response: within 1–2 business days.</p><a class="button" href="mailto:${SUPPORT_EMAIL}?subject=ELEVAY%20Client%20Support">Email Support</a></div>
<h2>Common questions</h2>
<div class="card"><h3>How do I sign in?</h3><p>Use the username and temporary password created by your ELEVAY team. The first sign-in may require you to choose a new password.</p><h3>I forgot my password</h3><p>Choose <strong>Forgot password?</strong> on the sign-in screen and enter the email assigned to the account, or contact ELEVAY.</p><h3>Why can’t I see an application?</h3><p>Only Client Documentation folders explicitly assigned to your account appear in My Applications. Ask your ELEVAY consultant to confirm the assignment.</p><h3>The scanner is unavailable</h3><p>Scanning uses Apple’s native document scanner on a supported iPhone development or App Store build. You can always choose a PDF or image through the system file picker instead. Camera permission is requested only when you choose Scan.</p><h3>Notifications are disabled</h3><p>Application alerts are optional. Open Account &amp; Legal and choose Enable application alerts. You can also change permission later in iPhone Settings.</p><h3>How do I delete my account?</h3><p>Open Home or My Applications, select the person icon, then choose Account &amp; Legal → Request account deletion. See the <a href="/client-app/account-deletion">deletion page</a> for details.</p></div>`;

const deletion = `
<section class="hero"><h1>ELEVAY Client Account Deletion</h1><p>How to initiate deletion of your client-app account and understand any required retention.</p></section>
<p class="updated">Last updated: ${UPDATED}</p>
<div class="warning"><strong>Deletion is permanent.</strong> After completion, your ELEVAY Client credentials and access cannot be restored. A new account must be created by ELEVAY if service access is needed later.</div>
<h2>Initiate deletion in the app</h2><ol><li>Sign in to ELEVAY Client.</li><li>Open <strong>Home</strong> or <strong>My Applications</strong>.</li><li>Tap the person icon at the top.</li><li>Open <strong>Account &amp; Legal</strong>.</li><li>Choose <strong>Request account deletion</strong> and confirm.</li></ol>
<p>This initiates the deletion process without requiring a phone call or separate support request. If you cannot sign in, email <a href="mailto:${SUPPORT_EMAIL}?subject=ELEVAY%20Client%20Account%20Deletion">${SUPPORT_EMAIL}</a> from the account email address.</p>
<h2>What will be removed</h2><ul><li>Client-app username, password hash, active sessions, device tokens, and notification preferences.</li><li>Personal portal profile and access associations.</li><li>Client-app notifications and other portal-only data that is no longer required.</li><li>Client-submitted files and comments unless retention is legally or contractually required.</li></ul>
<h2>What may be retained</h2><p>Immigration case, contractual, financial, fraud-prevention, security, dispute, or regulatory records may be retained where applicable law, a binding contract, or a legal claim requires it. Retained records remain access-restricted and are not used for advertising. ELEVAY can explain the applicable basis and period when responding to the request.</p>
<h2>Timing and verification</h2><p>ELEVAY may verify identity to protect the client from an unauthorized deletion request. We aim to complete verified requests within 30 days and send confirmation to the registered email address. If a lawful retention requirement applies, the confirmation will explain it.</p>
<div class="card"><h2 style="margin-top:0">Need help?</h2><p><a href="mailto:${SUPPORT_EMAIL}?subject=ELEVAY%20Client%20Account%20Deletion">${SUPPORT_EMAIL}</a></p><a class="button alt" href="/client-app/privacy">Read the Privacy Policy</a><a class="button" href="/client-app/support">Get Support</a></div>`;

function send(res: Response, title: string, description: string, content: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(shell(title, description, content));
}

export function registerClientAppPublicPages(app: Express) {
  app.get("/client-app/privacy", (_req: Request, res: Response) => send(res, "Privacy Policy", "Privacy policy for the ELEVAY Client mobile application", privacy));
  app.get("/client-app/terms", (_req: Request, res: Response) => send(res, "Terms of Use", "Terms of use for the ELEVAY Client mobile application", terms));
  app.get("/client-app/support", (_req: Request, res: Response) => send(res, "Support", "Support for the ELEVAY Client mobile application", support));
  app.get("/client-app/account-deletion", (_req: Request, res: Response) => send(res, "Account Deletion", "How to delete an ELEVAY Client account", deletion));
}

# Apple App Store Review — ELEVAY CRM

## App Information

- **App Name:** ELEVAY
- **Bundle ID:** com.elevay.crm
- **App URL:** https://elevay.vip
- **Category:** Business / Productivity
- **Content Rating:** 4+

---

## Demo Account Credentials

Use the following credentials to log in and test the app:

| Field | Value |
|-------|-------|
| **Email** | apple.review@elevay.com |
| **Password** | AppleReview2026! |
| **Login Method** | Email & Password |
| **Login URL** | https://elevay.vip/login |

### What the Demo Account Can Access

The demo account has **full access** to all modules:
- Financial Dashboard & Client Management
- Leads CRM (Pipeline, Tasks, Reporting)
- Contracting (Contracts, Invoices, Proforma)
- Client Documentation
- Application Analysis
- Marketing Plan Generator

---

## Key Features to Review

### 1. Mobile Experience (PWA)
- Open https://elevay.vip on a mobile device
- The app automatically shows a mobile-optimized interface with bottom tab navigation
- Can be installed via "Add to Home Screen" (Safari/Chrome)

### 2. Account Deletion (Guideline 5.1.1)
- **Public page:** https://elevay.vip/account-deletion
  - Accessible without login
  - Shows what data is deleted vs retained
  - Shows the deletion timeline (30 days max)
  - Form to submit deletion request
- **In-app:** Profile → Account Settings → Delete Account (when logged in)

### 3. Privacy Policy (Guideline 5.1.2)
- **URL:** https://elevay.vip/privacy-policy
- Covers: data collection, usage, storage, sharing, retention, user rights
- GDPR and CCPA compliant

### 4. Terms & Conditions
- **URL:** https://elevay.vip/terms

### 5. Support / Contact
- **URL:** https://elevay.vip/support
- **Email:** support@elevay.com
- Form-based ticket submission (no login required)

---

## Data Handling & Privacy

### Data Collected
- Name, email, phone (for account creation)
- Business data entered by users (contracts, financial records, leads)
- Usage analytics (anonymized)

### Data Storage
- All data stored on encrypted servers (TiDB Cloud, AWS S3)
- AES-256 encryption for backups
- SSL/TLS for all data in transit

### Data Deletion Process
1. User submits deletion request (public form or in-app)
2. Identity verification via email (within 24 hours)
3. Review and processing (within 7 business days)
4. Deletion completed (within 30 days)
5. Confirmation email sent

### Data Retained After Deletion (Legal Requirements)
- Financial transaction records (7 years — accounting regulations)
- Contract records (business continuity)
- Audit logs (security compliance)
- All retained data is anonymized where possible

---

## Technical Architecture

- **Frontend:** React 19 + Tailwind CSS 4 (PWA)
- **Backend:** Node.js + Express + tRPC
- **Database:** TiDB (MySQL-compatible)
- **Storage:** AWS S3
- **Authentication:** OAuth 2.0 + Email/Password
- **Hosting:** Cloud Run (autoscale)

---

## App Review Notes

1. This is an **internal business tool** — only authorized team members can create accounts (restricted to @elevay.com domain + specific exemptions)
2. The demo account above is pre-configured with sample data for review purposes
3. No in-app purchases or subscriptions
4. No user-generated content visible to other users
5. No third-party advertising
6. Push notifications are used only for business alerts (new leads, payment reminders)

---

## Contact for Review Issues

If you encounter any issues during review:
- **Email:** support@elevay.com
- **Phone:** +20 1000000000
- **Response time:** Within 4 hours during business hours (Cairo time, GMT+2)

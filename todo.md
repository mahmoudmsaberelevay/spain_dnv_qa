# Spain DNV QA System — TODO

## Database & Backend
- [x] Define schema: cases, documents, analysis_results tables
- [x] Generate and apply migration SQL
- [x] Server: case CRUD procedures (create, list, get, delete)
- [x] Server: document upload procedure (S3 storage)
- [x] Server: AI passport OCR extraction procedure
- [x] Server: AI stamp verification procedure (MOFA + Spain Embassy)
- [x] Server: AI company ownership validation procedure
- [x] Server: AI freelancing agreement eligibility check procedure
- [x] Server: AI recommendation letter validation procedure
- [x] Server: AI comprehensive final analysis report procedure

## Frontend — Design System
- [x] Configure global CSS variables (premium dark/light palette)
- [x] Set up typography (Inter + Playfair Display)
- [x] Design tokens: spacing, radius, shadows

## Frontend — Layout & Navigation
- [x] App.tsx routes: /, /cases, /cases/:id, /cases/:id/upload, /cases/:id/report

## Frontend — Case Management Dashboard
- [x] Home/landing page with hero and CTA
- [x] Cases list page with status indicators
- [x] Create new case modal/form
- [x] Case status badges (Draft, In Progress, Complete, Issues Found)

## Frontend — Document Upload Wizard
- [x] Wizard shell with step progress indicator
- [x] Step 1: Main applicant passport upload
- [x] Step 2: Family passports (with skip option)
- [x] Step 3: Company owned by applicant
- [x] Step 4: Client company details
- [x] Step 5: Recommendation letter
- [x] Step 6: Freelancing contract
- [x] Step 7: Birth/marriage certificates
- [x] Step 8: Police clearance certificates
- [x] File preview component (images + PDFs)
- [x] AI OCR extraction UI for passport (auto-populate fields)

## Frontend — Analysis & Report
- [x] Run analysis button + loading state
- [x] Analysis report page with scored checklist
- [x] Per-document verification cards
- [x] Flagged issues panel
- [x] Actionable recommendations section

## Testing
- [x] Vitest: case CRUD procedures
- [x] Vitest: document upload procedure
- [x] Vitest: analysis procedures

## Change Requests (Round 2)
- [x] Remove email and phone fields from case creation form — keep only client name
- [x] Expand file upload to accept PDF, Word (.doc/.docx), and all image types
- [x] Server: parse Word documents and PDFs for AI analysis (convert to readable text/images)
- [x] Company (owned): if ownership % not mentioned, assume 100% sole ownership
- [x] Company (owned): add check — company must be running for more than 1 year
- [x] Client company: remove ownership check entirely
- [x] Client company: add critical check — applicant name must NOT appear in client company docs
- [x] Client company: add check — client company must be running for 3+ years
- [x] Freelancing eligibility: broaden criteria — any service doable remotely/from anywhere qualifies

## Change Requests (Round 3)
- [x] Exclude freelancing contract and recommendation letter from stamp verification (no stamps required on these two documents)

## Elevay Platform Merge
- [x] Merge contracting app schema (contracts, invoices, payments tables) into spain_dnv_qa schema
- [x] Add all contracting server utilities: contractGenerator, invoiceGenerator, exchangeRate, emailService, googleDrive
- [x] Merge contracting routers into unified appRouter under `contracting.*` namespace
- [x] Build unified Elevay top-level navigation with module switcher (Contracting / Application Analysis)
- [x] Integrate contracting pages: Dashboard, Contracts, Invoices, Analytics, NewContractDialog
- [x] Integrate DNV pages under Application Analysis module
- [x] Redesign landing/home page as Elevay brand with two module entry points
- [x] Unified DashboardLayout with module-aware sidebar navigation
- [x] Run all tests and save checkpoint

## Change Requests (Round 4)
- [x] Update Contracting module header to show "Elevay" instead of "ELEVAY Contract Management System"

## Change Requests (Round 5)
- [x] Fix sidebar nav labels to be white; bold white for the active/selected item
- [x] Add Dashboard overview sub-page to Application Analysis module (route: /analysis/dashboard)
- [x] Add "Dashboard" nav item to Application Analysis module in DashboardLayout

## Client Documentation Module (Round 6)
- [x] DB: clientCases table (id, userId, clientName, clientCode, applicationType, maritalStatus, paralegal, consultant, schengenDate, embassyAppointmentDate, expectedSubmissionDate, createdAt)
- [x] DB: clientDocuments table (id, clientCaseId, docKey, docName, category, received, receivedDate, mofaAttested, embassyAttested, expirationMonths, requiresMofa, requiresEmbassy)
- [x] Server: clientDocs router with all CRUD + action procedures
- [x] Server: document checklist generator (Freelancer / Business Owner / Family tables)
- [x] Server: automated email reminders (1 month before Schengen expiry, 1 month before doc expiry, 12 days before submission date)
- [x] UI: Client list page (/docs) with create new client button
- [x] UI: Create client dialog (name, code, type, marital status, paralegal, consultant)
- [x] UI: Client detail page (/docs/clients/:id) with 6 action buttons
- [x] UI: Receive document action — show remaining docs, pick date per doc
- [x] UI: MOFA attestation action — show received docs, multi-select
- [x] UI: Embassy attestation action — show received docs, multi-select
- [x] UI: Schengen / Embassy / Submission date pickers (calendar)
- [x] UI: Family clients — 2 tabs (Single / Family documents)
- [x] UI: Full client report page with remaining docs + pending procedures
- [x] DashboardLayout: Add Client Documentation as 3rd module in sidebar
- [x] App.tsx: Add /docs/* routes

## Change Requests (Round 7)
- [x] Fix ClientDocs and ClientDocDetail pages: white background, black/dark text, dark navy blue buttons (remove all dark-mode bg/text classes)

## Change Requests (Round 8)
- [x] Upload Elevay logo to CDN and add to top of sidebar (replacing the toggle icon area)
- [x] Build Client Documentation Dashboard page (/docs/dashboard) showing each client name + file completion %
- [x] Add Dashboard nav item to Client Documentation module in DashboardLayout
- [x] Update email reminders: send to both paralegal AND consultant assigned to the case
- [x] Hardcode team email map: Madonna→madonna.adel@elevay.com, Monica→monica.sobhy@elevay.com, Marina→marina.kamel@elevay.com, Mahmoud→Mahmoud.saber@elevay.com, Fouad→fouad.abdo@elevay.com, Kirolos→kirlos.nabil@elevay.com, Ziad→ziad.elshurafa@elevay.com
## Change Requests (Round 9)

### Google Drive Integration
- [x] Request GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN secrets from user
- [x] Implement googleDrive.ts helper: authenticate with OAuth refresh token
- [x] Contracting: upload generated contract PDF to Google Drive folder on contract creation/sign
- [x] Contracting: upload invoice/receipt PDF to Google Drive folder on invoice creation
- [x] Contracting: show Google Drive link on contract and invoice detail pages
- [x] Add "Drive Sync" status indicator in Contracting dashboard

### Client Documentation Dashboard Search/Filter
- [x] Add search bar (by client name) to /docs/dashboard
- [x] Add status filter dropdown: All / Missing Docs / Ready to Submit / Submitted
- [x] Add paralegal filter dropdown (all 3 paralegals + "All")
- [x] Add consultant filter dropdown (all 4 consultants + "All")
- [x] Highlight overdue clients (Schengen expiry or submission date within 30 days)

### Application Analysis PDF Report Export
- [x] Server: generate PDF report from analysis results using pdfkit
- [x] Server: tRPC procedure exportReport(caseId) → returns S3 URL of generated PDF
- [x] Client: "Download PDF Report" button on AnalysisReport page
- [x] PDF includes: client name, case ID, date, per-document results, flagged issues, recommendations
- [x] PDF uses Elevay branding (logo, navy color scheme)

## Change Requests (Round 10) — 3-Stage Client Workflow

- [x] DB: add `stage` enum column (preparation|submission|approved) to cases table, default preparation
- [x] DB: add `submissionDate`, `expectedApprovalDate`, `translationDate` columns to cases table
- [x] DB: add `approvalDate`, `settlementFeeAmount`, `settlementFeeDate`, `biometricsDate` columns to cases table
- [x] DB: generate migration SQL and apply to database
- [x] Server: tRPC procedure `clientDocs.updateStage` — update stage and stage-specific fields, auto-calc expectedApprovalDate
- [x] Server: auto-calculate expectedApprovalDate = submissionDate + 25 working days (skip weekends)
- [x] Server: dashboard stats — % approved within expected date range
- [x] Client: stage dropdown on client detail page (Preparation / Submission / Approved)
- [x] Client: Submission stage — submissionDate picker, expectedApprovalDate (auto-calc read-only), translationDate picker
- [x] Client: Approved stage — approvalDate picker, settlementFeeAmount + settlementFeeDate, biometricsDate, on-time badge
- [x] Client: Client Documentation dashboard — stage filter tabs + approval stats card
- [x] Client: new clients default to "preparation" stage automatically

## Financial Management Module (Round 11)
- [x] DB: accounts, categories, employees, transactions, commissions tables + seed data
- [x] Server: role-based access (admin/read-only/limited) for financial module
- [x] Server: CRUD routers for accounts, categories, employees
- [x] Server: transaction routers (income/expense/transfer) with balance logic
- [x] Server: commission auto-entry on contract signed
- [x] Server: client database auto-sync from contracts
- [x] Server: reports queries (all expenses, all income, account statements)
- [x] Server: dashboard analytics (monthly/yearly income, expenses by category, profit, etc.)
- [x] Frontend: Financial Dashboard main page with analytics
- [x] Frontend: Accounts page with balances and transaction history
- [x] Frontend: Categories database page (expense + income)
- [x] Frontend: Employees database page
- [x] Frontend: Client database page (auto from contracts)
- [x] Frontend: Commission database page
- [x] Frontend: Transaction entry (Income/Expense/Transfer) with quick actions
- [x] Frontend: Reports pages (All Expenses, All Income, Account Statement)
- [x] Automated monthly email with PDF reports on last day of month
- [x] Bulk Excel upload for transactions
- [x] Sidebar navigation for Financial Module

## Change Requests (Round 12)
- [x] Update all account initial balances from CSV file
- [x] Add salary column to employees table and replace all employees from CSV (28 employees with salaries)
- [x] Fix EGP total balance: only sum Cash EGP + Arab African EGP + CIB EGP + AIB EGP (exclude Rent Credit, Imprest, etc.)
- [x] Fix Ziad Credit currency from EGP to EUR

## Change Requests (Round 13)
- [x] Fix EGP total to include ALL EGP accounts except Imprest Account and Rent Credit (was only summing 4 accounts, now sums 10)
- [x] Fix TiDB MONTH() GROUP BY compatibility issue that was crashing the Financial Dashboard
- [x] Fix Total EGP on Accounts page (/finance/accounts) to exclude Imprest Account and Rent Credit

## Change Requests (Round 14)
- [x] Add Consultant Yearly Signing section to Financial Dashboard (Mahmoud, Ziad, Kirolos, Fouad)
- [x] Add 3 Quick Transaction buttons (Income, Expense, Transfer) to Financial Dashboard

## Change Requests (Round 15)
- [x] Update finClients schema: add clientCode (separate from name), program, signingDate, status, phone, address, salesPerson, contractValueEur, paidAmountEur, remainingAmountEur, isLegacy flag
- [x] Import 256 old clients from CLientDataBase.csv into finClients table
- [x] Auto-update client remainingAmount when a new income transaction is linked to that client
- [x] For old clients: remainingAmount from CSV is the contract value; deduct new payments in EUR (payment EGP / 55.5)
- [x] For new clients: remainingAmount = contractValueEur - (totalPaidEgp / 55.5)
- [x] Build Clients page in Financial module with search, filter by consultant, and remaining balance display

## Change Requests (Round 16)
- [x] Add filter by client code (text input) to Clients page
- [x] Add sort by all columns (Code, Name, Program, Consultant, Contract Value, Paid, Remaining) to Clients page
- [x] Add Export as PDF button to Clients page (exports current filtered/sorted list)

## Change Requests (Round 17)
- [x] Move client sorting to backend (DB-level ORDER BY) so it applies across all pages, not just current page

## Change Requests (Round 18)
- [x] Add PDF export button to Bank Statement page (exports selected account + date range transactions as branded PDF)

## Change Requests (Round 19)
- [x] Add bulk delete (checkboxes + Delete Selected button) to Income page
- [x] Add bulk delete (checkboxes + Delete Selected button) to Expenses page
- [x] Add bulk delete (checkboxes + Delete Selected button) to Transfers page
- [x] Add bulkDeleteTransactions backend procedure accepting array of IDs

## Change Requests (Round 20)
- [x] Fix bulk delete: reverse account balances when transactions are deleted (income reversal, expense reversal, transfer reversal)
- [x] Add edit opening/initial balance to Accounts page (edit button per account row)
- [x] Add setBalance backend procedure (directly sets account balance without creating a transaction)

## Change Requests (Round 21)
- [x] Import all income transactions from Income2_Cleaned.xlsx into Cash EGP account (28 transactions, EGP 2,552,394 total)

## Change Requests (Round 22)
- [x] Fix unmatched client codes: normalize 260018→26018 pattern and re-link transactions to correct clients (6 fixed)
- [x] Add transaction edit (pencil icon per row) to Income page
- [x] Add transaction edit (pencil icon per row) to Expenses page
- [x] Add transaction edit (pencil icon per row) to Transfers page
- [x] Add updateTransaction backend procedure

## Change Requests (Round 23)
- [x] Add openingBalance column to finAccounts table (separate from running balance)
- [x] Update setBalance procedure to set openingBalance only (not current balance)
- [x] Recalculate displayed balance as openingBalance + sum of all transactions
- [x] Show opening balance in Accounts page edit dialog

## Change Requests (Round 24)
- [x] Import CIBEGP_Cleaned.xlsx transactions as income into CIB EGP account (48 transactions, final balance EGP 14,268,942)
- [x] Import ArabAfricanEGP_Cleaned.xlsx transactions as income into Arab African EGP account (14 transactions, final balance EGP 3,549,818.39)

## Change Requests (Round 25)
- [x] Import CashEGPexpenses_Cleaned.xlsx as expenses into Cash EGP account (347 transactions, Notion hyperlinks stripped, final balance EGP -7,210,801.98)

## Change Requests (Round 26)
- [x] Import all income transactions from Notion database (from 2026-01-01) into correct accounts with client/employee/category links (137 transactions, 88 client balances updated, 0 defaulted to wrong account)

## Change Requests (Round 27)
- [x] Import all transfer transactions from Notion Transfers database (71 transfers imported, 0 skipped, all accounts updated correctly)

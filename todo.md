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

## Change Requests (Round 28)
- [x] Import all 2026 expense transactions from Notion Expenses database into correct accounts with category/employee links (675 imported, 128 duplicates skipped, 142 defaulted to Misc category)

## Change Requests (Round 29)
- [x] Update opening balances for 11 accounts (31-Dec-2025 closing balances) and recalculate current balances

## Change Requests (Round 30) — Advanced Filtering, Sorting & Reports

- [x] Backend: extend listTransactions to accept filters (dateFrom, dateTo, categoryId, employeeId, finClientId, accountId) and sorting (sortField, sortDir)
- [x] Backend: add getDetailedReport procedure returning filtered transactions with totals for PDF/Excel export
- [x] Shared FilterBar component: date range calendar picker, category dropdown, employee dropdown, client dropdown, sort column + direction
- [x] Wire FilterBar into Income page (FinIncome.tsx) — sort + filter across all records
- [x] Wire FilterBar into Expense page (FinExpenses.tsx) — sort + filter across all records
- [x] Wire FilterBar into Transfer page (FinTransfers.tsx) — sort + filter across all records
- [x] Report page: select entity type (client / category / employee), select specific entity, show filtered transactions with totals
- [x] Report page: Export to PDF (branded PDF with Elevay header)
- [x] Report page: Export to Excel (xlsx with SheetJS)
- [x] Register Report page in Financial sidebar navigation

## Change Requests (Round 31) — Client Database Enhancements

- [x] Import contractValue, paidAmount, remainingAmount from Notion client database for all existing clients
- [x] Show totalDirectCost (sum of linked expenses) and profit (income - cost) per client in Clients page
- [x] Auto-create finClient entry when a contract is marked as signed (clientCode, name, phone, familyMembers, contractValueEur)
- [x] New income payments linked to a client auto-deduct from remainingAmountEur (EGP / 55.5)

## Change Requests (Round 32) — System Enhancements

- [x] Fix Account Statement: include transfers in statement and fix running balance calculation
- [x] Smart prefix search for client codes (typing 26 shows all 26xxx clients)
- [x] Page size selector (60/120/240/All) on FinIncome, FinExpenses, FinTransfers pages
- [x] PDF and Excel export on FinIncome, FinExpenses, FinTransfers pages
- [x] Increase Elevay logo size by 200% on landing page and sidebar
- [x] Verify auto-deduct of remainingAmountEur when income linked to client is created
- [x] Verify getDetailedReport backend procedure exists and is used by FinReport PDF/Excel export

## Change Requests (Round 33) — Commission Database

- [x] Inspect Notion commission database and map all fields
- [x] Add commissions table to DB schema with all fields (client, status, signingDate, contractValue, leadSource, qualifier, qualifierCommission, qualifierLeader, paralegal, paralegalCommission x3 dates, consultant, consultantPayment x3, leaderCommission)
- [x] Import all Notion commission records into DB (Notion API cannot access this DB; manual entry required)
- [x] Build Commission Database page in Financial module with all fields, filters, edit capability
- [x] Auto-create commission entry when receipt is marked as paid (clientName, status, contractValue, signingDate, consultantName)
- [x] Auto-populate commission entry from contract data (clientCode, name, phone, familyMembers, contractValue, signingDate)
- [x] Employee income/expense totals: when income/expense linked to employee, reflect in employee totals

## Change Requests (Round 34) — Exchange Rate & Edit/Delete

- [x] EUR/EGP exchange rate button on Client Database page: dedicated "Set Exchange Rate" button, rate stored in DB settings table, affects paid amount EGP column calculation
- [x] Edit entries in Expense Database: pencil icon per row opens edit dialog with all fields
- [x] Delete entries in Expense Database: trash icon per row with confirmation dialog
- [x] Edit entries in Income Database: pencil icon per row opens edit dialog with all fields
- [x] Delete entries in Income Database: trash icon per row with confirmation dialog
- [x] Edit entries in Transfer Database: pencil icon per row opens edit dialog with all fields
- [x] Delete entries in Transfer Database: trash icon per row with confirmation dialog

## Change Requests (Round 35) — Active User Indicator in Sidebar

- [x] Show active/logged-in user avatar and name as a small icon at the bottom of the left sidebar ribbon, visible in all modules (Contracting, Finance, Client Documentation, Application Analysis)

## Change Requests (Round 36) — Bank Logos & Full Edit Dialogs
- [x] Extract bank logos from Word doc and upload to CDN
- [x] Add logoUrl column to finAccounts table and seed logos for all 13 accounts
- [x] Display bank logo next to account name on Accounts page and anywhere accounts are listed
- [x] Fix Expense edit dialog: add Amount field so full entry can be edited (with balance adjustment)
- [x] Fix Income edit dialog: add Amount field so full entry can be edited (with balance adjustment)
- [x] Fix Transfer edit dialog: add Amount field so full entry can be edited (with balance adjustment)

## Change Requests (Round 37) — Account Logo Thumbnails in Dropdowns
- [x] Create shared AccountSelect component showing bank logo thumbnail + account name in all dropdowns
- [x] Use AccountSelect in Income create dialog (Account field)
- [x] Use AccountSelect in Expense create dialog (Account field)
- [x] Use AccountSelect in Transfer create dialog (From Account + To Account fields)

## Change Requests (Round 38) — CRM Dual-State UI, Chat & Broadcasts

- [x] DB: chatMessages table (senderId, receiverId, content, readAt, createdAt)
- [x] DB: broadcasts table (authorId, content, isActive, createdAt)
- [x] DB: broadcastDismissals table (userId, broadcastId, dismissedAt)
- [x] Apply migration SQL for 3 new tables
- [x] Backend: chatRouter — sendMessage, getMessages, listConversations, markRead, getUnreadCount, listTeamMembers
- [x] Backend: broadcastRouter — create (admin only), listActive, listAll (admin only), dismiss, deactivate
- [x] Register chatRouter and broadcastRouter in appRouter
- [x] Frontend: ElevayHome page — dual-state home with greeting header ("Hello, [Name]"), 2×2 module card grid, "Losing Information" alert widget
- [x] Frontend: ElevayHome — alert widget shows urgent client alerts (Schengen/submission within 14 days) with red/amber levels
- [x] Frontend: TeamChat page — conversation list, chat window, real-time polling (3s), unread badge
- [x] Frontend: TeamChat — search team members, start new conversation, message bubbles (sent right / received left)
- [x] Frontend: BroadcastCenter page (admin only) — compose broadcast, send to all, history table, deactivate button
- [x] Frontend: BroadcastBanner component — pinned amber banner for active broadcasts, dismissible per user
- [x] Frontend: DashboardLayout — add Home + Team Chat links to sidebar footer; Broadcast Center link for admins
- [x] Frontend: MessagingContext — global React Context for unread message count + active broadcast count
- [x] Frontend: DashboardLayout — show unread message badge on Team Chat sidebar link
- [x] App.tsx: add /chat and /broadcast routes

## Change Requests (Round 39) — Owner Settings & Granular Permissions

- [x] DB: userPermissions table (userId, pageKey, canAccess) — one row per user per page
- [x] DB: pendingInvites table (email, token, permissions JSON, createdAt, usedAt) for invite links
- [x] Apply migration SQL for new tables
- [x] Backend: permissionsRouter (owner-only) — listUsers, getUserPermissions, setUserPermissions, addUserManually, sendInvite, listInvites, revokeInvite
- [x] Backend: getMyPermissions procedure (any authenticated user) — returns their own permission map
- [x] Backend: owner check middleware — only OWNER_OPEN_ID can access permissionsRouter
- [x] Frontend: Settings page (/settings) — owner-only, shows all users with permission toggle grid
- [x] Frontend: Settings — per-user permission matrix: toggle each page on/off per user
- [x] Frontend: Settings — "Add User Manually" dialog (name + email, set permissions immediately)
- [x] Frontend: Settings — "Invite User" dialog (email input, generates invite link, copy to clipboard)
- [x] Frontend: Settings — pending invites list with revoke button
- [x] Frontend: DashboardLayout — add Settings link in sidebar footer (owner only)
- [x] Frontend: PermissionsContext — global context that loads current user's permissions
- [x] Frontend: enforce page-level access — wrap each protected page with permission check, show 403 if no access
- [x] App.tsx: add /settings route (owner only)

## Bug Fixes (Round 40) — Notification Center, Settings, Team Chat

- [x] Fix Settings page not loading (investigate permissions.getMyPermissions and listUsers procedures)
- [x] Fix Team Chat page not working (investigate chat procedures and UI rendering)
- [x] Fix Notification Center not working (investigate what the notification center is and where it lives)

## Change Requests (Round 41) — User Groups & Predefined Permission Levels

- [x] DB: userGroups table (id, name, description, color, createdAt) — named groups with a color label
- [x] DB: groupPermissions table (groupId, pageKey, canAccess) — permission set per group
- [x] DB: add groupId FK column to users table — assign each user to a group (nullable)
- [x] Apply migration SQL for new tables and column
- [x] Backend: permissionsRouter — createGroup, listGroups, updateGroup, deleteGroup, setGroupPermissions, assignUserToGroup, removeUserFromGroup
- [x] Backend: when a user is assigned to a group, their individual permissions are overridden by the group's permissions
- [x] Backend: getMyPermissions — if user has a groupId, return the group's permissions instead of individual ones
- [x] Frontend: Settings page — add "Groups" tab alongside "Users" tab
- [x] Frontend: Groups tab — list all groups with their color, name, description, and member count
- [x] Frontend: Groups tab — "Create Group" button with name, description, color picker, and permission matrix
- [x] Frontend: Groups tab — click a group to expand: edit permissions, see members, remove members
- [x] Frontend: Users tab — show group badge next to each user's name (if assigned to a group)
- [x] Frontend: Users tab — in user row expanded view, add "Assign to Group" dropdown (replaces individual permission toggles when a group is selected)
- [x] Frontend: Users tab — if user is in a group, show group permissions as read-only with a note "Permissions managed by group: [GroupName]"

## Change Requests (Round 42) — Email-Based Owner Lock for Settings

- [x] Backend: update ownerProcedure to verify caller email is mahmoud.saberelevay@gmail.com (in addition to OWNER_OPEN_ID check)
- [x] Backend: update getMyPermissions to identify owner by email match
- [x] Frontend: Settings page — show "Access Denied" if user email is not mahmoud.saberelevay@gmail.com
- [x] Frontend: DashboardLayout — only show Settings sidebar link if user email is mahmoud.saberelevay@gmail.com

## Bug Fixes (Round 43)
- [x] Fix contract code generation: use current year's last 2 digits as prefix (26xxx for 2026, 27xxx for 2027), sequential per year
- [x] Fix markPaid: auto-create Finance client record with name, phone, signing date, consultant, client code, contract value, family members

## Bug Fixes (Round 43)
- [x] Fix contract code generation: use current year last 2 digits as prefix (26xxx for 2026, 27xxx for 2027), sequential per year
- [x] Fix markPaid: auto-create Finance client record with name, phone, signing date, consultant, client code, contract value, family members

## Change Requests (Round 44)
- [x] Fix contract code generation: year prefix (26xxx for 2026, 27xxx for 2027), sequential per year
- [x] Fix markPaid: auto-create Finance client record with name, phone, signing date, consultant, client code, contract value, family members
- [x] Client selector in Income/Expense forms: replace Select dropdown with live-search combobox showing client code + name, filtering as you type

## Change Requests (Round 45)
- [x] Email: invoice created → send notification to Mahmoud.saber@elevay.com
- [x] Email: EUR/EGP rate scheduler wired at 9am, 1pm, 3pm Cairo time
- [x] Email: Finance client manually added → email summary to Mahmoud.saber@elevay.com
- [x] CSV export button in Finance Clients page (alongside existing PDF export)

## Change Requests (Round 46) — Legacy Receipt Mode
- [x] DB: add `isLegacyReceipt` (boolean, default false) and `legacyFinClientId` (int, nullable) columns to invoices table; make `contractId` and `contractCode` nullable
- [x] Server: add `invoices.createLegacy` tRPC procedure — picks Finance client by id, free-form EUR+EGP, generates PDF receipt, no contract link
- [x] Server: update `markPaid` — when `isLegacyReceipt=true`, skip auto-create Finance client and skip remaining balance update
- [x] UI: add Contract / Legacy Receipt tab switcher to Create Receipt dialog
- [x] UI: Legacy tab — live-search combobox for Finance clients (code + name), EUR amount, EGP amount (auto from rate, editable), notes

## Change Requests (Round 49)
- [x] Move New Income / New Expense / New Transfer buttons to top center of their pages
- [x] Complete granular permissions Settings UI (View/Edit matrix per user per page)

## Change Requests (Round 51)
- [x] New Financial page: After Settlement Payment (Client Name, Amount AED, Amount EUR=AED/4, Date)
- [x] Import existing records from Notion page into settlementPayments table
- [x] Add "After Settlement" nav item to Financial module sidebar

## Change Requests (Round 52)
- [x] Add Edit button per row in After Settlement Payment table (edit client, AED amount, date, notes)

## Change Requests (Round 53)
- [x] Fix Edit Transfer: reverse old account balances and apply new ones (both credited and deducted accounts editable)

## Change Requests (Round 54)
- [x] Fix client name not showing in After Settlement Payment table

## Change Requests (Round 55)
- [x] Add Download PDF button to After Settlement Payment sheet
- [x] Fix client name not showing when selected from Finance DB combobox in Settlement sheet

## Change Requests (Round 56)
- [x] Disable email notifications for Income, Expense, and Transfer transaction creation

## Change Requests (Round 56)
- [x] Disable email notifications for Income, Expense, and Transfer transaction creation

## Change Requests (Round 57) — Children/Family Members + Arabic Word Export
- [x] Add childrenData JSON column to clientCases schema and run migration
- [x] Update clientDocDefs.ts to accept children array and generate per-child docs
- [x] Update clientDocs.create tRPC procedure to accept and store children data
- [x] Add clientDocs.updateChildren tRPC procedure
- [x] Update ClientDocs.tsx new-client form with children fields
- [x] Install docx npm package for Word document generation
- [x] Add clientDocs.exportChecklist tRPC procedure (Arabic Word doc + Elevay logo)
- [x] Add export button to ClientDocDetail.tsx

## Change Requests (Round 60) — Edit Workflow + Stage Date Sync
- [x] Add workflow.update tRPC procedure (update schengenExpiry, childrenNamesData, submissionDate, schengenStatus)
- [x] Add Edit button to each workflow card in WorkflowPage.tsx
- [x] Build Edit Workflow modal with pre-filled fields (Schengen status/expiry, children names/ages, submission date)
- [x] Auto-sync workflow submission date to client Stage Dates (submissionDate field) on create and update

## Change Requests (Round 61) — Workflow Doc Fixes + Edit Modal
- [x] Add Schengen expiry date to client info section in workflowDocxGenerator.ts
- [x] Add document validity table (6 items) to important notes section in workflowDocxGenerator.ts
- [x] Ensure full RTL right-alignment for ALL text throughout the Word document
- [x] Add Edit workflow modal to WorkflowPage.tsx (pre-filled: Schengen status/expiry, children names/ages, submission date)

## Change Requests (Round 62) — Client Docs Module Improvements

### 1. Schengen Visa Tracking + Reminders
- [x] DB: add schengenVisaValid (boolean), schengenExpiryDate (date) columns to clientCases
- [x] New-client form: ask Schengen visa yes/no; if yes, show expiry date picker
- [x] Reminder scheduler: send email 30 days before schengenExpiryDate to paralegal + consultant
- [x] Reminder scheduler: send email 20 days before schengenExpiryDate to paralegal + consultant

### 2. Embassy Attestation Email Date + 15-day Reminder
- [x] DB: add embassyEmailDate (date) column to clientCases
- [x] Client detail page: add "Embassy Attestation Email Date" field (editable any time)
- [x] Reminder scheduler: send email 15 days after embassyEmailDate to paralegal + consultant

### 3. New Client Assignment Email
- [x] emailService: add notifyNewClientAssigned() function
- [x] routers.ts createClientCase: call notifyNewClientAssigned after creation

### 4. Google Drive Link Field
- [x] DB: add driveLink (text) column to clientCases
- [x] Client detail page: add Google Drive link field (editable, clickable)

### 5. New Required Documents
- [x] clientDocDefs.ts: add company_memorandum_of_association to BUSINESS_OWNER_MAIN_DOCS
- [x] clientDocDefs.ts: add admission_not_practice to FREELANCER_MAIN_DOCS and BUSINESS_OWNER_MAIN_DOCS
- [x] clientDocDefs.ts: add power_of_attorney to FREELANCER_MAIN_DOCS and BUSINESS_OWNER_MAIN_DOCS
- [x] Arabic translations for 3 new documents
- [x] Backfill new documents for all existing clients

### 6. Paralegal Assignment on Client Detail Page
- [x] Remove paralegal field from new-client creation form (make it optional/nullable in DB)
- [x] Client detail page: add "Assign Paralegal" dropdown (editable any time)
- [x] routers.ts: add updateParalegal procedure

## Change Requests (Round 65)
- [x] Update ClientDocs form: capture exact child name + age (not just age range)
- [x] Add spouseName field to clientCases table and ClientDocs create/edit forms
- [x] Auto-populate spouse name in National Visa wizard from client record
- [x] Add status column to nationalVisaWorkflows (in_progress / completed / submitted)
- [x] Show status dropdown in National Visa list view with inline update

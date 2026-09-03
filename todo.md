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

## Change Requests (Round 70)
- [x] Fix "db is not defined" bug in notification helpers in db.ts
- [x] Fix stamp note bug: social insurance certificate incorrectly showing Higher Education stamp note
- [x] Date range filter for Contracting Dashboard: backend (db.ts + routers.ts) updated with dateFrom/dateTo params
- [x] Date range filter for Contracting Dashboard: frontend ContractingDashboard.tsx updated with preset dropdown (All Time, This Month, Last Month, This Quarter, This Year), active filter badges, and memoized date computation

## Change Requests (Round 71)
- [x] Backend: getMonthlyRevenue(year, consultantName?) helper in db.ts — returns array of {month, value} for a given year
- [x] Backend: analytics.monthlyRevenue tRPC procedure accepting year and optional consultantName
- [x] Backend: analytics.exportContracts tRPC procedure accepting consultantName, dateFrom, dateTo — returns all matching contracts as JSON for client-side CSV/Excel generation
- [x] Frontend: Contracts list page — add date range preset dropdown (All Time, This Month, Last Month, This Quarter, This Year) alongside existing filters
- [x] Frontend: Contracts list page — add Export CSV button that downloads filtered contracts as a .csv file
- [x] Frontend: Contracting Dashboard — add Export CSV button that downloads currently filtered contracts
- [x] Frontend: Contracting Dashboard — add monthly revenue bar chart (recharts BarChart) below stat cards, showing contract value per month for the selected year

## Change Requests (Round 72)
- [x] Fix client assignment email notifications: ensure madona.adel@elevay.com and Mahmoud.saber@elevay.com receive emails when a client is assigned; removed Mahmoud.saberelevay@gmail.com from MAHMOUD_EMAILS; Mahmoud.saber@elevay.com now always in to: list (not just CC) for both new client and doc reminder notifications
- [x] Fix SMTP delivery: GMAIL_USER and GMAIL_APP_PASSWORD secrets were missing — added correct Gmail App Password; SMTP connection now verified and all email notifications will be delivered via Gmail SMTP

## Change Requests (Round 73)
- [x] DB: add actualPaidAmountEgp (decimal, nullable) and remainingAmountEgp (decimal, nullable) columns to invoices table
- [x] Backend: update createInvoice procedure to accept actualPaidAmountEgp; auto-calculate remainingAmountEgp = amountEgp - actualPaidAmountEgp
- [x] Frontend: receipt creation form — add "Actual Paid Amount (EGP)" input field; show live "Remaining (EGP)" = due EGP - paid EGP below it
- [x] Frontend: receipt list table — add Due (EGP), Paid (EGP), and Remaining (EGP) columns
- [x] Frontend: receipt PDF template — add DUE AMOUNT (EGP), ACTUAL PAID (EGP), and REMAINING (EGP) rows when partial payment is provided

## Change Requests (Round 74) — ELEVAY LEADS CRM Module

- [x] DB: leads table (full_name, phone, whatsapp, email, nationality, country_of_residence, dob, gender, marital_status, family_members, passport_status, preferred_language, interested_program, interested_country, budget_range, net_worth, occupation, monthly_income, education_level, travel_history, visa_refusals, criminal_record, source_of_funds, lead_source, meta_campaign, meta_adset, meta_ad, utm_params, assigned_to, stage, lead_score, priority, created_at, last_contact_at)
- [x] DB: lead_activities table (id, lead_id, user_id, activity_type, description, created_at)
- [x] DB: lead_notes table (id, lead_id, user_id, note, is_pinned, is_important, created_at, updated_at)
- [x] DB: lead_tasks table (id, lead_id, assigned_to, task_type, due_date, completed, notes, created_at)
- [x] Backend: leads router — createLead, getLead, listLeads, updateLead, deleteLead, changeStage, assignLead, duplicateCheck
- [x] Backend: lead notes router — addNote, editNote, deleteNote, pinNote
- [x] Backend: lead activities router — list activities per lead
- [x] Backend: lead tasks router — createTask, completeTask, listTasks
- [x] Backend: leads analytics router — stage counts, source breakdown, program breakdown, monthly conversion
- [x] Backend: Meta Ads webhook endpoint at /api/webhook/meta-leads — receive lead from Meta, create lead record
- [x] Frontend: Add "ELEVAY LEADS" module card to ElevayHome.tsx
- [x] Frontend: Add /leads route group to App.tsx with sidebar navigation
- [x] Frontend: Leads Dashboard — stat cards (total, fresh, contacted, qualified, converted, dormant), stage chart, source chart, program chart, monthly conversion graph
- [x] Frontend: Leads List page — table with search, stage filter, source filter, program filter, assigned filter, date range filter, export CSV
- [x] Frontend: Lead Profile page — full detail sections (personal, immigration, tracking), activity timeline, notes panel, tasks panel, stage change button
- [x] Frontend: Kanban Pipeline page — 6 stage columns, drag-and-drop cards
- [x] Frontend: New Lead form dialog — all required fields
- [x] Permissions: leads module visible to all authenticated users (pageKey: null)

## Change Requests (Round 75) — LEADS Settings Page

- [x] DB: lead_sources table (id, name, color, isActive, isDefault, createdAt) — custom lead source registry
- [x] DB: lead_integrations table (id, type [meta|website], name, config JSON, isActive, webhookToken, createdAt) — integration registry
- [x] Backend: leadSettings router — CRUD for lead_sources, CRUD for lead_integrations, getLeadsPermissions, updateLeadsPermissions, exportLeads (CSV/JSON), importLeads (CSV upload)
- [x] Backend: public webhook endpoint /api/webhook/leads/:token — receives lead from website/landing page using token auth, creates lead record
- [x] Frontend: LeadsSettings page with 5 tabs: Export/Import, Permissions, Lead Sources, Meta Ads, Website Integration
- [x] Frontend: Export tab — export all/filtered leads as CSV or JSON with field selection
- [x] Frontend: Import tab — CSV upload with column mapping preview and dry-run validation
- [x] Frontend: Permissions tab — table of all team members with toggle for leads module access (read/write/admin)
- [x] Frontend: Lead Sources tab — list of custom sources with add/edit/delete/color picker; show which sources are in use
- [x] Frontend: Meta Ads tab — show webhook URL + verify token, instructions for Meta Business Manager setup, test connection button
- [x] Frontend: Website Integration tab — generate unique webhook token, show POST endpoint URL + JSON payload schema, copy-to-clipboard, test webhook button
- [x] Sidebar: add Settings nav item to the Leads module in DashboardLayout
- [x] App.tsx: add /leads/settings route

## Change Requests (Round 76) — LEADS CRM Improvements

- [x] DB: lead_programs table (id, name, isActive, createdAt) — custom interested program registry
- [x] DB: lead_activity_presets table (id, label, activityType, score, isActive) — preset scored activity types
- [x] DB: leads.leadScore update logic — add score delta on each preset activity log
- [x] Backend: leadPrograms router — listPrograms, createProgram, updateProgram, deleteProgram
- [x] Backend: activityPresets router — listPresets, createPreset, updatePreset, deletePreset
- [x] Backend: leads.sendEmail procedure — send email to lead from system using SMTP (Gmail)
- [x] Backend: leads.listLeads — extend filters: dateFrom, dateTo, stage, interestedProgram, assignedTo, lastActivityFrom, lastActivityTo
- [x] Backend: Meta sync — store pageId/formId in integration config; document how to retrieve leads via Meta Graph API
- [x] Frontend: LeadsSettings — add "Programs" tab with add/edit/delete/toggle for interested programs
- [x] Frontend: LeadsSettings — add "Activity Presets" tab with preset list (label, type, score), add/edit/delete
- [x] Frontend: LeadsSettings — Meta Ads tab: show pageId/formId fields; add "Sync Now" button that calls Meta Graph API to pull recent leads
- [x] Frontend: LeadsSettings — Import tab: LeadSquared CSV column mapping wizard (map LeadSquared columns to ELEVAY fields), dry-run preview, confirm import
- [x] Frontend: LeadProfile — show full note/activity body text inline (expandable if long)
- [x] Frontend: LeadProfile — preset activity picker: dropdown/buttons for preset activities (Phone Call, No Answer, SMS, WhatsApp) with auto-filled score; score badge shown on each activity
- [x] Frontend: LeadProfile — WhatsApp direct button next to phone number: opens wa.me link in new tab
- [x] Frontend: LeadProfile — Send Email dialog: compose subject + body, send via system SMTP, log as activity
- [x] Frontend: LeadsList — advanced filter panel: date created range, stage multi-select, interested program, assigned to, last activity date range

## Change Requests (Round 77) — Meta Auto-Discover All Lead Forms

- [x] Sync engine: remove requirement for formId in config; auto-discover ALL lead forms on the page via /page_id/leadgen_forms endpoint
- [x] Sync engine: iterate over all discovered forms and pull leads from each one since lastSyncAt
- [x] LeadsSettings Meta Ads tab: remove Form ID input field; Page ID auto-detected from token
- [x] LeadsSettings Meta Ads tab: show auto-discovered forms list after token is saved
- [x] Pre-configure integration with Mahmoud's token (Page: Elevay Global, ID: 817555428107479)
- [x] Test sync end-to-end

## Change Requests (Round 78) — Bulk Actions & Lead Forms Management

- [x] Backend: leads.bulkDelete procedure — accepts array of lead IDs, deletes all, protected
- [x] Backend: leads.bulkExport procedure — accepts array of lead IDs (or "all"), returns CSV data
- [x] Backend: leadsSettings.listMetaForms procedure — calls Meta Graph API to list all forms on the page with id, name, status; marks which ones are "connected" (being synced)
- [x] Backend: leadsSettings.toggleMetaForm procedure — add/remove a form from an excluded list in integration config so user can disable specific forms from syncing
- [x] Frontend: LeadsList — add checkbox column (select row), select-all checkbox in header
- [x] Frontend: LeadsList — bulk action bar appears when 1+ leads selected: shows count, Delete Selected button, Export Selected button
- [x] Frontend: LeadsList — Delete Selected: confirmation dialog, calls bulkDelete, refreshes list
- [x] Frontend: LeadsList — Export Selected: downloads CSV of selected leads
- [x] Frontend: LeadsSettings — add "Lead Forms" tab showing all Meta forms discovered from the page
- [x] Frontend: LeadsSettings Lead Forms tab — table with columns: Form Name, Status (Active/Archived), Leads Count, Connected toggle (green=syncing, grey=excluded), Last Synced
- [x] Frontend: LeadsSettings Lead Forms tab — "Refresh Forms" button to re-fetch from Meta API
- [x] Frontend: LeadsSettings Lead Forms tab — show "Not connected" state if no Meta integration token is configured

## Change Requests (Round 79) — Search, Form Filter, Sync Progress, Historical Sync
- [x] Backend: extend listLeads to support `search` param (fullName, email, phone LIKE search)
- [x] Backend: extend listLeads to support `metaFormId` filter (filter by which Meta form the lead came from)
- [x] Backend: add `historicalSync` procedure — syncs all Meta forms from April 1 2026 to now, ignoring lastSyncAt
- [x] Frontend: LeadsList — add search bar (debounced, searches name/email/phone)
- [x] Frontend: LeadsList — add "Form" filter dropdown showing all Meta forms
- [x] Frontend: LeadFormsTab — add loading spinner/progress on Sync Now button (already has isPending, improve visual)
- [x] Frontend: LeadFormsTab — add "Full Sync from Apr 1 2026" button with progress indicator and result toast

## Change Requests (Round 80) — Leads Module Performance Audit & Bulk Actions

- [x] DB: Add 12 indexes to leads table (stage, assignedTo, leadSource, metaFormId, createdAt, updatedAt, lastContactAt, priority, interestedProgram, phone, email, fullName)
- [x] DB: Add 2 indexes to lead_activities table (leadId, createdAt)
- [x] Backend: Add pagination to listLeads (page, pageSize params; returns leads + total + totalPages)
- [x] Backend: Fix getLeadsByIds — replace N+1 loop with single IN clause query
- [x] Backend: Fix bulkDeleteLeads — replace N×4 loop with parallel batch IN clause deletes
- [x] Backend: Add bulkUpdateLeadsStage helper and procedure
- [x] Backend: Add bulkUpdateLeadsOwner helper and procedure
- [x] Frontend: Add debounced search (350ms) to prevent query on every keystroke
- [x] Frontend: Add pagination controls (Prev/Next, page indicator) to LeadsList
- [x] Frontend: Add "Change Stage" bulk button with stage picker dialog
- [x] Frontend: Add "Assign Owner" bulk button with team member picker dialog
- [x] Frontend: Reset page to 1 when filters change

## Change Requests (Round 81) — Kanban Pipeline Board & Daily Sync Summary Email

- [x] Frontend: Fix LeadsPipeline.tsx to use new paginated query shape (leadsData.leads instead of direct array)
- [x] Frontend: LeadsPipeline fetches all leads with pageSize=5000 so all stages are visible on the board
- [x] Backend: Add formResults field to SyncResult interface for per-form breakdown
- [x] Backend: Track per-form new leads and errors in the sync loop
- [x] Backend: Add sendLeadSyncSummaryEmail helper to emailService.ts
- [x] Backend: Rewrite metaLeadSyncScheduler.ts to accumulate daily results and send summary email at 08:00 Cairo time
- [x] Backend: Daily summary email includes per-form breakdown table, total new leads, duplicates skipped, and errors

## Security Hardening (Round 85)
- [x] API rate limiting — express-rate-limit on /api/trpc and /api/oauth endpoints
- [x] Session expiry — 8-hour JWT/cookie max-age, auto-logout on frontend when session expires
- [x] Audit log DB table — record user, action, resource, ip, timestamp for view/export/delete events
- [x] Audit log middleware — hook into tRPC procedures to log sensitive actions automatically
- [x] Audit log admin page — /admin/audit-log with filter by user, action, date range
- [x] Export Full Backup — admin-only procedure that dumps all tables as JSON/CSV zip download
- [x] Export Full Backup UI — button on admin page with progress indicator and download link

## Weekly Google Drive Backup (Round 86)
- [x] Build weeklyBackupScheduler.ts — runs every Friday at 08:00 Cairo, exports all DB tables as JSON, uploads to Google Drive "ELEVAY Backups" folder, sends confirmation email
- [x] Register weeklyBackupScheduler in server entry point
- [x] Show last backup date/status on Security & Audit page

## Performance & Pipeline Bugs (Round 87)
- [x] Fix slow All Leads page and Pipeline page loading — add DB indexes and optimise query
- [x] Fix "Contacted" stage leads not showing in pipeline Kanban view

## Leads List UX (Round 87b)
- [x] Page-size selector (25/50/100/200/300) in Leads list
- [x] Select-all across all pages with bulk actions (delete, change stage, assign)

## Leads CRM Email Notifications (Round 88)
- [x] Meta sync email alert to Mahmoud.saber@elevay.com + Nouran.mamdouh@elevay.com with campaign name, form name, new lead count
- [x] Lead assignment email to new owner with lead name, phone, program, and deep link

## Leads Module Improvements (Round 89)
- [x] Owner change button inside lead detail page (with email notification to new owner)
- [x] Fix program filter (partial/case-insensitive match), add date range, owner, and stage filters to All Leads page
- [x] Meta lead form: custom lead source field per form — leads from that form use that source
- [x] Leads Reporting page: user activity report (total activities per user per time frame)
- [x] Leads Reporting page: new leads count and stage change report per time frame

## Leads Reporting Enhancements (Round 90)
- [x] Multi-select activity type filter in Team Activity report tab
- [x] Save filter as named preset (shared across all users in Leads module)
- [x] Load/delete saved presets from a dropdown in the Reporting page
- [x] All Leads page: multi-activity filter, date range, owner filter, saveable shared presets
- [x] Leads Reporting page: multi-activity filter with saveable shared presets
- [x] All Leads page: customizable column visibility (created date, last activity date, last activity type, etc.)

## CSV Import Enhancements (Round 90)
- [x] CSV import: add field mapping for created date, current stage, last activity date, last activity type

## Marketing Module
- [x] Add Marketing module card to home page
- [x] Add Marketing module navigation in DashboardLayout sidebar
- [x] Add Marketing module permissions (Marketing module is always visible to all authenticated users)
- [x] Build Summary Generator — database schema (marketing_summaries table)
- [x] Build Summary Generator — tRPC procedures (create, list, get, update, delete, export)
- [x] Build Summary Generator — frontend document editor with page templates
- [x] Build Summary Generator — Cover, Overview, Eligibility, Process, About Country page templates
- [x] Build Summary Generator — PDF export (browser print-to-PDF with full country photos and ELEVAY logo on every page)
- [x] Build Program Enhanced Comparison page (placeholder built)
- [x] Build Program Proposal page (placeholder built)

## Marketing Module Rebuild (Round 91)
- [x] Rebuild Summary Generator — remove auto-generated photos, add user photo upload per page
- [x] Rebuild Summary Editor — 5 structured page templates (Cover, Programme Overview, Eligibility, Process, About Country, Custom Blank)
- [x] Cover template: 50/50 split, left=uploaded photo, right=ELEVAY branding + teal banner with country name
- [x] Programme Overview template: two-column, left=coat of arms + info rows, right=uploaded photo
- [x] Eligibility template: two-column, left=numbered requirements (red badges), right=ideal candidate box
- [x] Process template: two-column, left=stages with dividers, right=fees table
- [x] About Country template: two-column, left=uploaded photo, right=country info + rankings box
- [x] Custom Blank template: user-selectable layout (1-col, 2-col, 3-col, full-width) with content blocks
- [x] Backend: S3 upload procedure for summary page photos (uploadPagePhoto mutation)
- [x] PDF export: print-ready output matching exact template designs (browser print dialog, A4 format)

## WhatsApp QC Improvements (Round 92)
- [x] Delete old Meta API config (phoneNumberId 998041256728259) — only Baileys bridge config remains
- [x] Add Load More pagination to Conversations view (50 msgs per page, "Load older messages" button at top)
- [x] fromMe column added to wa_messages — outgoing messages align to right side in chat view
- [x] Delete all previous WhatsApp chat history except Test group (120363411143913384)

## WhatsApp Pipeline Permanent Fixes (Round 93)
- [x] Harden Baileys webhook handler: validate required fields, log every success/failure with emoji markers
- [x] Fix senderId fallback so messages never fail on NOT NULL constraint
- [x] Fix messageType validation to map unknown types to "unknown" enum value
- [x] Fix Refresh button (top-right) to call handleManualRefresh — refreshes both conversations list AND messages
- [x] Fix in-chat reload button to call handleManualRefresh with spinning animation while loading
- [x] Remove Chats and Groups tabs from sidebar (only Conversations, AI Query, Media, Settings remain)
- [x] Fix sendReply to use Baileys bridge /send endpoint instead of deleted Meta API
- [x] Add POST /send endpoint to Baileys bridge for outgoing messages
- [x] Verified end-to-end: incoming (fromMe=false) and outgoing (fromMe=true) messages both stored correctly

## WhatsApp Media & Voice Transcription (Round 94)
- [x] Bridge: download media (audio/image/video) using downloadMediaMessage and send as base64 in webhook payload
- [x] DB schema: add mediaUrl (TEXT), mediaMimeType (VARCHAR), transcript (TEXT), transcriptLang (VARCHAR) columns to wa_messages
- [x] Backend: receive base64 media in webhook, upload to S3, store mediaUrl in wa_messages
- [x] Backend: for audio messages, call Whisper transcription API and save transcript + sender + timestamp
- [x] Frontend: show audio player for audio messages with transcript below (sender name, time, full transcript)
- [x] Frontend: show image viewer (click to expand) for image messages
- [x] Frontend: show video player for video messages
- [x] Frontend: show document download link for document messages

## WhatsApp QC Hardening (Round 95)
- [x] System messages (protocolMessage, senderKeyDistributionMessage) skipped and never stored
- [x] documentWithCaptionMessage (PDF in quoted reply) properly unwrapped to extract document + download media
- [x] Reaction messages show "Reacted: [emoji]" instead of [unknown]
- [x] fileName extracted from document messages and forwarded to server
- [x] Retry Transcription button added for stuck audio messages
- [x] PDF/Word document text extraction (pdf-parse + mammoth) with docText column
- [x] Google Drive weekly backup handler at /api/scheduled/waBackup
- [x] Manual "Run Backup Now" button in WaQcSettings
- [x] Auto-refresh set to 2 hours; manual Refresh button available
- [x] Message search searches both text content and transcript text
- [x] Copy button on transcripts

## Authentication & User Management (Round 96)
- [x] Add resetUserPassword tRPC procedure to systemRouter (input: userId, newPassword)
- [x] Add password reset UI to AdminPermissionsPanel (password input field + Reset button)
- [x] Add password reset success/error toast notifications
- [x] Test password reset with multiple users
- [x] Fix context.ts to handle both numeric IDs and string openIds from session tokens
- [x] Replace hardcoded 120001 owner ID checks with role-based authorization (ctx.user.role === 'admin')
- [x] Verify all 13 staff members are correctly displayed with correct emails
- [x] Save checkpoint with password reset feature and authentication fixes complete
- [x] Add changePassword tRPC procedure for users to change their own password
- [x] Create Profile page accessible to all users (/profile route)
- [x] Add "My Profile" option to user dropdown menu in DashboardLayout
- [x] Add Change Password form to Profile page with validation
- [x] Test password change feature with all users
- [x] Save checkpoint with Profile page and password change feature complete

## Contract Dynamic Family Members & Fees (Round 97)
- [x] Modify Spain contract template to add {{FAMILY_MEMBERS}} and {{CONTRACT_VALUE}} placeholders
- [x] Upload modified template to S3 storage
- [x] Update contractGenerator.ts to replace placeholders with actual values
- [x] Verify calculateContractValue() implements correct fee tiers (12000/13000/14000/15000)
- [x] Test contract generation with different family sizes
- [x] Save checkpoint with dynamic contract fees complete


## Reports Module (New - Round 51)

### Phase 1: Database & Backend
- [x] Create dailyQualificationReports table schema (date, totalLeads, totalQualified, notQualified, noAnswer)
- [x] Create dailyParalegalReports table schema
- [x] Create dailyFinancialReports table schema
- [x] Create dailyVisasReports table schema
- [x] Create dailyAttestationReports table schema
- [x] Create tRPC procedures for CRUD operations on all report types
- [x] Create tRPC procedures for date-range filtering

### Phase 2: Qualifications Tab
- [x] Build QualificationsReports component with data table
- [x] Implement "Enter new Daily Report" button and form
- [x] Add date filtering (today, yesterday, this week, last week, last month, last year, custom range)
- [x] Implement PDF export functionality for Qualifications report
- [x] Add tests for Qualifications report functionality

### Phase 3: Paralegal Tab Implementation
- [x] Create paralegalClientRecords table with client references
- [x] Build ParalegalReports component with client search and form
- [x] Implement date filtering for paralegal records
- [x] Implement PDF export for paralegal reports
- [x] Add tRPC procedures for paralegal client records
- [x] Add financial clients lookup procedure

### Phase 4: Remaining Tabs (Financial, Visas, Attestation)
- [x] Build Financial tab component (placeholder)
- [x] Build Visas tab component (placeholder)
- [x] Build Attestation tab component (placeholder)
- [x] Add routing for all tabs

### Phase 4: Attestation Tab Implementation
- [x] Create attestationClientRecords table with client references
- [x] Build AttestationReports component with client search and form
- [x] Implement date filtering for attestation records
- [x] Implement PDF export for attestation reports
- [x] Add tRPC procedures for attestation client records
- [x] Add financial clients lookup procedure for attestation

### Phase 5: Visas Tab Implementation
- [x] Create visaClientRecords table with client references
- [x] Build VisasReports component with client search and form
- [x] Implement date filtering for visa records
- [x] Implement PDF export for visa reports
- [x] Add tRPC procedures for visa client records
- [x] Add financial clients lookup procedure for visas

### Phase 6: Financial Tab Implementation
- [x] Create financialMonthlySummary table with multi-currency support
- [x] Build FinancialReportsPage component with form and table
- [x] Implement currency conversion (EGP, USD, EUR)
- [x] Implement date filtering for financial summaries
- [x] Implement PDF export for financial reports
- [x] Add tRPC procedures for financial monthly summaries
- [x] Add currency conversion procedure

### Phase 7: Final Integration & Testing
- [x] Create Reports module shell with tab navigation
- [x] Add Reports to main dashboard navigation
- [x] Write comprehensive tests for all report types (62 tests, all passing)
- [x] Verify PDF export works for all report types
- [x] Fix test data isolation issues
- [x] Save final checkpoint with all tabs complete


## Bug Fixes (Round 52)
### Critical Issues
- [x] Fix client name dropdown in Paralegal tab (created clientSearchHelper.ts with proper database queries)
- [x] Fix client name dropdown in Attestation tab (integrated with new clientSearch endpoint)
- [x] Fix PDF export in Qualifications tab (installed jsPDF and html2canvas)
- [x] Add Edit/Delete buttons to Qualifications tab (full CRUD with ID-based operations)
- [x] Add Edit/Delete buttons to Paralegal tab (full CRUD with ID-based operations)
- [x] Add Edit/Delete buttons to Attestation tab (full CRUD with ID-based operations)
- [x] Add Edit/Delete buttons to Visas tab (full CRUD with ID-based operations)
- [x] Add Edit/Delete buttons to Financial tab (full CRUD with ID-based operations)

### Completed Implementations
- [x] Created clientSearchHelper.ts with searchFinClientsForDropdown procedure
- [x] Added clientSearch router to reports endpoint
- [x] Updated Paralegal, Attestation, and Visas tabs to use new client search
- [x] Fixed field name references (clientName → name) to match database schema
- [x] All tabs now properly sync with Financial module client database

## Bug Fixes (Round 53)
### Critical DB Helper Return Value Fixes
- [x] Fix financialDb.ts listFinancialSummaries: return result[0] (rows array) instead of raw execute tuple
- [x] Fix financialDb.ts getFinancialSummary: return rows[0] instead of tuple[0]
- [x] Fix attestationDb.ts listAttestationClientRecords: return result[0] (rows array) instead of raw execute tuple
- [x] Fix attestationDb.ts getAttestationClientRecord: return rows[0] instead of tuple[0]
- [x] Fix visaDb.ts listVisaClientRecords: return result[0] (rows array) instead of raw execute tuple
- [x] Fix visaDb.ts getVisaClientRecord: return rows[0] instead of tuple[0]
- [x] Remove non-existent trpc.reports.financialMonthlySummary.convert.useQuery call from FinancialReportsPage
- [x] Change Financial tab default date range from "last_month" to "today" for consistency
- [x] Remove old reports-old.ts file that was causing TypeScript errors
- [x] Add reportsDbFix.test.ts with 12 tests verifying proper row/id/date return values (all passing)

## Change Requests (Round 54)
- [x] Add Reports module card to ElevayHome page (module selection grid)
- [x] Update Spain contract template: add "او من ينوب عنه (السيدة/ مادونا عادل مرجان واصف)" after first party representative line

## Change Requests (Round 55)
- [x] Financial Reports tab: change default date range to "All Time" so all records show by default
- [x] Financial Reports tab: add "All Time" option to date range dropdown
- [x] Financial Reports tab: fix query to always be enabled when "All Time" is selected (no date filter passed)
- [x] Financial Reports tab: update empty state message for "All Time" mode

## Change Requests (Round 56)
- [x] Add Reports module to permissionsRouter.ts (ModuleName, ALL_MODULES, DEFAULT_MODULE_ACCESS=full, MODULE_PAGE_KEYS, ALL_PAGE_KEYS, setModuleAccess enum)
- [x] Add Reports module to AdminPermissionsPanel.tsx UI (MODULES list, initial state, load state)
- [x] Grant all 19 existing users full access to reports module via SQL (modulePermissions + userPermissions tables)

## Bug Fix (Round 57)
- [x] Remove UNIQUE constraint on summaryDate in financialMonthlySummary table — was silently blocking second report entries on the same date

## Bug Fix (Round 58)
- [x] Fix Reports route PageGuard missing pageKey prop — was passing undefined to canAccess() causing all non-owner users to get "Access Restricted" even with full permissions in DB

## Bug Fix (Round 59)
- [x] WhatsApp Control showing no messages/conversations — all users had waQc module access = "none" in DB, blocking all API calls with FORBIDDEN. Granted all users full access and changed default from "none" to "full" so new users get access automatically.

## Bug Fix (Round 60)
- [x] Leads Report Team Activity showing "User #ID" instead of names — wrong procedure name `trpc.admin.listUsers` (doesn't exist), fixed to `trpc.admin.getAllUsers`

## Feature Requests (Round 61)
- [x] Leads Reports: Add "Stage Changed From" and "Stage Changed To" filter dropdowns to Stage Changes tab (with "All" option for each)
- [x] Leads Reports: Add "Today Activity" tab showing: (a) count of leads with each activity type today (call, whatsapp, sms, email, meeting, note, status update), (b) today's stage changes breakdown by from→to pair with lead counts
- [x] Backend: getTodayActivityReport() function in leadsDb.ts — counts distinct leads per activity type today, aggregates stage change pairs
- [x] Backend: getStageChangeReport() updated to accept fromStage/toStage filters and return parsed fromStage/toStage fields
- [x] Backend: todayActivity procedure added to leads.reporting router
- [x] Frontend: stageMatrix parsing fixed to use new fromStage/toStage fields from backend (was using old regex)
- [x] Frontend: STAGE_LABELS updated to include resubmit
- [x] Frontend: TODAY_ACTIVITY_LABELS constant added with emoji/color per activity type

## Feature Update (Round 62)
- [x] Update Marketing Plan Generator with new ELEVAY Marketing Guidelines PDF:
  - [x] marketingTemplates.ts: Updated all 17 staticImagePrompt strings — removed navy (#1A3A5C), gold (#C9A84C), old teal (#5BA3B8); replaced with baby blue (#B3CFD4), sage (#CCDBD5), deep teal (#809CA1); changed layout from "banner at bottom" to editorial/floating/diagonal-cut layouts; removed Arabic text from image prompts
  - [x] marketingRouter.ts: Updated staticPrompt builder (line 458) with new brand colors and editorial layout rules
  - [x] marketingRouter.ts: Updated LLM JSON schema (lines 705-709) — all 5 post manusImagePrompt templates now use new palette, English-only text in images, no gold, no dark navy, creative editorial layouts


## Feature: Automated Weekly Database Backups (Round 63)
- [x] Create complete database backup script using mysqldump
- [x] Script uploads compressed backup to S3
- [x] Email notification sent to mahmoud.saberelevay@gmail.com with download link
- [x] Backup script location: /home/ubuntu/backup_database.sh
- [x] Add password encryption (3488) to all backup files using 7zip
- [x] Fix TiDB Cloud SAVEPOINT error (removed --single-transaction, added --skip-lock-tables --no-tablespaces)
- [x] Update email notifications to both mahmoud.saberelevay@gmail.com and mahmoud.saber@elevay.com
- [x] Set up Google Drive OAuth credentials and folder integration for automatic backup uploads
- [x] Update backup script to automatically upload encrypted backups to Google Drive
- [x] Update googleDrive.ts helper to use GDRIVE_FOLDER_ID for backup uploads
- [x] Set up cron jobs on cloud computer for 4 weekly backups (Mon-Thu 18:00 Cairo)
- [x] Add backup history page to admin panel to show all backups and restore options

**Manual Backup Instructions:**
Run anytime: `bash /home/ubuntu/backup_database.sh`
Check email for download link within 5 minutes

**To Restore a Backup:**
1. Download the backup file from email link
2. Run: `mysql -u root -p < elevay-full-backup-YYYY-MM-DD_HH-MM-SS.sql`
3. System will be restored to that point in time with all data intact

## Change Requests (Round 58) — After Discount Column

- [x] Add "After Discount" column to FinClients table (between Contract Value and Paid EUR columns)
- [x] After Discount shows net value: contractValueEur - discountValue (from contracts table)
- [x] Fix 3 clients (26079/26080/26081) where contractValueEur stored NET value instead of ORIGINAL
- [x] Update contracts.contractValue to match finClients.contractValueEur (ORIGINAL) for all 15 discounted clients with code >= 26035
- [x] Verify remainingAmountEur is correct for all fixed clients
- [x] Method applied to ALL clients with code starting from 26035

## Change Requests (Round 61) — Reporting Module All Time Filter

- [x] Add "All Time" filter option to Qualifications Reports (was missing, defaulted to Today)
- [x] Add "All Time" filter option to Paralegal Reports (was missing, defaulted to Today)
- [x] Add "All Time" filter option to Visas Reports (was missing, defaulted to Today)
- [x] Add "All Time" filter option to Attestation Reports (was missing, defaulted to Today)
- [x] Set default filter to "All Time" across all report tabs so all previously added reports appear immediately
- [x] Financial Reports already had "All Time" — confirmed working correctly

## Change Requests (Round 62) — Qualification Report Auto-Calculated Columns

- [x] Add "Qualification %" column = (Total Qualified / Total Leads) × 100
- [x] Add "Net Qualify %" column = (Total Qualified / (Total Leads - No Answer)) × 100

## Change Requests (Round 63) — Report Filters by Client Name/Code and Status

- [x] Paralegal Reports: Add filter by client name or code (shortlist/autocomplete as you type)
- [x] Paralegal Reports: Add filter by stage (Submitted/Approved)
- [x] Visa Reports: Add filter by client name or code (shortlist/autocomplete as you type)
- [x] Visa Reports: Add filter by status (Submitted/Finished) and visa type (Schengen/National)
- [x] Attestation Reports: Add filter by client name or code (shortlist/autocomplete as you type)
- [x] Attestation Reports: Add filter by type (Submitted/Finished)

## Change Requests (Round 64)

- [x] Add admin-only delete for contracts (only owner/admin can delete)
- [x] Add admin-only delete for invoices/receipts (restrict existing delete to admin only)
- [x] Add admin-only delete for proforma invoices (only owner/admin can delete)
- [x] Show delete buttons in frontend only for admin users

## Change Requests (Round 65)

- [x] Update backup scheduler from Friday-only to Mon-Thu at 18:00 Cairo time
- [x] Add AES-256-CBC encryption to database backups before uploading to Google Drive
- [x] Send email notifications to mahmoud.saberelevay@gmail.com and mahmoud.saber@elevay.com
- [x] Fix sendBackupNotification call signature mismatch (was causing [object Object] in emails)
- [x] Fix type comparison errors in backups.ts (ctx.user.id number vs OWNER_OPEN_ID string)
- [x] Create /home/ubuntu/backup_final.sh playbook script

## Change Requests (Round 66)

- [x] Fix marketing plan generator to produce 5 reels per week instead of 3
- [x] Changed all 5 days from "Reel/Static Design" alternating to "Static Design + Reel" for each day
- [x] Updated AI prompt template to include 5 reel examples (was 3)
- [x] Updated overview postsPerWeek to 10 (5 static + 5 reels)

## Change Requests (Round 67)

- [x] Upgrade all 9 reel templates from 4 scenes to 5 cinematic scenes (added emotional climax scene)
- [x] Rewrite all 9 static image prompts: remove sculptural/portal approach, replace with clean marketing designs (split layout + hero photo + clear typography)
- [x] Update AI prompt template in marketingRouter.ts to instruct clean marketing design instead of sculptural concepts
- [x] Update ANTI_PATTERNS to explicitly ban sculptures, portals, museum installations, abstract art
- [x] Update visualStyle label from "Editorial Luxury v2" to "Clean Marketing Design v3"

## Change Requests (Round 68)

- [x] Fix Consultant Yearly Signing on Financial Dashboard: query finClients.salesPerson + signingDate instead of clientCases.consultant + createdAt
## Change Requests (Round 69)
- [x] Update marketingRouter.ts AI prompt template with full ELEVAY brand system spec
- [x] Add brand identity section: 5 messaging pillars (Family Security, Global Mobility, Long-term Planning, Premium Service, Ethical Advisory)
- [x] Add strict color usage rules: Off-White #FFEBDA dominant, Baby Blue #5BA3B8 primary accent, Dark Navy ≤5%, Gold ≤5% CTA only
- [x] Add typography rules: Apex Sans, sentence case, editorial asymmetric layouts
- [x] Add photography direction: warm natural-light editorial, Arab/Middle Eastern subjects
- [x] Add motion rules for reels: no on-screen text overlays, logo on pure white static 3s ending
- [x] Update posts JSON schema: add day, messagingPillar, format, headlineEn, supportingCopyEn, complianceLine fields
- [x] Update reels JSON schema: add day, messagingPillar, targetProgram, captionAr, complianceLine, clipDuration fields
- [x] Remove voiceOverAr from reels (background music only per brand spec)
- [x] Update contentPillars from generic 4 to brand-aligned 5 messaging pillars
- [x] Update reel scene 5 to mandatory ELEVAY logo on pure white, static, no animation
## Change Requests (Round 70)
- [x] Ensure all team members have full access to Contracting module (create contracts, receipts, invoices)
- [x] Keep delete functionality restricted to admin only
## Bug Fixes (Round 71)
- [x] Fix Consultant Yearly Signing (2026) showing 0 for all consultants - should count from financial clients by consultant and signing date in 2026
## Change Requests (Round 72)
- [x] Create scheduled database backup with AES-256 encryption, email to mahmoud.saberelevay@gmail.com and mahmoud.saber@elevay.com, Mon-Thu 18:00 Cairo
## Mobile App PWA (Round 73)
- [x] PWA manifest.json and service worker for installability
- [x] Mobile detection and responsive layout with bottom tab navigation
- [x] Mobile Home dashboard (quick stats, module shortcuts)
- [x] Mobile Financial module (dashboard, clients, income/expenses)
- [x] Mobile Leads module (pipeline, lead details, quick actions)
- [x] Mobile Contracting module (contracts list, create, receipts)
- [x] Mobile Client Documentation module
- [x] Mobile Application Analysis module
- [x] Mobile Marketing module
## Apple App Store Compliance (Round 74)
- [x] DB: Create deletionRequests table (id, userId, fullName, email, phone, company, reason, status, adminNotes, createdAt, completedAt, deletedData, retainedData, retainedReason)
- [x] DB: Create supportTickets table (id, name, email, category, subject, description, attachmentUrl, status, createdAt)
- [x] DB: Create consentRecords table (id, userId, policyVersion, termsVersion, consentTimestamp)
- [x] DB: Create auditLogs table (id, userId, action, details, ipAddress, createdAt)
- [x] Public page: /privacy-policy (no login required, responsive, ELEVAY branded)
- [x] Public page: /terms (Terms & Conditions, no login required)
- [x] Public page: /support (contact form, FAQ, no login required)
- [x] Public page: /account-deletion (deletion request form, no login required)
- [x] In-app: Account Deletion flow (Profile → Delete Account with warnings, confirmation, email)
- [x] In-app: Privacy & Data settings page (Settings → Privacy and Data)
- [x] Admin: Privacy & Deletion Requests management page (view, verify, process, export)
- [x] Apple Review account: Create dedicated login (apple.review@elevay.com / AppleReview2026!)
- [x] Apple Review account: Populate with sample data (full module access granted)
- [x] Support form: Backend endpoint + email to support@elevay.com
- [x] Footer: Add legal links to all public pages
- [x] Apple App Review Instructions document (APPLE_REVIEW_INSTRUCTIONS.md)
## Public Pages Fix (Round 75)
- [x] Fix public pages (Privacy Policy, Terms, Support, Account Deletion) showing 404 on mobile
- [x] Convert public pages from SPA client-side routes to server-rendered HTML via Express
- [x] Register publicPagesHandler.ts routes BEFORE tRPC middleware and SPA fallback
- [x] Pages now serve full HTML with inline CSS — no JS bundle dependency
- [x] Verified all 4 pages return HTTP 200 with correct content
## Public Pages Rework (Round 75b)
- [x] Make /privacy-policy, /terms, /support, /account-deletion accessible without login (bypass auth)
- [x] Add these 4 pages as sidebar links at the bottom (like Settings)
- [x] Add small footer links on the home page below "8 Modules, Unlimited Possibilities"
- [x] Keep server-rendered publicPagesHandler as fallback + SPA routes as primary
- [x] Add legal page links to mobile "More" menu (Privacy Policy, Terms, Support, Account Deletion)
## Auth-Deferred Home Page (Round 75c)
- [x] Make ElevayHome render without authentication (show module cards to everyone)
- [x] When unauthenticated user clicks a module, redirect to login instead of navigating
- [x] Show "Sign In" button in header for unauthenticated users (instead of user avatar)
- [x] Public pages (/privacy-policy, /terms, /support, /account-deletion) now load naturally since SPA loads without auth gate
- [x] MobileLayout: bypass auth gate on public paths (/, /privacy-policy, /terms, /support, /account-deletion)
- [x] MobileHome: guard protected queries with enabled: !!user, add handleNav login redirect
- [x] main.tsx: skip global login redirect on PUBLIC_PATHS
- [x] MobileNotificationBell: guard query with enabled: !!user
- [x] Hide bottom tab bar for unauthenticated mobile users
## Database Backup Heartbeat Cron (Round 76)
- [x] Register Heartbeat cron job "db-backup-daily" — Mon-Thu 18:00 Cairo (15:00 UTC)
- [x] Task UID: 35xAWZJMQcb3whajGuJ6qL
- [x] Handler: /api/scheduled/dbBackup (already deployed)
- [x] Features: AES-256 encryption, email to mahmoud.saberelevay@gmail.com + mahmoud.saber@elevay.com, S3 upload, download link
## Apple App Site Association (Round 76b)
- [x] Add /.well-known/apple-app-site-association endpoint (application/json, Team ID: 8M53HJ223G, Bundle: com.app.elevaymobile)
- [x] Serves universal links (applinks) and web credentials (webcredentials)
## Mobile Sidebar Toggle (Round 77)
- [x] Add sidebar toggle button in mobile header (top-left, PanelLeft icon like screenshot)
- [x] Slide-out left navigation panel with all 12 modules when tapped
- [x] Show current page name next to the sidebar icon (e.g. "Dashboard", "Financial", "Leads")
- [x] Sidebar includes user info footer with Sign Out button
- [x] Available on all mobile pages, highlights active module
## Commission DB Client Search Autocomplete (Round 78)
- [x] Replace plain text input with searchable autocomplete for client name in Commission DB form
- [x] Searches by both client name and client code (e.g. typing "260" shows clients with code starting with 260)
- [x] Dropdown shows matching clients with name and code, click to select
- [x] Close dropdown on outside click
## Commission Receipt Access Fix (Round 79)
- [x] Add madonna.adel@elevay.com to READONLY_EMAILS in finRouter.ts so she can access employees list and clients list for commission receipts
## Signing Date = First Receipt Paid Date (Round 80)
- [x] Change auto-sync: when contract is signed, set signingDate to undefined (not new Date())
- [x] When receipt is marked as paid and finClient has no signingDate, set it to current date
- [x] When receipt creates a new finClient (no existing), set signingDate to current date (paid date)
- [x] Backfill all existing finClients: signingDate = MIN(invoices.paidAt) for their contractId
- [x] Backfill finCommissions signingDate to match their linked finClient signingDate
## Receipt Payment EUR Fix (Round 81)
- [x] Fix markPaid: when actualPaidAmountEgp exists, record EUR equivalent (actualPaidEgp / exchangeRate) in payments table instead of full receipt amountEur
- [x] Fix receipt creation: use actual paid EUR equivalent for remaining balance calculation and PDF
- [x] Fix legacy receipt creation: use actual paid EUR equivalent for finTotalPaid calculation
- [x] Fix finClient auto-creation on markPaid: use actual paid EUR for paidAmountEur
## Commission Receipt Date Filters (Round 82)
- [x] Add date range filter to Commission Receipts: Today, This Week, This Month, This Year, Custom Range, All Time
- [x] Add sum total EUR and EGP for the filtered view
- [x] Show receipt count for current filter
## Client Paid Amount = Sum of Paid Receipts (Round 83)
- [x] Create recalcClientPaidFromReceipts helper: sums all paid receipts for a contract, uses actualPaidEgp/rate when available
- [x] Create recalcLegacyClientPaidFromReceipts helper for legacy clients
- [x] After markPaid: call recalcClientPaidFromReceipts to update finClient
- [x] After deleteInvoice: delete payment record + recalculate client paid amount
- [x] Backfill all non-legacy clients: paidAmountEur = sum of paid receipts (actual EUR equivalent)
- [x] Clients with no paid receipts set to paidAmountEur = 0, remainingAmountEur = contractValueEur
## Login Session Token in Response Body (Round 84)
- [x] Add sessionToken to POST /api/auth/login JSON response body for React Native iOS compatibility
## MCP Server for AI Agent Integration (Round 85)
- [x] Install mcp-handler package
- [x] Create mcpServer.ts with 7 CRM tools (search_clients, list_contracts, list_receipts, get_financial_summary, search_leads, get_client_details, get_dashboard_stats)
- [x] Register MCP server at /api/mcp endpoint
- [x] Fix Zod v4 compatibility for schema serialization
- [x] Test all tools working with MCP protocol (Streamable HTTP transport)

## Browser Credential-Saving Prevention
- [x] Add best-effort autocomplete and browser credential-saving prevention attributes to the login form without changing authentication behavior
- [x] Add no-store response headers for the login page and authentication response where appropriate
- [x] Verify login still works and document that browsers/password managers cannot be universally forced to forget credentials

## Require Password on Each New Browser Session
- [x] Make web login cookies session-only so users must sign in again after closing the browser
- [x] Preserve explicit token-based authentication for the React Native mobile app
- [x] Verify login, logout, and session expiry behavior

## Manus OAuth Login Error
- [x] Reproduce and identify the cause of the “Authorize params not found” response
- [x] Correct the OAuth authorization initiation without weakening session-only browser authentication
- [x] Verify email/password login, Manus OAuth initiation, callback routing, and mobile token compatibility

## Contracting Receipt Date Management
- [x] Add a user-selectable receipt date when creating contract and legacy receipts
- [x] Allow authorized users to edit the date of existing receipts
- [x] Regenerate receipt PDFs after receipt-date changes while preserving the separate paid-at/payment date
- [x] Verify new and existing receipt date flows without changing financial amounts

## Contract Consultant Editing and Client Filter Alignment
- [x] Add an authorized Change Consultant action to every existing contract
- [x] Synchronize consultant changes to the linked Financial Client and Commission records
- [x] Normalize existing consultant values to Mahmoud Saber, Fouad Abdo, Ziad El Shurafa, and Kirolos Nabil
- [x] Update the Financial Client consultant filter to use the exact full names from contract creation
- [x] Verify consultant editing and filtering without changing contract or financial amounts

## Client Signing-Date Corrections
- [x] Set client 26091 signing date to 20 August 2026
- [x] Set client 26085 signing date to 30 July 2026
- [x] Synchronize linked Commission signing dates and verify both records

## Client Signing-Date Custom Range Filter
- [x] Add Custom Range to the Client Database signing-date filter
- [x] Add From and To date controls with inclusive range behavior
- [x] Apply the custom range to client list, count, totals, pagination, and exports
- [x] Verify preset filters continue to work unchanged

## Default ELEVAY Login Routing
- [x] Stop default sign-in controls and unauthorized redirects from sending users to the Manus platform
- [x] Route users to the internal ELEVAY `/login` page and preserve their requested destination
- [x] Verify password login, logout, session-only behavior, mobile login, and optional Manus OAuth remain functional

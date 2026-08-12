import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import ElevayHome from "./pages/ElevayHome";
import Login from "./pages/Login";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsConditions from "./pages/TermsConditions";
import SupportPage from "./pages/SupportPage";
import AccountDeletion from "./pages/AccountDeletion";
import TeamChat from "./pages/TeamChat";
import BroadcastCenter from "./pages/BroadcastCenter";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import PageGuard from "./components/PageGuard";

// ─── Application Analysis Module ─────────────────────────────────────────────
import AnalysisDashboard from "./pages/AnalysisDashboard";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import UploadWizard from "./pages/UploadWizard";
import AnalysisReport from "./pages/AnalysisReport";

// ─── Client Documentation Module ─────────────────────────────────────────
import ClientDocs from "./pages/ClientDocs";
import ClientDocsDashboard from "./pages/ClientDocsDashboard";
import ClientDocDetail from "./pages/ClientDocDetail";
import WorkflowPage from "./pages/WorkflowPage";
import NationalVisaPage from "./pages/NationalVisaPage";

// ─── Contracting Module ─────────────────────────────────────────────
import ContractingDashboard from "./pages/ContractingDashboard";
import Contracts from "./pages/Contracts";
import Invoices from "./pages/Invoices";
import ProformaInvoices from "./pages/ProformaInvoices";
import Analytics from "./pages/Analytics";

// ─── Financial Module ─────────────────────────────────────────────
import FinancialDashboard from "./pages/FinancialDashboard";
import FinAccounts from "./pages/FinAccounts";
import FinIncome from "./pages/FinIncome";
import FinExpenses from "./pages/FinExpenses";
import FinTransfers from "./pages/FinTransfers";
import FinReports from "./pages/FinReports";
import FinEmployees from "./pages/FinEmployees";
import FinCategories from "./pages/FinCategories";
import FinCommissions from "./pages/FinCommissions";
import FinBulkUpload from "./pages/FinBulkUpload";
import FinClients from "./pages/FinClients";
import FinSettlement from "./pages/FinSettlement";
import UpcomingPayments from "./pages/UpcomingPayments";
import PermissionsManager from "./pages/PermissionsManager";
import AccessDenied from "./pages/AccessDenied";
import SalaryReceipts from "./pages/SalaryReceipts";
import CommissionReceipts from "./pages/CommissionReceipts";

// ─── Leads CRM Module ─────────────────────────────────────────────
import LeadsDashboard from "./pages/leads/LeadsDashboard";
import LeadsList from "./pages/leads/LeadsList";
import LeadsPipeline from "./pages/leads/LeadsPipeline";
import LeadProfile from "./pages/leads/LeadProfile";
import LeadsSettings from "./pages/leads/LeadsSettings";
import LeadsMetaExport from "./pages/leads/LeadsMetaExport";
import LeadsReporting from "./pages/leads/LeadsReporting";
import TasksPage from "./pages/leads/TasksPage";

import AdminSecurity from "@/pages/AdminSecurity";
import AdminPrivacy from "@/pages/AdminPrivacy";

// ─── Marketing Module ─────────────────────────────────────────────────────────
import MarketingDashboard from "./pages/marketing/MarketingDashboard";
import SummaryGenerator from "./pages/marketing/SummaryGenerator";
import SummaryEditor from "./pages/marketing/SummaryEditor";
import ProgramComparison from "./pages/marketing/ProgramComparison";
import ProgramProposal from "./pages/marketing/ProgramProposal";
import MarketingPlan from "./pages/marketing/MarketingPlan";

// ─── Reports Module ─────────────────────────────────────────────────────────────
import Reports from "./pages/Reports";

// ─── Backup Module ─────────────────────────────────────────────────────────────
import { BackupDownloadPublic } from "./pages/BackupDownloadPublic";
import BackupPreview from "./pages/BackupPreview";
import BackupHistory from "./pages/BackupHistory";
// ─── Mobile App ─────────────────────────────────────────────────────────────
import MobileLayout from "./components/MobileLayout";
import MobileHome from "./pages/MobileHome";
import { useIsMobile } from "./hooks/useMobile";

// ─── WhatsApp Quality Control Module ─────────────────────────────────────────
import WaQcDashboard from "./pages/waQc/WaQcDashboard";
import WaQcChats from "./pages/waQc/WaQcChats";
import WaQcConversations from "./pages/waQc/WaQcConversations";
import WaQcAIQuery from "./pages/waQc/WaQcAIQuery";
import WaQcGroups from "./pages/waQc/WaQcGroups";
import WaQcMedia from "./pages/waQc/WaQcMedia";
import WaQcSettings from "./pages/waQc/WaQcSettings";
import AiCouncil from "./pages/AiCouncil";

function Router() {
  return (
    <Switch>
      {/* ── Public Legal Pages (no auth required) ── */}
      <Route path="/privacy-policy">
        <PrivacyPolicy />
      </Route>
      <Route path="/terms">
        <TermsConditions />
      </Route>
      <Route path="/support">
        <SupportPage />
      </Route>
      <Route path="/account-deletion">
        <AccountDeletion />
      </Route>
      {/* Login page */}
      <Route path="/login">
        <Login />
      </Route>

      {/* Root — Elevay Home (dual-state landing page) */}
      <Route path="/">
        <ResponsiveHome />
      </Route>

      {/* Profile — User profile and password change */}
      <Route path="/profile">
        <MobileRoute><Profile /></MobileRoute>
      </Route>

      {/* ── Contracting Module ── */}
      <Route path="/contracting">
        <PageGuard pageKey="contracts"><MobileRoute><ContractingDashboard /></MobileRoute></PageGuard>
      </Route>
      <Route path="/contracting/contracts">
        <PageGuard pageKey="contracts"><MobileRoute><Contracts /></MobileRoute></PageGuard>
      </Route>
      <Route path="/contracting/invoices">
        <PageGuard pageKey="receipts"><MobileRoute><Invoices /></MobileRoute></PageGuard>
      </Route>
      <Route path="/contracting/proforma">
        <PageGuard pageKey="receipts"><MobileRoute><ProformaInvoices /></MobileRoute></PageGuard>
      </Route>
      <Route path="/contracting/analytics">
        <PageGuard pageKey="contracts"><MobileRoute><Analytics /></MobileRoute></PageGuard>
      </Route>

      {/* ── Application Analysis Module ── */}
      <Route path="/analysis/dashboard">
        <PageGuard pageKey="analysis_dashboard"><MobileRoute><AnalysisDashboard /></MobileRoute></PageGuard>
      </Route>
      <Route path="/analysis">
        <PageGuard pageKey="cases"><MobileRoute><Cases /></MobileRoute></PageGuard>
      </Route>
      <Route path="/analysis/cases/:id">
        <PageGuard pageKey="cases"><MobileRoute><CaseDetail /></MobileRoute></PageGuard>
      </Route>
      <Route path="/analysis/cases/:id/upload">
        <PageGuard pageKey="cases"><MobileRoute><UploadWizard /></MobileRoute></PageGuard>
      </Route>
      <Route path="/analysis/cases/:id/report">
        <PageGuard pageKey="cases"><MobileRoute><AnalysisReport /></MobileRoute></PageGuard>
      </Route>

      {/* Legacy redirects for old /cases routes */}
      <Route path="/cases">
        <Redirect to="/analysis" />
      </Route>
      <Route path="/cases/:id">
        {(params) => <Redirect to={`/analysis/cases/${params.id}`} />}
      </Route>
      <Route path="/cases/:id/upload">
        {(params) => <Redirect to={`/analysis/cases/${params.id}/upload`} />}
      </Route>
      <Route path="/cases/:id/report">
        {(params) => <Redirect to={`/analysis/cases/${params.id}/report`} />}
      </Route>

      {/* ── Financial Module ── */}
      <Route path="/finance">
        <PageGuard pageKey="fin_dashboard"><MobileRoute><FinancialDashboard /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/accounts">
        <PageGuard pageKey="fin_accounts"><MobileRoute><FinAccounts /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/income">
        <PageGuard pageKey="fin_income"><MobileRoute><FinIncome /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/expenses">
        <PageGuard pageKey="fin_expenses"><MobileRoute><FinExpenses /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/transfers">
        <PageGuard pageKey="fin_transfers"><MobileRoute><FinTransfers /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/reports">
        <PageGuard pageKey="fin_reports"><MobileRoute><FinReports /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/employees">
        <PageGuard pageKey="fin_employees"><MobileRoute><FinEmployees /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/categories">
        <PageGuard pageKey="fin_categories"><MobileRoute><FinCategories /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/commissions">
        <PageGuard pageKey="fin_commissions"><MobileRoute><FinCommissions /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/bulk-upload">
        <PageGuard pageKey="fin_bulk_upload"><MobileRoute><FinBulkUpload /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/clients">
        <PageGuard pageKey="fin_clients"><MobileRoute><FinClients /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/settlement">
        <PageGuard pageKey="fin_settlement"><MobileRoute><FinSettlement /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/upcoming">
        <PageGuard pageKey="fin_upcoming"><MobileRoute><UpcomingPayments /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/salary-receipts">
        <PageGuard pageKey="fin_salary_receipts"><MobileRoute><SalaryReceipts /></MobileRoute></PageGuard>
      </Route>
      <Route path="/finance/commission-receipts">
        <PageGuard pageKey="fin_commission_receipts"><MobileRoute><CommissionReceipts /></MobileRoute></PageGuard>
      </Route>

      {/* ── Client Documentation Module ── */}
      <Route path="/docs/dashboard">
        <PageGuard pageKey="client_docs"><ClientDocsDashboard /></PageGuard>
      </Route>
      <Route path="/docs">
        <PageGuard pageKey="client_docs"><MobileRoute><ClientDocs /></MobileRoute></PageGuard>
      </Route>
      <Route path="/docs/clients/:id">
        <PageGuard pageKey="client_docs"><MobileRoute><ClientDocDetail /></MobileRoute></PageGuard>
      </Route>
      <Route path="/docs/workflow">
        <PageGuard pageKey="client_docs"><MobileRoute><WorkflowPage /></MobileRoute></PageGuard>
      </Route>
      <Route path="/docs/national-visa">
        <PageGuard pageKey="client_docs"><MobileRoute><NationalVisaPage /></MobileRoute></PageGuard>
      </Route>

      {/* ── Broadcast Center ── */}
      <Route path="/broadcast">
        <PageGuard pageKey="broadcast"><MobileRoute><BroadcastCenter /></MobileRoute></PageGuard>
      </Route>

      {/* ── Team Chat ── */}
      <Route path="/chat">
        <PageGuard pageKey="chat"><MobileRoute><TeamChat /></MobileRoute></PageGuard>
      </Route>

      {/* ── Settings ── */}

      {/* ── Settings (owner only) ── */}
      <Route path="/settings">
        <Settings />
      </Route>

      {/* ── Permissions Manager (owner only) ── */}
      <Route path="/admin/permissions">
        <MobileRoute><PermissionsManager /></MobileRoute>
      </Route>

      {/* ── Admin Security & Audit ── */}
      <Route path="/admin/security">
        <MobileRoute><AdminSecurity /></MobileRoute>
      </Route>

      {/* ── Admin Privacy & Deletion Requests ── */}
      <Route path="/admin/privacy">
        <MobileRoute><AdminPrivacy /></MobileRoute>
      </Route>

      {/* ── WhatsApp Quality Control Module ── */}
      <Route path="/wa-qc">
        <PageGuard pageKey="wa_qc"><MobileRoute><WaQcDashboard /></MobileRoute></PageGuard>
      </Route>
      <Route path="/wa-qc/chats">
        <PageGuard pageKey="wa_qc"><MobileRoute><WaQcChats /></MobileRoute></PageGuard>
      </Route>
      <Route path="/wa-qc/conversations">
        <PageGuard pageKey="wa_qc"><MobileRoute><WaQcConversations /></MobileRoute></PageGuard>
      </Route>
      <Route path="/wa-qc/ai-query">
        <PageGuard pageKey="wa_qc"><MobileRoute><WaQcAIQuery /></MobileRoute></PageGuard>
      </Route>
      <Route path="/wa-qc/groups">
        <PageGuard pageKey="wa_qc"><MobileRoute><WaQcGroups /></MobileRoute></PageGuard>
      </Route>
      <Route path="/wa-qc/media">
        <PageGuard pageKey="wa_qc"><MobileRoute><WaQcMedia /></MobileRoute></PageGuard>
      </Route>
      <Route path="/wa-qc/settings">
        <PageGuard pageKey="wa_qc"><MobileRoute><WaQcSettings /></MobileRoute></PageGuard>
      </Route>

      {/* ── Leads CRM Module ── */}
      <Route path="/leads">
        <MobileRoute><LeadsList /></MobileRoute>
      </Route>
      <Route path="/leads/dashboard">
        <MobileRoute><LeadsDashboard /></MobileRoute>
      </Route>
      <Route path="/leads/pipeline">
        <MobileRoute><LeadsPipeline /></MobileRoute>
      </Route>
      <Route path="/leads/settings">
        <MobileRoute><LeadsSettings /></MobileRoute>
      </Route>
      <Route path="/leads/meta-export">
        <MobileRoute><LeadsMetaExport /></MobileRoute>
      </Route>
      <Route path="/leads/reporting">
        <MobileRoute><LeadsReporting /></MobileRoute>
      </Route>
      <Route path="/leads/tasks">
        <MobileRoute><TasksPage /></MobileRoute>
      </Route>
      <Route path="/leads/:id">
        <MobileRoute><LeadProfile /></MobileRoute>
      </Route>

      {/* ── Marketing Module ── */}
      <Route path="/marketing">
        <MobileRoute><MarketingDashboard /></MobileRoute>
      </Route>
      <Route path="/marketing/summary-generator">
        <MobileRoute><SummaryGenerator /></MobileRoute>
      </Route>
      <Route path="/marketing/summary-generator/:id">
        <MobileRoute><SummaryEditor /></MobileRoute>
      </Route>
      <Route path="/marketing/program-comparison">
        <MobileRoute><ProgramComparison /></MobileRoute>
      </Route>
      <Route path="/marketing/program-proposal">
        <MobileRoute><ProgramProposal /></MobileRoute>
      </Route>
      <Route path="/marketing/marketing-plan">
        <MobileRoute><MarketingPlan /></MobileRoute>
      </Route>

      <Route path="/reports">
        <PageGuard pageKey="reports">
          <MobileRoute><Reports /></MobileRoute>
        </PageGuard>
      </Route>

      {/* ── Administrative AI Council ── */}
      <Route path="/ai-council">
        <PageGuard pageKey="ai_council"><MobileRoute><AiCouncil /></MobileRoute></PageGuard>
      </Route>

      {/* ── Backup & Recovery Module ── */}
      <Route path="/backup">
        <PageGuard pageKey="backup_dashboard">
          <MobileRoute><BackupDownloadPublic /></MobileRoute>
        </PageGuard>
      </Route>

      <Route path="/backup-preview">
        <PageGuard pageKey="backup_preview">
          <MobileRoute><BackupPreview /></MobileRoute>
        </PageGuard>
      </Route>

      <Route path="/backup-history">
        <PageGuard pageKey="backup_dashboard">
          <MobileRoute><BackupHistory /></MobileRoute>
        </PageGuard>
      </Route>

      <Route path="/access-denied">
        <AccessDenied />
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * ResponsiveHome — Shows MobileHome with MobileLayout on mobile, ElevayHome on desktop.
 */
function ResponsiveHome() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileLayout><MobileHome /></MobileLayout>;
  }
  return <ElevayHome />;
}

/**
 * MobileRoute — Wraps a page with MobileLayout on mobile, DashboardLayout on desktop.
 */
function MobileRoute({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
export default App;

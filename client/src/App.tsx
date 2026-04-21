import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import ElevayHome from "./pages/ElevayHome";
import TeamChat from "./pages/TeamChat";
import BroadcastCenter from "./pages/BroadcastCenter";
import Settings from "./pages/Settings";
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

function Router() {
  return (
    <Switch>
      {/* Root — Elevay Home (dual-state landing page) */}
      <Route path="/">
        <ElevayHome />
      </Route>

      {/* ── Contracting Module ── */}
      <Route path="/contracting">
        <PageGuard pageKey="contracts"><DashboardLayout><ContractingDashboard /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/contracting/contracts">
        <PageGuard pageKey="contracts"><DashboardLayout><Contracts /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/contracting/invoices">
        <PageGuard pageKey="receipts"><DashboardLayout><Invoices /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/contracting/proforma">
        <PageGuard pageKey="receipts"><DashboardLayout><ProformaInvoices /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/contracting/analytics">
        <PageGuard pageKey="contracts"><DashboardLayout><Analytics /></DashboardLayout></PageGuard>
      </Route>

      {/* ── Application Analysis Module ── */}
      <Route path="/analysis/dashboard">
        <PageGuard pageKey="analysis_dashboard"><DashboardLayout><AnalysisDashboard /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/analysis">
        <PageGuard pageKey="cases"><DashboardLayout><Cases /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/analysis/cases/:id">
        <PageGuard pageKey="cases"><DashboardLayout><CaseDetail /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/analysis/cases/:id/upload">
        <PageGuard pageKey="cases"><DashboardLayout><UploadWizard /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/analysis/cases/:id/report">
        <PageGuard pageKey="cases"><DashboardLayout><AnalysisReport /></DashboardLayout></PageGuard>
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
        <PageGuard pageKey="fin_dashboard"><DashboardLayout><FinancialDashboard /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/accounts">
        <PageGuard pageKey="fin_accounts"><DashboardLayout><FinAccounts /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/income">
        <PageGuard pageKey="fin_income"><DashboardLayout><FinIncome /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/expenses">
        <PageGuard pageKey="fin_expenses"><DashboardLayout><FinExpenses /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/transfers">
        <PageGuard pageKey="fin_transfers"><DashboardLayout><FinTransfers /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/reports">
        <PageGuard pageKey="fin_reports"><DashboardLayout><FinReports /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/employees">
        <PageGuard pageKey="fin_employees"><DashboardLayout><FinEmployees /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/categories">
        <PageGuard pageKey="fin_categories"><DashboardLayout><FinCategories /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/commissions">
        <PageGuard pageKey="fin_commissions"><DashboardLayout><FinCommissions /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/bulk-upload">
        <PageGuard pageKey="fin_bulk_upload"><DashboardLayout><FinBulkUpload /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/clients">
        <PageGuard pageKey="fin_clients"><DashboardLayout><FinClients /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/settlement">
        <PageGuard pageKey="fin_settlement"><DashboardLayout><FinSettlement /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/upcoming">
        <PageGuard pageKey="fin_upcoming"><DashboardLayout><UpcomingPayments /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/finance/salary-receipts">
        <PageGuard pageKey="fin_salary_receipts"><SalaryReceipts /></PageGuard>
      </Route>

      {/* ── Client Documentation Module ── */}
      <Route path="/docs/dashboard">
        <PageGuard pageKey="client_docs"><ClientDocsDashboard /></PageGuard>
      </Route>
      <Route path="/docs">
        <PageGuard pageKey="client_docs"><DashboardLayout><ClientDocs /></DashboardLayout></PageGuard>
      </Route>
      <Route path="/docs/clients/:id">
        <PageGuard pageKey="client_docs"><DashboardLayout><ClientDocDetail /></DashboardLayout></PageGuard>
      </Route>

      {/* ── Broadcast Center ── */}
      <Route path="/broadcast">
        <PageGuard pageKey="broadcast"><DashboardLayout><BroadcastCenter /></DashboardLayout></PageGuard>
      </Route>

      {/* ── Team Chat ── */}
      <Route path="/chat">
        <PageGuard pageKey="chat"><DashboardLayout><TeamChat /></DashboardLayout></PageGuard>
      </Route>

      {/* ── Settings ── */}

      {/* ── Settings (owner only) ── */}
      <Route path="/settings">
        <Settings />
      </Route>

      {/* ── Permissions Manager (owner only) ── */}
      <Route path="/admin/permissions">
        <DashboardLayout><PermissionsManager /></DashboardLayout>
      </Route>

      <Route path="/access-denied">
        <AccessDenied />
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
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

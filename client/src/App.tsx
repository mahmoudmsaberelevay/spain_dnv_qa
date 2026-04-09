import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

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

function Router() {
  return (
    <Switch>
      {/* Root redirect → Contracting Dashboard */}
      <Route path="/">
        <Redirect to="/contracting" />
      </Route>

      {/* ── Contracting Module ── */}
      <Route path="/contracting">
        <DashboardLayout>
          <ContractingDashboard />
        </DashboardLayout>
      </Route>
      <Route path="/contracting/contracts">
        <DashboardLayout>
          <Contracts />
        </DashboardLayout>
      </Route>
      <Route path="/contracting/invoices">
        <DashboardLayout>
          <Invoices />
        </DashboardLayout>
      </Route>
      <Route path="/contracting/analytics">
        <DashboardLayout>
          <Analytics />
        </DashboardLayout>
      </Route>

      {/* ── Application Analysis Module ── */}
      <Route path="/analysis/dashboard">
        <DashboardLayout>
          <AnalysisDashboard />
        </DashboardLayout>
      </Route>
      <Route path="/analysis">
        <DashboardLayout>
          <Cases />
        </DashboardLayout>
      </Route>
      <Route path="/analysis/cases/:id">
        <DashboardLayout>
          <CaseDetail />
        </DashboardLayout>
      </Route>
      <Route path="/analysis/cases/:id/upload">
        <DashboardLayout>
          <UploadWizard />
        </DashboardLayout>
      </Route>
      <Route path="/analysis/cases/:id/report">
        <DashboardLayout>
          <AnalysisReport />
        </DashboardLayout>
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
        <DashboardLayout>
          <FinancialDashboard />
        </DashboardLayout>
      </Route>
      <Route path="/finance/accounts">
        <DashboardLayout>
          <FinAccounts />
        </DashboardLayout>
      </Route>
      <Route path="/finance/income">
        <DashboardLayout>
          <FinIncome />
        </DashboardLayout>
      </Route>
      <Route path="/finance/expenses">
        <DashboardLayout>
          <FinExpenses />
        </DashboardLayout>
      </Route>
      <Route path="/finance/transfers">
        <DashboardLayout>
          <FinTransfers />
        </DashboardLayout>
      </Route>
      <Route path="/finance/reports">
        <DashboardLayout>
          <FinReports />
        </DashboardLayout>
      </Route>
      <Route path="/finance/employees">
        <DashboardLayout>
          <FinEmployees />
        </DashboardLayout>
      </Route>
      <Route path="/finance/categories">
        <DashboardLayout>
          <FinCategories />
        </DashboardLayout>
      </Route>
      <Route path="/finance/commissions">
        <DashboardLayout>
          <FinCommissions />
        </DashboardLayout>
      </Route>

      {/* ── Client Documentation Module ── */}
      <Route path="/docs/dashboard">
        <ClientDocsDashboard />
      </Route>
      <Route path="/docs">
        <DashboardLayout>
          <ClientDocs />
        </DashboardLayout>
      </Route>
      <Route path="/docs/clients/:id">
        <DashboardLayout>
          <ClientDocDetail />
        </DashboardLayout>
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

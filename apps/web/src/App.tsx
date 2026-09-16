import { PERMISSIONS } from '@car-stock/shared/constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastContainer, ToastProvider } from './components/toast';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider, useCompany } from './contexts/CompanyContext';
import { LoginPage } from './pages/auth/LoginPage';
import './index.css';

// Lazy loaded pages — reduces initial bundle ~40%
const DashboardPage = React.lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CustomersListPage = React.lazy(() => import('./pages/customers/CustomersListPage'));
const CustomerFormPage = React.lazy(() => import('./pages/customers/CustomerFormPage'));
const CustomerDetailPage = React.lazy(() => import('./pages/customers/CustomerDetailPage'));
const VehiclesListPage = React.lazy(() => import('./pages/vehicles/VehiclesListPage'));
const VehicleFormPage = React.lazy(() => import('./pages/vehicles/VehicleFormPage'));
const VehicleDetailPage = React.lazy(() => import('./pages/vehicles/VehicleDetailPage'));
const StockListPage = React.lazy(() => import('./pages/stock/StockListPage'));
const StockFormPage = React.lazy(() => import('./pages/stock/StockFormPage'));
const StockDetailPage = React.lazy(() => import('./pages/stock/StockDetailPage'));
const VehicleCardLayoutPage = React.lazy(() => import('./pages/stock/VehicleCardLayoutPage'));
const InterestListPage = React.lazy(() =>
  import('./pages/interest').then((m) => ({ default: m.InterestListPage }))
);
const InterestDetailPage = React.lazy(() =>
  import('./pages/interest').then((m) => ({ default: m.InterestDetailPage }))
);
const InterestEditPage = React.lazy(() =>
  import('./pages/interest').then((m) => ({ default: m.InterestEditPage }))
);
const SalesListPage = React.lazy(() => import('./pages/sales/SalesListPage'));
const SalesFormPage = React.lazy(() => import('./pages/sales/SalesFormPage'));
const SalesDetailPage = React.lazy(() => import('./pages/sales/SalesDetailPage'));
const QuotationListPage = React.lazy(() => import('./pages/quotations/QuotationListPage'));
const QuotationFormPage = React.lazy(() => import('./pages/quotations/QuotationFormPage'));
const QuotationDetailPage = React.lazy(() => import('./pages/quotations/QuotationDetailPage'));
const PaymentsListPage = React.lazy(() =>
  import('./pages/payments').then((m) => ({ default: m.PaymentsListPage }))
);
const PaymentFormPage = React.lazy(() =>
  import('./pages/payments').then((m) => ({ default: m.PaymentFormPage }))
);
const PaymentDetailPage = React.lazy(() =>
  import('./pages/payments').then((m) => ({ default: m.PaymentDetailPage }))
);
const PaymentEditPage = React.lazy(() =>
  import('./pages/payments').then((m) => ({ default: m.PaymentEditPage }))
);
const UsersListPage = React.lazy(() =>
  import('./pages/users').then((m) => ({ default: m.UsersListPage }))
);
const UserFormPage = React.lazy(() =>
  import('./pages/users').then((m) => ({ default: m.UserFormPage }))
);
const UserDetailPage = React.lazy(() =>
  import('./pages/users').then((m) => ({ default: m.UserDetailPage }))
);
const CampaignsListPage = React.lazy(() =>
  import('./pages/campaigns').then((m) => ({ default: m.CampaignsListPage }))
);
const CampaignFormPage = React.lazy(() =>
  import('./pages/campaigns').then((m) => ({ default: m.CampaignFormPage }))
);
const CampaignDetailPage = React.lazy(() =>
  import('./pages/campaigns').then((m) => ({ default: m.CampaignDetailPage }))
);
const CampaignAnalyticsPage = React.lazy(() =>
  import('./pages/campaigns').then((m) => ({ default: m.CampaignAnalyticsPage }))
);
const CampaignReportPage = React.lazy(() =>
  import('./pages/campaigns').then((m) => ({ default: m.CampaignReportPage }))
);
const ReportsPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.ReportsPage }))
);
const DailyPaymentReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.DailyPaymentReportPage }))
);
const StockReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.StockReportPage }))
);
const ProfitLossReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.ProfitLossReportPage }))
);
const SalesSummaryReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.SalesSummaryReportPage }))
);
const StockInterestReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.StockInterestReportPage }))
);
const PurchaseRequirementReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.PurchaseRequirementReportPage }))
);
const DailyStockSnapshotPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.DailyStockSnapshotPage }))
);
const MonthlyPurchasesReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.MonthlyPurchasesReportPage }))
);
const CampaignClaimReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.CampaignClaimReportPage }))
);
const BankInterestReportPage = React.lazy(() =>
  import('./pages/reports').then((m) => ({ default: m.BankInterestReportPage }))
);
const SettingsPage = React.lazy(() => import('./pages/settings/SettingsPage'));
const SystemPage = React.lazy(() => import('./pages/system/SystemPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const P = PERMISSIONS;

function TitleUpdater() {
  const { companyName } = useCompany();
  React.useEffect(() => {
    if (companyName) document.title = companyName;
  }, [companyName]);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CompanyProvider>
            <TitleUpdater />
            <BrowserRouter>
              <AuthProvider>
                <ToastContainer />
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center min-h-screen">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <DashboardPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/customers"
                      element={
                        <ProtectedRoute allowedRoles={P.CUSTOMER_VIEW}>
                          <CustomersListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/customers/new"
                      element={
                        <ProtectedRoute allowedRoles={P.CUSTOMER_UPDATE}>
                          <CustomerFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/customers/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.CUSTOMER_VIEW}>
                          <CustomerDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/customers/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.CUSTOMER_UPDATE}>
                          <CustomerFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/vehicles"
                      element={
                        <ProtectedRoute allowedRoles={P.VEHICLE_VIEW}>
                          <VehiclesListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/vehicles/new"
                      element={
                        <ProtectedRoute allowedRoles={P.VEHICLE_EDIT}>
                          <VehicleFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/vehicles/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.VEHICLE_VIEW}>
                          <VehicleDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/vehicles/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.VEHICLE_EDIT}>
                          <VehicleFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/stock"
                      element={
                        <ProtectedRoute allowedRoles={P.STOCK_VIEW}>
                          <StockListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/stock/new"
                      element={
                        <ProtectedRoute allowedRoles={P.STOCK_CREATE}>
                          <StockFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/stock/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.STOCK_VIEW}>
                          <StockDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/stock/:id/card-layout"
                      element={
                        <ProtectedRoute allowedRoles={P.DOC_CAR_DETAIL_CARD}>
                          <VehicleCardLayoutPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/stock/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.STOCK_UPDATE}>
                          <StockFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/interest"
                      element={
                        <ProtectedRoute allowedRoles={P.INTEREST_VIEW}>
                          <InterestListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/interest/:stockId"
                      element={
                        <ProtectedRoute allowedRoles={P.INTEREST_VIEW}>
                          <InterestDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/interest/:stockId/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.INTEREST_UPDATE}>
                          <InterestEditPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sales"
                      element={
                        <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                          <SalesListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sales/new"
                      element={
                        <ProtectedRoute allowedRoles={P.SALE_CREATE}>
                          <SalesFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sales/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                          <SalesDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sales/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.SALE_UPDATE}>
                          <SalesFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/quotations"
                      element={
                        <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                          <QuotationListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/quotations/new"
                      element={
                        <ProtectedRoute allowedRoles={P.QUOTATION_CREATE}>
                          <QuotationFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/quotations/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                          <QuotationDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/quotations/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.QUOTATION_UPDATE}>
                          <QuotationFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/payments"
                      element={
                        <ProtectedRoute allowedRoles={P.PAYMENT_VIEW}>
                          <PaymentsListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/payments/new"
                      element={
                        <ProtectedRoute allowedRoles={P.PAYMENT_CREATE}>
                          <PaymentFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/payments/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.PAYMENT_UPDATE}>
                          <PaymentEditPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/payments/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.PAYMENT_VIEW}>
                          <PaymentDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    {/* User Management Routes - Admin Only */}
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute allowedRoles={P.SETTINGS_VIEW}>
                          <SettingsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/system"
                      element={
                        <ProtectedRoute allowedRoles={P.SYSTEM_VIEW}>
                          <SystemPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/users"
                      element={
                        <ProtectedRoute allowedRoles={P.USER_VIEW}>
                          <UsersListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/users/new"
                      element={
                        <ProtectedRoute allowedRoles={P.USER_CREATE}>
                          <UserFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/users/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.USER_VIEW}>
                          <UserDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/users/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.USER_UPDATE}>
                          <UserFormPage />
                        </ProtectedRoute>
                      }
                    />
                    {/* Campaign Management Routes - Admin Only */}
                    <Route
                      path="/campaigns"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                          <CampaignsListPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/campaigns/new"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_CREATE}>
                          <CampaignFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/campaigns/:id"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                          <CampaignDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/campaigns/:id/edit"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_UPDATE}>
                          <CampaignFormPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/campaigns/:id/analytics"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                          <CampaignAnalyticsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/campaigns/:id/report"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                          <CampaignReportPage />
                        </ProtectedRoute>
                      }
                    />
                    {/* Report Routes */}
                    <Route
                      path="/reports"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORTS_INDEX}>
                          <ReportsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/daily-payments"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORT_FINANCE}>
                          <DailyPaymentReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/stock"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORT_STOCK}>
                          <StockReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/profit-loss"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORT_SALES}>
                          <ProfitLossReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/sales-summary"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORT_SALES}>
                          <SalesSummaryReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/stock-interest"
                      element={
                        <ProtectedRoute allowedRoles={P.INTEREST_VIEW}>
                          <StockInterestReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/purchase-requirement"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORT_STOCK}>
                          <PurchaseRequirementReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/daily-stock-snapshot"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORT_STOCK}>
                          <DailyStockSnapshotPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/monthly-purchases"
                      element={
                        <ProtectedRoute allowedRoles={P.REPORT_STOCK}>
                          <MonthlyPurchasesReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/campaign-claims"
                      element={
                        <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                          <CampaignClaimReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/reports/bank-interest"
                      element={
                        <ProtectedRoute allowedRoles={P.INTEREST_VIEW}>
                          <BankInterestReportPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Suspense>
              </AuthProvider>
            </BrowserRouter>
          </CompanyProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

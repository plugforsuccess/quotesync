// App.jsx
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { validateCacheVersion } from './utils/cacheVersion';

// Configure React Query with auth-aware error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Never retry auth failures — the token is dead, retrying just cascades errors
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

// Global auth error handler — sign out cleanly on 401/403 instead of freezing
queryClient.getQueryCache().config.onError = (error) => {
  if (error?.status === 401 || error?.status === 403) {
    console.warn('[QueryCache] Auth error detected, signing out:', error.status);
    supabase.auth.signOut();
  }
};

queryClient.getMutationCache().config.onError = (error) => {
  if (error?.status === 401 || error?.status === 403) {
    console.warn('[MutationCache] Auth error detected, signing out:', error.status);
    supabase.auth.signOut();
  }
};

// Public pages - loaded immediately
import InsuranceQuotesPage from './pages/InsuranceQuotesPage';
import ThankYouPage from './pages/ThankYouPage';
import DriversEdPage from './pages/DriversEdPage';
import StorePage from './pages/StorePage';
import ProductDetailPage from './pages/ProductDetailPage';
import PurchaseSuccessPage from './pages/PurchaseSuccessPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import NewsroomPage from './pages/NewsroomPage';
import StoryDetailPage from './pages/StoryDetailPage';
import LoginPage from './pages/LoginPage';

// Lead generation funnel — V2 single-question wizard
import SaveWizardPage from './pages/SaveWizardPage';
import SaveConfirmationPage from './pages/SaveConfirmationPage';

// Admin pages - lazy loaded for code splitting
const NewsroomDashboardPage = lazy(() => import('./pages/NewsroomDashboardPage'));
const NewsroomEditorPage = lazy(() => import('./pages/NewsroomEditorPage'));
const ArchivedStoriesPage = lazy(() => import('./pages/ArchivedStoriesPage'));
const StoryPreviewPage = lazy(() => import('./pages/StoryPreviewPage'));
const EditorialStandardsPage = lazy(() => import('./pages/EditorialStandardsPage'));

// Agency pages
import AgencyApplyPage from './pages/AgencyApplyPage';
const AdminAgenciesPage = lazy(() => import('./pages/AdminAgenciesPage'));
const AdminAgencyDetailPage = lazy(() => import('./pages/AdminAgencyDetailPage'));
const AdminAuditPage = lazy(() => import('./pages/AdminAuditPage'));
const AdminTimeAttendancePage = lazy(() => import('./pages/AdminTimeAttendancePage'));
const AgencyLeadsPage = lazy(() => import('./pages/AgencyLeadsPage'));
const AgencyLeadDetailPage = lazy(() => import('./pages/AgencyLeadDetailPage'));
const FunnelDashboardPage = lazy(() => import('./pages/FunnelDashboardPage'));
const AgencySettingsPage = lazy(() => import('./pages/AgencySettingsPage'));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

function App() {
  // Validate cache version on mount
  useEffect(() => {
    console.log('[App] Validating cache version...');
    const cacheInvalidated = validateCacheVersion();
    if (cacheInvalidated) {
      console.log('[App] Cache was invalidated due to version mismatch');
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ScrollToTop />
            <Routes>
          {/* Admin login page (no layout) - obscured path for security */}
          <Route path="/admin-access-8by2X" element={<LoginPage />} />

          {/* Use Layout to wrap all main pages with the nav/tabs */}
          <Route path="/" element={<Layout />}>
            {/* Default route – homepage = Insurance Quotes */}
            <Route index element={<InsuranceQuotesPage />} />
            <Route path="quotes" element={<InsuranceQuotesPage />} />

            {/* Drivers Ed tab */}
            <Route path="courses" element={<DriversEdPage />} />

            {/* Keep your old route working too if it's already linked */}
            <Route path="defensive-driving" element={<DriversEdPage />} />

            {/* Newsroom - Insurance News Feed */}
            <Route path="news" element={<NewsroomPage />} />
            <Route path="news/:slug" element={<StoryDetailPage />} />

            {/* Story Preview (Protected - Editor/Admin only) */}
            <Route
              path="news/preview/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <StoryPreviewPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Newsroom CMS - Editor & Admin (Protected & Lazy Loaded) */}
            <Route
              path="news/dashboard"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <NewsroomDashboardPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/editor"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <NewsroomEditorPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/editor/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <NewsroomEditorPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/archived"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Suspense fallback={<PageLoader />}>
                    <ArchivedStoriesPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/standards"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <EditorialStandardsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Online Store */}
            <Route path="store" element={<StorePage />} />
            <Route path="store/:slug" element={<ProductDetailPage />} />
            <Route path="store/purchase-success" element={<PurchaseSuccessPage />} />

            {/* Lead generation funnel — V2 single-question wizard */}
            <Route path="save" element={<SaveWizardPage />} />
            <Route path="save/details" element={<Navigate to="/save" replace />} />
            <Route path="save/confirmation" element={<SaveConfirmationPage />} />

            {/* Thank you page (after form / Canopy redirect) */}
            <Route path="success" element={<ThankYouPage />} />

            {/* Privacy Policy and Terms of Service */}
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="terms" element={<TermsPage />} />

            {/* Agency Partnership - Public Application */}
            <Route path="partners/apply" element={<AgencyApplyPage />} />

            {/* Agency Funnel Dashboard (Protected for agency users) */}
            <Route
              path="agency/dashboard"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <FunnelDashboardPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Agency Dashboard - Pipeline Management (Protected for agency users) */}
            <Route
              path="agency/leads"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <AgencyLeadsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="agency/leads/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <AgencyLeadDetailPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Agency Settings (agency principals only) */}
            <Route
              path="agency/settings"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <Suspense fallback={<PageLoader />}>
                    <AgencySettingsPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Admin - Agency Management */}
            <Route
              path="admin/agencies"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Suspense fallback={<PageLoader />}>
                    <AdminAgenciesPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/agencies/:id"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Suspense fallback={<PageLoader />}>
                    <AdminAgencyDetailPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Admin - Audit Log */}
            <Route
              path="admin/audit"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Suspense fallback={<PageLoader />}>
                    <AdminAuditPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Admin - Time & Attendance / CS Performance (platform_admin+) */}
            <Route
              path="admin/time-attendance"
              element={
                <ProtectedRoute requirePlatformUser requiredPlatformRole="platform_admin">
                  <Suspense fallback={<PageLoader />}>
                    <AdminTimeAttendancePage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Access denied pages */}
            <Route path="unauthorized" element={
              <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                  <div className="text-red-600 text-5xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
                  <p className="text-gray-600 mb-6">You don't have permission to access this page. Contact your administrator if you believe this is an error.</p>
                  <a href="/" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">Go Home</a>
                </div>
              </div>
            } />
            <Route path="no-agency" element={
              <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                  <div className="text-yellow-600 text-5xl mb-4">🏢</div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">No Agency Membership</h2>
                  <p className="text-gray-600 mb-6">You need an active agency membership to access this page. Apply for a partnership or contact support.</p>
                  <div className="flex flex-col gap-3">
                    <a href="/partners/apply" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">Apply for Partnership</a>
                    <a href="/" className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors">Go Home</a>
                  </div>
                </div>
              </div>
            } />

            {/* Catch-all – redirect bad URLs to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          </Routes>
          </AuthProvider>
          <Analytics />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

// App.jsx
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldOff, Home, Building2 as Building2Icon } from 'lucide-react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import PageError from './components/PageError';
import PageSpinner from './components/PageSpinner';
import { validateCacheVersion } from './utils/cacheVersion';
import { persistUtmParams } from './lib/leadsApi';

// Override React Query's focus detection to use visibilitychange instead of
// window focus events. visibilitychange fires reliably when the user returns
// to the browser from another app or window. The 1s delay lets Supabase
// complete its internal token refresh before queries fire, preventing 400s.
focusManager.setEventListener((handleFocus) => {
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      setTimeout(handleFocus, 1000);
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
});

// Configure React Query with auth-aware error handling
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: true,  // back to true — focusManager delay prevents the race
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

// Global auth error handler — verify session is truly dead before signing out.
// On tab focus, React Query refetches may race ahead of the Supabase token
// refresh, producing transient 401s. If the session is still valid after
// refresh, skip the sign-out — the next refetch will succeed with the new token.
//
// Debounced: if 5 queries all fail with 401 at once (e.g. on tab restore with
// an expired token), we fire only ONE getSession() check instead of 5.
// This prevents lock contention in the Supabase auth client.
let authCheckInFlight = false;
const handleAuthError = (source) => {
  if (authCheckInFlight) return;
  authCheckInFlight = true;
  // Wait briefly — token refresh may be in progress (lock held by Supabase internals).
  // Checking immediately can return null even when a valid session exists in storage
  // because the refresh hasn't completed yet.
  setTimeout(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session) {
        console.warn(`[${source}] Auth error confirmed — no valid session, signing out`);
        supabase.auth.signOut();
      } else {
        console.warn(`[${source}] Auth error was transient (token refreshed) — skipping sign-out`);
      }
    }).finally(() => {
      authCheckInFlight = false;
    });
  }, 500);
};

queryClient.getQueryCache().config.onError = (error) => {
  if (error?.status === 401 || error?.status === 403) {
    handleAuthError('QueryCache');
  }
};

queryClient.getMutationCache().config.onError = (error) => {
  if (error?.status === 401 || error?.status === 403) {
    handleAuthError('MutationCache');
  }
};

// Homepage — eager (landing page, always needed on first load)
import InsuranceQuotesPage from './pages/InsuranceQuotesPage';

// All other pages — lazy loaded for code splitting
const ThankYouPage = lazy(() => import('./pages/ThankYouPage'));
const DriversEdPage = lazy(() => import('./pages/DriversEdPage'));
const StorePage = lazy(() => import('./pages/StorePage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const PurchaseSuccessPage = lazy(() => import('./pages/PurchaseSuccessPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const NewsroomPage = lazy(() => import('./pages/NewsroomPage'));
const StoryDetailPage = lazy(() => import('./pages/StoryDetailPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PunchPage = lazy(() => import('./pages/PunchPage'));
const SaveWizardPage = lazy(() => import('./pages/SaveWizardPage'));
const SaveConfirmationPage = lazy(() => import('./pages/SaveConfirmationPage'));
const AgencyApplyPage = lazy(() => import('./pages/AgencyApplyPage'));

// Admin & agency pages — lazy loaded
const NewsroomDashboardPage = lazy(() => import('./pages/NewsroomDashboardPage'));
const NewsroomEditorPage = lazy(() => import('./pages/NewsroomEditorPage'));
const ArchivedStoriesPage = lazy(() => import('./pages/ArchivedStoriesPage'));
const StoryPreviewPage = lazy(() => import('./pages/StoryPreviewPage'));
const EditorialStandardsPage = lazy(() => import('./pages/EditorialStandardsPage'));
const AdminAgenciesPage = lazy(() => import('./pages/AdminAgenciesPage'));
const AdminAgencyDetailPage = lazy(() => import('./pages/AdminAgencyDetailPage'));
const AdminAuditPage = lazy(() => import('./pages/AdminAuditPage'));
const AdminTimeAttendancePage = lazy(() => import('./pages/AdminTimeAttendancePage'));
const CSPerformancePage = lazy(() => import('./pages/CSPerformancePage'));
const AgencyLeadsPage = lazy(() => import('./pages/AgencyLeadsPage'));
const AgencyLeadDetailPage = lazy(() => import('./pages/AgencyLeadDetailPage'));
const FunnelDashboardPage = lazy(() => import('./pages/FunnelDashboardPage'));
const AgencySettingsPage = lazy(() => import('./pages/AgencySettingsPage'));
const AgencySetupPage = lazy(() => import('./pages/AgencySetupPage'));
const AgencyTeamPage = lazy(() => import('./pages/AgencyTeamPage'));
const EmployeeRosterPage = lazy(() => import('./pages/EmployeeRosterPage'));
const RevenueProjectionsDashboard = lazy(() => import('./pages/components/revenue/RevenueProjectionsDashboard'));
const BookHealthPage = lazy(() => import('./pages/BookHealthPage'));
const ProducerCompModelPage = lazy(() => import('./pages/ProducerCompModelPage'));

// Loading fallback component
const PageLoader = () => <PageSpinner />;

function App() {
  // Validate cache version on mount + persist UTM params
  useEffect(() => {
    console.log('[App] Validating cache version...');
    const cacheInvalidated = validateCacheVersion();
    if (cacheInvalidated) {
      console.log('[App] Cache was invalidated due to version mismatch');
    }
    persistUtmParams();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <ScrollToTop />
            <Routes>
          {/* Admin login page (no layout) - obscured path for security */}
          <Route path="/admin-access-8by2X" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />

          {/* Employee punch clock — public, no auth required */}
          <Route path="/punch" element={<Suspense fallback={<PageLoader />}><PunchPage /></Suspense>} />

          {/* Use Layout to wrap all main pages with the nav/tabs */}
          <Route path="/" element={<Layout />}>
            {/* Default route – homepage = Insurance Quotes */}
            <Route index element={<InsuranceQuotesPage />} />
            <Route path="quotes" element={<InsuranceQuotesPage />} />

            {/* Drivers Ed tab */}
            <Route path="courses" element={<Suspense fallback={<PageLoader />}><DriversEdPage /></Suspense>} />

            {/* Keep your old route working too if it's already linked */}
            <Route path="defensive-driving" element={<Suspense fallback={<PageLoader />}><DriversEdPage /></Suspense>} />

            {/* Newsroom - Insurance News Feed */}
            <Route path="news" element={<Suspense fallback={<PageLoader />}><NewsroomPage /></Suspense>} />
            <Route path="news/:slug" element={<Suspense fallback={<PageLoader />}><StoryDetailPage /></Suspense>} />

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
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <NewsroomEditorPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/editor/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <NewsroomEditorPage />
                    </Suspense>
                  </ErrorBoundary>
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
            <Route path="store" element={<Suspense fallback={<PageLoader />}><StorePage /></Suspense>} />
            <Route path="store/:slug" element={<Suspense fallback={<PageLoader />}><ProductDetailPage /></Suspense>} />
            <Route path="store/purchase-success" element={<Suspense fallback={<PageLoader />}><PurchaseSuccessPage /></Suspense>} />

            {/* Lead generation funnel — V2 single-question wizard */}
            <Route path="save" element={<Suspense fallback={<PageLoader />}><SaveWizardPage /></Suspense>} />
            <Route path="save/details" element={<Navigate to="/save" replace />} />
            <Route path="save/confirmation" element={<Suspense fallback={<PageLoader />}><SaveConfirmationPage /></Suspense>} />

            {/* Thank you page (after form / Canopy redirect) */}
            <Route path="success" element={<Suspense fallback={<PageLoader />}><ThankYouPage /></Suspense>} />

            {/* Privacy Policy and Terms of Service */}
            <Route path="privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPage /></Suspense>} />
            <Route path="terms" element={<Suspense fallback={<PageLoader />}><TermsPage /></Suspense>} />

            {/* Agency Partnership - Public Application */}
            <Route path="partners/apply" element={<Suspense fallback={<PageLoader />}><AgencyApplyPage /></Suspense>} />

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

            {/* Agency Setup / Onboarding (agent only) */}
            <Route
              path="agency/setup"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <Suspense fallback={<PageLoader />}>
                    <AgencySetupPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Agency Team Management (agent only) */}
            <Route
              path="agency/team"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <Suspense fallback={<PageLoader />}>
                    <AgencyTeamPage />
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

            {/* Admin - Employee Roster */}
            <Route
              path="admin/agency/employees"
              element={
                <ProtectedRoute requirePlatformUser requiredPlatformRole="platform_admin">
                  <Suspense fallback={<PageLoader />}>
                    <EmployeeRosterPage />
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

            {/* Admin - Time & Attendance (platform_admin+) */}
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

            {/* Admin - CS Performance Dashboard (platform_admin+) */}
            <Route
              path="admin/cs-performance"
              element={
                <ProtectedRoute requirePlatformUser requiredPlatformRole="platform_admin">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <CSPerformancePage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Admin - Revenue Projections Dashboard (platform_admin+) */}
            <Route
              path="admin/revenue-projections"
              element={
                <ProtectedRoute requirePlatformUser requiredPlatformRole="platform_admin">
                  <Suspense fallback={<PageLoader />}>
                    <RevenueProjectionsDashboard />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Admin - Producer Compensation Model (agency principals) */}
            <Route
              path="admin/producers/:employeeId/comp-model"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <Suspense fallback={<PageLoader />}>
                    <ProducerCompModelPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Admin - Book Health Dashboard (platform_admin+) */}
            <Route
              path="admin/book-health"
              element={
                <ProtectedRoute requirePlatformUser requiredPlatformRole="platform_admin">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <BookHealthPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Access denied pages */}
            <Route path="unauthorized" element={
              <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
                    <ShieldOff className="w-8 h-8 text-red-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">Access Denied</h2>
                  <p className="text-gray-500 mb-8">
                    You don't have permission to view this page. Contact your administrator if you believe this is an error.
                  </p>
                  <a href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors">
                    <Home className="w-4 h-4" />
                    Go Home
                  </a>
                </div>
              </div>
            } />
            <Route path="no-agency" element={
              <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-6">
                    <Building2Icon className="w-8 h-8 text-amber-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">No Agency Access</h2>
                  <p className="text-gray-500 mb-8">
                    You need an active agency membership to access this page. Apply for a partnership or contact support.
                  </p>
                  <div className="flex flex-col gap-3">
                    <a href="/partners/apply" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors">Apply for Partnership</a>
                    <a href="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors">
                      <Home className="w-4 h-4" />
                      Go Home
                    </a>
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
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

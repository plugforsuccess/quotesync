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

// Retry wrapper for lazy imports — handles chunk load failures after deploys.
// On first chunk error: reload the page (new assets will be fetched).
// On second failure (already reloaded): let ErrorBoundary handle it.
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      const isChunkError =
        err?.message?.includes('Failed to fetch dynamically imported module') ||
        err?.message?.includes('Importing a module script failed') ||
        err?.name === 'ChunkLoadError';

      if (isChunkError) {
        const reloadKey = 'qs_chunk_error_reloaded';
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1');
          window.location.reload();
          // Return a never-resolving promise — reload is in progress
          return new Promise(() => {});
        }
      }
      throw err; // not a chunk error, or already reloaded — let ErrorBoundary handle it
    })
  );
}

// All other pages — lazy loaded for code splitting
const ThankYouPage = lazyWithRetry(() => import('./pages/ThankYouPage'));
const DriversEdPage = lazyWithRetry(() => import('./pages/DriversEdPage'));
const StorePage = lazyWithRetry(() => import('./pages/StorePage'));
const ProductDetailPage = lazyWithRetry(() => import('./pages/ProductDetailPage'));
const PurchaseSuccessPage = lazyWithRetry(() => import('./pages/PurchaseSuccessPage'));
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'));
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'));
const NewsroomPage = lazyWithRetry(() => import('./pages/NewsroomPage'));
const StoryDetailPage = lazyWithRetry(() => import('./pages/StoryDetailPage'));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const PunchPage = lazyWithRetry(() => import('./pages/PunchPage'));
const SaveWizardPage = lazyWithRetry(() => import('./pages/SaveWizardPage'));
const SaveConfirmationPage = lazyWithRetry(() => import('./pages/SaveConfirmationPage'));
const AgencyApplyPage = lazyWithRetry(() => import('./pages/AgencyApplyPage'));

// Admin & agency pages — lazy loaded
const NewsroomDashboardPage = lazyWithRetry(() => import('./pages/NewsroomDashboardPage'));
const NewsroomEditorPage = lazyWithRetry(() => import('./pages/NewsroomEditorPage'));
const ArchivedStoriesPage = lazyWithRetry(() => import('./pages/ArchivedStoriesPage'));
const StoryPreviewPage = lazyWithRetry(() => import('./pages/StoryPreviewPage'));
const EditorialStandardsPage = lazyWithRetry(() => import('./pages/EditorialStandardsPage'));
const AdminAgenciesPage = lazyWithRetry(() => import('./pages/AdminAgenciesPage'));
const AdminAgencyDetailPage = lazyWithRetry(() => import('./pages/AdminAgencyDetailPage'));
const AdminAuditPage = lazyWithRetry(() => import('./pages/AdminAuditPage'));
const AdminTimeAttendancePage = lazyWithRetry(() => import('./pages/AdminTimeAttendancePage'));
const CSPerformancePage = lazyWithRetry(() => import('./pages/CSPerformancePage'));
const AgencyLeadsPage = lazyWithRetry(() => import('./pages/AgencyLeadsPage'));
const AgencyLeadDetailPage = lazyWithRetry(() => import('./pages/AgencyLeadDetailPage'));
const FunnelDashboardPage = lazyWithRetry(() => import('./pages/FunnelDashboardPage'));
const AgencySettingsPage = lazyWithRetry(() => import('./pages/AgencySettingsPage'));
const AgencySetupPage = lazyWithRetry(() => import('./pages/AgencySetupPage'));
const AgencyTeamPage = lazyWithRetry(() => import('./pages/AgencyTeamPage'));
const EmployeeRosterPage = lazyWithRetry(() => import('./pages/EmployeeRosterPage'));
const RevenueProjectionsDashboard = lazyWithRetry(() => import('./pages/components/revenue/RevenueProjectionsDashboard'));
const BookHealthPage = lazyWithRetry(() => import('./pages/BookHealthPage'));
const ProducerCompModelPage = lazyWithRetry(() => import('./pages/ProducerCompModelPage'));

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
    // Clear chunk-error reload flag on successful load — prevents infinite reload loops
    sessionStorage.removeItem('qs_chunk_error_reloaded');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <ScrollToTop />
            <Routes>
          {/* Admin login page (no layout) - obscured path for security */}
          <Route path="/admin-access-8by2X" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><LoginPage /></Suspense></ErrorBoundary>} />

          {/* Employee punch clock — public, no auth required */}
          <Route path="/punch" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><PunchPage /></Suspense></ErrorBoundary>} />

          {/* Use Layout to wrap all main pages with the nav/tabs */}
          <Route path="/" element={<Layout />}>
            {/* Default route – homepage = Insurance Quotes */}
            <Route index element={<InsuranceQuotesPage />} />
            <Route path="quotes" element={<InsuranceQuotesPage />} />

            {/* Drivers Ed tab */}
            <Route path="courses" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><DriversEdPage /></Suspense></ErrorBoundary>} />

            {/* Keep your old route working too if it's already linked */}
            <Route path="defensive-driving" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><DriversEdPage /></Suspense></ErrorBoundary>} />

            {/* Newsroom - Insurance News Feed */}
            <Route path="news" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><NewsroomPage /></Suspense></ErrorBoundary>} />
            <Route path="news/:slug" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><StoryDetailPage /></Suspense></ErrorBoundary>} />

            {/* Story Preview (Protected - Editor/Admin only) */}
            <Route
              path="news/preview/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <StoryPreviewPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Newsroom CMS - Editor & Admin (Protected & Lazy Loaded) */}
            <Route
              path="news/dashboard"
              element={
                <ProtectedRoute requiredRole="editor">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <NewsroomDashboardPage />
                    </Suspense>
                  </ErrorBoundary>
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
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <ArchivedStoriesPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/standards"
              element={
                <ProtectedRoute requiredRole="editor">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <EditorialStandardsPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Online Store */}
            <Route path="store" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><StorePage /></Suspense></ErrorBoundary>} />
            <Route path="store/:slug" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><ProductDetailPage /></Suspense></ErrorBoundary>} />
            <Route path="store/purchase-success" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><PurchaseSuccessPage /></Suspense></ErrorBoundary>} />

            {/* Lead generation funnel — V2 single-question wizard */}
            <Route path="save" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><SaveWizardPage /></Suspense></ErrorBoundary>} />
            <Route path="save/details" element={<Navigate to="/save" replace />} />
            <Route path="save/confirmation" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><SaveConfirmationPage /></Suspense></ErrorBoundary>} />

            {/* Thank you page (after form / Canopy redirect) */}
            <Route path="success" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><ThankYouPage /></Suspense></ErrorBoundary>} />

            {/* Privacy Policy and Terms of Service */}
            <Route path="privacy" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><PrivacyPage /></Suspense></ErrorBoundary>} />
            <Route path="terms" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><TermsPage /></Suspense></ErrorBoundary>} />

            {/* Agency Partnership - Public Application */}
            <Route path="partners/apply" element={<ErrorBoundary fallback={<PageError />}><Suspense fallback={<PageLoader />}><AgencyApplyPage /></Suspense></ErrorBoundary>} />

            {/* Agency Funnel Dashboard (Protected for agency users) */}
            <Route
              path="agency/dashboard"
              element={
                <ProtectedRoute requiredRole="editor">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <FunnelDashboardPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Agency Dashboard - Pipeline Management (Protected for agency users) */}
            <Route
              path="agency/leads"
              element={
                <ProtectedRoute requiredRole="editor">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AgencyLeadsPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="agency/leads/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AgencyLeadDetailPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Agency Settings (agency principals only) */}
            <Route
              path="agency/settings"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AgencySettingsPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Agency Setup / Onboarding (agent only) */}
            <Route
              path="agency/setup"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AgencySetupPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Agency Team Management (agent only) */}
            <Route
              path="agency/team"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AgencyTeamPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Admin - Agency Management */}
            <Route
              path="admin/agencies"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AdminAgenciesPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/agencies/:id"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AdminAgencyDetailPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Admin - Employee Roster */}
            <Route
              path="admin/agency/employees"
              element={
                <ProtectedRoute requirePlatformUser requiredPlatformRole="platform_admin">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <EmployeeRosterPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Admin - Audit Log */}
            <Route
              path="admin/audit"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AdminAuditPage />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Admin - Time & Attendance (platform_admin+) */}
            <Route
              path="admin/time-attendance"
              element={
                <ProtectedRoute requirePlatformUser requiredPlatformRole="platform_admin">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <AdminTimeAttendancePage />
                    </Suspense>
                  </ErrorBoundary>
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
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <RevenueProjectionsDashboard />
                    </Suspense>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Admin - Producer Compensation Model (agency principals) */}
            <Route
              path="admin/producers/:employeeId/comp-model"
              element={
                <ProtectedRoute requiredRole="editor" requiredAgencyRole="agent">
                  <ErrorBoundary fallback={<PageError />}>
                    <Suspense fallback={<PageLoader />}>
                      <ProducerCompModelPage />
                    </Suspense>
                  </ErrorBoundary>
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
